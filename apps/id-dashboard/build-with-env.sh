#!/bin/bash

echo "🚀 Building Par Noir with environment variables..."

# Set environment variables for the build
# These should be set by your CI/CD pipeline or deployment environment
export REACT_APP_SENDGRID_API_KEY="${SENDGRID_API_KEY:-your-sendgrid-api-key-here}"
export REACT_APP_TWILIO_ACCOUNT_SID="${TWILIO_ACCOUNT_SID:-your-twilio-account-sid-here}"
export REACT_APP_TWILIO_AUTH_TOKEN="${TWILIO_AUTH_TOKEN:-your-twilio-auth-token-here}"
export REACT_APP_TWILIO_FROM_NUMBER="${TWILIO_FROM_NUMBER:-+1234567890}"
export REACT_APP_IPFS_PROJECT_ID="${IPFS_PROJECT_ID:-your-ipfs-project-id-here}"
export REACT_APP_IPFS_PROJECT_SECRET="${IPFS_PROJECT_SECRET:-your-ipfs-project-secret-here}"
export REACT_APP_IPFS_GATEWAY_URL="https://gateway.pinata.cloud"
export REACT_APP_COINBASE_COMMERCE_API_KEY="${COINBASE_API_KEY:-}"
export REACT_APP_VERIFF_API_KEY="${VERIFF_API_KEY:-}"
export REACT_APP_VERIFF_API_SECRET="${VERIFF_API_SECRET:-}"
export REACT_APP_VERIFF_WEBHOOK_URL="${VERIFF_WEBHOOK_URL:-https://yourdomain.com/api/veriff-webhook}"
export REACT_APP_VERIFICATION_PROVIDER="veriff"
export NODE_ENV="production"

echo "✅ Environment variables set"
echo "🔨 Building app..."

# Build the app
npm run build

echo "✅ Build complete!"
echo "🚀 Deploying to Firebase..."

# Deploy to Firebase
firebase deploy

echo "🎉 Deployment complete!"
echo "🌐 Your app is live at: https://par-noir-dashboard.web.app"
echo "🔗 Custom domain: https://pn.parnoir.com"
