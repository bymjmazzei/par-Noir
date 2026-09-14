#!/usr/bin/env bash
# Fail if unlock path awaits post-prefetch or uses the 20s messaging handoff hold.
# Wave A ratchet (ECOSYSTEM_MODULARITY_MAP D1/D2).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Production unlock hosts only — unit tests may await prefetch to assert coalesce.
hits=$(
  {
    rg -n -e 'await[[:space:]]+runUnlockPostPrefetch' \
      -e 'waitForAndApplyMessagingHandoff\(20' \
      -e 'waitForAndApplyMessagingHandoff\(20_' \
      apps/aggregator-browser/src/hooks/useAuthAndSession.ts \
      apps/aggregator-browser/src/components/PNConnect.tsx 2>/dev/null || true
  } | sort -u
)

if [[ -n "$hits" ]]; then
  echo "FAIL: unlock critical path must not await prefetch or use 20s handoff hold:"
  echo "$hits"
  exit 1
fi

if [[ -f apps/aggregator-browser/src/services/cloudUnlockCoordinator.ts ]]; then
  echo "FAIL: cloudUnlockCoordinator.ts must be deleted; use @par-noir/device-cloud-credentials waiters only"
  exit 1
fi

echo "OK: unlock critical path (no await prefetch / no 20s handoff / no cloudUnlockCoordinator)"
