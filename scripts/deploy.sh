#!/usr/bin/env bash
#
# Robust deploy for a Storees checkout. Solves the two failure modes we keep
# hitting:
#   1. Build fails but pm2 restarts anyway → unstyled / half-built app.
#      Here the build runs FIRST and `set -e` aborts before touching pm2, so a
#      failed build leaves the old (working) process running.
#   2. A zombie `next start`/node still holds the port → new process crash-loops
#      on EADDRINUSE. Here we stop pm2 and free the port before restarting.
#
# Usage (run from the repo root of the checkout):
#   scripts/deploy.sh backend  <pm2_name> [port]
#   scripts/deploy.sh frontend <pm2_name> <port>
#
# Examples:
#   # GWM box (goweldev):
#   scripts/deploy.sh backend  storees-api 4000
#   scripts/deploy.sh frontend storees-web 4001
#   # main demo box:
#   scripts/deploy.sh backend  storees-backend 4000
#   scripts/deploy.sh frontend storees-frontend 4001
#
set -euo pipefail

ROLE="${1:?role required: backend|frontend}"
PM2_NAME="${2:?pm2 process name required}"
PORT="${3:-}"

step() { echo "▶ $*"; }

step "Deploying $ROLE ($PM2_NAME)${PORT:+ on port $PORT}"

# 1. Pull + install
git pull --ff-only
npm install

# 2. Build — fail-hard. The old process keeps serving until we restart, so a
#    broken build never reaches production.
step "Building @storees/shared"
npm run build -w @storees/shared

if [ "$ROLE" = "backend" ]; then
  step "Building @storees/backend"
  npm run build -w @storees/backend
  step "Running migrations"
  npm run db:migrate -w @storees/backend
elif [ "$ROLE" = "frontend" ]; then
  step "Building @storees/frontend"
  # Cap heap so a large Next build doesn't OOM-kill on a small box (a partial
  # .next is what serves unstyled).
  NODE_OPTIONS="--max-old-space-size=2048" npm run build -w @storees/frontend
else
  echo "Unknown role '$ROLE' (expected backend|frontend)" >&2
  exit 1
fi

# 3. Restart cleanly: stop the managed process, free the port if a zombie still
#    holds it, then restart so it can bind.
step "Stopping $PM2_NAME"
pm2 stop "$PM2_NAME" 2>/dev/null || true

if [ -n "$PORT" ]; then
  PIDS="$(lsof -ti :"$PORT" 2>/dev/null || true)"
  if [ -n "$PIDS" ]; then
    step "Freeing port $PORT (killing zombie: $PIDS)"
    kill -9 $PIDS 2>/dev/null || true
    sleep 1
  fi
fi

step "Starting $PM2_NAME"
pm2 restart "$PM2_NAME" --update-env
pm2 save

# 4. Verify it actually came up (not crash-looping)
sleep 2
STATUS="$(pm2 jlist | node -e "const n=process.argv[1];const p=JSON.parse(require('fs').readFileSync(0,'utf8')).find(x=>x.name===n);process.stdout.write(p?p.pm2_env.status:'missing')" "$PM2_NAME" 2>/dev/null || echo unknown)"
echo "✓ $PM2_NAME → status=$STATUS, HEAD=$(git rev-parse --short HEAD)"
if [ "$STATUS" != "online" ]; then
  echo "⚠ $PM2_NAME is not online — check: pm2 logs $PM2_NAME" >&2
  exit 1
fi
