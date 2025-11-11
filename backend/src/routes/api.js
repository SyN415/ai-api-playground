const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const quotaService = require('../services/quotaService');
const auth = require('../middleware/auth');
const { query, validationResult } = require('express-validator');
const responseFormatter = require('../utils/responseFormatter');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json(
      responseFormatter.validationError(errors.array()).body
    );
  }
  next();
};

/**
 * @route   GET /api/v1/
 * @desc    API gateway info
 * @access  Public
 */
router.get('/', (req, res) => {
  res.json(responseFormatter.apiInfo({
    message: 'AI API Playground Gateway'
  }).body);
});

/**
 * @route   GET /api/v1/usage
 * @desc    Get current user's usage statistics
 * @access  Private
 */
router.get('/usage',
  auth.verifyToken,
  query(['startDate', 'endDate', 'provider'])
    .optional()
    .isString(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { startDate, endDate, provider } = req.query;

      const usage = await aiService.getUsageStats(userId, {
        startDate,
        endDate,
        provider
      });

      res.json(responseFormatter.success(usage).body);

    } catch (error) {
      logger.error('Get usage failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get usage statistics',
          code: 'GET_USAGE_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/quota
 * @desc    Get current user's quota information
 * @access  Private
 */
router.get('/quota',
  auth.verifyToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const quotaInfo = quotaService.getQuotaInfo(userId);

      res.json(responseFormatter.success(quotaInfo).body);

    } catch (error) {
      logger.error('Get quota failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get quota information',
          code: 'GET_QUOTA_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   POST /api/v1/quota/reset
 * @desc    Reset current user's quota counters
 * @access  Private
 */
router.post('/quota/reset',
  auth.verifyToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const quota = quotaService.resetUserQuota(userId);

      res.json(responseFormatter.success(quota, {
        message: 'Quota reset successfully'
      }).body);

    } catch (error) {
      logger.error('Reset quota failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to reset quota',
          code: 'RESET_QUOTA_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/models
 * @desc    Get all available AI models
 * @access  Public
 */
router.get('/models', async (req, res) => {
  try {
    const models = aiService.getAvailableModels();
    
    res.json(responseFormatter.success(models).body);

  } catch (error) {
    logger.error('Get models failed', { error: error.message });

    res.status(500).json(
      responseFormatter.error(error, {
        message: 'Failed to get available models',
        code: 'GET_MODELS_FAILED'
      }).body
    );
  }
});

/**
 * @route   GET /api/v1/models/:provider
 * @desc    Get models for specific provider
 * @access  Public
 */
router.get('/models/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const providerInfo = aiService.getProviderInfo(provider);
    
    res.json(responseFormatter.success(providerInfo).body);

  } catch (error) {
    logger.error('Get provider models failed', {
      provider: req.params.provider,
      error: error.message
    });

    res.status(error.statusCode || 500).json(
      responseFormatter.error(error, {
        message: error.message,
        statusCode: error.statusCode || 500,
        code: error.code || 'GET_PROVIDER_MODELS_FAILED'
      }).body
    );
  }
});

/**
 * @route   GET /api/v1/health
 * @desc    Get API health status
 * @access  Public
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      services: {
        ai: await aiService.healthCheck(),
        quota: quotaService.healthCheck()
      }
    };

    const statusCode = health.services.ai.overall === 'healthy' ? 200 : 503;

    res.status(statusCode).json(responseFormatter.success(health).body);

  } catch (error) {
    logger.error('Health check failed', { error: error.message });

    res.status(500).json(
      responseFormatter.error(error, {
        message: 'Health check failed',
        code: 'HEALTH_CHECK_FAILED'
      }).body
    );
  }
});

/**
 * @route   GET /api/v1/docs
 * @desc    Get API documentation
 * @access  Public
 */
router.get('/docs', (req, res) => {
  const docs = {
    name: 'AI API Playground',
    version: '1.0.0',
    description: 'A comprehensive API gateway for AI services',
    baseUrl: '/api/v1',
    authentication: {
      methods: ['JWT Bearer Token', 'API Key'],
      header: 'Authorization: Bearer <token>',
      apiKeyHeader: 'X-API-Key: <api-key>'
    },
    endpoints: {
      auth: {
        base: '/api/auth',
        endpoints: [
          'POST /register - Register new user',
          'POST /login - Login user',
          'POST /refresh - Refresh access token',
          'POST /logout - Logout user',
          'POST /reset-password - Request password reset',
          'POST /reset-password/confirm - Confirm password reset'
        ]
      },
      ai: {
        base: '/api/v1/ai',
        endpoints: [
          'POST /generate - Generate AI content',
          'POST /embeddings - Generate embeddings',
          'POST /images - Generate images',
          'GET /status/:taskId - Get task status',
          'GET /history - Get user history',
          'GET /models - Get available models',
          'GET /models/:provider - Get provider models',
          'GET /usage - Get usage statistics'
        ]
      },
      webhooks: {
        base: '/api/v1/webhooks',
        endpoints: [
          'POST / - Register webhook',
          'GET / - List webhooks',
          'GET /:id - Get webhook details',
          'PUT /:id - Update webhook',
          'DELETE /:id - Delete webhook',
          'GET /:id/deliveries - Get delivery history',
          'POST /:id/test - Test webhook',
          'GET /events - List available events'
        ]
      },
      admin: {
        base: '/api/admin',
        endpoints: [
          'GET /users - List users',
          'GET /users/:id - Get user details',
          'PUT /users/:id - Update user',
          'DELETE /users/:id - Delete user',
          'GET /users/:id/quota - Get user quota',
          'PUT /users/:id/quota - Update user quota',
          'POST /users/:id/quota/reset - Reset user quota',
          'GET /system/stats - Get system stats',
          'GET /system/health - Get system health',
          'POST /system/cleanup - Trigger system cleanup',
          'GET /analytics - Get analytics data'
        ]
      },
      general: {
        base: '/api/v1',
        endpoints: [
          'GET / - API info',
          'GET /usage - Get user usage',
          'GET /quota - Get user quota',
          'POST /quota/reset - Reset user quota',
          'GET /models - Get all models',
          'GET /models/:provider - Get provider models',
          'GET /health - Health check',
          'GET /docs - API documentation'
        ]
      }
    },
    rateLimiting: {
      description: 'Rate limits are applied per user',
      limits: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000,
        tokensPerMinute: 10000,
        tokensPerHour: 100000,
        tokensPerDay: 1000000
      }
    },
    features: [
      'Multiple AI provider support (Minimax, OpenAI, Anthropic)',
      'Comprehensive webhook system',
      'Advanced quota management',
      'Real-time rate limiting',
      'JWT authentication with refresh tokens',
      'API key authentication',
      'Request/response logging',
      'Admin management interface',
      'Usage analytics and reporting'
    ],
    supportedModels: [
      'Minimax: abab5.5-chat, abab5.5s-chat, hailuo-2.3',
      'OpenAI: gpt-4, gpt-3.5-turbo (when configured)',
      'Anthropic: claude-3 (when configured)'
    ]
  };

  res.json(responseFormatter.success(docs).body);
});

module.exports = router;