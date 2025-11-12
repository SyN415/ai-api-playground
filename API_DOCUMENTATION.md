# API Documentation

Comprehensive documentation for the AI API Playground REST API.

## Base URL

- **Development**: `http://localhost:3001`
- **Production**: `https://your-api-domain.com`

## Authentication

The API uses JWT (JSON Web Token) authentication. Include the token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

### Alternative: API Key Authentication

For programmatic access, you can use API keys:

```http
X-API-Key: <your-api-key>
```

## Response Format

All API responses follow a consistent format:

```json
{
  "success": true,
  "data": { /* response data */ },
  "message": "Success message",
  "timestamp": "2025-11-11T22:00:00.000Z"
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": { /* additional error info */ }
  },
  "timestamp": "2025-11-11T22:00:00.000Z"
}
```

## Authentication Endpoints

### Register
Create a new user account.

```http
POST /api/auth/register
```

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

**Validation Rules:**
- `username`: 3-30 characters, alphanumeric only
- `email`: Valid email format
- `password`: Minimum 8 characters, must include uppercase, lowercase, and number

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "username": "johndoe",
      "email": "john@example.com",
      "tier": "free",
      "created_at": "2025-11-11T22:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "User registered successfully"
}
```

### Login
Authenticate existing user.

```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "username": "johndoe",
      "email": "john@example.com",
      "tier": "free",
      "created_at": "2025-11-11T22:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Login successful"
}
```

### Get Current User
Get the currently authenticated user's information.

```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "email": "john@example.com",
    "tier": "free",
    "quota": {
      "daily": { "used": 15, "limit": 50 },
      "weekly": { "used": 45, "limit": 350 },
      "monthly": { "used": 120, "limit": 1500 }
    },
    "api_keys": [],
    "created_at": "2025-11-11T22:00:00.000Z",
    "updated_at": "2025-11-11T22:00:00.000Z"
  }
}
```

### Update Profile
Update user profile information.

```http
PUT /api/auth/profile
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "username": "johndoe_updated",
  "email": "john.updated@example.com"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "username": "johndoe_updated",
    "email": "john.updated@example.com",
    "tier": "free",
    "updated_at": "2025-11-11T22:00:00.000Z"
  },
  "message": "Profile updated successfully"
}
```

### Change Password
Change user password.

```http
PUT /api/auth/password
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "oldPassword": "OldPass123!",
  "newPassword": "NewSecurePass456!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

### Logout
Logout the current user (invalidates token).

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

## AI Endpoints

### Chat Completion
Send a chat message and get AI response.

```http
POST /api/v1/ai/chat
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    },
    {
      "role": "assistant",
      "content": "I'm doing well, thank you!"
    },
    {
      "role": "user",
      "content": "What's the weather like today?"
    }
  ],
  "model": "minimax",
  "max_tokens": 1000,
  "temperature": 0.7,
  "top_p": 0.9,
  "stream": false
}
```

**Parameters:**
- `messages`: Array of conversation messages
  - `role`: "user", "assistant", or "system"
  - `content`: Message content
- `model`: AI model to use (default: "minimax")
- `max_tokens`: Maximum tokens in response (default: 1000)
- `temperature`: Creativity level 0-1 (default: 0.7)
- `top_p`: Nucleus sampling parameter (default: 0.9)
- `stream`: Enable streaming responses (default: false)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "chat-123456",
    "model": "minimax",
    "choices": [
      {
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "I don't have real-time weather data, but I can help you find weather information online..."
        },
        "finish_reason": "stop"
      }
    ],
    "usage": {
      "prompt_tokens": 25,
      "completion_tokens": 45,
      "total_tokens": 70
    },
    "created": 1640000000
  }
}
```

### Text Generation
Generate text based on a prompt.

```http
POST /api/v1/ai/generate
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "prompt": "Write a short story about artificial intelligence",
  "model": "minimax",
  "max_tokens": 500,
  "temperature": 0.8,
  "top_p": 0.95,
  "n": 1,
  "stop": ["\n\n", "END"]
}
```

**Parameters:**
- `prompt`: Text prompt for generation
- `model`: AI model to use
- `max_tokens`: Maximum tokens to generate
- `temperature`: Creativity level
- `top_p`: Nucleus sampling
- `n`: Number of completions to generate
- `stop`: Stop sequences

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "gen-123456",
    "model": "minimax",
    "choices": [
      {
        "text": "In a world where machines could think, a small AI named Ada discovered something extraordinary...",
        "index": 0,
        "finish_reason": "stop"
      }
    ],
    "usage": {
      "prompt_tokens": 8,
      "completion_tokens": 142,
      "total_tokens": 150
    }
  }
}
```

