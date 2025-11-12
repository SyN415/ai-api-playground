# Production Testing Guide

## Overview
This guide provides step-by-step instructions for testing the AI API Playground in production environment using curl commands and other testing methods.

## Prerequisites
- Production URLs for backend and frontend services
- Valid authentication credentials
- Minimax API key configured
- curl installed on your system

## Service Health Checks

### 1. Backend Health Check

#### Test Basic Health Endpoint
```bash
curl -X GET https://ai-api-playground-backend.onrender.com/health \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-11T22:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

#### Test Database Connection
```bash
curl -X GET https://ai-api-playground-backend.onrender.com/health/db \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "status": "connected",
  "timestamp": "2025-11-11T22:00:00.000Z"
}
```

#### Test Redis Connection
```bash
curl -X GET https://ai-api-playground-backend.onrender.com/health/redis \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "status": "connected",
  "timestamp": "2025-11-11T22:00:00.000Z"
}
```

### 2. Frontend Health Check

#### Test Frontend Accessibility
```bash
curl -X GET https://ai-api-playground-frontend.onrender.com \
  -H "Content-Type: text/html"
```

**Expected Response:** HTML content with status 200

## Authentication Testing

### 1. User Registration

#### Register New User
```bash
curl -X POST https://ai-api-playground-backend.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "name": "Test User"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "test@example.com",
      "name": "Test User",
      "role": "user"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

### 2. User Login

#### Login with Credentials
```bash
curl -X POST https://ai-api-playground-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "test@example.com",
      "name": "Test User",
      "role": "user"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

### 3. Token Refresh

#### Refresh Access Token
```bash
curl -X POST https://ai-api-playground-backend.onrender.com/api/auth/refresh \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_REFRESH_TOKEN" \
  -d '{}'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

## AI API Testing

### 1. Minimax Text Generation

#### Test Basic Text Generation
```bash
curl -X POST https://ai-api-playground-backend.onrender.com/api/ai/minimax/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ],
    "model": "abab5.5-chat",
    "temperature": 0.7,
    "max_tokens": 100
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "response": "I'm doing well, thank you for asking!",
    "model": "abab5.5-chat",
    "usage": {
      "prompt_tokens": 10,
      "completion_tokens": 8,
      "total_tokens": 18
    }
  }
}
```

#### Test Streaming Response
```bash
curl -X POST https://ai-api-playground-backend.onrender.com/api/ai/minimax/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Write a short story about AI"
      }
    ],
    "model": "abab5.5-chat",
    "stream": true,
    "temperature": 0.8,
    "max_tokens": 200
  }'
```

**Expected Response:** Streaming text chunks

### 2. Rate Limit Testing

#### Test Rate Limit Headers
```bash
curl -X GET https://ai-api-playground-backend.onrender.com/api/ai/minimax/models \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -i
```

**Expected Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1640000000
```

### 3. Quota Management Testing

#### Check User Quota
```bash
curl -X GET https://ai-api-playground-backend.onrender.com/api/ai/quota \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "dailyQuota": 1000,
    "usedQuota": 150,
    "remainingQuota": 850,
    "resetTime": "2025-11-12T00:00:00.000Z"
  }
}
```

## Webhook Testing

### 1. Create Webhook Endpoint

#### Register Webhook
```bash
curl -X POST https://ai-api-playground-backend.onrender.com/api/webhooks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "url": "https://your-webhook-endpoint.com/webhook",
    "events": ["ai.request", "ai.response", "quota.exceeded"],
    "secret": "your-webhook-secret"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "webhook": {
      "id": "webhook-uuid",
      "url": "https://your-webhook-endpoint.com/webhook",
      "events": ["ai.request", "ai.response", "quota.exceeded"],
      "isActive": true
    }
  }
}
```

### 2. Test Webhook Delivery
```bash
curl -X POST https://ai-api-playground-backend.onrender.com/api/webhooks/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "webhookId": "webhook-uuid",
    "event": "ai.request",
    "payload": {
      "test": true
    }
  }'
