# 🚀 Identity Protocol - Infrastructure Setup Guide

**Date**: 2024-01-01  
**Status**: 🟡 **READY FOR PRODUCTION DEPLOYMENT**

---

## 📋 **Infrastructure Requirements**

### **Minimum Requirements (Decentralized)**
- **CPU**: 1 core
- **RAM**: 2GB
- **Storage**: 20GB SSD (mostly logs)
- **Network**: 50Mbps
- **OS**: Ubuntu 20.04+ / CentOS 8+ / macOS 12+

### **Recommended Requirements (Decentralized)**
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 50GB SSD
- **Network**: 100Mbps+
- **OS**: Ubuntu 22.04 LTS

---

## 🗄️ **Database Setup**

### **Option 1: Managed Database (Recommended)**

#### **AWS RDS PostgreSQL**
```bash
# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier identity-protocol-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15.4 \
  --master-username identity_user \
  --master-user-password "your-secure-password" \
  --allocated-storage 20 \
  --storage-type gp2 \
  --storage-encrypted \
  --vpc-security-group-ids sg-xxxxxxxxx \
  --db-subnet-group-name your-subnet-group
```

#### **Google Cloud SQL**
```bash
# Create Cloud SQL instance
gcloud sql instances create identity-protocol-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-type=SSD \
  --storage-size=20GB \
  --backup-start-time=02:00 \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=03:00
```

#### **DigitalOcean Managed Database**
```bash
# Create via DigitalOcean CLI
doctl databases create identity-protocol-db \
  --engine pg \
  --version "15" \
  --size db-s-1vcpu-1gb \
  --region nyc1
```

### **Option 2: Self-Hosted PostgreSQL**

#### **Ubuntu/Debian Installation**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE identity_protocol;
CREATE USER identity_user WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE identity_protocol TO identity_user;
\q
EOF

# Configure PostgreSQL for production
sudo nano /etc/postgresql/*/main/postgresql.conf
# Set: max_connections = 100, shared_buffers = 256MB, effective_cache_size = 1GB

sudo nano /etc/postgresql/*/main/pg_hba.conf
# Add: host identity_protocol identity_user 127.0.0.1/32 md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

---

## 🔴 **Redis Setup**

### **Option 1: Managed Redis**

#### **AWS ElastiCache**
```bash
# Create ElastiCache cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id identity-protocol-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1 \
  --port 6379 \
  --vpc-security-group-ids sg-xxxxxxxxx \
  --subnet-group-name your-subnet-group
```

#### **Google Cloud Memorystore**
```bash
# Create Memorystore instance
gcloud redis instances create identity-protocol-redis \
  --size=1 \
  --region=us-central1 \
  --redis-version=redis_6_x
```

### **Option 2: Self-Hosted Redis**

#### **Ubuntu/Debian Installation**
```bash
# Install Redis
sudo apt install redis-server -y

# Configure Redis for production
sudo nano /etc/redis/redis.conf
# Set: maxmemory 256mb, maxmemory-policy allkeys-lru, requirepass your-redis-password

# Start and enable Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

---

## 🌐 **SSL/TLS Certificate Setup**

### **Option 1: Let's Encrypt (Free)**

#### **Install Certbot**
```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx -y

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx -y
```

#### **Obtain Certificate**
```bash
# For Nginx
sudo certbot --nginx -d your-domain.com -d api.your-domain.com

# For Apache
sudo certbot --apache -d your-domain.com -d api.your-domain.com

# Standalone (if not using web server)
sudo certbot certonly --standalone -d your-domain.com -d api.your-domain.com
```

#### **Auto-renewal**
```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

### **Option 2: Commercial SSL Certificate**

#### **Purchase from Certificate Authority**
- **DigiCert**: Enterprise-grade certificates
- **GlobalSign**: Business certificates
- **Comodo**: Affordable certificates

#### **Install Commercial Certificate**
```bash
# Copy certificate files
sudo cp your-domain.crt /etc/ssl/certs/
sudo cp your-domain.key /etc/ssl/private/

# Set permissions
sudo chmod 644 /etc/ssl/certs/your-domain.crt
sudo chmod 600 /etc/ssl/private/your-domain.key
```

---

## 🛡️ **Web Server Setup**

### **Nginx Configuration**

#### **Install Nginx**
```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

#### **Configure Nginx**
```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/identity-protocol

