#!/bin/bash

# Pinata IPFS Setup Script for Par Noir Dashboard
# This script helps you configure Pinata IPFS credentials

echo "🔧 Pinata IPFS Setup for Par Noir Dashboard"
echo "=============================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.template .env
    echo "✅ .env file created"
else
    echo "📝 .env file already exists"
fi

echo ""
echo "🔑 To configure Pinata IPFS:"
echo "1. Go to https://pinata.cloud"
echo "2. Log into your account"
echo "3. Go to API Keys section"
echo "4. Create a new API key with 'Pin File to IPFS' permission"
echo "5. Copy your API Key and Secret Key"
echo ""

# Prompt for API key
read -p "Enter your Pinata API Key: " PINATA_API_KEY
read -p "Enter your Pinata Secret Key: " PINATA_SECRET_KEY

if [ -z "$PINATA_API_KEY" ] || [ -z "$PINATA_SECRET_KEY" ]; then
    echo "❌ API Key and Secret Key are required"
    exit 1
fi

# Update .env file
echo ""
echo "📝 Updating .env file with Pinata credentials..."

# Use sed to replace the placeholder values
sed -i.bak "s/your-ipfs-project-id-here/$PINATA_API_KEY/g" .env
sed -i.bak "s/your-ipfs-project-secret-here/$PINATA_SECRET_KEY/g" .env

# Clean up backup file
rm .env.bak

echo "✅ Pinata credentials configured!"
echo ""
echo "🚀 Next steps:"
echo "1. Run 'npm run build' to build with new credentials"
echo "2. Run 'firebase deploy --only hosting' to deploy"
echo "3. Test the transfer feature on the live site"
echo ""
echo "🔍 To verify your setup:"
echo "1. Open the dashboard"
echo "2. Try creating a transfer"
echo "3. Check the browser console for 'IPFS service initialized with Pinata credentials'"
echo ""
echo "✨ Setup complete! Your transfer feature should now work with Pinata IPFS."
