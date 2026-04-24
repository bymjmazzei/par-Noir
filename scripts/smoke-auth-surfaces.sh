#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_ENDPOINT="${VITE_API_ENDPOINT:-https://api.parnoir.com}"
echo "Using VITE_API_ENDPOINT=$API_ENDPOINT"

echo "[1/6] API health smoke"
if [[ -x "api/scripts/smoke-api-health.sh" ]]; then
  API_BASE_URL="$API_ENDPOINT" bash "api/scripts/smoke-api-health.sh"
else
  echo "warning: api/scripts/smoke-api-health.sh not executable; skipping"
fi

echo "[2/6] aggregator-browser build"
(cd apps/aggregator-browser && VITE_API_ENDPOINT="$API_ENDPOINT" npm run build)

echo "[3/6] id-dashboard build"
(cd apps/id-dashboard && VITE_API_ENDPOINT="$API_ENDPOINT" npm run build)

echo "[4/6] prism build"
(cd apps/prism && VITE_API_ENDPOINT="$API_ENDPOINT" npm run build)

echo "[5/6] developer-portal build"
(cd apps/developer-portal && VITE_API_ENDPOINT="$API_ENDPOINT" npm run build)

echo "[6/6] licensing-portal build"
(cd apps/licensing-portal && VITE_API_ENDPOINT="$API_ENDPOINT" VITE_PN_CLIENT_ID="${VITE_PN_CLIENT_ID:-licensing-portal}" npm run build)

echo "Auth surface smoke builds completed."
