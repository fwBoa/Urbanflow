# Déploiement Urban Flow Mobility sur OVHcloud VPS

Guide de déploiement sur un **VPS OVHcloud** avec Ubuntu 24.04 LTS, Docker Compose, Nginx et Let’s Encrypt.
OVHcloud est un hébergeur français : facturation à l’heure, sans engagement, et données situées en Europe.

---

## 1. Prérequis

- Compte OVHcloud avec un moyen de paiement enregistré.
- Nom de domaine pointant vers l’IP du VPS : **`urbanflow-mobility.fr`**.
- Ports ouverts : **22 (SSH)**, **80 (HTTP)** et **443 (HTTPS)**.

---

## 2. Configurer le nom de domaine OVHcloud

Avant de déployer, faire pointer `urbanflow-mobility.fr` et `www.urbanflow-mobility.fr` vers l’IP publique du VPS.

### 2.1 Informations de ce déploiement

| Élément | Valeur |
| --- | --- |
| Domaine | `urbanflow-mobility.fr` |
| IP publique (IPv4) | `37.59.119.90` |
| Nom du VPS | `vps-e5cdfc52.vps.ovh.net` |
| Utilisateur SSH | `ubuntu` |

### 2.2 Modifier la zone DNS dans l’espace client OVHcloud

