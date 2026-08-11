#!/usr/bin/env bash
set -euo pipefail

STRICT="${PN_STRICT_GUARDRAILS:-0}"
if [[ "$STRICT" != "1" ]]; then
  echo "check-production-flags: skipped (set PN_STRICT_GUARDRAILS=1 to enforce)"
  exit 0
fi

fail() {
  echo "check-production-flags: $1" >&2
  exit 1
}

# Never allow unsafe admin bypass in strict mode.
if [[ "${ALLOW_UNSAFE_DEV_ADMIN_BYPASS:-}" == "true" ]]; then
  fail "ALLOW_UNSAFE_DEV_ADMIN_BYPASS=true is not allowed in strict mode"
fi

# Require either HS secret or RS256/KMS setup.
has_hs=0
has_rs=0
if [[ -n "${PN_OAUTH_SECRET:-}" ]]; then
  has_hs=1
fi
if [[ -n "${PN_OAUTH_PRIVATE_KEY_PEM:-}" || -n "${PN_OAUTH_KMS_KEY_VERSION:-}" ]]; then
  has_rs=1
fi
if [[ $has_hs -eq 0 && $has_rs -eq 0 ]]; then
  fail "missing OAuth signing configuration (set PN_OAUTH_SECRET or RS256/KMS vars)"
fi

# Recommended explicit issuer/audience in strict mode.
[[ -n "${PN_OAUTH_ISSUER:-}" ]] || fail "PN_OAUTH_ISSUER must be set in strict mode"
[[ -n "${PN_OAUTH_AUDIENCE:-}" ]] || fail "PN_OAUTH_AUDIENCE must be set in strict mode"

# Opaque mailbox owner hashing — no soft default in code.
[[ -n "${MAILBOX_ROUTE_PEPPER:-}" ]] || fail "MAILBOX_ROUTE_PEPPER must be set in strict mode"

echo "check-production-flags: ok"

