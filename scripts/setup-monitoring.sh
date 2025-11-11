#!/bin/bash

# Monitoring and Alerting Setup Script for AI API Playground
# This script sets up monitoring, logging, and alerting for production deployment

set -e

echo "🔍 Setting up monitoring and alerting..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "render.yaml" ]; then
    print_error "render.yaml not found. Are you in the project root?"
    exit 1
fi

# Create monitoring directories
print_info "Creating monitoring directories..."
mkdir -p monitoring/alerts
mkdir -p monitoring/dashboards
mkdir -p monitoring/rules
mkdir -p monitoring/scripts

# Create monitoring configuration
print_info "Creating monitoring configuration..."

cat > monitoring/config.yml << 'EOF'
# Monitoring Configuration for AI API Playground

monitoring:
  enabled: true
  interval: 30s
  timeout: 10s
  
  # Health check endpoints
  health_checks:
    - name: backend
      endpoint: ${BACKEND_URL}/health
      interval: 30s
      timeout: 5s
      failure_threshold: 3
      
    - name: frontend
      endpoint: ${FRONTEND_URL}
      interval: 60s
      timeout: 10s
      failure_threshold: 2
      
    - name: database
      endpoint: ${DATABASE_URL}
      type: database
      interval: 60s
      timeout: 10s
      
    - name: redis
      endpoint: ${REDIS_URL}
      type: redis
      interval: 60s
      timeout: 5s

  # Metrics collection
  metrics:
    enabled: true
    endpoint: /metrics
    port: 9090
    collectors:
      - system
      - http
      - database
      - redis
      - custom

  # Alerting rules
  alerts:
    enabled: true
    channels:
      - type: slack
        webhook_url: ${SLACK_WEBHOOK_URL}
        channel: '#monitoring'
        
      - type: email
        smtp_host: ${SMTP_HOST}
        smtp_port: ${SMTP_PORT}
        username: ${SMTP_USERNAME}
        password: ${SMTP_PASSWORD}
        from: ${ALERT_FROM_EMAIL}
        to: ${ALERT_TO_EMAIL}

    rules:
      # CPU alerts
      - name: high_cpu_usage
        condition: cpu_usage > 80
        duration: 5m
        severity: warning
        message: "High CPU usage detected: {{value}}%"
        
      - name: critical_cpu_usage
        condition: cpu_usage > 95
        duration: 2m
        severity: critical
        message: "Critical CPU usage: {{value}}%"
        
      # Memory alerts
      - name: high_memory_usage
        condition: memory_usage > 80
        duration: 5m
        severity: warning
        message: "High memory usage: {{value}}%"
        
      - name: critical_memory_usage
        condition: memory_usage > 90
        duration: 2m
        severity: critical
        message: "Critical memory usage: {{value}}%"
        
      # Response time alerts
      - name: slow_response_time
        condition: response_time > 2000
        duration: 5m
        severity: warning
        message: "Slow response time: {{value}}ms"
        
      # Error rate alerts
      - name: high_error_rate
        condition: error_rate > 5
        duration: 5m
        severity: warning
        message: "High error rate: {{value}}%"
        
      - name: critical_error_rate
        condition: error_rate > 10
        duration: 2m
        severity: critical
        message: "Critical error rate: {{value}}%"
        
      # Database alerts
      - name: database_connection_failures
        condition: database_connections_failed > 3
        duration: 2m
        severity: critical
        message: "Database connection failures detected"
        
      # Redis alerts
      - name: redis_connection_failures
        condition: redis_connections_failed > 3
        duration: 2m
        severity: warning
        message: "Redis connection failures detected"

  # Logging configuration
  logging:
    level: info
    format: json
    destinations:
      - type: file
        path: ./logs/monitoring.log
        max_size: 10m
        max_files: 5
        
      - type: console
        colorize: true
        
      - type: external
        url: ${LOGGING_SERVICE_URL}
        api_key: ${LOGGING_API_KEY}

  # Performance monitoring
  performance:
    enabled: true
    tracing:
      enabled: true
      sample_rate: 0.1
      service_name: ai-api-playground
      
    profiling:
      enabled: true
      interval: 60s

  # Uptime monitoring
  uptime:
    enabled: true
    check_interval: 30s
    response_time_threshold: 2000
    
  # Custom metrics
  custom_metrics:
    - name: api_requests_total
      type: counter
      description: Total number of API requests
      
    - name: api_request_duration
      type: histogram
      description: API request duration in milliseconds
      
    - name: ai_requests_total
      type: counter
      labels: [provider, model, status]
      description: Total number of AI service requests
      
    - name: user_registrations_total
      type: counter
      description: Total number of user registrations
      
    - name: active_users
      type: gauge
      description: Number of active users
