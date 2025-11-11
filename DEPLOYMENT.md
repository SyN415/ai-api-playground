# AI API Playground - Deployment Guide

This comprehensive guide covers deploying the AI API Playground to Render.com with production-ready configurations, monitoring, and maintenance procedures.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Setup](#environment-setup)
- [Render.com Configuration](#rendercom-configuration)
- [Deployment Process](#deployment-process)
- [Monitoring and Alerting](#monitoring-and-alerting)
- [Scaling and Performance](#scaling-and-performance)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

## 🎯 Prerequisites

### Required Accounts
- [Render.com](https://render.com) account
- [GitHub](https://github.com) account
- [Supabase](https://supabase.com) account (for PostgreSQL)
- AI Service API Keys:
  - [OpenAI API Key](https://platform.openai.com/api-keys)
  - [Anthropic API Key](https://console.anthropic.com/)
  - [Minimax API Key](https://www.minimax.io/)

### Required Tools
- Node.js 18+ and npm 9+
- Git
- Render CLI (optional): `npm install -g @render/cli`

### System Requirements
- Git repository with project code
- Environment variables configured
- Domain name (optional, for custom domains)

## 🚀 Quick Start

### 1. Initial Setup
```bash
# Clone the repository
git clone <your-repo-url>
cd ai-api-playground

# Run setup script
bash scripts/setup-render.sh
```

### 2. Configure Environment Variables
```bash
# Copy production environment template
cp .env.production.example .env.production

# Edit .env.production with your actual values
# See Environment Setup section for details
```

### 3. Deploy to Render
```bash
# Push to GitHub
git add .
git commit -m "Initial deployment setup"
git push -u origin main

# Render will automatically detect render.yaml and deploy
```

### 4. Verify Deployment
```bash
# Run health check
node scripts/health-check.js

# Check deployment status
curl https://your-app.onrender.com/health
```

## 🔧 Environment Setup

### Backend Environment Variables

Create `backend/.env` from the example:

```bash
cp backend/.env.example backend/.env
```

**Critical Variables:**
- `DATABASE_URL`: Supabase PostgreSQL connection string
- `REDIS_URL`: Render Redis connection string
- `JWT_SECRET`: Generate with `openssl rand -base64 32`
- `JWT_REFRESH_SECRET`: Generate with `openssl rand -base64 32`
- `API_KEY_ENCRYPTION_KEY`: Generate with `openssl rand -base64 32`
- `SESSION_SECRET`: Generate with `openssl rand -base64 32`
- `WEBHOOK_SECRET`: Generate with `openssl rand -base64 32`

**AI Service API Keys:**
- `OPENAI_API_KEY`: Your OpenAI API key
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `MINIMAX_API_KEY`: Your Minimax API key
- `MINIMAX_GROUP_ID`: Your Minimax group ID

### Frontend Environment Variables

Create `frontend/.env` from the example:

```bash
cp frontend/.env.example frontend/.env
```

**Critical Variables:**
- `REACT_APP_API_BASE_URL`: Your backend URL
- `REACT_APP_ENVIRONMENT`: `production` or `staging`

### Production Environment File

The `.env.production.example` file contains all production variables. Copy and configure:

```bash
cp .env.production.example .env.production
```

**Security Note:** Never commit `.env.production` to version control. Add it to `.gitignore`.

## 🏗️ Render.com Configuration

### Infrastructure Overview

The [`render.yaml`](render.yaml:1) file defines:

- **Backend Web Service**: Node.js API server
- **Frontend Static Site**: React application
- **PostgreSQL Database**: Supabase (or Render PostgreSQL)
- **Redis Instance**: Caching and rate limiting
- **Environment Groups**: Shared configuration

### Service Configuration

#### Backend Service (`ai-api-playground-backend`)
- **Plan**: Starter Plus (scalable)
- **Region**: Oregon (us-west)
- **Auto-scaling**: 1-3 instances based on CPU/memory
- **Health Check**: `/health` endpoint
- **Build Command**: `cd backend && npm ci && npm run build`
- **Start Command**: `cd backend && npm run start:production`

#### Frontend Service (`ai-api-playground-frontend`)
- **Plan**: Starter
- **Region**: Oregon (us-west)
- **Build Command**: `cd frontend && npm ci && npm run build`
- **Static Publish Path**: `./frontend/build`

#### Database
- **Type**: PostgreSQL 14
- **Plan**: Starter
- **High Availability**: Enabled in production

#### Redis
- **Plan**: Starter
- **Max Memory Policy**: All keys LRU
- **Use Cases**: Rate limiting, session storage, caching

### Environment Variables in Render

Set these in the Render dashboard for each service:

#### Backend Environment Variables
```bash
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# Security (generate these!)
JWT_SECRET=generated-secret
JWT_REFRESH_SECRET=generated-secret
API_KEY_ENCRYPTION_KEY=generated-secret
SESSION_SECRET=generated-secret
WEBHOOK_SECRET=generated-secret

# AI Services
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
MINIMAX_API_KEY=...
MINIMAX_GROUP_ID=...

# Application
NODE_ENV=production
PORT=10000
CORS_ORIGIN=https://your-frontend.onrender.com
```

#### Frontend Environment Variables
```bash
REACT_APP_API_BASE_URL=https://your-backend.onrender.com
REACT_APP_ENVIRONMENT=production
REACT_APP_ENABLE_ANALYTICS=true
```

## 🔄 Deployment Process

### Automated Deployment (GitHub Actions)

The [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml:1) file defines:

1. **Testing**: Automated tests on push/PR
2. **Security Scan**: npm audit and vulnerability scanning
3. **Staging Deployment**: Auto-deploy to staging on `develop` branch
4. **Production Deployment**: Auto-deploy to production on `main` branch
5. **Notifications**: Slack notifications for deployment status

### Manual Deployment

#### Backend Deployment
```bash
# Run deployment script
bash scripts/deploy-backend.sh

# Or manual steps:
cd backend
npm ci --production
npm run build
npm run start:production
```

#### Frontend Deployment
```bash
# Run deployment script
bash scripts/deploy-frontend.sh

# Or manual steps:
cd frontend
npm ci
npm run build
# Upload build/ to static hosting
```

### Deployment Scripts

- [`scripts/deploy-backend.sh`](scripts/deploy-backend.sh:1): Backend deployment with health checks
- [`scripts/deploy-frontend.sh`](scripts/deploy-frontend.sh:1): Frontend build and optimization
- [`scripts/setup-render.sh`](scripts/setup-render.sh:1): Initial setup and configuration
- [`scripts/health-check.js`](scripts/health-check.js:1): Comprehensive health monitoring

## 📊 Monitoring and Alerting

### Health Checks

The [`scripts/health-check.js`](scripts/health-check.js:1) script checks:

- Application endpoints
- Database connectivity
- Redis connectivity
- Environment variables
- Disk space
- Memory usage

**Run health check:**
```bash
node scripts/health-check.js
```

### Monitoring Setup

Run the monitoring setup script:
```bash
bash scripts/setup-monitoring.sh
```

### Metrics and Alerts

**Key Metrics:**
- CPU Usage (>80% for 5 minutes)
- Memory Usage (>80% for 5 minutes)
- Response Time (>2 seconds for 5 minutes)
- Error Rate (>5% for 5 minutes)

**Alert Channels:**
- Slack notifications
- Email alerts
- Render dashboard alerts

### Logging

**Backend Logs:**
- Application logs: `backend/logs/app.log`
- Error logs: `backend/logs/error.log`
- Request logs: `backend/logs/requests.log`
- Access via Render dashboard

**Frontend Logs:**
- Browser console logs
- Error tracking via Sentry (if configured)

## 📈 Scaling and Performance

### Auto-scaling Configuration

The backend service automatically scales based on:

- **CPU Threshold**: 70%
- **Memory Threshold**: 80%
- **Min Instances**: 1
- **Max Instances**: 3 (configurable)

### Performance Optimization

#### Backend Optimizations
- Connection pooling for database
- Redis caching for frequent queries
- Rate limiting to prevent abuse
- Compression enabled
- ETag caching

#### Frontend Optimizations
- Code splitting enabled
- Lazy loading for components
- Image optimization
- Gzip compression
- CDN for static assets

### Database Optimization

- Indexing on frequently queried columns
- Connection pooling
- Query optimization
- Regular vacuuming and analysis

## 🔒 Security Considerations

### Environment Variables

- **Never** commit secrets to version control
- Use strong, generated secrets (32+ characters)
- Rotate secrets regularly
- Use different secrets for different environments

### API Security

- Rate limiting enabled
- JWT authentication
- API key encryption
- CORS configured
- Helmet.js for security headers

### Database Security

- SSL/TLS encryption
- Strong passwords
- Regular backups
- Access logging

### Network Security

- HTTPS only in production
- Secure cookies
- CSRF protection
- Input validation and sanitization

## 🔧 Troubleshooting

### Common Issues

#### Deployment Fails
```bash
# Check logs
render logs ai-api-playground-backend

# Run health check
node scripts/health-check.js

# Check environment variables
render env ai-api-playground-backend
```

#### Database Connection Issues
```bash
# Test database connection
psql $DATABASE_URL

# Check database logs
render logs ai-api-playground-db
```

#### Redis Connection Issues
```bash
# Test Redis connection
redis-cli -u $REDIS_URL ping

# Check Redis logs
render logs ai-api-playground-redis
```

#### High Memory Usage
```bash
# Check memory usage
render metrics ai-api-playground-backend

# Review logs for memory leaks
render logs ai-api-playground-backend --tail 100
```

### Debug Mode

Enable debug logging:
```bash
# Set environment variable
render env set ai-api-playground-backend LOG_LEVEL debug

# Restart service
render restart ai-api-playground-backend
```

## 🛠️ Maintenance

### Regular Maintenance Tasks

#### Daily
- Monitor error rates and response times
- Check disk space usage
- Review security logs

#### Weekly
- Update dependencies
- Review performance metrics
- Check backup integrity
- Monitor API usage and quotas

#### Monthly
- Security audit
- Performance optimization review
- Database maintenance (vacuum, analyze)
- Secret rotation

### Backup and Recovery

#### Database Backups
- Automated daily backups
- 7-day retention period
- Manual backups before major changes

**Create manual backup:**
```bash
# Export database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Upload to secure storage
# Use Render backup service or external S3
```

#### Recovery Process
```bash
# Restore from backup
psql $DATABASE_URL < backup_file.sql

# Verify data integrity
# Run application tests
```

### Updates and Patches

#### Dependency Updates
```bash
# Check for outdated packages
npm outdated

# Update packages
npm update

# Test thoroughly
npm test
```

#### Security Patches
```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# For critical updates, test in staging first
```

## 📞 Support and Resources

### Render.com Support
- [Render Documentation](https://render.com/docs)
- [Render Community](https://community.render.com)
- [Render Status](https://status.render.com)

### Project Resources
- [Project Documentation](README.md)
- [API Documentation](backend/API.md)
- [Frontend Guide](frontend/README.md)

### Monitoring Tools
- [Render Dashboard](https://dashboard.render.com)
- [Application Logs](https://dashboard.render.com/web/srv-...)
- [Metrics and Analytics](https://dashboard.render.com/metrics)

## 📝 Deployment Checklist

### Pre-Deployment
- [ ] Environment variables configured
- [ ] Secrets generated and set
- [ ] Database migrated and seeded
- [ ] Tests passing locally
- [ ] Build successful locally
- [ ] Health checks passing
- [ ] Security scan clean
- [ ] Backup strategy in place

### Deployment
- [ ] Push to GitHub
- [ ] Monitor Render deployment
- [ ] Run health checks
- [ ] Verify all services running
- [ ] Test critical functionality
- [ ] Check error rates
- [ ] Verify monitoring alerts

### Post-Deployment
- [ ] Update documentation
- [ ] Notify team members
- [ ] Monitor for 24 hours
- [ ] Review performance metrics
- [ ] Check error logs
- [ ] Validate backups working

---

**Need Help?**
- Create an issue in the project repository
- Contact the development team
- Check Render.com documentation

**Last Updated**: 2025-11-11
**Version**: 1.0.0