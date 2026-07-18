<p align="center">
  <img src="apps/frontend/public/assets/urbanflow/brand/urbanflow-logo-clair.svg" alt="UrbanFlow" width="280">
</p>

<h1 align="center">UrbanFlow Mobility</h1>

<p align="center">
  <strong>Plateforme intelligente de mobilité multimodale pour Paris et l’Île-de-France.</strong><br>
  Itinéraires temps réel, navigation GPS immersive, Vélib’, alertes lignes et PWA offline.
</p>

<p align="center">
  <a href="https://github.com/fwBoa/Urbanflow/actions/workflows/ci.yml"><img src="https://github.com/fwBoa/Urbanflow/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/fwBoa/Urbanflow/actions/workflows/deploy.yml"><img src="https://github.com/fwBoa/Urbanflow/actions/workflows/deploy.yml/badge.svg" alt="Deploy"></a>
  <img src="badge/coverage-backend.svg" alt="Coverage">
</p>

---

## ✨ Ce que fait UrbanFlow

- **Itinéraires multimodaux** — métro, RER, bus, tram, Vélib’ et marche, avec calcul via Navitia PRIM v2 et repli GTFS RAPTOR.
- **Navigation GPS immersive** — turn-by-turn, rotation au cap, reroutage et guidage vocal sur la page trajet.
- **Temps réel & alertes** — prochains passages, alertes lignes et notifications push avant départ.
- **Accessibilité** — mode PMR qui filtre les arrêts et véhicules accessibles, préférences d’animation réduite.
- **PWA offline** — service worker, page fallback, Web Push VAPID et installation sur mobile.
- **Empreinte carbone** — estimation CO₂ par trajet via les facteurs ADEME Base Carbone.

## 🏗 Stack

| Couche | Technologie |
|---|---|
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Leaflet |
| Backend | NestJS 11 · TypeScript · TypeORM |
| Données | PostgreSQL 16 · GTFS IDFM · Navitia PRIM v2 · OSRM · Vélib’ Open Data |
| Auth & Push | JWT httpOnly · Web Push VAPID · bcrypt · RBAC |
| DevOps | Docker Compose · Nginx · GitHub Actions · VPS OVHcloud |

## 🚀 Démarrage rapide

```bash
# 1. Configuration
cp .env.example .env
# Renseigner PRIM_API_KEY (obtenue sur https://prim.iledefrance-mobilites.fr)

# 2. Docker (recommandé)
cd docker
docker compose up -d

# 3. Ou en local
# Backend
cd apps/backend && npm install && npm run start:dev
# Frontend (autre terminal)
cd apps/frontend && npm install && npm run dev
```

Ports par défaut :

| Service | Port |
|---|---|
| Frontend | 3001 |
| Backend | 4000 |
| PostgreSQL | 5432 |

## 🤝 Contribuer

Ce projet suit les [conventions de commit du skill UrbanFlow](.claude/skills/urbanflow/SKILL.md).
