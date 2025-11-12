# Quick Start Guide

Get the AI API Playground up and running in minutes with this step-by-step guide.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher) - [Download here](https://nodejs.org/)
- **npm** (v8.0.0 or higher) - Comes with Node.js
- **MongoDB** (v4.4 or higher) - [Download here](https://www.mongodb.com/try/download/community)
- **Redis** (v6.0 or higher) - [Download here](https://redis.io/download)
- **Git** - [Download here](https://git-scm.com/)

## 🚀 Quick Start (5 Minutes)

### 1. Clone the Repository

```bash
git clone https://github.com/SyN415/ai-api-playground.git
cd ai-api-playground
```

### 2. Backend Setup (2 minutes)

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start MongoDB (in a separate terminal)
mongod --dbpath ./data

# Start Redis (in a separate terminal)
redis-server

# Start the backend server
npm run dev
```

The backend will start on `http://localhost:3001`

### 3. Frontend Setup (2 minutes)

```bash
# Open a new terminal, navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start the frontend development server
npm start
```

The frontend will start on `http://localhost:3000`

### 4. Access the Application

Open your browser and navigate to:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001/api/docs
- **Health Check**: http://localhost:3001/health

## 🔧 Configuration

### Backend Environment Variables

Edit `backend/.env`:

```env
# Server Configuration
NODE_ENV=development
PORT=3001

# Database
MONGODB_URI=mongodb://localhost:27017/ai-api-playground

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
BCRYPT_ROUNDS=12

# Redis
REDIS_URL=redis://localhost:6379

# AI Provider (Minimax)
MINIMAX_API_KEY=your-minimax-api-key
MINIMAX_GROUP_ID=your-minimax-group-id

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Webhooks
WEBHOOK_SECRET=your-webhook-secret-key
```

### Frontend Environment Variables

Edit `frontend/.env`:

```env
# API Configuration
REACT_APP_API_URL=http://localhost:3001
REACT_APP_ENV=development
```

## 🧪 Testing

### Backend Tests

```bash
cd backend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test
npm test auth.test.js
```

### Frontend Tests

```bash
cd frontend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Manual Testing

Test the API with the provided test script:

```bash
cd backend
node test-auth.js
```

## 📖 Development Workflow

### 1. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```

**Terminal 3 - MongoDB:**
```bash
mongod --dbpath ./data
```

**Terminal 4 - Redis:**
```bash
redis-server
```

### 2. Create a Test User

Use the registration form at `http://localhost:3000` or test with curl:

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

### 3. Login and Get Token

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

Save the token from the response.

### 4. Test AI API

```bash
curl -X POST http://localhost:3001/api/v1/ai/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ],
    "model": "minimax"
  }'
```

## 🐳 Docker Setup (Alternative)

If you prefer Docker:

### 1. Install Docker

[Download Docker Desktop](https://www.docker.com/products/docker-desktop)

### 2. Create Docker Compose File

Create `docker-compose.yml` in the project root:

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6.0
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - MONGODB_URI=mongodb://mongodb:27017/ai-api-playground
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongodb
      - redis
    volumes:
      - ./backend:/app
      - /app/node_modules

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_API_URL=http://localhost:3001
    depends_on:
      - backend
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  mongodb_data:
```

### 3. Start with Docker

```bash
# Build and start all services
docker-compose up

# Or run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 🚀 Production Deployment

### 1. Build for Production

**Backend:**
```bash
cd backend
npm run build
npm run start:production
```

**Frontend:**
```bash
cd frontend
npm run build
# Serve static files with any web server
```

### 2. Environment Variables for Production

**Backend (.env.production):**
```env
NODE_ENV=production
PORT=10000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/ai-api-playground
JWT_SECRET=production-super-secret-key
REDIS_URL=redis://production-redis-url
```

**Frontend (.env.production):**
```env
REACT_APP_API_URL=https://your-api-domain.com
REACT_APP_ENV=production
```

### 3. Deploy to Render.com

1. **Create Render Account**: https://render.com
2. **Connect GitHub Repository**
3. **Create Web Service** for backend
4. **Create Static Site** for frontend
5. **Create PostgreSQL Database**
6. **Set Environment Variables**
7. **Deploy**

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## 🔍 Troubleshooting

### Common Issues

#### 1. MongoDB Connection Failed

**Problem**: `MongoNetworkError: failed to connect to server`
**Solution**:
```bash
# Check if MongoDB is running
ps aux | grep mongod

# Start MongoDB
mongod --dbpath ./data

# Or use Docker
docker run -d -p 27017:27017 mongo:6.0
```

#### 2. Redis Connection Failed

**Problem**: `Redis connection failed`
**Solution**:
```bash
# Check if Redis is running
redis-cli ping

# Start Redis
redis-server

# Or use Docker
docker run -d -p 6379:6379 redis:7-alpine
```

#### 3. Port Already in Use

**Problem**: `Error: listen EADDRINUSE: address already in use`
**Solution**:
```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>

# Or use different port
# Edit backend/.env: PORT=3002
```

#### 4. CORS Issues

**Problem**: `CORS policy: No 'Access-Control-Allow-Origin' header`
**Solution**:
```bash
# Check CORS_ORIGIN in backend/.env
CORS_ORIGIN=http://localhost:3000

# For production
CORS_ORIGIN=https://your-frontend-domain.com
```

#### 5. JWT Secret Missing

**Problem**: `JsonWebTokenError: jwt must be provided`
**Solution**:
```bash
# Add JWT_SECRET to backend/.env
JWT_SECRET=your-super-secret-key-minimum-32-characters
```

### Getting Help

1. **Check Logs**: Check terminal output for error messages
2. **Review Documentation**: See [README.md](README.md) and [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
3. **Check Issues**: Look at GitHub issues for similar problems
4. **Ask for Help**: Create a new issue with detailed information

## 📊 Development Commands

### Backend Commands

```bash
cd backend

# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run start            # Start production server
npm run start:production # Start with production settings

# Testing
npm test                 # Run tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage

# Code Quality
npm run lint             # Check code style
npm run lint:fix         # Fix code style issues

# Utilities
npm run copy-config      # Copy config files
```

### Frontend Commands

```bash
cd frontend

# Development
npm start                # Start development server
npm run build            # Build for production

# Testing
npm test                 # Run tests
npm run test:watch       # Run tests in watch mode

# Code Quality
npm run lint             # Check code style
npm run lint:fix         # Fix code style issues
```

## 🎯 Next Steps

1. **Explore the API**: Test different endpoints
2. **Add AI Providers**: Integrate additional AI services
3. **Customize UI**: Modify the frontend for your needs
4. **Add Features**: Extend functionality
5. **Deploy**: Deploy to your preferred platform

## 📚 Additional Resources

- [API Documentation](API_DOCUMENTATION.md) - Complete API reference
- [Contributing Guide](CONTRIBUTING.md) - How to contribute to the project
- [README.md](README.md) - Project overview and features
- [DEPLOYMENT.md](DEPLOYMENT.md) - Detailed deployment instructions

## 🆘 Support

- **GitHub Issues**: [Report bugs and request features](https://github.com/SyN415/ai-api-playground/issues)
- **Documentation**: Check the docs/ directory for detailed guides
- **Community**: Join discussions in GitHub Discussions

---

**Quick Start Guide** | Version 1.0.0 | Last Updated: November 11, 2025

Happy coding! 🚀