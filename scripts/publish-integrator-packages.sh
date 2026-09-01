#!/usr/bin/env bash
# Publish @par-noir/oauth-ui then @identity-protocol/identity-sdk for L5 integrators.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building @par-noir/standard-data-points..."
npm run build --workspace=@par-noir/standard-data-points
npm test --workspace=@par-noir/standard-data-points -- --run src/integratorPermissionManifest.gate.test.ts

echo "Building @par-noir/oauth-ui..."
npm run build --workspace=@par-noir/oauth-ui
npm test --workspace=@par-noir/oauth-ui

echo "Building @identity-protocol/identity-sdk..."
npm run build --workspace=@identity-protocol/identity-sdk
npm test --workspace=@identity-protocol/identity-sdk -- --testPathPattern="integratorClients|pnApiClient|integrator-cloud-header|integrator-publish"

echo "Publish manually when ready:"
echo "  npm publish --workspace=@par-noir/oauth-ui --access public"
echo "  npm publish --workspace=@identity-protocol/identity-sdk --access public"
echo ""
echo "External integrators: npm install @identity-protocol/identity-sdk @par-noir/oauth-ui"
echo "See sdk/identity-sdk/README.md for npm install notes."
