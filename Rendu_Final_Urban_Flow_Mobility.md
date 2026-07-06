# Rendu Final — Urban Flow Mobility

**Projet académique T6 — CDSD Septembre 2026**  
**Date :** 6 juillet 2026  
**Dépôt GitHub :** https://github.com/fwBoa/Urbanflow  
**Branche principale :** `main`

---

## 1. Résumé du projet

Urban Flow Mobility est une application web de mobilité multimodale pour Paris et l’Île-de-France. Elle propose le calcul d’itinéraires, l’affichage d’alertes temps réel, la gestion de favoris, l’historique de trajets et des notifications push. L’application est conçue comme une PWA installable, avec un backend robuste (NestJS + PostgreSQL) et une architecture hybride Navitia/GTFS.

---

## 2. Fonctionnalités livrées

### 2.1 Backend

- **Itinéraires multimodaux** : couche primaire Navitia PRIM v2 + repli silencieux GTFS RAPTOR en PostgreSQL.
- **Temps réel** : alertes GTFS-RT rafraîchies toutes les 5 minutes.
- **Référentiel transport** : lignes par mode, arrêts, prochains passages, stations Vélib’, ascenseurs, trafic.
- **Auth & RGPD** : JWT httpOnly, rôles, consentements, export et suppression de compte.
- **Favoris & historique** : CRUD complet avec routes sécurisées.
- **Notifications** : in-app + Web Push VAPID, broadcast admin.
- **Admin** : dashboard, rechargement GTFS, envoi de notification globale.
- **Ops** : healthcheck, logs structurés, Docker Compose, scripts de backup/restore.

### 2.2 Frontend

- **Pages** : accueil, recherche, détail trajet, favoris, profil, admin, mentions légales, offline.
- **Navigation immersive** : mode trajet avec banner directionnel, rotation de carte, reroutage réel.
- **Accessibilité** : `prefers-reduced-motion`, dark mode sans FOUC, composant `Switch`.
- **PWA** : Service Worker, cache offline, installation.
- **Géolocalisation** : géolocalisation utilisateur et arrêts à proximité.
- **Notifications push** : opt-in depuis le profil, abonnement/désabonnement VAPID.

---

## 3. Architecture et choix techniques

- **NestJS + TypeORM** pour une architecture modulaire et testable.
- **PostgreSQL 16** pour persister les données métier et le GTFS complet (~6,8 M lignes dans `gtfs_stop_times`).
- **Navitia PRIM v2 en primaire** pour bénéficier du routing enrichi et des alertes temps réel.
- **GTFS RAPTOR en repli** pour garantir un service même en cas de quota/rupture PRIM.
- **Event-driven notifications** (`@nestjs/event-emitter`) pour découpler la collecte GTFS-RT de la livraison push.
- **Docker Compose** pour un environnement de développement et de production reproductible.
- **GitHub Actions** pour une CI bloquante et automatisée.

---

## 4. Assurance qualité

| Indicateur | Valeur |
| --- | --- |
| Lint backend | 0 erreur / 0 warning |
| Lint frontend | 0 erreur / 0 warning |
| Tests unitaires backend | **186 pass** |
| Tests e2e backend | **33 pass** (DB PostgreSQL réelle) |
| Tests frontend | **8 pass** |
| Build backend | ✅ |
| Build frontend | ✅ |
| Couverture backend (lines) | **51,1 %** |

La couverture reste concentrée sur les modules métiers critiques. Le module `transport` (parser GTFS et intégrations externes) constitue la principale zone à renforcer.

---

## 5. Livrables du dépôt

- Code source complet (`apps/backend`, `apps/frontend`, `packages/shared`).
- Docker Compose et configurations Nginx (`docker/`).
- Scripts d’exploitation (`scripts/`).
- Documentation : `README.md`, `apps/backend/README.md`, `Dossier_Technique_Urban_Flow_Mobility.md` (ce fichier), `docs/prod-verification.md`.
- Pipeline CI/CD : `.github/workflows/ci.yml`.
- Badge de couverture : `badge/coverage-backend.svg`.

---

## 6. Limites connues

1. Le géocodage est filtré sur Paris intra-muros, alors que le GTFS couvre l’Île-de-France.
2. La couverture de tests du module `transport` est faible en raison de la complexité des fixtures GTFS.
3. Le repli RAPTOR n’intègre pas les perturbations temps réel ; Navitia reste la source privilégiée.
4. Le cron GTFS-RT et le rechargement GTFS sont mono-instance.
5. Les disponibilités Vélib’/trottinettes ne sont pas intégrées au calcul d’itinéraire.
6. L’envoi push dépend de la connectivité et des services externes (FCM/APNS).

---

## 7. Pistes d’évolution

- Étendre le géocodage à toute l’Île-de-France avec une option de restriction.
- Augmenter la couverture de tests via des fixtures GTFS allégées.
- Migrer les tâches planifiées vers une file d’attente distribuée (Redis/BullMQ).
- Ajouter un cache Redis pour les itinéraires et le géocodage.
- Intégrer les disponibilités Vélib’ dans le calcul d’itinéraire.
- Ajouter du monitoring (OpenTelemetry) et des alertes de production.

---

## 8. Conclusion

Le projet Urban Flow Mobility atteint les objectifs fixés pour le rendu T6 : backend stable et testé, frontend fonctionnel et accessible, CI/CD opérationnelle, architecture hybride Navitia/GTFS opérationnelle et notifications push événementielles. Les limites identifiées constituent une feuille de route claire pour les itérations futures.
