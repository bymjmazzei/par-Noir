#!/usr/bin/env bash
# Falsification for check-production-flags.sh (diagnostic-discipline §1).
# Run: bash scripts/check-production-flags.selftest.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/scripts/check-production-flags.sh"

fail_msg() { echo "selftest FAIL: $1" >&2; exit 1; }

# Without strict flag → skip (exit 0)
if ! PN_STRICT_GUARDRAILS=0 bash "$SCRIPT" >/dev/null; then
  fail_msg "expected skip exit 0 when PN_STRICT_GUARDRAILS unset/0"
fi

# Strict without env → fail
if PN_STRICT_GUARDRAILS=1 bash "$SCRIPT" >/dev/null 2>&1; then
  fail_msg "expected failure when OAuth/mailbox/socket env missing"
fi

# Full env except SOCKET_REQUIRE_AUTH → fail
if PN_STRICT_GUARDRAILS=1 \
  PN_OAUTH_SECRET=test \
  PN_OAUTH_ISSUER=https://api.example \
  PN_OAUTH_AUDIENCE=pn \
  MAILBOX_ROUTE_PEPPER=pepper \
  bash "$SCRIPT" >/dev/null 2>&1; then
  fail_msg "expected failure when SOCKET_REQUIRE_AUTH unset"
fi

# SOCKET_REQUIRE_AUTH=false → fail
if PN_STRICT_GUARDRAILS=1 \
  PN_OAUTH_SECRET=test \
  PN_OAUTH_ISSUER=https://api.example \
  PN_OAUTH_AUDIENCE=pn \
  MAILBOX_ROUTE_PEPPER=pepper \
  SOCKET_REQUIRE_AUTH=false \
  bash "$SCRIPT" >/dev/null 2>&1; then
  fail_msg "expected failure when SOCKET_REQUIRE_AUTH=false"
fi

# Full env → ok
PN_STRICT_GUARDRAILS=1 \
  PN_OAUTH_SECRET=test \
  PN_OAUTH_ISSUER=https://api.example \
  PN_OAUTH_AUDIENCE=pn \
  MAILBOX_ROUTE_PEPPER=pepper \
  SOCKET_REQUIRE_AUTH=true \
  bash "$SCRIPT" >/dev/null || fail_msg "expected ok with full env"

echo "check-production-flags.selftest: ok"
