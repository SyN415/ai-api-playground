#!/bin/bash

# Frontend Deployment Script for AI API Playground
# This script handles frontend deployment to Render.com

set -e

echo "🚀 Starting frontend deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if we're in the right directory
if [ ! -f "frontend/package.json" ]; then
    print_error "package.json not found. Are you in the project root?"
    exit 1
fi

# Navigate to frontend directory
cd frontend

# Install dependencies
print_success "Installing dependencies..."
npm ci

# Create environment file from example if it doesn't exist
if [ ! -f ".env.production" ]; then
    if [ -f ".env.example" ]; then
        print_success "Creating production environment file..."
        cp .env.example .env.production
    else
        print_warning "No .env.example file found, creating minimal .env.production"
        cat > .env.production << EOF
REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL:-http://localhost:10000}
REACT_APP_ENVIRONMENT=production
REACT_APP_ENABLE_ANALYTICS=true
EOF
    fi
fi

# Load environment variables
if [ -f ".env.production" ]; then
    export $(cat .env.production | xargs)
fi

# Set API URL if not already set
if [ -z "$REACT_APP_API_BASE_URL" ]; then
    export REACT_APP_API_BASE_URL=${API_BASE_URL:-http://localhost:10000}
fi

# Build the application
print_success "Building application..."
npm run build

# Check if build was successful
if [ ! -d "build" ]; then
    print_error "Build failed - build directory not found"
    exit 1
fi

# Optimize build for production
print_success "Optimizing build..."
# Remove source maps if they exist (can be large)
find build -name "*.map" -delete

# Compress static assets
if command -v gzip &> /dev/null; then
    print_success "Compressing static assets..."
    find build -type f \( -name "*.js" -o -name "*.css" -o -name "*.html" \) -exec gzip -k -9 {} \;
fi

# Generate build info
print_success "Generating build information..."
cat > build/build-info.json << EOF
{
  "buildTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "${REACT_APP_VERSION:-1.0.0}",
  "environment": "${REACT_APP_ENVIRONMENT:-production}",
  "nodeVersion": "$(node --version)",
  "npmVersion": "$(npm --version)"
}
EOF

# Validate build
print_success "Validating build..."
if [ ! -f "build/index.html" ]; then
    print_error "Build validation failed - index.html not found"
    exit 1
fi

if [ ! -f "build/static/js/main.*.js" ]; then
    print_error "Build validation failed - main JavaScript bundle not found"
    exit 1
fi

# Calculate build size
print_success "Build size analysis..."
BUILD_SIZE=$(du -sh build | cut -f1)
print_success "Total build size: $BUILD_SIZE"

# Show largest files if available
if command -v find &> /dev/null && command -v sort &> /dev/null; then
    print_success "Largest files in build:"
    find build -type f -exec ls -lh {} \; | sort -k5 -hr | head -5
fi

print_success "Frontend deployment completed successfully!"
print_success "Build ready for deployment to static hosting"