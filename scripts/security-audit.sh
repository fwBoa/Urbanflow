#!/bin/bash
# ─── Urban Flow Mobility — Audit de sécurité local ───
# Usage: bash scripts/security-audit.sh
# Vérifie les dépendances (npm audit) et scanne le code source (SAST via Semgrep Docker).
# Nécessite Docker installé et le daemon en cours d'exécution.

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🔒 Urban Flow Mobility — Audit de sécurité"
echo ""

echo "📦 1/3 npm audit — apps/backend"
(
  cd apps/backend
  npm audit --audit-level=moderate
)
echo ""

echo "📦 2/3 npm audit — apps/frontend"
(
  cd apps/frontend
  npm audit --audit-level=moderate
)
echo ""

echo "🔍 3/3 SAST — Semgrep scan --config=auto"
if command -v semgrep >/dev/null 2>&1; then
  semgrep scan --config=auto --error "$ROOT_DIR"
elif command -v docker >/dev/null 2>&1; then
  docker run --rm \
    -v "$ROOT_DIR:/src:ro" \
    returntocorp/semgrep:latest semgrep --config=auto --error /src
else
  echo "❌ Ni semgrep ni docker n'est disponible. Installez l'un des deux :"
  echo "   - brew install semgrep"
  echo "   - python3 -m pip install semgrep"
  echo "   - ou installez Docker pour lancer le scan en conteneur"
  exit 1
fi

echo ""
echo "✅ Audit de sécurité terminé sans finding critique."