1. Se connecter sur [https://www.ovh.com/manager/](https://www.ovh.com/manager/).
2. Aller dans **Web Cloud → Domaines → urbanflow-mobility.fr → Zone DNS**.
3. Supprimer ou modifier les enregistrements de type **A** pointant vers `@` et `www`.
4. Ajouter :

| Type | Sous-domaine | Cible |
| --- | --- | --- |
| A | `@` | `37.59.119.90` |
| A | `www` | `37.59.119.90` |

5. Sauvegarder la zone DNS.

### 2.3 Vérifier la propagation

```bash
dig urbanflow-mobility.fr A +short
dig www.urbanflow-mobility.fr A +short
```

Les deux commandes doivent retourner `37.59.119.90`. Le délai de propagation est généralement de 5 à 30 minutes.

---

## 3. Créer le VPS OVHcloud

1. Se connecter à l’**espace client OVHcloud** : https://www.ovh.com/manager/
2. Aller dans **Bare Metal Cloud → Serveurs virtuels privés (VPS)**.
3. Cliquer sur **Commander un VPS**.
4. Choisir :
   - **Localisation** : France (Gravelines / Roubaix / Strasbourg) pour héberger les données en France.
   - **Système d’exploitation** : Ubuntu 24.04 LTS.
   - **Offre retenue pour ce projet** : **VPS-2 2027**
     - 4 vCore / 8 Go RAM / 75 Go SSD NVMe
     - Localisation : **France — Gravelines**
     - Facturation : **1 mois**, sans engagement
     - Backup : **Automated Backup Standard** (offert en promotion)
     - Coût : **8,49 €/mois**
5. Choisir la **facturation mensuelle** (pas d’engagement).
6. Ajouter une **clé SSH** (recommandé) ou recevoir le mot de passe root par email.
7. Valider et attendre le provisionnement (quelques minutes).

> Le VPS choisi pour ce déploiement : `vps-e5cdfc52.vps.ovh.net`.

---

## 4. Se connecter au VPS

```bash
ssh ubuntu@37.59.119.90
# ou, si tu as reçu un mot de passe root :
ssh root@37.59.119.90
```

Si tu utilises l’utilisateur `ubuntu`, passer root ou utiliser `sudo` pour les commandes administrateur.

---

## 5. Installer Docker et Git

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git curl
sudo usermod -aG docker $USER
```

Se déconnecter puis se reconnecter pour que le groupe Docker soit actif :

```bash
exit
ssh ubuntu@37.59.119.90
```

Vérifier l’installation :

```bash
docker --version
docker compose version
```

---

## 6. Cloner le projet

```bash
git clone https://github.com/fwBoa/Urbanflow.git /opt/urbanflow
cd /opt/urbanflow
```

---

## 7. Configurer l’environnement de production

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
| `VAPID_SUBJECT` | `mailto:contact@urbanflow-mobility.fr` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Identique à `VAPID_PUBLIC_KEY`. |
| `DATABASE_URL` | `postgresql://urbanflow:<POSTGRES_PASSWORD>@postgres:5432/urbanflow` |
| `CORS_ORIGIN` | `https://urbanflow-mobility.fr` |
| `NEXT_PUBLIC_API_URL` | Laisser **vide** en production. |

Générer une paire VAPID si besoin :

```bash
npx web-push generate-vapid-keys
```

---

## 8. Configurer les certificats TLS (Let’s Encrypt)

### 8.1 Installer Certbot

```bash
sudo apt install -y certbot
```

### 8.2 Obtenir les certificats

```bash
sudo certbot certonly --standalone -d urbanflow-mobility.fr -d www.urbanflow-mobility.fr
```

Suivre les instructions. Certbot crée les fichiers dans `/etc/letsencrypt/live/urbanflow-mobility.fr/`.

### 8.3 Les copier dans le projet

```bash
sudo cp /etc/letsencrypt/live/urbanflow-mobility.fr/fullchain.pem /opt/urbanflow/docker/certs/fullchain.pem
sudo cp /etc/letsencrypt/live/urbanflow-mobility.fr/privkey.pem /opt/urbanflow/docker/certs/privkey.pem
sudo chown $USER:$USER /opt/urbanflow/docker/certs/*.pem
```

### 8.4 Renouvellement automatique

OVHcloud ne bloque pas le port 80, donc le renouvellement standard fonctionne. Ajouter une tâche cron :

```bash
sudo crontab -e
```

Ligne à ajouter :

```cron
0 3 * * * certbot renew --quiet --deploy-hook 'cp /etc/letsencrypt/live/urbanflow-mobility.fr/fullchain.pem /opt/urbanflow/docker/certs/fullchain.pem && cp /etc/letsencrypt/live/urbanflow-mobility.fr/privkey.pem /opt/urbanflow/docker/certs/privkey.pem && cd /opt/urbanflow/docker && docker compose exec nginx nginx -s reload'
```

---

## 9. Déployer l’application

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

## 10. Déploiement continu (GitHub Actions)

Le fichier `.github/workflows/ci.yml` contient un job `deploy` qui déploie automatiquement sur le VPS après chaque push sur `main`, une fois les tests passés.

### 10.1 Générer une clé SSH dédiée

Sur la machine locale :

```bash
ssh-keygen -t ed25519 -C "github-actions@urbanflow-mobility.fr" -f ~/.ssh/urbanflow_github_actions
```

Ne pas mettre de passphrase.

### 10.2 Ajouter la clé publique sur le VPS

```bash
ssh-copy-id -i ~/.ssh/urbanflow_github_actions.pub ubuntu@37.59.119.90
```

Ou, manuellement :

```bash
cat ~/.ssh/urbanflow_github_actions.pub | ssh ubuntu@37.59.119.90 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

### 10.3 Configurer les secrets GitHub

Dans le dépôt GitHub, aller dans **Settings → Secrets and variables → Actions → New repository secret** :

| Nom | Valeur |
| --- | --- |
| `VPS_HOST` | `37.59.119.90` |
| `VPS_USER` | `ubuntu` |
| `VPS_DEPLOY_PATH` | `/opt/urbanflow` |
| `VPS_SSH_KEY` | Contenu complet de `~/.ssh/urbanflow_github_actions` (clé privée) |

### 10.4 Vérifier le déploiement automatique

Après le prochain push sur `main`, la CI exécutera automatiquement :

```bash
cd /opt/urbanflow && ./scripts/deploy.sh prod
```

Vérifier dans l’onglet **Actions** du repo que le job `Déploiement automatique sur VPS` est vert.

---

## 11. Vérifier le déploiement

```bash
curl https://urbanflow-mobility.fr/api/health
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

## 12. Créer le compte administrateur

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

1. **Tester le frontend** : `https://urbanflow-mobility.fr`
2. **Tester l’API** : `https://urbanflow-mobility.fr/api/health`
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
