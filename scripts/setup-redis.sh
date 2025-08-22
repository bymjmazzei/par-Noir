#!/bin/bash

# Identity Protocol - Redis Setup Script
# Sets up Redis with TLS encryption for production deployment

set -e

# Configuration
REDIS_PORT=6379
REDIS_PASSWORD=""
REDIS_SSL_DIR="/etc/ssl/redis"
REDIS_CONFIG_DIR="/etc/redis"
REDIS_DATA_DIR="/var/lib/redis"
REDIS_LOG_DIR="/var/log/redis"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check root access
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root or with sudo"
        exit 1
    fi
}

# Check Redis installation
check_redis() {
    print_status "Checking Redis installation..."
    if ! command -v redis-server &> /dev/null; then
        print_error "Redis is not installed. Please install Redis 6+ first."
        exit 1
    fi
    print_success "Redis is installed"
}

# Generate secure password
generate_password() {
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    print_success "Generated secure Redis password"
}

# Create SSL certificates
create_ssl_certificates() {
    print_status "Creating SSL certificates for Redis..."
    
    mkdir -p "$REDIS_SSL_DIR"
    chmod 700 "$REDIS_SSL_DIR"
    
    # Generate CA key and certificate
    openssl genrsa -out "$REDIS_SSL_DIR/ca.key" 4096
    openssl req -new -x509 -days 3650 -key "$REDIS_SSL_DIR/ca.key" \
        -out "$REDIS_SSL_DIR/ca.crt" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=Redis-CA"
    
    # Generate server key and certificate
    openssl genrsa -out "$REDIS_SSL_DIR/server.key" 2048
    openssl req -new -key "$REDIS_SSL_DIR/server.key" \
        -out "$REDIS_SSL_DIR/server.csr" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    
    openssl x509 -req -in "$REDIS_SSL_DIR/server.csr" \
        -CA "$REDIS_SSL_DIR/ca.crt" -CAkey "$REDIS_SSL_DIR/ca.key" \
        -CAcreateserial -out "$REDIS_SSL_DIR/server.crt" -days 365
    
    chown -R redis:redis "$REDIS_SSL_DIR"
    print_success "SSL certificates created"
}

# Configure Redis
configure_redis() {
    print_status "Configuring Redis..."
    
    # Backup original config
    cp "$REDIS_CONFIG_DIR/redis.conf" "$REDIS_CONFIG_DIR/redis.conf.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Create production configuration
    cat > "$REDIS_CONFIG_DIR/redis.conf" << EOF
# Identity Protocol - Redis Production Configuration

# Network
bind 127.0.0.1
port $REDIS_PORT
tcp-backlog 511
timeout 0
tcp-keepalive 300

# Security
requirepass $REDIS_PASSWORD
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command DEBUG ""
rename-command CONFIG "CONFIG_9a7b8c6d5e4f3g2h1i0j"

# TLS Configuration
tls-port 6380
tls-cert-file $REDIS_SSL_DIR/server.crt
tls-key-file $REDIS_SSL_DIR/server.key
tls-ca-cert-file $REDIS_SSL_DIR/ca.crt
tls-auth-clients no
tls-protocols "TLSv1.2 TLSv1.3"

# Memory Management
maxmemory 256mb
maxmemory-policy allkeys-lru
maxmemory-samples 5

# Persistence
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir $REDIS_DATA_DIR

# Logging
loglevel notice
logfile $REDIS_LOG_DIR/redis.log
syslog-enabled no
databases 16

# Performance
tcp-keepalive 300
latency-monitor-threshold 100
slowlog-log-slower-than 10000
slowlog-max-len 128

# Client Configuration
maxclients 10000
client-output-buffer-limit normal 0 0 0
client-output-buffer-limit slave 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60

# Replication
replica-serve-stale-data yes
replica-read-only yes
repl-diskless-sync no
repl-diskless-sync-delay 5
repl-ping-replica-period 10
repl-timeout 60
repl-disable-tcp-nodelay no
repl-backlog-size 1mb
repl-backlog-ttl 3600

# Security Settings
protected-mode yes
EOF
    
    print_success "Redis configuration updated"
}

# Create directories
create_directories() {
    print_status "Creating Redis directories..."
    
    mkdir -p "$REDIS_DATA_DIR" "$REDIS_LOG_DIR"
    chown -R redis:redis "$REDIS_DATA_DIR" "$REDIS_LOG_DIR"
    chmod 750 "$REDIS_DATA_DIR" "$REDIS_LOG_DIR"
    
    print_success "Directories created"
}

# Restart Redis
restart_redis() {
    print_status "Restarting Redis..."
    systemctl restart redis
    sleep 3
    
    if systemctl is-active --quiet redis; then
        print_success "Redis restarted successfully"
    else
        print_error "Failed to restart Redis"
        exit 1
    fi
}

# Test connection
test_connection() {
    print_status "Testing Redis connection..."
    
    if redis-cli -a "$REDIS_PASSWORD" ping | grep -q "PONG"; then
        print_success "Redis connection test successful"
    else
        print_error "Redis connection test failed"
        exit 1
    fi
}

# Display configuration
display_configuration() {
    print_status "Redis configuration summary:"
    echo "Redis Port: $REDIS_PORT"
    echo "Redis TLS Port: 6380"
    echo "Redis Password: $REDIS_PASSWORD"
    echo "SSL Certificates: $REDIS_SSL_DIR"
    echo "Data Directory: $REDIS_DATA_DIR"
    echo "Log Directory: $REDIS_LOG_DIR"
    echo ""
    print_warning "IMPORTANT: Save the Redis password securely!"
}

# Main execution
main() {
    print_status "Starting Redis setup..."
    
    check_root
    check_redis
    generate_password
    create_ssl_certificates
    configure_redis
    create_directories
    restart_redis
    test_connection
    display_configuration
    
    print_success "Redis setup completed successfully!"
}

main "$@"
