# Maintenance Guide

## Overview
This guide provides comprehensive procedures for maintaining the AI API Playground in production, including regular tasks, updates, monitoring, and troubleshooting.

## Regular Maintenance Schedule

### Daily Tasks (Automated + Manual Checks)

#### Automated Monitoring
- [ ] Service health checks (every 5 minutes)
- [ ] Error rate monitoring (alert if > 5%)
- [ ] Response time monitoring (alert if > 2 seconds)
- [ ] Database connection monitoring
- [ ] Redis connection monitoring

#### Manual Daily Checks
```bash
# Check service health
curl https://ai-api-playground-backend.onrender.com/health

# Check recent errors
render logs ai-api-playground-backend --level error --tail 50

# Check error rates
render metrics ai-api-playground-backend --type http_request_count
```

### Weekly Tasks

#### Dependency Updates
```bash
# Check for outdated packages
npm outdated

# Update backend dependencies
cd backend
npm update
npm test

# Update frontend dependencies
cd frontend
npm update
npm test
```

#### Security Audits
```bash
# Run security audit
npm audit

# Check for vulnerabilities
npm audit --audit-level=moderate

# Fix auto-fixable issues
npm audit fix
```

#### Performance Review
```bash
# Check database performance
render logs ai-api-playground-db --tail 100

# Review slow queries
# Access database and run: SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;

# Check Redis performance
render logs ai-api-playground-redis --tail 100
```

### Monthly Tasks

#### Database Maintenance
```bash
# Connect to database
psql $DATABASE_URL

# Run maintenance commands
VACUUM ANALYZE;
REINDEX DATABASE ai_api_playground_db;

# Check database size
\l+ ai_api_playground_db

# Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### Secret Rotation
```bash
# Generate new JWT secrets
NEW_JWT_SECRET=$(openssl rand -base64 32)
NEW_REFRESH_SECRET=$(openssl rand -base64 32)

# Update in Render dashboard
render env set ai-api-playground-backend JWT_SECRET="$NEW_JWT_SECRET"
render env set ai-api-playground-backend JWT_REFRESH_SECRET="$NEW_REFRESH_SECRET"

# Restart service
render restart ai-api-playground-backend
```

#### Backup Verification
```bash
# Test backup restoration process
# Create test database
createdb ai_api_playground_test

# Restore from latest backup
pg_restore -d ai_api_playground_test latest_backup.dump

# Verify data integrity
# Run application tests against test database

# Clean up
dropdb ai_api_playground_test
```

## Environment Variable Management

### Adding New Environment Variables

#### Via Render Dashboard
1. Navigate to service dashboard
2. Click "Environment" tab
3. Click "Add Environment Variable"
4. Enter key and value
5. Click "Save Changes"
6. Restart service if required

#### Via Render CLI
```bash
# Set environment variable
render env set ai-api-playground-backend NEW_VARIABLE="value"

# Set multiple variables
render env set ai-api-playground-backend \
  VARIABLE1="value1" \
  VARIABLE2="value2"

# Restart service
render restart ai-api-playground-backend
```

### Updating Environment Variables
```bash
# Update existing variable
render env set ai-api-playground-backend EXISTING_VARIABLE="new_value"

# Verify update
render env list ai-api-playground-backend
```

### Removing Environment Variables
```bash
# Remove variable
render env unset ai-api-playground-backend VARIABLE_NAME

# Verify removal
render env list ai-api-playground-backend
```

## Scaling Management

### Auto-scaling Configuration

#### Current Settings
- **Min Instances**: 1
- **Max Instances**: 3
- **CPU Threshold**: 70%
- **Memory Threshold**: 80%

#### Adjusting Auto-scaling
```bash
# Update scaling settings via Render dashboard
# Settings > Scaling > Auto-scaling

# Or via API (requires Render API key)
curl -X PATCH https://api.render.com/v1/services/srv-d49qt7ili9vc73f65lrg \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceDetails": {
      "numInstances": 2,
      "autoScaling": {
        "enabled": true,
        "minInstances": 1,
        "maxInstances": 5,
        "targetCPUPercent": 70,
        "targetMemoryPercent": 80
      }
    }
  }'
```

### Manual Scaling
```bash
# Scale to specific number of instances
render services scale ai-api-playground-backend --num-instances 2

