# ─── Build ───
FROM node:20-alpine AS builder
WORKDIR /app
# NEXT_PUBLIC_* est inliné par Next.js AU BUILD ; l'env runtime ne suffit pas.
# On accepte l'arg pour le baker dans le bundle client. En prod (nginx) on
# le laisse vide → API_BASE="" → URLs relatives "/api" proxifiées par nginx.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Production ───
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3001
ENV PORT=3001
CMD ["node", "server.js"]