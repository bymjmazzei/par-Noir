#!/bin/bash

# =============================================================================
# IDENTITY PROTOCOL - DATABASE SETUP SCRIPT
# =============================================================================
# 
# This script sets up PostgreSQL with encryption at rest for production deployment.
# 
# Prerequisites:
# - PostgreSQL 13+ installed
# - Root/sudo access
# - OpenSSL for certificate generation
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="identity_protocol"
DB_USER="identity_user"
DB_PASSWORD=""
DB_HOST="localhost"
DB_PORT="5432"
SSL_CERT_DIR="/etc/ssl/postgresql"
BACKUP_DIR="/var/backups/postgresql"
LOG_DIR="/var/log/postgresql"

# Function to print colored output
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

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root or with sudo"
        exit 1
    fi
}

# Function to check PostgreSQL installation
check_postgresql() {
    print_status "Checking PostgreSQL installation..."
    
    if ! command -v psql &> /dev/null; then
        print_error "PostgreSQL is not installed. Please install PostgreSQL 13+ first."
        exit 1
    fi
    
    PG_VERSION=$(psql --version | grep -oP '\d+' | head -1)
    if [ "$PG_VERSION" -lt 13 ]; then
        print_error "PostgreSQL version $PG_VERSION is too old. Please upgrade to PostgreSQL 13+"
        exit 1
    fi
    
    print_success "PostgreSQL $PG_VERSION is installed"
}

# Function to generate secure password
generate_password() {
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    print_success "Generated secure database password"
}

# Function to create SSL certificates
create_ssl_certificates() {
    print_status "Creating SSL certificates for PostgreSQL..."
    
    # Create SSL directory
    mkdir -p "$SSL_CERT_DIR"
    chmod 700 "$SSL_CERT_DIR"
    
    # Generate CA private key
    openssl genrsa -out "$SSL_CERT_DIR/ca.key" 4096
    chmod 600 "$SSL_CERT_DIR/ca.key"
    
    # Generate CA certificate
    openssl req -new -x509 -days 3650 -key "$SSL_CERT_DIR/ca.key" \
        -out "$SSL_CERT_DIR/ca.crt" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=PostgreSQL-CA"
    
    # Generate server private key
    openssl genrsa -out "$SSL_CERT_DIR/server.key" 2048
    chmod 600 "$SSL_CERT_DIR/server.key"
    
    # Generate server certificate signing request
    openssl req -new -key "$SSL_CERT_DIR/server.key" \
        -out "$SSL_CERT_DIR/server.csr" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=$DB_HOST"
    
    # Sign server certificate with CA
    openssl x509 -req -in "$SSL_CERT_DIR/server.csr" \
        -CA "$SSL_CERT_DIR/ca.crt" \
        -CAkey "$SSL_CERT_DIR/ca.key" \
        -CAcreateserial \
        -out "$SSL_CERT_DIR/server.crt" \
        -days 365
    
    # Generate client private key
    openssl genrsa -out "$SSL_CERT_DIR/client.key" 2048
    chmod 600 "$SSL_CERT_DIR/client.key"
    
    # Generate client certificate signing request
    openssl req -new -key "$SSL_CERT_DIR/client.key" \
        -out "$SSL_CERT_DIR/client.csr" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=identity_protocol_client"
    
    # Sign client certificate with CA
    openssl x509 -req -in "$SSL_CERT_DIR/client.csr" \
        -CA "$SSL_CERT_DIR/ca.crt" \
        -CAkey "$SSL_CERT_DIR/ca.key" \
        -CAcreateserial \
        -out "$SSL_CERT_DIR/client.crt" \
        -days 365
    
    # Set proper ownership
    chown -R postgres:postgres "$SSL_CERT_DIR"
    
    print_success "SSL certificates created successfully"
}

