#!/bin/bash

# =============================================================================
# IDENTITY PROTOCOL - MONITORING SETUP SCRIPT
# =============================================================================
# 
# This script sets up monitoring and observability for production deployment.
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LOG_DIR="/var/log/identity-protocol"
MONITORING_DIR="/opt/identity-protocol/monitoring"
SENTRY_DSN=""
NEW_RELIC_LICENSE_KEY=""
DATADOG_API_KEY=""

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

# Function to create directories
create_directories() {
    log "Creating monitoring directories..."
    
    sudo mkdir -p "$LOG_DIR"
    sudo mkdir -p "$MONITORING_DIR"
    sudo mkdir -p "$LOG_DIR/application"
    sudo mkdir -p "$LOG_DIR/access"
    sudo mkdir -p "$LOG_DIR/error"
    
    sudo chown -R $USER:$USER "$LOG_DIR"
    sudo chown -R $USER:$USER "$MONITORING_DIR"
    
    success "Monitoring directories created"
}

# Function to setup log rotation
setup_log_rotation() {
    log "Setting up log rotation..."
    
    cat > /tmp/identity-protocol-logrotate << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        systemctl reload nginx > /dev/null 2>&1 || true
    endscript
}

$LOG_DIR/application/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
}

$LOG_DIR/access/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
}

$LOG_DIR/error/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
}
EOF
    
    sudo cp /tmp/identity-protocol-logrotate /etc/logrotate.d/identity-protocol
    sudo chmod 644 /etc/logrotate.d/identity-protocol
    
    success "Log rotation configured"
}

# Function to setup Sentry
setup_sentry() {
    log "Setting up Sentry error tracking..."
    
    # Install Sentry SDK
    npm install @sentry/node @sentry/tracing
    
    # Create Sentry configuration
    cat > "$MONITORING_DIR/sentry-config.js" << 'EOF'
const Sentry = require('@sentry/node');
const Tracing = require('@sentry/tracing');

function initSentry(app) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    release: process.env.SENTRY_RELEASE || '1.0.0',
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Tracing.Integrations.Express({ app }),
      new Tracing.Integrations.Postgres(),
    ],
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Filter out sensitive data
      if (event.request && event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });

  // Request handler must be the first middleware
  app.use(Sentry.Handlers.requestHandler());
  
  // TracingHandler creates a trace for every incoming request
  app.use(Sentry.Handlers.tracingHandler());
}

function errorHandler(app) {
  // The error handler must be registered before any other error middleware
  app.use(Sentry.Handlers.errorHandler());
}

module.exports = { initSentry, errorHandler };
EOF
    
    success "Sentry configuration created"
    warning "Please update SENTRY_DSN in your environment file"
}

# Function to setup New Relic
setup_new_relic() {
    log "Setting up New Relic APM..."
    
    # Install New Relic agent
    npm install newrelic
    
    # Create New Relic configuration
    cat > newrelic.js << 'EOF'
'use strict'

exports.config = {
  app_name: ['Identity Protocol'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
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
  },
  distributed_tracing: {
    enabled: true
  },
  transaction_tracer: {
    enabled: true,
    transaction_threshold: 5,
    record_sql: 'obfuscated',
    stack_trace_threshold: 0.5,
    explain_threshold: 0.5
  },
  error_collector: {
    enabled: true,
    capture_events: true
  },
  browser_monitoring: {
    enable: false
  }
}
EOF
    
    success "New Relic configuration created"
    warning "Please update NEW_RELIC_LICENSE_KEY in your environment file"
}

# Function to setup DataDog
setup_datadog() {
    log "Setting up DataDog monitoring..."
    
    # Install DataDog agent
    npm install dd-trace
    
    # Create DataDog configuration
    cat > "$MONITORING_DIR/datadog-config.js" << 'EOF'
const tracer = require('dd-trace').init({
  service: 'identity-protocol',
  env: process.env.DD_ENV || 'production',
  version: process.env.DD_VERSION || '1.0.0',
  logInjection: true,
  runtimeMetrics: true,
  profiling: true,
  tags: {
    'service.name': 'identity-protocol',
    'service.version': process.env.DD_VERSION || '1.0.0'
  }
});

module.exports = tracer;
EOF
    
    success "DataDog configuration created"
    warning "Please update DD_API_KEY in your environment file"
}

# Function to create health check endpoints
create_health_checks() {
    log "Creating health check endpoints..."
    
    cat > "$MONITORING_DIR/health-checks.js" << 'EOF'
const { Pool } = require('pg');
const Redis = require('ioredis');

// Database connection
const dbPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
});

