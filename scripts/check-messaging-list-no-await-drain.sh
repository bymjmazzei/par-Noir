#!/usr/bin/env bash
# Fail if messaging list hosts await drainSocialMailbox before paint (D3).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

hits=$(
  {
    rg -n -e 'await[[:space:]]+drainSocialMailbox' \
      apps/aggregator-browser/src/components/MessageList.tsx \
      apps/aggregator-browser/src/components/ConnectionsPanel.tsx \
      apps/aggregator-browser/src/components/RequestsList.tsx 2>/dev/null || true
  } | sort -u
)

if [[ -n "$hits" ]]; then
  echo "FAIL: list hosts must not await drainSocialMailbox before first paint:"
  echo "$hits"
  exit 1
fi

echo "OK: messaging list hosts do not await drainSocialMailbox"
