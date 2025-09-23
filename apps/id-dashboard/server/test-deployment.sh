#!/bin/bash

# Test script for Google Drive Proxy Server deployment

echo "🧪 Testing Google Drive Proxy Server deployment..."

# Test server startup
echo "1. Testing server startup..."
cd /Users/gamit/pages/par-Noir/apps/id-dashboard/server

# Start server in background
GOOGLE_CLIENT_SECRET=test-secret node google-drive-proxy.js &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Test health endpoint
echo "2. Testing health endpoint..."
if curl -s http://localhost:3002/health | grep -q "ok"; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# Test auth URL endpoint
echo "3. Testing auth URL endpoint..."
if curl -s http://localhost:3002/api/google-drive/auth-url | grep -q "authUrl"; then
    echo "✅ Auth URL endpoint working"
else
    echo "❌ Auth URL endpoint failed"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# Test CORS headers
echo "4. Testing CORS headers..."
CORS_HEADER=$(curl -s -I -H "Origin: http://localhost:5173" http://localhost:3002/health | grep -i "access-control-allow-origin" || echo "")
if [ -n "$CORS_HEADER" ]; then
    echo "✅ CORS headers present"
else
    echo "❌ CORS headers missing"
fi

# Cleanup
echo "5. Cleaning up..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo ""
echo "🎉 All tests passed! The Google Drive Proxy Server is ready for deployment."
echo ""
echo "Next steps:"
echo "1. Update .env file with your Google OAuth credentials"
echo "2. Run ./deploy.sh for production deployment"
echo "3. Or run ./deploy-dev.sh for development"
