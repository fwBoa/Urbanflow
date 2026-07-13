# ─── Build ───
FROM node:20-alpine AS builder
WORKDIR /app
# NEXT_PUBLIC_* est inliné par Next.js AU BUILD ; l'env runtime ne suffit pas.
# On accepte l'arg pour le baker dans le bundle client. En prod (nginx) on
# le laisse vide → API_BASE="" → URLs relatives "/api" proxifiées par nginx.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
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
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3001
ENV PORT=3001
CMD ["node", "server.js"]