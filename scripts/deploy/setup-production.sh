#!/bin/bash

# Production Setup Script for Identity Protocol
# Run this on your production server

set -e

echo "🚀 Setting up Identity Protocol Production Environment..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
echo "🔧 Installing dependencies..."
sudo apt install -y nginx postgresql postgresql-contrib redis-server certbot python3-certbot-nginx ufw fail2ban

# Install Node.js 18
echo "📦 Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Create application user
echo "👤 Creating application user..."
sudo useradd -m -s /bin/bash identity-app
sudo usermod -aG sudo identity-app

# Create application directories
echo "📁 Creating application directories..."
sudo mkdir -p /opt/identity-protocol
sudo chown identity-app:identity-app /opt/identity-protocol

# Setup PostgreSQL
echo "🗄️ Setting up PostgreSQL..."
sudo -u postgres createuser --interactive identity-app
sudo -u postgres createdb identity_protocol
sudo -u postgres psql -c "ALTER USER identity_app WITH PASSWORD 'secure_password_here';"

# Setup Redis
echo "🔴 Setting up Redis..."
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Setup firewall
echo "🔥 Configuring firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3001  # OAuth server
sudo ufw allow 3002  # Dashboard
sudo ufw --force enable

# Setup fail2ban
echo "🛡️ Setting up fail2ban..."
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Create Nginx configuration
echo "🌐 Setting up Nginx..."
sudo tee /etc/nginx/sites-available/identity-protocol << EOF
server {
    listen 80;
    server_name your-domain.com;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Dashboard
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # OAuth API
    location /oauth/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Static files
    location /static/ {
        alias /opt/identity-protocol/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/identity-protocol /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Create environment file
echo "🔐 Creating environment configuration..."
sudo tee /opt/identity-protocol/.env << EOF
# Database
DATABASE_URL=postgresql://identity-app:secure_password_here@localhost/identity_protocol

# Redis
REDIS_URL=redis://localhost:6379

# OAuth
OAUTH_PORT=3001
JWT_SECRET=your-super-secret-jwt-key-here

# IPFS
IPFS_URL=https://ipfs.infura.io:5001
IPFS_GATEWAY=https://ipfs.io/ipfs/

# Security
NODE_ENV=production
PORT=3002
EOF

# Create PM2 ecosystem file
echo "⚙️ Creating PM2 configuration..."
sudo tee /opt/identity-protocol/ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'identity-dashboard',
      script: 'apps/id-dashboard/dist/index.html',
      cwd: '/opt/identity-protocol',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    },
    {
      name: 'oauth-server',
      script: 'api/oauth-server.js',
      cwd: '/opt/identity-protocol',
      env: {
        NODE_ENV: 'production',
        OAUTH_PORT: 3001
      }
    }
  ]
};
EOF

# Setup SSL with Let's Encrypt
echo "🔒 Setting up SSL certificate..."
echo "Please run: sudo certbot --nginx -d your-domain.com"

# Create backup script
echo "💾 Creating backup script..."
sudo tee /opt/identity-protocol/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/identity-protocol"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
pg_dump identity_protocol > $BACKUP_DIR/database_$DATE.sql

# Backup application files
tar -czf $BACKUP_DIR/app_$DATE.tar.gz /opt/identity-protocol

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

sudo chmod +x /opt/identity-protocol/backup.sh

# Setup cron for backups
echo "📅 Setting up automated backups..."
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/identity-protocol/backup.sh") | crontab -

echo "✅ Production setup completed!"
echo ""
echo "Next steps:"
echo "1. Update your domain in Nginx config"
echo "2. Run: sudo certbot --nginx -d your-domain.com"
echo "3. Deploy your application code to /opt/identity-protocol"
echo "4. Start services with: pm2 start ecosystem.config.js"
echo "5. Save PM2 configuration: pm2 save"
echo "6. Setup PM2 startup: pm2 startup" 