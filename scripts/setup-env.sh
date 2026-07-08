#!/bin/bash
# ─── Urban Flow Mobility — Génération de docker/.env ───
# Génère automatiquement les secrets de production et crée docker/.env.
# Usage : ./scripts/setup-env.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/docker/.env"
TEMPLATE_FILE="$PROJECT_DIR/docker/.env.production.example"

if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "❌ Modèle introuvable : $TEMPLATE_FILE"
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  echo "⚠️  $ENV_FILE existe déjà."
  read -p "Voulez-vous l’écraser ? (yes/no) : " confirm
  if [ "$confirm" != "yes" ]; then
    echo "Abandon."
    exit 0
  fi
fi

echo ""
echo "🔐 Génération des secrets de production..."
echo ""

# Générer les secrets
POSTGRES_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
COOKIE_SECRET="$(openssl rand -base64 32 | tr -d '\n')"
VAPID_KEYS="$(npx web-push generate-vapid-keys 2>/dev/null)"
VAPID_PUBLIC_KEY="$(echo "$VAPID_KEYS" | grep 'Public Key:' | sed 's/Public Key: *//')"
VAPID_PRIVATE_KEY="$(echo "$VAPID_KEYS" | grep 'Private Key:' | sed 's/Private Key: *//')"

if [ -z "$VAPID_PUBLIC_KEY" ] || [ -z "$VAPID_PRIVATE_KEY" ]; then
  echo "❌ Impossible de générer les clés VAPID. Vérifiez que 'npx web-push generate-vapid-keys' fonctionne."
  exit 1
fi

# Demander la clé API PRIM
while [ -z "$PRIM_API_KEY" ]; do
  read -s -p "🔑 Entrez votre clé API PRIM Île-de-France Mobilités : " PRIM_API_KEY
  echo ""
  if [ -z "$PRIM_API_KEY" ]; then
    echo "⚠️  La clé PRIM est obligatoire."
  fi
done

# Créer le fichier .env
cp "$TEMPLATE_FILE" "$ENV_FILE"

# Remplacer les placeholders
sed -i.bak \
  -e "s/CHANGE_ME_TO_A_STRONG_RANDOM_PASSWORD/$POSTGRES_PASSWORD/g" \
  -e "s|postgresql://urbanflow:CHANGE_ME_TO_A_STRONG_RANDOM_PASSWORD@postgres:5432/urbanflow|postgresql://urbanflow:$POSTGRES_PASSWORD@postgres:5432/urbanflow|g" \
  -e "s/CHANGE_ME_TO_A_LONG_RANDOM_SECRET/$JWT_SECRET/g" \
  -e "s/__COOKIE_SECRET__/$COOKIE_SECRET/g" \
  -e "s/REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY/$VAPID_PUBLIC_KEY/g" \
  -e "s/REPLACE_WITH_YOUR_VAPID_PRIVATE_KEY/$VAPID_PRIVATE_KEY/g" \
  -e "s/REPLACE_WITH_YOUR_PRIM_API_KEY/$PRIM_API_KEY/g" \
  "$ENV_FILE"

rm -f "$ENV_FILE.bak"

# Afficher un récapitulatif (sans les secrets sensibles complets)
echo ""
echo "✅ Fichier $ENV_FILE créé avec succès."
echo ""
echo "Récapitulatif :"
echo "  - Domaine              : urbanflow-mobility.fr"
echo "  - JWT_SECRET           : ${JWT_SECRET:0:12}..."
echo "  - COOKIE_SECRET        : ${COOKIE_SECRET:0:12}..."
echo "  - POSTGRES_PASSWORD    : ${POSTGRES_PASSWORD:0:12}..."
echo "  - VAPID_PUBLIC_KEY     : ${VAPID_PUBLIC_KEY:0:24}..."
echo "  - PRIM_API_KEY         : ${PRIM_API_KEY:0:12}..."
echo ""
echo "⚠️  Conservez ces secrets en lieu sûr. Ils ne seront plus affichés."