EOF

print_success "Created monitoring configuration"

# Create alert rules
print_info "Creating alert rules..."

cat > monitoring/rules/alert-rules.yml << 'EOF'
# Alert Rules for AI API Playground

groups:
  - name: system
    interval: 30s
    rules:
      - alert: HighCPUUsage
        expr: cpu_usage > 80
        for: 5m
        labels:
          severity: warning
          service: backend
        annotations:
          summary: "High CPU usage detected"
          description: "CPU usage is {{ $value }}% on {{ $labels.instance }}"
          
      - alert: CriticalCPUUsage
        expr: cpu_usage > 95
        for: 2m
        labels:
          severity: critical
          service: backend
        annotations:
          summary: "Critical CPU usage"
          description: "CPU usage is {{ $value }}% on {{ $labels.instance }}"
          
      - alert: HighMemoryUsage
        expr: memory_usage > 80
        for: 5m
        labels:
          severity: warning
          service: backend
        annotations:
          summary: "High memory usage detected"
          description: "Memory usage is {{ $value }}% on {{ $labels.instance }}"
          
      - alert: CriticalMemoryUsage
        expr: memory_usage > 90
        for: 2m
        labels:
          severity: critical
          service: backend
        annotations:
          summary: "Critical memory usage"
          description: "Memory usage is {{ $value }}% on {{ $labels.instance }}"

  - name: application
    interval: 30s
    rules:
      - alert: SlowResponseTime
        expr: response_time > 2000
        for: 5m
        labels:
          severity: warning
          service: backend
        annotations:
          summary: "Slow response time detected"
          description: "Response time is {{ $value }}ms on {{ $labels.instance }}"
          
      - alert: HighErrorRate
        expr: error_rate > 5
        for: 5m
        labels:
          severity: warning
          service: backend
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }}% on {{ $labels.instance }}"
          
      - alert: CriticalErrorRate
        expr: error_rate > 10
        for: 2m
        labels:
          severity: critical
          service: backend
        annotations:
          summary: "Critical error rate"
          description: "Error rate is {{ $value }}% on {{ $labels.instance }}"

  - name: database
    interval: 60s
    rules:
      - alert: DatabaseConnectionFailures
        expr: database_connections_failed > 3
        for: 2m
        labels:
          severity: critical
          service: database
        annotations:
          summary: "Database connection failures"
          description: "Database connection failures detected on {{ $labels.instance }}"
          
      - alert: HighDatabaseConnections
        expr: database_connections > 80
        for: 5m
        labels:
          severity: warning
          service: database
        annotations:
          summary: "High database connections"
          description: "Database connections are {{ $value }} on {{ $labels.instance }}"

  - name: redis
    interval: 60s
    rules:
      - alert: RedisConnectionFailures
        expr: redis_connections_failed > 3
        for: 2m
        labels:
          severity: warning
          service: redis
        annotations:
          summary: "Redis connection failures"
          description: "Redis connection failures detected on {{ $labels.instance }}"
          
      - alert: HighRedisMemoryUsage
        expr: redis_memory_usage > 80
        for: 5m
        labels:
          severity: warning
          service: redis
        annotations:
          summary: "High Redis memory usage"
          description: "Redis memory usage is {{ $value }}% on {{ $labels.instance }}"

  - name: ai_services
    interval: 30s
    rules:
      - alert: HighAIErrorRate
        expr: ai_error_rate > 10
        for: 5m
        labels:
          severity: warning
          service: ai
        annotations:
          summary: "High AI service error rate"
          description: "AI service error rate is {{ $value }}% for {{ $labels.provider }}"
          
      - alert: AIProviderDown
        expr: ai_provider_up == 0
        for: 2m
        labels:
          severity: critical
          service: ai
        annotations:
          summary: "AI provider is down"
          description: "AI provider {{ $labels.provider }} is down"