# Function to configure PostgreSQL
configure_postgresql() {
    print_status "Configuring PostgreSQL..."
    
    # Get PostgreSQL data directory
    PG_DATA_DIR=$(sudo -u postgres psql -t -c "SHOW data_directory;" | xargs)
    
    # Backup original configuration
    cp "$PG_DATA_DIR/postgresql.conf" "$PG_DATA_DIR/postgresql.conf.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$PG_DATA_DIR/pg_hba.conf" "$PG_DATA_DIR/pg_hba.conf.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Configure postgresql.conf
    cat >> "$PG_DATA_DIR/postgresql.conf" << EOF

# =============================================================================
# IDENTITY PROTOCOL - PRODUCTION CONFIGURATION
# =============================================================================

# SSL Configuration
ssl = on
ssl_cert_file = '$SSL_CERT_DIR/server.crt'
ssl_key_file = '$SSL_CERT_DIR/server.key'
ssl_ca_file = '$SSL_CERT_DIR/ca.crt'
ssl_ciphers = 'HIGH:MEDIUM:+3DES:!aNULL'
ssl_prefer_server_ciphers = on
ssl_min_protocol_version = 'TLSv1.2'

# Security Configuration
password_encryption = scram-sha-256
log_connections = on
log_disconnections = on
log_statement = 'all'
log_min_duration_statement = 1000
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_lock_waits = on
log_temp_files = 0

# Performance Configuration
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200

# Connection Configuration
max_connections = 100
superuser_reserved_connections = 3
unix_socket_directories = '/var/run/postgresql'
listen_addresses = 'localhost'
port = $DB_PORT

# Memory Configuration
work_mem = 4MB
maintenance_work_mem = 64MB

# WAL Configuration
wal_level = replica
max_wal_senders = 3
max_replication_slots = 3

# Autovacuum Configuration
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 1min
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50

# Archive Configuration
archive_mode = on
archive_command = 'test ! -f /var/backups/postgresql/archive/%f && cp %p /var/backups/postgresql/archive/%f'

# =============================================================================
EOF
    
    # Configure pg_hba.conf
    cat >> "$PG_DATA_DIR/pg_hba.conf" << EOF

# =============================================================================
# IDENTITY PROTOCOL - PRODUCTION ACCESS CONTROL
# =============================================================================

# Local connections with SSL
local   all             postgres                                peer
local   all             $DB_USER                                md5

# Host connections with SSL
host    all             postgres        127.0.0.1/32            md5
host    all             postgres        ::1/128                 md5
host    all             $DB_USER        127.0.0.1/32            md5
host    all             $DB_USER        ::1/128                 md5

# SSL connections only
hostssl all             $DB_USER        0.0.0.0/0               md5 clientcert=1
hostssl all             $DB_USER        ::/0                    md5 clientcert=1

# =============================================================================
EOF
    
    print_success "PostgreSQL configuration updated"
}

# Function to create database and user
create_database() {
    print_status "Creating database and user..."
    
    # Create user
    sudo -u postgres psql << EOF
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
ALTER USER $DB_USER WITH CREATEDB;
ALTER USER $DB_USER WITH LOGIN;
EOF
    
    # Create database
    sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
    
    # Grant privileges
    sudo -u postgres psql -d "$DB_NAME" << EOF
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO $DB_USER;
EOF
    
    print_success "Database and user created successfully"
}

