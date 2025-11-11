const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const auth = require('./auth');
const rateLimit = require('./rateLimit');
const { sanitizeInput } = require('./validation');

/**
 * API Gateway Middleware
 * Handles request validation, authentication, routing, and transformation
 */
class GatewayMiddleware {
  constructor() {
    this.config = {
      maxRequestSize: 10 * 1024 * 1024, // 10MB
      allowedContentTypes: ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded'],
      timeout: 30000, // 30 seconds
      enableRequestTransformation: true,
      enableResponseTransformation: true
    };
  }

  /**
   * Main gateway middleware that orchestrates the request flow
   */
  gateway = async (req, res, next) => {
    try {
      // 1. Request validation and sanitization
      await this.validateRequest(req);
      
      // 2. API key extraction and validation
      await this.extractAndValidateApiKey(req);
      
      // 3. Service routing logic
      const serviceRoute = this.determineServiceRoute(req);
      req.serviceRoute = serviceRoute;
      
      // 4. Request transformation
      if (this.config.enableRequestTransformation) {
        await this.transformRequest(req);
      }
      
      // 5. Add gateway metadata
      req.gatewayMetadata = {
        requestId: req.requestId || this.generateRequestId(),
        timestamp: new Date().toISOString(),
        service: serviceRoute.service,
        version: serviceRoute.version
      };
      
      logger.debug('Gateway processing completed', {
        requestId: req.gatewayMetadata.requestId,
        service: serviceRoute.service,
        path: req.path
      });
      
      next();
    } catch (error) {
      logger.error('Gateway middleware error:', error);
      this.handleGatewayError(error, res);
    }
  };

