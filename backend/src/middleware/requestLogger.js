const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Advanced request logging middleware with multiple output formats
 */
class RequestLogger {
  constructor() {
    this.logDir = path.join(process.cwd(), 'logs', 'requests');
    this.ensureLogDirectory();
    
    // Configuration
    this.config = {
      logToFile: process.env.LOG_REQUESTS_TO_FILE === 'true',
      logToConsole: process.env.LOG_REQUESTS_TO_CONSOLE !== 'false',
      logLevel: process.env.REQUEST_LOG_LEVEL || 'info',
      excludePaths: ['/health', '/favicon.ico'],
      maxBodyLength: 1000,
      maxLogFileSize: 10 * 1024 * 1024, // 10MB
      retentionDays: 30
    };
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Main middleware function
   */
  logRequest = (req, res, next) => {
    // Skip logging for excluded paths
    if (this.config.excludePaths.includes(req.path)) {
      return next();
    }

    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    // Attach request ID to request and response
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Capture request details
    const requestDetails = this.captureRequestDetails(req);

    // Log request start
    this.log('request', {
      requestId,
      type: 'request_start',
      ...requestDetails
    });

    // Override res.send to capture response
    const originalSend = res.send;
    const self = this;

    res.send = function(body) {
      const duration = Date.now() - startTime;
      const responseDetails = self.captureResponseDetails(res, body, duration);

      // Log response
      self.log('response', {
        requestId,
        type: 'request_complete',
        duration: `${duration}ms`,
        ...responseDetails
      });

      // Store request/response data for analytics
      self.storeRequestData({
        requestId,
        timestamp: new Date().toISOString(),
        request: requestDetails,
        response: responseDetails,
        duration
      });

      return originalSend.call(this, body);
    };

    // Handle request errors
    req.on('error', (error) => {
      this.log('error', {
        requestId,
        type: 'request_error',
        error: error.message,
        stack: error.stack
      });
    });

    next();
  };

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `req_${timestamp}_${random}`;
  }

  /**
   * Capture request details
   */
  captureRequestDetails(req) {
    const details = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      path: req.path,
      query: this.sanitizeObject(req.query),
      headers: this.sanitizeHeaders(req.headers),
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      userId: req.user?.id,
      userRole: req.user?.role,
      apiKey: req.headers['x-api-key'] ? 'present' : 'absent',
      bearerToken: req.headers.authorization ? 'present' : 'absent'
    };

    // Capture request body (with size limit)
    if (req.body && Object.keys(req.body).length > 0) {
      const bodyStr = JSON.stringify(req.body);
      if (bodyStr.length <= this.config.maxBodyLength) {
        details.body = this.sanitizeObject(req.body);
      } else {
        details.body = `[Body too large: ${bodyStr.length} characters]`;
      }
    }

    return details;
  }

  /**
   * Capture response details
   */
  captureResponseDetails(res, body, duration) {
    const details = {
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      headers: this.sanitizeHeaders(res.getHeaders()),
      contentType: res.get('Content-Type'),
      contentLength: res.get('Content-Length')
    };

    // Parse response body if it's JSON
    if (body && typeof body === 'string') {
      try {
        const parsedBody = JSON.parse(body);
        const bodyStr = JSON.stringify(parsedBody);
        if (bodyStr.length <= this.config.maxBodyLength) {
          details.body = this.sanitizeObject(parsedBody);
        } else {
          details.body = `[Response too large: ${bodyStr.length} characters]`;
        }
      } catch (e) {
        details.body = `[Non-JSON response: ${body.length} characters]`;
      }
    }

    return details;
  }

  /**
   * Sanitize headers to remove sensitive information
   */
  sanitizeHeaders(headers) {
    const sanitized = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveHeaders.includes(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize object to remove sensitive data
   */
  sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const sanitized = Array.isArray(obj) ? [] : {};
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Log message with appropriate level and output
   */
  log(level, data) {
    const logData = {
      ...data,
      timestamp: new Date().toISOString()
    };

    // Log to console
    if (this.config.logToConsole) {
      logger.log(this.config.logLevel, 'Request Log', logData);
    }

    // Log to file
    if (this.config.logToFile) {
      this.logToFile(level, logData);
    }
  }

  /**
   * Write log to file
   */
  logToFile(level, data) {
    try {
      const date = new Date().toISOString().split('T')[0];
      const filename = path.join(this.logDir, `${date}_${level}.log`);
      const logEntry = JSON.stringify(data) + '\n';

      // Check file size and rotate if necessary
      if (fs.existsSync(filename)) {
        const stats = fs.statSync(filename);
        if (stats.size > this.config.maxLogFileSize) {
          this.rotateLogFile(filename);
        }
      }

      fs.appendFileSync(filename, logEntry);
    } catch (error) {
      logger.error('Failed to write request log to file:', error);
    }
  }

  /**
   * Rotate log file when it gets too large
   */
  rotateLogFile(filename) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedFilename = `${filename}.${timestamp}`;
      fs.renameSync(filename, rotatedFilename);
      
      // Clean up old rotated files
      this.cleanupOldLogs();
    } catch (error) {
      logger.error('Failed to rotate log file:', error);
    }
  }

  /**
   * Clean up log files older than retention period
   */
  cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          logger.info(`Deleted old log file: ${file}`);
        }
      });
    } catch (error) {
      logger.error('Failed to cleanup old logs:', error);
    }
  }

  /**
   * Store request data for analytics
   */
  storeRequestData(data) {
    // In a production environment, this would store to a database
    // or analytics service like Elasticsearch, Splunk, etc.
    // For now, we'll just log it
    logger.debug('Request analytics data', data);
  }

  /**
   * Get request statistics
   */
  getRequestStats(startTime, endTime) {
    // This would query the stored request data
    // and return statistics like request counts, average response times, etc.
    return {
      totalRequests: 0,
      averageResponseTime: 0,
      errorRate: 0,
      topEndpoints: []
    };
  }

  /**
   * Middleware to log slow requests
   */
  logSlowRequests(thresholdMs = 1000) {
    return (req, res, next) => {
      const startTime = Date.now();
      
      const originalSend = res.send;
      res.send = function(body) {
        const duration = Date.now() - startTime;
        
        if (duration > thresholdMs) {
          logger.warn('Slow request detected', {
            requestId: req.requestId,
            method: req.method,
            url: req.url,
            duration: `${duration}ms`,
            threshold: `${thresholdMs}ms`
          });
        }
        
        return originalSend.call(this, body);
      };
      
      next();
    };
  }

  /**
   * Middleware to log errors with full context
   */
  logErrors = (err, req, res, next) => {
    logger.error('Request error', {
      requestId: req.requestId,
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      userId: req.user?.id,
      body: this.sanitizeObject(req.body),
      query: this.sanitizeObject(req.query)
    });

    next(err);
  };
}

module.exports = new RequestLogger();