#!/bin/bash

echo "🚀 Building Identity Protocol PWA for production..."

# Build the PWA
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "🌐 Serving PWA on http://localhost:3002"
    echo "📱 Open in browser and install as PWA"
    echo "🔒 HTTPS required for PWA installation"
    echo ""
    echo "To serve with HTTPS (recommended for PWA):"
    echo "npx serve -s dist -l 3002 --ssl-cert"
    echo ""
    echo "Or serve locally:"
    echo "npx serve -s dist -l 3002"
    echo ""
    
    # Check if serve is installed
    if command -v npx &> /dev/null; then
        echo "🎯 Starting production server..."
        npx serve -s dist -l 3002
    else
        echo "📦 Installing serve..."
        npm install -g serve
        echo "🎯 Starting production server..."
        npx serve -s dist -l 3002
    fi
else
    echo "❌ Build failed!"
    exit 1
fi
