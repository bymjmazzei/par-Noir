#!/usr/bin/env bash
# Extend the owner-fetch boundary:
#   1. (existing) No sync cloud-header builders
#   2. aggregator-browser must not call ownerApiHeadersAsync outside gate modules
#      + burn-down allowlist (scripts/owner-api-headers-allowlist.txt — only shrink)
#   3. aggregator-browser must not raw-fetch Drive owner routes outside gate modules
#
# Rule: .cursor/rules/diagnostic-discipline.mdc section 4 + ADR_DEVICE_CLOUD_CUSTODY.
# Set PN_CHECK_ALL=1 to scan the whole repo instead of staged changes (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SYNC_BUILDER_PATTERN='\bownerCloudHeaders[[:space:]]*[,(}]|\bownerCloudHeaders$'
HEADER_NAME='[A-Za-z0-9_$]*([Aa]piHeaders|[Aa]uthHeaders|[Cc]loudHeaders)'
SYNC_EXPORT_PATTERN="export[[:space:]]+function[[:space:]]+${HEADER_NAME}[[:space:]]*\(|export[[:space:]]+const[[:space:]]+${HEADER_NAME}[[:space:]]*(:[^=]*)?=[[:space:]]*\("

HEADERS_ASYNC_PATTERN='\bownerApiHeadersAsync[[:space:]]*\('
HEADERS_ALLOWLIST="scripts/owner-api-headers-allowlist.txt"

# Raw fetch to Drive-backed owner routes (API_ENDPOINT or absolute path forms).
DRIVE_ROUTE_FETCH_PATTERN='fetch[[:space:]]*\([[:space:]]*`\$\{API_ENDPOINT\}/api/(connections|messages|groups|notifications|drive|storage/(blobs|owner-index|initialize))'

is_canonical_sync() {
  case "$1" in
    packages/device-cloud-credentials/src/ownerCloudHeaders.ts) return 0 ;;
    packages/device-cloud-credentials/src/index.ts) return 0 ;;
    *) return 1 ;;
  esac
}

is_gate_module() {
  case "$1" in
    apps/aggregator-browser/src/services/ownerApiFetch.ts) return 0 ;;
    apps/aggregator-browser/src/services/ownerApiHeaders.ts) return 0 ;;
    apps/aggregator-browser/src/services/messageAuthFetch.ts) return 0 ;;
    *) return 1 ;;
  esac
}

in_scope() {
  case "$1" in
    packages/oauth-ui/static/*) return 1 ;;
    */dist/* | */dist-messaging/* | */node_modules/*) return 1 ;;
    *.test.ts | *.test.tsx | *.spec.ts | *.gate.test.ts) return 1 ;;
    apps/*/src/* | packages/*/src/*) return 0 ;;
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

  in_scope "$file" || return 0

  if ! is_canonical_sync "$file"; then
    if printf '%s' "$content" | grep -qE "$SYNC_BUILDER_PATTERN"; then
      violations="${violations}${file} (calls the sync ownerCloudHeaders, which cannot mint)"$'\n'
    fi
    if printf '%s' "$content" | grep -qE "$SYNC_EXPORT_PATTERN"; then
      violations="${violations}${file} (exports a sync cloud-header builder)"$'\n'
    fi
  fi

  # ownerApiHeadersAsync only in gate modules or burn-down allowlist
  case "$file" in
    apps/aggregator-browser/src/*)
      if printf '%s' "$content" | grep -qE "$HEADERS_ASYNC_PATTERN"; then
        if ! is_gate_module "$file" && ! in_list "$HEADERS_ALLOWLIST" "$file"; then
          violations="${violations}${file} (ownerApiHeadersAsync outside ownerFetch/messageFetch gate)"$'\n'
        fi
      fi
      if printf '%s' "$content" | grep -qE "$DRIVE_ROUTE_FETCH_PATTERN"; then
        if ! is_gate_module "$file"; then
          violations="${violations}${file} (raw fetch to Drive owner route — use ownerFetch/ownerGet/messageFetch)"$'\n'
        fi
      fi
      ;;
  esac
}

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(cat "$file")"
  done < <(
    {
      rg -l -e "$SYNC_BUILDER_PATTERN" -e "$SYNC_EXPORT_PATTERN" -e "$HEADERS_ASYNC_PATTERN" \
        --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/dist-messaging/**' 2>/dev/null || true
      rg -l -e 'fetch[[:space:]]*\([[:space:]]*`\$\{API_ENDPOINT\}/api/(connections|messages|groups|notifications|drive|storage/(blobs|owner-index|initialize))' \
        apps/aggregator-browser/src --glob '*.ts' --glob '*.tsx' 2>/dev/null || true
    } | sort -u
  )
else
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(git show ":$file" 2>/dev/null || true)"
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

if [ -n "$violations" ]; then
  echo "BLOCKED: a Drive-backed request could be built without a mintable token."
  printf '%s' "$violations" | sed '/^$/d' | sed 's/^/  - /'
  echo
  echo "Drive-backed calls go through a wrapper that mints and fails closed:"
  echo "  aggregator-browser: ownerFetch() / ownerGet() in services/ownerApiFetch.ts"
  echo "  id-dashboard:       ownerFetch() / ownerGet() in services/ownerApiService.ts"
  echo "  non-Drive calls:    apiFetch() / apiGet(), bearer only"
  echo
  echo "Do NOT add ownerApiHeadersAsync at new call sites — migrate to ownerFetch."
  echo "Do NOT grow scripts/owner-api-headers-allowlist.txt — only remove entries."
  echo "See .cursor/rules/diagnostic-discipline.mdc section 4."
  exit 1
fi

echo "OK: Drive-backed requests built only by minting wrappers"
exit 0
