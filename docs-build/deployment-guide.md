# Identity Protocol Deployment Guide

## Overview

This guide covers deploying the complete Identity Protocol system, including the OAuth server, webhook system, developer portal, and dashboard applications.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   OAuth Server  │    │ Webhook System  │    │ Developer Portal│
│   (Port 3001)   │    │   (Port 3002)   │    │   (Port 3004)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  ID Dashboard   │
                    │   (Port 3003)   │
                    └─────────────────┘
```

## Prerequisites

- Node.js 18+ 
- npm 8+
- Git
- SSL certificates (for production)
- Domain name (for production)

## Environment Variables

Create a `.env` file in the root directory:

```bash
# OAuth Server
JWT_SECRET=your-super-secret-jwt-key-here
OAUTH_PORT=3001
OAUTH_CORS_ORIGIN=https://your-domain.com

# Webhook System
WEBHOOK_PORT=3002
WEBHOOK_SECRET=your-webhook-secret-key

# Database (if using external storage)
DATABASE_URL=your-database-url
REDIS_URL=your-redis-url

# IPFS Configuration
IPFS_GATEWAY=https://ipfs.io/ipfs/
IPFS_API_URL=https://ipfs.infura.io:5001

# Email/SMS (for production)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMS_PROVIDER=twilio
SMS_ACCOUNT_SID=your-twilio-sid
SMS_AUTH_TOKEN=your-twilio-token

# Monitoring
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info
```

## Step 1: Install Dependencies

```bash
# Install root dependencies
npm install

# Install OAuth server dependencies
cd api
npm install express jsonwebtoken crypto cors helmet

# Install webhook system dependencies
npm install express crypto events

# Install dashboard dependencies
cd ../apps/id-dashboard
npm install

# Install developer portal dependencies
cd ../developer-portal
npm install
```

## Step 2: Build Applications

```bash
# Build the dashboard
cd apps/id-dashboard
npm run build

# Build the developer portal
cd ../developer-portal
npm run build

# Build the SDK
cd ../../sdk/identity-sdk
npm run build
```

## Step 3: Start Services

### Development Mode

```bash
# Terminal 1: OAuth Server
cd api
node oauth-server.js

# Terminal 2: Webhook System
cd api
node webhook-system.js

# Terminal 3: Dashboard
cd apps/id-dashboard
npm run dev

# Terminal 4: Developer Portal
cd apps/developer-portal
npm run dev
```

### Production Mode

Create a `start.sh` script:

```bash
#!/bin/bash

# Start OAuth Server
cd api
node oauth-server.js &
OAUTH_PID=$!

# Start Webhook System
cd api
node webhook-system.js &
WEBHOOK_PID=$!

# Start Dashboard (served by nginx)
cd ../apps/id-dashboard
npm run build

# Start Developer Portal (served by nginx)
cd ../developer-portal
npm run build

echo "Services started:"
echo "OAuth Server PID: $OAUTH_PID"
echo "Webhook System PID: $WEBHOOK_PID"

# Wait for processes
wait $OAUTH_PID $WEBHOOK_PID
```

Make it executable:
```bash
chmod +x start.sh
```

## Step 4: Nginx Configuration

Create `/etc/nginx/sites-available/identity-protocol`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # OAuth API
    location /api/oauth/ {
        proxy_pass http://localhost:3001/oauth/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Webhook API
    location /api/webhooks/ {
        proxy_pass http://localhost:3002/webhooks/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Developer Portal
    location /developers/ {
        alias /path/to/identity-protocol/apps/developer-portal/dist/;
        try_files $uri $uri/ /developers/index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Dashboard
    location / {
        root /path/to/identity-protocol/apps/id-dashboard/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/identity-protocol /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 5: SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Step 6: Systemd Services

Create `/etc/systemd/system/identity-protocol-oauth.service`:

```ini
[Unit]
Description=Identity Protocol OAuth Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/identity-protocol/api
ExecStart=/usr/bin/node oauth-server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=JWT_SECRET=your-jwt-secret

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/identity-protocol-webhook.service`:

```ini
[Unit]
Description=Identity Protocol Webhook System
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/identity-protocol/api
ExecStart=/usr/bin/node webhook-system.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=WEBHOOK_SECRET=your-webhook-secret

[Install]
WantedBy=multi-user.target
```

Enable and start services:
```bash
sudo systemctl enable identity-protocol-oauth
sudo systemctl enable identity-protocol-webhook
sudo systemctl start identity-protocol-oauth
sudo systemctl start identity-protocol-webhook
```

## Step 7: Monitoring and Logging

### PM2 (Alternative to systemd)

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'identity-protocol-oauth',
      script: './api/oauth-server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        JWT_SECRET: 'your-jwt-secret'
      }
    },
    {
      name: 'identity-protocol-webhook',
      script: './api/webhook-system.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        WEBHOOK_SECRET: 'your-webhook-secret'
      }
    }
  ]
};
EOF

# Start services
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Logging

```bash
# View logs
pm2 logs identity-protocol-oauth
pm2 logs identity-protocol-webhook

