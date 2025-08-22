#!/bin/bash

# Production Deployment Script for Identity Protocol Dashboard
# This script builds and deploys the app with production optimizations

set -e

echo "🚀 Starting production deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the app directory."
    exit 1
fi

print_status "Installing dependencies..."
npm ci --production=false

print_status "Running security audit..."
npm audit --audit-level=moderate || print_warning "Security audit found issues"

print_status "Running tests..."
npm test || print_warning "Some tests failed"

print_status "Building for production..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    print_error "Build failed - dist directory not found"
    exit 1
fi

print_status "Running Lighthouse audit..."
npx lighthouse dist/index.html --output=json --output-path=./lighthouse-report.json --only-categories=performance,accessibility,best-practices,seo || print_warning "Lighthouse audit failed"

print_status "Optimizing assets..."
# Compress images and other assets
find dist -name "*.png" -exec optipng -o5 {} \;
find dist -name "*.jpg" -exec jpegoptim --strip-all {} \;

print_status "Generating service worker..."
# The service worker should already be built, but let's verify
if [ ! -f "dist/sw.js" ]; then
    print_warning "Service worker not found, copying from public"
    cp public/sw.js dist/sw.js
fi

print_status "Creating deployment package..."
# Create a deployment archive
tar -czf deployment-$(date +%Y%m%d-%H%M%S).tar.gz dist/

print_status "Deployment package created successfully!"

# Optional: Deploy to specific platform
if [ "$1" = "vercel" ]; then
    print_status "Deploying to Vercel..."
    npx vercel --prod
elif [ "$1" = "netlify" ]; then
    print_status "Deploying to Netlify..."
    npx netlify deploy --prod --dir=dist
elif [ "$1" = "github" ]; then
    print_status "Deploying to GitHub Pages..."
    # This would require additional setup
    print_warning "GitHub Pages deployment requires manual setup"
else
    print_status "Build complete! Deploy the dist/ directory to your hosting provider."
    print_status "Available deployment options:"
    echo "  ./scripts/deploy.sh vercel   - Deploy to Vercel"
    echo "  ./scripts/deploy.sh netlify  - Deploy to Netlify"
    echo "  ./scripts/deploy.sh github   - Deploy to GitHub Pages"
fi

print_status "✅ Production deployment completed successfully!" 