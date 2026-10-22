#!/bin/bash
# ─── Urban Flow Mobility — Durcissement de la base PostgreSQL ───
# Usage: bash scripts/harden-db.sh [--dry-run]
#
# Deux mesures, toutes deux idempotentes :
#
#   1. pg_hba.conf — la règle attrape-tout « host all all all » autorisait
#      n'importe quel hôte à tenter une authentification par mot de passe.
#      On la restreint au sous-réseau Docker du projet, seul chemin par
#      lequel le backend se connecte réellement.
#
#   2. Rôle applicatif — le rôle de l'application est superutilisateur. Il
#      possède déjà les 22 tables, donc il n'en a pas besoin. Les extensions
#      utilisées (uuid-ossp, pg_prewarm) sont « trusted » depuis PG 13 et
#      restent installables par le propriétaire de la base.
#
# Le script sauvegarde pg_hba.conf avant de le modifier et vérifie à la fin
# que le rôle peut toujours créer une extension. Prérequis : le dump de
# scripts/backup-db.sh a été pris.

set -euo pipefail

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/docker"

CONTAINER=urbanflow-db

# Lire l'identité applicative depuis le conteneur plutôt que depuis docker/.env :
# c'est la valeur réellement en service, sans risque de divergence.
DB_USER=$(docker exec "$CONTAINER" printenv POSTGRES_USER)
DB_NAME=$(docker exec "$CONTAINER" printenv POSTGRES_DB)

if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  echo "❌ POSTGRES_USER/POSTGRES_DB introuvables dans $CONTAINER."
  exit 1
fi

# Sous-réseau Docker du conteneur — résolu dynamiquement, car un sous-réseau
# codé en dur casserait la connexion si le réseau était recréé.
NETWORK=$(docker inspect "$CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')
SUBNET=$(docker network inspect "$NETWORK" --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' | awk '{print $1}')

if [ -z "$SUBNET" ]; then
  echo "❌ Impossible de déterminer le sous-réseau Docker de $NETWORK."
  exit 1
fi

echo "🔒 Durcissement PostgreSQL — $CONTAINER"
echo "   Rôle applicatif : $DB_USER"
echo "   Base            : $DB_NAME"
echo "   Réseau Docker   : $NETWORK ($SUBNET)"
echo ""

# ─── 1. pg_hba.conf ─────────────────────────────────────────────────────
echo "📝 1/2 pg_hba.conf — restriction au sous-réseau $SUBNET"

PGDATA=/var/lib/postgresql/data

if [ "$DRY_RUN" = "true" ]; then
  echo "   [dry-run] règle attrape-tout actuelle :"
  docker exec "$CONTAINER" grep -nE '^[[:space:]]*host[[:space:]]+all[[:space:]]+all[[:space:]]+all' "$PGDATA/pg_hba.conf" | sed 's/^/     /' || echo "     (aucune)"
else
  docker exec "$CONTAINER" bash -c "
    set -e
    f=$PGDATA/pg_hba.conf
    cp \"\$f\" \"\$f.bak.\$(date +%Y%m%d-%H%M%S)\"
    sed -i -E 's|^([[:space:]]*host[[:space:]]+all[[:space:]]+all[[:space:]]+)all([[:space:]]+)|\1$SUBNET\2|' \"\$f\"
  "
  echo "   Sauvegarde : pg_hba.conf.bak.<horodatage>"
  echo "   Règles host après modification :"
  docker exec "$CONTAINER" grep -nE '^[[:space:]]*host' "$PGDATA/pg_hba.conf" | sed 's/^/     /'

  docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT pg_reload_conf();" > /dev/null
  echo "   ✅ Configuration rechargée (pas de redémarrage, aucune coupure)."
fi

echo ""

# ─── 2. Rôle applicatif non superutilisateur ────────────────────────────
echo "👤 2/2 rôle $DB_USER — retrait de SUPERUSER"

IS_SUPER=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT rolsuper FROM pg_roles WHERE rolname = '$DB_USER';" | tr -d '[:space:]')

# Le bootstrap user (celui qu'initdb crée, toujours d'OID 10) ne peut pas perdre
# SUPERUSER : PostgreSQL le refuse. C'est le cas quand POSTGRES_USER est aussi
# le rôle applicatif. La vraie correction est alors un rôle distinct, pas une
# modification de celui-ci.
BOOTSTRAP=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT rolname FROM pg_roles WHERE oid = 10;" | tr -d '[:space:]')

if [ "$IS_SUPER" = "f" ]; then
  echo "   Déjà NOSUPERUSER, rien à faire."
elif [ "$DB_USER" = "$BOOTSTRAP" ]; then
  echo "   ⏭  $DB_USER est le bootstrap user (OID 10) : PostgreSQL interdit de"
  echo "      lui retirer SUPERUSER. Mesure non applicable en l'état."
  echo "      Correctif réel : créer un rôle applicatif distinct et le déclarer"
  echo "      propriétaire des objets, puis basculer DATABASE_URL."
elif [ "$DRY_RUN" = "true" ]; then
  echo "   [dry-run] ALTER ROLE $DB_USER NOSUPERUSER;"
else
  docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c \
    "ALTER ROLE $DB_USER NOSUPERUSER;" > /dev/null

  # Vérification empirique : le backend exécute CREATE EXTENSION IF NOT EXISTS
  # pg_prewarm au démarrage (gtfs-db.service.ts). On s'assure que le rôle y
  # parvient toujours sans superuser.
  if docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c \
      'CREATE EXTENSION IF NOT EXISTS pg_prewarm;' > /dev/null 2>&1; then
    echo "   ✅ NOSUPERUSER appliqué, CREATE EXTENSION toujours fonctionnel."
  else
    echo "   ⚠️  NOSUPERUSER appliqué MAIS CREATE EXTENSION échoue désormais."
    echo "      Réactiver si besoin : ALTER ROLE $DB_USER SUPERUSER;"
    exit 1
  fi
fi

echo ""
echo "✅ Durcissement terminé."
