# Advanced AI API Playground: Advanced Topics & Optimization

Supplementary guide covering advanced patterns, optimization strategies, and scaling considerations for your AI API playground.

---

## Advanced Topics

### 1. API Request Caching Strategy

Implement caching to avoid redundant API calls and reduce Minimax costs:

```javascript
// src/middleware/caching.js
const crypto = require('crypto');

class CacheManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.defaultTTL = 3600; // 1 hour
  }

  generateKey(service, params) {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex');
    return `cache:${service}:${hash}`;
  }

  async get(key) {
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      console.error('Cache get error:', err);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (err) {
      console.error('Cache set error:', err);
    }
  }

  async invalidate(pattern) {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      console.error('Cache invalidate error:', err);
    }
  }
}

module.exports = CacheManager;
```

Usage in routes:

```javascript
router.post('/hailuo/video/create', verifyToken, async (req, res, next) => {
  try {
    const { imageUrl, prompt } = req.body;
    const cacheKey = cacheManager.generateKey('hailuo-video', { imageUrl, prompt });

    // Check cache first
    const cached = await cacheManager.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, fromCache: true });
    }

    const result = await minimaxService.callHailuoVideoAPI({ imageUrl, prompt });

    // Cache successful results
    if (result.success) {
      await cacheManager.set(cacheKey, result, 86400); // 24 hours
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});
```

### 2. Webhook Support for Async Processing

Implement webhooks to receive notifications when long-running tasks complete:

```javascript
// src/services/webhookManager.js
const axios = require('axios');

class WebhookManager {
  async notifyTaskCompletion(webhookUrl, taskData) {
    try {
      const payload = {
        event: 'task.completed',
        timestamp: new Date(),
        data: taskData,
      };

      const signature = this.generateSignature(payload);

      await axios.post(webhookUrl, payload, {
        headers: {
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': payload.timestamp,
        },
        timeout: 5000,
      });
    } catch (err) {
      console.error('Webhook notification failed:', err.message);
      // Implement retry logic with exponential backoff
    }
  }

  generateSignature(payload) {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}

module.exports = new WebhookManager();
```

### 3. Cost Tracking & User Quotas

Implement comprehensive cost tracking to prevent runaway charges:

```javascript
// src/services/costManager.js
const pool = require('../config/database');

class CostManager {
  async getUserMonthlySpend(userId) {
    const result = await pool.query(
      `SELECT COALESCE(SUM(cost_estimate), 0) as total_cost
       FROM requests
       WHERE user_id = $1
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
      [userId]
    );
    return parseFloat(result.rows[0].total_cost);
  }

  async checkUserQuota(userId, limit = 10.0) {
    const monthlySpend = await this.getUserMonthlySpend(userId);
    return monthlySpend < limit;
  }

  async enforceQuota(req, res, next) {
    const monthlySpend = await this.getUserMonthlySpend(req.user.userId);
    const userQuota = process.env.USER_MONTHLY_QUOTA || 10.0;

    if (monthlySpend >= userQuota) {
      return res.status(429).json({
        error: 'Monthly quota exceeded',
        monthlySpend: monthlySpend,
        quota: userQuota,
      });
    }

    req.remainingQuota = userQuota - monthlySpend;
    next();
  }

  async recordCost(taskId, actualCost) {
    await pool.query(
      `UPDATE requests SET cost_estimate = $1 WHERE task_id = $2`,
      [actualCost, taskId]
    );
  }
}

module.exports = new CostManager();
```

Apply quota middleware to protected routes:

```javascript
const costManager = require('../services/costManager');

router.post(
  '/hailuo/video/create',
  verifyToken,
  costManager.enforceQuota.bind(costManager),
  async (req, res, next) => {
    // Handle request
  }
);
```

### 4. Batch Processing & Job Queue

Handle multiple requests efficiently with a job queue:

```javascript
// src/services/jobQueue.js
const Queue = require('bull'); // npm install bull

const videoQueue = new Queue('hailuo-video', {
  redis: process.env.REDIS_URL,
});

videoQueue.process(async (job) => {
  const { userId, imageUrl, prompt } = job.data;

  try {
    const result = await minimaxService.callHailuoVideoAPI({
      imageUrl,
      prompt,
    });

    return result;
  } catch (err) {
    throw err;
  }
});

videoQueue.on('completed', async (job, result) => {
  // Update database with successful result
  await pool.query(
    `UPDATE requests SET status = 'completed', result_url = $1 WHERE task_id = $2`,
    [result.result?.video_url, result.taskId]
  );
});

