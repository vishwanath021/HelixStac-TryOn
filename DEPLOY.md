# Deploy Lookuvi

Not deployed. Pick a host, then use this checklist. Do not turn on a paid image key until the spend cap is set.

## What has to be true

- Node 22. `Dockerfile` builds a standalone Next app.
- `DATABASE_URL` is Postgres in production (`postgresql://...`). `scripts/prepare-prisma.mjs` switches Prisma off SQLite when the URL is not `file:` or `sqlite:`.
- The container entrypoint runs that script, `prisma db push`, and the seed.
- Uploads and generated images live under `var/`. Mount a persistent disk there. A serverless disk is wiped on the next boot.
- `GET /api/health` checks `prisma.tenant.count()` and returns `{ ok, db, ai, billing, time }`.

## Environment

Required:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST=true`
- `APP_BASE_URL` (public https origin, no trailing slash)

Defaults that should stay for a first deploy:

- `AI_PROVIDER=mock` until a real key is stored on the super-admin AI page
- `BILLING_PROVIDER=mock`
- `NODE_ENV=production` so the login magic link does not print a dev URL. Leave `ALLOW_DEV_MAGIC_LINK` unset.
- Guest hairstyles use the super-admin selector (fal FLUX.3 by default, or OpenAI sunburst at quality medium). `TRYON_REFERENCE_MODE` is not the guest switch.

Also used when you leave mock mode:

- `FAL_KEY` or a fal key saved on `/super/ai` and enabled
- `OPENAI_API_KEY` or an OpenAI key saved on `/super/ai`
- `GEMINI_API_KEY`, `OPENROUTER_API_KEY` for comparison models only
- `FX_INR_PER_USD` (default 96) and `AI_SPEND_CAP_INR`
- `FLUX3` price is the single value `FLUX3_USD_PER_OUTPUT_MEGAPIXEL` in `src/lib/ai/cost-source.ts` ($0.024). Change that constant if fal raises the rate.

## Hosts that fit

1. A small VM with this Dockerfile, Postgres, and a volume on `var/`. It can wait out a long provider call.
2. Railway or Render with the same Dockerfile and managed Postgres. A proxy may cut off a long fal wait.
3. Vercel plus hosted Postgres is a poor first choice while a preview can poll for up to an hour and results live on local disk.
