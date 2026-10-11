# Deploy Lookuvi

Follow the steps in order. Each step says what to create and what “done” looks like. Diagram and sizing notes are in `docs/ARCHITECTURE.md`.

Demo passwords in `prisma/seed.ts` are for `npm run seed` on a laptop. The production container refuses `SEED_DEMO`.

## 1. Create the accounts

Do this before the server exists.

1. A DigitalOcean account. You will create one droplet in **Bangalore** (`blr1`).
2. A domain name you control (for example `lookuvi.in`).
3. A Cloudflare R2 bucket (or S3 in `ap-south-1`). Block public access. Add a lifecycle rule that deletes objects under `generations/` after 2 days. Keep `backups/` longer.
4. An email sender: a [Resend](https://resend.com) API key **or** an SMTP URL. Verify the domain so `EMAIL_FROM` is allowed to send.
5. Optional: an MSG91 account, an auth key, and an OTP template whose body contains `##OTP##`. Phone login stays off until this exists.
6. Optional: a Sentry project if you want error reports.
7. A GitHub repository secret set, added later in step 10: `SSH_HOST`, `SSH_USER`, `SSH_KEY`. `SSH_PORT` only if SSH is not on port 22.

You do not need an OpenAI or fal key to boot. Guests get a labelled sample until you save a key on `/super/ai`.

## 2. Create the droplet

From your laptop, after `doctl auth init`:

```bash
doctl compute droplet create lookuvi \
  --region blr1 \
  --size s-2vcpu-4gb \
  --image docker-20-04 \
  --ssh-keys YOUR_SSH_KEY_FINGERPRINT
```

`s-2vcpu-4gb` is a safe start for one salon group. SSH in as root. The deploy script installs Docker if it is missing. It does not create the droplet for you.

```bash
mkdir -p /opt/lookuvi
```

## 3. Point DNS at the droplet

At your DNS host, create:

| Name | Type | Value |
|---|---|---|
| `lookuvi.example` | A | droplet IPv4 |
| `www.lookuvi.example` | A or CNAME | the same |
| `*.try.lookuvi.example` | A | the same |

Replace `lookuvi.example` with your domain. Salon sites are `https://<slug>.try.<your-domain>`.

Caddy gets a certificate per hostname (HTTP-01). It does **not** get one wildcard certificate. A real `*.try.example` wildcard needs DNS-01 and a custom Caddy image, which this repo does not ship. The ask endpoint `GET /api/caddy/ask` returns 200 only for your apex, a salon slug that exists, or a verified custom domain. Strangers do not get a certificate.

Wait until the A records resolve to the droplet before you expect a padlock.

## 4. Fill in the environment file

On the droplet:

```bash
# copy .env.production.example from this repo to /opt/lookuvi/.env.production
nano /opt/lookuvi/.env.production
```

Every variable is listed and commented in `.env.production.example`. These must be real before the app will stay up:

- `DATABASE_URL` and `DIRECT_URL` (use host `db`, the compose service)
- `AUTH_SECRET` (`openssl rand -base64 32`)
- `AUTH_TRUST_HOST=true`
- `APP_BASE_URL` starting with `https://`
- `APP_DOMAIN` and `ROOT_DOMAIN`
- `TRUST_PROXY=true`
- `AI_SPEND_CAP_INR` and `AI_SALON_SPEND_CAP_INR`
- `CRON_SECRET`
- `OBJECT_STORAGE=s3` plus `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`
- `POSTGRES_PASSWORD` and `REDIS_PASSWORD` matching the URLs
- `RESEND_API_KEY` or `SMTP_URL`, and `EMAIL_FROM`, if owners will reset passwords
- `OTP_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` if guests will get SMS codes

Leave `SEED_DEMO`, `ALLOW_DEV_MAGIC_LINK`, and `ALLOW_DEV_OTP` as `false`.

Set `AI_KEY_SALT` once, before the first provider key. Changing `AUTH_SECRET` or `AI_KEY_SALT` later makes saved keys unreadable.

## 5. Start the stack the first time

Copy these files to the droplet (the GitHub workflow does this on later deploys):

- `docker-compose.prod.yml`
- `deploy/Caddyfile`
- `deploy/backup.cron`
- `scripts/backup-postgres.sh`, `scripts/restore-postgres.sh`, `scripts/backup-object.mjs`
- `scripts/deploy/droplet.sh`

Build and push an image once (or run the GitHub workflow in step 10), then on the droplet:

```bash
cd /opt/lookuvi
export LOOKUVI_IMAGE=ghcr.io/YOUR_GITHUB_USER/lookuvi:THE_GIT_SHA
sh scripts/deploy/droplet.sh
```

The image runs as user `nextjs` (uid 1001), not root. It migrates Postgres, then `node server.js`. It does not load demo passwords. Docker’s health check calls `GET /api/health`. Compose waits on `GET /api/ready`, which checks Postgres.

Done when:

```bash
curl -fsS https://lookuvi.example/api/ready
```

returns `{"ok":true,"db":true}`.

## 6. Create the super-admin and turn on the authenticator

On the droplet, with the production `DATABASE_URL` (the compose network hostname `db` works only inside a container; from the host use a one-off container or `127.0.0.1` if you opened Postgres). Easiest:

```bash
cd /opt/lookuvi
docker compose -f docker-compose.prod.yml exec -T app \
  env SUPER_ADMIN_EMAIL="you@your-domain" SUPER_ADMIN_PASSWORD="a-long-unique-password" \
  node scripts/create-super-admin.mjs
```

The password must be at least 12 characters and must not be a demo password.

1. Open `https://<APP_BASE_URL>/login` and sign in.
2. You are sent to `/super/security` until an authenticator is on. Production requires this for the super-admin. Salon owners can turn it on from **Authenticator** in the salon menu; they are not forced.
3. Scan the QR in an authenticator app, enter the 6-digit code, and save the recovery codes. They are shown once. Each code works a single time.
4. Sign out and sign in again with the password and a fresh code.

A magic link does not skip the authenticator once it is on.

## 7. Create the first salon

On `/super`, use **New salon**. Set a name, a lowercase slug, the owner’s email, and a password of at least 12 characters. The owner can belong to more than one salon. When they do, the salon menu shows a switcher.

Open `https://<slug>.try.<ROOT_DOMAIN>` after DNS has the wildcard A record. The first visit asks Caddy for a certificate. That succeeds only if the salon exists.

## 8. Email and SMS

- Forgot password and magic link call Resend when `RESEND_API_KEY` is set, otherwise SMTP when `SMTP_URL` is set.
- If neither is set, the reset page says email is not configured. It does not pretend a message was sent.
- Phone login on the guest page is hidden, and `POST /api/v1/guest/otp` returns 503, until `OTP_PROVIDER=msg91` and both MSG91 variables are set. The code is sent to MSG91 and is not written to the log.

## 9. Retention and backups

Retention of preview files runs in two places:

- Inside the app, every 15 minutes.
- The `retention` service in `docker-compose.prod.yml`, which calls `POST /api/cron/retention` every hour with `Authorization: Bearer $CRON_SECRET`.

A DigitalOcean scheduled job can call the same URL if you prefer that to the sidecar.

Backups:

```bash
# daily at 00:30 IST, installed on the droplet
crontab /opt/lookuvi/deploy/backup.cron
# or once, by hand
cd /opt/lookuvi && ./scripts/backup-postgres.sh
```

That runs `pg_dump` in the Postgres container and uploads `backups/lookuvi-<timestamp>.dump` to the same R2 bucket.

Restore (stop the app first so nothing writes during the restore):

```bash
docker compose -f docker-compose.prod.yml stop app
./scripts/restore-postgres.sh backups/lookuvi-YYYYMMDDTHHMMSSZ.dump
docker compose -f docker-compose.prod.yml start app
```

`pg_restore --clean` drops objects that are in the dump. Take a fresh dump before you try a restore.

Also turn on the host’s disk snapshots or Postgres point-in-time recovery if the database is not the Docker volume (a managed database is better once you have more than a trial).

## 10. Later deploys from GitHub

In the GitHub repo, **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `SSH_HOST` | droplet IP or DNS |
| `SSH_USER` | `root` or a sudo user that can run Docker |
| `SSH_KEY` | private key that can SSH in |
| `SSH_PORT` | only if SSH is not 22 |

Actions → Deploy → Run workflow. It builds the image, pushes `ghcr.io/<owner>/lookuvi:<git sha>` to GHCR, copies the compose files, and runs `scripts/deploy/droplet.sh`.

The workflow does not run on push. If the SSH secrets are missing, it stops and does not deploy.

The image must be pullable by the droplet. The script logs in to GHCR with the token the workflow passes. If the package is private, that token needs `read:packages` on the server side; the workflow’s `GITHUB_TOKEN` is passed as `GHCR_TOKEN` for the login.

## 11. Check the site

1. `https://<APP_DOMAIN>/api/health` returns `{"ok":true}`.
2. `https://<APP_DOMAIN>/api/ready` returns `{"ok":true,"db":true}`.
3. Super-admin sign-in asks for an authenticator code.
4. A new salon loads on its `*.try.` host.
5. A guest preview with no provider key shows a labelled sample, not a paid generation.
6. Forgot password either sends mail or shows the not-configured message.

## 12. Headers

Production script policy is a per-request nonce plus `strict-dynamic` and `wasm-unsafe-eval`. Next.js stamps its own scripts with that nonce. MediaPipe’s vision bundle does not call `eval` or `new Function`; it compiles WASM from `/mediapipe/wasm`, which is why `wasm-unsafe-eval` is there, and it may start a `blob:` worker. `unsafe-eval` is not in the production policy. The dev server (`next dev`) still allows `unsafe-eval` because React Fast Refresh needs it.

`style-src` keeps `'unsafe-inline'` because React style attributes are not covered by a style nonce.

`/embed` only sets `frame-ancestors *` so a salon site can frame the try-on.

## 13. Roll back

1. Set `LOOKUVI_IMAGE` to the previous `ghcr.io/.../lookuvi:<sha>` and run `scripts/deploy/droplet.sh` again.
2. Migrations are forward-only. If the new image already migrated, restore the database from the dump taken before the deploy, then start the old image.
3. Wait until `GET /api/ready` is 200 before you send traffic.

## 14. Laptop without a droplet

`npm run dev` uses SQLite and does not force the authenticator. `docker compose up` (the file without `.prod`) is a production-mode container and needs `APP_BASE_URL` to be `https://` even on a laptop, because the process refuses to boot otherwise. For day-to-day work, use `npm run dev`.
