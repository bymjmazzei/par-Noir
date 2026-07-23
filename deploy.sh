#!/bin/bash
# Deployment script for Firebase

echo "🚀 Starting deployment..."

# All Vite apps require VITE_API_ENDPOINT in production builds (see apps/*/src/config/api.ts).
# Export once so every `npm run build` inherits it. Override for staging: VITE_API_ENDPOINT=https://… ./deploy.sh
export VITE_API_ENDPOINT="${VITE_API_ENDPOINT:-https://api.parnoir.com}"
echo "📌 Using VITE_API_ENDPOINT=$VITE_API_ENDPOINT (set env before ./deploy.sh to override)"

# PQC crypto (dashboard + API + apps depend on dist/)
echo "📦 Building packages/pqc-crypto..."
cd packages/pqc-crypto
npm run build
if [ $? -ne 0 ]; then
    echo "❌ pqc-crypto build failed"
    exit 1
fi

echo "📦 Building packages/recovery-crypto..."
cd ../recovery-crypto
npm run build
if [ $? -ne 0 ]; then
    echo "❌ recovery-crypto build failed"
    exit 1
fi

echo "📦 Building packages/device-auth..."
cd ../device-auth
npm run build
if [ $? -ne 0 ]; then
    echo "❌ device-auth build failed"
    exit 1
fi

echo "📦 Building packages/device-client..."
cd ../device-client
npm run build
if [ $? -ne 0 ]; then
    echo "❌ device-client build failed"
    exit 1
fi

# Shared catalog (API server + workspace consumers use dist/)
echo "📦 Building packages/standard-data-points..."
cd ../standard-data-points
npm run build
if [ $? -ne 0 ]; then
    echo "❌ standard-data-points build failed"
    exit 1
fi

# Shared UI + messaging crypto (dashboard + aggregator import dist/)
echo "📦 Building packages/oauth-ui..."
cd ../oauth-ui
npm run build
if [ $? -ne 0 ]; then
    echo "❌ oauth-ui build failed"
    exit 1
fi

echo "📦 Building packages/dm-crypto..."
cd ../dm-crypto
npm run build
if [ $? -ne 0 ]; then
    echo "❌ dm-crypto build failed"
    exit 1
fi

echo "📦 Building packages/aggregator-domain..."
cd ../aggregator-domain
npm run build
if [ $? -ne 0 ]; then
    echo "❌ aggregator-domain build failed"
    exit 1
fi

echo "📦 Building packages/zk-protocol-v2..."
cd ../zk-protocol-v2
npm run build
if [ $? -ne 0 ]; then
    echo "❌ zk-protocol-v2 build failed"
    exit 1
fi

echo "📦 Building packages/identity-migration..."
cd ../identity-migration
npm run build
if [ $? -ne 0 ]; then
    echo "❌ identity-migration build failed"
    exit 1
fi

echo "📦 Building packages/user-owned-storage..."
cd ../user-owned-storage
npm run build
if [ $? -ne 0 ]; then
    echo "❌ user-owned-storage build failed"
    exit 1
fi

echo "📦 Building packages/device-cloud-credentials..."
cd ../device-cloud-credentials
npm run build
if [ $? -ne 0 ]; then
    echo "❌ device-cloud-credentials build failed"
    exit 1
fi

# Fail deploy if app TypeScript is unclean (Vite does not typecheck).
echo "🔎 Type-checking id-dashboard..."
cd ../../apps/id-dashboard
npm run type-check
if [ $? -ne 0 ]; then
    echo "❌ id-dashboard type-check failed"
    exit 1
fi

echo "🔎 Type-checking aggregator-browser..."
cd ../aggregator-browser
npm run type-check
if [ $? -ne 0 ]; then
    echo "❌ aggregator-browser type-check failed"
    exit 1
fi

# Build id-dashboard
echo "📦 Building id-dashboard..."
cd ../id-dashboard
npm run build
if [ $? -ne 0 ]; then
    echo "❌ id-dashboard build failed"
    exit 1
fi

# Build aggregator-browser (browse target)
# Do not `export` VITE_PN_CLIENT_ID: a single export would leak browser-app into prism / developer-portal builds.
echo "📦 Building aggregator-browser..."
cd ../aggregator-browser
VITE_PN_CLIENT_ID="${VITE_PN_CLIENT_ID:-browser-app}" npm run build
if [ $? -ne 0 ]; then
    echo "❌ aggregator-browser build failed"
    exit 1
fi

echo "📦 Building aggregator-browser (messaging → dist-messaging)..."
VITE_PN_CLIENT_ID="${VITE_PN_CLIENT_ID:-browser-app}" npm run build:messaging
if [ $? -ne 0 ]; then
    echo "❌ aggregator-browser messaging build failed"
    exit 1
fi

# Build prism (prism target)
echo "📦 Building prism..."
cd ../prism
VITE_PN_CLIENT_ID="${VITE_PN_CLIENT_ID:-prism-app}" npm run build
if [ $? -ne 0 ]; then
    echo "❌ prism build failed"
    exit 1
fi

# Build licensing-portal (licensing target)
echo "📦 Building licensing-portal..."
cd ../licensing-portal
VITE_PN_CLIENT_ID="${VITE_PN_CLIENT_ID:-licensing-portal}" npm run build
if [ $? -ne 0 ]; then
    echo "❌ licensing-portal build failed"
    exit 1
fi

# Build developer-portal (developers.parnoir.com → Firebase site developers-parnoir)
echo "📦 Building developer-portal..."
cd ../developer-portal
VITE_PN_CLIENT_ID="${VITE_PN_CLIENT_ID:-developer-portal}" npm run build
if [ $? -ne 0 ]; then
    echo "❌ developer-portal build failed"
    exit 1
fi

# Deploy to Firebase (hosting: id-dashboard + browse + messaging + prism + licensing + developer)
echo "🔥 Deploying to Firebase..."
cd ../..
firebase deploy --only hosting

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
else
    echo "❌ Deployment failed"
    exit 1
fi

