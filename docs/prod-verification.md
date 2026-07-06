# Urban Flow Mobility — Vérification production

Checklist exécutée avant tout déploiement en production.

## 1. Secrets et environnement

- [ ] `.env.production` créé, jamais commité.
- [ ] `JWT_SECRET` est une chaîne aléatoire d'au moins 32 octets.
- [ ] `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` générés et cohérents avec `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- [ ] `PRIM_API_KEY` valide et le quota PRIM est suffisant.
- [ ] `POSTGRES_PASSWORD` et `DATABASE_URL` pointent vers l'instance de prod.
- [ ] `CORS_ORIGIN` est restreint au domaine de prod (pas `*`).

## 2. Base de données

- [ ] Conteneur `urbanflow-db` démarré et healthy (`docker compose ps`).
- [ ] GTFS statiques chargés (vérifiable via `GET /api/transport/gtfs-status`).
- [ ] Index sur `gtfs_stop_times(trip_id, stop_sequence)` et `gtfs_stop_times(stop_id, departure_time)` présents.
- [ ] Sauvegarde manuelle avant upgrade : `./scripts/backup-db.sh`.

## 3. Build applicatif

```bash
cd apps/backend
npm ci
npm run lint -- --max-warnings 0
npm run test:e2e -- --runInBand   # requiert urbanflow-db running
npm run build

cd apps/frontend
npm ci
npm run lint -- --max-warnings 0
npm test -- --no-coverage
NEXT_PUBLIC_API_URL="" npm run build
```

- [ ] `apps/backend/dist/` généré sans erreur TypeScript.
- [ ] `apps/frontend/.next/` généré en mode statique + dynamique (`/trip/[id]`).

## 4. Docker Compose production

```bash
cd docker
docker compose --profile production up -d --build
```

- [ ] Les 4 services sont up (`postgres`, `backend`, `frontend`, `nginx`).
- [ ] Nginx écoute 80/443 avec certificats valides.
- [ ] CSP et rate limiting actifs (`docker compose logs nginx`).
- [ ] Healthcheck backend répond `GET /api/health` → `200 { status: "ok" }`.

## 5. PWA / Web Push

- [ ] Service Worker enregistré et fichiers statiques mis en cache.
- [ ] Inscription push fonctionne depuis Chrome/Android et Safari/iOS 16.4+.
- [ ] Envoi d'une notification test admin (`POST /api/admin/notifications`) reçu par l'abonné.

## 6. GTFS-RT et alertes

- [ ] `GET /api/transport/realtime-alerts` renvoie des alertes ou `[]` sans erreur 500.
- [ ] Cron de refresh GTFS-RT toutes les 5 min déclenche `alerts.updated` pour les nouvelles alertes.
- [ ] Logs sans fuite de secrets (`PRIM_API_KEY` masqué).

## 7. Points de repère finaux

- [ ] `npm audit --audit-level=moderate` ne remonte pas de vulnérabilité critique non justifiée.
- [ ] `docker system prune` autorisé après build (images intermédiaires nettoyées).
- [ ] `./scripts/backup-db.sh` a été testé et un backup de référence existe.
