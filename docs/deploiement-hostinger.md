# Déploiement Urban Flow Mobility sur VPS Hostinger

Ce guide détaille le déploiement de la solution sur un VPS Hostinger avec Ubuntu 24.04 LTS, Docker Compose, Nginx et Let’s Encrypt.

---

## 1. Prérequis

- VPS Hostinger avec **Ubuntu 24.04 LTS**.
- Accès SSH root ou sudo.
- **Docker Engine ≥ 25** et **Docker Compose ≥ 2.20** installés.
- Nom de domaine pointant vers l’IP du VPS (ex. `urbanflow.app`).
- Ports ouverts : **22 (SSH)**, **80 (HTTP)** et **443 (HTTPS)**.

---

## 2. Identifiants administrateur par défaut

Le script `apps/backend/src/scripts/seed-admin.ts` crée le compte administrateur initial :

| Champ | Valeur |
| --- | --- |
| Email | `admin@urbanflow.app` |
| Mot de passe | `admin123` |
| Rôle | `admin` |

> ⚠️ **Changez ce mot de passe immédiatement en production.**

### Créer / recréer l’admin en local

```bash
cd apps/backend
DATABASE_URL=postgresql://urbanflow:urbanflow_dev@localhost:5432/urbanflow npx ts-node src/scripts/seed-admin.ts
```

### Créer l’admin en production (si `ts-node` n’est pas dans l’image)

```bash
# 1. Se connecter au conteneur PostgreSQL
PGPASSWORD=$POSTGRES_PASSWORD docker exec -i urbanflow-db psql -U $POSTGRES_USER -d $POSTGRES_DB <<SQL
UPDATE users SET role='admin' WHERE email='admin@urbanflow.app';
SQL

# 2. Ou insérer un nouvel utilisateur admin
PGPASSWORD=$POSTGRES_PASSWORD docker exec -i urbanflow-db psql -U $POSTGRES_USER -d $POSTGRES_DB <<SQL
INSERT INTO users (
  id, email, "passwordHash", "displayName", role, avatar,
  "preferredMode", "accessibilityNeeds", "consentGeoloc",
  "consentCookies", "consentHistory", "consentDate", "consentVersion",
  "notificationsEnabled", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(), 'admin@urbanflow.app',
  '\$2b\$12\$abcdefghijklmnopqrstuvwx', 'Administrateur', 'admin', '👤',
  'rapide', false, true, true, true, NOW(), '1.0', true, NOW(), NOW()
)
ON CONFLICT (email) DO UPDATE SET role='admin';
SQL
```

---

## 3. Installation sur le VPS

### 3.1 Se connecter au VPS

```bash
ssh root@TON_IP_VPS
```

### 3.2 Installer Docker et Git

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git curl
sudo usermod -aG docker $USER
```

Se déconnecter puis se reconnecter pour que le groupe Docker soit actif.

### 3.3 Cloner le dépôt

```bash
git clone https://github.com/fwBoa/Urbanflow.git /opt/urbanflow
cd /opt/urbanflow
```

### 3.4 Créer l’environnement de production

```bash
cp docker/.env.production.example docker/.env
nano docker/.env
```

Variables à renseigner obligatoirement :

| Variable | Description |
| --- | --- |
| `JWT_SECRET` | Chaîne aléatoire forte (64+ caractères). Le déploiement bloque si c’est la valeur par défaut. |
| `POSTGRES_PASSWORD` | Mot de passe fort pour PostgreSQL. |
| `PRIM_API_KEY` | Clé API PRIM Île-de-France Mobilités. |
| `VAPID_PUBLIC_KEY` | Clé publique VAPID (Web Push). |
| `VAPID_PRIVATE_KEY` | Clé privée VAPID. |
| `VAPID_SUBJECT` | Adresse mail ou URL (ex. `mailto:contact@urbanflow.app`). |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Identique à `VAPID_PUBLIC_KEY`. |
| `DATABASE_URL` | `postgresql://urbanflow:<POSTGRES_PASSWORD>@postgres:5432/urbanflow` |
| `CORS_ORIGIN` | `https://ton-domaine.com` |
| `NEXT_PUBLIC_API_URL` | Laisser **vide** en production. |

Générer une paire VAPID si besoin :

```bash
npx web-push generate-vapid-keys
```

---

## 4. Certificats TLS (Let’s Encrypt)

### 4.1 Obtenir les certificats

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d ton-domaine.com -d www.ton-domaine.com
```

### 4.2 Les copier dans le projet

```bash
sudo cp /etc/letsencrypt/live/ton-domaine.com/fullchain.pem docker/certs/fullchain.pem
sudo cp /etc/letsencrypt/live/ton-domaine.com/privkey.pem docker/certs/privkey.pem
sudo chown $USER:$USER docker/certs/*.pem
```

### 4.3 Renouvellement automatique

Ajouter dans la crontab :

```bash
sudo crontab -e
```

Ligne à ajouter :

```cron
0 3 * * * certbot renew --quiet --deploy-hook 'cp /etc/letsencrypt/live/ton-domaine.com/fullchain.pem /opt/urbanflow/docker/certs/fullchain.pem && cp /etc/letsencrypt/live/ton-domaine.com/privkey.pem /opt/urbanflow/docker/certs/privkey.pem && cd /opt/urbanflow/docker && docker compose exec nginx nginx -s reload'
```

---

## 5. Déployer l’application

```bash
cd /opt/urbanflow
./scripts/deploy.sh prod
```

Le script vérifie :

- la présence de `docker/.env` ;
- que `JWT_SECRET` n’est pas `change_me_in_production` ;
- la présence des certificats TLS.

---

## 6. Vérifier le déploiement

```bash
curl https://ton-domaine.com/api/health
```

Réponse attendue :

```json
{"status":"ok","timestamp":"2026-07-07T..."}
```

Puis vérifier les services :

```bash
cd /opt/urbanflow/docker && docker compose ps
```

---

## 7. Post-déploiement

1. **Créer l’administrateur** via `seed-admin.ts` (voir section 2).
2. **Changer le mot de passe admin** immédiatement.
3. **Tester le broadcast notification** depuis `/admin`.
4. **Configurer un backup automatique** de la base :

```bash
# Sauvegarde quotidienne à 2h du matin
0 2 * * * cd /opt/urbanflow && ./scripts/backup-db.sh /opt/urbanflow/backups >> /var/log/urbanflow-backup.log 2>&1
```

---

## 8. Dépannage rapide

| Problème | Cause probable | Solution |
| --- | --- | --- |
| `502 Bad Gateway` | Backend non démarré | `docker compose logs backend --tail=50` |
| Certificat invalide | Certificats `localhost` en prod | Regénérer avec Let’s Encrypt |
| `401 Unauthorized` | Mauvais JWT secret / cookie expiré | Vérifier `JWT_SECRET` et se reconnecter |
| Frontend ne charge pas | `NEXT_PUBLIC_API_URL` mal configuré | Laisser vide en production |
| GTFS absent | Base non initialisée | Vérifier `docker/init-db.sql` et logs postgres |

---

## 9. Références

- Dossier Technique : [`Dossier_Technique_Urban_Flow_Mobility.md`](../Dossier_Technique_Urban_Flow_Mobility.md)
- Checklist production : [`prod-verification.md`](prod-verification.md)
- Script de déploiement : [`scripts/deploy.sh`](../scripts/deploy.sh)
- Template d’environnement : [`docker/.env.production.example`](../docker/.env.production.example)
