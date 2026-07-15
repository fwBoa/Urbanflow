# ─── Build ───
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Production ───
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Création d'un utilisateur dédié pour éviter l'exécution en root.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nodejs && \
    apk add --no-cache su-exec

COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
RUN npm ci --only=production

# Répertoire de données GTFS (cache ZIP + fichiers extraits).
# Créé avec l'owner nodejs pour que l'application puisse écrire
# même lorsque le volume Docker est monté ici.
RUN mkdir -p /app/data/gtfs/downloads /app/data/gtfs/extracted && \
    chown -R nodejs:nodejs /app/data/gtfs

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/main.js"]