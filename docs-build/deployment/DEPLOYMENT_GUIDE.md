# Deployment Guide
## Identity Protocol - Production Deployment Documentation

### Overview

This guide provides comprehensive instructions for deploying the Identity Protocol to production environments. It covers infrastructure setup, configuration, security hardening, and monitoring.

### Prerequisites

#### 1. **System Requirements**
- **Operating System**: Ubuntu 20.04 LTS or later
- **CPU**: 4+ cores
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 100GB SSD minimum
- **Network**: High-speed internet connection

#### 2. **Software Requirements**
- **Node.js**: 18.x or later
- **PostgreSQL**: 14.x or later
- **Redis**: 6.x or later
- **Nginx**: 1.18 or later
- **Docker**: 20.x or later (optional)
- **PM2**: For process management

#### 3. **External Services**
- **Domain Name**: Registered domain for production
- **SSL Certificate**: Wildcard SSL certificate
- **Cloud Services**: AWS, Azure, or GCP account
- **Monitoring**: Sentry, APM, SIEM accounts

### Infrastructure Setup

#### 1. **Server Provisioning**

**AWS EC2 Setup:**
```bash
# Launch Ubuntu 20.04 LTS instance
# Instance Type: t3.large or larger
# Storage: 100GB GP3 SSD
# Security Groups: Configure firewall rules
```

**Firewall Configuration:**
```bash
# Allow SSH (port 22)
# Allow HTTP (port 80)
# Allow HTTPS (port 443)
# Allow custom ports for services
```

#### 2. **Domain and DNS Setup**

**Domain Configuration:**
```bash
# Point domain to server IP
# Configure subdomains:
# - api.identityprotocol.com (API)
# - dashboard.identityprotocol.com (Dashboard)
# - admin.identityprotocol.com (Admin)
```

**SSL Certificate Setup:**
```bash
# Install Certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d api.identityprotocol.com
sudo certbot --nginx -d dashboard.identityprotocol.com
sudo certbot --nginx -d admin.identityprotocol.com
```

### Database Setup

#### 1. **PostgreSQL Installation**

```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Secure PostgreSQL
sudo -u postgres psql
```

**PostgreSQL Security Configuration:**
```sql
-- Create application user
CREATE USER identity_protocol WITH PASSWORD 'secure-password';

-- Create database
CREATE DATABASE identity_protocol OWNER identity_protocol;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE identity_protocol TO identity_protocol;

-- Enable required extensions
\c identity_protocol
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

#### 2. **Redis Setup**

```bash
# Install Redis
sudo apt update
sudo apt install redis-server

# Configure Redis
sudo nano /etc/redis/redis.conf
```

**Redis Configuration:**
```conf
# Security settings
requirepass "secure-redis-password"
bind 127.0.0.1
protected-mode yes

# Performance settings
maxmemory 2gb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000
```

```bash
# Restart Redis
sudo systemctl restart redis
sudo systemctl enable redis
```

### Application Deployment

#### 1. **Code Deployment**

```bash
# Clone repository
git clone https://github.com/your-org/identity-protocol.git
cd identity-protocol

# Install dependencies
npm install

# Build application
npm run build

# Set up environment variables
cp env.production.template .env
nano .env
```

#### 2. **Environment Configuration**

**Production Environment Variables:**
```bash
# Application
NODE_ENV=production
PORT=3002
HOST=0.0.0.0

# Security
JWT_SECRET=your-super-secure-jwt-secret
SESSION_SECRET=your-super-secure-session-secret
ENCRYPTION_KEY=your-32-byte-encryption-key

# Database
DATABASE_URL=postgresql://identity_protocol:password@localhost:5432/identity_protocol
REDIS_URL=redis://:password@localhost:6379

# External Services
FIREBASE_PROJECT_ID=your-firebase-project
SENDGRID_API_KEY=your-sendgrid-api-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
IPFS_API_KEY=your-ipfs-api-key

# Monitoring
SENTRY_DSN=your-sentry-dsn
APM_SERVER_URL=your-apm-server-url
```

#### 3. **Process Management with PM2**

```bash
# Install PM2
npm install -g pm2

