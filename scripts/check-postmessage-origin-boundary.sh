#!/usr/bin/env bash
# Fail closed: first-party web must not postMessage(..., '*').
#
# Wildcard targetOrigin lets any embedded frame / opener steal messages that
# may carry auth codes or session material. Restrict to a concrete origin.
#
# Worker / BroadcastChannel postMessage (no targetOrigin) are not matched.
# No allowlist — fix the call site.
#
# Set PN_CHECK_ALL=1 to scan the whole tree (CI). Default: staged files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Multiline: postMessage(payload, '*') with optional whitespace/newlines.
# Requires a second argument that is exactly '*' (quoted).
PATTERN='\.postMessage\s*\([^)]*,\s*['\''"]\*['\''"]\s*\)'

hits=""

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  hits=$(rg -n -U --pcre2 -e "$PATTERN" \
    apps packages sdk api/src/templates \
    --glob '*.{ts,tsx,js,jsx,html}' \
    --glob '!**/node_modules/**' \
    --glob '!**/dist/**' \
    --glob '!**/dist-*/**' \
    --glob '!**/*.min.js' \
    2>/dev/null || true)
else
  staged=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
  for file in $staged; do
    case "$file" in
      apps/*|packages/*|sdk/*|api/src/templates/*) ;;
      *) continue ;;
    esac
    case "$file" in
      *.ts|*.tsx|*.js|*.jsx|*.html) ;;
      *) continue ;;
    esac
    [ -f "$file" ] || continue
    match=$(rg -n -U --pcre2 -e "$PATTERN" "$file" 2>/dev/null || true)
    if [ -n "$match" ]; then
      hits="${hits}${match}"$'\n'
    fi
  done
fi

if [ -n "$hits" ]; then
  echo "FAIL: postMessage(..., '*') is forbidden (restrict targetOrigin):"
  printf '%s' "$hits"
  exit 1
fi

echo "OK: no postMessage(..., '*') in first-party web sources"
