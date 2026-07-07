# Dossier Technique — Urban Flow Mobility

**Projet académique T6 — CDSD Septembre 2026**  
**Date de rédaction :** 6 juillet 2026  
**Version :** 1.0 (post-fusion `feat/gtfs-postgres`)  
**Dépôt :** https://github.com/fwBoa/Urbanflow

---

## 1. Contexte et objectifs

Urban Flow Mobility est une plateforme web de mobilité multimodale pour Paris et l’Île-de-France. Elle permet :

- la recherche d’itinéraires multimodaux (transports en commun, Vélib’, marche, vélo) ;
- l’affichage temps réel des alertes trafic ;
- la gestion de favoris et d’un historique de trajets ;
- l’envoi de notifications push événementielles (alertes lignes favorites, perturbations) ;
- une PWA offline avec Service Worker.

Le projet s’appuie sur les Open Data de PRIM (Île-de-France Mobilités), Open Data Paris, OSRM et les standards GTFS/GTFS-RT.

---

## 2. Stack technique

| Couche | Technologie |
| --- | --- |
| Frontend | Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS v4 + Leaflet |
| Backend | NestJS 11 + TypeScript 5.7 + TypeORM 0.3 |
| Base de données | PostgreSQL 16 (données métier + 10 tables GTFS) |
| Routing transport | Navitia PRIM v2 (primaire) + GTFS RAPTOR PostgreSQL (repli silencieux) |
| Routing piéton/vélo | OSRM (Project-OSRM) |
| Temps réel | GTFS-RT toutes les 5 min via cron NestJS |
| Authentification | Passport JWT, bcrypt, cookies httpOnly, RBAC |
| Notifications push | `web-push` (VAPID) + `@nestjs/event-emitter` |
| Conteneurisation | Docker Compose (postgres, backend, frontend, nginx) |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`) |

---

## 3. Architecture backend

### 3.1 Modules NestJS

| Module | Responsabilité principale |
| --- | --- |
| `AppModule` | Configuration globale (rate limiting, event emitter, TypeORM) |
| `AuthModule` | Inscription, login JWT, profil, export RGPD, consentements |
| `FavoritesModule` | Favoris et historique de trajets |
| `NotificationsModule` | Notifications in-app, abonnements push, envoi push |
| `TransportModule` | Itinéraires, temps réel, géocodage, arrêts, lignes |
| `AdminModule` | Broadcast, dashboard, rechargement GTFS (rôle `admin`) |

### 3.2 Flux d’un itinéraire (`GET /api/transport/journey`)

1. Le contrôleur demande d’abord à `NavitiaService.isAvailable()`.
2. Si Navitia PRIM v2 est disponible, le routing, les alertes et la géométrie embarquée sont retournés.
3. Sinon (401, quota, réseau, pas de clé API), le système bascule en **repli silencieux** sur le moteur RAPTOR maison (`JourneyService`) alimenté par les tables GTFS en PostgreSQL.

### 3.3 Flux des notifications push (Phase 4)

```
GTFS-RT cron ──► GtfsRtService ──► EventEmitter ──► NotificationsEventsListener
                                          │
                                          ├──► crée Notification en DB (dedup 24h)
                                          └──► PushService.sendNotification() async
