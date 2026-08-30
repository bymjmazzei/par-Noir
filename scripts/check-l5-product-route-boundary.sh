#!/usr/bin/env bash
# Fail closed: first-party product API prefixes must stay gated against L5.
#
# Ratchet: product route modules must call gateFirstPartyOwnerRoute and/or
# mountL5ProductFirstPartyBoundary must remain wired from server.ts.
# No allowlist — fix the call site.
#
# Rule: docs/developer/L5_ONE_KIT_REVIEW.md §3; .cursor/rules/auth-trust-boundary.mdc
# Set PN_CHECK_ALL=1 to scan regardless of staged files (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=""

if ! rg -q 'mountL5ProductFirstPartyBoundary' api/src/server.ts; then
  fail="${fail}server.ts must call mountL5ProductFirstPartyBoundary"$'\n'
fi

if ! rg -q 'gateFirstPartyOwnerRoute' api/src/server/modules/messageRoutes.ts; then
  fail="${fail}messageRoutes.ts must use gateFirstPartyOwnerRoute"$'\n'
fi

if ! rg -q 'gateFirstPartyOwnerRoute' api/src/server/modules/mailboxRoutes.ts; then
  fail="${fail}mailboxRoutes.ts must use gateFirstPartyOwnerRoute"$'\n'
fi

if ! rg -q "requireFirstPartyOAuthClient" api/src/server/modules/deviceCapabilityService.ts; then
  fail="${fail}deviceCapabilityService.ts must export requireFirstPartyOAuthClient"$'\n'
fi

for prefix in '/api/messages' '/api/mailbox' '/api/connections' '/api/groups' '/api/engagement' '/api/notifications' '/api/push'; do
  if ! rg -q "'${prefix}'|\"${prefix}\"" api/src/server/modules/l5ProductRouteBoundary.ts; then
    fail="${fail}l5ProductRouteBoundary.ts missing prefix ${prefix}"$'\n'
  fi
done

# drive-token mint must refuse non-first-party clients
if ! rg -q 'isFirstPartyClient' api/src/server/modules/pnOAuthRoutes.ts; then
  fail="${fail}pnOAuthRoutes.ts drive-token path must check isFirstPartyClient"$'\n'
fi

if [ -n "$fail" ]; then
  echo "FAIL: L5 product route boundary:"
  printf '%s' "$fail"
  exit 1
fi

echo "OK: L5 product route first-party boundary wired"
