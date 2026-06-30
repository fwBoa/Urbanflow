# Urban Flow Mobility

Plateforme intelligente de mobilité multimodale pour Paris et son agglomération.

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Next.js 16 + TypeScript + Tailwind CSS |
| Backend | NestJS + TypeScript |
| Base de données | PostgreSQL 16 |
| Cartographie | Leaflet + OpenStreetMap |
| Données transport | PRIM (Île-de-France Mobilités) — Open Data |
| Conteneurisation | Docker + Docker Compose |

## Structure du projet

```
urbanflow/
├── apps/
│   ├── frontend/          # Next.js 16.2.6 (port 3001)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx           # Accueil
│   │   │   │   ├── search/page.tsx    # Recherche itinéraire (autocomplete arrêts + adresses, mode transport, géolocalisation, clic carte)
│   │   │   │   ├── trip/[id]/page.tsx  # Détail itinéraire + mode navigation + détails enrichis (direction, quai, attente)
│   │   │   │   ├── favorites/page.tsx  # Favoris & historique
│   │   │   │   └── profile/page.tsx    # Profil utilisateur
│   │   │   ├── components/            # 13 composants réutilisables
│   │   │   │   ├── NavBar.tsx          # Navigation basse
│   │   │   │   ├── Header.tsx          # En-tête
│   │   │   │   ├── AppShell.tsx        # Layout wrapper
│   │   │   │   ├── TransportCard.tsx   # Carte mode transport (⚠️ inutilisé — voir cleanup)
│   │   │   │   ├── CO2Badge.tsx        # Badge émissions CO2
│   │   │   │   ├── TripCard.tsx        # Carte résultat trajet
│   │   │   │   ├── SearchBar.tsx        # Champ de recherche
│   │   │   │   ├── FilterChip.tsx      # Chips de filtre
│   │   │   │   ├── MapComponent.tsx    # Carte Leaflet interactive
│   │   │   │   ├── DynamicMap.tsx      # Wrapper next/dynamic (SSR off)
│   │   │   │   ├── VelibStationCard.tsx # Carte station Vélib'
│   │   │   │   ├── NotificationBell.tsx  # Cloche notifications
│   │   │   │   ├── ServiceWorkerRegistration.tsx # Enregistrement SW PWA
│   │   │   │   └── ConsentBanner.tsx   # Bannière consentement RGPD
│   │   │   ├── hooks/
│   │   │   │   ├── useTransport.ts     # Hooks React (useLines, useStopSearch, useGeocode, useReverseGeocode, useJourney, etc.)
│   │   │   │   ├── useLocalStorage.ts  # Hook localStorage typé
│   │   │   │   └── useGeolocation.ts   # Hook géolocalisation navigateur (GPS ponctuel + watchPosition continu)
│   │   │   └── services/
│   │   │       ├── api.ts              # Service API typé (10 endpoints PRIM + geocoding + reverse-geocoding + journey)
│   │   │       └── favorites.ts        # Service favoris, historique, stats, préférences
│   │   └── ...
│   └── backend/           # NestJS (port 4000)
│       └── src/transport/ # Module Transport PRIM
│           ├── prim.service.ts        # Appels API PRIM + geocoding + reverse-geocoding data.gouv.fr
│           ├── gtfs-parser.service.ts  # Parsing GTFS statiques (streaming, index optimisé)
│           ├── journey.service.ts      # Calcul d'itinéraires (RAPTOR + fallback)
│           ├── gtfs-rt.service.ts      # GTFS-RT temps réel (alertes, perturbations)
│           ├── osrm.service.ts         # Routing OSRM (polyline réelle)
│           ├── carbon.service.ts       # Empreinte CO2 (ADEME)
│           ├── transport.controller.ts # Endpoints REST (20+ routes)
│           └── transport.module.ts      # Module NestJS
├── packages/
│   └── shared/            # Types et constantes partagés (GTFS/PRIM)
├── docker/
│   ├── docker-compose.yml
│   └── init-db.sql
├── scripts/               # Scripts utilitaires
├── .env.example           # Variables d'environnement
└── .gitignore
```

## API Transport — Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/transport/health` | Vérification connexion PRIM |
| `GET /api/transport/modes` | Modes de transport avec compteurs dynamiques |
| `GET /api/transport/lines` | Référentiel des lignes |
| `GET /api/transport/lines-by-mode` | Lignes groupées par mode (Métro, RER, Tram…) |
| `GET /api/transport/stops` | Référentiel des arrêts PRIM (toute l'IDF) |
| `GET /api/transport/gtfs-stops/search?q=...&limit=N` | Recherche d'arrêts GTFS par nom (Paris uniquement) |
| `GET /api/transport/nearby?lat=...&lon=...&radius=...&limit=...` | Arrêts proches avec lignes desservies |
| `GET /api/transport/stop-lines` | Arrêts et lignes associées |
| `GET /api/transport/traffic` | Perturbations / infos trafic |
| `GET /api/transport/velib` | Stations Vélib' temps réel |
| `GET /api/transport/velib-nearby?lat=...&lon=...` | Stations Vélib' proches (Open Data Paris) |
| `GET /api/transport/gtfs-stops/search?q=...` | Recherche d'arrêts GTFS (avec modes train/métro/bus/tram) |
| `GET /api/transport/elevators` | État des ascenseurs |
| `GET /api/transport/gtfs-url` | URLs de téléchargement GTFS |
| `GET /api/transport/gtfs-status` | Statut du chargement GTFS (loaded, stats) |
| `POST /api/transport/gtfs-reload` | Rechargement manuel du GTFS |
| `GET /api/transport/geocode?q=...&limit=N` | Recherche d'adresses (Paris uniquement) + arrêts GTFS |
| `GET /api/transport/reverse-geocode?lat=...&lon=...` | Géocodage inverse — coordonnées → adresse lisible |
| `GET /api/transport/realtime-alerts` | Alertes et perturbations temps réel |
| `GET /api/transport/realtime-status` | Statut du service GTFS-RT |
| `GET /api/transport/journey?originLat=...&originLon=...&destLat=...&destLon=...&departureTime=...&modes=...` | Calcul d'itinéraire multimodal (RAPTOR + GTFS réel) |
| `GET /api/transport/route?originLat=...&originLon=...&destLat=...&destLon=...` | Routing OSRM (polyline réelle) |

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

### 4. Base de données

La base est initialisée automatiquement via `docker/init-db.sql` avec les tables :
- `users`, `favorites`, `trips`, `routes`, `stops`, `notifications`, `transport_feeds`

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
```



## Licence

Projet académique — T6 CDSD Septembre 2026