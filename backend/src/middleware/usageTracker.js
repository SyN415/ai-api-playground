const UsageLog = require('../models/UsageLog');
const RequestLog = require('../models/RequestLog');
const quotaService = require('../services/quotaService');
const monitoringService = require('../services/monitoringService');
const logger = require('../utils/logger');

/**
 * Usage Tracking Middleware
 * Automatically tracks all API calls, calculates costs, and updates user quotas
 */
class UsageTracker {
  constructor() {
    this.enabled = true;
    this.trackRequestBody = process.env.TRACK_REQUEST_BODY === 'true';
    this.trackResponseBody = process.env.TRACK_RESPONSE_BODY === 'true';
    this.maxBodySize = parseInt(process.env.MAX_TRACKED_BODY_SIZE) || 10000; // 10KB
  }

  /**
   * Main middleware function
   */
  middleware() {
    return async (req, res, next) => {
      if (!this.enabled) {
        return next();
      }

      const startTime = Date.now();
      const requestId = req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store request ID for tracking
      req.requestId = requestId;
      
      // Capture request details
      const requestDetails = {
        userId: req.user?.id || null,
        requestId,
        method: req.method,
        endpoint: req.path,
        headers: this.sanitizeHeaders(req.headers),
        queryParams: req.query,
        body: this.shouldTrackBody(req) ? this.truncateBody(req.body) : null,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        metadata: {
          userAgent: req.get('User-Agent'),
          referer: req.get('Referer'),
          contentType: req.get('Content-Type')
        }
      };

      // Track the start of request processing
      logger.debug('Request started', {
        requestId,
        userId: requestDetails.userId,
        endpoint: requestDetails.endpoint,
        method: requestDetails.method
      });

      // Override res.json to capture response
      const originalJson = res.json.bind(res);
      let responseBody = null;
      let responseSize = 0;

      res.json = (data) => {
        responseBody = data;
        responseSize = JSON.stringify(data).length;
        return originalJson(data);
      };

      // Override res.send to capture response
      const originalSend = res.send.bind(res);
      res.send = (data) => {
        responseBody = data;
        responseSize = typeof data === 'string' ? data.length : JSON.stringify(data).length;
        return originalSend(data);
      };

      // Listen for response finish
      res.on('finish', async () => {
        try {
          await this.trackRequestCompletion(req, res, requestDetails, startTime, responseBody, responseSize);
        } catch (error) {
          logger.error('Request tracking completion failed:', error);
        }
      });

      next();
    };
  }

  /**
   * Track request completion
   */
  async trackRequestCompletion(req, res, requestDetails, startTime, responseBody, responseSize) {
    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // Prepare request log data
    const requestLogData = {
      ...requestDetails,
      responseStatus: res.statusCode,
      responseHeaders: this.sanitizeHeaders(res.getHeaders()),
      responseBody: this.trackResponseBody ? this.truncateBody(responseBody) : null,
      responseSize,
      processingTime,
      error: res.statusCode >= 400 ? this.extractError(responseBody) : null,
      errorStack: res.statusCode >= 500 ? this.extractErrorStack(responseBody) : null
    };

    // Log request completion
    logger.debug('Request completed', {
      requestId: requestDetails.requestId,
      status: res.statusCode,
      processingTime,
      size: responseSize
    });

    // Create request log
    const requestLog = await RequestLog.create(requestLogData);

    // Track AI usage if applicable
    if (this.isAIRequest(req) && req.user) {
      await this.trackAIUsage(req, res, requestDetails, processingTime, responseBody);
    }

    // Update quota usage
    if (req.user) {
      await this.updateQuotaUsage(req.user.id, requestLog);
    }

    // Check for monitoring alerts
    await this.checkMonitoringAlerts(requestLog);
  }

  /**
   * Track AI usage
   */
  async trackAIUsage(req, res, requestDetails, processingTime, responseBody) {
    try {
      const usageData = this.extractUsageData(req, res, responseBody);
      
      if (!usageData) {
        logger.warn('Could not extract usage data from AI request', {
          requestId: requestDetails.requestId,
          endpoint: requestDetails.endpoint
        });
        return;
      }

      // Calculate cost
      const cost = this.calculateCost(usageData);

      // Create usage log
      const usageLog = await UsageLog.create({
        userId: requestDetails.userId,
        requestId: requestDetails.requestId,
        provider: usageData.provider || 'unknown',
        model: usageData.model || 'unknown',
        taskType: usageData.taskType || 'generation',
        tokensInput: usageData.tokensInput || 0,
        tokensOutput: usageData.tokensOutput || 0,
        tokensTotal: usageData.tokensTotal || 0,
        cost: cost,
        status: res.statusCode < 400 ? 'success' : 'error',
        error: res.statusCode >= 400 ? this.extractError(responseBody) : null,
        ipAddress: requestDetails.ipAddress,
        userAgent: requestDetails.userAgent,
        endpoint: requestDetails.endpoint,
        responseTime: processingTime,
        metadata: {
          ...usageData.metadata,
          requestSize: JSON.stringify(req.body).length,
          responseSize: JSON.stringify(responseBody).length
        }
      });

      logger.info('AI usage tracked', {
        requestId: requestDetails.requestId,
        userId: requestDetails.userId,
        provider: usageLog.provider,
        model: usageLog.model,
        tokens: usageLog.tokensTotal,
        cost: usageLog.cost
      });

    } catch (error) {
      logger.error('AI usage tracking failed:', error);
    }
  }