# Add configuration
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # API Proxy
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Dashboard (Static Files)
    location / {
        root /var/www/identity-protocol/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/identity-protocol /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 📊 **Monitoring Setup**

### **Sentry Error Tracking**

#### **Create Sentry Project**
1. Go to [sentry.io](https://sentry.io)
2. Create new project
3. Select Node.js
4. Get DSN from project settings

#### **Configure Sentry**
```bash
# Install Sentry SDK
npm install @sentry/node @sentry/tracing

# Update environment variables
SENTRY_DSN=https://your-sentry-dsn
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=1.0.0
```

### **Application Performance Monitoring (APM)**

#### **New Relic**
```bash
# Install New Relic agent
npm install newrelic

# Create newrelic.js configuration
cat > newrelic.js << EOF
'use strict'

exports.config = {
  app_name: ['Identity Protocol'],
  license_key: 'your-license-key',
  logging: {
    level: 'info'
  },
  allow_all_headers: true,
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*',
      'response.headers.x*'
    ]
  }
}
EOF
```

#### **DataDog**
```bash
# Install DataDog agent
npm install dd-trace

# Configure DataDog
DD_ENV=production
DD_SERVICE=identity-protocol
DD_VERSION=1.0.0
```

### **Health Checks**

#### **Create Health Check Endpoint**
```javascript
// Add to your API server
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version
  });
});

app.get('/health/db', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});
```

---

## 🔄 **Deployment Setup**

### **PM2 Process Manager**

#### **Install PM2**
```bash
npm install -g pm2
```

#### **Create PM2 Configuration**
```bash
# Create ecosystem.config.js
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'identity-protocol-api',
    script: './api/dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
EOF
```

#### **Start Application**
```bash
# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup

# Monitor application
pm2 monit
```

### **Docker Deployment**

#### **Create Dockerfile**
```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

EXPOSE 3002
CMD ["node", "dist/server.js"]
```

#### **Create Docker Compose**
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: identity_protocol
      POSTGRES_USER: identity_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

---

## 🔒 **Security Setup**

### **Firewall Configuration**

#### **UFW (Ubuntu)**
```bash
# Install UFW
sudo apt install ufw -y

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3002/tcp

# Enable firewall
sudo ufw enable
```

#### **Firewalld (CentOS/RHEL)**
```bash
# Configure firewall
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=3002/tcp
sudo firewall-cmd --reload
```

### **Fail2ban Setup**
```bash
# Install Fail2ban
sudo apt install fail2ban -y

# Configure Fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local

# Start Fail2ban
sudo systemctl start fail2ban
sudo systemctl enable fail2ban
```

---

## 📈 **Backup Setup**

### **Database Backup**
```bash
# Create backup script
cat > /usr/local/bin/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/identity-protocol"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="identity_protocol"
DB_USER="identity_user"

mkdir -p $BACKUP_DIR
pg_dump -U $DB_USER -h localhost $DB_NAME > $BACKUP_DIR/db_backup_$DATE.sql
gzip $BACKUP_DIR/db_backup_$DATE.sql

# Keep only last 7 days of backups
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +7 -delete
EOF

chmod +x /usr/local/bin/backup-db.sh

# Add to crontab (daily backup at 2 AM)
echo "0 2 * * * /usr/local/bin/backup-db.sh" | sudo crontab -
```

### **Application Backup**
```bash
# Create application backup script
cat > /usr/local/bin/backup-app.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/identity-protocol"
DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR="/var/www/identity-protocol"

mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz -C $APP_DIR .

# Keep only last 7 days of backups
find $BACKUP_DIR -name "app_backup_*.tar.gz" -mtime +7 -delete
EOF

chmod +x /usr/local/bin/backup-app.sh

# Add to crontab (weekly backup on Sunday at 3 AM)
echo "0 3 * * 0 /usr/local/bin/backup-app.sh" | sudo crontab -
```

---

## 🚀 **Deployment Checklist**

### **Pre-Deployment**
- [ ] Domain name registered and configured
- [ ] SSL certificate obtained and installed
- [ ] Database created and configured
- [ ] Redis instance set up
- [ ] Environment variables configured
- [ ] Monitoring tools configured
- [ ] Backup strategy implemented
- [ ] Security measures in place

### **Deployment**
- [ ] Application built for production
- [ ] Database migrations run
- [ ] Application deployed
- [ ] Health checks passing
- [ ] SSL certificate working
- [ ] Monitoring alerts configured
- [ ] Performance testing completed

### **Post-Deployment**
- [ ] User acceptance testing
- [ ] Security audit completed
- [ ] Load testing performed
- [ ] Documentation updated
- [ ] Support procedures established
- [ ] Monitoring dashboards configured

---

## 📞 **Support & Maintenance**

### **Monitoring Alerts**
- **Uptime**: Application availability
- **Performance**: Response time and throughput
- **Errors**: Application errors and exceptions
- **Security**: Failed login attempts and suspicious activity
- **Infrastructure**: CPU, memory, disk usage

### **Maintenance Schedule**
- **Daily**: Check monitoring dashboards
- **Weekly**: Review logs and performance metrics
- **Monthly**: Security updates and patches
- **Quarterly**: Performance optimization and capacity planning

---

**Status**: 🟡 **READY FOR PRODUCTION DEPLOYMENT**  
**Estimated Setup Time**: 2-3 days  
**Recommended Team Size**: 1-2 developers + 1 DevOps engineer
