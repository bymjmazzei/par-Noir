#!/usr/bin/env bash
# One resolver per external credential: Google Drive access tokens must be resolved
# via resolveOwnerDriveToken() in api/src/server/modules/ownerDriveToken.ts.
#
# Ratchet: files in scripts/token-resolver-allowlist.txt are grandfathered. No NEW
# file may call googleDriveProxy(Service).getAccessToken() directly, and no allowlist
# entry should ever be added - only removed as paths are migrated.
#
# Rule: .cursor/rules/diagnostic-discipline.mdc section 4.
# Set PN_CHECK_ALL=1 to scan the whole repo instead of staged changes (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOWLIST="scripts/token-resolver-allowlist.txt"
RAW_ALLOWLIST="scripts/peer-credential-allowlist.txt"
# Matches, on googleDriveProxy or googleDriveProxyService:
#   1. .getAccessToken(  and  .forceRefreshAccessToken(   — both mint a Drive token
#   2. destructuring, e.g. const { getAccessToken } = googleDriveProxyService
#      which would otherwise call the method without ever naming it on the object
# Deliberately does not match dropboxProxyService/onedriveProxyService, which are
# different providers with their own resolvers.
PATTERN='googleDriveProxy(Service)?\.(getAccessToken|forceRefreshAccessToken)[[:space:]]*\(|\{[^}]*(getAccessToken|forceRefreshAccessToken)[^}]*\}[[:space:]]*=[[:space:]]*(await[[:space:]]+)?googleDriveProxy'

# Second invariant: a route may only act on the AUTHENTICATED pn's cloud.
#
# Every cross-user write that custody silently disabled shared one shape: pull a
# credentials row for some other pn, then build a Drive token straight off it:
#
#   const t = { access_token: acct.access_token || acct.accessToken, ... }
#
# That row is a stripped shell under custody, so the write fails - usually
# silently. resolveOwnerDriveToken is the only place allowed to turn a stored
# row into a token, because it prefers the caller's forwarded header. Anything
# a peer needs written goes over the mailbox rail and is applied by their own
# device against their own cloud.
RAW_PATTERN='access_token:[[:space:]]*[A-Za-z_$][A-Za-z0-9_$]*\.(access_token|accessToken)[[:space:]]*\|\|'

# Files that legitimately resolve or define the primitive.
is_canonical() {
  case "$1" in
    api/src/server/modules/ownerDriveToken.ts) return 0 ;;
    api/src/server/modules/ownerDriveContext.ts) return 0 ;;
    api/src/server/modules/googleDriveProxy.ts) return 0 ;;
    *) return 1 ;;
  esac
}

in_list() {
  local list="$1" file="$2"
  if [ ! -f "$list" ]; then
    return 1
  fi
  grep -v '^[[:space:]]*#' "$list" | grep -v '^[[:space:]]*$' | grep -qxF "$file"
}

violations=""

check_file() {
  local file="$1"
  local content="$2"

  case "$file" in
    *.ts | *.tsx) ;;
    *) return 0 ;;
  esac

  if printf '%s' "$content" | grep -qE "$PATTERN"; then
    if ! is_canonical "$file" && ! in_list "$ALLOWLIST" "$file"; then
      violations="${violations}${file} (direct Drive token resolution)"$'\n'
    fi
  fi

  if printf '%s' "$content" | grep -qE "$RAW_PATTERN"; then
    if ! is_canonical "$file" && ! in_list "$RAW_ALLOWLIST" "$file"; then
      violations="${violations}${file} (Drive token built from a stored credentials row)"$'\n'
    fi
  fi
}

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(cat "$file")"
  done < <(rg -l -e "$PATTERN" -e "$RAW_PATTERN" --glob '!**/node_modules/**' --glob '!**/dist/**' 2>/dev/null || true)
else
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    # Read the staged content, not the working tree.
    check_file "$file" "$(git show ":$file" 2>/dev/null || true)"
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

if [ -n "$violations" ]; then
  echo "BLOCKED: Drive credentials resolved outside resolveOwnerDriveToken."
  printf '%s' "$violations" | sed '/^$/d' | sed 's/^/  - /'
  echo
  echo "Use resolveOwnerDriveToken() from api/src/server/modules/ownerDriveToken.ts."
  echo "Under device cloud custody the server holds no OAuth secrets: forward"
  echo "X-PN-Cloud-Access-Token, which resolveOwnerDriveToken prefers before"
  echo "falling back to server-held secrets."
  echo "Do NOT add an early return in place of the call. That is the exact bug"
  echo "this check exists to prevent."
  echo
  echo "If the write is for ANOTHER user, no token exists for it on the server."
  echo "Enqueue a job with enqueueSocialJob() and let their device apply it via"
  echo "POST /api/connections/apply-inbound or POST /api/groups/apply-inbound."
  echo "See .cursor/rules/diagnostic-discipline.mdc section 4."
  exit 1
fi

echo "OK: Drive credentials resolved only via resolveOwnerDriveToken"
exit 0