```

- Les alertes GTFS-RT nouvellement détectées émettent `alerts.updated`.
- Le listener crée une notification in-app pour chaque utilisateur ayant activé les notifications et dont une ligne favorite est affectée.
- L’envoi Web Push est asynchrone et isolé ; un échec push ne bloque pas la persistence in-app.

### 3.4 Modèle de données TypeORM

| Entité | Usage |
| --- | --- |
| `User` | compte, rôle, consentements RGPD |
| `Favorite` | lignes/arrêts favoris |
| `History` | historique des trajets calculés |
| `Notification` | notifications in-app + `externalAlertId` pour déduplication |
| `PushSubscription` | abonnements Web Push VAPID |

### 3.5 Tables GTFS (PostgreSQL)

`gtfs_agencies`, `gtfs_routes`, `gtfs_stops`, `gtfs_trips`, `gtfs_stop_times`, `gtfs_calendar`, `gtfs_calendar_dates`, `gtfs_transfers`, `gtfs_stop_modes`, `gtfs_stop_lines`, plus `gtfs_load_meta` pour le swap atomique zero-downtime.

---

## 4. Sécurité et conformité

- **Authentification** : JWT signé, stocké en cookie httpOnly, expiration 2h.
- **RBAC** : garde `RolesGuard` sur les endpoints admin (`@Roles('admin')`).
- **Rate limiting** : 100 req/min globalement via `ThrottlerModule`.
- **RGPD** : consentements `consentGeoloc`, `consentCookies`, `consentHistory`, export des données personnelles (`/api/auth/me/export`), suppression douce du compte.
- **Helmet** : headers de sécurité HTTP en production.
- **OWASP** : secrets externalisés, jamais de `synchronize: true` en prod, mots de passe hashés avec bcrypt.

---

## 5. Qualité et tests

### 5.1 Résultats actuels (6 juillet 2026)

| Catégorie | Résultat |
| --- | --- |
| Lint backend | 0 erreur / 0 warning (ESLint 9 flat config, type-checked) |
| Lint frontend | 0 erreur / 0 warning |
| Tests unitaires backend | **186 pass** / 186 |
| Tests e2e backend | **33 pass** / 33 sur PostgreSQL réelle |
| Tests frontend | **8 pass** / 8 |
| Couverture backend (lines) | **51,1 %** |
| Build backend | ✅ |
| Build frontend production | ✅ |

### 5.2 Stratégie de test

- **Unitaires** : chaque service/controller testé avec `Test.createTestingModule`, mocks des repositories et services externes.
- **E2E** : montage du vrai `AppModule` sur une base PostgreSQL locale avec tous les services réseau mockés (PRIM, OSRM, Navitia, GTFS-RT, parser).
- **Lint bloquant** : `npx eslint ... --max-warnings 0` en CI.

### 5.3 Couverture par domaine

Les modules métier critiques (`auth`, `favorites`, `notifications`, `admin`) sont couverts à plus de 80 %. Le module `transport` est plus faible car il inclut le parser GTFS et les intégrations externes qui nécessitent des fixtures volumineuses.

---

## 6. Intégration continue

Le workflow `.github/workflows/ci.yml` s’exécute sur chaque push et pull request vers `main` :

1. **Backend** : `npm ci` → `build` → lint bloquant → tests unitaires avec couverture → upload de l’artefact `backend-coverage`.
2. **Backend e2e** : conteneur PostgreSQL 16 dans le runner, `npm run test:e2e -- --runInBand`.
3. **Frontend** : `npm ci` → lint bloquant → tests → build production.

---

## 7. Déploiement et opérations

### 7.1 Docker Compose

- `postgres` : PostgreSQL 16, 2 Go `shared_buffers`, init via `docker/init-db.sql`.
- `backend` : image NestJS, `NODE_OPTIONS=--max-old-space-size=1024`.
- `frontend` : image Next.js, URLs relatives `/api` en prod.
- `nginx` : reverse proxy SSL/CSP/rate-limit (profil `production`).
- `nginx-dev` : HTTPS local avec certificat auto-signé.

### 7.2 Back-office administrateur

Le module `AdminModule` expose un back-office applicatif sécurisé par JWT et rôle `admin`. Il ne donne **pas** accès au serveur (pas d’SSH ni de Docker), mais permet de gérer l’application sans intervention technique.

| Endpoint | Méthode | Action |
| --- | --- | --- |
| `/api/admin/dashboard` | GET | Statistiques (utilisateurs, trajets, notifications) |
| `/api/admin/users` | GET | Liste des utilisateurs |
| `/api/admin/trips` | GET | Historique des trajets |
| `/api/admin/notifications` | GET / POST | Liste ou envoi d’une notification globale |
| `/api/admin/gtfs/reload` | POST | Rechargement manuel du GTFS statique |
| `/api/admin/gtfs/status` | GET | État du chargement GTFS |

La page frontend `/admin` est accessible uniquement aux utilisateurs connectés avec `role = 'admin'`.

#### Création du premier administrateur

En local :

```bash
cd apps/backend
DATABASE_URL=postgresql://urbanflow:urbanflow_dev@localhost:5432/urbanflow npx ts-node src/scripts/seed-admin.ts
```

En production (si `ts-node` n’est pas dans l’image) :

```bash
# Insérer directement un utilisateur avec role='admin' via psql
PGPASSWORD=$POSTGRES_PASSWORD docker exec -i urbanflow-db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "UPDATE users SET role='admin' WHERE email='admin@urbanflow.app';"
```

> **Par défaut le script crée** `admin@urbanflow.app` / `admin123`. Ce mot de passe doit être changé immédiatement en production.

### 7.3 Scripts utilitaires

| Script | Usage |
| --- | --- |
| `scripts/backup-db.sh` | Dump PostgreSQL compressé depuis le conteneur `urbanflow-db` |
| `scripts/restore-db.sh` | Restauration d’un dump `.sql` ou `.sql.gz` |
| `scripts/update-coverage-badge.mjs` | Génération du badge SVG de couverture |
| `scripts/deploy.sh` | Déploiement automatisé (staging/prod) |
| `scripts/download-gtfs.sh` | Téléchargement manuel du GTFS statique |
| `scripts/seed-admin.ts` | Création du compte administrateur initial |
| `docs/prod-verification.md` | Checklist de vérification avant mise en production |

### 7.4 Déploiement sur un VPS Hostinger (Ubuntu 24.04)

#### Prérequis

- VPS Hostinger avec Ubuntu 24.04 LTS.
- Accès SSH root ou sudo.
- Docker Engine ≥ 25 et Docker Compose ≥ 2.20 installés.
- Noms de domaine pointant vers le VPS (ex. `urbanflow.app` et `www.urbanflow.app`).
- Ports 22, 80 et 443 ouverts dans le pare-feu Hostinger.

#### Étapes

1. **Cloner le dépôt**

   ```bash
   git clone https://github.com/fwBoa/Urbanflow.git
   cd Urbanflow
   ```

2. **Créer l’environnement de production**

   ```bash
   cp docker/.env.production.example docker/.env
   # Éditer docker/.env avec nano/vim et remplir les secrets réels.
   ```

   Variables critiques à renseigner :
   - `JWT_SECRET` : chaîne aléatoire de 64+ caractères.
   - `PRIM_API_KEY` : clé PRIM Île-de-France Mobilités valide.
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` : paire générée avec `npx web-push generate-vapid-keys`.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` : identique à `VAPID_PUBLIC_KEY`.
   - `DATABASE_URL` : `postgresql://urbanflow:<password>@postgres:5432/urbanflow`.

