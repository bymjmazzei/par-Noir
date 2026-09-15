#!/usr/bin/env bash
# Ban dual Drive-token helpers below the route layer.
#
# resolveOwnerDriveToken / requireOwnerDriveContextFromReq are the only sanctioned
# token paths. New getOwnerDriveContext / bare messaging dual helpers must not return.
#
# Soft layout probes live in recoveryDriveContext + ownerStorageContext (allowlisted).
# Entries in scripts/dual-drive-helper-allowlist.txt are only ever REMOVED.
#
# Set PN_CHECK_ALL=1 for full-repo scan (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOWLIST="scripts/dual-drive-helper-allowlist.txt"
# Banned dual helper names (definition or call).
PATTERN='\b(getOwnerDriveContext|resolveMessagingOwnerDriveLayout)[[:space:]]*\('

# recoveryDriveContext + ownerStorageContext are allowlisted as soft probes.
# Ban reintroduction of getOwnerDriveContext anywhere.

is_canonical() {
  case "$1" in
    api/src/server/modules/ownerDriveToken.ts) return 0 ;;
    api/src/server/modules/ownerDriveContext.ts) return 0 ;;
    api/src/server/modules/messagingMediaService.ts) return 0 ;; # resolveMessagingOwnerDriveLayout lives here (forwarded AT only)
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
    api/src/server/modules/*.ts | api/src/server/modules/**/*.ts) ;;
    *) return 0 ;;
  esac
  case "$file" in
    *.test.ts | *.gate.test.ts) return 0 ;;
  esac

  if printf '%s' "$content" | grep -qE '\bgetOwnerDriveContext[[:space:]]*\('; then
    if ! is_canonical "$file" && ! in_list "$ALLOWLIST" "$file"; then
      violations="${violations}${file} (getOwnerDriveContext dual helper)"$'\n'
    fi
  fi
}

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(cat "$file")"
  done < <(rg -l -e '\bgetOwnerDriveContext[[:space:]]*\(' api/src/server/modules --glob '*.ts' --glob '!*.test.ts' 2>/dev/null || true)
else
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    case "$file" in
      api/src/server/modules/*) ;;
      *) continue ;;
    esac
    check_file "$file" "$(git show ":$file" 2>/dev/null || true)"
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

if [ -n "$violations" ]; then
  echo "BLOCKED: dual Drive-token helper below the route layer."
  printf '%s' "$violations" | sed '/^$/d' | sed 's/^/  - /'
  echo
  echo "Use resolveOwnerDriveToken / requireOwnerDriveContextFromReq only."
  echo "Do not grow scripts/dual-drive-helper-allowlist.txt."
  echo "See docs/architecture/ADR_DEVICE_CLOUD_CUSTODY.md (Owner Drive path)."
  exit 1
fi

echo "OK: no banned dual Drive-token helpers"
exit 0
