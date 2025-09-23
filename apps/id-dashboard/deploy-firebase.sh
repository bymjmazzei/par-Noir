#!/bin/bash

# Firebase Deployment Script with Auto-Input
# This script automatically provides the required inputs to avoid freezing

echo "🚀 Deploying par Noir to Firebase..."

# Navigate to project directory
cd /Users/gamit/pages/par-Noir/apps/id-dashboard

# Build the project first
echo "📦 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful!"

# Deploy Firebase Functions with auto-input
echo "🔥 Deploying Firebase Functions..."
echo "7" | firebase deploy --only functions

if [ $? -eq 0 ]; then
    echo "✅ Firebase Functions deployed successfully!"
else
    echo "❌ Firebase Functions deployment failed!"
    exit 1
fi

# Deploy Firebase Hosting
echo "🌐 Deploying Firebase Hosting..."
firebase deploy --only hosting

if [ $? -eq 0 ]; then
    echo "✅ Firebase Hosting deployed successfully!"
else
    echo "❌ Firebase Hosting deployment failed!"
    exit 1
fi

echo ""
echo "🎉 Deployment completed successfully!"
echo "🌐 Your app is live at: https://pn.parnoir.com"
echo "🔥 Firebase Functions: https://us-central1-par-noir-dashboard.cloudfunctions.net"
echo ""
echo "📋 Available Google Drive Functions:"
echo "  • googleDriveAuthUrl"
echo "  • googleDriveAuthCallback" 
echo "  • googleDriveStatus"
echo "  • googleDriveListFiles"
echo "  • googleDriveUpload"
echo "  • googleDriveDeleteFile"
echo "  • googleDriveSignOut"
echo ""
echo "✅ Google Drive integration is now ready to use!"
