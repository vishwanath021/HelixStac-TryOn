#!/bin/sh
# Dump Postgres from the production compose database and upload it to R2/S3.
# Run from the droplet as: cd /opt/lookuvi && ./scripts/backup-postgres.sh
# The database container provides pg_dump. The app container uploads the file.
set -eu
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEY="backups/lookuvi-${STAMP}.dump"
FILE="/tmp/lookuvi-${STAMP}.dump"
$COMPOSE exec -T db sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$FILE"
$COMPOSE cp "$FILE" app:/tmp/lookuvi.dump
$COMPOSE exec -T app node scripts/backup-object.mjs put /tmp/lookuvi.dump "$KEY"
$COMPOSE exec -T app rm -f /tmp/lookuvi.dump
rm -f "$FILE"
echo "Backup object: $KEY"
