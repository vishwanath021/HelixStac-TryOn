#!/bin/sh
# Run this on the DigitalOcean droplet (region blr1, Bangalore), not on a laptop.
# First droplet, from your own machine, after `doctl auth init`:
#   doctl compute droplet create lookuvi \
#     --region blr1 --size s-2vcpu-4gb --image ubuntu-24-04-x64 \
#     --ssh-keys <fingerprint>
# This script does not call the DigitalOcean API and does not create DNS records.
set -eu
cd /opt/lookuvi
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
if [ ! -f .env.production ]; then
  echo "Create /opt/lookuvi/.env.production from .env.production.example before deploying." >&2
  exit 1
fi
if [ ! -f docker-compose.prod.yml ] || [ ! -f deploy/Caddyfile ]; then
  echo "Copy docker-compose.prod.yml and deploy/Caddyfile to /opt/lookuvi first." >&2
  exit 1
fi
if [ -z "${LOOKUVI_IMAGE:-}" ]; then
  echo "Set LOOKUVI_IMAGE to the GHCR tag to run." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env.production
set +a
export LOOKUVI_IMAGE
if [ -n "${GHCR_USER:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
fi
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
echo "Deployed $LOOKUVI_IMAGE"
