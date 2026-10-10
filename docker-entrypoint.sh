#!/bin/sh
set -e
node scripts/prepare-prisma.mjs
npx prisma generate
npx prisma db push --skip-generate --accept-data-loss
npx tsx prisma/seed.ts
exec node server.js
