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
export REACT_APP_COINBASE_COMMERCE_API_KEY="${COINBASE_API_KEY:-c79f3516-c20c-4b32-af0d-4938ec2039f0}"
export REACT_APP_VERIFF_API_KEY="${VERIFF_API_KEY:-9b59a1b5-97e5-4180-9595-fa9f613eb1f5}"
export REACT_APP_VERIFF_API_SECRET="${VERIFF_API_SECRET:-a2f7513b-47ac-4a29-b9ec-6b9bd035a453}"
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
