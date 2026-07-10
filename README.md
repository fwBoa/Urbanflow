# Urban Flow Mobility

Plateforme intelligente de mobilité multimodale pour Paris et son agglomération.

> **État au 2026-07-10** : backend = NestJS 11 + PostgreSQL 16 + **Navitia PRIM v2 (primaire) + GTFS RAPTOR (repli silencieux)** ; frontend = Next.js 16 + Tailwind v4 + Leaflet. Navigation GPS immersive (turn-by-turn, reroutage, rotation au cap), PWA offline + Web Push VAPID, CI/CD auto-déploiement OVHcloud.
>
> [![CI](https://github.com/fwBoa/Urbanflow/actions/workflows/ci.yml/badge.svg)](https://github.com/fwBoa/Urbanflow/actions/workflows/ci.yml)
> [![Deploy](https://github.com/fwBoa/Urbanflow/actions/workflows/deploy.yml/badge.svg)](https://github.com/fwBoa/Urbanflow/actions/workflows/deploy.yml)
> ![Coverage backend](badge/coverage-backend.svg)

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS v4 + Leaflet |
| Backend | NestJS 11 + TypeScript 5.7 |
| Routing | **Navitia PRIM v2** (primaire — itinéraires + alertes + géométrie embarquée) + **GTFS RAPTOR PostgreSQL** (repli silencieux) |
| Base de données | PostgreSQL 16 (10 tables `gtfs_*` + 4 entités TypeORM : User, Favorite, History, Notification) |
| Cartographie | Leaflet + OpenStreetMap |
| Données transport | PRIM IDFM (référentiels + Navitia v2) + Open Data Paris (Vélib') + OSRM (routing piéton/vélo) |
| Données GTFS statiques | PostgreSQL via `gtfs-db.service.ts` (pool `pg` + `pg-copy-streams` + `pg_prewarm` + cache trip LRU 20k) |
| Auth | Passport JWT (httpOnly cookies) + bcrypt + RBAC + RGPD (consentGeoloc/Cookies/History + soft delete) |
| PWA | manifest.json + Service Worker enrichi (offline `/offline`, push VAPID, update banner) |
| Notifications | Web Push VAPID (`web-push`) + notifications in-app event-driven |
| DevOps | Docker Compose (4 services) + Nginx + GitHub Actions (`ci.yml` + `deploy.yml` avec approval gate) + VPS OVHcloud |

## Structure du projet

```
urbanflow/
├── apps/
│   ├── frontend/          # Next.js 16 (port 3001)
│   │   └── src/
│   │       ├── app/                          # Pages (App Router)
│   │       │   ├── page.tsx                  # Accueil / landing
│   │       │   ├── search/page.tsx           # Recherche itinéraire
│   │       │   ├── trip/[id]/page.tsx        # Détail itinéraire + navigation GPS immersive (plein écran, turn-by-turn)
│   │       │   ├── favorites/page.tsx
│   │       │   ├── profile/page.tsx          # RGPD + notifications push VAPID
│   │       │   ├── admin/page.tsx
│   │       │   ├── offline/page.tsx          # ⭐ page fallback hors ligne (servie par le SW)
│   │       │   └── legal/page.tsx            # Mentions légales
│   │       ├── components/                   # 20+ composants
│   │       │   ├── NavBar, Header, MapComponent, SearchBar, FilterChip,
│   │       │   │   TripCard, VelibStationCard, NotificationBell, ConsentBanner,
│   │       │   │   PwaInstallBanner, ModeBadge, journey-helpers, AppShell, CO2Badge
│   │       │   ├── SearchAutocomplete.tsx    # ⭐ fusion arrêts + adresses (AbortController)
│   │       │   ├── NearbyStopDrawer.tsx      # ⭐ drawer prochains départs
│   │       │   ├── Switch.tsx                # ⭐ toggle UI accessible
│   │       │   ├── TurnByTurnBanner.tsx      # ⭐ banner directionnel (gauche/droite/straight/board/alight/arrive)
│   │       │   ├── ServiceWorkerRegistration.tsx # ⭐ enregistrement SW + banner update PWA
│   │       │   └── ModeIcon.tsx              # ⭐ icônes IDFM unifiées
│   │       ├── constants/mode-colors.ts      # ⭐ MAP_MODE_COLORS + UI_MODE_COLORS (source unique)
│   │       ├── contexts/
│   │       │   ├── AuthContext.tsx
│   │       │   └── ThemeContext.tsx          # ⭐ dark mode no-FOUC
│   │       ├── hooks/
│   │       │   ├── useTransport.ts           # ⭐ AbortController intégré
│   │       │   ├── useGeolocation.ts
│   │       │   ├── useNavigation.ts          # ⭐ navigation GPS (cap, reroutage, voice, wake lock)
│   │       │   ├── usePushNotifications.ts   # ⭐ subscribe/unsubscribe Web Push VAPID
│   │       │   ├── useDarkMode.ts
│   │       │   └── usePrefersReducedMotion.ts # ⭐ a11y OS preference
│   │       └── services/api.ts, favorites.ts, immersion.ts
│   └── backend/           # NestJS (port 4000) — voir apps/backend/README.md
├── packages/shared/       # Types et constantes partagés
├── diagrammes/            # 7 .mmd + .png (cas utilisation, classes, séquence, architecture, IA, déploiement)
├── docker/                # docker-compose (4 services : postgres, backend, frontend, nginx)
├── scripts/               # Scripts utilitaires
├── .env.example
└── README.md, KAIZEN.md, PLAN.md, AUDIT_PROJET.md
```

## API Transport — Endpoints (résumé)

**Itinéraires et temps réel :**
- `GET /api/transport/journey` — Calcul d'itinéraire multimodal (Navitia primaire, GTFS RAPTOR repli)
- `GET /api/transport/realtime-alerts` — Alertes (Navitia primaire, GTFS-RT repli)
- `GET /api/transport/route` — Routing OSRM piéton/vélo (polylignes)
- `GET /api/transport/shape/:shapeId` — Géométrie tracé GTFS

**Données de référence :**
- `GET /api/transport/lines-by-mode` / `stops` / `gtfs-stops/search`
- `GET /api/transport/nearby` (arrêts proches) / `stop-times` (prochains passages)
- `GET /api/transport/velib` / `velib-nearby`
- `GET /api/transport/geocode` / `reverse-geocode`

**Auth, profil, RGPD :** `/api/auth/{register,login,me,me/export,consent,...}` (JWT)

**Favoris et notifications :** `/api/favorites/*` (7 routes), `/api/notifications/*` (7 routes)

**Admin (JWT + rôle admin) :** `/api/admin/{dashboard,users,trips,notifications,broadcast,gtfs/reload,gtfs/status}`

**Health et config :** `/api/health`, `/api/transport/gtfs-status`, `POST /api/admin/gtfs/reload`

**Notifications push :** `/api/notifications/push/{subscribe,send-test}` (VAPID)

📖 **Liste complète + signatures** : voir [`apps/backend/README.md`](apps/backend/README.md) (3 diagrammes Mermaid : modules NestJS, séquence journey, swap atomique GTFS).
📦 **Déploiement production** : voir [`GUIDE_DEPLOIEMENT.md`](../GUIDE_DEPLOIEMENT.md) (OVHcloud, Docker Compose, GitHub Actions, required reviewers).

## Démarrage rapide

### 1. Configuration

```bash
cp .env.example .env
# Modifier .env avec vos valeurs (notamment PRIM_API_KEY)
# S'inscrire sur https://prim.iledefrance-mobilites.fr/ pour obtenir une clé
```

### 2. Développement local (sans Docker)

```bash
# Backend
cd apps/backend
npm install
npm run start:dev

# Frontend (dans un autre terminal)
cd apps/frontend
npm install
npm run dev
```

### 3. Développement avec Docker

```bash
cd docker
docker compose up -d
```

**HTTPS local (requis pour Service Worker + Web Push) :**
```bash
./scripts/generate-certs.sh
cd docker
docker compose up -d
# https://localhost (accepter le certificat auto-signé)
```

### 4. Base de données

La base est initialisée automatiquement via `docker/init-db.sql` avec les tables :
- `users`, `favorites`, `history`, `routes`, `stops`, `notifications`, `transport_feeds`
- `gtfs_*` (10 tables : `gtfs_agencies`, `gtfs_routes`, `gtfs_stops`, `gtfs_trips`,
  `gtfs_stop_times`, `gtfs_calendar`, `gtfs_calendar_dates`, `gtfs_transfers`,
  `gtfs_stop_modes`, `gtfs_stop_lines`) + `gtfs_load_meta` — ~6,8 M lignes dans `gtfs_stop_times`

## Ports

| Service | Port |
|---|---|
| Frontend (Next.js) | 3001 |
| Backend (NestJS) | 4000 |
| PostgreSQL | 5432 |

## Empreinte carbone

Les calculs CO2 utilisent les **facteurs d'emission ADEME Base Carbone v2024** (`https://base-empreinte.ademe.fr/`).

| Mode | Facteur (gCO2/km/passager) |
|---|---|
| Métro | 3.8 |
| RER / Transilien / Train | 5.2 |
| Tramway | 3.2 |
| Bus | 95.0 |
| Bus électrique | 30.0 |
| Trolleybus | 25.0 |
| Vélo mécanique (Vélib') | 0 |
| Vélo électrique | 5.0 |
| Marche | 0 |
| Voiture (1 passager, moyenne IDF) | 170.0 |
| Covoiturage (2 passagers) | 85.0 |
| Funiculaire | 10.0 |
| Navette fluviale | 15.0 |

Formule : `emissionsGco2 = factor * distanceKm`

## Scripts utiles

```bash
# Lancer le backend en mode développement
cd apps/backend && npm run start:dev

# Lancer le frontend en mode développement
cd apps/frontend && npm run dev

# Build le package shared
cd packages/shared && npm run build

# Lancer les tests backend
cd apps/backend && npm run test

# Tests + couverture + badge SVG
cd apps/backend && npm run test:cov   # génère coverage-summary.json + badge/coverage-backend.svg

# Tests e2e backend (requiert urbanflow-db running)
cd apps/backend && DATABASE_URL=postgresql://urbanflow:urbanflow_dev@localhost:5432/urbanflow npm run test:e2e -- --runInBand

# Lancer les tests frontend
cd apps/frontend && npm test

# Sauvegarder / restaurer la base PostgreSQL
./scripts/backup-db.sh ./backups
./scripts/restore-db.sh ./backups/urbanflow_YYYYMMDD_HHMMSS.sql.gz

# Vérification avant mise en production
voir [docs/prod-verification.md](docs/prod-verification.md)

# Déploiement production (guide le plus récent, à la racine du repo T6)
voir [GUIDE_DEPLOIEMENT.md](../GUIDE_DEPLOIEMENT.md)

# Anciens guides détaillés
voir [docs/deploiement-ovhcloud.md](docs/deploiement-ovhcloud.md)
voir [docs/deploiement-hostinger.md](docs/deploiement-hostinger.md)
```

## CI / CD

Deux workflows GitHub Actions :

1. **`.github/workflows/ci.yml`** sur chaque push/PR vers `main` :
   - **Backend** : build → lint bloquant (`--max-warnings 0`) → tests unitaires avec couverture → artefact coverage.
   - **Backend e2e** : monte un conteneur PostgreSQL 16 et exécute la suite e2e (33 tests) en base réelle.
   - **Frontend** : lint bloquant → tests (Jest + RTL) → build production.

2. **`.github/workflows/deploy.yml`** sur push vers `main` (et `workflow_dispatch`) :
   - Se déclenche uniquement après le succès de `ci.yml`.
   - Déploie automatiquement sur le VPS OVHcloud via SSH (`appleboy/ssh-action`).
   - Gated par l’environnement GitHub `prod` avec **required reviewers**.

## Licence

Projet académique — T6 CDSD Septembre 2026