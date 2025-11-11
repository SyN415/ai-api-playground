// Production Configuration for AI API Playground Frontend
// This file contains production-specific configuration settings

const config = {
  // API Configuration
  api: {
    baseURL: process.env.REACT_APP_API_BASE_URL || 'https://your-backend-url.onrender.com',
    version: process.env.REACT_APP_API_VERSION || 'v1',
    timeout: parseInt(process.env.REACT_APP_API_TIMEOUT) || 30000,
    retries: 3,
    retryDelay: 1000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  },

  // Application Configuration
  app: {
    name: process.env.REACT_APP_NAME || 'AI API Playground',
    version: process.env.REACT_APP_VERSION || '1.0.0',
    environment: process.env.REACT_APP_ENVIRONMENT || 'production',
    description: 'AI API Playground - Test and integrate various AI services'
  },

  // Feature Flags
  features: {
    analytics: process.env.REACT_APP_ENABLE_ANALYTICS === 'true',
    errorTracking: process.env.REACT_APP_ENABLE_ERROR_TRACKING === 'true',
    performanceMonitoring: process.env.REACT_APP_ENABLE_PERFORMANCE_MONITORING === 'true',
    minimax: process.env.REACT_APP_MINIMAX_ENABLED === 'true',
    pwa: process.env.REACT_APP_ENABLE_PWA === 'true',
    lazyLoading: process.env.REACT_APP_ENABLE_LAZY_LOADING === 'true',
    codeSplitting: process.env.REACT_APP_ENABLE_CODE_SPLITTING === 'true',
    imageOptimization: process.env.REACT_APP_IMAGE_OPTIMIZATION === 'true',
    notifications: process.env.REACT_APP_ENABLE_NOTIFICATIONS === 'true',
    darkMode: process.env.REACT_APP_ENABLE_DARK_MODE === 'true'
  },

  // UI Configuration
  ui: {
    theme: {
      default: process.env.REACT_APP_DEFAULT_THEME || 'light',
      darkMode: process.env.REACT_APP_ENABLE_DARK_MODE === 'true'
    },
    notifications: {
      enabled: process.env.REACT_APP_ENABLE_NOTIFICATIONS === 'true',
      duration: parseInt(process.env.REACT_APP_NOTIFICATION_DURATION) || 5000,
      position: 'top-right',
      maxToasts: 5
    },
    loading: {
      delay: 300,
      timeout: 10000
    },
    errors: {
      showDetails: false,
      autoClear: true,
      maxAge: 5000
    }
  },

  // Authentication Configuration
  auth: {
    tokenKey: process.env.REACT_APP_AUTH_TOKEN_KEY || 'auth_token',
    refreshTokenKey: process.env.REACT_APP_REFRESH_TOKEN_KEY || 'refresh_token',
    userKey: process.env.REACT_APP_USER_KEY || 'user_data',
    autoRefresh: true,
    refreshThreshold: 300, // Refresh token 5 minutes before expiry
    storage: 'localStorage' // or 'sessionStorage'
  },

  // API Endpoints
  endpoints: {
    auth: process.env.REACT_APP_AUTH_ENDPOINT || '/api/v1/auth',
    ai: process.env.REACT_APP_AI_ENDPOINT || '/api/v1/ai',
    webhook: process.env.REACT_APP_WEBHOOK_ENDPOINT || '/api/v1/webhooks',
    admin: process.env.REACT_APP_ADMIN_ENDPOINT || '/api/v1/admin',
    health: '/health'
  },

  // Minimax Configuration
  minimax: {
    enabled: process.env.REACT_APP_MINIMAX_ENABLED === 'true',
    defaultModel: process.env.REACT_APP_MINIMAX_DEFAULT_MODEL || 'abab5.5-chat',
    maxTokens: parseInt(process.env.REACT_APP_MINIMAX_MAX_TOKENS) || 8192,
    maxRetries: 3,
    timeout: 30000
  },

  // Rate Limiting Configuration
  rateLimit: {
    warningThreshold: parseInt(process.env.REACT_APP_RATE_LIMIT_WARNING_THRESHOLD) || 80,
    errorThreshold: parseInt(process.env.REACT_APP_RATE_LIMIT_ERROR_THRESHOLD) || 95,
    checkInterval: 60000 // Check every minute
  },

  // Webhook Configuration
  webhooks: {
    maxPerUser: parseInt(process.env.REACT_APP_WEBHOOK_MAX_PER_USER) || 10,
    timeout: parseInt(process.env.REACT_APP_WEBHOOK_TIMEOUT) || 10000,
    retryAttempts: 3
  },

  // Error Handling Configuration
  errors: {
    reporting: {
      enabled: process.env.REACT_APP_ENABLE_ERROR_TRACKING === 'true',
      endpoint: process.env.REACT_APP_ERROR_REPORTING_ENDPOINT || '/api/v1/errors',
      maxReportsPerSession: parseInt(process.env.REACT_APP_MAX_ERROR_REPORTS_PER_SESSION) || 5
    },
    display: {
      showUser: true,
      showTechnical: false,
      autoClear: true,
      maxAge: 5000
    }
  },

  // Performance Configuration
  performance: {
    lazyLoading: process.env.REACT_APP_ENABLE_LAZY_LOADING === 'true',
    codeSplitting: process.env.REACT_APP_ENABLE_CODE_SPLITTING === 'true',
    imageOptimization: process.env.REACT_APP_IMAGE_OPTIMIZATION === 'true',
    cache: {
      enabled: true,
      maxAge: 300000, // 5 minutes
      storage: 'memory'
    },
    debounce: {
      delay: 300,
      maxWait: 1000
    },
    throttle: {
      delay: 100
    }
  },

  // Security Configuration
  security: {
    csp: process.env.REACT_APP_ENABLE_CSP === 'true',
    xssProtection: process.env.REACT_APP_ENABLE_XSS_PROTECTION === 'true',
    httpsOnly: process.env.REACT_APP_ENABLE_HTTPS_ONLY === 'true',
    sanitizeInput: true,
    validateOutput: true
  },

  // Build Configuration
  build: {
    generateSourceMap: process.env.REACT_APP_GENERATE_SOURCEMAP === 'true',
    inlineRuntimeChunk: process.env.REACT_APP_INLINE_RUNTIME_CHUNK === 'true',
    imageInlineSizeLimit: parseInt(process.env.REACT_APP_IMAGE_INLINE_SIZE_LIMIT) || 10000
  },

  // PWA Configuration
  pwa: {
    enabled: process.env.REACT_APP_ENABLE_PWA === 'true',
    serviceWorkerFile: process.env.REACT_APP_SERVICE_WORKER_FILE || 'service-worker.js',
    scope: '/',
    updateStrategy: 'prompt' // or 'auto'
  },

  // External Services
  external: {
    googleAnalytics: {
      enabled: !!process.env.REACT_APP_GOOGLE_ANALYTICS_ID,
      trackingId: process.env.REACT_APP_GOOGLE_ANALYTICS_ID
    },
    sentry: {
      enabled: !!process.env.REACT_APP_SENTRY_DSN,
      dsn: process.env.REACT_APP_SENTRY_DSN
    },
    logrocket: {
      enabled: !!process.env.REACT_APP_LOGROCKET_ID,
      appId: process.env.REACT_APP_LOGROCKET_ID
    }
  },

  // Testing Configuration
  testing: {
    enabled: process.env.REACT_APP_ENABLE_TEST_MODE === 'true',
    mockData: process.env.REACT_APP_ENABLE_MOCK_DATA === 'true',
    mockApiDelay: parseInt(process.env.REACT_APP_MOCK_API_DELAY) || 500,
    debugTools: process.env.REACT_APP_ENABLE_DEBUG_TOOLS === 'true',
    testUser: {
      email: process.env.REACT_APP_TEST_USER_EMAIL || 'test@example.com',
      password: process.env.REACT_APP_TEST_USER_PASSWORD || 'test123'
    }
  },

  // Development Configuration (should be false in production)
  development: {
    mockApi: false,
    debug: false,
    reduxDevTools: false
  }
};

// Export based on environment
if (process.env.NODE_ENV === 'production') {
  module.exports = config;
} else {
  // In development, merge with development config
  const developmentConfig = {
    ...config,
    features: {
      ...config.features,
      analytics: false,
      errorTracking: false,
      performanceMonitoring: false
    },
    development: {
      mockApi: process.env.REACT_APP_ENABLE_MOCK_DATA === 'true',
      debug: process.env.REACT_APP_ENABLE_DEBUG_TOOLS === 'true',
      reduxDevTools: true
    }
  };
  module.exports = developmentConfig;
}