const { RateLimiterRedis } = require('rate-limiter-flexible');
const redis = require('redis');
const logger = require('../utils/logger');

// Create Redis client for rate limiting (only if Redis is configured)
let redisClient = null;
let redisAvailable = false;

if (process.env.REDIS_URL) {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            logger.warn('Redis max reconnection attempts reached, rate limiting disabled');
            redisAvailable = false;
            return new Error('Redis connection failed');
          }
          return Math.min(retries * 50, 500);
        }
      }
    });

    redisClient.on('error', (err) => {
      logger.warn('Redis Client Error (rate limiting disabled)', err.message);
      redisAvailable = false;
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected for rate limiting');
      redisAvailable = true;
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis client reconnecting...');
    });

    // Connect to Redis
    (async () => {
      try {
        await redisClient.connect();
        logger.info('Connected to Redis for rate limiting');
        redisAvailable = true;
      } catch (err) {
        logger.warn('Failed to connect to Redis, rate limiting will be disabled', err.message);
        redisAvailable = false;
      }
    })();
  } catch (err) {
    logger.warn('Failed to initialize Redis client, rate limiting disabled', err.message);
    redisAvailable = false;
  }
} else {
  logger.info('Redis not configured, rate limiting will be disabled');
  redisAvailable = false;
}

// Rate limit configurations for different endpoints and user types
const RATE_LIMIT_CONFIGS = {
  // Authentication endpoints
  auth: {
    free: { points: 5, duration: 15 * 60 }, // 5 requests per 15 minutes
    basic: { points: 10, duration: 15 * 60 },
    pro: { points: 20, duration: 15 * 60 },
    enterprise: { points: 50, duration: 15 * 60 }
  },
  // AI endpoints
  ai: {
    free: { points: 10, duration: 60 }, // 10 requests per minute
    basic: { points: 30, duration: 60 },
    pro: { points: 100, duration: 60 },
    enterprise: { points: 500, duration: 60 }
  },
  // Admin endpoints
  admin: {
    admin: { points: 100, duration: 60 } // 100 requests per minute for admins
  },
  // API key endpoints
  apiKey: {
    free: { points: 100, duration: 60 },
    basic: { points: 300, duration: 60 },
    pro: { points: 1000, duration: 60 },
    enterprise: { points: 5000, duration: 60 }
  },
  // General endpoints
  general: {
    free: { points: 60, duration: 60 },
    basic: { points: 120, duration: 60 },
    pro: { points: 300, duration: 60 },
    enterprise: { points: 600, duration: 60 }
  }
};

// Block durations for different violation levels
const BLOCK_DURATIONS = {
  soft: 15 * 60,      // 15 minutes
  medium: 60 * 60,    // 1 hour
  hard: 24 * 60 * 60, // 24 hours
  critical: 7 * 24 * 60 * 60 // 7 days
};

// Create rate limiters for different strategies
class RateLimitManager {
  constructor() {
    this.limiters = new Map();
    this.redisAvailable = redisAvailable;
    if (this.redisAvailable) {
      this.initializeLimiters();
    }
  }

