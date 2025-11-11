// Production Configuration for AI API Playground Backend
// This file contains production-specific configuration settings

module.exports = {
  // Server Configuration
  server: {
    port: process.env.PORT || 10000,
    host: process.env.HOST || '0.0.0.0',
    cors: {
      origin: process.env.CORS_ORIGIN || 'https://ai-api-playground-frontend.onrender.com',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    },
    trustProxy: true,
    compression: true,
    etag: true
  },

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    pool: {
      min: 2,
      max: 10,
      acquire: 30000,
      idle: 10000
    },
    logging: process.env.DB_LOGGING === 'true' || false,
    retry: {
      max: 3,
      timeout: 5000
    }
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL,
    tls: process.env.REDIS_URL && process.env.REDIS_URL.includes('rediss://') ? {
      rejectUnauthorized: false
    } : undefined,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    algorithm: 'HS256',
    issuer: 'ai-api-playground',
    audience: 'ai-api-playground-users'
  },

  // Security Configuration
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    sessionSecret: process.env.SESSION_SECRET,
    apiKeyEncryptionKey: process.env.API_KEY_ENCRYPTION_KEY,
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      redisEnabled: process.env.RATE_LIMIT_REDIS_ENABLED === 'true',
      standard: parseInt(process.env.RATE_LIMIT_STANDARD) || 100,
      premium: parseInt(process.env.RATE_LIMIT_PREMIUM) || 1000
    },
    cors: {
      enabled: true,
      credentials: true
    },
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", process.env.CORS_ORIGIN || 'https://ai-api-playground-frontend.onrender.com']
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      frameguard: {
        action: 'deny'
      }
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log',
    requestsToFile: process.env.LOG_REQUESTS_TO_FILE === 'true',
    requestsToConsole: process.env.LOG_REQUESTS_TO_CONSOLE === 'true',
    requestLevel: process.env.REQUEST_LOG_LEVEL || 'info',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING === 'true',
    enableAnalytics: process.env.ENABLE_ANALYTICS === 'true',
    format: 'json',
    timestamp: true,
    colorize: false,
    maxFiles: 10,
    maxSize: '10m'
  },

  // AI Service Configuration
  ai: {
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'minimax',
    defaultModel: process.env.AI_DEFAULT_MODEL || 'abab5.5-chat',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 8192,
    maxRetries: parseInt(process.env.AI_MAX_RETRIES) || 3,
    timeout: 30000,
    providers: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        enabled: !!process.env.OPENAI_API_KEY
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        enabled: !!process.env.ANTHROPIC_API_KEY
      },
      minimax: {
        apiKey: process.env.MINIMAX_API_KEY,
        groupId: process.env.MINIMAX_GROUP_ID,
        enabled: process.env.ENABLE_MINIMAX_INTEGRATION === 'true' && !!process.env.MINIMAX_API_KEY,
        baseURL: process.env.MINIMAX_API_BASE || 'https://api.minimax.chat/v1',
        videoBaseURL: process.env.MINIMAX_VIDEO_API_BASE || 'https://api.minimax.chat/v1',
        timeout: parseInt(process.env.MINIMAX_API_TIMEOUT) || 30000,
        maxRetries: parseInt(process.env.MINIMAX_MAX_RETRIES) || 3,
        retryDelay: parseInt(process.env.MINIMAX_RETRY_DELAY) || 1000,
        exponentialBackoff: process.env.MINIMAX_EXPONENTIAL_BACKOFF === 'true',
        maxBackoffDelay: parseInt(process.env.MINIMAX_MAX_BACKOFF_DELAY) || 30000,
        maxConcurrentJobs: parseInt(process.env.MINIMAX_MAX_CONCURRENT_JOBS) || 3,
        statusCheckInterval: parseInt(process.env.MINIMAX_STATUS_CHECK_INTERVAL) || 5000,
        maxStatusCheckAttempts: parseInt(process.env.MINIMAX_MAX_STATUS_CHECK_ATTEMPTS) || 60,
        webhookTimeout: parseInt(process.env.MINIMAX_WEBHOOK_TIMEOUT) || 30000,
        rateLimit: {
          requestsPerMinute: parseInt(process.env.MINIMAX_REQUESTS_PER_MINUTE) || 10,
          requestsPerHour: parseInt(process.env.MINIMAX_REQUESTS_PER_HOUR) || 100,
          requestsPerDay: parseInt(process.env.MINIMAX_REQUESTS_PER_DAY) || 1000,
          tokensPerMinute: parseInt(process.env.MINIMAX_TOKENS_PER_MINUTE) || 10000,
          tokensPerHour: parseInt(process.env.MINIMAX_TOKENS_PER_HOUR) || 100000,
          tokensPerDay: parseInt(process.env.MINIMAX_TOKENS_PER_DAY) || 1000000
        },
        webhook: {
          enabled: process.env.MINIMAX_WEBHOOK_ENABLED === 'true',
          secret: process.env.MINIMAX_WEBHOOK_SECRET,
          url: process.env.MINIMAX_WEBHOOK_URL
        },
        logging: {
          logRequests: process.env.MINIMAX_LOG_REQUESTS === 'true',
          logResponses: process.env.MINIMAX_LOG_RESPONSES === 'true',
          logErrors: process.env.MINIMAX_LOG_ERRORS === 'true',
          logHeaders: process.env.MINIMAX_LOG_HEADERS === 'true',
          logPayload: process.env.MINIMAX_LOG_PAYLOAD === 'true',
          maxLogPayloadSize: parseInt(process.env.MINIMAX_MAX_LOG_PAYLOAD_SIZE) || 10000
        },
        validation: {
          maxPromptLength: parseInt(process.env.MINIMAX_MAX_PROMPT_LENGTH) || 5000,
          maxNegativePromptLength: parseInt(process.env.MINIMAX_MAX_NEGATIVE_PROMPT_LENGTH) || 1000,
          maxBatchSize: parseInt(process.env.MINIMAX_MAX_BATCH_SIZE) || 10,
          maxImageSize: parseInt(process.env.MINIMAX_MAX_IMAGE_SIZE) || 10485760,
          maxVideoSize: parseInt(process.env.MINIMAX_MAX_VIDEO_SIZE) || 104857600
        },
        errorHandling: {
          maxRetryAttempts: parseInt(process.env.MINIMAX_MAX_RETRY_ATTEMPTS) || 3,
          circuitBreakerThreshold: parseInt(process.env.MINIMAX_CIRCUIT_BREAKER_THRESHOLD) || 5,
          circuitBreakerTimeout: parseInt(process.env.MINIMAX_CIRCUIT_BREAKER_TIMEOUT) || 60000
        }
      }
    }
  },

  // Quota Configuration
  quota: {
    default: {
      requestsPerMinute: parseInt(process.env.DEFAULT_REQUESTS_PER_MINUTE) || 60,
      requestsPerHour: parseInt(process.env.DEFAULT_REQUESTS_PER_HOUR) || 1000,
      requestsPerDay: parseInt(process.env.DEFAULT_REQUESTS_PER_DAY) || 10000,
      tokensPerMinute: parseInt(process.env.DEFAULT_TOKENS_PER_MINUTE) || 10000,
      tokensPerHour: parseInt(process.env.DEFAULT_TOKENS_PER_HOUR) || 100000,
      tokensPerDay: parseInt(process.env.DEFAULT_TOKENS_PER_DAY) || 1000000,
      concurrentRequests: parseInt(process.env.DEFAULT_CONCURRENT_REQUESTS) || 5
    }
  },

  // Webhook Configuration
  webhooks: {
    enabled: process.env.ENABLE_WEBHOOKS === 'true',
    maxPerUser: parseInt(process.env.WEBHOOK_MAX_PER_USER) || 10,
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES) || 3,
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 10000,
    signingEnabled: process.env.WEBHOOK_SIGNING_ENABLED === 'true',
    secret: process.env.WEBHOOK_SECRET,
    retryStrategy: 'exponential',
    maxConcurrent: 5
  },

  // Feature Flags
  features: {
    webhooks: process.env.ENABLE_WEBHOOKS === 'true',
    usageTracking: process.env.ENABLE_USAGE_TRACKING === 'true',
    minimaxIntegration: process.env.ENABLE_MINIMAX_INTEGRATION === 'true',
    analytics: process.env.ENABLE_ANALYTICS === 'true',
    requestLogging: process.env.ENABLE_REQUEST_LOGGING === 'true',
    rateLimiting: process.env.API_RATE_LIMIT_ENABLED === 'true',
    apiGateway: process.env.API_GATEWAY_ENABLED === 'true'
  },

  // Monitoring Configuration
  monitoring: {
    enabled: true,
    healthCheckInterval: 30000,
    metrics: {
      enabled: true,
      endpoint: '/metrics',
      port: 9090
    },
    tracing: {
      enabled: false,
      serviceName: 'ai-api-playground',
      sampleRate: 0.1
    }
  },

  // Performance Configuration
  performance: {
    compression: true,
    etag: true,
    trustProxy: true,
    maxPayloadSize: '10mb',
    timeout: 30000,
    keepAlive: true,
    keepAliveTimeout: 5000
  },

  // API Configuration
  api: {
    version: process.env.API_VERSION || 'v1',
    rateLimitEnabled: process.env.API_RATE_LIMIT_ENABLED === 'true',
    gatewayEnabled: process.env.API_GATEWAY_ENABLED === 'true',
    documentation: {
      enabled: true,
      endpoint: '/api-docs'
    }
  }
};