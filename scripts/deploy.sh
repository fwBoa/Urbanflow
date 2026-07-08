#!/bin/bash
# ─── Urban Flow Mobility — Déploiement ───
# Usage: ./scripts/deploy.sh [staging|prod]
# §10 Dossier Technique: Déploiement production

set -e

DRY_RUN=false
if [ "$1" = "--dry-run" ]; then
  DRY_RUN=true
  shift
fi

ENV=${1:-staging}
BRANCH=${2:-staging}

# ─── Per-tier environment + log retention ───────────────────────────────
# NODE_ENV drives the backend log levels + error redaction (see main.ts):
#   staging    → operational logs, full error detail (diagnose the RC)
#   production → operational logs, redacted errors
# LOG_MAX_* sets Docker json-file rotation per service (see docker-compose.yml).
if [ "$ENV" = "prod" ]; then
  BRANCH="main"
  export NODE_ENV="production"
  export LOG_MAX_SIZE="10m"
  export LOG_MAX_FILE="5"    # ~50 MB rolling per service
  echo "🚀 Déploiement en PRODUCTION..."
  PROFILE="--profile production"
else
  export NODE_ENV="staging"
  export LOG_MAX_SIZE="10m"
  export LOG_MAX_FILE="10"   # ~100 MB rolling per service (more history)
  echo "📦 Déploiement en PRE-PRODUCTION..."
  PROFILE=""
fi

# ─── Vérifications pré-déploiement ───
echo "🔍 Vérification des variables d'environnement..."
# docker compose auto-loads docker/.env — that is the real source of secrets.
if [ ! -f docker/.env ]; then
  echo "⚠️  docker/.env manquant. Copiez .env.example vers docker/.env et configurez les secrets."
  echo "   cp .env.example docker/.env"
  exit 1
fi

# Vérifier que JWT_SECRET n'est pas la valeur par défaut en production
if [ "$ENV" = "prod" ]; then
  if grep -q "change_me_in_production" docker/.env; then
    echo "❌ JWT_SECRET doit être changé en production (docker/.env) !"
    exit 1
  fi
  # Le profil production (nginx TLS) nécessite des certificats réels.
  if [ ! -f docker/certs/fullchain.pem ] || [ ! -f docker/certs/privkey.pem ]; then
    echo "❌ Certificats TLS manquants : docker/certs/{fullchain,privkey}.pem"
    echo "   Placez des certificats réels (Let's Encrypt) ou, pour tester :"
    echo "     ./scripts/generate-certs.sh   # self-signed — TESTING ONLY"
    exit 1
  fi
fi

echo "Pull de la branche $BRANCH..."
git pull origin "$BRANCH"

echo "Build Docker..."
cd docker
docker compose build

if [ "$DRY_RUN" = "true" ]; then
  echo "✅ Dry-run terminé — images construites, containers non démarrés."
  echo "   Pour déployer : ./scripts/deploy.sh $ENV $BRANCH"
  exit 0
fi

docker compose $PROFILE up -d

echo "⏳ Attente du démarrage des services..."

# Attendre que le conteneur postgres soit healthy (jusqu'à 60s).
# Le premier démarrage charge le GTFS et peut prendre 20-40s.
MAX_WAIT=60
ELAPSED=0
while ! docker compose ps | grep -q "urbanflow-db.*healthy"; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "❌ La base de données n'a pas démarré dans le délai imparti !"
    docker compose logs postgres --tail=30
    exit 1
  fi
done

# Vérifier que l'API et le frontend sont running
if ! docker compose ps | grep -q "urbanflow-api.*running"; then
  echo "❌ Le backend n'a pas démarré !"
  docker compose logs backend --tail=20
  exit 1
fi

if ! docker compose ps | grep -q "urbanflow-web.*running"; then
  echo "❌ Le frontend n'a pas démarré !"
  docker compose logs frontend --tail=20
  exit 1
fi

echo "✅ Déploiement $ENV terminé !"
echo ""
echo "Services :"
echo "  - Frontend : http://localhost:3000"
echo "  - Backend  : http://localhost:4000"
echo "  - Database : localhost:5432"
if [ "$ENV" = "prod" ]; then
  echo "  - Nginx    : http://localhost:80 (proxy)"
fi
echo ""
echo "Logs : docker compose logs -f"