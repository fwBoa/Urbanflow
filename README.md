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
│   │   │   ├── components/            # 10 composants réutilisables
│   │   │   │   ├── NavBar.tsx          # Navigation basse
│   │   │   │   ├── Header.tsx          # En-tête
│   │   │   │   ├── AppShell.tsx        # Layout wrapper
│   │   │   │   ├── TransportCard.tsx   # Carte mode transport
│   │   │   │   ├── CO2Badge.tsx        # Badge émissions CO2
│   │   │   │   ├── TripCard.tsx        # Carte résultat trajet
│   │   │   │   ├── SearchBar.tsx        # Champ de recherche
│   │   │   │   ├── FilterChip.tsx      # Chips de filtre
│   │   │   │   ├── MapComponent.tsx    # Carte Leaflet interactive
│   │   │   │   └── DynamicMap.tsx      # Wrapper next/dynamic (SSR off)
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
│           ├── gtfs-parser.service.ts  # Parsing GTFS statiques
│           ├── journey.service.ts      # Calcul d'itinéraires
│           ├── carbon.service.ts       # Empreinte CO2 (ADEME)
│           ├── transport.controller.ts # Endpoints REST (journey enrichi, reverse-geocode)
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
| `GET /api/transport/lines` | Référentiel des lignes |
| `GET /api/transport/stops` | Référentiel des arrêts |
| `GET /api/transport/stop-lines` | Arrêts et lignes associées |
| `GET /api/transport/traffic` | Perturbations / infos trafic |
| `GET /api/transport/velib` | Stations Vélib' temps réel |
| `GET /api/transport/elevators` | État des ascenseurs |
| `GET /api/transport/gtfs-url` | URLs de téléchargement GTFS |
| `GET /api/transport/geocode?q=...&limit=N` | Recherche d'adresses (data.gouv.fr, centré Île-de-France) |
| `GET /api/transport/reverse-geocode?lat=...&lon=...` | Géocodage inverse — coordonnées → adresse lisible |
| `GET /api/transport/journey?originLat=...&originLon=...&destLat=...&destLon=...` | Calcul d'itinéraire multimodal (avec détails : direction, quai, attente) |

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