# Or with systemd
sudo journalctl -u identity-protocol-oauth -f
sudo journalctl -u identity-protocol-webhook -f
```

## Step 8: Database Setup (Optional)

For production, consider using external storage:

### PostgreSQL

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb identity_protocol
sudo -u postgres createuser identity_user

# Grant permissions
sudo -u postgres psql
GRANT ALL PRIVILEGES ON DATABASE identity_protocol TO identity_user;
\q
```

### Redis (for caching)

```bash
# Install Redis
sudo apt install redis-server

# Configure Redis
sudo nano /etc/redis/redis.conf
# Set: maxmemory 256mb
# Set: maxmemory-policy allkeys-lru

# Restart Redis
sudo systemctl restart redis
```

## Step 9: Backup Strategy

Create backup scripts:

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/identity-protocol"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database (if using PostgreSQL)
pg_dump identity_protocol > $BACKUP_DIR/db_$DATE.sql

# Backup configuration files
tar -czf $BACKUP_DIR/config_$DATE.tar.gz \
  /etc/nginx/sites-available/identity-protocol \
  /etc/systemd/system/identity-protocol-*.service \
  .env

# Backup logs
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz \
  /var/log/nginx/access.log \
  /var/log/nginx/error.log

# Clean old backups (keep 30 days)
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

Make it executable and add to crontab:
```bash
chmod +x backup.sh
crontab -e
# Add: 0 2 * * * /path/to/backup.sh
```

## Step 10: Security Hardening

### Firewall Configuration

```bash
# Install UFW
sudo apt install ufw

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Fail2ban

```bash
# Install Fail2ban
sudo apt install fail2ban

# Configure for nginx
sudo nano /etc/fail2ban/jail.local
```

Add:
```ini
[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 3600
```

```bash
sudo systemctl restart fail2ban
```

## Step 11: Performance Optimization

### Nginx Optimization

Add to nginx configuration:
```nginx
# Gzip compression
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

# Cache static files
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
location /api/ {
    limit_req zone=api burst=20 nodelay;
}
```

### Node.js Optimization

```bash
# Increase file descriptor limits
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# Optimize Node.js
export NODE_OPTIONS="--max-old-space-size=2048"
```

## Step 12: Health Checks

Create health check endpoints:

```bash
# Test OAuth server
curl -f http://localhost:3001/health

# Test webhook system
curl -f http://localhost:3002/webhooks/health

# Test nginx
curl -f https://your-domain.com/health
```

## Step 13: Monitoring

### Basic Monitoring Script

```bash
#!/bin/bash
# monitor.sh

DOMAIN="your-domain.com"
EMAIL="admin@your-domain.com"

# Check services
check_service() {
    local service=$1
    local port=$2
    
    if ! curl -f http://localhost:$port/health > /dev/null 2>&1; then
        echo "Service $service is down!" | mail -s "Service Alert" $EMAIL
        systemctl restart $service
    fi
}

check_service "oauth" 3001
check_service "webhook" 3002

# Check SSL certificate
if ! openssl s_client -connect $DOMAIN:443 -servername $DOMAIN < /dev/null 2>/dev/null | openssl x509 -noout -checkend 86400 > /dev/null; then
    echo "SSL certificate expires soon!" | mail -s "SSL Alert" $EMAIL
fi
```

Add to crontab:
```bash
crontab -e
# Add: */5 * * * * /path/to/monitor.sh
```

## Troubleshooting

### Common Issues

1. **Port already in use:**
   ```bash
   sudo netstat -tulpn | grep :3001
   sudo kill -9 <PID>
   ```

2. **Permission denied:**
   ```bash
   sudo chown -R www-data:www-data /path/to/identity-protocol
   sudo chmod -R 755 /path/to/identity-protocol
   ```

3. **SSL certificate issues:**
   ```bash
   sudo certbot renew --dry-run
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **Database connection issues:**
   ```bash
   sudo -u postgres psql -c "SELECT version();"
   ```

### Log Locations

- **Nginx:** `/var/log/nginx/`
- **Systemd:** `journalctl -u identity-protocol-*`
- **PM2:** `pm2 logs`
- **Application:** Check your application logs

## Production Checklist

- [ ] SSL certificates installed and auto-renewing
- [ ] Firewall configured
- [ ] Fail2ban installed and configured
- [ ] Monitoring and alerting set up
- [ ] Backup strategy implemented
- [ ] Log rotation configured
- [ ] Rate limiting enabled
- [ ] Security headers configured
- [ ] Health checks implemented
- [ ] Performance optimized
- [ ] Documentation updated

## Support

For deployment support:
- **Documentation:** https://docs.identity-protocol.com/deployment
- **GitHub Issues:** https://github.com/identity-protocol/issues
- **Email:** deployment-support@identity-protocol.com 