#!/usr/bin/env bash
# Build monorepo packages the API imports — build only, no per-package npm install.
# Per-package `npm install` walks into root workspaces and reinstalls apps/* (hangs on Railway).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API="$ROOT/api"

if [[ ! -f "$API/node_modules/typescript/bin/tsc" ]]; then
  echo "❌ Missing api typescript — run npm ci in api/ first"
  exit 1
fi

export PATH="$API/node_modules/.bin:$PATH"

# Order: leaf packages before dependents
PACKAGES=(
  pqc-crypto
  recovery-crypto
  device-auth
  standard-data-points
  aggregator-domain
  dm-crypto
  zk-protocol-v1
  zk-protocol-v2
  user-owned-storage
  identity-migration
  storage-migration
)

for pkg in "${PACKAGES[@]}"; do
  dir="$ROOT/packages/$pkg"
  echo "📦 Building packages/$pkg..."
  if [[ ! -f "$dir/package.json" ]]; then
    echo "❌ Missing $dir/package.json"
    exit 1
  fi
  (cd "$dir" && npm run build)
done

echo "✅ Workspace deps built"
