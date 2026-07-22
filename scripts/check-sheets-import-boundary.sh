#!/usr/bin/env bash
# Fail if HTTP route entrypoints import *SheetsService directly.
# Allowed: storage Google adapters, migration, Sheets service modules themselves, tests.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# server.ts is the main route surface — flag direct SheetsService imports during collapse.
# Soft mode: warn count; harden to exit 1 once Phase 3 removes remaining imports.
PATTERN='from ['\''\"].*SheetsService|require\(.*SheetsService'

hits=$(rg -n --glob 'api/src/server.ts' --glob 'api/src/server/modules/*Routes.ts' \
  --glob 'api/src/server/modules/apiRoutes.ts' \
  "$PATTERN" 2>/dev/null || true)

if [[ -n "$hits" ]]; then
  count=$(echo "$hits" | wc -l | tr -d ' ')
  echo "WARN: $count SheetsService import(s) still in route surfaces (collapse in progress):"
  echo "$hits" | head -n 40
  # Exit 0 until Phase 3 complete; re-enable hard fail by uncommenting:
  # exit 1
else
  echo "OK: no SheetsService imports in route surfaces"
fi

# Hard fail: companion/engagement paths must not be the only Google gate forever —
# document parity checklist exists.
if [[ ! -f docs/developer/SOCIAL_CLOUD_PARITY.md ]]; then
  echo "FAIL: missing docs/developer/SOCIAL_CLOUD_PARITY.md"
  exit 1
fi

echo "OK: social cloud parity checklist present"