// Health check middleware
function healthCheckMiddleware(app) {
  // Basic health check
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // Database health check
  app.get('/health/db', async (req, res) => {
    try {
      const client = await dbPool.connect();
      await client.query('SELECT 1 as health_check');
      client.release();
      
      res.status(200).json({
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Redis health check
  app.get('/health/redis', async (req, res) => {
    try {
      await redis.ping();
      
      res.status(200).json({
        status: 'healthy',
        redis: 'connected',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        redis: 'disconnected',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Comprehensive health check
  app.get('/health/comprehensive', async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {}
    };

    // Check database
    try {
      const client = await dbPool.connect();
      await client.query('SELECT 1 as health_check');
      client.release();
      health.services.database = { status: 'healthy' };
    } catch (error) {
      health.services.database = { status: 'unhealthy', error: error.message };
      health.status = 'unhealthy';
    }

    // Check Redis
    try {
      await redis.ping();
      health.services.redis = { status: 'healthy' };
    } catch (error) {
      health.services.redis = { status: 'unhealthy', error: error.message };
      health.status = 'unhealthy';
    }

    // Check external services
    try {
      // Add checks for external services here
      health.services.external = { status: 'healthy' };
    } catch (error) {
      health.services.external = { status: 'unhealthy', error: error.message };
      health.status = 'unhealthy';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  });
}

// Graceful shutdown
function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  
  // Close database connections
  dbPool.end();
  
  // Close Redis connection
  redis.disconnect();
  
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { healthCheckMiddleware };
EOF
    
    success "Health check endpoints created"
}

# Function to create monitoring dashboard
create_monitoring_dashboard() {
    log "Creating monitoring dashboard configuration..."
    
    cat > "$MONITORING_DIR/dashboard-config.json" << 'EOF'
{
  "title": "Identity Protocol - Production Dashboard",
  "description": "Real-time monitoring dashboard for Identity Protocol",
  "panels": [
    {
      "title": "Application Health",
      "type": "stat",
      "targets": [
        {
          "expr": "up{job=\"identity-protocol\"}",
          "legendFormat": "{{instance}}"
        }
      ]
    },
    {
      "title": "Response Time",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])",
          "legendFormat": "{{method}} {{route}}"
        }
      ]
    },
    {
      "title": "Request Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(http_requests_total[5m])",
          "legendFormat": "{{method}} {{route}}"
        }
      ]
    },
    {
      "title": "Error Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(http_requests_total{status=~\"5..\"}[5m])",
          "legendFormat": "{{method}} {{route}}"
        }
      ]
    },
    {
      "title": "Memory Usage",
      "type": "graph",
      "targets": [
        {
          "expr": "process_resident_memory_bytes",
          "legendFormat": "{{instance}}"
        }
      ]
    },
    {
      "title": "CPU Usage",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(process_cpu_seconds_total[5m]) * 100",
          "legendFormat": "{{instance}}"
        }
      ]
    }
  ]
}
EOF
    
    success "Monitoring dashboard configuration created"
}

# Function to setup alerts
setup_alerts() {
    log "Setting up monitoring alerts..."
    
    cat > "$MONITORING_DIR/alerts.yml" << 'EOF'
groups:
  - name: identity-protocol
    rules:
      - alert: ApplicationDown
        expr: up{job="identity-protocol"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Identity Protocol application is down"
          description: "Application has been down for more than 1 minute"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is above 10% for more than 2 minutes"

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time detected"
          description: "95th percentile response time is above 2 seconds"

      - alert: HighMemoryUsage
        expr: (process_resident_memory_bytes / process_heap_size_bytes) > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage detected"
          description: "Memory usage is above 90%"

      - alert: DatabaseConnectionFailed
        expr: up{job="database"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database connection failed"
          description: "Cannot connect to the database"

      - alert: RedisConnectionFailed
        expr: up{job="redis"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Redis connection failed"
          description: "Cannot connect to Redis"
EOF
    
    success "Monitoring alerts configured"
}

# Function to display setup information
display_info() {
    echo ""
    echo "=========================================="
    echo "🎉 MONITORING SETUP COMPLETED SUCCESSFULLY!"
    echo "=========================================="
    echo ""
    echo "📊 Monitoring Components:"
    echo "  ✅ Log rotation configured"
    echo "  ✅ Sentry error tracking setup"
    echo "  ✅ New Relic APM configured"
    echo "  ✅ DataDog monitoring setup"
    echo "  ✅ Health check endpoints created"
    echo "  ✅ Monitoring dashboard configured"
    echo "  ✅ Alert rules configured"
    echo ""
    echo "🔧 Health Check Endpoints:"
    echo "  GET /health - Basic health check"
    echo "  GET /health/db - Database health check"
    echo "  GET /health/redis - Redis health check"
    echo "  GET /health/comprehensive - Full system health"
    echo ""
    echo "📝 Next Steps:"
    echo "  1. Update environment variables with API keys"
    echo "  2. Integrate health checks into your application"
    echo "  3. Set up monitoring dashboards"
    echo "  4. Configure alert notifications"
    echo ""
    echo "🔑 Required Environment Variables:"
    echo "  SENTRY_DSN=https://your-sentry-dsn"
    echo "  NEW_RELIC_LICENSE_KEY=your-license-key"
    echo "  DD_API_KEY=your-datadog-api-key"
    echo "  DD_ENV=production"
    echo "  DD_SERVICE=identity-protocol"
    echo "  DD_VERSION=1.0.0"
    echo ""
}

# Main execution
main() {
    log "Starting monitoring setup..."
    
    # Check if we're in the right directory
    if [[ ! -f "package.json" ]]; then
        error "package.json not found. Please run this script from the project root."
        exit 1
    fi
    
    # Create directories
    create_directories
    
    # Setup log rotation
    setup_log_rotation
    
    # Setup monitoring tools
    setup_sentry
    setup_new_relic
    setup_datadog
    
    # Create health checks
    create_health_checks
    
    # Create monitoring dashboard
    create_monitoring_dashboard
    
    # Setup alerts
    setup_alerts
    
    # Display information
    display_info
    
    success "Monitoring setup completed!"
}

# Run main function
main "$@"
