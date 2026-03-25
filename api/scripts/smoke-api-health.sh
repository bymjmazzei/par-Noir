#!/usr/bin/env bash
# Quick smoke: API liveness and readiness. Usage:
#   API_BASE_URL=https://api.example.com ./scripts/smoke-api-health.sh
set -euo pipefail
BASE="${API_BASE_URL:-http://127.0.0.1:3001}"
BASE="${BASE%/}"

echo "GET $BASE/health"
curl -sfS "$BASE/health" | head -c 400
echo ""
echo "GET $BASE/health/ready"
code=$(curl -sS -o /tmp/pn-ready.json -w "%{http_code}" "$BASE/health/ready" || true)
cat /tmp/pn-ready.json
echo ""
echo "HTTP $code"
if [[ "$code" != "200" && "$code" != "503" ]]; then
  echo "Unexpected status (expected 200 or 503 for ready probe)" >&2
  exit 1
fi
echo "OK"
