#!/bin/bash

# Identity Protocol Production Deployment Script
# This script sets up the production environment

set -e

echo "🚀 Starting Identity Protocol Production Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="identity-protocol"
PROJECT_DIR="/var/www/$PROJECT_NAME"
SERVICE_NAME="identity-protocol-api"
DOMAIN="api.yourdomain.com"

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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root"
   exit 1
fi

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
print_status "Installing required packages..."
sudo apt install -y \
    curl \
    wget \
    git \
    build-essential \
    nginx \
    postgresql \
    postgresql-contrib \
    redis-server \
    certbot \
    python3-certbot-nginx \
    fail2ban \
    ufw \
    htop \
    vim \
    unzip

# Install Node.js 18.x
print_status "Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
print_status "Installing PM2..."
sudo npm install -g pm2

# Create project directory
print_status "Creating project directory..."
sudo mkdir -p $PROJECT_DIR
sudo chown $USER:$USER $PROJECT_DIR

# Clone repository (if not already present)
if [ ! -d "$PROJECT_DIR/.git" ]; then
    print_status "Cloning repository..."
    git clone https://github.com/yourusername/identity-protocol.git $PROJECT_DIR
fi

# Navigate to project directory
cd $PROJECT_DIR

# Install dependencies
print_status "Installing dependencies..."
npm install

# Build the project
print_status "Building project..."
cd api
npm install
npm run build

# Create logs directory
print_status "Creating logs directory..."
mkdir -p logs

# Copy environment file
print_status "Setting up environment configuration..."
if [ ! -f .env ]; then
    cp env.example .env
    print_warning "Please edit .env file with your production settings"
fi

# Setup PostgreSQL
print_status "Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE DATABASE identity_protocol;"
sudo -u postgres psql -c "CREATE USER identity_user WITH PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE identity_protocol TO identity_user;"

# Setup Redis
print_status "Configuring Redis..."
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Setup Nginx
print_status "Setting up Nginx..."
sudo cp nginx.conf /etc/nginx/sites-available/$PROJECT_NAME
sudo ln -sf /etc/nginx/sites-available/$PROJECT_NAME /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Setup SSL with Let's Encrypt
print_status "Setting up SSL certificate..."
if [ "$DOMAIN" != "api.yourdomain.com" ]; then
    sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email your-email@example.com
else
    print_warning "Please update the domain in this script and run certbot manually"
fi

# Setup firewall
print_status "Configuring firewall..."
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw allow 3001
sudo ufw --force enable

# Setup fail2ban
print_status "Configuring fail2ban..."
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Create systemd service
print_status "Creating systemd service..."
sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=Identity Protocol API Server
After=network.target

[Service]
Type=forking
User=$USER
WorkingDirectory=$PROJECT_DIR/api
Environment=NODE_ENV=production
ExecStart=/usr/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/bin/pm2 reload ecosystem.config.js --env production
ExecStop=/usr/bin/pm2 stop ecosystem.config.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
print_status "Starting service..."
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl start $SERVICE_NAME

# Start Nginx
print_status "Starting Nginx..."
sudo systemctl enable nginx
sudo systemctl start nginx

# Create backup script
print_status "Creating backup script..."
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/identity-protocol"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
pg_dump identity_protocol > $BACKUP_DIR/database_$DATE.sql

# Backup logs
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz logs/

# Backup configuration
tar -czf $BACKUP_DIR/config_$DATE.tar.gz .env ecosystem.config.js

# Clean old backups (keep last 7 days)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x backup.sh

# Setup cron for backups
print_status "Setting up automated backups..."
(crontab -l 2>/dev/null; echo "0 2 * * * $PROJECT_DIR/api/backup.sh") | crontab -

# Create monitoring script
print_status "Creating monitoring script..."
cat > monitor.sh << 'EOF'
#!/bin/bash
# Simple monitoring script

echo "=== Identity Protocol Status ==="
echo "Service Status:"
sudo systemctl status identity-protocol-api --no-pager -l

echo -e "\nPM2 Status:"
pm2 status

echo -e "\nNginx Status:"
sudo systemctl status nginx --no-pager -l

echo -e "\nPostgreSQL Status:"
sudo systemctl status postgresql --no-pager -l

echo -e "\nRedis Status:"
sudo systemctl status redis-server --no-pager -l

echo -e "\nDisk Usage:"
df -h

echo -e "\nMemory Usage:"
free -h

echo -e "\nRecent Logs:"
tail -n 20 logs/combined.log
EOF

chmod +x monitor.sh

# Final status check
print_status "Performing final status check..."
sleep 5

if curl -f http://localhost/health > /dev/null 2>&1; then
    print_status "✅ Health check passed!"
else
    print_warning "⚠️  Health check failed. Please check the logs."
fi

print_status "🎉 Deployment completed successfully!"
print_status "Next steps:"
echo "1. Edit the .env file with your production settings"
echo "2. Update the domain in nginx.conf and run certbot"
echo "3. Test the API endpoints"
echo "4. Set up monitoring and alerting"
echo "5. Configure your domain DNS to point to this server"

print_status "Useful commands:"
echo "- Check status: ./monitor.sh"
echo "- View logs: pm2 logs"
echo "- Restart service: sudo systemctl restart identity-protocol-api"
echo "- Backup: ./backup.sh" 