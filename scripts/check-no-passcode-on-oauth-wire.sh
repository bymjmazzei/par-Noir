#!/usr/bin/env bash
# Passcode must not be sent to the API for OAuth authenticate.
#
# Ratchet: files in scripts/passcode-oauth-wire-allowlist.txt are grandfathered.
# No NEW file may POST passcode to /oauth/authorize/authenticate. Allowlist
# entries are only ever removed — never added.
#
# Rule: .cursor/rules/auth-trust-boundary.mdc
# Set PN_CHECK_ALL=1 to scan the whole repo instead of staged changes (CI).
#
# IMPORTANT: Root .gitignore ignores `public/`, so plain `rg` skips
# apps/*/public/oauth-authorize.html. Full scans use --no-ignore and only
# exclude node_modules / dist / .git.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOWLIST="scripts/passcode-oauth-wire-allowlist.txt"
# String literal / template URL to authenticate — not JSDoc comments alone.
AUTH_URL_PATTERN='['\''"`][^'\''"`\n]*oauth/authorize/authenticate[^'\''"`\n]*['\''"`]'
# JSON body field — not TypeScript type annotations alone (those use "passcode: string").
PASSCODE_BODY_PATTERN='passcode:[[:space:]]*(input\.|params\.|passcode|options\.|creds\.|credentials\.|[a-zA-Z_$][a-zA-Z0-9_$]*[,}])'

# Also refuse reintroduction of self-hosted OAuth unlock redirects (normalize plan).
SELF_HOSTED_PATTERN='SELF_HOSTED_UNLOCK_CLIENT_IDS'

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
    *.ts | *.tsx | *.js | *.jsx | *.html) ;;
    *) return 0 ;;
  esac

  # Only flag files that call the authenticate endpoint (URL in a string/template).
  if ! printf '%s' "$content" | grep -qE "$AUTH_URL_PATTERN"; then
    return 0
  fi

  if printf '%s' "$content" | grep -qE "$PASSCODE_BODY_PATTERN"; then
    if ! in_list "$ALLOWLIST" "$file"; then
      violations="${violations}${file} (passcode in OAuth authenticate request body)"$'\n'
    fi
  fi
}

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(cat "$file")"
  done < <(rg -l --no-ignore -e 'oauth/authorize/authenticate' \
    --glob '!**/node_modules/**' \
    --glob '!**/dist/**' \
    --glob '!**/dist-*/**' \
    --glob '!**/.git/**' \
    2>/dev/null || true)

  # Fail closed if self-hosted OAuth unlock client redirect reappears in source.
  if rg -n --no-ignore -e "$SELF_HOSTED_PATTERN" \
    --glob '!**/node_modules/**' \
    --glob '!**/dist/**' \
    --glob '!**/dist-*/**' \
    --glob '!**/.git/**' \
    --glob '!**/scripts/check-no-passcode-on-oauth-wire.sh' \
    --glob '!**/docs/**' \
    --glob '!**/.cursor/**' \
    2>/dev/null | grep -q .; then
    violations="${violations}SELF_HOSTED_UNLOCK_CLIENT_IDS reintroduced (OAuth unlock must use API /oauth/consent)"$'\n'
  fi
else
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(git show ":$file" 2>/dev/null || true)"
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

if [ -n "$violations" ]; then
  echo "BLOCKED: passcode sent on OAuth authenticate wire."
  printf '%s' "$violations" | sed '/^$/d' | sed 's/^/  - /'
  echo
  echo "Passcode must never leave the device for /oauth/authorize/authenticate."
  echo "Do NOT add entries to scripts/passcode-oauth-wire-allowlist.txt — only remove."
  echo "See .cursor/rules/auth-trust-boundary.mdc"
  exit 1
fi

echo "OK: no new passcode-on-OAuth-authenticate wire paths"
exit 0
