#!/bin/bash
# Script de téléchargement manuel du GTFS IDFM
# À exécuter quand les APIs PRIM sont de retour

set -e

DATA_DIR="/Users/daveee/Desktop/T6/urbanflow/apps/backend/data/downloads"
ZIP_PATH="$DATA_DIR/idfm-gtfs-static.zip"

mkdir -p "$DATA_DIR"

echo "Téléchargement du GTFS IDFM..."

# Essayer plusieurs sources
SOURCES=(
  "https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/download/?format=zip"
  "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/offre-horaires-tc-gtfs-idfm/exports/zip?limit=-1&timezone=UTC"
)

downloaded=false
for url in "${SOURCES[@]}"; do
  echo "Essai: $url"
  if curl -L -s "$url" -o "$ZIP_PATH" --max-time 300; then
    size=$(stat -f%z "$ZIP_PATH" 2>/dev/null || stat -c%s "$ZIP_PATH" 2>/dev/null || echo 0)
    if [ "$size" -gt 1000000 ]; then
      echo "✅ GTFS téléchargé avec succès ($((size / 1024 / 1024)) MB)"
      downloaded=true
      break
    else
      echo "❌ Fichier trop petit ($size bytes), essai suivant..."
    fi
  fi
done

if [ "$downloaded" = false ]; then
  echo "❌ Échec du téléchargement. Les APIs PRIM sont peut-être encore en maintenance."
  echo "Réessayez plus tard ou téléchargez manuellement depuis:"
  echo "https://prim.iledefrance-mobilites.fr/fr/catalogue-data"
  exit 1
fi

echo ""
echo "Pour recharger le GTFS dans le backend:"
echo "curl -X POST http://localhost:4000/api/transport/gtfs-reload"