  /**
   * Validate incoming request
   */
  validateRequest = async (req) => {
    // Check content type
    const contentType = req.get('Content-Type') || 'application/json';
    if (!this.isAllowedContentType(contentType)) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    // Check request size
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    if (contentLength > this.config.maxRequestSize) {
      throw new Error(`Request too large: ${contentLength} bytes`);
    }

    // Validate request method
    if (!this.isAllowedMethod(req.method)) {
      throw new Error(`Method not allowed: ${req.method}`);
    }

    // Sanitize input
    sanitizeInput(req, {}, () => {});

    // Validate request parameters
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new Error(`Validation failed: ${JSON.stringify(errors.array())}`);
    }
  };

  /**
   * Extract and validate API key from request
   */
  extractAndValidateApiKey = async (req) => {
    // Try multiple sources for API key
    const apiKey = 
      req.headers['x-api-key'] ||
      req.headers['authorization']?.replace('Bearer ', '') ||
      req.query.api_key ||
      req.body.api_key;

    if (!apiKey) {
      throw new Error('API key is required');
    }

    // Validate API key format
    if (!this.isValidApiKeyFormat(apiKey)) {
      throw new Error('Invalid API key format');
    }

    // Store extracted API key
    req.apiKey = apiKey;
    req.apiKeySource = this.determineApiKeySource(req);

    logger.debug('API key extracted and validated', {
      source: req.apiKeySource,
      keyPrefix: apiKey.substring(0, 8) + '...'
    });
  };

  /**
   * Determine which service should handle the request
   */
  determineServiceRoute(req) {
    const path = req.path;
    const method = req.method;

    // Route mapping based on path patterns
    const routePatterns = [
      {
        pattern: /^\/api\/v1\/ai\/.*/,
        service: 'ai-service',
        version: 'v1',
        priority: 1
      },
      {
        pattern: /^\/api\/v1\/webhooks\/.*/,
        service: 'webhook-service',
        version: 'v1',
        priority: 1
      },
      {
        pattern: /^\/api\/v1\/admin\/.*/,
        service: 'admin-service',
        version: 'v1',
        priority: 1
      },
      {
        pattern: /^\/api\/v1\/usage/,
        service: 'usage-service',
        version: 'v1',
        priority: 2
      },
      {
        pattern: /^\/api\/v1\/quota/,
        service: 'quota-service',
        version: 'v1',
        priority: 2
      },
      {
        pattern: /^\/api\/v1\/models/,
        service: 'model-service',
        version: 'v1',
        priority: 2
      }
    ];

    // Find matching route
    for (const route of routePatterns) {
      if (route.pattern.test(path)) {
        return {
          service: route.service,
          version: route.version,
          pattern: route.pattern,
          originalPath: path
        };
      }
    }

    // Default route
    return {
      service: 'default-service',
      version: 'v1',
      pattern: /.*/,
      originalPath: path
    };
  }

  /**
   * Transform request based on service requirements
   */
  transformRequest = async (req) => {
    const serviceRoute = req.serviceRoute;
    
    switch (serviceRoute.service) {
      case 'ai-service':
        await this.transformAiRequest(req);
        break;
      case 'webhook-service':
        await this.transformWebhookRequest(req);
        break;
      case 'admin-service':
        await this.transformAdminRequest(req);
        break;
      default:
        // No transformation needed
        break;
    }
  };

  /**
   * Transform AI service requests
   */
  transformAiRequest = async (req) => {
    // Add default parameters if not present
    if (!req.body.temperature && req.path.includes('/generate')) {
      req.body.temperature = 0.7;
    }

    // Add model context
    if (!req.body.model && req.body.prompt) {
      req.body.model = 'default';
    }

    // Transform headers for AI service
    req.headers['X-Request-Source'] = 'api-gateway';
    req.headers['X-Gateway-Timestamp'] = new Date().toISOString();

    logger.debug('AI request transformed', {
      path: req.path,
      hasModel: !!req.body.model,
      hasTemperature: !!req.body.temperature
    });
  };

  /**
   * Transform webhook requests
   */
  transformWebhookRequest = async (req) => {
    // Add webhook metadata
    req.body._webhookMetadata = {
      receivedAt: new Date().toISOString(),
      source: 'api-gateway',
      ip: req.ip
    };

    // Validate webhook URL if present
    if (req.body.url && !this.isValidUrl(req.body.url)) {
      throw new Error('Invalid webhook URL');
    }
  };

  /**
   * Transform admin requests
   */
  transformAdminRequest = async (req) => {
    // Add audit trail
    req.body._audit = {
      adminId: req.user?.id,
      adminEmail: req.user?.email,
      timestamp: new Date().toISOString(),
      action: `${req.method} ${req.path}`
    };
  };

  /**
   * Transform response before sending to client
   */
  transformResponse = (req, res, data) => {
    if (!this.config.enableResponseTransformation) {
      return data;
    }

    // Add gateway metadata to response
    const transformedData = {
      success: res.statusCode < 400,
      data: data,
      metadata: {
        requestId: req.gatewayMetadata?.requestId,
        timestamp: req.gatewayMetadata?.timestamp,
        processingTime: Date.now() - new Date(req.gatewayMetadata?.timestamp).getTime(),
        version: req.gatewayMetadata?.version || 'v1'
      }
    };

    // Add pagination info if present
    if (data && data.pagination) {
      transformedData.pagination = data.pagination;
      delete transformedData.data.pagination;
    }

    return transformedData;
  };

  /**
   * Handle gateway errors with proper response formatting
   */
  handleGatewayError(error, res) {
    const statusCode = this.getErrorStatusCode(error);
    const errorResponse = {
      success: false,
      error: {
        message: error.message,
        code: this.getErrorCode(error),
        timestamp: new Date().toISOString()
      }
    };

    // Add stack trace in development
    if (process.env.NODE_ENV === 'development') {
      errorResponse.error.stack = error.stack;
    }

    res.status(statusCode).json(errorResponse);
  }

  /**
   * Get HTTP status code for error
   */
  getErrorStatusCode(error) {
    if (error.message.includes('required')) return 400;
    if (error.message.includes('invalid')) return 400;
    if (error.message.includes('unauthorized')) return 401;
    if (error.message.includes('forbidden')) return 403;
    if (error.message.includes('not found')) return 404;
    if (error.message.includes('too large')) return 413;
    if (error.message.includes('unsupported')) return 415;
    return 500;
  }

  /**
   * Get error code for API response
   */
  getErrorCode(error) {
    return error.message
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  /**
   * Check if content type is allowed
   */
  isAllowedContentType(contentType) {
    return this.config.allowedContentTypes.some(allowed => 
      contentType.includes(allowed)
    );
  }

  /**
   * Check if HTTP method is allowed
   */
  isAllowedMethod(method) {
    const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
    return allowedMethods.includes(method.toUpperCase());
  }

  /**
   * Validate API key format
   */
  isValidApiKeyFormat(apiKey) {
    // Basic format validation - can be enhanced based on requirements
    return typeof apiKey === 'string' && apiKey.length >= 16 && apiKey.length <= 128;
  }

  /**
   * Determine where API key was found
   */
  determineApiKeySource(req) {
    if (req.headers['x-api-key']) return 'header';
    if (req.headers.authorization) return 'bearer';
    if (req.query.api_key) return 'query';
    if (req.body.api_key) return 'body';
    return 'unknown';
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `gw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate URL format
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Rate limiting middleware specific to gateway
   */
  rateLimitByService = async (req, res, next) => {
    try {
      const serviceRoute = req.serviceRoute;
      
      // Different rate limits for different services
      const rateLimits = {
        'ai-service': { points: 50, duration: 60 }, // 50 requests per minute
        'webhook-service': { points: 100, duration: 60 }, // 100 requests per minute
        'admin-service': { points: 200, duration: 60 }, // 200 requests per minute
        'default': { points: 100, duration: 60 }
      };

      const limit = rateLimits[serviceRoute.service] || rateLimits.default;
      
      // Apply rate limiting
      // This would integrate with Redis or similar for distributed rate limiting
      logger.debug('Rate limit applied', {
        service: serviceRoute.service,
        limit: limit.points,
        window: `${limit.duration}s`
      });

      next();
    } catch (error) {
      logger.error('Rate limiting error:', error);
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests',
          code: 'rate_limit_exceeded'
        }
      });
    }
  };

  /**
   * Authentication middleware that works with gateway
   */
  authenticate = async (req, res, next) => {
    try {
      // Check if route requires authentication
      const publicPaths = ['/api/v1/models', '/health'];
      if (publicPaths.includes(req.path)) {
        return next();
      }

      // Try API key authentication first
      if (req.apiKey) {
        const isValid = await this.validateApiKey(req.apiKey);
        if (isValid) {
          req.isAuthenticated = true;
          req.authMethod = 'api_key';
          return next();
        }
      }

      // Fall back to JWT authentication
      await auth.verifyToken(req, res, (err) => {
        if (err) return next(err);
        req.isAuthenticated = true;
        req.authMethod = 'jwt';
        next();
      });
    } catch (error) {
      logger.error('Gateway authentication error:', error);
      res.status(401).json({
        success: false,
        error: {
          message: 'Authentication failed',
          code: 'authentication_failed'
        }
      });
    }
  };

  /**
   * Validate API key against database or cache
   */
  async validateApiKey(apiKey) {
    // In production, this would check against a database or cache
    // For now, we'll use a simple validation
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
    return validApiKeys.includes(apiKey);
  }
}

module.exports = new GatewayMiddleware();