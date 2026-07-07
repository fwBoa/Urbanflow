# Déploiement Urban Flow Mobility sur OVHcloud VPS

Guide de déploiement sur un **VPS OVHcloud** avec Ubuntu 24.04 LTS, Docker Compose, Nginx et Let’s Encrypt.
OVHcloud est un hébergeur français : facturation à l’heure, sans engagement, et données situées en Europe.

---

## 1. Prérequis

- Compte OVHcloud avec un moyen de paiement enregistré.
- Nom de domaine pointant vers l’IP du VPS (ex. `urbanflow.app`).
- Ports ouverts : **22 (SSH)**, **80 (HTTP)** et **443 (HTTPS)**.

---

## 2. Créer le VPS OVHcloud

1. Se connecter à l’**espace client OVHcloud** : https://www.ovh.com/manager/
2. Aller dans **Bare Metal Cloud → Serveurs virtuels privés (VPS)**.
3. Cliquer sur **Commander un VPS**.
4. Choisir :
   - **Localisation** : France (Gravelines / Roubaix / Strasbourg) pour héberger les données en France.
   - **Système d’exploitation** : Ubuntu 24.04 LTS.
   - **Offre** : minimum 1 vCPU / 2 Go RAM / 20 Go SSD (suffisant pour démarrer).
5. Choisir la **facturation à l’heure** (pas d’engagement).
6. Ajouter une **clé SSH** (recommandé) ou recevoir le mot de passe root par email.
7. Valider et attendre le provisionnement (quelques minutes).

> Le prix indicatif pour un VPS Starter 1 vCPU / 2 Go RAM est d’environ **0,011 €/heure**, soit ~ **8 €/mois**.

---

## 3. Se connecter au VPS

```bash
ssh ubuntu@IP_DU_VPS
# ou, si tu as reçu un mot de passe root :
ssh root@IP_DU_VPS
```

Si tu utilises l’utilisateur `ubuntu`, passer root ou utiliser `sudo` pour les commandes administrateur.

---

