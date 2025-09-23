#!/bin/bash

# Google Drive Proxy Server Deployment Script
# This script deploys the Google Drive proxy server for par Noir

set -e

echo "🚀 Deploying Google Drive Proxy Server for par Noir..."

# Configuration
PROJECT_NAME="par-noir-google-drive-proxy"
SERVICE_NAME="par-noir-gdrive-proxy"
PORT=3002
USER=$(whoami)
PROJECT_DIR="/Users/gamit/pages/par-Noir/apps/id-dashboard/server"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_error "Please do not run this script as root"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18.x or later."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18.x or later is required. Current version: $(node -v)"
    exit 1
fi

print_success "Node.js version check passed: $(node -v)"

# Navigate to project directory
cd "$PROJECT_DIR"

# Install dependencies
print_status "Installing dependencies..."
npm install

# Check for vulnerabilities
print_status "Checking for security vulnerabilities..."
if npm audit --audit-level=high; then
    print_success "No high-severity vulnerabilities found"
else
    print_warning "High-severity vulnerabilities found. Consider running 'npm audit fix'"
fi

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    print_status "Creating environment configuration file..."
    cat > .env << EOF
# Google Drive Proxy Server Configuration
NODE_ENV=production
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
    print_warning "Please edit .env file with your production settings"
fi

# Create logs directory
print_status "Creating logs directory..."
mkdir -p logs

# Test the server
print_status "Testing server startup..."
if timeout 10s node google-drive-proxy.js > /dev/null 2>&1; then
    print_success "Server test passed"
else
    print_error "Server test failed. Please check the configuration."
    exit 1
fi

# Create PM2 ecosystem file
print_status "Creating PM2 ecosystem configuration..."
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '$SERVICE_NAME',
    script: 'google-drive-proxy.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: $PORT
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF

# Install PM2 if not already installed
if ! command -v pm2 &> /dev/null; then
    print_status "Installing PM2..."
    npm install -g pm2
fi

# Stop existing PM2 process if running
print_status "Stopping existing PM2 processes..."
pm2 stop "$SERVICE_NAME" 2>/dev/null || true
pm2 delete "$SERVICE_NAME" 2>/dev/null || true

# Start the application with PM2
print_status "Starting application with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script (optional)
print_status "Setting up PM2 startup script..."
pm2 startup 2>/dev/null || print_warning "PM2 startup setup requires sudo. Run 'pm2 startup' manually if needed."

# Create systemd service file (optional)
print_status "Creating systemd service file..."
sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=par Noir Google Drive Proxy Server
After=network.target

[Service]
Type=forking
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/bin/pm2 reload ecosystem.config.js --env production
ExecStop=/usr/bin/pm2 stop ecosystem.config.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
print_status "Enabling and starting systemd service..."
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl start $SERVICE_NAME

# Check service status
print_status "Checking service status..."
if systemctl is-active --quiet $SERVICE_NAME; then
    print_success "Service is running"
else
    print_warning "Service may not be running. Check with: sudo systemctl status $SERVICE_NAME"
fi

# Test the deployed server
print_status "Testing deployed server..."
sleep 5
if curl -s http://localhost:$PORT/health > /dev/null; then
    print_success "Server is responding to health checks"
else
    print_warning "Server health check failed. Check logs with: pm2 logs $SERVICE_NAME"
fi

# Display deployment information
echo ""
print_success "🎉 Google Drive Proxy Server deployment completed!"
echo ""
echo "📋 Deployment Information:"
echo "  • Service Name: $SERVICE_NAME"
echo "  • Port: $PORT"
echo "  • Project Directory: $PROJECT_DIR"
echo "  • PM2 Process: $SERVICE_NAME"
echo "  • Systemd Service: $SERVICE_NAME"
echo ""
echo "🔧 Management Commands:"
echo "  • View logs: pm2 logs $SERVICE_NAME"
echo "  • Restart: pm2 restart $SERVICE_NAME"
echo "  • Stop: pm2 stop $SERVICE_NAME"
echo "  • Status: pm2 status"
echo "  • Systemd status: sudo systemctl status $SERVICE_NAME"
echo ""
echo "🌐 Server Endpoints:"
echo "  • Health Check: http://localhost:$PORT/health"
echo "  • Auth URL: http://localhost:$PORT/api/google-drive/auth-url"
echo "  • OAuth Callback: http://localhost:$PORT/auth/google/callback"
echo ""
echo "⚠️  Next Steps:"
echo "  1. Update .env file with your Google OAuth credentials"
echo "  2. Configure your Google Cloud Console OAuth settings"
echo "  3. Update CORS origins for production domains"
echo "  4. Set up SSL/TLS certificates for HTTPS"
echo "  5. Configure firewall rules if needed"
echo ""
print_success "Deployment completed successfully! 🚀"
