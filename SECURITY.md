# Sécurité UrbanFlow

Ce document recense les bonnes pratiques de sécurité appliquées au projet UrbanFlow (Next.js 16 + NestJS 11 + PostgreSQL 16), ainsi que la façon de les vérifier et de les maintenir.

## 1. Audit en cours de développement

### 1.1 Audit des dépendances

Outil : `npm audit` (npm v10).

```bash
# Backend
cd apps/backend
npm audit --audit-level=moderate

# Frontend
cd apps/frontend
npm audit --audit-level=moderate
```

Objectif : **0 vulnérabilité** de niveau `moderate` ou supérieur avant chaque push sur `main`.

#### Override de dépendance transitive

Next.js 16 importait une version de `postcss` vulnérable. Le `package.json` frontend force une version patchée via `overrides` :

```json
"overrides": {
  "postcss": "^8.5.14"
}
```

Après modification d’un `override` :

```bash
cd apps/frontend
npm install
npm audit --audit-level=moderate
```

### 1.2 SAST — Semgrep

Outil : [Semgrep](https://semgrep.dev) (OSS).

```bash
semgrep scan --config=auto
```

Objectif : **0 finding**.

Si un finding est un faux positif documenté, il peut être supprimé avec un commentaire `// nosemgrep: <rule-id>` juste au-dessus de la ligne concernée, **accompagné d’une justification**.

Exemple dans `apps/backend/src/transport/gtfs-parser.service.ts` :

```typescript
// nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
const filePath = path.join(extractedDir, safeName);
```

Justification : le nom de fichier est issu d’un `Set` de noms GTFS autorisés, passé par `path.basename`, puis on vérifie que le chemin résolu reste dans `extractedDir`.

## 2. Supply-chain — CI/CD

### 2.1 Épinglage des actions GitHub

Toutes les actions tierces utilisées dans `.github/workflows/ci.yml` et `.github/workflows/deploy.yml` sont épinglées à un **SHA de commit** complet, pas à un tag mutable.

| Action | Version tag | SHA de commit |
|---|---|---|
| `actions/checkout` | v4.2.2 | `11bd71901bbe5b1630ceea73d27597364c9af683` |
| `actions/setup-node` | v4.4.0 | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `actions/upload-artifact` | v4.6.2 | `ea165f8d65b6e75b540449e92b4886f43607fa02` |
| `appleboy/ssh-action` | v1.2.2 | `2ead5e36573f08b82fbfce1504f1a4b05a647c6f` |

Format YAML utilisé :

```yaml
# actions/checkout v4.2.2
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
```

Pour vérifier un SHA :

```bash
curl -s https://api.github.com/repos/actions/checkout/commits/v4.2.2 | jq -r '.sha'
```

### 2.2 Gate de déploiement

Le déploiement production est protégé par l’environnement GitHub `prod` configuré avec **required reviewers**. Le workflow `deploy.yml` ne s’exécute donc pas sans validation humaine.

### 2.3 Secrets

Les secrets (SSH, VAPID keys, JWT secret, PRIM API key) sont stockés dans **GitHub Secrets** et injectés via `${{ secrets.XXX }}`. Ils ne sont jamais commités.

## 3. Containerisation

### 3.1 Exécution non-root

Les images Docker backend et frontend créent un utilisateur dédié et tournent avec celui-ci :

- Backend : utilisateur `nodejs` (uid 1001 / gid 1001)
- Frontend : utilisateur `nextjs` (uid 1001 / gid 1001)

Les `COPY` utilisent `--chown=<user>:<group>` pour que les fichiers appartiennent à l’utilisateur final.

Exemple backend (`apps/backend/Dockerfile`) :

```dockerfile
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nodejs
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
RUN npm ci --only=production
USER nodejs
EXPOSE 4000
CMD ["node", "dist/main.js"]
```

## 4. Reverse proxy — Nginx

Fichiers : `docker/nginx.conf` (prod) et `docker/nginx-dev.conf` (local).

### 4.1 Prod — `docker/nginx.conf`

- `server_name urbanflow-mobility.fr www.urbanflow-mobility.fr` (pas de catch-all `_`).
- Redirection HTTP → HTTPS avec `Host` explicite (`return 301 https://urbanflow-mobility.fr$request_uri`).
- **Suppression du forwarding `Upgrade`/`Connection`** sur le frontend en production pour éviter le H2C smuggling.
- En-têtes de sécurité :
  - `Strict-Transport-Security` (HSTS)
  - `Content-Security-Policy`
  - `X-Frame-Options` / `frame-ancestors 'none'`
- Rate limiting différencié :
  - `/api/auth/login` et `/api/auth/register` : burst=3
  - `/api/` : burst=20

### 4.2 Dev — `docker/nginx-dev.conf`

`proxy_set_header Host localhost;` explicite pour éviter le Host header spoofing en local.

## 5. Application backend

### 5.1 Path traversal — GTFS

Fichier : `apps/backend/src/transport/gtfs-parser.service.ts`.

Défense en profondeur dans `streamCopy()` :

1. **Whitelisting** : `fileName` doit appartenir à `ALLOWED_GTFS_FILES`.
2. **`path.basename(fileName)`** : élimine toute composante de répertoire.
3. **Vérification résolue** : `path.resolve(filePath).startsWith(resolvedDir + path.sep)`.

### 5.2 Auth / admin

- JWT dans cookies `httpOnly`.
- RBAC via `RolesGuard`.
- Endpoint admin `GET /api/admin/trips` utilise `@Query('limit')` / `@Query('offset')` (pas `@Body()` sur un GET).

### 5.3 Notifications push

Les notifications GTFS-RT ne sont envoyées que :

- aux utilisateurs ayant `notificationsEnabled = true`,
- et qui possèdent un favori dont le mode correspond à la ligne perturbée.

Suppression de la méthode `notifyUsersForLine` qui poussait à tous les abonnés.

## 6. Application frontend

### 6.1 Sanitization des entrées / sorties

Exemple dans `apps/frontend/src/app/page.tsx` :

```typescript
onClick={() => router.push(`/search?mode=${encodeURIComponent(trip.mode.toLowerCase().replace(/['\s]/g, ""))}`)}
```

- Regex globale pour retirer quotes et espaces.
- `encodeURIComponent` avant insertion dans l’URL.

### 6.2 PWA / Service Worker

La bannière de mise à jour PWA est affichée uniquement lorsqu’un `controllerchange` détecte qu’un controller existant a changé, évitant les faux positifs au premier chargement.

## 7. Vérifications avant release

Avant chaque merge sur `main`, la CI exécute :

1. `npm audit --audit-level=moderate` sur backend et frontend.
2. `semgrep scan --config=auto` (0 finding).
3. Lint bloquant (`eslint --max-warnings 0`).
4. Tests backend (187 tests) + e2e.
5. Tests frontend (Jest + RTL).
6. Build production des deux apps.

## 8. Contacts / responsabilités

- Pipeline CI/CD : mainteneur principal + review obligatoire via environnement `prod`.
- Audits dépendances/SAST : à relancer à chaque grosse montée de version.
- Signalement d’un incident : ouvrir une issue GitHub avec le label `security`.

---

*Dernière mise à jour : 2026-07-13 — audit de sécurité SAST + dépendances + Docker + nginx + GitHub Actions.*
