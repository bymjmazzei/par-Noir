#!/usr/bin/env bash
# Fail if any app under apps/*/src imports another app's src (apps must not import each other).
# Shared code belongs in packages/, core/, or sdk/.
#
# Set PN_STRICT_APP_IMPORTS=1 to hard-fail (default after desktop coupling fix).
# Without it, warn only so Phase 0 can land before Phase 3.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

hits=$(rg -n --glob 'apps/*/src/**/*.{ts,tsx,js,jsx}' \
  -e "from ['\"][^'\"]*/(id-dashboard|aggregator-browser|desktop-dashboard|developer-portal|licensing-portal|prism|internal-dashboard)/src/" \
  -e "from ['\"](\\.\\./)+(id-dashboard|aggregator-browser|desktop-dashboard|developer-portal|licensing-portal|prism|internal-dashboard)/src/" \
  2>/dev/null | sort -u || true)

if [[ -n "$hits" ]]; then
  count=$(echo "$hits" | wc -l | tr -d ' ')
  # Default hard-fail after Phase 3 desktop coupling fix.
  if [[ "${PN_STRICT_APP_IMPORTS:-1}" == "1" ]]; then
    echo "FAIL: $count app→app import(s) found (apps must not import each other):"
    echo "$hits"
    exit 1
  fi
  echo "WARN: $count app→app import(s) found (set PN_STRICT_APP_IMPORTS=1 to hard-fail):"
  echo "$hits"
  exit 0
fi

echo "OK: no app→app src imports"
