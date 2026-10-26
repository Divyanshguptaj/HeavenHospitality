#!/usr/bin/env bash
# Builds and starts the website API on this server. The running container is only
# replaced once the new image has built; if the new container is unhealthy, the
# previous image is started again.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/heaven-hospitality/app}"
ENV_FILE="${ENV_FILE:-/opt/heaven-hospitality/site.env}"
CONTEXT="The_heavan_hospility/The_heavan_hospility/backend"
NAME=heaven-site-api
HEALTH_URL=http://127.0.0.1:5000/api/health

cd "$APP_DIR"
git pull --ff-only
TAG="$(git rev-parse --short HEAD)"

docker build -t "$NAME:$TAG" "$CONTEXT"

start() {
  docker run -d --name "$NAME" --restart unless-stopped --env-file "$ENV_FILE" \
    -p 127.0.0.1:5000:5000 --memory 300m "$1"
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

# Remove every older image of this app and the build cache.
docker images "$NAME" --format '{{.Tag}}' | grep -vx "$TAG" | xargs -r -I{} docker rmi "$NAME:{}" || true
docker image prune -f >/dev/null
docker builder prune -af >/dev/null