videoQueue.on('failed', async (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
  // Update database with error
  await pool.query(
    `UPDATE requests SET status = 'failed' WHERE id = $1`,
    [job.data.requestId]
  );
});

module.exports = videoQueue;
```

Usage in routes:

```javascript
const videoQueue = require('../services/jobQueue');

router.post('/hailuo/video/create', verifyToken, async (req, res, next) => {
  try {
    const { imageUrl, prompt } = req.body;
    const requestId = uuidv4();

    // Add job to queue
    const job = await videoQueue.add(
      { userId: req.user.userId, imageUrl, prompt, requestId },
      { delay: 0, attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    );

    // Store in database
    await pool.query(
      `INSERT INTO requests (id, user_id, service, model, task_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [requestId, req.user.userId, 'minimax', 'hailuo-2.3', job.id, 'queued']
    );

    res.json({ requestId, jobId: job.id, status: 'queued' });
  } catch (err) {
    next(err);
  }
});
```

### 5. Multi-Provider Support

Extend your playground to support multiple AI providers:

```javascript
// src/services/apiGateway.js
const minimaxService = require('./minimax');
const huggingfaceService = require('./huggingface');
const openaiService = require('./openai');

class APIGateway {
  async routeRequest(provider, model, params) {
    const providers = {
      minimax: minimaxService,
      huggingface: huggingfaceService,
      openai: openaiService,
    };

    const service = providers[provider];
    if (!service) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    return await service.call(model, params);
  }

  async getProviderStats() {
    return {
      minimax: {
        models: ['hailuo-2.3', 'emohawk'],
        pricing: 'per-token',
        available: true,
      },
      huggingface: {
        models: ['stable-diffusion-3', 'flux-dev'],
        pricing: 'per-inference',
        available: true,
      },
      openai: {
        models: ['dall-e-3', 'gpt-4-vision'],
        pricing: 'per-call',
        available: true,
      },
    };
  }
}

module.exports = new APIGateway();
```

### 6. Advanced Analytics & Reporting

Build analytics to understand API usage patterns:

```javascript
// src/services/analytics.js
const pool = require('../config/database');

class Analytics {
  async getUserAnalytics(userId, days = 30) {
    const result = await pool.query(
      `SELECT 
         DATE(created_at) as date,
         COUNT(*) as request_count,
         SUM(cost_estimate) as daily_cost,
         model,
         status
       FROM requests
       WHERE user_id = $1 
       AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at), model, status
       ORDER BY date DESC`,
      [userId]
    );

    return result.rows;
  }

  async getProviderMetrics(days = 30) {
    const result = await pool.query(
      `SELECT 
         service,
         model,
         COUNT(*) as total_requests,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
         COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
         AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time_seconds,
         SUM(cost_estimate) as total_cost
       FROM requests
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY service, model`,
      []
    );

    return result.rows;
  }

  async getMostUsedModels(limit = 10) {
    const result = await pool.query(
      `SELECT 
         model,
         COUNT(*) as usage_count,
         SUM(cost_estimate) as total_cost
       FROM requests
       GROUP BY model
       ORDER BY usage_count DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }
}

module.exports = new Analytics();
```

---

## Performance Optimization

### 1. Database Query Optimization

Add proper indexing:

```sql
-- Analyze slow queries
EXPLAIN ANALYZE SELECT * FROM requests WHERE user_id = 1 AND status = 'completed';

-- Add strategic indexes
CREATE INDEX idx_requests_user_status ON requests(user_id, status);
CREATE INDEX idx_requests_created_date ON requests(created_at);
CREATE INDEX idx_requests_service_model ON requests(service, model);

-- Monitor index usage
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
ORDER BY idx_scan DESC;
```

### 2. Connection Pooling Optimization

Configure optimal pool settings:

```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                      // Maximum connections
  min: 5,                        // Minimum idle connections
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Timeout for acquiring connection
  maxUses: 7200,                // Recycle connections after 7200 uses
});
```

### 3. Response Compression

Enable gzip compression:

```javascript
const compression = require('compression');