### Get AI Models
List available AI models.

```http
GET /api/v1/ai/models
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "models": [
      {
        "id": "minimax",
        "name": "Minimax AI",
        "description": "Advanced language model for various tasks",
        "max_tokens": 4096,
        "supported_endpoints": ["chat", "generate"],
        "pricing": {
          "per_1k_tokens": 0.002
        }
      }
    ]
  }
}
```

### Get AI Usage
Get AI usage statistics for the current user.

```http
GET /api/v1/ai/usage
Authorization: Bearer <token>
```

**Query Parameters:**
- `start_date`: Start date for usage data (ISO format)
- `end_date`: End date for usage data (ISO format)
- `model`: Filter by specific model

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "usage": {
      "total_requests": 150,
      "total_tokens": 45000,
      "total_cost": 0.09,
      "by_model": {
        "minimax": {
          "requests": 150,
          "tokens": 45000,
          "cost": 0.09
        }
      },
      "by_date": [
        {
          "date": "2025-11-11",
          "requests": 25,
          "tokens": 7500,
          "cost": 0.015
        }
      ]
    },
    "quota": {
      "daily": { "used": 25, "limit": 50 },
      "weekly": { "used": 125, "limit": 350 },
      "monthly": { "used": 450, "limit": 1500 }
    }
  }
}
```

## API Key Management

### Create API Key
Generate a new API key for programmatic access.

```http
POST /api/v1/api-keys
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "My Application",
  "permissions": ["ai:read", "ai:write", "usage:read"],
  "expires_in": 30
}
```

**Parameters:**
- `name`: Descriptive name for the API key
- `permissions`: Array of permissions
- `expires_in`: Days until expiration (optional, default: 90)

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "api_key": {
      "id": "key-123456",
      "name": "My Application",
      "key": "sk_live_abc123xyz789",
      "permissions": ["ai:read", "ai:write", "usage:read"],
      "created_at": "2025-11-11T22:00:00.000Z",
      "expires_at": "2025-12-11T22:00:00.000Z",
      "last_used": null
    }
  },
  "message": "API key created successfully"
}
```

**⚠️ IMPORTANT**: Save the `key` value immediately - it won't be shown again!

### List API Keys
Get all API keys for the current user.

```http
GET /api/v1/api-keys
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "api_keys": [
      {
        "id": "key-123456",
        "name": "My Application",
        "permissions": ["ai:read", "ai:write"],
        "created_at": "2025-11-11T22:00:00.000Z",
        "expires_at": "2025-12-11T22:00:00.000Z",
        "last_used": "2025-11-11T23:30:00.000Z"
      }
    ]
  }
}
```

### Get API Key Details
Get details for a specific API key.

```http
GET /api/v1/api-keys/:id
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "api_key": {
      "id": "key-123456",
      "name": "My Application",
      "permissions": ["ai:read", "ai:write"],
      "created_at": "2025-11-11T22:00:00.000Z",
      "expires_at": "2025-12-11T22:00:00.000Z",
      "last_used": "2025-11-11T23:30:00.000Z",
      "usage_count": 45
    }
  }
}
```

### Update API Key
Update API key name or permissions.

```http
PUT /api/v1/api-keys/:id
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Updated Application Name",
  "permissions": ["ai:read", "ai:write", "usage:read", "webhooks:write"]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "api_key": {
      "id": "key-123456",
      "name": "Updated Application Name",
      "permissions": ["ai:read", "ai:write", "usage:read", "webhooks:write"],
      "updated_at": "2025-11-11T22:00:00.000Z"
    }
  },
  "message": "API key updated successfully"
}
```

### Delete API Key
Revoke an API key.

```http
DELETE /api/v1/api-keys/:id
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "API key deleted successfully"
}
```

## Webhook Management

### Create Webhook
Create a new webhook endpoint.

