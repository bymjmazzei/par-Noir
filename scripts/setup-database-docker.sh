#!/bin/bash

# =============================================================================
# IDENTITY PROTOCOL - DOCKER DATABASE SETUP SCRIPT
# =============================================================================
# 
# This script sets up PostgreSQL and Redis using Docker for development/testing.
# For production, use the setup-database.sh script with a proper PostgreSQL installation.
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
REDIS_PASSWORD=""
REDIS_PORT="6379"
DOCKER_NETWORK="identity-protocol-network"
POSTGRES_CONTAINER="identity-protocol-postgres"
REDIS_CONTAINER="identity-protocol-redis"

# Function to print colored output
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

# Function to check Docker installation
check_docker() {
    log "Checking Docker installation..."
    
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    success "Docker is installed and running"
}

# Function to generate secure passwords
generate_passwords() {
    log "Generating secure passwords..."
    
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    
    success "Secure passwords generated"
}

# Function to create Docker network
create_network() {
    log "Creating Docker network..."
    
    if ! docker network ls | grep -q "$DOCKER_NETWORK"; then
        docker network create "$DOCKER_NETWORK"
        success "Docker network created: $DOCKER_NETWORK"
    else
        success "Docker network already exists: $DOCKER_NETWORK"
    fi
}

# Function to start PostgreSQL container
start_postgresql() {
    log "Starting PostgreSQL container..."
    
    # Stop and remove existing container if it exists
    if docker ps -a | grep -q "$POSTGRES_CONTAINER"; then
        log "Removing existing PostgreSQL container..."
        docker stop "$POSTGRES_CONTAINER" 2>/dev/null || true
        docker rm "$POSTGRES_CONTAINER" 2>/dev/null || true
    fi
    
    # Start PostgreSQL container
    docker run -d \
        --name "$POSTGRES_CONTAINER" \
        --network "$DOCKER_NETWORK" \
        -e POSTGRES_DB="$DB_NAME" \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASSWORD" \
        -p "$DB_PORT:5432" \
        -v identity_protocol_data:/var/lib/postgresql/data \
        --restart unless-stopped \
        postgres:15-alpine
    
    success "PostgreSQL container started"
    
    # Wait for PostgreSQL to be ready
    log "Waiting for PostgreSQL to be ready..."
    sleep 10
    
    # Test connection
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME"; then
        success "PostgreSQL is ready"
    else
        error "PostgreSQL failed to start properly"
        exit 1
    fi
}

# Function to start Redis container
start_redis() {
    log "Starting Redis container..."
    
    # Stop and remove existing container if it exists
    if docker ps -a | grep -q "$REDIS_CONTAINER"; then
        log "Removing existing Redis container..."
        docker stop "$REDIS_CONTAINER" 2>/dev/null || true
        docker rm "$REDIS_CONTAINER" 2>/dev/null || true
    fi
    
    # Start Redis container
    docker run -d \
        --name "$REDIS_CONTAINER" \
        --network "$DOCKER_NETWORK" \
        -e REDIS_PASSWORD="$REDIS_PASSWORD" \
        -p "$REDIS_PORT:6379" \
        -v identity_protocol_redis_data:/data \
        --restart unless-stopped \
        redis:7-alpine redis-server --requirepass "$REDIS_PASSWORD"
    
    success "Redis container started"
    
    # Wait for Redis to be ready
    log "Waiting for Redis to be ready..."
    sleep 5
    
    # Test connection
    if docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" ping | grep -q "PONG"; then
        success "Redis is ready"
    else
        error "Redis failed to start properly"
        exit 1
    fi
}

# Function to create database schema
create_schema() {
    log "Creating database schema..."
    
    # Create schema file
    cat > /tmp/identity_protocol_schema.sql << 'EOF'
-- Identity Protocol Database Schema
-- Created: $(date)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- DIDs table
CREATE TABLE IF NOT EXISTS dids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    did_string VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL,
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recovery custodians table
CREATE TABLE IF NOT EXISTS recovery_custodians (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    did_id UUID REFERENCES dids(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    type VARCHAR(20) DEFAULT 'person',
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recovery requests table
CREATE TABLE IF NOT EXISTS recovery_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    did_id UUID REFERENCES dids(id) ON DELETE CASCADE,
    requesting_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    approvals_required INTEGER DEFAULT 2,
    approvals_received INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_dids_did_string ON dids(did_string);
CREATE INDEX IF NOT EXISTS idx_dids_user_id ON dids(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dids_updated_at BEFORE UPDATE ON dids FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EOF
    
    # Execute schema
    docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < /tmp/identity_protocol_schema.sql
    
    success "Database schema created"
}

# Function to update environment file
update_env_file() {
    log "Updating environment file with database credentials..."
    
    # Update .env.production with database credentials
    sed -i.bak \
        -e "s/DB_HOST=.*/DB_HOST=$DB_HOST/" \
        -e "s/DB_PORT=.*/DB_PORT=$DB_PORT/" \
        -e "s/DB_NAME=.*/DB_NAME=$DB_NAME/" \
        -e "s/DB_USER=.*/DB_USER=$DB_USER/" \
        -e "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" \
        -e "s/REDIS_HOST=.*/REDIS_HOST=$DB_HOST/" \
        -e "s/REDIS_PORT=.*/REDIS_PORT=$REDIS_PORT/" \
        -e "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$REDIS_PASSWORD/" \
        .env.production
    
    success "Environment file updated with database credentials"
}

# Function to display connection information
display_info() {
    echo ""
    echo "=========================================="
    echo "🎉 DATABASE SETUP COMPLETED SUCCESSFULLY!"
    echo "=========================================="
    echo ""
    echo "📊 Database Information:"
    echo "  Host: $DB_HOST"
    echo "  Port: $DB_PORT"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    echo "  Password: $DB_PASSWORD"
    echo ""
    echo "🔴 Redis Information:"
    echo "  Host: $DB_HOST"
    echo "  Port: $REDIS_PORT"
    echo "  Password: $REDIS_PASSWORD"
    echo ""
    echo "🐳 Docker Containers:"
    echo "  PostgreSQL: $POSTGRES_CONTAINER"
    echo "  Redis: $REDIS_CONTAINER"
    echo "  Network: $DOCKER_NETWORK"
    echo ""
    echo "📝 Next Steps:"
    echo "  1. Test the database connection"
    echo "  2. Run database migrations"
    echo "  3. Start the application"
    echo ""
    echo "🔧 Useful Commands:"
    echo "  # Connect to PostgreSQL:"
    echo "  docker exec -it $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME"
    echo ""
    echo "  # Connect to Redis:"
    echo "  docker exec -it $REDIS_CONTAINER redis-cli -a $REDIS_PASSWORD"
    echo ""
    echo "  # View logs:"
    echo "  docker logs $POSTGRES_CONTAINER"
    echo "  docker logs $REDIS_CONTAINER"
    echo ""
}

# Main execution
main() {
    log "Starting Docker database setup..."
    
    # Check if we're in the right directory
    if [[ ! -f "package.json" ]]; then
        error "package.json not found. Please run this script from the project root."
        exit 1
    fi
    
    # Check Docker
    check_docker
    
    # Generate passwords
    generate_passwords
    
    # Create network
    create_network
    
    # Start containers
    start_postgresql
    start_redis
    
    # Create schema
    create_schema
    
    # Update environment file
    update_env_file
    
    # Display information
    display_info
    
    success "Docker database setup completed!"
}

# Run main function
main "$@"
