#!/usr/bin/env bash
# A Drive-backed request must be built by something that can mint a token.
#
# apps/aggregator-browser exported a synchronous header builder next to an async
# one, with the rule written only in a doc comment. 28 Drive-backed call sites
# reached for the sync one. It can report a Google access token that is already
# fresh but cannot mint a replacement, so the moment the vault copy passed its
# hour those calls went out with no X-PN-Cloud-Access-Token at all and the API
# answered 409 cloud_token_required. The refresh token needed to recover was in
# the envelope the whole time.
#
# The rule is now structural: sync cloud-header builders do not exist in client
# code. Requests go through a fetch wrapper that mints and fails closed
# (ownerFetch / ownerGet), or through the async header builder.
#
# This blocks two shapes of regression:
#   1. Reintroducing a sync cloud-header builder in an app.
#   2. Calling the shared sync ownerCloudHeaders() from client code.
#
# Rule: .cursor/rules/diagnostic-discipline.mdc section 4.
# Set PN_CHECK_ALL=1 to scan the whole repo instead of staged changes (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# The shared synchronous builder. It reports an already-fresh token and cannot
# mint, so client code must not call it. ownerCloudHeadersAsync is the async
# sibling and is deliberately not matched (the trailing boundary excludes it).
SYNC_BUILDER_PATTERN='\bownerCloudHeaders[[:space:]]*[,(}]|\bownerCloudHeaders$'

# An app exporting its own sync header helper. This is the exact shape that grew
# back last time: a sync getXApiHeaders sitting next to an async one. "export
# function" and "export const x = (" are matched; the async forms are not,
# because "async" sits between the keyword and the name.
HEADER_NAME='[A-Za-z0-9_$]*([Aa]piHeaders|[Aa]uthHeaders|[Cc]loudHeaders)'
SYNC_EXPORT_PATTERN="export[[:space:]]+function[[:space:]]+${HEADER_NAME}[[:space:]]*\(|export[[:space:]]+const[[:space:]]+${HEADER_NAME}[[:space:]]*(:[^=]*)?=[[:space:]]*\("

# Files that legitimately own the primitive.
is_canonical() {
  case "$1" in
    packages/device-cloud-credentials/src/ownerCloudHeaders.ts) return 0 ;;
    packages/device-cloud-credentials/src/index.ts) return 0 ;;
    *) return 1 ;;
  esac
}

# Client code only. The API builds no cloud headers and has its own boundary
# check; generated bundles are checked through the source they are built from.
in_scope() {
  case "$1" in
    packages/oauth-ui/static/*) return 1 ;;
    */dist/* | */dist-messaging/* | */node_modules/*) return 1 ;;
    *.test.ts | *.test.tsx | *.spec.ts | *.gate.test.ts) return 1 ;;
    apps/*/src/* | packages/*/src/*) return 0 ;;
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

  if printf '%s' "$content" | grep -qE "$SYNC_BUILDER_PATTERN"; then
    violations="${violations}${file} (calls the sync ownerCloudHeaders, which cannot mint)"$'\n'
  fi

  if printf '%s' "$content" | grep -qE "$SYNC_EXPORT_PATTERN"; then
    violations="${violations}${file} (exports a sync cloud-header builder)"$'\n'
  fi
}

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(cat "$file")"
  done < <(rg -l -e "$SYNC_BUILDER_PATTERN" -e "$SYNC_EXPORT_PATTERN" \
    --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/dist-messaging/**' 2>/dev/null || true)
else
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    # Read the staged content, not the working tree.
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
  echo "Do NOT add a sync header builder back. It can only report a token that is"
  echo "already fresh; it cannot mint one, so the call silently ships without"
  echo "X-PN-Cloud-Access-Token and the API answers 409. Use ownerCloudHeadersAsync"
  echo "if you genuinely need headers rather than a request."
  echo "See .cursor/rules/diagnostic-discipline.mdc section 4."
  exit 1
fi

echo "OK: Drive-backed requests built only by minting wrappers"
exit 0
