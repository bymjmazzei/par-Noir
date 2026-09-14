#!/usr/bin/env bash
# Apps must not import @identity-protocol/identity-core (or path into core/identity-core)
# and must not depend on @identity-protocol/identity-sdk at runtime.
# Canonical identity crypto is @par-noir/identity-crypto (+ @par-noir/pqc-crypto).
# Portal OAuth session helpers live in @par-noir/oauth-ui.
#
# No allowlist. Violations fail.
# Rule: .cursor/rules/rebuild-not-patch.mdc, .cursor/rules/auth-trust-boundary.mdc
# Set PN_CHECK_ALL=1 to scan the whole apps tree (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Package name or relative/absolute path into the legacy tree.
IMPORT_PATTERN='@identity-protocol/identity-core|core/identity-core'
SDK_IMPORT_PATTERN='@identity-protocol/identity-sdk'

violations=""

collect_hits() {
  local pattern="$1"
  local hits=""
  if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
    hits=$(rg -n --glob '*.ts' --glob '*.tsx' --glob '!**/node_modules/**' \
      "$pattern" apps 2>/dev/null || true)
  else
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      staged=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E '^apps/.*\.(ts|tsx)$' || true)
      hits=""
      if [ -n "$staged" ]; then
        while IFS= read -r file; do
          [ -f "$file" ] || continue
          match=$(rg -n "$pattern" "$file" 2>/dev/null || true)
          if [ -n "$match" ]; then
            hits="${hits}${match}"$'\n'
          fi
        done <<< "$staged"
      fi
    else
      hits=$(rg -n --glob '*.ts' --glob '*.tsx' "$pattern" apps 2>/dev/null || true)
    fi
  fi
  printf '%s' "$hits"
}

hits=$(collect_hits "$IMPORT_PATTERN")
if [ -n "${hits:-}" ]; then
  violations="${violations}disallowed @identity-protocol/identity-core (or core/identity-core) import in apps/:"$'\n'"${hits}"$'\n'
fi

sdk_hits=$(collect_hits "$SDK_IMPORT_PATTERN")
# Real TS import statements only (line content starts with import). Doc samples embed import in strings.
sdk_import_hits=$(printf '%s' "$sdk_hits" | rg ':[0-9]+:\s*import\s+.+\s+from\s+['\''"]@identity-protocol/identity-sdk['\''"]' || true)
if [ -z "${sdk_import_hits:-}" ]; then
  sdk_import_hits=$(printf '%s' "$sdk_hits" | rg ':[0-9]+:\s*require\(['\''"]@identity-protocol/identity-sdk['\''"]\)' || true)
fi
if [ -n "${sdk_import_hits:-}" ]; then
  violations="${violations}disallowed @identity-protocol/identity-sdk runtime import in apps/:"$'\n'"${sdk_import_hits}"$'\n'
fi

# package.json dependency under apps/
pkg_hits=$(rg -n '"@identity-protocol/identity-sdk"' apps/*/package.json 2>/dev/null || true)
if [ -n "${pkg_hits:-}" ]; then
  violations="${violations}disallowed @identity-protocol/identity-sdk dependency in apps/*/package.json:"$'\n'"${pkg_hits}"$'\n'
fi

if [ -n "$violations" ]; then
  echo "FAIL: check-no-identity-core-in-apps"
  printf '%s' "$violations"
  echo "Use @par-noir/identity-crypto / @par-noir/oauth-ui. Do not import identity-core or identity-sdk from apps."
  exit 1
fi

echo "OK: check-no-identity-core-in-apps"