# Function to create database schema
create_schema() {
    print_status "Creating database schema..."
    
    # Create schema file
    cat > /tmp/identity_protocol_schema.sql << 'EOF'
-- =============================================================================
-- IDENTITY PROTOCOL - DATABASE SCHEMA
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable encryption extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create audit log function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- DIDs table
CREATE TABLE dids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    did_identifier VARCHAR(255) UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    private_key_encrypted TEXT NOT NULL,
    metadata JSONB,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recovery custodians table
CREATE TABLE recovery_custodians (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    public_key TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recovery requests table
CREATE TABLE recovery_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    requesting_did VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    approvals JSONB DEFAULT '[]',
    denials JSONB DEFAULT '[]',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recovery keys table
CREATE TABLE recovery_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_data_encrypted TEXT NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    description TEXT,
    last_used TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Device sync table
CREATE TABLE device_sync (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) UNIQUE NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    device_type VARCHAR(20) NOT NULL,
    sync_key_encrypted TEXT NOT NULL,
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit log table
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_dids_user_id ON dids(user_id);
CREATE INDEX idx_dids_identifier ON dids(did_identifier);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_recovery_custodians_user_id ON recovery_custodians(user_id);
CREATE INDEX idx_recovery_requests_user_id ON recovery_requests(user_id);
CREATE INDEX idx_device_sync_user_id ON device_sync(user_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dids_updated_at BEFORE UPDATE ON dids
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recovery_custodians_updated_at BEFORE UPDATE ON recovery_custodians
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recovery_requests_updated_at BEFORE UPDATE ON recovery_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_device_sync_updated_at BEFORE UPDATE ON device_sync
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries
CREATE VIEW active_users AS
SELECT id, username, email, status, created_at
FROM users
WHERE status = 'active';

CREATE VIEW user_dids AS
SELECT u.username, d.did_identifier, d.status, d.created_at
FROM users u
JOIN dids d ON u.id = d.user_id
WHERE d.status = 'active';

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO identity_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO identity_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO identity_user;

EOF
    
    # Execute schema
    sudo -u postgres psql -d "$DB_NAME" -f /tmp/identity_protocol_schema.sql
    
    # Clean up
    rm /tmp/identity_protocol_schema.sql
    
    print_success "Database schema created successfully"
}

# Function to setup backup directory
setup_backup() {
    print_status "Setting up backup directory..."
    
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$BACKUP_DIR/archive"
    chown -R postgres:postgres "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"
    
    print_success "Backup directory created"
}

# Function to create backup script
create_backup_script() {
    print_status "Creating backup script..."
    
    cat > /usr/local/bin/backup_identity_protocol.sh << EOF
#!/bin/bash

# Identity Protocol Database Backup Script
BACKUP_DIR="$BACKUP_DIR"
DB_NAME="$DB_NAME"
DB_USER="$DB_USER"
DATE=\$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="\$BACKUP_DIR/identity_protocol_\$DATE.sql"

# Create backup
sudo -u postgres pg_dump -d "\$DB_NAME" > "\$BACKUP_FILE"

# Compress backup
gzip "\$BACKUP_FILE"

# Remove old backups (keep last 30 days)
find "\$BACKUP_DIR" -name "identity_protocol_*.sql.gz" -mtime +30 -delete

echo "Backup completed: \$BACKUP_FILE.gz"
EOF
    
    chmod +x /usr/local/bin/backup_identity_protocol.sh
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup_identity_protocol.sh") | crontab -
    
    print_success "Backup script created and scheduled"
}

# Function to restart PostgreSQL
restart_postgresql() {
    print_status "Restarting PostgreSQL..."
    
    systemctl restart postgresql
    
    # Wait for PostgreSQL to start
    sleep 5
    
    # Check if PostgreSQL is running
    if systemctl is-active --quiet postgresql; then
        print_success "PostgreSQL restarted successfully"
    else
        print_error "Failed to restart PostgreSQL"
        exit 1
    fi
}

# Function to test connection
test_connection() {
    print_status "Testing database connection..."
    
    # Test SSL connection
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT version();" > /dev/null 2>&1; then
        print_success "Database connection test successful"
    else
        print_error "Database connection test failed"
        exit 1
    fi
}

# Function to display configuration
display_configuration() {
    print_status "Database configuration summary:"
    echo "Database Name: $DB_NAME"
    echo "Database User: $DB_USER"
    echo "Database Host: $DB_HOST"
    echo "Database Port: $DB_PORT"
    echo "SSL Certificates: $SSL_CERT_DIR"
    echo "Backup Directory: $BACKUP_DIR"
    echo ""
    print_warning "IMPORTANT: Save the database password securely!"
    echo "Database Password: $DB_PASSWORD"
    echo ""
    print_status "Connection string:"
    echo "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=require"
}

# Main execution
main() {
    print_status "Starting Identity Protocol database setup..."
    
    check_root
    check_postgresql
    generate_password
    create_ssl_certificates
    configure_postgresql
    create_database
    create_schema
    setup_backup
    create_backup_script
    restart_postgresql
    test_connection
    display_configuration
    
    print_success "Database setup completed successfully!"
    print_status "Next steps:"
    echo "1. Update your application's database configuration"
    echo "2. Test the application with the new database"
    echo "3. Configure monitoring and alerting"
    echo "4. Set up regular security audits"
}

# Run main function
main "$@"
