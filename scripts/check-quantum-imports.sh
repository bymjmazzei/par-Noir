#!/usr/bin/env bash
# Block production imports of quarantined experimental quantum code (identity-core).
# Tests may import; apps must not.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BAD=$(
  grep -R "encryption/quantum" --include="*.ts" --include="*.tsx" "$ROOT/apps" "$ROOT/packages/oauth-ui/src" "$ROOT/sdk" 2>/dev/null | grep -v "\.test\." | grep -v "/test/" || true
)
if [[ -n "$BAD" ]]; then
  echo "Disallowed import of quarantined identity-core quantum path in app/sdk code:"
  echo "$BAD"
  exit 1
fi

# Block legacy secp256k1 ZK proof generators in app code (ZK v1 lives in @par-noir/zk-protocol-v1).
BAD_ZK=$(
  grep -R "schnorrProofGenerator\|pedersenProofGenerator\|/zk-proofs/modules/schnorr\|/zk-proofs/modules/pedersen" \
    --include="*.ts" --include="*.tsx" "$ROOT/apps" "$ROOT/packages/oauth-ui/src" 2>/dev/null | grep -v "\.test\." | grep -v "/test/" | grep -v "node_modules" || true
)
if [[ -n "$BAD_ZK" ]]; then
  echo "Disallowed legacy ZK proof module import in app packages (use @par-noir/zk-protocol-v1):"
  echo "$BAD_ZK"
  exit 1
fi

echo "check-quantum-imports: ok"
