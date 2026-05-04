# Articler

AI-powered long-form article writing assistant.

## Quick start

```bash
cp .env.example .env
# Fill in OPENROUTER_API_KEY and AUTH_SECRET in .env
docker compose up
```

The app is available at http://localhost:18080.

## Local development

```bash
pnpm install
pnpm dev          # Next.js dev server at http://localhost:3000
```

## Database

```bash
docker compose up -d db          # start Postgres on port 13036
pnpm db:migrate                  # apply migrations
```

## Commands

| Command             | Description                      |
| ------------------- | -------------------------------- |
| `pnpm dev`          | Start Next.js dev server         |
| `pnpm build`        | Production build                 |
| `pnpm lint`         | ESLint                           |
| `pnpm typecheck`    | TypeScript type check            |
| `pnpm test`         | Vitest unit tests                |
| `pnpm format`       | Prettier (write)                 |
| `pnpm format:check` | Prettier (check only)            |
| `pnpm db:generate`  | Generate Drizzle migrations      |
| `pnpm db:migrate`   | Apply migrations to DATABASE_URL |
| `pnpm create-user`  | Seed a user (`<email> [--password=X]`) |

## Required environment variables

See `.env.example` for the full list.

| Variable             | Description                         |
| -------------------- | ----------------------------------- |
| `DATABASE_URL`         | Postgres connection string                            |
| `OPENROUTER_API_KEY`   | OpenRouter API key for LLM access                     |
| `AUTH_SECRET`          | Auth.js session secret (random str)                   |
| `AUTH_URL`             | Public URL of the app (used by Auth.js callbacks)     |
| `ALLOW_REGISTRATION`   | `true` to allow self-serve `/register`. Defaults: `true` in dev, `false` in production |

## Deploying

Production runs the published image from GHCR
(`ghcr.io/lexuss1979/articler:latest`) on a VPS, with Postgres in the
same compose stack. The web container binds to `127.0.0.1:3000` only —
the host's existing nginx terminates TLS (Let's Encrypt via certbot) and
reverse-proxies to it. `GET /api/health` returns 200 + JSON `{ok, now}`
without touching the DB — safe as a healthcheck.

### One-time VPS bootstrap

The deploy pipeline runs as a non-root `deploy` user that GitHub Actions
SSHes into. You generate a fresh SSH keypair specifically for this — the
private half goes into a GitHub Secret, the public half into the VPS.

#### Step 1 — generate the deploy keypair (on your laptop)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/articler_deploy -C "github-actions-deploy" -N ""
```

This creates two files:

- `~/.ssh/articler_deploy`     — **private** key (goes into GitHub Secret)
- `~/.ssh/articler_deploy.pub` — **public** key (goes onto the VPS)

Print the public key now — you'll paste it in step 2:

```bash
cat ~/.ssh/articler_deploy.pub
```

#### Step 2 — VPS bootstrap (as `root` on the VPS)

```bash
# Create the deploy user and put it in the docker group
adduser --disabled-password --gecos '' deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh

# Paste the contents of articler_deploy.pub from step 1 into authorized_keys
nano /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys

# 80/443 should already be open (nginx is using them) — nothing to do.

# Create the deploy directory owned by the deploy user
install -d -o deploy -g deploy /srv/articler
```

#### Step 3 — verify SSH works (from your laptop)

```bash
ssh -i ~/.ssh/articler_deploy deploy@<VPS_IP> 'docker version && id'
```

If this lands in the `deploy` user shell and shows Docker, the keypair
is good. If it fails, fix it now — GitHub Actions will use the same key.

#### Step 4 — seed `/srv/articler` (as `deploy` on the VPS)

```bash
sudo -iu deploy
cd /srv/articler

# Drop in the two config files from the repo (scp from your laptop):
#   - docker-compose.prod.yml      → /srv/articler/docker-compose.yml
#   - .env.production.example      → /srv/articler/.env (then fill values)

# Generate a secret for AUTH_SECRET
openssl rand -base64 32
```

#### Step 5 — point nginx at the web container (as `root` on the VPS)

The host already runs nginx on 80/443. Add one server block for the
articler domain — reference config is `deploy/nginx-articler.conf`
in the repo. Scp it to the VPS first.

```bash
# Copy the reference config into nginx (file scp'd to /tmp from your laptop)
mv /tmp/nginx-articler.conf /etc/nginx/sites-available/articler.lexdev.ru
ln -s /etc/nginx/sites-available/articler.lexdev.ru /etc/nginx/sites-enabled/

# Sanity check + reload
nginx -t && systemctl reload nginx

# Issue the Let's Encrypt cert (rewrites the server block to add TLS).
# DNS A-record for articler.lexdev.ru must already point at this VPS —
# the HTTP-01 challenge resolves the domain to fetch the cert.
certbot --nginx -d articler.lexdev.ru
```

### GitHub repo secrets

Set these in `Settings → Secrets and variables → Actions`:

| Secret             | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| `DEPLOY_SSH_HOST`  | VPS hostname or IP                                     |
| `DEPLOY_SSH_USER`  | `deploy`                                               |
| `DEPLOY_SSH_KEY`   | Full body of `~/.ssh/articler_deploy` (the **private** key from bootstrap step 1, including the `-----BEGIN ... PRIVATE KEY-----` header/footer lines) |

`GITHUB_TOKEN` is provided automatically and is used for GHCR auth — no
secret to configure.

### How a deploy runs

`.github/workflows/deploy.yml` triggers on push to `master`:

1. Build the Dockerfile in GHA, push to GHCR with `:latest` and `:<sha>` tags.
2. SSH to the VPS as `deploy` and run, in `/srv/articler`:
   - `docker compose pull web`
   - `docker compose run --rm web node scripts/migrate.mjs` (Drizzle migrations)
   - `docker compose up -d` (web + db + caddy)

You can also trigger it manually from the Actions tab (`workflow_dispatch`).

### First users

After the first successful deploy, seed users from the VPS:

```bash
# On the VPS, as deploy
cd /srv/articler
docker compose exec web node scripts/create-user.mjs user1@mail.com
# Prints "created: user1@mail.com" + "password: <16 chars>".
# Pass --password=<your-pw> to skip the random one.
# Idempotent: re-running prints "already exists" and exits 0.
```
