# Environment Configuration Guide

## Overview
This guide provides comprehensive instructions for configuring environment variables and managing secrets for the AI API Playground in production.

## Environment Variables Structure

### Backend Environment Variables

#### Required Variables
```bash
# Server Configuration
NODE_ENV=production
PORT=10000

# Database Configuration
DATABASE_URL=postgresql://username:password@host:port/database
REDIS_URL=redis://username:password@host:port

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-minimum-32-characters
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-key-minimum-32-characters

# Minimax AI Configuration
MINIMAX_API_KEY=your-minimax-api-key
MINIMAX_GROUP_ID=your-minimax-group-id

# Security Configuration
CORS_ORIGIN=https://your-frontend-domain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

#### Optional Variables
```bash
# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json

# Monitoring Configuration
ENABLE_METRICS=true
METRICS_PORT=9090

# Webhook Configuration
WEBHOOK_SECRET=your-webhook-secret-key
WEBHOOK_TIMEOUT=5000

# Feature Flags
ENABLE_ANALYTICS=true
ENABLE_RATE_LIMITING=true
```

### Frontend Environment Variables

#### Required Variables
```bash
# API Configuration
REACT_APP_API_URL=https://your-backend-api.com
REACT_APP_ENVIRONMENT=production

# Authentication Configuration
REACT_APP_AUTH_TOKEN_KEY=auth_token
REACT_APP_REFRESH_TOKEN_KEY=refresh_token
```

## Secrets Management

### 1. Render.com Environment Variables

#### Adding Secrets via Render Dashboard
1. Navigate to your service dashboard
2. Click on "Environment" tab
3. Click "Add Environment Variable"
4. Enter the key and value
5. Click "Save Changes"

#### Adding Secrets via Render CLI
```bash
# Install Render CLI
npm install -g @render/cli

# Login to Render
render login

# Set environment variables
render env set NODE_ENV=production --service ai-api-playground-backend
render env set MINIMAX_API_KEY=your-key --service ai-api-playground-backend
```

### 2. Local Development Secrets

#### Using .env Files
```bash
# backend/.env
cp backend/.env.example backend/.env
# Edit backend/.env with your local values

# frontend/.env
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your local values
```

#### Using Environment-Specific Files
```bash
# backend/config/production.js
# frontend/src/config/production.js
```

### 3. CI/CD Secrets Management

#### GitHub Actions Secrets
```bash
# Add to GitHub repository settings
Settings > Secrets and variables > Actions > New repository secret

# Required secrets:
- RENDER_API_KEY
- MINIMAX_API_KEY
- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- JWT_REFRESH_SECRET
```

## Security Best Practices

### 1. Secret Generation
```bash
# Generate secure JWT secrets
openssl rand -base64 32

# Generate webhook secrets
openssl rand -hex 32

# Generate API keys
uuidgen | tr '[:upper:]' '[:lower:]'
```

### 2. Secret Rotation
- Rotate JWT secrets every 90 days
- Rotate API keys every 180 days
- Update webhook secrets after security incidents
- Monitor secret usage and access logs

### 3. Access Control
- Limit access to production secrets
- Use principle of least privilege
- Enable 2FA for all accounts
- Regular access reviews

## Environment-Specific Configurations

### Development Environment
```bash
NODE_ENV=development
LOG_LEVEL=debug
ENABLE_RATE_LIMITING=false
CORS_ORIGIN=http://localhost:3000
```

### Staging Environment
```bash
NODE_ENV=staging
LOG_LEVEL=info
ENABLE_RATE_LIMITING=true
CORS_ORIGIN=https://staging.yourdomain.com
```

### Production Environment
```bash
NODE_ENV=production
LOG_LEVEL=warn
ENABLE_RATE_LIMITING=true
CORS_ORIGIN=https://yourdomain.com
```

## Troubleshooting

### Common Issues

#### 1. Missing Environment Variables
```bash
# Check if variables are set
render env list --service ai-api-playground-backend

# Verify in application logs
render logs ai-api-playground-backend --tail 100
```

#### 2. Invalid API Keys
```bash
# Test Minimax API key
curl -X POST https://api.minimax.chat/v1/text/chatcompletion \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "abab5.5-chat", "messages": [{"role": "user", "content": "test"}]}'
```

#### 3. Database Connection Issues
```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# Check Redis connection
redis-cli -u $REDIS_URL ping
```

## Backup and Recovery

### Environment Variable Backup
```bash
# Export current environment variables
render env list --service ai-api-playground-backend --json > backend-env-backup.json
render env list --service ai-api-playground-frontend --json > frontend-env-backup.json
```

### Secret Recovery
1. Access Render dashboard
2. Navigate to service Environment tab
3. Review and restore from backup files
4. Redeploy services if necessary

## Monitoring and Alerting

### Environment Variable Monitoring
- Set up alerts for environment changes
- Monitor API key usage and quotas
- Track database connection metrics
- Monitor Redis performance

### Log Monitoring
```bash
# View application logs
render logs ai-api-playground-backend --tail 100

# View build logs
render logs ai-api-playground-backend --type build
```

## Additional Resources

- [Render Environment Variables Documentation](https://render.com/docs/environment-variables)
- [Node.js Best Practices for Configuration](https://github.com/goldbergyoni/nodebestpractices#-31-use-environment-aware-secure-and-hierarchical-config)
- [Minimax API Documentation](https://www.minimax.chat/document/guides)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)