  /**
   * Extract usage data from request/response
   */
  extractUsageData(req, res, responseBody) {
    // Handle different AI endpoints
    const endpoint = req.path;

    if (endpoint.includes('/ai/generate')) {
      return this.extractGenerationUsage(req, responseBody);
    } else if (endpoint.includes('/ai/embeddings')) {
      return this.extractEmbeddingsUsage(req, responseBody);
    } else if (endpoint.includes('/ai/image')) {
      return this.extractImageUsage(req, responseBody);
    } else if (endpoint.includes('/minimax/')) {
      return this.extractMinimaxUsage(req, responseBody);
    }

    return null;
  }

  /**
   * Extract generation usage data
   */
  extractGenerationUsage(req, responseBody) {
    return {
      provider: responseBody.provider || req.body.provider || 'minimax',
      model: responseBody.model || req.body.model || 'hailuo-2.3',
      taskType: 'generation',
      tokensInput: responseBody.usage?.promptTokens || 0,
      tokensOutput: responseBody.usage?.completionTokens || 0,
      tokensTotal: responseBody.usage?.totalTokens || 0,
      metadata: {
        temperature: req.body.temperature,
        maxTokens: req.body.maxTokens,
        stream: req.body.stream || false
      }
    };
  }

  /**
   * Extract embeddings usage data
   */
  extractEmbeddingsUsage(req, responseBody) {
    return {
      provider: responseBody.provider || req.body.provider || 'minimax',
      model: responseBody.model || req.body.model || 'hailuo-2.3',
      taskType: 'embeddings',
      tokensInput: responseBody.usage?.totalTokens || 0,
      tokensOutput: 0,
      tokensTotal: responseBody.usage?.totalTokens || 0,
      metadata: {
        textCount: req.body.texts?.length || 0
      }
    };
  }

  /**
   * Extract image generation usage data
   */
  extractImageUsage(req, responseBody) {
    return {
      provider: responseBody.provider || req.body.provider || 'minimax',
      model: responseBody.model || req.body.model || 'hailuo-2.3',
      taskType: 'image_generation',
      tokensInput: 0,
      tokensOutput: 0,
      tokensTotal: 0,
      metadata: {
        size: req.body.size,
        quality: req.body.quality,
        imageCount: responseBody.images?.length || 1
      }
    };
  }

  /**
   * Extract Minimax-specific usage data
   */
  extractMinimaxUsage(req, responseBody) {
    if (req.path.includes('/video')) {
      return {
        provider: 'minimax',
        model: 'hailuo-2.3',
        taskType: 'video_generation',
        tokensInput: 0,
        tokensOutput: 0,
        tokensTotal: 0,
        metadata: {
          taskId: responseBody.taskId,
          prompt: req.body.prompt,
          duration: req.body.duration
        }
      };
    }

    // Default to generation for other Minimax endpoints
    return this.extractGenerationUsage(req, responseBody);
  }

  /**
   * Calculate cost based on usage data
   */
  calculateCost(usageData) {
    return UsageLog.calculateMinimaxCost(
      usageData.model,
      usageData.tokensInput,
      usageData.tokensOutput,
      usageData.taskType
    );
  }

  /**
   * Update quota usage
   */
  async updateQuotaUsage(userId, requestLog) {
    try {
      const tokens = this.extractTokensFromRequest(requestLog);
      const cost = this.extractCostFromRequest(requestLog);

      quotaService.recordUsage(userId, {
        tokens,
        cost,
        requestType: this.getRequestType(requestLog.endpoint),
        success: requestLog.responseStatus < 400
      });

      logger.debug('Quota usage updated', {
        userId,
        tokens,
        cost,
        requestId: requestLog.requestId
      });

    } catch (error) {
      logger.error('Quota usage update failed:', error);
    }
  }

