#!/usr/bin/env bash
# Publish @par-noir/oauth-ui then @identity-protocol/identity-sdk for L5 integrators.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building @par-noir/oauth-ui..."
npm run build --workspace=@par-noir/oauth-ui

echo "Building @identity-protocol/identity-sdk..."
npm run build --workspace=@identity-protocol/identity-sdk
npm test --workspace=@identity-protocol/identity-sdk -- --testPathPattern="integratorClients|pnApiClient"

echo "Publish manually when ready:"
echo "  npm publish --workspace=@par-noir/oauth-ui --access public"
echo "  npm publish --workspace=@identity-protocol/identity-sdk --access public"