## 4. Installer Docker et Git

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git curl
sudo usermod -aG docker $USER
```

Se déconnecter puis se reconnecter pour que le groupe Docker soit actif :

```bash
exit
ssh ubuntu@IP_DU_VPS
```

Vérifier l’installation :

```bash
docker --version
docker compose version
```

---

## 5. Cloner le projet

```bash
git clone https://github.com/fwBoa/Urbanflow.git /opt/urbanflow
cd /opt/urbanflow
```

---

## 6. Configurer l’environnement de production

```bash
cp docker/.env.production.example docker/.env
nano docker/.env
```

Variables obligatoires à renseigner :

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

## 7. Configurer les certificats TLS (Let’s Encrypt)

### 7.1 Installer Certbot

```bash
sudo apt install -y certbot
```

### 7.2 Obtenir les certificats

```bash
sudo certbot certonly --standalone -d ton-domaine.com -d www.ton-domaine.com
```

Suivre les instructions. Certbot crée les fichiers dans `/etc/letsencrypt/live/ton-domaine.com/`.

### 7.3 Les copier dans le projet

```bash
sudo cp /etc/letsencrypt/live/ton-domaine.com/fullchain.pem /opt/urbanflow/docker/certs/fullchain.pem
sudo cp /etc/letsencrypt/live/ton-domaine.com/privkey.pem /opt/urbanflow/docker/certs/privkey.pem
sudo chown $USER:$USER /opt/urbanflow/docker/certs/*.pem
```

### 7.4 Renouvellement automatique

OVHcloud ne bloque pas le port 80, donc le renouvellement standard fonctionne. Ajouter une tâche cron :

```bash
sudo crontab -e
```

Ligne à ajouter :

```cron
0 3 * * * certbot renew --quiet --deploy-hook 'cp /etc/letsencrypt/live/ton-domaine.com/fullchain.pem /opt/urbanflow/docker/certs/fullchain.pem && cp /etc/letsencrypt/live/ton-domaine.com/privkey.pem /opt/urbanflow/docker/certs/privkey.pem && cd /opt/urbanflow/docker && docker compose exec nginx nginx -s reload'
```

---

## 8. Déployer l’application

```bash
cd /opt/urbanflow
./scripts/deploy.sh prod
```

Le script effectue les vérifications suivantes :

- présence de `docker/.env` ;
- `JWT_SECRET` différent de `change_me_in_production` ;
- présence des certificats TLS.

Puis il build les images et démarre les conteneurs.

---

## 9. Vérifier le déploiement

```bash
curl https://ton-domaine.com/api/health
```

Réponse attendue :

```json
{"status":"ok","timestamp":"2026-07-07T..."}
```

Vérifier les services :

```bash
cd /opt/urbanflow/docker && docker compose ps
```

---

## 10. Créer le compte administrateur

### Identifiants par défaut

| Champ | Valeur |
| --- | --- |
| Email | `admin@urbanflow.app` |
| Mot de passe | `admin123` |
| Rôle | `admin` |

> ⚠️ **Changez ce mot de passe immédiatement après la première connexion.**

### En production

Si `ts-node` n’est pas disponible dans l’image de production, promouvoir un utilisateur existant via psql :

```bash
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

Ou, plus simple, inscrire un utilisateur lambda via le frontend puis le promouvoir :

```bash
PGPASSWORD=$POSTGRES_PASSWORD docker exec -i urbanflow-db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "UPDATE users SET role='admin' WHERE email='ton-email@exemple.com';"
```

---

## 11. Post-déploiement

1. **Tester le frontend** : `https://ton-domaine.com`
2. **Tester l’API** : `https://ton-domaine.com/api/health`
3. **Tester le mode offline** : activer le mode avion après avoir chargé la page.
4. **Tester le broadcast admin** : se connecter en admin, aller sur `/admin`, envoyer une notification.
5. **Configurer un backup automatique** de la base de données :

```bash
# Sauvegarde quotidienne à 2h du matin
sudo crontab -e
```

Ligne à ajouter :

```cron
0 2 * * * cd /opt/urbanflow && ./scripts/backup-db.sh /opt/urbanflow/backups >> /var/log/urbanflow-backup.log 2>&1
```

Créer le dossier de logs :

```bash
sudo touch /var/log/urbanflow-backup.log
sudo chown $USER:$USER /var/log/urbanflow-backup.log
```

---

## 12. Sécurité et firewall OVHcloud

Par défaut, OVHcloud ne bloque pas les ports 80/443, mais vérifie le firewall réseau dans l’espace client :

1. Espace client OVHcloud → VPS → **Sécurité**.
2. S’assurer que les ports **22, 80, 443** sont autorisés en entrée.
3. Vérifier aussi le firewall local (`ufw`) :

```bash
sudo ufw status
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 13. Dépannage rapide

| Problème | Cause probable | Solution |
| --- | --- | --- |
| `502 Bad Gateway` | Backend non démarré | `docker compose logs backend --tail=50` |
| Certificat invalide | Certificats `localhost` en prod | Relancer Certbot |
| `401 Unauthorized` | Mauvais JWT secret | Vérifier `JWT_SECRET` et se reconnecter |
| Frontend appelle `localhost:4000` | `NEXT_PUBLIC_API_URL` non vide | Laisser vide en production |
| Port 443 bloqué | Firewall OVHcloud / ufw | Vérifier règles de sécurité |
| GTFS absent | Base non initialisée | Vérifier `docker/init-db.sql` et logs postgres |

---

## 14. Références

- Dossier Technique : [`Dossier_Technique_Urban_Flow_Mobility.md`](../Dossier_Technique_Urban_Flow_Mobility.md)
- Checklist production : [`docs/prod-verification.md`](prod-verification.md)
- Template d’environnement : [`docker/.env.production.example`](../docker/.env.production.example)
- Script de déploiement : [`scripts/deploy.sh`](../scripts/deploy.sh)
- Guide alternatif Hostinger : [`docs/deploiement-hostinger.md`](deploiement-hostinger.md)
