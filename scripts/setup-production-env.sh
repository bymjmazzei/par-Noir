#!/bin/bash

# Production Environment Setup Script
# Identity Protocol - Secure Configuration

set -e

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
ENV_FILE=".env.production"
BACKUP_FILE=".env.production.backup.$(date +%Y%m%d_%H%M%S)"

# Generate secure secrets
generate_secrets() {
    log "Generating secure production secrets..."
    
    # Generate JWT secret (128 characters)
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    
    # Generate session secret (128 characters)
    SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    
    # Generate encryption key (64 characters)
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    
    # Generate database encryption key (64 characters)
    DB_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    
    success "Secure secrets generated"
}

# Backup existing environment file
backup_env_file() {
    if [[ -f "$ENV_FILE" ]]; then
        log "Backing up existing environment file..."
        cp "$ENV_FILE" "$BACKUP_FILE"
        success "Environment file backed up to $BACKUP_FILE"
    fi
}

# Update environment file with secure values
update_env_file() {
    log "Updating production environment configuration..."
    
    # Create new environment file
    cat > "$ENV_FILE" << EOF
# =============================================================================
# IDENTITY PROTOCOL - PRODUCTION ENVIRONMENT CONFIGURATION
# =============================================================================
# Generated on $(date +'%Y-%m-%d %H:%M:%S')

# Application Environment
NODE_ENV=production
APP_NAME=Identity Protocol
APP_VERSION=1.0.0
APP_PORT=3002
APP_HOST=0.0.0.0

# Application URLs (UPDATE THESE WITH YOUR ACTUAL DOMAINS)
APP_URL=https://your-domain.com
API_URL=https://api.your-domain.com
DASHBOARD_URL=https://dashboard.your-domain.com

# =============================================================================
# SECURITY CONFIGURATION
# =============================================================================

# JWT Configuration (SECURE PRODUCTION VALUES)
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=3600
JWT_REFRESH_EXPIRES_IN=604800

# Session Configuration (SECURE PRODUCTION VALUES)
SESSION_SECRET=$SESSION_SECRET
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_HTTPONLY=true
SESSION_COOKIE_SAMESITE=strict

# Encryption Configuration (SECURE PRODUCTION VALUES)
ENCRYPTION_KEY=$ENCRYPTION_KEY
ENCRYPTION_ALGORITHM=AES-256-GCM
HASH_ALGORITHM=SHA-512
KEY_DERIVATION_ITERATIONS=1000000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_MAX_REQUESTS=5
RATE_LIMIT_DID_CREATION_MAX_REQUESTS=10

# =============================================================================
# HSM (HARDWARE SECURITY MODULE) CONFIGURATION
# =============================================================================

# HSM Provider (aws-kms, azure-keyvault, gcp-kms, local-hsm)
HSM_PROVIDER=local-hsm
HSM_ENABLED=true
HSM_FALLBACK_TO_LOCAL=true
HSM_KEY_ROTATION_ENABLED=true
HSM_KEY_ROTATION_INTERVAL=2592000000

# AWS KMS Configuration (UPDATE WITH YOUR CREDENTIALS)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_KMS_KEY_ID=your-kms-key-id

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================

# PostgreSQL Configuration (UPDATE WITH YOUR DATABASE)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=identity_protocol
DB_USER=identity_user
DB_PASSWORD=your-secure-db-password
DB_SSL=true
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000

# Database Encryption
DB_ENCRYPTION_ENABLED=true
DB_ENCRYPTION_KEY=$DB_ENCRYPTION_KEY

# =============================================================================
# REDIS CONFIGURATION
# =============================================================================

# Redis Configuration (UPDATE WITH YOUR REDIS)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0
REDIS_SSL=false

# =============================================================================
# EXTERNAL SERVICES CONFIGURATION
# =============================================================================

# Firebase Configuration (UPDATE WITH YOUR FIREBASE)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Private Key Here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id

# SendGrid Configuration (UPDATE WITH YOUR SENDGRID)
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@your-domain.com
SENDGRID_FROM_NAME=Identity Protocol

# Twilio Configuration (UPDATE WITH YOUR TWILIO)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# IPFS Configuration
IPFS_API_KEY=your-ipfs-api-key
IPFS_API_SECRET=your-ipfs-api-secret
IPFS_GATEWAY_URL=https://ipfs.io
IPFS_API_URL=https://api.ipfs.io

# =============================================================================
# MONITORING & LOGGING CONFIGURATION
# =============================================================================

# Sentry Configuration (UPDATE WITH YOUR SENTRY)
SENTRY_DSN=https://your-sentry-dsn
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=1.0.0

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=/var/log/identity-protocol/app.log
LOG_MAX_SIZE=100m
LOG_MAX_FILES=10

# Performance Monitoring
APM_ENABLED=true
APM_SERVICE_NAME=identity-protocol
APM_SERVER_URL=https://apm.your-domain.com

# =============================================================================
# SECURITY INFRASTRUCTURE CONFIGURATION
# =============================================================================

# Web Application Firewall (WAF)
WAF_ENABLED=true
WAF_PROVIDER=cloudflare
WAF_API_TOKEN=your-waf-api-token
WAF_ZONE_ID=your-zone-id

# DDoS Protection
DDOS_PROTECTION_ENABLED=true
DDOS_PROVIDER=cloudflare
DDOS_API_TOKEN=your-ddos-api-token

# =============================================================================
# SSL/TLS CONFIGURATION
# =============================================================================

# SSL Configuration
SSL_ENABLED=true
SSL_FORCE_REDIRECT=true
SSL_HSTS_ENABLED=true
SSL_HSTS_MAX_AGE=31536000
SSL_HSTS_INCLUDE_SUBDOMAINS=true
SSL_HSTS_PRELOAD=true

# =============================================================================
# FEATURE FLAGS
# =============================================================================

# Feature Toggles
FEATURE_PWA_ENABLED=true
FEATURE_OFFLINE_MODE_ENABLED=true
FEATURE_BIOMETRIC_AUTH_ENABLED=true
FEATURE_MULTI_DEVICE_SYNC_ENABLED=true
FEATURE_RECOVERY_CUSTODIANS_ENABLED=true
FEATURE_QUANTUM_RESISTANT_CRYPTO_ENABLED=true

# =============================================================================
# API CONFIGURATION
# =============================================================================

# API Configuration
API_VERSION=v1
API_RATE_LIMIT_ENABLED=true
API_DOCUMENTATION_ENABLED=true
API_CORS_ORIGINS=https://your-domain.com,https://dashboard.your-domain.com

# =============================================================================
# NOTIFICATION CONFIGURATION
# =============================================================================

# Notification Configuration
NOTIFICATION_EMAIL_ENABLED=true
NOTIFICATION_SMS_ENABLED=true
NOTIFICATION_PUSH_ENABLED=true
NOTIFICATION_WEBHOOK_ENABLED=true

# =============================================================================
# MAINTENANCE CONFIGURATION
# =============================================================================

# Maintenance Mode
MAINTENANCE_MODE_ENABLED=false
MAINTENANCE_MESSAGE=System is under maintenance. Please try again later.
MAINTENANCE_ALLOWED_IPS=127.0.0.1,::1
EOF

    success "Production environment file created: $ENV_FILE"
}

# Set proper file permissions
set_permissions() {
    log "Setting secure file permissions..."
    chmod 600 "$ENV_FILE"
    success "Environment file permissions set to 600 (owner read/write only)"
}

# Main execution
main() {
    log "Starting production environment setup..."
    
    # Check if we're in the right directory
    if [[ ! -f "package.json" ]]; then
        error "package.json not found. Please run this script from the project root."
        exit 1
    fi
    
    # Generate secure secrets
    generate_secrets
    
    # Backup existing file
    backup_env_file
    
    # Update environment file
    update_env_file
    
    # Set permissions
    set_permissions
    
    success "Production environment setup completed!"
    warning "IMPORTANT: Update the following values in $ENV_FILE:"
    echo "  - APP_URL, API_URL, DASHBOARD_URL (your actual domains)"
    echo "  - Database credentials (DB_HOST, DB_USER, DB_PASSWORD)"
    echo "  - External service API keys (Firebase, SendGrid, Twilio, etc.)"
    echo "  - Monitoring configuration (Sentry DSN, APM URL)"
    echo "  - SSL/TLS configuration"
}

# Run main function
main "$@"
