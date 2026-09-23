#!/usr/bin/env bash
# Deploy script for VPS — pull, install, migrate, build, restart API.
# Usage (on VPS): bash /var/www/microsubtrackerBackend/scripts/deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/microsubtrackerBackend}"
SERVICE_NAME="${SERVICE_NAME:-microsub-api}"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: $APP_DIR/.env is missing. Create it before deploying."
  exit 1
fi

echo "==> Fetching $BRANCH"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Installing dependencies"
npm ci

echo "==> Building"
npm run build

echo "==> Migrating database"
npm run migrate:prod

echo "==> Pruning devDependencies"
npm prune --omit=dev

restart_service() {
  if command -v systemctl >/dev/null 2>&1 && systemctl cat "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
      systemctl restart "$SERVICE_NAME"
      systemctl --no-pager --full status "$SERVICE_NAME" | head -n 20
    else
      sudo systemctl restart "$SERVICE_NAME"
      sudo systemctl --no-pager --full status "$SERVICE_NAME" | head -n 20
    fi
    return 0
  fi
  return 1
}

echo "==> Restarting $SERVICE_NAME"
if restart_service; then
  :
elif command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$SERVICE_NAME" --update-env || pm2 start dist/server.js --name "$SERVICE_NAME"
  pm2 save || true
  pm2 status
else
  echo "WARN: No systemd unit or pm2 process found. Build completed; start the API manually."
fi

echo "==> Deploy done ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
