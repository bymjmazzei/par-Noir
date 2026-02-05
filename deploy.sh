#!/bin/bash
# Deployment script for Firebase

echo "🚀 Starting deployment..."

# Build id-dashboard
echo "📦 Building id-dashboard..."
cd apps/id-dashboard
npm run build
if [ $? -ne 0 ]; then
    echo "❌ id-dashboard build failed"
    exit 1
fi

# Build aggregator-browser (browse target)
# VITE_PN_CLIENT_ID is required for pN OAuth; default to browser-app when unset (e.g. no .env).
export VITE_PN_CLIENT_ID="${VITE_PN_CLIENT_ID:-browser-app}"
echo "📦 Building aggregator-browser..."
cd ../aggregator-browser
npm run build
if [ $? -ne 0 ]; then
    echo "❌ aggregator-browser build failed"
    exit 1
fi

# Build prism (prism target)
export VITE_PN_CLIENT_ID="${VITE_PN_CLIENT_ID:-prism-app}"
echo "📦 Building prism..."
cd ../prism
npm run build
if [ $? -ne 0 ]; then
    echo "❌ prism build failed"
    exit 1
fi

# Deploy to Firebase (hosting only: id-dashboard + browse + prism)
echo "🔥 Deploying to Firebase..."
cd ../..
firebase deploy --only hosting

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
else
    echo "❌ Deployment failed"
    exit 1
fi

