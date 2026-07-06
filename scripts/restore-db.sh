#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Restauration PostgreSQL d'Urban Flow Mobility.
# Usage : ./scripts/restore-db.sh <backup.sql[.gz]>
# Nécessite le conteneur postgres running (docker compose up -d postgres).
# Le script utilise ON_ERROR_STOP=1 : une erreur SQL arrête la restauration.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

CONTAINER=${POSTGRES_CONTAINER:-urbanflow-db}
DB=${POSTGRES_DB:-urbanflow}
USER=${POSTGRES_USER:-urbanflow}
PASS=${POSTGRES_PASSWORD:-urbanflow_dev}
FILE=${1:-}

if [[ -z "$FILE" ]]; then
  echo "Usage: $0 <backup.sql[.gz]>" >&2
  echo "Exemple : $0 backups/urbanflow_20260706_220000.sql.gz" >&2
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "Fichier non trouvé : $FILE" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Le conteneur $CONTAINER n'est pas running. Lancez :" >&2
  echo "  docker compose -f docker/docker-compose.yml up -d postgres" >&2
  exit 1
fi

echo "Restauration de $DB depuis $FILE …"
if [[ "$FILE" == *.gz ]]; then
  zcat "$FILE"
else
  cat "$FILE"
fi | PGPASSWORD="$PASS" docker exec -i "$CONTAINER" psql \
  -U "$USER" \
  -d "$DB" \
  -v ON_ERROR_STOP=1

echo "Restauration terminée."