```http
POST /api/v1/webhooks
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "url": "https://your-app.com/webhook",
  "events": ["ai.task.completed", "ai.task.failed", "quota.warning"],
  "secret": "your-webhook-secret",
  "active": true
}
```

**Parameters:**
- `url`: Webhook endpoint URL
- `events`: Array of events to subscribe to
- `secret`: Secret for webhook signature verification
- `active`: Whether webhook is active (default: true)

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "webhook": {
      "id": "wh-123456",
      "url": "https://your-app.com/webhook",
      "events": ["ai.task.completed", "ai.task.failed"],
      "secret": "whsec_abc123xyz789",
      "active": true,
      "created_at": "2025-11-11T22:00:00.000Z",
      "last_delivery": null
    }
  }
}
```

### List Webhooks
Get all webhooks for the current user.

```http
GET /api/v1/webhooks
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "webhooks": [
      {
        "id": "wh-123456",
        "url": "https://your-app.com/webhook",
        "events": ["ai.task.completed", "ai.task.failed"],
        "active": true,
        "created_at": "2025-11-11T22:00:00.000Z",
        "last_delivery": "2025-11-11T23:30:00.000Z"
      }
    ]
  }
}
```

### Update Webhook
Update webhook configuration.

```http
PUT /api/v1/webhooks/:id
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "url": "https://your-app.com/new-webhook",
  "events": ["ai.task.completed", "ai.task.failed", "quota.warning"],
  "active": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "webhook": {
      "id": "wh-123456",
      "url": "https://your-app.com/new-webhook",
      "events": ["ai.task.completed", "ai.task.failed", "quota.warning"],
      "active": true,
      "updated_at": "2025-11-11T22:00:00.000Z"
    }
  }
}
```

### Delete Webhook
Delete a webhook.

```http
DELETE /api/v1/webhooks/:id
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Webhook deleted successfully"
}
```

## Webhook Events

### AI Task Completed
```json
{
  "event": "ai.task.completed",
  "data": {
    "task_id": "task-123456",
    "status": "completed",
    "result": {
      "choices": [...],
      "usage": {...}
    },
    "user_id": "user-123456",
    "timestamp": "2025-11-11T22:00:00.000Z"
  }
}
```

### AI Task Failed
```json
{
  "event": "ai.task.failed",
  "data": {
    "task_id": "task-123456",
    "status": "failed",
    "error": "Error message",
    "user_id": "user-123456",
    "timestamp": "2025-11-11T22:00:00.000Z"
  }
}
```

### Quota Warning
```json
{
  "event": "quota.warning",
  "data": {
    "user_id": "user-123456",
    "quota_type": "daily",
    "used": 45,
    "limit": 50,
    "percentage": 90,
    "timestamp": "2025-11-11T22:00:00.000Z"
  }
}
```

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `VALIDATION_ERROR` | Input validation failed | 400 |
| `AUTHENTICATION_ERROR` | Authentication failed | 401 |
| `AUTHORIZATION_ERROR` | Insufficient permissions | 403 |
| `NOT_FOUND` | Resource not found | 404 |
| `RATE_LIMIT_EXCEEDED` | Rate limit exceeded | 429 |
| `SERVER_ERROR` | Internal server error | 500 |
| `SERVICE_UNAVAILABLE` | Service temporarily unavailable | 503 |

## Rate Limiting

Rate limits are applied based on user tier:

| Tier | Requests/Minute | Daily Limit |
|------|----------------|-------------|
| Free | 10 | 50 |
| Basic | 30 | 500 |
| Pro | 100 | 2000 |
| Enterprise | 500 | Unlimited |

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2025-11-11T23:00:00.000Z
X-RateLimit-Endpoint: ai
X-RateLimit-Identifier: user
```

## Pagination

List endpoints support pagination:

```http
GET /api/v1/usage?page=1&limit=50&sort=desc
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `sort`: Sort order - "asc" or "desc" (default: "desc")

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 200,
      "pages": 4,
      "has_next": true,
      "has_prev": false
    }
  }
}
```

## WebSocket Support (Future)

WebSocket endpoints for real-time AI responses:

```javascript
// Coming soon
const ws = new WebSocket('wss://api.example.com/v1/ai/stream');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.content);
};
```

---

**API Version**: 1.0.0
**Last Updated**: November 11, 2025
**Base URL**: https://api.example.com