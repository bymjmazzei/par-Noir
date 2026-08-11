#!/usr/bin/env bash
# Block reintroduction of app-local RSA IdentityManager / DIDManager stacks.
# Canonical identity crypto is @par-noir/identity-crypto (+ @par-noir/pqc-crypto).
#
# Rule: .cursor/rules/auth-trust-boundary.mdc, .cursor/rules/enforcement.mdc
# Set PN_CHECK_ALL=1 to scan the whole repo (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# These paths must not exist (deleted orphan RSA identity stack).
FORBIDDEN_FILES=(
  "apps/id-dashboard/src/utils/crypto/identityManager.ts"
  "apps/id-dashboard/src/utils/crypto/didManager.ts"
  "apps/id-dashboard/src/utils/crypto/identityCrypto.ts"
  "apps/id-dashboard/src/utils/crypto/tokenManager.ts"
)

violations=""

for f in "${FORBIDDEN_FILES[@]}"; do
  if [ -f "$f" ]; then
    violations="${violations}forbidden file present: ${f}"$'\n'
  fi
done

# No imports of the deleted modules (or IdentityManager/DIDManager from dashboard crypto).
IMPORT_PATTERN='utils/crypto/(identityManager|didManager|identityCrypto|tokenManager)|from ['\''\"].*/(identityManager|didManager|tokenManager)['\''\"]'

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  hits=$(rg -n --glob '*.ts' --glob '*.tsx' --glob '!**/node_modules/**' \
    --glob '!**/scripts/check-legacy-identity-crypto.sh' \
    "$IMPORT_PATTERN" apps packages sdk 2>/dev/null || true)
else
  # Staged files only when available
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    staged=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
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
    hits=$(rg -n --glob '*.ts' --glob '*.tsx' "$IMPORT_PATTERN" apps packages sdk 2>/dev/null || true)
  fi
fi

if [ -n "${hits:-}" ]; then
  violations="${violations}disallowed legacy identity crypto import:"$'\n'"${hits}"$'\n'
fi

# RSA-OAEP must not reappear as DID/identity keygen under dashboard crypto helpers.
RSA_HITS=$(rg -n 'RSA-OAEP' apps/id-dashboard/src/utils/crypto --glob '*.ts' --glob '*.tsx' 2>/dev/null || true)
if [ -n "$RSA_HITS" ]; then
  violations="${violations}RSA-OAEP under apps/id-dashboard/src/utils/crypto (use @par-noir/identity-crypto):"$'\n'"${RSA_HITS}"$'\n'
fi

if [ -n "$violations" ]; then
  echo "FAIL: check-legacy-identity-crypto"
  printf '%s' "$violations"
  echo "Do not reintroduce app-local IdentityManager/DIDManager. Use @par-noir/identity-crypto."
  exit 1
fi

echo "OK: check-legacy-identity-crypto"
