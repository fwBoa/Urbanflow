# TLS certificates

Place nginx TLS certs here before deploying the `production` profile:

- `fullchain.pem` — certificate chain
- `privkey.pem`  — private key (chmod 600)

These files are **git-ignored** (see `.gitignore`) — never commit real certs.

## Local / staging testing

Generate throwaway self-signed certs (for testing the production stack only):

```bash
./scripts/generate-certs.sh            # CN=localhost
./scripts/generate-certs.sh urbanflow.local
```

## Production

Use real certs (browsers must trust them), e.g. Let's Encrypt:

```bash
certbot certonly --webroot -w /var/www/certbot -d your.domain \
  && cp /etc/letsencrypt/live/your.domain/fullchain.pem ./fullchain.pem \
  && cp /etc/letsencrypt/live/your.domain/privkey.pem   ./privkey.pem
```

`deploy.sh prod` refuses to start if these files are missing.