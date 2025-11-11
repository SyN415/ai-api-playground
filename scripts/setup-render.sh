#!/bin/bash

# Render.com Setup Script for AI API Playground
# This script sets up the initial Render.com deployment

set -e

echo "🔧 Setting up Render.com deployment for AI API Playground..."

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

# Check prerequisites
print_info "Checking prerequisites..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm"
    exit 1
fi

# Check if git is installed
if ! command -v git &> /dev/null; then
    print_error "git is not installed. Please install git"
    exit 1
fi

# Check if render CLI is installed
if ! command -v render &> /dev/null; then
    print_warning "Render CLI is not installed. Install it with: npm install -g @render/cli"
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18 or higher is required. Current version: $(node --version)"
    exit 1
fi

print_success "Prerequisites check passed"

# Check project structure
print_info "Checking project structure..."
if [ ! -f "backend/package.json" ]; then
    print_error "Backend package.json not found"
    exit 1
fi

if [ ! -f "frontend/package.json" ]; then
    print_error "Frontend package.json not found"
    exit 1
fi

if [ ! -f "render.yaml" ]; then
    print_error "render.yaml not found"
    exit 1
fi

print_success "Project structure check passed"

# Install dependencies
print_info "Installing dependencies..."
npm run install:all

# Create environment files if they don't exist
print_info "Setting up environment files..."

# Backend environment
if [ ! -f "backend/.env" ]; then
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env
        print_success "Created backend/.env from example"
    else
        print_warning "No backend/.env.example found"
    fi
fi

# Frontend environment
if [ ! -f "frontend/.env" ]; then
    if [ -f "frontend/.env.example" ]; then
        cp frontend/.env.example frontend/.env
        print_success "Created frontend/.env from example"
    else
        print_warning "No frontend/.env.example found"
    fi
fi

# Create production environment file
print_info "Creating production environment configuration..."
cat > .env.production.example << EOF
# Production Environment Configuration
# Copy this file to .env.production and fill in your actual values

# Backend Configuration
NODE_ENV=production
PORT=10000
DATABASE_URL=your_database_url_here
REDIS_URL=your_redis_url_here

# Security
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here
API_KEY_ENCRYPTION_KEY=your_encryption_key_here
SESSION_SECRET=your_session_secret_here
WEBHOOK_SECRET=your_webhook_secret_here

# AI Service API Keys
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
MINIMAX_API_KEY=your_minimax_api_key_here
MINIMAX_GROUP_ID=your_minimax_group_id_here

# Application Configuration
CORS_ORIGIN=https://your-frontend-url.onrender.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true
ENABLE_ANALYTICS=true

# Feature Flags
ENABLE_WEBHOOKS=true
ENABLE_USAGE_TRACKING=true
ENABLE_MINIMAX_INTEGRATION=true

# Frontend Configuration
REACT_APP_API_BASE_URL=https://your-backend-url.onrender.com
REACT_APP_ENVIRONMENT=production
REACT_APP_ENABLE_ANALYTICS=true
REACT_APP_VERSION=1.0.0
EOF

print_success "Created .env.production.example"

# Make scripts executable
print_info "Setting up scripts..."
chmod +x scripts/*.sh

# Create necessary directories
print_info "Creating necessary directories..."
mkdir -p backend/logs
mkdir -p backend/uploads
mkdir -p backend/temp
mkdir -p frontend/build

print_success "Directories created"

# Run initial tests
print_info "Running initial tests..."
npm test

# Build frontend
print_info "Building frontend..."
npm run build:frontend

# Build backend
print_info "Building backend..."
npm run build:backend

# Create deploy script
print_info "Creating deploy script..."
cat > deploy.sh << 'EOF'
#!/bin/bash
# Quick deployment script

echo "🚀 Deploying to Render.com..."

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not a git repository. Please initialize git first."
    exit 1
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  You have uncommitted changes. Commit them before deploying."
    read -p "Do you want to continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Push to main branch
git push origin main

echo "✅ Push complete! Render.com will automatically deploy."
echo "📊 Monitor deployment at: https://dashboard.render.com"
EOF

chmod +x deploy.sh

print_success "Created deploy.sh"

# Create README for deployment
print_info "Creating deployment README..."
cat > DEPLOYMENT_QUICKSTART.md << 'EOF'
# Quick Deployment Guide

## Prerequisites
- Node.js 18+
- npm
- Git
- Render.com account

## Setup Steps

1. **Install dependencies**
   ```bash
   npm run install:all
   ```

2. **Configure environment variables**
   - Copy `.env.production.example` to `.env.production`
   - Fill in all required values
   - Set up secrets in Render.com dashboard

3. **Test locally**
   ```bash
   npm test
   npm run build:all
   ```

4. **Initialize git repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

5. **Push to GitHub**
   - Create GitHub repository
   - Add remote: `git remote add origin <your-repo-url>`
   - Push: `git push -u origin main`

6. **Deploy to Render**
   - Connect GitHub repository to Render.com
   - Render will automatically detect `render.yaml`
   - Deployment will start automatically

## Monitoring

- **Render Dashboard**: https://dashboard.render.com
- **Backend Logs**: Available in Render dashboard
- **Frontend Logs**: Available in Render dashboard

## Troubleshooting

- Check logs in Render dashboard
- Verify environment variables are set correctly
- Ensure all API keys are valid
- Check database connections
EOF

print_success "Created DEPLOYMENT_QUICKSTART.md"

# Final instructions
print_success "Setup completed successfully!"
echo
print_info "Next steps:"
echo "1. Copy .env.production.example to .env.production"
echo "2. Fill in all required environment variables"
echo "3. Set up secrets in Render.com dashboard"
echo "4. Commit your changes and push to GitHub"
echo "5. Connect repository to Render.com"
echo
print_info "For detailed deployment instructions, see DEPLOYMENT.md"
print_info "For quick deployment, see DEPLOYMENT_QUICKSTART.md"