EOF

print_success "Created alert rules"

# Create monitoring dashboard configuration
print_info "Creating monitoring dashboard..."

cat > monitoring/dashboards/overview.json << 'EOF'
{
  "dashboard": {
    "title": "AI API Playground - Overview",
    "description": "Main dashboard for AI API Playground monitoring",
    "tags": ["production", "ai-api-playground"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "System Metrics",
        "type": "graph",
        "targets": [
          {
            "expr": "cpu_usage",
            "legendFormat": "CPU Usage %"
          },
          {
            "expr": "memory_usage",
            "legendFormat": "Memory Usage %"
          }
        ],
        "yAxes": [
          {
            "label": "Percentage",
            "min": 0,
            "max": 100,
            "unit": "percent"
          }
        ],
        "gridPos": {
          "h": 8,
          "w": 12,
          "x": 0,
          "y": 0
        }
      },
      {
        "id": 2,
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "response_time",
            "legendFormat": "Response Time (ms)"
          }
        ],
        "yAxes": [
          {
            "label": "Milliseconds",
            "min": 0,
            "unit": "ms"
          }
        ],
        "gridPos": {
          "h": 8,
          "w": 12,
          "x": 12,
          "y": 0
        }
      },
      {
        "id": 3,
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "error_rate",
            "legendFormat": "Error Rate %"
          }
        ],
        "yAxes": [
          {
            "label": "Percentage",
            "min": 0,
            "max": 100,
            "unit": "percent"
          }
        ],
        "gridPos": {
          "h": 8,
          "w": 12,
          "x": 0,
          "y": 8
        }
      },
      {
        "id": 4,
        "title": "API Requests",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(api_requests_total[5m])",
            "legendFormat": "Requests/sec"
          }
        ],
        "yAxes": [
          {
            "label": "Requests/sec",
            "min": 0,
            "unit": "reqps"
          }
        ],
        "gridPos": {
          "h": 8,
          "w": 12,
          "x": 12,
          "y": 8
        }
      },
      {
        "id": 5,
        "title": "AI Service Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "ai_requests_total",
            "legendFormat": "{{provider}} - {{model}}"
          }
        ],
        "yAxes": [
          {
            "label": "Requests",
            "min": 0,
            "unit": "short"
          }
        ],
        "gridPos": {
          "h": 8,
          "w": 12,
          "x": 0,
          "y": 16
        }
      },
      {
        "id": 6,
        "title": "Active Users",
        "type": "stat",
        "targets": [
          {
            "expr": "active_users",
            "legendFormat": "Active Users"
          }
        ],
        "gridPos": {
          "h": 8,
          "w": 12,
          "x": 12,
          "y": 16
        }
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "refresh": "30s"
  }
}
EOF

print_success "Created monitoring dashboard"

# Create monitoring scripts
print_info "Creating monitoring scripts..."

cat > monitoring/scripts/check-services.sh << 'EOF'
#!/bin/bash

# Service Health Check Script
# This script checks the health of all services

set -e

