# AI API Playground

A comprehensive, production-ready AI API playground built with Node.js, Express, and React that provides a unified interface for multiple AI providers with authentication, rate limiting, quota management, and comprehensive monitoring.

## 🚀 Features

### Core Functionality
- **Multi-Provider AI Integration**: Seamlessly integrate with multiple AI providers (Minimax, OpenAI, etc.)
- **Authentication & Authorization**: Secure JWT-based authentication with role-based access control
- **Rate Limiting**: Advanced rate limiting with Redis-backed sliding window algorithm
- **Quota Management**: User-tier based quota system with daily/weekly/monthly limits
- **API Key Management**: Generate and manage API keys for programmatic access
- **Webhook Support**: Real-time webhook notifications for AI task completions
- **Comprehensive Logging**: Structured logging with Winston for debugging and monitoring
- **Analytics & Monitoring**: Built-in analytics service for usage tracking and insights

### Technical Features
- **Backend**: Node.js with Express.js, TypeScript-ready structure
- **Frontend**: React with TypeScript, modern hooks and context API
- **Database**: MongoDB with Mongoose ODM
- **Caching**: Redis for rate limiting and session management
- **Security**: Helmet, CORS, input validation, SQL injection protection
- **Testing**: Jest and Supertest for API testing
- **Deployment**: Ready for Render.com with CI/CD configuration
- **Documentation**: Comprehensive API documentation and guides

## 🏗️ Architecture

```
ai-api-playground/
├── backend/                 # Node.js/Express backend
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   ├── middleware/     # Express middleware
│   │   ├── models/         # MongoDB models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic services
│   │   └── utils/          # Utility functions
│   ├── test/               # Test files
│   └── scripts/            # Utility scripts
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── context/        # React context providers
│   │   ├── hooks/          # Custom React hooks
│   │   ├── pages/          # Page components
│   │   ├── services/       # API service clients
│   │   └── utils/          # Utility functions
│   └── public/             # Static assets
├── scripts/                # Deployment scripts
└── docs/                   # Documentation
```

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Caching**: Redis
- **Authentication**: JWT (jsonwebtoken)
- **Validation**: Joi
- **Logging**: Winston
- **Security**: Helmet, bcrypt, rate-limiter-flexible
- **Testing**: Jest, Supertest

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Styling**: CSS with CSS Modules
- **HTTP Client**: Axios
- **Routing**: React Router DOM
- **State Management**: React Context API + Hooks

### Infrastructure
- **Deployment**: Render.com
- **Environment**: Docker-ready
- **CI/CD**: GitHub Actions ready
- **Monitoring**: Built-in health checks and logging

## 📋 Prerequisites

- Node.js (v18 or higher)
- MongoDB (v4.4 or higher)
- Redis (v6.0 or higher)
- npm or yarn package manager
- Git

## 🚀 Quick Start

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/SyN415/ai-api-playground.git
   cd ai-api-playground
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   cp .env.example .env
   # Edit .env with your API URL
   npm start
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - API Documentation: http://localhost:3001/api/docs

### Environment Configuration

Create `.env` files based on the examples:

**Backend `.env`:**
```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/ai-api-playground
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
BCRYPT_ROUNDS=12

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# AI Provider Configuration
MINIMAX_API_KEY=your-minimax-api-key
MINIMAX_GROUP_ID=your-minimax-group-id

# Email Configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Webhook Configuration
WEBHOOK_SECRET=your-webhook-secret-key
WEBHOOK_TIMEOUT=5000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Frontend `.env`:**
```env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_ENV=development
```

## 📚 API Documentation

### Authentication Endpoints

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <jwt_token>
```

### AI Endpoints

#### Chat Completion
```http
POST /api/v1/ai/chat
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "model": "minimax",
  "max_tokens": 1000,
  "temperature": 0.7
}
```

#### Generate Text
```http
POST /api/v1/ai/generate
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "prompt": "Write a short story about AI",
  "model": "minimax",
  "max_tokens": 500
}
```

### API Key Management

#### Create API Key
```http
POST /api/v1/api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "My App Key",
  "permissions": ["ai:read", "ai:write"]
}
```

#### List API Keys
```http
GET /api/v1/api-keys
Authorization: Bearer <jwt_token>
```

### Webhook Management

#### Create Webhook
```http
POST /api/v1/webhooks
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "url": "https://your-app.com/webhook",
  "events": ["ai.task.completed", "ai.task.failed"],
  "secret": "your-webhook-secret"
}
```

## 📊 User Tiers & Quotas

