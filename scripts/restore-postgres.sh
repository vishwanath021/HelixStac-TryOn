#!/bin/sh
# Restore one backup into the production database. Stop the app first.
# Usage: ./scripts/restore-postgres.sh backups/lookuvi-YYYYMMDDTHHMMSSZ.dump
set -eu
cd "$(dirname "$0")/.."
KEY="${1:-}"
if [ -z "$KEY" ]; then
  echo "Pass the object key, for example backups/lookuvi-20261011T000000Z.dump" >&2
  exit 1
fi
COMPOSE="docker compose -f docker-compose.prod.yml"
FILE="/tmp/lookuvi-restore.dump"
$COMPOSE exec -T app node scripts/backup-object.mjs get /tmp/lookuvi.dump "$KEY"
$COMPOSE cp app:/tmp/lookuvi.dump "$FILE"
$COMPOSE exec -T app rm -f /tmp/lookuvi.dump
$COMPOSE cp "$FILE" db:/tmp/lookuvi.dump
$COMPOSE exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/lookuvi.dump'
$COMPOSE exec -T db rm -f /tmp/lookuvi.dump
rm -f "$FILE"
echo "Restored $KEY"