# Scale back to single instance
render services scale ai-api-playground-backend --num-instances 1
```

## Backup and Recovery Procedures

### Database Backups

#### Automated Backups
- **Frequency**: Daily at 2 AM UTC
- **Retention**: 7 days
- **Storage**: Render's secure storage
- **Encryption**: AES-256 encryption at rest

#### Manual Backups
```bash
# Create manual backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Compress backup
gzip backup_*.sql

# Upload to secure storage
# Use S3, Google Cloud Storage, or similar
```

#### Backup Verification
```bash
# Test backup integrity
gunzip -t backup_*.sql.gz

# Restore to test database
createdb test_restore
gunzip -c backup_*.sql.gz | psql test_restore

# Verify data
psql test_restore -c "SELECT COUNT(*) FROM users;"
psql test_restore -c "SELECT COUNT(*) FROM requests;"

# Clean up
dropdb test_restore
```

### Application Backups

#### Configuration Backup
```bash
# Backup environment variables
render env list ai-api-playground-backend --json > backend-env-backup.json
render env list ai-api-playground-frontend --json > frontend-env-backup.json

# Backup infrastructure configuration
cp render.yaml render.yaml.backup.$(date +%Y%m%d)

# Store backups securely
# Encrypt sensitive files before storage
```

#### Code Backup
```bash
# Create code backup
git bundle create ai-api-playground-backup.bundle --all

# Verify bundle
git bundle verify ai-api-playground-backup.bundle

# Store in secure location
```

## Update and Patch Management

### Security Patches

#### Critical Security Updates
1. **Assessment**: Evaluate CVE severity and impact
2. **Testing**: Test patches in staging environment
3. **Deployment**: Deploy to production during maintenance window
4. **Verification**: Verify application functionality
5. **Monitoring**: Monitor for issues post-deployment

#### Regular Security Updates
```bash
# Check for security updates weekly
npm audit

# Update critical packages
npm update --save

# Test thoroughly
npm test
```

### Dependency Updates

#### Update Strategy
- **Patch Updates**: Apply immediately (bug fixes)
- **Minor Updates**: Apply after testing (new features, backward compatible)
- **Major Updates**: Plan carefully (breaking changes)

#### Update Process
```bash
# 1. Create update branch
git checkout -b dependency-updates-$(date +%Y%m%d)

# 2. Update backend dependencies
cd backend
npm update
npm test

# 3. Update frontend dependencies
cd frontend
npm update
npm test

# 4. Test full application
cd ..
npm run test:integration

# 5. Create pull request
git add .
git commit -m "chore: update dependencies $(date +%Y%m%d)"
git push origin dependency-updates-$(date +%Y%m%d)
```

## Monitoring and Alerting

### Key Metrics to Monitor

#### Application Metrics
- **Response Time**: p50, p95, p99 latencies
- **Error Rate**: 5xx errors, 4xx errors
- **Throughput**: Requests per minute
- **CPU Usage**: Per instance and aggregate
- **Memory Usage**: Per instance and aggregate

#### Database Metrics
- **Connection Count**: Active connections
- **Query Performance**: Slow query count
- **Disk Usage**: Database size growth
- **Cache Hit Rate**: Redis performance

#### Business Metrics
- **Active Users**: Daily/Monthly active users
- **API Usage**: Requests per user, per endpoint
- **Quota Usage**: Daily quota consumption
- **Error Distribution**: Errors by type and endpoint

### Alert Configuration

#### Critical Alerts
```bash
# High error rate
# Alert if error rate > 5% for 5 minutes

# High response time
# Alert if p95 response time > 2 seconds for 5 minutes

# Service down
# Alert if health check fails for 2 consecutive checks

# High CPU usage
# Alert if CPU > 80% for 10 minutes

# High memory usage
# Alert if memory > 80% for 10 minutes
```

#### Warning Alerts
```bash
# Moderate error rate
# Alert if error rate > 2% for 10 minutes

# Moderate response time
# Alert if p95 response time > 1 second for 10 minutes

# Database connection issues
# Alert if connection pool > 80% utilization

# Redis issues
# Alert if Redis memory > 70% utilization
```

## Troubleshooting Common Issues

### High CPU Usage

#### Diagnosis
```bash
# Check CPU usage
render metrics ai-api-playground-backend --type cpu_usage

# Check process list
render exec ai-api-playground-backend -- ps aux

