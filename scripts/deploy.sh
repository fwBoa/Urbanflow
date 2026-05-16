#!/bin/bash
# ─── Urban Flow Mobility — Déploiement ───
# Usage: ./scripts/deploy.sh [staging|prod]

set -e

ENV=${1:-staging}
BRANCH=${2:-staging}

if [ "$ENV" = "prod" ]; then
  BRANCH="main"
  echo "🚀 Déploiement en PRODUCTION..."
else
  echo "📦 Déploiement en PRE-PRODUCTION..."
fi

echo "Pull de la branche $BRANCH..."
git pull origin "$BRANCH"

echo "Build et déploiement Docker..."
cd docker
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d

echo "Exécution des migrations..."
docker compose exec backend npm run migration:run

echo "✅ Déploiement $ENV terminé !"