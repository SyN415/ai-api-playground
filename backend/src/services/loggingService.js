const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

/**
 * Logging Service
 * Provides detailed request/response logging for Minimax and other AI services
 */
class LoggingService {
  constructor() {
    this.config = {
      logRequests: process.env.LOG_REQUESTS === 'true',
      logResponses: process.env.LOG_RESPONSES === 'true',
      logErrors: process.env.LOG_ERRORS === 'true',
      includeHeaders: process.env.LOG_HEADERS === 'true',
      includePayload: process.env.LOG_PAYLOAD === 'true',
      maxPayloadSize: parseInt(process.env.MAX_LOG_PAYLOAD_SIZE) || 10000,
      logDirectory: process.env.LOG_DIRECTORY || './logs',
      enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true'
    };

    this.ensureLogDirectory();
  }

  /**
   * Ensure log directory exists
   */
  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.config.logDirectory, { recursive: true });
    } catch (error) {
      logger.warn('Failed to create log directory', { error: error.message });
    }
  }

  /**
   * Log AI service request
   */
  logRequest(service, endpoint, options = {}) {
    if (!this.config.logRequests) return;

    const {
      userId = null,
      model = null,
      requestId = null,
      payload = null,
      headers = null,
      ip = null,
      userAgent = null
    } = options;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'request',
      service,
      endpoint,
      userId,
      model,
      requestId,
      ip,
      userAgent,
      payload: this.sanitizePayload(payload),
      headers: this.config.includeHeaders ? this.sanitizeHeaders(headers) : undefined
    };

    this.writeLog('requests', logEntry);
    logger.info(`${service} request`, {
      endpoint,
      userId,
      model,
      requestId
    });
  }

  /**
   * Log AI service response
   */
  logResponse(service, endpoint, options = {}) {
    if (!this.config.logResponses) return;

    const {
      userId = null,
      model = null,
      requestId = null,
      response = null,
      statusCode = null,
      processingTime = null,
      tokensUsed = null,
      cost = null
    } = options;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'response',
      service,
      endpoint,
      userId,
      model,
      requestId,
      statusCode,
      processingTime,
      tokensUsed,
      cost,
      response: this.sanitizePayload(response)
    };

    this.writeLog('responses', logEntry);
    logger.info(`${service} response`, {
      endpoint,
      userId,
      model,
      requestId,
      statusCode,
      processingTime,
      tokensUsed,
      cost
    });
  }

  /**
   * Log AI service error
   */
  logError(service, endpoint, error, options = {}) {
    if (!this.config.logErrors) return;

    const {
      userId = null,
      model = null,
      requestId = null,
      payload = null,
      statusCode = null
    } = options;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'error',
      service,
      endpoint,
      userId,
      model,
      requestId,
      statusCode,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        status: error.status
      },
      payload: this.sanitizePayload(payload)
    };

    this.writeLog('errors', logEntry);
    logger.error(`${service} error`, {
      endpoint,
      userId,
      model,
      requestId,
      error: error.message,
      statusCode
    });
  }

  /**
   * Log Minimax-specific video generation
   */
  logMinimaxVideoGeneration(options = {}) {
    const {
      userId = null,
      model = 'hailuo-2.3',
      prompt = '',
      duration = 5,
      resolution = '1280x720',
      hasImage = false,
      taskId = null,
      estimatedCost = 0.49
    } = options;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'minimax_video_generation',
      userId,
      model,
      prompt: prompt.substring(0, 200), // Truncate long prompts
      duration,
      resolution,
      hasImage,
      taskId,
      estimatedCost
    };

    this.writeLog('minimax_video', logEntry);
    logger.info('Minimax video generation logged', {
      userId,
      model,
      duration,
      resolution,
      hasImage,
      taskId,
      estimatedCost
    });
  }

  /**
   * Log quota check
   */
  logQuotaCheck(userId, options = {}) {
    const {
      allowed = true,
      tokensRequested = 0,
      costRequested = 0,
      remaining = null,
      reason = null
    } = options;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'quota_check',
      userId,
      allowed,
      tokensRequested,
      costRequested,
      remaining,
      reason
    };

    this.writeLog('quota', logEntry);
    
    if (allowed) {
      logger.debug('Quota check passed', {
        userId,
        tokensRequested,
        costRequested
      });
    } else {
      logger.warn('Quota check failed', {
        userId,
        tokensRequested,
        costRequested,
        reason
      });
    }
  }

  /**
   * Log usage recording
   */
  logUsageRecording(userId, options = {}) {
    const {
      tokens = 0,
      cost = 0,
      requestType = 'default',
      success = true,
      taskId = null
    } = options;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'usage_recorded',
      userId,
      tokens,
      cost,
      requestType,
      success,
      taskId
    };

    this.writeLog('usage', logEntry);
    logger.debug('Usage recorded', {
      userId,
      tokens,
      cost,
      requestType,
      success,
      taskId
    });
  }

  /**
   * Log webhook notification
   */
  logWebhookNotification(taskId, options = {}) {
    const {
      event = 'unknown',
      url = null,
      success = true,
      responseStatus = null,
      attempt = 1,
      error = null
    } = options;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'webhook_notification',
      taskId,
      event,
      url,
      success,
      responseStatus,
      attempt,
      error: error ? error.message : null
    };

    this.writeLog('webhooks', logEntry);
    
    if (success) {
      logger.info('Webhook notification sent', {
        taskId,
        event,
        attempt,
        responseStatus
      });
    } else {
      logger.error('Webhook notification failed', {
        taskId,
        event,
        attempt,
        error: error?.message,
        responseStatus
      });
    }
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetrics(service, operation, metrics) {
    const {
      duration = 0,
      tokensProcessed = 0,
      memoryUsage = null,
      cpuUsage = null,
      success = true,
      error = null
    } = metrics;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'performance_metrics',
      service,
      operation,
      duration,
      tokensProcessed,
      throughput: tokensProcessed > 0 ? tokensProcessed / (duration / 1000) : 0,
      memoryUsage,
      cpuUsage,
      success,
      error: error ? error.message : null
    };

    this.writeLog('performance', logEntry);
    logger.debug('Performance metrics logged', {
      service,
      operation,
      duration,
      tokensProcessed,
      throughput: logEntry.throughput
    });
  }

  /**
   * Sanitize payload for logging (remove sensitive data)
   */
  sanitizePayload(payload) {
    if (!payload || !this.config.includePayload) {
      return null;
    }

    // Convert to string if it's an object
    let payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    
    // Truncate if too large
    if (payloadString.length > this.config.maxPayloadSize) {
      payloadString = payloadString.substring(0, this.config.maxPayloadSize) + '... [truncated]';
    }

    // Remove sensitive patterns
    const sensitivePatterns = [
      /"api_?key"\s*:\s*"[^"]*"/gi,
      /"password"\s*:\s*"[^"]*"/gi,
      /"token"\s*:\s*"[^"]*"/gi,
      /"secret"\s*:\s*"[^"]*"/gi,
      /"authorization"\s*:\s*"[^"]*"/gi,
      /Bearer\s+[a-zA-Z0-9._-]+/gi
    ];

    let sanitized = payloadString;
    sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '"$1": "[REDACTED]"');
    });

    try {
      // Try to parse back to object if it was originally an object
      return typeof payload === 'object' ? JSON.parse(sanitized) : sanitized;
    } catch (e) {
      return sanitized;
    }
  }

  /**
   * Sanitize headers for logging
   */
  sanitizeHeaders(headers) {
    if (!headers) return null;

    const sanitized = { ...headers };
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
      'x-minimax-key'
    ];

    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Write log entry to file
   */
  async writeLog(category, logEntry) {
    if (!this.config.enableFileLogging) return;

    try {
      const date = new Date().toISOString().split('T')[0];
      const filename = path.join(this.config.logDirectory, `${category}_${date}.log`);
      const logLine = JSON.stringify(logEntry) + '\n';

      await fs.appendFile(filename, logLine);
    } catch (error) {
      // Don't throw error to avoid breaking the main application
      logger.warn('Failed to write log entry', {
        category,
        error: error.message
      });
    }
  }

  /**
   * Get logs for a specific category and date range
   */
  async getLogs(category, options = {}) {
    const {
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      endDate = new Date(),
      limit = 1000,
      offset = 0,
      filter = null
    } = options;

    try {
      const logs = [];
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Generate list of dates to check
      const dates = [];
      const current = new Date(start);
      while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }

      // Read logs for each date
      for (const date of dates) {
        const filename = path.join(this.config.logDirectory, `${category}_${date}.log`);
        
        try {
          const content = await fs.readFile(filename, 'utf8');
          const lines = content.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const logEntry = JSON.parse(line);
              
              // Apply filters
              if (filter && !this.matchesFilter(logEntry, filter)) {
                continue;
              }

              // Check date range
              const logTimestamp = new Date(logEntry.timestamp);
              if (logTimestamp >= start && logTimestamp <= end) {
                logs.push(logEntry);
              }
            } catch (e) {
              // Skip invalid log lines
              continue;
            }
          }
        } catch (e) {
          // File doesn't exist, skip
          continue;
        }
      }

      // Sort by timestamp and apply pagination
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const total = logs.length;
      const paginated = logs.slice(offset, offset + limit);

      return {
        logs: paginated,
        total,
        limit,
        offset,
        category,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString()
        }
      };
    } catch (error) {
      logger.error('Failed to get logs', {
        category,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if log entry matches filter
   */
  matchesFilter(logEntry, filter) {
    if (typeof filter === 'string') {
      // Simple text search
      const logString = JSON.stringify(logEntry).toLowerCase();
      return logString.includes(filter.toLowerCase());
    }

    if (typeof filter === 'object') {
      // Object filter with key-value pairs
      return Object.entries(filter).every(([key, value]) => {
        return logEntry[key] === value;
      });
    }

    return true;
  }

  /**
   * Clean up old log files
   */
  async cleanupOldLogs(maxAgeDays = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

      const files = await fs.readdir(this.config.logDirectory);
      let cleaned = 0;

      for (const file of files) {
        if (!file.endsWith('.log')) continue;

        const filePath = path.join(this.config.logDirectory, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          cleaned++;
        }
      }

      logger.info('Log cleanup completed', {
        cleaned,
        maxAgeDays
      });

      return cleaned;
    } catch (error) {
      logger.error('Failed to cleanup old logs', {
        error: error.message
      });
      return 0;
    }
  }
}

module.exports = new LoggingService();