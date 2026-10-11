#!/bin/sh
set -e
node scripts/prepare-prisma.mjs
npx prisma generate
case "$DATABASE_URL" in
  file:*|sqlite:*)
    npx prisma db push --skip-generate
    ;;
  *)
    if [ -n "$DIRECT_URL" ]; then
      DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
    else
      npx prisma migrate deploy
    fi
    ;;
esac
if [ "$SEED_DEMO" = "true" ]; then
  echo "SEED_DEMO is refused in the container. Seed a development database with npm run seed." >&2
  exit 1
fi
exec node server.js
