#!/usr/bin/env bash
# Apps must not import @identity-protocol/identity-core (or path into core/identity-core).
# Canonical identity crypto is @par-noir/identity-crypto (+ @par-noir/pqc-crypto).
#
# No allowlist. Violations fail.
# Rule: .cursor/rules/rebuild-not-patch.mdc, .cursor/rules/auth-trust-boundary.mdc
# Set PN_CHECK_ALL=1 to scan the whole apps tree (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Package name or relative/absolute path into the legacy tree.
IMPORT_PATTERN='@identity-protocol/identity-core|core/identity-core'

violations=""

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  hits=$(rg -n --glob '*.ts' --glob '*.tsx' --glob '!**/node_modules/**' \
    "$IMPORT_PATTERN" apps 2>/dev/null || true)
else
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    staged=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E '^apps/.*\.(ts|tsx)$' || true)
    hits=""
    if [ -n "$staged" ]; then
      while IFS= read -r file; do
        [ -f "$file" ] || continue
        match=$(rg -n "$IMPORT_PATTERN" "$file" 2>/dev/null || true)
        if [ -n "$match" ]; then
          hits="${hits}${match}"$'\n'
        fi
      done <<< "$staged"
    fi
  else
    hits=$(rg -n --glob '*.ts' --glob '*.tsx' "$IMPORT_PATTERN" apps 2>/dev/null || true)
  fi
fi

if [ -n "${hits:-}" ]; then
  violations="${violations}disallowed @identity-protocol/identity-core (or core/identity-core) import in apps/:"$'\n'"${hits}"$'\n'
fi

if [ -n "$violations" ]; then
  echo "FAIL: check-no-identity-core-in-apps"
  printf '%s' "$violations"
  echo "Use @par-noir/identity-crypto. Do not import the legacy identity-core package from apps."
  exit 1
fi

echo "OK: check-no-identity-core-in-apps"