# Check recent requests
render logs ai-api-playground-backend --tail 100
```

#### Solutions
1. **Scale Up**: Increase instance count or size
2. **Optimize Code**: Identify and fix performance bottlenecks
3. **Cache More**: Increase Redis caching
4. **Database Optimization**: Add indexes, optimize queries

### High Memory Usage

#### Diagnosis
```bash
# Check memory usage
render metrics ai-api-playground-backend --type memory_usage

# Check memory details
render exec ai-api-playground-backend -- free -m

# Check for memory leaks
render logs ai-api-playground-backend --tail 200 | grep "memory"
```

#### Solutions
1. **Restart Service**: Temporary fix for memory leaks
2. **Scale Up**: Increase instance memory
3. **Fix Memory Leaks**: Identify and fix in code
4. **Optimize Caching**: Reduce cache size or TTL

### Database Connection Issues

#### Diagnosis
```bash
# Check database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Check connection pool
render logs ai-api-playground-backend --tail 50 | grep "database"

# Check database logs
render logs ai-api-playground-db --tail 50
```

#### Solutions
1. **Increase Connection Pool**: Update pool size in configuration
2. **Optimize Queries**: Reduce query execution time
3. **Add Indexes**: Improve query performance
4. **Scale Database**: Upgrade database plan

### Redis Connection Issues

#### Diagnosis
```bash
# Test Redis connection
redis-cli -u $REDIS_URL ping

# Check Redis logs
render logs ai-api-playground-redis --tail 50

# Check Redis memory
redis-cli -u $REDIS_URL info memory
```

#### Solutions
1. **Restart Redis**: Temporary fix for connection issues
2. **Increase Memory**: Upgrade Redis plan
3. **Optimize Usage**: Reduce key count or TTL
4. **Check Network**: Verify network connectivity

## Performance Optimization

### Database Optimization

#### Index Management
```bash
# Check current indexes
psql $DATABASE_URL -c "\di"

# Analyze query performance
psql $DATABASE_URL -c "SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Add missing indexes based on query analysis
```

#### Query Optimization
```bash
# Enable query logging
# Set log_min_duration_statement = 1000 in PostgreSQL config

# Analyze slow queries
# Use EXPLAIN ANALYZE on slow queries

# Optimize based on analysis
```

### Application Optimization

#### Code Optimization
```bash
# Profile application
# Use Node.js profiler or APM tools

# Identify bottlenecks
# Focus on hot paths and frequently called functions

# Optimize critical sections
# Use caching, batching, and async operations
```

#### Caching Strategy
```bash
# Implement Redis caching
# Cache frequently accessed data

# Set appropriate TTLs
# Balance between freshness and performance

# Monitor cache hit rates
# Adjust strategy based on metrics
```

## Security Maintenance

### Regular Security Tasks

#### Weekly Security Checks
```bash
# Check for suspicious activity
render logs ai-api-playground-backend --level error --tail 100

# Review access logs
# Look for unusual patterns or high request rates

# Check for failed authentication attempts
grep "authentication failed" backend/logs/error.log
```

#### Monthly Security Audits
```bash
# Update dependencies
npm audit fix

# Review user access
# Check for inactive accounts and excessive permissions

# Rotate secrets
# Update JWT secrets, API keys, and passwords

# Review security groups
# Ensure firewall rules are up to date
```

### Incident Response

#### Security Incident Procedure
1. **Detection**: Monitor alerts and logs for suspicious activity
2. **Assessment**: Evaluate severity and impact
3. **Containment**: Isolate affected systems if necessary
4. **Investigation**: Analyze logs and determine root cause
5. **Recovery**: Restore services and apply fixes
6. **Lessons Learned**: Document and improve procedures

## Documentation Maintenance

### Keeping Documentation Updated

#### Regular Updates
- [ ] Update API documentation after endpoint changes
- [ ] Update environment variables after additions
- [ ] Update troubleshooting guides with new issues
- [ ] Update performance metrics and benchmarks
- [ ] Review and update security procedures

#### Version Control
```bash
# Tag releases
git tag -a v1.0.1 -m "Release version 1.0.1"

# Update changelog
# Document changes, bug fixes, and new features

# Update documentation version
# Keep version numbers consistent
```

---

**Last Updated**: 2025-11-11 22:27 UTC
**Version**: 1.0.0
**Next Review**: 2025-12-11
**Maintenance Schedule**: Daily automated, weekly manual, monthly comprehensive