#!/usr/bin/env bash
# Close a creator-fund period if due. Requires CREATOR_FUND_CRON_SECRET and API base URL.
set -euo pipefail
API_BASE="${API_BASE_URL:-${VITE_API_ENDPOINT:-https://api.parnoir.com}}"
API_BASE="${API_BASE%/}"
SECRET="${CREATOR_FUND_CRON_SECRET:-}"
if [[ -z "$SECRET" ]]; then
  echo "CREATOR_FUND_CRON_SECRET is required" >&2
  exit 1
fi
curl -fsS -X POST "${API_BASE}/api/creator-fund/periods/close" \
  -H "X-Cron-Secret: ${SECRET}" \
  -H "Content-Type: application/json"
echo
