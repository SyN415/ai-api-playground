/**
 * Response Formatter Utility
 * Provides standardized API response formatting and error handling
 */

class ResponseFormatter {
  constructor() {
    this.config = {
      includeMetadata: true,
      includeTimestamp: true,
      includeRequestId: true,
      prettyPrint: process.env.NODE_ENV === 'development',
      version: '1.0.0'
    };
  }

  /**
   * Format successful response
   */
  success(data, options = {}) {
    const {
      message = 'Success',
      statusCode = 200,
      pagination = null,
      metadata = {}
    } = options;

    const response = {
      success: true,
      message,
      data
    };

    // Add pagination if provided
    if (pagination) {
      response.pagination = pagination;
    }

    // Add metadata if configured
    if (this.config.includeMetadata) {
      response.metadata = {
        version: this.config.version,
        timestamp: this.config.includeTimestamp ? new Date().toISOString() : undefined,
        requestId: metadata.requestId,
        processingTime: metadata.processingTime,
        ...metadata
      };
    }

    return {
      statusCode,
      body: this.formatOutput(response)
    };
  }

  /**
   * Format error response
   */
  error(error, options = {}) {
    const {
      message = 'An error occurred',
      statusCode = 500,
      code = 'INTERNAL_ERROR',
      details = null,
      metadata = {}
    } = options;

    const errorResponse = {
      success: false,
      error: {
        message,
        code,
        timestamp: this.config.includeTimestamp ? new Date().toISOString() : undefined,
        ...metadata
      }
    };

    // Add error details if provided
    if (details) {
      errorResponse.error.details = details;
    }

    // Add stack trace in development
    if (process.env.NODE_ENV === 'development' && error?.stack) {
      errorResponse.error.stack = error.stack;
    }

    return {
      statusCode,
      body: this.formatOutput(errorResponse)
    };
  }

  /**
   * Format validation error response
   */
  validationError(errors, options = {}) {
    const {
      message = 'Validation failed',
      statusCode = 400,
      metadata = {}
    } = options;

    const formattedErrors = Array.isArray(errors) 
      ? errors.map(err => ({
          field: err.param || err.field || 'unknown',
          message: err.msg || err.message,
          value: err.value
        }))
      : Object.entries(errors).map(([field, message]) => ({
          field,
          message: Array.isArray(message) ? message[0] : message,
          value: null
        }));

    return this.error(null, {
      message,
      statusCode,
      code: 'VALIDATION_ERROR',
      details: formattedErrors,
      metadata
    });
  }

  /**
   * Format not found error
   */
  notFound(resource = 'Resource', options = {}) {
    return this.error(null, {
      message: `${resource} not found`,
      statusCode: 404,
      code: 'NOT_FOUND',
      ...options
    });
  }

  /**
   * Format unauthorized error
   */
  unauthorized(message = 'Unauthorized', options = {}) {
    return this.error(null, {
      message,
      statusCode: 401,
      code: 'UNAUTHORIZED',
      ...options
    });
  }

  /**
   * Format forbidden error
   */
  forbidden(message = 'Forbidden', options = {}) {
    return this.error(null, {
      message,
      statusCode: 403,
      code: 'FORBIDDEN',
      ...options
    });
  }

  /**
   * Format conflict error
   */
  conflict(message = 'Conflict', options = {}) {
    return this.error(null, {
      message,
      statusCode: 409,
      code: 'CONFLICT',
      ...options
    });
  }

  /**
   * Format rate limit error
   */
  rateLimit(message = 'Too many requests', options = {}) {
    return this.error(null, {
      message,
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      details: {
        retryAfter: options.retryAfter || 60
      },
      ...options
    });
  }

  /**
   * Format paginated response
   */
  paginated(data, pagination, options = {}) {
    const {
      page = 1,
      limit = 10,
      total = 0,
      totalPages = Math.ceil(total / limit)
    } = pagination;

    const paginationMeta = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total: parseInt(total, 10),
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };

