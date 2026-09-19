#!/usr/bin/env bash
# Build + gate L5 integrator packages for npm publish.
# Publishes nothing by default — prints the ordered npm publish commands when gates pass.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail_file_deps() {
  local pkg_json="$1"
  local name
  name="$(node -e "console.log(require('$pkg_json').name)")"
  if node -e "
    const p = require('$pkg_json');
    const deps = { ...(p.dependencies||{}), ...(p.optionalDependencies||{}) };
    const bad = Object.entries(deps).filter(([,v]) => typeof v === 'string' && v.startsWith('file:'));
    if (bad.length) {
      console.error('file: dependencies not allowed for publish in $name:');
      for (const [k,v] of bad) console.error('  ' + k + ': ' + v);
      process.exit(1);
    }
  "; then
    echo "OK: no file: deps in $name"
  else
    exit 1
  fi
}

echo "=== Gate: no file: deps on publish surface ==="
fail_file_deps "$ROOT/packages/oauth-ui/package.json"
fail_file_deps "$ROOT/sdk/identity-sdk/package.json"

echo "Building dependency packages..."
npm run build --workspace=@par-noir/standard-data-points
npm run build --workspace=@par-noir/user-owned-storage
npm run build --workspace=@par-noir/pqc-crypto
npm run build --workspace=@par-noir/device-cloud-credentials
npm run build --workspace=@par-noir/aggregator-domain
npm run build --workspace=@par-noir/zk-protocol-v1 2>/dev/null || true
npm run build --workspace=@par-noir/zk-protocol-v2 2>/dev/null || true
npm run build --workspace=@identity-protocol/identity-core 2>/dev/null || true

echo "Building @par-noir/standard-data-points tests..."
npm test --workspace=@par-noir/standard-data-points -- --run src/integratorPermissionManifest.gate.test.ts

echo "Building @par-noir/oauth-ui..."
npm run build --workspace=@par-noir/oauth-ui
npm test --workspace=@par-noir/oauth-ui

echo "Building @identity-protocol/identity-sdk..."
npm run build --workspace=@identity-protocol/identity-sdk
npm test --workspace=@identity-protocol/identity-sdk -- --testPathPattern="integratorClients|pnApiClient|integrator-cloud-header|integrator-publish"

echo ""
echo "Gates passed. Publish manually in this order (requires npm login + public access):"
echo "  # 1. Leaf / shared deps (if not already on the registry)"
echo "  npm publish --workspace=@par-noir/user-owned-storage --access public"
echo "  npm publish --workspace=@par-noir/pqc-crypto --access public"
echo "  npm publish --workspace=@par-noir/device-cloud-credentials --access public"
echo "  npm publish --workspace=@par-noir/aggregator-domain --access public"
echo "  npm publish --workspace=@par-noir/zk-protocol-v1 --access public"
echo "  npm publish --workspace=@par-noir/zk-protocol-v2 --access public"
echo "  npm publish --workspace=@identity-protocol/identity-core --access public"
echo "  # 2. Integrator kit"
echo "  npm publish --workspace=@par-noir/oauth-ui --access public"
echo "  npm publish --workspace=@identity-protocol/identity-sdk --access public"
echo ""
echo "External integrators:"
echo "  npm install @identity-protocol/identity-sdk @par-noir/oauth-ui"
echo "See sdk/identity-sdk/PUBLISHING.md"