  initializeLimiters() {
    if (!this.redisAvailable) return;

    // Per-IP limiters
    for (const [endpoint, tiers] of Object.entries(RATE_LIMIT_CONFIGS)) {
      for (const [tier, config] of Object.entries(tiers)) {
        const key = `ip:${endpoint}:${tier}`;
        this.limiters.set(key, new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: `rl:${key}`,
          points: config.points,
          duration: config.duration,
          blockDuration: BLOCK_DURATIONS.soft,
        }));
      }
    }

    // Per-user limiters (for authenticated users)
    for (const [endpoint, tiers] of Object.entries(RATE_LIMIT_CONFIGS)) {
      for (const [tier, config] of Object.entries(tiers)) {
        const key = `user:${endpoint}:${tier}`;
        this.limiters.set(key, new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: `rl:${key}`,
          points: config.points * 2, // Double limit for authenticated users
          duration: config.duration,
          blockDuration: BLOCK_DURATIONS.medium,
        }));
      }
    }

    // Per-API key limiters
    for (const [endpoint, tiers] of Object.entries(RATE_LIMIT_CONFIGS)) {
      for (const [tier, config] of Object.entries(tiers)) {
        const key = `apikey:${endpoint}:${tier}`;
        this.limiters.set(key, new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: `rl:${key}`,
          points: config.points * 3, // Triple limit for API keys
          duration: config.duration,
          blockDuration: BLOCK_DURATIONS.hard,
        }));
      }
    }

    // Sliding window limiters for precise rate limiting
    this.slidingWindowLimiter = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl:sliding',
      points: parseInt(process.env.SLIDING_WINDOW_MAX_REQUESTS) || 1000,
      duration: parseInt(process.env.SLIDING_WINDOW_DURATION) || 3600, // 1 hour
      blockDuration: BLOCK_DURATIONS.critical,
    });
  }

  getUserTier(user) {
    if (!user) return 'free';
    return user.tier || user.subscription_tier || 'free';
  }

  getEndpointType(req) {
    const path = req.path.toLowerCase();
    
    if (path.includes('/auth/') || path.includes('/login') || path.includes('/register')) {
      return 'auth';
    }
    if (path.includes('/ai/') || path.includes('/chat') || path.includes('/generate')) {
      return 'ai';
    }
    if (path.includes('/admin/')) {
      return 'admin';
    }
    if (path.includes('/api/') && req.headers['x-api-key']) {
      return 'apiKey';
    }
    return 'general';
  }

  getIdentifier(req) {
    // Prioritize API key
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (apiKey) {
      return { type: 'apikey', value: apiKey };
    }
    
    // Then user ID for authenticated users
    if (req.user && req.user.id) {
      return { type: 'user', value: req.user.id };
    }
    
    // Fall back to IP address
    const ip = req.ip || req.connection.remoteAddress || 
               req.socket.remoteAddress || req.connection.socket?.remoteAddress;
    return { type: 'ip', value: ip };
  }

  async checkLimit(req, endpointType, identifier) {
    if (!this.redisAvailable) {
      // If Redis is not available, allow all requests
      return {
        allowed: true,
        remaining: 9999,
        resetTime: new Date(Date.now() + 3600000),
        limit: 10000
      };
    }

    const userTier = req.user ? this.getUserTier(req.user) : 'free';
    const limiterKey = `${identifier.type}:${endpointType}:${userTier}`;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) {
      logger.warn(`Rate limiter not found for ${limiterKey}, allowing request`);
      return {
        allowed: true,
        remaining: 9999,
        resetTime: new Date(Date.now() + 3600000),
        limit: 10000
      };
    }

    const key = `${identifier.value}:${endpointType}`;
    
    try {
      const result = await limiter.consume(key);
      return {
        allowed: true,
        remaining: result.remainingPoints,
        resetTime: new Date(Date.now() + result.msBeforeNext),
        limit: limiter.points
      };
    } catch (rateLimiterRes) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(Date.now() + rateLimiterRes.msBeforeNext),
        limit: limiter.points,
        blockDuration: rateLimiterRes.msBeforeNext
      };
    }
  }

  async checkSlidingWindow(req, identifier) {
    if (!this.redisAvailable || !this.slidingWindowLimiter) {
      // If Redis is not available, allow all requests
      return {
        allowed: true,
        remaining: 9999,
        resetTime: new Date(Date.now() + 3600000)
      };
    }

    const key = `sw:${identifier.value}`;
    
    try {
      const result = await this.slidingWindowLimiter.consume(key);
      return {
        allowed: true,
        remaining: result.remainingPoints,
        resetTime: new Date(Date.now() + result.msBeforeNext)
      };
    } catch (rateLimiterRes) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(Date.now() + rateLimiterRes.msBeforeNext),
        blockDuration: rateLimiterRes.msBeforeNext
      };
    }
  }

  async blockIdentifier(identifier, duration, reason = 'manual_block') {
    if (!this.redisAvailable || !redisClient) {
      logger.warn('Redis not available, cannot block identifier');
      return;
    }

    try {
      const blockKey = `block:${identifier.type}:${identifier.value}`;
      const blockData = {
        reason,
        blockedAt: new Date().toISOString(),
        duration
      };
      
      await redisClient.setEx(blockKey, duration, JSON.stringify(blockData));
      logger.warn(`Identifier blocked: ${identifier.type}:${identifier.value}`, blockData);
    } catch (err) {
      logger.error('Failed to block identifier', err);
    }
  }

  async isBlocked(identifier) {
    if (!this.redisAvailable || !redisClient) {
      return { isBlocked: false };
    }

    try {
      const blockKey = `block:${identifier.type}:${identifier.value}`;
      const blockData = await redisClient.get(blockKey);
      
      if (!blockData) return { isBlocked: false };
      
      const blockInfo = JSON.parse(blockData);
      const blockedAt = new Date(blockInfo.blockedAt);
      const expiresAt = new Date(blockedAt.getTime() + blockInfo.duration * 1000);
      
      return {
        isBlocked: true,
        reason: blockInfo.reason,
        blockedAt: blockInfo.blockedAt,
        expiresAt: expiresAt.toISOString()
      };
    } catch (err) {
      logger.error('Failed to check block status', err);
      return { isBlocked: false };
    }
  }
}