echo "🔍 Checking service health..."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
BACKEND_URL=${BACKEND_URL:-http://localhost:10000}
FRONTEND_URL=${FRONTEND_URL:-http://localhost:3000}
TIMEOUT=5

check_service() {
    local name=$1
    local url=$2
    
    echo -n "Checking $name... "
    if curl -f -s --max-time $TIMEOUT "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        return 0
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        return 1
    fi
}

# Check backend
check_service "Backend" "$BACKEND_URL/health"

# Check frontend
check_service "Frontend" "$FRONTEND_URL"

# Check database if psql is available
if command -v psql &> /dev/null && [ -n "$DATABASE_URL" ]; then
    echo -n "Checking Database... "
    if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${RED}✗ Unhealthy${NC}"
    fi
fi

# Check Redis if redis-cli is available
if command -v redis-cli &> /dev/null && [ -n "$REDIS_URL" ]; then
    echo -n "Checking Redis... "
    if redis-cli -u "$REDIS_URL" ping > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${REDIS}✗ Unhealthy${NC}"
    fi
fi

echo "✅ Service health check completed"
EOF

chmod +x monitoring/scripts/check-services.sh

cat > monitoring/scripts/send-metrics.sh << 'EOF'
#!/bin/bash

# Metrics Collection and Reporting Script
# This script collects metrics and sends them to monitoring services

set -e

echo "📊 Collecting and sending metrics..."

# Configuration
METRICS_ENDPOINT=${METRICS_ENDPOINT:-http://localhost:9090/metrics}
API_BASE_URL=${API_BASE_URL:-http://localhost:10000}

# Collect system metrics
collect_system_metrics() {
    # CPU usage
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    
    # Memory usage
    MEMORY_USAGE=$(free | grep Mem | awk '{printf("%.1f", $3/$2 * 100.0)}')
    
    # Disk usage
    DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    
    # Load average
    LOAD_AVERAGE=$(uptime | awk -F'load average:' '{print $2}' | cut -d',' -f1 | xargs)
    
    echo "system_cpu_usage $CPU_USAGE"
    echo "system_memory_usage $MEMORY_USAGE"
    echo "system_disk_usage $DISK_USAGE"
    echo "system_load_average $LOAD_AVERAGE"
}

# Collect application metrics
collect_app_metrics() {
    if curl -f -s "$API_BASE_URL/metrics" > /dev/null 2>&1; then
        curl -s "$API_BASE_URL/metrics"
    fi
}

# Send metrics to endpoint
send_metrics() {
    local metrics=$1
    
    if [ -n "$METRICS_ENDPOINT" ]; then
        echo "$metrics" | curl -X POST -H "Content-Type: text/plain" --data-binary @- "$METRICS_ENDPOINT"
    fi
}

# Main execution
SYSTEM_METRICS=$(collect_system_metrics)
APP_METRICS=$(collect_app_metrics)

ALL_METRICS="$SYSTEM_METRICS"
if [ -n "$APP_METRICS" ]; then
    ALL_METRICS="$ALL_METRICS\n$APP_METRICS"
fi

send_metrics "$ALL_METRICS"

echo "✅ Metrics collection completed"
EOF

chmod +x monitoring/scripts/send-metrics.sh

print_success "Created monitoring scripts"

# Create README for monitoring
cat > monitoring/README.md << 'EOF'
# Monitoring Setup for AI API Playground

This directory contains monitoring and alerting configurations for the AI API Playground.

## Directory Structure

```
monitoring/
├── config.yml              # Main monitoring configuration
├── rules/
│   └── alert-rules.yml     # Alert rules and conditions
├── dashboards/
│   └── overview.json       # Grafana dashboard configuration
└── scripts/
    ├── check-services.sh   # Service health check script
    └── send-metrics.sh     # Metrics collection script
```

## Setup

1. **Configure Environment Variables:**
   ```bash
   export BACKEND_URL=https://your-backend.onrender.com
   export FRONTEND_URL=https://your-frontend.onrender.com
   export DATABASE_URL=postgresql://...
   export REDIS_URL=redis://...
   export SLACK_WEBHOOK_URL=https://hooks.slack.com/...
   ```

2. **Run Health Checks:**
   ```bash
   bash monitoring/scripts/check-services.sh
   ```

3. **Collect Metrics:**
   ```bash
   bash monitoring/scripts/send-metrics.sh
   ```

## Alert Rules

The system monitors:

- **System Metrics**: CPU, memory, disk usage
- **Application Metrics**: Response time, error rate, request count
- **Database Metrics**: Connection count, query performance
- **Redis Metrics**: Memory usage, connection status
- **AI Service Metrics**: Error rates, provider status

## Integration with Render.com

Render.com provides built-in monitoring for:

- **Logs**: Application logs in Render dashboard
- **Metrics**: CPU, memory, and network usage
- **Alerts**: Email notifications for deployment status
- **Health Checks**: Automatic service health monitoring

## External Monitoring (Optional)

For advanced monitoring, integrate with:

- **Datadog**: Application performance monitoring
- **New Relic**: Full-stack observability
- **Grafana**: Custom dashboards and visualizations
- **Prometheus**: Metrics collection and alerting

## Custom Metrics

The application exposes custom metrics at `/metrics` endpoint:

- `api_requests_total`: Total API requests
- `api_request_duration`: Request duration histogram
- `ai_requests_total`: AI service requests by provider
- `user_registrations_total`: User registration count
- `active_users`: Current active users

## Troubleshooting

### High CPU/Memory Alerts
1. Check application logs for errors
2. Review recent deployments
3. Monitor database query performance
4. Check for memory leaks

### Database Connection Issues
1. Verify DATABASE_URL is correct
2. Check database connection limits
3. Monitor connection pool settings
4. Review slow queries

### Redis Connection Issues
1. Verify REDIS_URL is correct
2. Check Redis memory usage
3. Monitor connection limits
4. Review cache hit rates

## Maintenance

### Regular Monitoring Tasks
- **Daily**: Review alerts and error rates
- **Weekly**: Check metric trends and capacity
- **Monthly**: Review and update alert thresholds

### Updating Alert Rules
1. Edit `rules/alert-rules.yml`
2. Test new rules in staging
3. Deploy to production
4. Monitor for false positives

For more information, see the main deployment guide: [DEPLOYMENT.md](../DEPLOYMENT.md)
EOF

print_success "Created monitoring README"

# Create backend monitoring configuration
print_info "Creating backend monitoring configuration..."

cat > backend/config/monitoring.js << 'EOF'
// Monitoring Configuration for AI API Playground Backend

module.exports = {
  // Monitoring enabled
  enabled: process.env.ENABLE_METRICS === 'true' || true,
  
  // Metrics endpoint configuration
  metrics: {
    enabled: true,
    endpoint: '/metrics',
    port: parseInt(process.env.METRICS_PORT) || 9090,
    collectDefaultMetrics: true,
    timeout: 5000
  },
  
  // Health check configuration
  healthCheck: {
    enabled: true,
    endpoint: '/health',
    interval: 30000, // 30 seconds
    timeout: 5000,
    failureThreshold: 3
  },
  
  // Performance monitoring
  performance: {
    enabled: true,
    tracing: {
      enabled: process.env.ENABLE_TRACING === 'true' || false,
      serviceName: 'ai-api-playground-backend',
      sampleRate: parseFloat(process.env.TRACING_SAMPLE_RATE) || 0.1,
      exporter: process.env.TRACING_EXPORTER || 'console'
    },
    profiling: {
      enabled: process.env.ENABLE_PROFILING === 'true' || false,
      interval: 60000 // 60 seconds
    }
  },
  
  // Alerting configuration
  alerting: {
    enabled: true,
    rules: [
      {
        name: 'high_cpu_usage',
        condition: (metrics) => metrics.cpu > 80,
        duration: 300000, // 5 minutes
        severity: 'warning',
        message: 'High CPU usage detected'
      },
      {
        name: 'high_memory_usage',
        condition: (metrics) => metrics.memory > 80,
        duration: 300000, // 5 minutes
        severity: 'warning',
        message: 'High memory usage detected'
      },
      {
        name: 'slow_response_time',
        condition: (metrics) => metrics.responseTime > 2000,
        duration: 300000, // 5 minutes
        severity: 'warning',
        message: 'Slow response time detected'
      },
      {
        name: 'high_error_rate',
        condition: (metrics) => metrics.errorRate > 5,
        duration: 300000, // 5 minutes
        severity: 'warning',
        message: 'High error rate detected'
      }
    ],
    
    // Notification channels
    channels: {
      slack: {
        enabled: !!process.env.SLACK_WEBHOOK_URL,
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL || '#monitoring',
        username: 'AI API Playground Monitor'
      },
      email: {
        enabled: !!process.env.SMTP_HOST,
        smtp: {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        },
        from: process.env.ALERT_FROM_EMAIL,
        to: process.env.ALERT_TO_EMAIL?.split(',') || []
      },
      webhook: {
        enabled: !!process.env.ALERT_WEBHOOK_URL,
        url: process.env.ALERT_WEBHOOK_URL,
        headers: {
          'Authorization': `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}`
        }
      }
    }
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    destinations: [
      {
        type: 'console',
        enabled: true,
        colorize: process.env.NODE_ENV !== 'production'
      },
      {
        type: 'file',
        enabled: true,
        path: process.env.LOG_FILE || './logs/monitoring.log',
        maxSize: '10m',
        maxFiles: 5
      },
      {
        type: 'external',
        enabled: !!process.env.LOGGING_SERVICE_URL,
        url: process.env.LOGGING_SERVICE_URL,
        apiKey: process.env.LOGGING_API_KEY,
        timeout: 5000
      }
    ]
  },
  
  // Custom metrics
  metrics: {
    collectSystemMetrics: true,
    collectHttpMetrics: true,
    collectDatabaseMetrics: true,
    collectRedisMetrics: true,
    collectCustomMetrics: true,
    
    // Custom metric definitions
    custom: {
      // API request counter
      apiRequests: {
        type: 'counter',
        name: 'api_requests_total',
        help: 'Total number of API requests',
        labelNames: ['method', 'endpoint', 'status']
      },
      
      // API request duration histogram
      apiRequestDuration: {
        type: 'histogram',
        name: 'api_request_duration_ms',
        help: 'API request duration in milliseconds',
        labelNames: ['method', 'endpoint'],
        buckets: [50, 100, 200, 500, 1000, 2000, 5000]
      },
      
      // AI service requests
      aiRequests: {
        type: 'counter',
        name: 'ai_requests_total',
        help: 'Total number of AI service requests',
        labelNames: ['provider', 'model', 'status']
      },
      
      // AI request duration
      aiRequestDuration: {
        type: 'histogram',
        name: 'ai_request_duration_ms',
        help: 'AI request duration in milliseconds',
        labelNames: ['provider', 'model'],
        buckets: [100, 500, 1000, 2000, 5000, 10000, 30000]
      },
      
      // User registrations
      userRegistrations: {
        type: 'counter',
        name: 'user_registrations_total',
        help: 'Total number of user registrations'
      },
      
      // Active users gauge
      activeUsers: {
        type: 'gauge',
        name: 'active_users',
        help: 'Number of active users'
      },
      
      // Rate limit hits
      rateLimitHits: {
        type: 'counter',
        name: 'rate_limit_hits_total',
        help: 'Total number of rate limit hits',
        labelNames: ['endpoint', 'user']
      }
    }
  }
};

module.exports = config;
EOF

print_success "Created backend monitoring configuration"

# Create log rotation configuration
print_info "Setting up log rotation..."

cat > monitoring/logrotate.conf << 'EOF'
# Log rotation configuration for AI API Playground

# Application logs
/home/dp/api-playground/backend/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 dp dp
    sharedscripts
    postrotate
        # Send signal to application to reopen log files
        kill -USR1 $(cat /tmp/ai-api-playground.pid) 2>/dev/null || true
    endscript
}

# Monitoring logs
/home/dp/api-playground/monitoring/logs/*.log {
    daily
    missingok
    rotate 3
    compress
    delaycompress
    notifempty
    create 644 dp dp
}
EOF

print_success "Created log rotation configuration"

# Create systemd service for monitoring (if applicable)
print_info "Creating monitoring service..."

cat > monitoring/ai-api-monitoring.service << 'EOF'
[Unit]
Description=AI API Playground Monitoring
After=network.target

[Service]
Type=simple
User=dp
WorkingDirectory=/home/dp/api-playground
ExecStart=/usr/bin/node monitoring/scripts/collect-metrics.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin

# Logging
StandardOutput=append:/home/dp/api-playground/monitoring/logs/monitoring.log
StandardError=append:/home/dp/api-playground/monitoring/logs/monitoring-error.log

[Install]
WantedBy=multi-user.target
EOF

print_success "Created monitoring service configuration"

# Final setup instructions
print_success "Monitoring setup completed!"
echo
print_info "Next steps:"
echo "1. Configure environment variables for monitoring"
echo "2. Set up Slack webhook for alerts: ${BLUE}https://api.slack.com/messaging/webhooks${NC}"
echo "3. Configure email alerts (optional)"
echo "4. Test monitoring with: bash monitoring/scripts/check-services.sh"
echo "5. Set up log rotation: sudo cp monitoring/logrotate.conf /etc/logrotate.d/ai-api-playground"
echo "6. Enable monitoring service: sudo systemctl enable ai-api-monitoring"
echo
print_info "For more information, see: monitoring/README.md"