#!/usr/bin/env bash
# Ban dual Drive-token helpers below the route layer + soft-null write assembly.
#
# resolveOwnerDriveToken / requireOwnerDriveContextFromReq are the only sanctioned
# token paths for writes. Soft layout probes live in recoveryDriveContext +
# ownerStorageContext (canonical via is_soft_probe_canonical - not allowlisted).
#
# Also bans single-arg getOwnerStorageContext(pn) outside the probe module and
# tests - that pattern soft-nulls under custody and hides missing ATs on write paths.
# scripts/dual-drive-helper-allowlist.txt is EMPTY (remove-only if ever needed again).
#
# Set PN_CHECK_ALL=1 for full-repo scan (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOWLIST="scripts/dual-drive-helper-allowlist.txt"

is_canonical() {
  case "$1" in
    api/src/server/modules/ownerDriveToken.ts) return 0 ;;
    api/src/server/modules/ownerDriveContext.ts) return 0 ;;
    api/src/server/modules/messagingMediaService.ts) return 0 ;;
    *) return 1 ;;
  esac
}

# Probe modules may call single-arg getOwnerStorageContext / softMissingToken.
is_soft_probe_canonical() {
  case "$1" in
    api/src/server/modules/storage/ownerStorageContext.ts) return 0 ;;
    api/src/server/modules/recoveryDriveContext.ts) return 0 ;;
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

# Soft assembly: getOwnerStorageContext(...) with no second argument (no comma on the call line).
line_is_soft_owner_storage() {
  local line="$1"
  echo "$line" | grep -qE 'getOwnerStorageContext[[:space:]]*\(' || return 1
  echo "$line" | grep -qE 'typeof getOwnerStorageContext|import.*getOwnerStorageContext' && return 1
  # Any comma on the call line => opts / { accessToken } (nested normalizePn is fine)
  echo "$line" | grep -q ',' && return 1
  return 0
}

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

  if ! is_soft_probe_canonical "$file"; then
    while IFS= read -r line; do
      if line_is_soft_owner_storage "$line"; then
        violations="${violations}${file} (soft getOwnerStorageContext without accessToken - fail closed or pass AT)"$'\n'
        break
      fi
    done <<< "$content"
  fi
}

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(cat "$file")"
  done < <(
    {
      rg -l -e '\bgetOwnerDriveContext[[:space:]]*\(' api/src/server/modules --glob '*.ts' --glob '!*.test.ts' 2>/dev/null || true
      rg -l -e 'getOwnerStorageContext[[:space:]]*\(' api/src/server/modules --glob '*.ts' --glob '!*.test.ts' 2>/dev/null || true
    } | sort -u
  )
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
  echo "BLOCKED: dual Drive-token helper or soft-null owner storage assembly."
  printf '%s' "$violations" | sed '/^$/d' | sed 's/^/  - /'
  echo
  echo "Use resolveOwnerDriveToken / requireOwnerDriveContextFromReq for writes."
  echo "Pass { accessToken } into getOwnerStorageContext, or use hasOwnerStorage for probes."
  echo "Do not grow scripts/dual-drive-helper-allowlist.txt."
  echo "See docs/architecture/ADR_DEVICE_CLOUD_CUSTODY.md (Owner Drive path)."
  exit 1
fi

echo "OK: no banned dual Drive-token helpers / soft owner-storage writes"
exit 0
