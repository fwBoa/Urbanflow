# Urban Flow Mobility — Backend (NestJS)

API REST pour la plateforme de mobilité multimodale Urban Flow Mobility.

## Architecture du module Transport

Le module Transport intègre les données PRIM (Île-de-France Mobilités) :

```
TransportModule
  ├── PrimService          → Appels API PRIM (référentiels, temps réel, GTFS)
  ├── GtfsParserService    → Parsing des fichiers GTFS statiques (ZIP → index)
  ├── JourneyService       → Calcul d'itinéraires (algorithme RAPTOR-like)
  ├── CarbonService        → Empreinte carbone (facteurs ADEME Base Carbone)
  └── TransportController  → Endpoints REST /api/transport/*
```

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

## Variables d'environnement

| Variable | Description | Défaut |
|---|---|---|
| `PRIM_API_URL` | URL de l'API PRIM | `https://api-lab.idfm.fr` |
| `PRIM_API_KEY` | Clé API PRIM (inscription gratuite) | — |
| `IDFM_DATA_API_URL` | URL API OpenData IDFM | `https://data.iledefrance-mobilites.fr/api/explore/v2.1` |
| `GTFS_STATIC_URL` | URL téléchargement GTFS statique | `https://api-lab.idfm.fr/gtfs/v1/idfm-gtfs-static.zip` |
| `GTFS_RT_URL` | URL flux GTFS-RT temps réel | `https://api-lab.idfm.fr/gtfs-rt/v1` |

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
- `http://localhost:3000` (frontend par défaut)
- `http://localhost:3001` (frontend port alternatif)

Configuré dans `src/main.ts` via `app.enableCors()`.

## Licence

Projet académique — T6 CDSD Septembre 2026