app.use(compression({
  level: 6,
  threshold: 1024, // Only compress responses > 1KB
}));
```

### 4. API Response Pagination

Implement pagination for large datasets:

```javascript
router.get('/requests', verifyToken, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM requests WHERE user_id = $1',
      [req.user.userId]
    );

    const result = await pool.query(
      `SELECT * FROM requests WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [req.user.userId, limit, offset]
    );

    res.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});
```

---

## Scaling Strategies

### 1. Horizontal Scaling on Render

Use Render's auto-scaling features:

```yaml
# render.yaml with auto-scaling
services:
  - type: web
    name: ai-api-playground
    plan: starter  # Paid plan supports auto-scaling
    minInstances: 1
    maxInstances: 5
    scaling:
      cpu: 50
      memory: 75
```

### 2. Load Balancing with Multiple Instances

Configure sticky sessions for stateful operations:

```javascript
const sessionMiddleware = require('express-session');
const RedisStore = require('connect-redis').default;
const redis = require('redis');

const redisClient = redis.createClient();
const store = new RedisStore({ client: redisClient });

app.use(sessionMiddleware({
  store,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
  },
}));
```

### 3. Database Replication

For high-traffic scenarios, consider read replicas:

```javascript
// src/config/database.js - Read/Write splitting
const writePool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const readPool = new Pool({
  connectionString: process.env.DATABASE_READ_REPLICA_URL,
});

// Use read pool for GET requests
app.get('/requests', (req, res) => {
  readPool.query(...); // Non-critical reads
});

// Use write pool for mutations
app.post('/request', (req, res) => {
  writePool.query(...); // Critical writes
});
```

---

## Monitoring & Observability

### 1. Structured Logging with Winston

```javascript
// src/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.json(),
  defaultMeta: { service: 'ai-api-playground' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

module.exports = logger;
```

### 2. Application Performance Monitoring

Integrate with services like Datadog or New Relic:

```javascript
const newrelic = require('newrelic');

router.post('/hailuo/video/create', verifyToken, async (req, res, next) => {
  const transaction = newrelic.getTransaction();
  
  try {
    // Custom transaction names for better APM insights
    transaction.setName('POST /api/playground/hailuo/video/create');
    
    const result = await minimaxService.callHailuoVideoAPI(req.body);
    
    // Track custom metric
    newrelic.recordMetric('Custom/VideoGeneration/Success', 1);
    
    res.json(result);
  } catch (err) {
    newrelic.recordMetric('Custom/VideoGeneration/Failure', 1);
    next(err);
  }
});
```

---

## Security Hardening

### 1. Rate Limiting by User Tier

```javascript
const tierLimits = {
  free: { requests: 10, window: 3600 }, // 10/hour
  pro: { requests: 1000, window: 3600 }, // 1000/hour
  enterprise: { requests: 10000, window: 3600 }, // 10000/hour
};

const tieredRateLimiter = (req, res, next) => {
  const userTier = req.user.tier || 'free';
  const limit = tierLimits[userTier];

  // Apply rate limiting based on tier...
};
```

### 2. API Key Rotation

```javascript
// src/routes/api-keys.js
router.post('/rotate', verifyToken, async (req, res, next) => {
  try {
    const oldKey = req.user.apiKey;
    const newKey = crypto.randomBytes(32).toString('hex');

    await pool.query(
      'UPDATE users SET api_key = $1, api_key_rotated_at = NOW() WHERE id = $2',
      [newKey, req.user.userId]
    );

    // Invalidate old tokens
    await cacheManager.invalidate(`user:${req.user.userId}:*`);

    res.json({ newKey, message: 'API key rotated successfully' });
  } catch (err) {
    next(err);
  }
});
```

### 3. Request Signing & Verification

```javascript
const crypto = require('crypto');

function signRequest(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

function verifyRequest(payload, signature, secret) {
  const expectedSignature = signRequest(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## Deployment Checklist

- [ ] All environment variables configured in Render
- [ ] Database migrations run successfully
- [ ] SSL/TLS certificates active
- [ ] Health check endpoint responding
- [ ] Rate limiting enabled
- [ ] Error logging configured
- [ ] Monitoring/APM setup complete
- [ ] Security headers configured
- [ ] CORS properly configured
- [ ] Database backups automated
- [ ] Cost alerts set up
- [ ] Load testing completed
- [ ] Documentation updated

---

## Cost Estimation (Monthly)

| Component | Free Tier | Starter | Pro |
|-----------|-----------|---------|-----|
| Render Web Service | $0 | $7 | $25 |
| PostgreSQL | $0 | $7 | $50+ |
| Redis (if needed) | - | $6 | $20+ |
| **Total Infrastructure** | **$0** | **$20** | **$95+** |
| Minimax API (est. 1000 calls/month @ $0.49/call) | - | $490 | $4900+ |
| **Total Monthly** | **~$490** | **~$510** | **~$4,995+** |

---

## References

- [Bull Queue Documentation](https://github.com/OptimalBits/bull)
- [Winston Logger Documentation](https://github.com/winstonjs/winston)
- [Render Scaling Guide](https://render.com/docs/scaling)
- [PostgreSQL Performance Tuning](https://www.postgresql.org/docs/current/performance.html)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)