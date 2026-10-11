# Deploy Lookuvi

Production is stateless Next.js containers, Postgres, and private object storage. Details and the diagram are in `docs/ARCHITECTURE.md`. This file is the first deploy.

Do not set `SEED_DEMO`. The container refuses it. Demo passwords in `prisma/seed.ts` are for `npm run seed` on a development SQLite file.

## 1. Accounts

- A Mumbai compute target: a VM with Docker, or Fly.io region `bom`, or Railway with the region closest to Mumbai.
- Postgres 16 in Mumbai with point-in-time recovery. Create a database and a user. Note a **direct** URL and, if you use Neon or PgBouncer, a **pooled** URL.
- A private Cloudflare R2 or S3 bucket. Block public access. Add a lifecycle rule that expires objects under `generations/` after 2 days.
- Redis if you will run more than one app container. One container can use the Postgres rate-limit table instead.
- A DNS name and a TLS certificate on the load balancer or Cloudflare.
- An SMTP URL if salon owners will reset passwords by email. Without it, reset links are not sent in production. You can still set passwords with the admin script.

## 2. Image

From a clean tree, on the build machine:

```bash
docker build -t lookuvi:$(git rev-parse --short HEAD) .
```

The image runs `scripts/prepare-prisma.mjs`, `prisma generate`, and `prisma migrate deploy` before `node server.js`. It does not seed users.

## 3. Environment

Set these on the host. The process exits before it serves traffic if a required value is missing (`src/instrumentation.ts`).

Required:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Pooled Postgres URL used by the running app |
| `DIRECT_URL` | Direct Postgres URL used only by `prisma migrate deploy`. Omit if `DATABASE_URL` is already direct. |
| `AUTH_SECRET` | `openssl rand -base64 32` (at least 16 characters). Do not rotate it after AI keys are saved, or set `AI_KEY_SALT` first and keep that stable instead. |
| `AUTH_TRUST_HOST` | `true` |
| `APP_BASE_URL` | Public `https://` origin, no trailing slash |
| `TRUST_PROXY` | `true`. The load balancer must overwrite `X-Forwarded-For` and send `X-Forwarded-Host`. Allow traffic only from that proxy. |
| `AI_SPEND_CAP_INR` | Platform provider budget in INR estimates. Pick the number you can afford. |
| `AI_SALON_SPEND_CAP_INR` | Per-salon provider budget in INR estimates. |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `OBJECT_STORAGE` | `s3` (or `local` only on a single VM with a persistent disk mounted at `var/objects`) |
| `S3_BUCKET` | Bucket name, when `OBJECT_STORAGE=s3` |
| `S3_ACCESS_KEY_ID` | R2 or IAM access key |
| `S3_SECRET_ACCESS_KEY` | R2 or IAM secret |
| `S3_ENDPOINT` | R2: `https://<account>.r2.cloudflarestorage.com`. Omit for AWS if the SDK default endpoint is correct. |
| `S3_REGION` | `auto` for R2, or `ap-south-1` for S3 Mumbai |
| `ROOT_DOMAIN` | Apex you use for salon subdomains, for example `lookuvi.in` |

Leave unset or `false`:

- `ALLOW_DEV_MAGIC_LINK`
- `ALLOW_DEV_OTP`
- `SEED_DEMO`

Recommended:

| Variable | Value |
|---|---|
| `AI_PROVIDER` | `mock` until a key is saved on `/super/ai` |
| `BILLING_PROVIDER` | `mock` until Razorpay keys are set |
| `REDIS_URL` | `rediss://...` when more than one container is running |
| `SENTRY_DSN` | Sentry project DSN, or unset |
| `SUPPORT_EMAIL` | Grievance address shown on `/privacy` |
| `EMAIL_FROM` | `Lookuvi <login@your-domain>` |
| `SMTP_URL` | `smtp://user:pass@smtp-host:587` |
| `GENERATION_JOB_TTL_HOURS` | `24` |
| `BENCHMARK_RETENTION_HOURS` | `72` |
| `GENERATE_PER_IP_HOUR` | `6` |
| `GENERATE_PER_IP_DAY` | `20` |
| `GENERATE_PER_TENANT_MINUTE` | `30` |
| `LOGIN_LIMIT` | `8` |
| `LOGIN_IP_LIMIT` | `30` |
| `TRUSTED_PROXY_HOPS` | `1` unless two proxies append to `X-Forwarded-For` |
| `AI_KEY_SALT` | A random string chosen once, before the first provider key is saved |
| `FX_INR_PER_USD` | `96` or the rate you want on the ledger |

