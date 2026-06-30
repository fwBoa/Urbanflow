# Urban Flow Mobility — Backend (NestJS)

API REST pour la plateforme de mobilité multimodale Urban Flow Mobility.

## Architecture du module Transport

Le module Transport intègre les données PRIM (Île-de-France Mobilités) :

```
TransportModule
  ├── PrimService          → Appels API PRIM (référentiels, temps réel, GTFS)
  ├── GtfsParserService    → Téléchargement/parsing GTFS statiques → PostgreSQL (COPY FROM STDIN, staging gtfs_*_next + swap atomique)
  ├── GtfsDbService        → Accès aux tables gtfs_* (pool pg) — RAPTOR lit via ce service
  ├── JourneyService       → Calcul d'itinéraires (algorithme RAPTOR-like, lit via GtfsDbService)
  ├── CarbonService        → Empreinte carbone (facteurs ADEME Base Carbone)
  └── TransportController  → Endpoints REST /api/transport/*
AdminModule
  └── AdminController      → POST /api/admin/gtfs/reload (JWT + rôle admin, force=true) + @Cron('0 3 * * *')
```

**Rechargement GTFS atomique (zero-downtime)** : le nouveau GTFS est chargé dans des tables
staging `gtfs_*_next` pendant que les lectures continuent sur les tables live `gtfs_*`
(`loaded` reste `TRUE`, aucun 503), puis une transaction unique renomme live→`_old`,
`_next`→live, supprime `_old`, renomme index/PK canoniques et valide les comptes dans
`gtfs_load_meta`. En cas d'échec, `cleanupStaging()` supprime le staging — les données
live restent intactes (zéro perte, zéro interruption).

## Endpoints

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/transport/health` | Vérification connexion PRIM |
| GET | `/api/transport/lines` | Référentiel des lignes |
| GET | `/api/transport/stops` | Référentiel des arrêts |
| GET | `/api/transport/stop-lines` | Arrêts et lignes associées |
| GET | `/api/transport/traffic` | Perturbations / infos trafic |
| GET | `/api/transport/velib` | Stations Vélib' temps réel |
| GET | `/api/transport/elevators` | État des ascenseurs |
| GET | `/api/transport/gtfs-url` | URLs de téléchargement GTFS |
| GET | `/api/transport/gtfs-status` | Statut du chargement GTFS (`loaded`, `lastLoadTime`, stats) |
| POST | `/api/transport/gtfs-reload` | Rechargement GTFS (skip si déjà chargé — pas de force) |
| POST | `/api/admin/gtfs/reload` | Rechargement atomique zero-downtime (JWT + rôle admin, `force=true`) |
| GET | `/api/admin/gtfs/status` | État des données GTFS (admin) |

## Variables d'environnement

| Variable | Description | Défaut |
|---|---|---|
| `PRIM_API_URL` | URL de l'API PRIM | `https://api-lab.idfm.fr` |
| `PRIM_API_KEY` | Clé API PRIM (inscription gratuite) | — |
| `IDFM_DATA_API_URL` | URL API OpenData IDFM | `https://data.iledefrance-mobilites.fr/api/explore/v2.1` |
| `GTFS_STATIC_URL` | URL téléchargement GTFS statique | `https://api-lab.idfm.fr/gtfs/v1/idfm-gtfs-static.zip` |
| `GTFS_RT_URL` | URL flux GTFS-RT temps réel | `https://api-lab.idfm.fr/gtfs-rt/v1` |
| `DATABASE_URL` | Chaîne de connexion PostgreSQL (pool pg, tables `gtfs_*` ; fallback `PG*`) | — |
| `GTFS_PG_POOL_MAX` | Taille max du pool de connexions `gtfs-db.service.ts` | `20` |

## Installation

```bash
npm install
```

## Développement

```bash
npm run start:dev
```

## Tests

```bash
npm run test
```

## Tests (34 tests)

| Fichier | Tests | Contenu |
|---|---|---|
| `carbon.service.spec.ts` | 16 | Calculs CO2 ADEME, comparaisons modes, trajets multimodaux |
| `prim.service.spec.ts` | 6 | Initialisation, méthodes API PRIM |
| `transport.controller.spec.ts` | 5 | Endpoints REST, paramètres, appels service |
| `app.controller.spec.ts` | 1 | Test scaffold NestJS |

**Lancer les tests :**
```bash
cd apps/backend && npx jest --verbose
```

## CORS

Le backend autorise les requêtes depuis :
- `http://localhost:3001` (frontend par défaut)
- `http://localhost:3000` (frontend port alternatif)

Configuré dans `src/main.ts` via `app.enableCors()`.

## Licence

Projet académique — T6 CDSD Septembre 2026