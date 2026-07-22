#!/usr/bin/env bash
# Build monorepo packages the API imports (Railway-safe).
# Avoids workspace-wide npm install (hangs by pulling apps/*).
# Each package gets an isolated install + pinned tsc/@types/node for cold builds.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API="$ROOT/api"

# Pin below TS 5.7 Uint8Array/BufferSource DOM breakage for WebCrypto call sites.
TSC_PIN="typescript@5.4.5"
TYPES_NODE_PIN="@types/node@20.17.10"

if [[ ! -d "$API/node_modules" ]]; then
  echo "❌ Missing api/node_modules — run npm ci in api/ first"
  exit 1
fi

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
  (
    cd "$dir"
    npm install --ignore-scripts --workspaces=false
    npm install --ignore-scripts --workspaces=false --no-save "$TSC_PIN" "$TYPES_NODE_PIN"
    export PATH="$dir/node_modules/.bin:$PATH"
    npm run build
  )
done

echo "✅ Workspace deps built"
