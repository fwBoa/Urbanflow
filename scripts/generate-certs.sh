#!/bin/bash
# ─── Generate self-signed TLS certs for the nginx production profile ───────
#
# Use this ONLY for local/staging testing of the `--profile production` stack.
# Real production MUST use valid certs (e.g. Let's Encrypt / certbot) — never
# self-signed. The generated files are git-ignored (see .gitignore).
#
# Output: docker/certs/fullchain.pem  +  docker/certs/privkey.pem
set -e

CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/docker/certs"
DOMAIN="${1:-localhost}"
mkdir -p "$CERT_DIR"

if ! command -v openssl >/dev/null 2>&1; then
  echo "❌ openssl is required to generate certs." >&2
  exit 1
fi

echo "🔐 Generating self-signed cert for '$DOMAIN' in $CERT_DIR ..."
echo "   ⚠️  SELF-SIGNED — for local/staging testing only. Replace with real certs for production."

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/privkey.pem" \
  -out "$CERT_DIR/fullchain.pem" \
  -days 365 \
  -subj "/CN=$DOMAIN" \
  -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1" \
  >/dev/null 2>&1

chmod 600 "$CERT_DIR/privkey.pem"
echo "✅ Certs written: $CERT_DIR/{fullchain,privkey}.pem"