    return this.success(data, {
      ...options,
      pagination: paginationMeta
    });
  }

  /**
   * Format list response
   */
  list(items, options = {}) {
    const {
      total = items.length,
      page = 1,
      limit = items.length,
      ...otherOptions
    } = options;

    if (total > limit || page > 1) {
      return this.paginated(items, { page, limit, total }, otherOptions);
    }

    return this.success(items, otherOptions);
  }

  /**
   * Format single item response
   */
  item(data, options = {}) {
    return this.success(data, options);
  }

  /**
   * Format created response
   */
  created(data, options = {}) {
    return this.success(data, {
      ...options,
      message: options.message || 'Resource created successfully',
      statusCode: 201
    });
  }

  /**
   * Format updated response
   */
  updated(data, options = {}) {
    return this.success(data, {
      ...options,
      message: options.message || 'Resource updated successfully',
      statusCode: 200
    });
  }

  /**
   * Format deleted response
   */
  deleted(options = {}) {
    return this.success(null, {
      ...options,
      message: options.message || 'Resource deleted successfully',
      statusCode: 200
    });
  }

  /**
   * Format accepted response (for async operations)
   */
  accepted(data, options = {}) {
    return this.success(data, {
      ...options,
      message: options.message || 'Request accepted and is being processed',
      statusCode: 202
    });
  }

  /**
   * Format no content response
   */
  noContent(options = {}) {
    return {
      statusCode: 204,
      body: null
    };
  }

  /**
   * Format batch operation response
   */
  batchResult(successful, failed, options = {}) {
    const data = {
      successful,
      failed,
      summary: {
        total: successful.length + failed.length,
        successful: successful.length,
        failed: failed.length,
        successRate: ((successful.length / (successful.length + failed.length)) * 100).toFixed(2) + '%'
      }
    };

    const hasFailures = failed.length > 0;
    const statusCode = hasFailures ? 207 : 200; // 207 Multi-Status if partial failure

    return this.success(data, {
      ...options,
      message: hasFailures ? 'Batch operation completed with some failures' : 'Batch operation completed successfully',
      statusCode
    });
  }

  /**
   * Format streaming response (for SSE)
   */
  stream(data, options = {}) {
    return {
      event: options.event || 'message',
      data: typeof data === 'string' ? data : JSON.stringify(data),
      id: options.id,
      retry: options.retry
    };
  }

  /**
   * Format file download response
   */
  file(data, filename, options = {}) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': options.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': data.length
      },
      body: data,
      isFile: true
    };
  }

  /**
   * Format redirect response
   */
  redirect(url, options = {}) {
    return {
      statusCode: options.permanent ? 301 : 302,
      headers: {
        Location: url
      },
      body: null
    };
  }

  /**
   * Format health check response
   */
  healthCheck(status, checks = [], options = {}) {
    const allHealthy = checks.every(check => check.status === 'healthy');
    const statusCode = allHealthy ? 200 : 503;

    const data = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
      healthy: allHealthy
    };

    return this.success(data, {
      ...options,
      statusCode
    });
  }

  /**
   * Format API info response
   */
  apiInfo(options = {}) {
    const info = {
      name: 'AI API Playground',
      version: this.config.version,
      environment: process.env.NODE_ENV || 'development',
      documentation: '/api/docs',
      endpoints: {
        auth: '/api/auth',
        ai: '/api/v1/ai',
        webhooks: '/api/v1/webhooks',
        admin: '/api/admin'
      },
      features: [
        'AI Model Integration',
        'Webhook Management',
        'Rate Limiting',
        'API Key Authentication',
        'JWT Authentication',
        'Request/Response Logging'
      ]
    };

    return this.success(info, options);
  }

  /**
   * Format output based on configuration
   */
  formatOutput(data) {
    if (this.config.prettyPrint) {
      return JSON.stringify(data, null, 2);
    }
    return data;
  }

  /**
   * Parse and format error from various sources
   */
  parseError(error) {
    if (typeof error === 'string') {
      return { message: error, code: 'UNKNOWN_ERROR' };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        code: error.code || error.name || 'UNKNOWN_ERROR',
        stack: error.stack
      };
    }

    if (typeof error === 'object') {
      return {
        message: error.message || 'Unknown error',
        code: error.code || 'UNKNOWN_ERROR',
        ...error
      };
    }

    return { message: 'Unknown error', code: 'UNKNOWN_ERROR' };
  }

  /**
   * Create middleware for consistent response formatting
   */
  middleware() {
    return (req, res, next) => {
      // Store original json function
      const originalJson = res.json;
      const originalStatus = res.status;

      // Override status to store it
      res.status = function(code) {
        res._statusCode = code;
        return originalStatus.call(this, code);
      };

      // Override json function for formatting
      res.json = (data) => {
        const statusCode = res._statusCode || 200;
        
        // Check if data is already formatted
        if (data && typeof data === 'object' && data.success !== undefined) {
          return originalJson.call(res, data);
        }

        // Format the response
        let formattedResponse;
        if (statusCode >= 400) {
          formattedResponse = this.error(null, {
            message: data?.message || 'An error occurred',
            statusCode,
            code: data?.code || 'ERROR',
            details: data?.details
          }).body;
        } else {
          formattedResponse = this.success(data, {
            statusCode,
            message: data?.message
          }).body;
        }

        return originalJson.call(res, formattedResponse);
      };

      next();
    };
  }
}

module.exports = new ResponseFormatter();