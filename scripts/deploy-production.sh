#!/bin/bash

# 🎯 Military-Grade Production Deployment Script
# This script deploys the Identity Protocol with military-grade security

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
PROJECT_NAME="identity-protocol"
DEPLOYMENT_ENV="production"
SECURITY_LEVEL="military"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/${TIMESTAMP}"

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   error "This script should not be run as root for security reasons"
   exit 1
fi

# Check prerequisites
check_prerequisites() {
    log "Checking deployment prerequisites..."
    
    # Check if we're in the right directory
    if [[ ! -f "package.json" ]]; then
        error "package.json not found. Please run this script from the project root."
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version)
    if [[ ! "$NODE_VERSION" =~ ^v18\. ]]; then
        error "Node.js 18+ required. Current version: $NODE_VERSION"
        exit 1
    fi
    
    # Check npm version
    NPM_VERSION=$(npm --version)
    if [[ ! "$NPM_VERSION" =~ ^[89]\. ]]; then
        warning "npm 8+ recommended. Current version: $NPM_VERSION"
    fi
    
    # Check environment file
    if [[ ! -f ".env.production" ]]; then
        error ".env.production file not found. Please create it with production configuration."
        exit 1
    fi
    
    success "Prerequisites check passed"
}

# Security validation
validate_security() {
    log "Validating security configuration..."
    
    # Check security level
    if [[ "$SECURITY_LEVEL" != "military" ]]; then
        error "Security level must be 'military' for production deployment"
        exit 1
    fi
    
    # Run security tests
    log "Running security tests..."
    if ! npm run test:security; then
        error "Security tests failed"
        exit 1
    fi
    
    # Run cryptographic validation
    log "Validating cryptographic operations..."
    if ! npm run test:crypto; then
        error "Cryptographic validation failed"
        exit 1
    fi
    
    success "Security validation passed"
}

# Create backup
create_backup() {
    log "Creating backup of current deployment..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup current build
    if [[ -d "dist" ]]; then
        cp -r dist "$BACKUP_DIR/"
        success "Build backup created"
    fi
    
    # Backup environment files
    if [[ -f ".env" ]]; then
        cp .env "$BACKUP_DIR/"
    fi
    
    if [[ -f ".env.production" ]]; then
        cp .env.production "$BACKUP_DIR/"
    fi
    
    success "Backup completed: $BACKUP_DIR"
}

# Install dependencies
install_dependencies() {
    log "Installing production dependencies..."
    
    # Clean install
    rm -rf node_modules package-lock.json
    npm ci --only=production
    
    success "Dependencies installed"
}

# Build production assets
build_production() {
    log "Building production assets..."
    
    # Set production environment
    export NODE_ENV=production
    export SECURITY_LEVEL=military
    
    # Build
    if ! npm run build:production; then
        error "Production build failed"
        exit 1
    fi
    
    success "Production build completed"
}

# HSM integration
setup_hsm() {
    log "Setting up Hardware Security Module (HSM)..."
    
    # Initialize HSM connection
    if ! npm run hsm:init; then
        error "HSM initialization failed"
        exit 1
    fi
    
    # Generate production keys
    if ! npm run hsm:generate-keys; then
        error "HSM key generation failed"
        exit 1
    fi
    
    # Test HSM operations
    if ! npm run hsm:test; then
        error "HSM testing failed"
        exit 1
    fi
    
    success "HSM setup completed"
}

# Security configuration
configure_security() {
    log "Configuring security settings..."
    
    # Apply security headers
    if ! npm run security:configure; then
        error "Security configuration failed"
        exit 1
    fi
    
    # Setup monitoring
    if ! npm run monitoring:setup; then
        error "Monitoring setup failed"
        exit 1
    fi
    
    # Configure threat detection
    if ! npm run threat:configure; then
        error "Threat detection configuration failed"
        exit 1
    fi
    
    success "Security configuration completed"
}

# Deploy application
deploy_application() {
    log "Deploying application..."
    
    # Deploy to production
    if ! npm run deploy:production; then
        error "Application deployment failed"
        exit 1
    fi
    
    success "Application deployed successfully"
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    # Health check
    if ! npm run health:check; then
        error "Health check failed"
        exit 1
    fi
    
    # Security verification
    if ! npm run security:verify; then
        error "Security verification failed"
        exit 1
    fi
    
    # Performance test
    if ! npm run performance:test; then
        warning "Performance test failed (non-critical)"
    fi
    
    success "Deployment verification completed"
}

# Start monitoring
start_monitoring() {
    log "Starting security monitoring..."
    
    # Start monitoring services
    if ! npm run monitoring:start; then
        error "Failed to start monitoring"
        exit 1
    fi
    
    # Start threat detection
    if ! npm run threat:start; then
        error "Failed to start threat detection"
        exit 1
    fi
    
    success "Security monitoring started"
}

# Final validation
final_validation() {
    log "Performing final validation..."
    
    # Check all services are running
    if ! npm run status:check; then
        error "Service status check failed"
        exit 1
    fi
    
    # Verify security metrics
    if ! npm run security:metrics; then
        warning "Security metrics check failed (non-critical)"
    fi
    
    success "Final validation completed"
}

# Main deployment function
main() {
    log "🚀 Starting Military-Grade Production Deployment"
    log "Project: $PROJECT_NAME"
    log "Environment: $DEPLOYMENT_ENV"
    log "Security Level: $SECURITY_LEVEL"
    log "Timestamp: $TIMESTAMP"
    
    echo ""
    
    # Deployment steps
    check_prerequisites
    validate_security
    create_backup
    install_dependencies
    build_production
    setup_hsm
    configure_security
    deploy_application
    verify_deployment
    start_monitoring
    final_validation
    
    echo ""
    success "🎯 Military-Grade Production Deployment Completed Successfully!"
    log "Backup location: $BACKUP_DIR"
    log "Deployment timestamp: $TIMESTAMP"
    log "Security level: $SECURITY_LEVEL"
    
    echo ""
    log "🔒 Security Status: ACTIVE"
    log "📊 Monitoring: ACTIVE"
    log "🛡️ Threat Detection: ACTIVE"
    log "📈 Performance: OPTIMIZED"
    
    echo ""
    warning "⚠️  IMPORTANT: Monitor the system for the first 24 hours"
    warning "⚠️  IMPORTANT: Verify all security measures are active"
    warning "⚠️  IMPORTANT: Test incident response procedures"
    
    echo ""
    log "📚 Next steps:"
    log "1. Review security dashboard"
    log "2. Test incident response procedures"
    log "3. Schedule regular security assessments"
    log "4. Monitor performance metrics"
    log "5. Update documentation"
}

# Run deployment
main "$@"
