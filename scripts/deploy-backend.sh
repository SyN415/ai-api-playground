#!/bin/bash

# Backend Deployment Script for AI API Playground
# This script handles backend deployment to Render.com

set -e

echo "🚀 Starting backend deployment..."

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
if [ ! -f "backend/package.json" ]; then
    print_error "package.json not found. Are you in the project root?"
    exit 1
fi

# Navigate to backend directory
cd backend

# Install dependencies
print_success "Installing dependencies..."
npm ci --production

# Run database migrations if any
if [ -f "scripts/migrate.js" ]; then
    print_success "Running database migrations..."
    node scripts/migrate.js
fi

# Run tests if in production environment
if [ "$NODE_ENV" = "production" ]; then
    print_success "Running tests..."
    npm test
fi

# Build the application
print_success "Building application..."
npm run build

# Create necessary directories
print_success "Creating necessary directories..."
mkdir -p logs
mkdir -p uploads
mkdir -p temp

# Set proper permissions
print_success "Setting permissions..."
chmod 755 logs
chmod 755 uploads
chmod 755 temp

# Create log files if they don't exist
touch logs/combined.log
touch logs/error.log
touch logs/exceptions.log
touch logs/rejections.log

# Set log file permissions
chmod 644 logs/*.log

# Run health check
print_success "Running health check..."
node scripts/health-check.js

# Start the application
print_success "Starting application..."
npm run start:production &

# Wait for the application to start
sleep 5

# Check if the application is running
if curl -f http://localhost:${PORT:-10000}/health > /dev/null 2>&1; then
    print_success "Application started successfully!"
else
    print_error "Application failed to start"
    exit 1
fi

print_success "Backend deployment completed successfully!"