// Initialize rate limit manager
const rateLimitManager = new RateLimitManager();

// Main rate limiting middleware
const rateLimitMiddleware = async (req, res, next) => {
  try {
    // Get identifier (API key, user ID, or IP)
    const identifier = rateLimitManager.getIdentifier(req);
    
    // Check if identifier is blocked
    const blockInfo = await rateLimitManager.isBlocked(identifier);
    if (blockInfo.isBlocked) {
      logger.warn(`Blocked ${identifier.type} attempted access: ${identifier.value}`, blockInfo);
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access temporarily blocked due to suspicious activity',
          code: 'ACCESS_BLOCKED',
          details: {
            reason: blockInfo.reason,
            expiresAt: blockInfo.expiresAt
          }
        }
      });
    }

    // Determine endpoint type
    const endpointType = rateLimitManager.getEndpointType(req);
    
    // Check rate limits
    const limitResult = await rateLimitManager.checkLimit(req, endpointType, identifier);
    const slidingWindowResult = await rateLimitManager.checkSlidingWindow(req, identifier);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limitResult.limit);
    res.setHeader('X-RateLimit-Remaining', limitResult.remaining);
    res.setHeader('X-RateLimit-Reset', limitResult.resetTime.toISOString());
    res.setHeader('X-RateLimit-Endpoint', endpointType);
    res.setHeader('X-RateLimit-Identifier', identifier.type);

    // Check if any limit was exceeded
    if (!limitResult.allowed || !slidingWindowResult.allowed) {
      const violation = !limitResult.allowed ? limitResult : slidingWindowResult;
      
      logger.warn(`Rate limit exceeded for ${identifier.type}:${identifier.value}`, {
        endpoint: endpointType,
        limit: violation.limit,
        blockDuration: violation.blockDuration
      });

      // Block the identifier for repeated violations
      if (violation.blockDuration > BLOCK_DURATIONS.medium * 1000) {
        await rateLimitManager.blockIdentifier(
          identifier, 
          BLOCK_DURATIONS.hard, 
          'rate_limit_violation'
        );
      }

      return res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          details: {
            limit: violation.limit,
            resetTime: violation.resetTime.toISOString(),
            blockDuration: violation.blockDuration,
            identifier: identifier.type
          }
        }
      });
    }

    // Log rate limit usage for monitoring
    logger.debug(`Rate limit check passed for ${identifier.type}:${identifier.value}`, {
      endpoint: endpointType,
      remaining: limitResult.remaining,
      tier: req.user ? rateLimitManager.getUserTier(req.user) : 'free'
    });

    next();
  } catch (error) {
    logger.error('Rate limiting middleware error:', error);
    
    // Fail open - allow request if rate limiting fails
    logger.warn('Rate limiting failed, allowing request');
    next();
  }
};

// Export for use in other modules
module.exports = rateLimitMiddleware;
module.exports.rateLimitManager = rateLimitManager;
module.exports.RATE_LIMIT_CONFIGS = RATE_LIMIT_CONFIGS;
module.exports.BLOCK_DURATIONS = BLOCK_DURATIONS;