| Tier | AI Requests/Day | Rate Limit | Features |
|------|----------------|------------|----------|
| Free | 50 | 10 req/min | Basic AI access |
| Basic | 500 | 30 req/min | Standard models |
| Pro | 2000 | 100 req/min | Advanced models |
| Enterprise | Unlimited | 500 req/min | All features + priority |

## 🔧 Configuration

### AI Provider Configuration

The system supports multiple AI providers. Currently configured:

#### Minimax AI
```env
MINIMAX_API_KEY=your-api-key
MINIMAX_GROUP_ID=your-group-id
```

#### Adding New Providers
1. Create provider configuration in `backend/src/config/`
2. Implement provider service in `backend/src/services/`
3. Add provider to AI service router
4. Update frontend to support new provider

### Rate Limiting Configuration

Rate limits are configurable per endpoint and user tier:

```javascript
// backend/src/middleware/rateLimit.js
const RATE_LIMIT_CONFIGS = {
  ai: {
    free: { points: 10, duration: 60 },      // 10 requests per minute
    basic: { points: 30, duration: 60 },
    pro: { points: 100, duration: 60 },
    enterprise: { points: 500, duration: 60 }
  }
};
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
```

### Frontend Tests
```bash
cd frontend
npm test                    # Run all tests
npm run test:watch         # Watch mode
```

### Manual Testing
```bash
# Test authentication
cd backend
node test-auth.js
```

## 🚀 Deployment

### Render.com Deployment

The project is configured for easy deployment on Render.com:

1. **Create Render Account**: Sign up at [render.com](https://render.com)
2. **Connect GitHub**: Connect your GitHub repository
3. **Deploy Services**: Use the provided `render.yaml` configuration
4. **Environment Variables**: Set environment variables in Render dashboard

### Manual Deployment

#### Backend Deployment
```bash
cd backend
npm run build              # Build for production
npm run start:production   # Start production server
```

#### Frontend Deployment
```bash
cd frontend
npm run build              # Build for production
# Serve static files with any web server
```

### Environment Variables for Production

**Backend Production Variables:**
```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/ai-api-playground
JWT_SECRET=production-super-secret-key
REDIS_URL=redis://production-redis-url
```

**Frontend Production Variables:**
```env
REACT_APP_API_URL=https://your-api-domain.com
REACT_APP_ENV=production
```

## 📈 Monitoring & Logging

### Health Checks
- **API Health**: `GET /health`
- **Database**: Automatic connection monitoring
- **Redis**: Connection status tracking

### Logging
- **Application Logs**: Winston with multiple transports
- **Request Logs**: Detailed request/response logging
- **Error Logs**: Structured error logging with context
- **Audit Logs**: Security event tracking

### Metrics
- **Request Counts**: Per endpoint and user
- **Response Times**: API performance monitoring
- **Error Rates**: Error tracking and alerting
- **Quota Usage**: User quota consumption tracking

## 🔒 Security Features

- **Input Validation**: Joi schema validation for all inputs
- **SQL Injection Protection**: Parameterized queries and sanitization
- **XSS Protection**: Content Security Policy and input sanitization
- **Rate Limiting**: Redis-backed advanced rate limiting
- **CORS**: Configurable Cross-Origin Resource Sharing
- **Helmet**: Security headers middleware
- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with configurable rounds
- **API Key Management**: Secure API key generation and validation

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- **Backend**: ESLint with Airbnb configuration
- **Frontend**: ESLint with React hooks rules
- **Formatting**: Prettier for consistent formatting
- **Commit Messages**: Follow conventional commits

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the `docs/` directory
- **Issues**: [GitHub Issues](https://github.com/SyN415/ai-api-playground/issues)
- **Discussions**: [GitHub Discussions](https://github.com/SyN415/ai-api-playground/discussions)

## 🙏 Acknowledgments

- [Minimax AI](https://www.minimax.io/) for providing the AI API
- [Render.com](https://render.com/) for hosting infrastructure
- All contributors who have helped shape this project

## 📊 Project Status

| Component | Status | Notes |
|-----------|--------|-------|
| Backend API | ✅ Ready | All endpoints implemented and tested |
| Frontend | ✅ Ready | React app with full functionality |
| Authentication | ✅ Ready | JWT auth with role-based access |
| Rate Limiting | ✅ Ready | Redis-backed advanced rate limiting |
| AI Integration | ✅ Ready | Minimax AI integration complete |
| Database | ✅ Ready | MongoDB with full schema |
| Deployment | 🔄 In Progress | Render.com deployment pending final fixes |
| Documentation | ✅ Ready | Comprehensive docs included |

---

**Last Updated**: November 11, 2025
**Version**: 1.0.0
**Status**: Production Ready (Deployment in Progress)