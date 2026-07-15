#!/bin/sh
set -e

# Le volume /app/data/gtfs peut être monté avec les permissions root.
# On s'assure que l'utilisateur nodejs (uid 1001) peut écrire dedans
# avant de déléguer l'exécution à l'application.
chown -R nodejs:nodejs /app/data/gtfs 2>/dev/null || true

exec su-exec nodejs "$@"