3. **Obtenir des certificats TLS (Let’s Encrypt)**

   ```bash
   sudo apt update && sudo apt install certbot
   sudo certbot certonly --standalone -d urbanflow.app -d www.urbanflow.app
   sudo cp /etc/letsencrypt/live/urbanflow.app/fullchain.pem docker/certs/fullchain.pem
   sudo cp /etc/letsencrypt/live/urbanflow.app/privkey.pem docker/certs/privkey.pem
   ```

4. **Déployer**

   ```bash
   ./scripts/deploy.sh prod
   ```

   Le script vérifie :
   - la présence de `docker/.env` ;
   - que `JWT_SECRET` n’est pas la valeur par défaut ;
   - la présence des certificats TLS.

5. **Vérifier le déploiement**

   ```bash
   curl https://urbanflow.app/api/health
   # attendu : {"status":"ok"}
   ```

6. **Créer le premier administrateur**

   ```bash
   docker exec -it urbanflow-api npx ts-node dist/scripts/seed-admin.js
   # ou, si le conteneur n’a pas ts-node en prod, utiliser psql pour promouvoir un utilisateur existant.
   # Voir section 7.2 Back-office administrateur.
   ```

#### Renouvellement Let’s Encrypt

Ajouter une tâche cron pour renouveler puis copier les certificats, puis recharger Nginx :

```bash
0 3 * * * certbot renew --quiet --deploy-hook 'cp /etc/letsencrypt/live/urbanflow.app/fullchain.pem /home/ubuntu/Urbanflow/docker/certs/fullchain.pem && cp /etc/letsencrypt/live/urbanflow.app/privkey.pem /home/ubuntu/Urbanflow/docker/certs/privkey.pem && cd /home/ubuntu/Urbanflow/docker && docker compose exec nginx nginx -s reload'
```

---

## 8. Limites connues et pistes d’amélioration

### 8.1 Limites actuelles

1. **Géocodage strictement parisien** : le filtre `postcode.startsWith('75')` empêche un point de départ en banlieue, alors que le GTFS IDFM couvre toute l’Île-de-France.
2. **Couverture de tests** : 51 % de couverture globale ; le parser GTFS et les services externes restent peu testés.
3. **Fallback RAPTOR** : le repli silencieux sur GTFS est fiable mais n’intègre pas encore les alertes temps réel locales ; il est moins riche que Navitia.
4. **Web Push** : les notifications sont envoyées via FCM/APNS externes ; la fiabilité dépend de la connectivité du navigateur et de l’abonné.
5. **Mise à l’échelle** : le cron GTFS-RT et le rechargement GTFS statique s’exécutent sur un seul worker ; un déploiement multi-instance nécessiterait un verrou distribué.
6. **Données temps réel** : les prochains passages Vélib’ et trottinettes ne sont pas intégrés dans le calcul d’itinéraire.

### 8.2 Pistes d’amélioration

- Étendre le géocodage à l’Île-de-France ou permettre une restriction configurable.
- Ajouter des fixtures GTFS allégées pour augmenter la couverture de `transport`.
- Implémenter des migrations TypeORM et supprimer `synchronize` même en développement.
- Migrer les cron GTFS/GTFS-RT vers une file d’attente distribuée (BullMQ/Redis) pour du multi-instance.
- Ajouter un cache Redis pour les résultats de journey et de géocodage.
- Instrumenter l’application avec OpenTelemetry pour le tracing production.

---

## 9. Références

- README principal : [`README.md`](README.md)
- README backend : [`apps/backend/README.md`](apps/backend/README.md)
- Checklist production : [`docs/prod-verification.md`](docs/prod-verification.md)
- CI : [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Plan d’exécution : [`PLAN.md`](PLAN.md)
