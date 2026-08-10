#!/usr/bin/env bash
# Session mint (authorization codes) must not expand trust-the-client unlock.
#
# Ratchet: files in scripts/oauth-unlock-proof-allowlist.txt are grandfathered.
# No NEW file may call generateAuthorizationCode, and no file may introduce the
# "In production, decrypt and verify" stub outside the allowlist. Allowlist
# entries are only ever removed — never added.
#
# Rule: .cursor/rules/auth-trust-boundary.mdc
# Set PN_CHECK_ALL=1 to scan the whole repo instead of staged changes (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOWLIST="scripts/oauth-unlock-proof-allowlist.txt"

# Call sites that mint an authorization code (definition in pnOAuthService is OK).
MINT_PATTERN='generateAuthorizationCode[[:space:]]*\('

# Explicit unfinished-verify stub left on the authenticate path.
STUB_PATTERN='In production, decrypt and verify'

is_canonical() {
  case "$1" in
    api/src/server/modules/pnOAuthService.ts) return 0 ;;
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
    *.ts | *.tsx | *.js | *.jsx | *.html) ;;
    *) return 0 ;;
  esac

  if printf '%s' "$content" | grep -qE "$MINT_PATTERN"; then
    if ! is_canonical "$file" && ! in_list "$ALLOWLIST" "$file"; then
      violations="${violations}${file} (generateAuthorizationCode outside unlock-proof path)"$'\n'
    fi
  fi

  if printf '%s' "$content" | grep -qF "$STUB_PATTERN"; then
    if ! in_list "$ALLOWLIST" "$file"; then
      violations="${violations}${file} (trust-stub comment: In production, decrypt and verify)"$'\n'
    fi
  fi
}

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(cat "$file")"
  done < <(rg -l -e "$MINT_PATTERN" -e "$STUB_PATTERN" --glob '!**/node_modules/**' --glob '!**/dist/**' 2>/dev/null || true)
else
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(git show ":$file" 2>/dev/null || true)"
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

if [ -n "$violations" ]; then
  echo "BLOCKED: OAuth session mint without unlock-proof boundary."
  printf '%s' "$violations" | sed '/^$/d' | sed 's/^/  - /'
  echo
  echo "Authorization codes must require cryptographic unlock proof."
  echo "Do NOT add trust-the-client mint paths or 'verify later' stubs."
  echo "Do NOT add entries to scripts/oauth-unlock-proof-allowlist.txt — only remove."
  echo "See .cursor/rules/auth-trust-boundary.mdc"
  exit 1
fi

echo "OK: OAuth unlock-proof boundary held"
exit 0
