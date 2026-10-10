# Deploy Lookuvi

Not deployed. Pick a host, then use this checklist. Do not turn on a paid image key until the spend cap is set.

## What has to be true

- Node 22. `Dockerfile` builds a standalone Next app.
- `DATABASE_URL` is Postgres in production (`postgresql://...`). `scripts/prepare-prisma.mjs` switches Prisma off SQLite when the URL is not `file:` or `sqlite:`.
- The container entrypoint runs that script, `prisma db push`, and the seed.
- Uploads and generated images live under `var/`. Mount a persistent disk there. A serverless disk is wiped on the next boot.
- `GET /api/health` checks `prisma.tenant.count()` and returns `{ ok, db, ai, billing, time }`.
- `src/instrumentation.ts` runs `productionEnvProblems()` on server start. `next build` sets `NEXT_PHASE=phase-production-build` and skips the check so the image can compile. `next start` and the container process do not.

## Environment

Required in production. The process exits before it serves traffic if any of these fail:

- `DATABASE_URL`
- `AUTH_SECRET` of at least 16 characters
- `AUTH_TRUST_HOST=true`
- `APP_BASE_URL` (public https origin, no trailing slash)

Dev-only flags must be unset or not `true`. Either one set to `true` refuses to boot:

- `ALLOW_DEV_MAGIC_LINK`
- `ALLOW_DEV_OTP`

The magic-link route and the guest OTP route also ignore those flags when `NODE_ENV` is production, so a dev URL or OTP code is not returned. AI provider keys are not required. Leave them unset to stay on the mock.

Defaults that should stay for a first deploy:

- `AI_PROVIDER=mock` until a real key is stored on the super-admin AI page
- `BILLING_PROVIDER=mock`
- `NODE_ENV=production`
- Guest hairstyles use the super-admin selector (fal FLUX.3 by default, or OpenAI sunburst at quality medium). `TRYON_REFERENCE_MODE` is not the guest switch.

Logs go through `redact()` in `src/lib/logger.ts`. Keys that look like a photo, image buffer, selfie, or secret are replaced before they are printed. Do not log request bodies.

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

## Checked on 2026-10-10

- `npm run build` completed, then `npm start` served `GET /api/health` with `ok: true` and `db: true` against the local SQLite file.
- `next start` exits 1 before it stays up when `AUTH_SECRET`, `AUTH_TRUST_HOST`, or `APP_BASE_URL` is missing, and when `ALLOW_DEV_MAGIC_LINK` or `ALLOW_DEV_OTP` is `true`.
- `docker build -t lookuvi:local .` completed. The runner image includes `tsconfig.json` so `tsx prisma/seed.ts` can resolve `@/`.
- Postgres 16 and the app container ran together. The entrypoint pushed the schema, seeded the demo salon, and `GET /api/health` returned `ok: true`, `db: true`, `ai: mock`, `billing: mock`. `GET /s/demo-salon` returned 200.
- A container started with `node server.js` and no `AUTH_SECRET` exited 1 with `Lookuvi will not start`.
- This check did not deploy the app and did not call a paid image API.