```

## Error Handling Testing

### 1. Test Invalid Authentication
```bash
curl -X GET https://ai-api-playground-backend.onrender.com/api/ai/quota \
  -H "Authorization: Bearer invalid-token"
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```

### 2. Test Rate Limit Exceeded
```bash
# Make multiple rapid requests to trigger rate limit
for i in {1..101}; do
  curl -X GET https://ai-api-playground-backend.onrender.com/api/ai/quota \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
done
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later."
  }
}
```

### 3. Test Quota Exceeded
```bash
# Make requests until quota is exceeded
curl -X POST https://ai-api-playground-backend.onrender.com/api/ai/minimax/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "messages": [{"role": "user", "content": "test"}],
    "max_tokens": 10000
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Daily quota exceeded. Please try again tomorrow."
  }
}
```

## Performance Testing

### 1. Response Time Testing
```bash
# Test API response time
time curl -X GET https://ai-api-playground-backend.onrender.com/health

# Test with detailed timing
curl -w "@curl-format.txt" -X GET https://ai-api-playground-backend.onrender.com/health
```

### 2. Load Testing
```bash
# Install Apache Bench (ab)
sudo apt-get install apache2-utils

# Run load test
ab -n 100 -c 10 -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  https://ai-api-playground-backend.onrender.com/api/ai/quota
```

## Monitoring and Logging

### 1. Check Application Logs
```bash
# View recent logs
render logs ai-api-playground-backend --tail 100

# View logs with specific level
render logs ai-api-playground-backend --level error
```

### 2. Monitor Metrics
```bash
# Check service metrics
render metrics ai-api-playground-backend --type cpu,memory

# Check HTTP metrics
render metrics ai-api-playground-backend --type http
```

## Troubleshooting

### 1. Connection Issues
```bash
# Test DNS resolution
nslookup ai-api-playground-backend.onrender.com

# Test network connectivity
ping ai-api-playground-backend.onrender.com

# Test SSL certificate
openssl s_client -connect ai-api-playground-backend.onrender.com:443
```

### 2. Authentication Issues
```bash
# Decode JWT token
echo "YOUR_TOKEN" | cut -d. -f2 | base64 -d

# Check token expiration
curl -X GET https://ai-api-playground-backend.onrender.com/api/auth/verify \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. API Issues
```bash
# Test Minimax API directly
curl -X POST https://api.minimax.chat/v1/text/chatcompletion \
  -H "Authorization: Bearer YOUR_MINIMAX_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "abab5.5-chat", "messages": [{"role": "user", "content": "test"}]}'
```

## Automated Testing Script

### Bash Testing Script
```bash
#!/bin/bash

# Configuration
API_URL="https://ai-api-playground-backend.onrender.com"
FRONTEND_URL="https://ai-api-playground-frontend.onrender.com"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PASSWORD="TestPassword123!"

echo "Starting Production API Tests..."

# Test health endpoint
echo "Testing health endpoint..."
curl -s -X GET $API_URL/health | jq .

# Register test user
echo "Registering test user..."
REGISTER_RESPONSE=$(curl -s -X POST $API_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"Test User\"}")

ACCESS_TOKEN=$(echo $REGISTER_RESPONSE | jq -r '.data.tokens.accessToken')

# Test authenticated endpoint
echo "Testing authenticated endpoint..."
curl -s -X GET $API_URL/api/ai/quota \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo "Tests completed!"
```

## Test Results Documentation

### Success Criteria
- [ ] All health endpoints return 200 status
- [ ] User registration and login work correctly
- [ ] AI API calls return valid responses
- [ ] Rate limiting functions properly
- [ ] Quota management works as expected
- [ ] Webhooks are delivered successfully
- [ ] Error handling returns appropriate status codes
- [ ] Response times are within acceptable limits (< 2s for health, < 5s for AI)

### Reporting Issues
When reporting issues, include:
1. Full curl command used
2. Complete response (headers and body)
3. Timestamp of the request
4. User ID (if authenticated)
5. Any error messages from logs

## Additional Resources
- [Render Logs Documentation](https://render.com/docs/logs)
- [cURL Documentation](https://curl.se/docs/)
- [Minimax API Documentation](https://www.minimax.chat/document/guides)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)