Provider keys (`OPENAI_API_KEY`, `FAL_KEY`, and the others) may stay in the secret store as a fallback. The supported path is to paste them on `/super/ai`, where they are encrypted at rest.

The load balancer must allow requests longer than a provider call. Guest generate sets `maxDuration` to 3600. If the proxy times out sooner, the provider may still bill and the guest sees a failure.

## 4. Database and first operator

Start the container. The entrypoint applies `prisma/migrations`.

Create the operator. Run this once, with the production `DATABASE_URL` (direct is fine) and a password you store in a password manager. It refuses the three demo passwords.

```bash
SUPER_ADMIN_EMAIL="you@your-domain" SUPER_ADMIN_PASSWORD="a-long-unique-password" \
  DATABASE_URL="postgresql://..." \
  node scripts/create-super-admin.mjs
```

Inside the image the script is at `scripts/create-super-admin.mjs`.

Sign in at `https://<APP_BASE_URL>/login`. You land on `/admin` if that user also has a salon membership, or open `/super` directly. Create each salon from the super-admin screen. Send the owner their own email and a password they set with **Forgot password** (needs `SMTP_URL`) or by running the same script pattern only for the super-admin and then inviting staff from **Team** (owners set staff passwords there).

Staff passwords created in the team form are bcrypt hashes. There is no shared default password.

## 5. Retention, health, readiness

- Liveness: `GET /api/health` returns `{ "ok": true }` and does not touch the database.
- Readiness: `GET /api/ready` returns `{ "ok": true, "db": true }` or 503.
- Schedule `POST /api/cron/retention` every hour with `Authorization: Bearer $CRON_SECRET`. The process also runs the same job every 15 minutes.

Point the load balancer's health check at `/api/ready`.

## 6. TLS and headers

Terminate HTTPS at the proxy. `APP_BASE_URL` must be `https://` so the production session cookie is `Secure` and `httpOnly`. The app sends HSTS, `nosniff`, a referrer policy, `X-Frame-Options`, and a Content-Security-Policy on non-embed routes. `/embed` allows any parent frame so a salon site can iframe the try-on.

## 7. Backups

- Turn on Postgres PITR before the first salon. Confirm you can restore to a new instance.
- R2 and S3 are durable. The retention job and the bucket lifecycle delete previews. They are not a backup of leads. Leads are in Postgres.
- Take a manual snapshot before a schema migration.

## 8. Rollback

1. Keep the previous image tag.
2. Point the service back at that tag and restart.
3. Migrations in this repo are forward-only. Rolling back the image does not undo a migration that the new image already applied. If a migration ran, restore the database from the snapshot or PITR taken before the deploy, then start the old image.
4. `GET /api/ready` should be 200 before the load balancer sends traffic.

## 9. Local Docker

`docker compose up` reads secrets from the shell, not from the file:

```bash
export POSTGRES_PASSWORD="$(openssl rand -base64 24)"
export REDIS_PASSWORD="$(openssl rand -base64 24)"
export AUTH_SECRET="$(openssl rand -base64 32)"
export CRON_SECRET="$(openssl rand -base64 32)"
export AI_SPEND_CAP_INR=5000
export AI_SALON_SPEND_CAP_INR=2000
export APP_BASE_URL=https://localhost:3000
docker compose up --build
```

`APP_BASE_URL` must be `https` because the container sets `NODE_ENV=production`. For a laptop without TLS, do not use this compose file. Use `npm run dev` and SQLite instead.

Checked behaviour of the entrypoint: it does not run `prisma db push --accept-data-loss` and it does not load demo passwords.