# Create PM2 ecosystem file
nano ecosystem.config.js
```

**PM2 Configuration:**
```javascript
module.exports = {
  apps: [{
    name: 'identity-protocol-api',
    script: 'dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
```

### Load Balancer Configuration

#### 1. **Nginx Setup**

```bash
# Install Nginx
sudo apt update
sudo apt install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/identity-protocol
```

**Nginx Configuration:**
```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=did:10m rate=2r/s;

# Upstream servers
upstream api_servers {
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
    server 127.0.0.1:3004;
}

upstream dashboard_servers {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name api.identityprotocol.com dashboard.identityprotocol.com;
    return 301 https://$server_name$request_uri;
}

# API server
server {
    listen 443 ssl http2;
    server_name api.identityprotocol.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/api.identityprotocol.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.identityprotocol.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Rate limiting
    limit_req zone=api burst=20 nodelay;

    # Proxy to API servers
    location / {
        proxy_pass http://api_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Dashboard server
server {
    listen 443 ssl http2;
    server_name dashboard.identityprotocol.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/dashboard.identityprotocol.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dashboard.identityprotocol.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Proxy to dashboard servers
    location / {
        proxy_pass http://dashboard_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/identity-protocol /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Security Hardening

#### 1. **Server Security**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install security tools
sudo apt install fail2ban ufw

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# Configure fail2ban
sudo nano /etc/fail2ban/jail.local
```

**Fail2ban Configuration:**
```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log
```

#### 2. **Application Security**

```bash
# Set up security monitoring
npm install -g security-audit
npm audit fix

# Run security tests
./scripts/security-audit.sh
./scripts/penetration-test.sh
./scripts/crypto-test.sh
```

### Monitoring and Logging

#### 1. **Application Monitoring**

```bash
# Install monitoring tools
npm install -g pm2-logrotate

# Configure PM2 logging
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

#### 2. **System Monitoring**

```bash
# Install monitoring tools
sudo apt install htop iotop nethogs

# Set up log rotation
sudo nano /etc/logrotate.d/identity-protocol
```

**Log Rotation Configuration:**
```
/var/log/identity-protocol/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reloadLogs
    endscript
}
```

### Backup and Recovery

#### 1. **Database Backup**

```bash
# Create backup script
nano /opt/backup-database.sh
```

**Backup Script:**
```bash
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="identity_protocol"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U identity_protocol -h localhost $DB_NAME > $BACKUP_DIR/db_backup_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/db_backup_$DATE.sql

# Remove old backups (keep 30 days)
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +30 -delete

# Upload to cloud storage (optional)
# aws s3 cp $BACKUP_DIR/db_backup_$DATE.sql.gz s3://your-backup-bucket/
```

```bash
# Make script executable
chmod +x /opt/backup-database.sh

# Add to crontab
crontab -e
# Add: 0 2 * * * /opt/backup-database.sh
```

#### 2. **Application Backup**

```bash
# Create application backup script
nano /opt/backup-application.sh
```

**Application Backup Script:**
```bash
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR="/opt/identity-protocol"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup application files
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz -C $APP_DIR .

# Remove old backups (keep 7 days)
find $BACKUP_DIR -name "app_backup_*.tar.gz" -mtime +7 -delete
```

### Deployment Verification

#### 1. **Health Checks**

```bash
# Test API endpoints
curl -k https://api.identityprotocol.com/api/health
curl -k https://api.identityprotocol.com/api/status

# Test dashboard
curl -k https://dashboard.identityprotocol.com

# Test SSL configuration
openssl s_client -connect api.identityprotocol.com:443 -servername api.identityprotocol.com
```

#### 2. **Performance Testing**

```bash
# Install testing tools
npm install -g artillery

# Run load tests
artillery quick --count 100 --num 10 https://api.identityprotocol.com/api/health
```

### Troubleshooting

#### 1. **Common Issues**

**Application Won't Start:**
```bash
# Check logs
pm2 logs
tail -f /var/log/nginx/error.log

# Check environment
pm2 env 0

# Restart application
pm2 restart all
```

**Database Connection Issues:**
```bash
# Test database connection
psql -U identity_protocol -h localhost -d identity_protocol

# Check PostgreSQL status
sudo systemctl status postgresql
```

**SSL Certificate Issues:**
```bash
# Renew SSL certificates
sudo certbot renew

# Test SSL configuration
sudo nginx -t
sudo systemctl reload nginx
```

#### 2. **Monitoring Commands**

```bash
# Check system resources
htop
df -h
free -h

# Check application status
pm2 status
pm2 monit

# Check network connections
netstat -tulpn
ss -tulpn
```

### Maintenance Procedures

#### 1. **Regular Maintenance**

**Weekly Tasks:**
- Review security logs
- Check system resources
- Update system packages
- Review backup status

**Monthly Tasks:**
- Security audit
- Performance review
- SSL certificate renewal
- Database optimization

**Quarterly Tasks:**
- Penetration testing
- Disaster recovery testing
- Security training
- Architecture review

#### 2. **Update Procedures**

```bash
# Application updates
git pull origin main
npm install
npm run build
pm2 restart all

# System updates
sudo apt update && sudo apt upgrade -y
sudo systemctl restart nginx postgresql redis
```

### Disaster Recovery

#### 1. **Recovery Procedures**

**Database Recovery:**
```bash
# Stop application
pm2 stop all

# Restore database
psql -U identity_protocol -h localhost -d identity_protocol < backup_file.sql

# Start application
pm2 start all
```

**Application Recovery:**
```bash
# Restore application files
tar -xzf backup_file.tar.gz -C /opt/identity-protocol/

# Restart application
pm2 restart all
```

#### 2. **High Availability Setup**

**Load Balancer Configuration:**
```nginx
upstream api_servers {
    server server1:3002;
    server server2:3002;
    server server3:3002;
}
```

**Database Replication:**
```sql
-- Primary database
-- Configure streaming replication
-- Set up read replicas
```

---

### Contact Information

**Deployment Team:**
- **DevOps Lead**: [Contact Information]
- **System Administrator**: [Contact Information]
- **Security Team**: [Contact Information]

**Emergency Contacts:**
- **24/7 Support**: [Contact Information]
- **Security Incident**: [Contact Information]

---

*This deployment guide is maintained by the DevOps Team and updated regularly.*
*Last updated: $(date +'%Y-%m-%d')*
