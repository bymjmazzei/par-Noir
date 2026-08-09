#!/usr/bin/env bash
# One resolver per external credential, device side: freshness and refresh for
# Google Drive access tokens belong to packages/device-cloud-credentials.
#
# Four copies of "is this token still good?" drifted apart once already. The
# unlock page's copy had no expiry check at all, so it forwarded a token Google
# had killed an hour after Drive was connected: every unlock re-prompted for
# consent and the grant write came back as an HTTP 500.
#
# This blocks two shapes of regression:
#   1. Reading an access token straight out of a credentials envelope, which
#      bypasses the freshness gate entirely.
#   2. Deriving an expiry from a relative expires_in, which restarts the clock
#      on every call and reports a long-dead token as freshly minted.
#
# Rule: .cursor/rules/diagnostic-discipline.mdc section 4.
# Set PN_CHECK_ALL=1 to scan the whole repo instead of staged changes (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Hand-rolled token read off a STORED account row. Scoped to account-shaped
# receivers on purpose: converting a token response that was just received is
# correct, while re-deriving anything from a stored row is the bug. Use
# accountAccessToken() for a raw seed, or the resolver for a usable token.
ENVELOPE_PATTERN='\b(account|acct|acc|credentials|creds|stored|envelope)[A-Za-z0-9_$]*\??\.(access_token|accessToken)[[:space:]]*\|\|'

# Date.now() + <stored row>.expires_in. Always wrong: a stored expires_in has no
# issue time attached, so this restarts the hour on every call. Converting a
# just-received response is fine and is not matched here.
CLOCK_RESTART_PATTERN='Date\.now\(\)[[:space:]]*\+[[:space:]]*\(?[A-Za-z_$][A-Za-z0-9_$]*(account|acct|acc|credentials|creds|stored)[A-Za-z0-9_$]*\??\.(expires_in|expiresIn)|Date\.now\(\)[[:space:]]*\+[[:space:]]*\(?(account|acct|acc|credentials|creds|stored)[A-Za-z0-9_$]*\??\.(expires_in|expiresIn)'

# Files that legitimately own the primitive.
is_canonical() {
  case "$1" in
    packages/device-cloud-credentials/src/driveTokenResolver.ts) return 0 ;;
    packages/device-cloud-credentials/src/ownerCloudHeaders.ts) return 0 ;;
    *) return 1 ;;
  esac
}

# Only device-side code is in scope. The API has its own resolver boundary check,
# and generated bundles are checked through the source they are built from.
in_scope() {
  case "$1" in
    packages/oauth-ui/static/*) return 1 ;;
    */dist/* | */dist-messaging/* | */node_modules/*) return 1 ;;
    *.test.ts | *.test.tsx | *.spec.ts | *.gate.test.ts) return 1 ;;
    apps/id-dashboard/src/* | apps/aggregator-browser/src/* | packages/*/src/*) return 0 ;;
    *) return 1 ;;
  esac
}

violations=""

check_file() {
  local file="$1"
  local content="$2"

  case "$file" in
    *.ts | *.tsx) ;;
    *) return 0 ;;
  esac

  in_scope "$file" || return 0
  is_canonical "$file" && return 0

  if printf '%s' "$content" | grep -qE "$ENVELOPE_PATTERN"; then
    violations="${violations}${file} (access token read straight from an envelope)"$'\n'
  fi

  if printf '%s' "$content" | grep -qE "$CLOCK_RESTART_PATTERN"; then
    violations="${violations}${file} (expiry derived from a relative expires_in)"$'\n'
  fi
}

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(cat "$file")"
  done < <(rg -l -e "$ENVELOPE_PATTERN" -e "$CLOCK_RESTART_PATTERN" \
    --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/dist-messaging/**' 2>/dev/null || true)
else
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    # Read the staged content, not the working tree.
    check_file "$file" "$(git show ":$file" 2>/dev/null || true)"
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

if [ -n "$violations" ]; then
  echo "BLOCKED: Drive token freshness decided outside the one resolver."
  printf '%s' "$violations" | sed '/^$/d' | sed 's/^/  - /'
  echo
  echo "Use @par-noir/device-cloud-credentials:"
  echo "  resolveFreshDriveToken()     - returns a live token, refreshing if needed"
  echo "  freshAccessTokenFromEnvelope() - a token already in the envelope, if still valid"
  echo "  ensureCloudAccessToken()     - the session-backed wrapper"
  echo
  echo "Never derive an expiry from expires_in: it has no issue time attached, so"
  echo "Date.now() + expires_in reports a dead token as freshly minted. Store an"
  echo "absolute expires_at at the point of capture."
  echo "See .cursor/rules/diagnostic-discipline.mdc section 4."
  exit 1
fi

echo "OK: Drive token freshness decided only by the shared resolver"
exit 0
