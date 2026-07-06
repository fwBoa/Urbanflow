#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Sauvegarde PostgreSQL d'Urban Flow Mobility.
# Usage : ./scripts/backup-db.sh [backup-dir]
# Crée backups/urbanflow_YYYYMMDD_HHMMSS.sql.gz en se basant sur les valeurs
# de .env (sinon les defaults ci-dessous). Peut démarrer temporairement le
# conteneur postgres s'il n'est pas running.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

# Charger .env s'il existe (silencieux)
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

CONTAINER=${POSTGRES_CONTAINER:-urbanflow-db}
DB=${POSTGRES_DB:-urbanflow}
USER=${POSTGRES_USER:-urbanflow}
PASS=${POSTGRES_PASSWORD:-urbanflow_dev}
BACKUP_DIR=${1:-./backups}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/${DB}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

start_postgres() {
  echo "Démarrage temporaire du service postgres…"
  docker compose -f docker/docker-compose.yml up -d postgres
  echo -n "Attente de postgres"
  until docker exec "$CONTAINER" pg_isready -U "$USER" >/dev/null 2>&1; do
    echo -n "."
    sleep 1
  done
  echo " OK"
}

stop_postgres_if_started() {
  # Si le service n'était pas running avant, on le stoppe pour ne pas laisser
  # une base locale active à l'insu de l'utilisateur.
  if [[ "${WAS_RUNNING:-false}" == "false" ]]; then
    echo "Arrêt du service postgres démarré pour la sauvegarde…"
    docker compose -f docker/docker-compose.yml stop postgres
  fi
}

WAS_RUNNING=false
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  WAS_RUNNING=true
else
  start_postgres
fi

trap stop_postgres_if_started EXIT

echo "Sauvegarde de $DB depuis $CONTAINER → $OUT"
PGPASSWORD="$PASS" docker exec -i "$CONTAINER" pg_dump \
  -U "$USER" \
  -d "$DB" \
  --no-owner \
  --clean \
  --if-exists \
  | gzip > "$OUT"

ls -lh "$OUT"
echo "Sauvegarde terminée."
