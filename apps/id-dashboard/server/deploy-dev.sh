#!/bin/bash

# Google Drive Proxy Server - Development Deployment Script
# Quick deployment for development and testing

set -e

echo "🚀 Deploying Google Drive Proxy Server (Development Mode)..."

# Configuration
PORT=3002
PROJECT_DIR="/Users/gamit/pages/par-Noir/apps/id-dashboard/server"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Navigate to project directory
cd "$PROJECT_DIR"

# Install dependencies
print_status "Installing dependencies..."
npm install

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    print_status "Creating development environment file..."
    cat > .env << EOF
# Google Drive Proxy Server Configuration (Development)
NODE_ENV=development
PORT=$PORT

# Google OAuth Configuration
GOOGLE_CLIENT_ID=43740774041-mtanrvoco9osnvuj40tg46e7lt32cvks.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=https://pn.parnoir.com/auth/google/callback

# Frontend URL
FRONTEND_URL=https://pn.parnoir.com

# Security
CORS_ORIGIN=https://pn.parnoir.com,https://par-noir-dashboard.web.app
EOF
    print_status "Created .env file. Please update GOOGLE_CLIENT_SECRET with your actual secret."
fi

# Create logs directory
mkdir -p logs

# Kill any existing process on the port
print_status "Checking for existing processes on port $PORT..."
if lsof -ti:$PORT > /dev/null 2>&1; then
    print_status "Killing existing process on port $PORT..."
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
fi

# Start the server
print_status "Starting Google Drive Proxy Server on port $PORT..."
print_status "Press Ctrl+C to stop the server"
echo ""

# Start the server with proper environment
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-your-client-secret-here}" node google-drive-proxy.js