  /**
   * Extract tokens from request log
   */
  extractTokensFromRequest(requestLog) {
    // Try to extract from response body or metadata
    if (requestLog.responseBody?.usage?.totalTokens) {
      return requestLog.responseBody.usage.totalTokens;
    }
    
    if (requestLog.metadata?.tokens) {
      return requestLog.metadata.tokens;
    }

    // Estimate based on request size for non-AI requests
    if (!this.isAIRequest({ path: requestLog.endpoint })) {
      return Math.floor(requestLog.responseSize / 4); // Rough estimate: 1 token per 4 chars
    }

    return 0;
  }

  /**
   * Extract cost from request log
   */
  extractCostFromRequest(requestLog) {
    // Try to extract from response body or metadata
    if (requestLog.responseBody?.cost) {
      return requestLog.responseBody.cost;
    }
    
    if (requestLog.metadata?.cost) {
      return requestLog.metadata.cost;
    }

    return 0;
  }

  /**
   * Get request type
   */
  getRequestType(endpoint) {
    if (endpoint.includes('/ai/')) return 'ai';
    if (endpoint.includes('/auth/')) return 'auth';
    if (endpoint.includes('/admin/')) return 'admin';
    return 'api';
  }

  /**
   * Check monitoring alerts
   */
  async checkMonitoringAlerts(requestLog) {
    try {
      // Check for slow responses
      if (requestLog.processingTime > 5000) {
        await monitoringService.triggerAlert('slow_response', {
          requestId: requestLog.requestId,
          endpoint: requestLog.endpoint,
          processingTime: requestLog.processingTime,
          userId: requestLog.userId
        });
      }

      // Check for errors
      if (requestLog.responseStatus >= 500) {
        await monitoringService.triggerAlert('server_error', {
          requestId: requestLog.requestId,
          endpoint: requestLog.endpoint,
          status: requestLog.responseStatus,
          userId: requestLog.userId,
          error: requestLog.error
        });
      }

      // Check for repeated errors from same user
      if (requestLog.responseStatus >= 400 && requestLog.userId) {
        const recentErrors = await RequestLog.findByUserId(requestLog.userId, {
          startDate: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // Last 5 minutes
          status: 400
        });

        if (recentErrors.logs.length > 10) {
          await monitoringService.triggerAlert('user_repeated_errors', {
            userId: requestLog.userId,
            errorCount: recentErrors.logs.length,
            timeWindow: '5 minutes'
          });
        }
      }

    } catch (error) {
      logger.error('Monitoring alert check failed:', error);
    }
  }

  /**
   * Check if request is an AI request
   */
  isAIRequest(req) {
    const aiEndpoints = ['/ai/', '/minimax/', '/embeddings', '/generate', '/image'];
    return aiEndpoints.some(endpoint => req.path.includes(endpoint));
  }

  /**
   * Check if body should be tracked
   */
  shouldTrackBody(req) {
    if (!this.trackRequestBody) return false;
    
    const contentLength = parseInt(req.get('Content-Length')) || 0;
    if (contentLength > this.maxBodySize) return false;

    // Skip tracking for certain content types
    const contentType = req.get('Content-Type') || '';
    if (contentType.includes('multipart/form-data')) return false;
    if (contentType.includes('application/octet-stream')) return false;

    return true;
  }

  /**
   * Sanitize headers (remove sensitive information)
   */
  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Truncate body to prevent excessive logging
   */
  truncateBody(body) {
    if (!body) return null;
    
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    if (bodyStr.length > this.maxBodySize) {
      return bodyStr.substring(0, this.maxBodySize) + '...[TRUNCATED]';
    }
    
    return body;
  }

  /**
   * Extract error message from response
   */
  extractError(responseBody) {
    if (!responseBody) return null;
    
    if (typeof responseBody === 'object') {
      return responseBody.error || responseBody.message || JSON.stringify(responseBody);
    }
    
    return String(responseBody);
  }

  /**
   * Extract error stack from response
   */
  extractErrorStack(responseBody) {
    if (!responseBody || typeof responseBody !== 'object') return null;
    
    return responseBody.stack || responseBody.errorStack || null;
  }

  /**
   * Enable/disable tracking
   */
  enable() {
    this.enabled = true;
    logger.info('Usage tracking enabled');
  }

  /**
   * Disable tracking
   */
  disable() {
    this.enabled = false;
    logger.info('Usage tracking disabled');
  }

  /**
   * Get tracking status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      trackRequestBody: this.trackRequestBody,
      trackResponseBody: this.trackResponseBody,
      maxBodySize: this.maxBodySize
    };
  }
}

module.exports = new UsageTracker();