#!/bin/bash
# Deployment script for Firebase

echo "🚀 Starting deployment..."

# Build frontend
echo "📦 Building frontend..."
cd apps/id-dashboard
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

# Deploy to Firebase (hosting only, functions not configured)
echo "🔥 Deploying to Firebase..."
firebase deploy --only hosting

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
else
    echo "❌ Deployment failed"
    exit 1
fi

