#!/usr/bin/env bash
# Falsification for check-no-identity-core-in-apps.sh (diagnostic-discipline §1).
# Run: bash scripts/check-no-identity-core-in-apps.selftest.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/scripts/check-no-identity-core-in-apps.sh"
# Use a path under an existing app so the scan root is realistic; file is removed on exit.
PROBE_DIR="$ROOT/apps/id-dashboard/src"
PROBE="$PROBE_DIR/.identity-core-ban-selftest-probe.ts"

fail_msg() { echo "selftest FAIL: $1" >&2; exit 1; }
cleanup() { rm -f "$PROBE"; }
trap cleanup EXIT

# Clean tree must pass under full scan
if ! PN_CHECK_ALL=1 bash "$SCRIPT" >/dev/null; then
  fail_msg "expected OK on clean apps tree before probe"
fi

# Synthetic violation must fail
cat > "$PROBE" <<'EOF'
import { IdentityCore } from '@identity-protocol/identity-core';
void IdentityCore;
EOF

if PN_CHECK_ALL=1 bash "$SCRIPT" >/dev/null 2>&1; then
  fail_msg "expected failure when apps file imports @identity-protocol/identity-core"
fi

# Path-style import must also fail
cat > "$PROBE" <<'EOF'
import something from '../../../core/identity-core/src/index';
void something;
EOF

if PN_CHECK_ALL=1 bash "$SCRIPT" >/dev/null 2>&1; then
  fail_msg "expected failure when apps file path-imports core/identity-core"
fi

cleanup
trap - EXIT

if ! PN_CHECK_ALL=1 bash "$SCRIPT" >/dev/null; then
  fail_msg "expected OK after probe removed"
fi

echo "OK: check-no-identity-core-in-apps.selftest"
