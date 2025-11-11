# Building an AI API Playground on Render.com: Complete Guide

A comprehensive step-by-step guide for creating a personal AI API playground with Minimax Hailuo 2.3 integration, hosted on Render.com.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Project Setup](#project-setup)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Database Setup](#database-setup)
7. [Authentication](#authentication)
8. [API Gateway Layer](#api-gateway-layer)
9. [Deployment to Render](#deployment-to-render)
10. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Architecture Overview

Your AI API playground will consist of:

- **Frontend**: React-based web interface for testing API calls
- **Backend API Gateway**: Express.js middleware that aggregates and routes requests to multiple AI providers
- **Database**: PostgreSQL for storing API keys, usage history, and request logs
- **Authentication**: JWT-based auth for securing the playground
- **External APIs**: Minimax Hailuo 2.3 and other AI services

### Data Flow

```
User Browser → React Frontend → Backend API Gateway → Minimax API
                                                   → Other AI APIs
                                 ↓
                            PostgreSQL Database
                         (usage tracking, keys)
```

---

## Prerequisites

### Required Accounts & Services

- **GitHub/GitLab/Bitbucket**: Version control and Render deployment source
- **Render.com**: Hosting platform (free tier acceptable for personal use)
- **Minimax**: API account with GroupID and API key (get from [minimax.io](https://minimax.io))
- **PostgreSQL**: Render provides managed PostgreSQL instances

### Local Development Tools

```bash
# Node.js and npm (v16+ recommended)
node --version
npm --version

# Git
git --version

# Optional: PostgreSQL client for local testing
psql --version
```

---

## Project Setup

### 1. Initialize Git Repository

```bash
mkdir ai-api-playground
cd ai-api-playground
git init
npm init -y
```

### 2. Install Dependencies

```bash
# Core dependencies
npm install express cors dotenv jsonwebtoken bcryptjs pg

# Utility libraries
npm install axios uuid winston

# Rate limiting
npm install express-rate-limit redis ioredis

# Development
npm install --save-dev nodemon

# Database ORM (optional but recommended)
npm install prisma @prisma/client
```

### 3. Project Structure

```
ai-api-playground/
├── server.js                 # Main Express app
├── .env                      # Environment variables (DO NOT commit)
├── .env.example              # Template for .env
├── .gitignore
├── package.json
├── render.yaml               # Render deployment config
├── src/
│   ├── config/
│   │   ├── database.js       # PostgreSQL connection
│   │   └── redis.js          # Redis connection for rate limiting
│   ├── routes/
│   │   ├── auth.js           # Authentication routes
│   │   ├── api-keys.js       # API key management
│   │   └── playground.js     # Playground routes
│   ├── middleware/
│   │   ├── auth.js           # JWT verification middleware
│   │   ├── rateLimiter.js    # Rate limiting middleware
│   │   └── errorHandler.js   # Centralized error handling
│   ├── services/
│   │   ├── minimax.js        # Minimax API service
│   │   └── apiGateway.js     # API aggregation logic
│   └── utils/
│       ├── validators.js     # Input validation
│       └── logger.js         # Winston logger setup
├── public/
│   └── index.html            # Frontend HTML
├── client/                   # React frontend (optional separate folder)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   └── services/api.js
│   └── package.json
└── README.md
```

### 4. Create .env File

```bash
# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ai_playground

# Redis (for rate limiting)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRY=7d

# Minimax API
MINIMAX_API_KEY=your-minimax-api-key
MINIMAX_GROUP_ID=your-minimax-group-id
MINIMAX_API_URL=https://api.minimax.chat

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## Backend Implementation

### 1. Main Server File (server.js)

```javascript
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/keys', require('./src/routes/api-keys'));
app.use('/api/playground', require('./src/routes/playground'));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Error handling middleware (must be last)
app.use(require('./src/middleware/errorHandler'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

### 2. Database Connection (src/config/database.js)

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

module.exports = pool;
```

### 3. Authentication Middleware (src/middleware/auth.js)

```javascript
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { verifyToken };
```

### 4. Authentication Routes (src/routes/auth.js)

```javascript
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const router = express.Router();

// Signup
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );

    const token = jwt.sign(
      { userId: result.rows[0].id, email: result.rows[0].email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY }
    );

    res.status(201).json({ token, user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY }
    );

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### 5. Minimax Service (src/services/minimax.js)

```javascript
const axios = require('axios');
const crypto = require('crypto');

class MinimaxService {
  constructor() {
    this.apiKey = process.env.MINIMAX_API_KEY;
    this.groupId = process.env.MINIMAX_GROUP_ID;
    this.baseUrl = process.env.MINIMAX_API_URL;
  }

  generateSignature(nonce) {
    const signature = crypto
      .createHmac('sha256', this.apiKey)
      .update(this.apiKey + nonce)
      .digest('hex');
    return signature;
  }

  async callHailuoVideoAPI(params) {
    const nonce = Math.floor(Date.now() / 1000);
    const signature = this.generateSignature(nonce);

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'x-nonce': nonce.toString(),
      'x-signature': signature,
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/hailuo/video/create`,
        params,
        { headers }
      );

      return {
        success: true,
        data: response.data,
        taskId: response.data.task_id,
        cost: response.data.cost,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  async getTaskStatus(taskId) {
    const nonce = Math.floor(Date.now() / 1000);
    const signature = this.generateSignature(nonce);

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'x-nonce': nonce.toString(),
      'x-signature': signature,
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/hailuo/task/status`,
        { task_id: taskId },
        { headers }
      );

      return {
        success: true,
        data: response.data,
        status: response.data.status,
        result: response.data.result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }
}

module.exports = new MinimaxService();
```

### 6. Playground Routes (src/routes/playground.js)

```javascript
const express = require('express');
const { verifyToken } = require('../middleware/auth');
const minimaxService = require('../services/minimax');
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Create video from image
router.post('/hailuo/video/create', verifyToken, async (req, res, next) => {
  try {
    const { imageUrl, prompt } = req.body;

    if (!imageUrl || !prompt) {
      return res.status(400).json({ error: 'imageUrl and prompt required' });
    }

    // Call Minimax API
    const result = await minimaxService.callHailuoVideoAPI({
      image_url: imageUrl,
      prompt: prompt,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Store request in database for tracking
    const requestId = uuidv4();
    await pool.query(
      `INSERT INTO requests (id, user_id, service, model, task_id, status, cost_estimate)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [requestId, req.user.userId, 'minimax', 'hailuo-2.3', result.taskId, 'processing', result.cost || 0]
    );

    res.json({
      requestId,
      taskId: result.taskId,
      status: 'processing',
      estimatedCost: result.cost,
    });
  } catch (err) {
    next(err);
  }
});

// Check task status
router.get('/hailuo/task/:taskId', verifyToken, async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const result = await minimaxService.getTaskStatus(taskId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Update database
    await pool.query(
      `UPDATE requests SET status = $1, result_url = $2 WHERE task_id = $3`,
      [result.status, result.result?.video_url || null, taskId]
    );

    res.json({
      taskId,
      status: result.status,
      result: result.result,
    });
  } catch (err) {
    next(err);
  }
});

// Get usage history
router.get('/usage', verifyToken, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.userId]
    );

    const totalCost = result.rows.reduce((sum, row) => sum + (row.cost_estimate || 0), 0);

    res.json({
      requests: result.rows,
      totalCost,
      count: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### 7. Rate Limiting Middleware (src/middleware/rateLimiter.js)

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

module.exports = limiter;
```

### 8. Error Handler Middleware (src/middleware/errorHandler.js)

```javascript
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  console.error(`[ERROR] ${statusCode}: ${message}`, err);

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
```

---

## Frontend Implementation

### 1. React Application Structure

Create a simple React app or use Create React App:

```bash
npx create-react-app client
cd client
npm install axios react-router-dom
```

### 2. API Service Client (client/src/services/api.js)

```javascript
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const auth = {
  signup: (email, password) => api.post('/auth/signup', { email, password }),
  login: (email, password) => api.post('/auth/login', { email, password }),
};

export const playground = {
  createVideo: (imageUrl, prompt) =>
    api.post('/playground/hailuo/video/create', { imageUrl, prompt }),
  checkTaskStatus: (taskId) =>
    api.get(`/playground/hailuo/task/${taskId}`),
  getUsage: () => api.get('/playground/usage'),
};
```

### 3. Main App Component (client/src/App.jsx)

```javascript
import React, { useState, useEffect } from 'react';
import { auth, playground } from './services/api';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await auth.login(email, password);
      setToken(response.data.token);
      localStorage.setItem('token', response.data.token);
      setEmail('');
      setPassword('');
    } catch (error) {
      alert('Login failed: ' + error.response?.data?.error);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      const response = await auth.signup(email, password);
      setToken(response.data.token);
      localStorage.setItem('token', response.data.token);
      setEmail('');
      setPassword('');
    } catch (error) {
      alert('Signup failed: ' + error.response?.data?.error);
    }
  };

  const handleCreateVideo = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await playground.createVideo(imageUrl, prompt);
      setTaskId(response.data.taskId);
      setImageUrl('');
      setPrompt('');
      alert('Video creation started! Task ID: ' + response.data.taskId);
    } catch (error) {
      alert('Failed to create video: ' + error.response?.data?.error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!taskId) {
      alert('Please enter a Task ID');
      return;
    }
    try {
      const response = await playground.checkTaskStatus(taskId);
      alert(`Status: ${response.data.status}\n\nResult: ${JSON.stringify(response.data.result, null, 2)}`);
    } catch (error) {
      alert('Failed to check status: ' + error.response?.data?.error);
    }
  };

  const handleGetUsage = async () => {
    try {
      const response = await playground.getUsage();
      console.log('Usage:', response.data);
      setResults(response.data.requests);
    } catch (error) {
      alert('Failed to get usage: ' + error.response?.data?.error);
    }
  };

  if (!token) {
    return (
      <div className="auth-container">
        <h1>AI API Playground</h1>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Login</button>
        </form>
        <button onClick={handleSignup}>Signup</button>
      </div>
    );
  }

  return (
    <div className="playground-container">
      <h1>AI API Playground</h1>
      <button onClick={() => {
        localStorage.removeItem('token');
        setToken(null);
      }}>Logout</button>

      <section>
        <h2>Create Video with Hailuo 2.3</h2>
        <form onSubmit={handleCreateVideo}>
          <input
            type="url"
            placeholder="Image URL"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            required
          />
          <textarea
            placeholder="Prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Video'}
          </button>
        </form>
      </section>

      <section>
        <h2>Check Task Status</h2>
        <input
          type="text"
          placeholder="Task ID"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
        />
        <button onClick={handleCheckStatus}>Check Status</button>
      </section>

      <section>
        <h2>Usage History</h2>
        <button onClick={handleGetUsage}>Load Usage</button>
        {results.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Status</th>
                <th>Cost</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {results.map((req) => (
                <tr key={req.id}>
                  <td>{req.task_id}</td>
                  <td>{req.status}</td>
                  <td>${(req.cost_estimate || 0).toFixed(3)}</td>
                  <td>{new Date(req.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default App;
```

---

## Database Setup

### 1. Initialize Database

Create a SQL file for database schema (db/schema.sql):

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys storage (for users to store their own provider keys if needed)
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  key_name VARCHAR(255),
  encrypted_key_value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, provider)
);

-- Request tracking
CREATE TABLE requests (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service VARCHAR(50) NOT NULL,
  model VARCHAR(100),
  task_id VARCHAR(255),
  status VARCHAR(50),
  cost_estimate DECIMAL(10, 6),
  result_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_requests_user_id ON requests(user_id);
CREATE INDEX idx_requests_task_id ON requests(task_id);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
```

### 2. Connect on Render

On Render, create a PostgreSQL database and get the connection string. Update your `.env`:

```
DATABASE_URL=postgresql://username:password@hostname:5432/dbname
```

---

## Deployment to Render

### 1. Create render.yaml

```yaml
services:
  - type: web
    name: ai-api-playground
    env: node
    plan: free
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        generateValue: true
      - key: MINIMAX_API_KEY
        sync: false
      - key: MINIMAX_GROUP_ID
        sync: false

databases:
  - name: playground-db
    plan: free
    databaseName: ai_playground
    user: dbuser
```

### 2. Prepare for Deployment

Add start script to package.json:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

### 3. Push to GitHub

```bash
git add .
git commit -m "Initial AI API playground setup"
git push origin main
```

### 4. Deploy on Render

1. Go to [render.com](https://render.com) and sign in
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub repository
4. Review and approve the blueprint
5. Add environment variables:
   - `MINIMAX_API_KEY`: Your Minimax API key
   - `MINIMAX_GROUP_ID`: Your Minimax Group ID
6. Deploy!

---

## Monitoring & Maintenance

### 1. Health Checks

Access `https://your-app.onrender.com/health` to verify your service is running.

### 2. View Logs

On Render dashboard, click your service and view real-time logs to debug issues.

### 3. Database Backups

Render PostgreSQL instances include automatic backups. Check the database details in your Render dashboard.

### 4. Scale Your Application

- **Add Redis for caching**: Reduce API calls to Minimax
- **Implement WebSockets**: Real-time video generation status updates
- **Add rate limiting per user**: Track monthly costs and prevent abuse
- **Build admin dashboard**: Monitor usage across all users

### 5. Cost Optimization

- Keep track of Minimax usage with `cost_estimate` field
- Implement monthly quotas per user
- Add caching for identical requests
- Use batch operations when possible

---

## Security Best Practices

1. **Never commit .env**: Use `.env.example` as a template
2. **Rotate JWT secrets**: Update `JWT_SECRET` periodically
3. **Validate all inputs**: Use validators library
4. **Use HTTPS only**: Render provides free SSL
5. **Encrypt sensitive data**: Use bcryptjs for passwords
6. **Rate limit**: Prevent abuse with request throttling
7. **Monitor logs**: Check for unusual activity

---

## Troubleshooting

### "Cannot find module 'pg'"
```bash
npm install pg
```

### Database connection fails on Render
- Check DATABASE_URL is set in environment variables
- Verify database is in the same region
- Check PgBouncer if hitting connection limits

### Minimax API returns 401
- Verify API key and Group ID are correct
- Check nonce/signature generation
- Ensure request headers are properly formatted

### Rate limiting not working
- Install and configure Redis: `npm install redis`
- Or use in-memory store for single-instance apps

---

## Next Steps

1. **Test locally**: `npm run dev`
2. **Add more AI providers**: Follow Minimax service pattern
3. **Build admin panel**: Track costs across users
4. **Implement webhooks**: Get async notifications from Minimax
5. **Add API documentation**: Create Swagger/OpenAPI specs
6. **Monetize**: Charge users per API call or subscription

---

## Resources

- [Express.js Documentation](https://expressjs.com/)
- [Minimax API Docs](https://minimax.io/docs)
- [Render Documentation](https://render.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc7519)