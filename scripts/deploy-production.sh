#!/usr/bin/env bash
# Builds and starts the API on this server. The running container is only replaced
# once the new image has built; if the new container is unhealthy, the previous
# image is started again.
#
#   scripts/deploy-production.sh              deploy the latest main
#   RUN_MIGRATIONS=1 scripts/deploy-production.sh   also apply pending Prisma migrations
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/heaven-hospitality/app}"
ENV_FILE="${ENV_FILE:-/opt/heaven-hospitality/.env}"
NAME=heaven-api
HEALTH_URL=http://127.0.0.1:4000/api/v1/health

cd "$APP_DIR"
git pull --ff-only
TAG="$(git rev-parse --short HEAD)"

docker build -t "$NAME:$TAG" .

run_migrations() {
  local status
  status="$(docker run --rm --env-file "$ENV_FILE" "$NAME:$TAG" npx prisma migrate status 2>&1 || true)"
  if echo "$status" | grep -q "have not yet been applied"; then
    if [ "${RUN_MIGRATIONS:-0}" != "1" ]; then
      echo "Pending migrations found. Review them, then re-run with RUN_MIGRATIONS=1." >&2
      echo "$status" >&2
      exit 1
    fi
    docker run --rm --env-file "$ENV_FILE" "$NAME:$TAG" npx prisma migrate deploy
  fi
}
run_migrations

start() {
  docker run -d --name "$NAME" --restart unless-stopped --env-file "$ENV_FILE" \
    -p 127.0.0.1:4000:4000 --memory 600m "$1"
}

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

PREVIOUS="$(docker inspect -f '{{.Config.Image}}' "$NAME" 2>/dev/null || true)"
docker rm -f "$NAME" >/dev/null 2>&1 || true
start "$NAME:$TAG"

if ! healthy; then
  echo "New container is unhealthy:" >&2
  docker logs --tail 40 "$NAME" >&2 || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$NAME:$TAG" ]; then
    echo "Rolling back to $PREVIOUS" >&2
    start "$PREVIOUS"
  fi
  exit 1
fi

echo "Deployed $NAME:$TAG"

# Keep the running image and the previous one; drop the rest and dangling layers.
docker images "$NAME" --format '{{.Tag}}' | grep -v '^latest$' | tail -n +3 | xargs -r -I{} docker rmi "$NAME:{}" || true
docker image prune -f >/dev/null
docker builder prune -f --filter 'until=72h' >/dev/null
