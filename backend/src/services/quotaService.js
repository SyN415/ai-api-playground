const logger = require('../utils/logger');
const responseFormatter = require('../utils/responseFormatter');

/**
 * Quota Management Service
 * Handles user quota enforcement, tracking, and management
 */
class QuotaService {
  constructor() {
    // In-memory quota storage (use database in production)
    this.quotas = new Map();
    this.usage = new Map();
    
    this.config = {
      defaultQuota: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000,
        tokensPerMinute: 10000,
        tokensPerHour: 100000,
        tokensPerDay: 1000000,
        concurrentRequests: 5
      },
      gracePeriod: 1000, // 1 second grace period
      enableHardLimits: true,
      enableSoftLimits: true,
      softLimitThreshold: 0.8, // 80% of limit
      resetIntervals: {
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000
      }
    };

    // Start quota reset timers
    this.startQuotaResetTimers();
  }

  /**
   * Check if request is within quota limits
   */
  async checkQuota(userId, options = {}) {
    const {
      tokens = 0,
      cost = 0,
      requestType = 'default'
    } = options;

    try {
      const quota = this.getUserQuota(userId);
      const usage = this.getUserUsage(userId);

      // Check concurrent requests
      if (usage.concurrentRequests >= quota.concurrentRequests) {
        throw new Error('Too many concurrent requests');
      }

      // Increment concurrent requests
      usage.concurrentRequests++;

      // Check rate limits
      this.checkRateLimits(usage, quota, tokens);

      // Check if approaching soft limits
      const softLimitInfo = this.checkSoftLimits(usage, quota);
      if (softLimitInfo.approachingLimit) {
        logger.warn('User approaching quota limit', {
          userId,
          ...softLimitInfo
        });
      }

      logger.debug('Quota check passed', {
        userId,
        tokens,
        cost,
        requestType
      });

      return {
        allowed: true,
        remaining: this.calculateRemaining(usage, quota),
        softLimitInfo
      };

    } catch (error) {
      logger.warn('Quota check failed', {
        userId,
        error: error.message,
        tokens,
        cost
      });

      throw error;
    }
  }

  /**
   * Record usage after request completion
   */
  recordUsage(userId, options = {}) {
    const {
      tokens = 0,
      cost = 0,
      requestType = 'default',
      success = true
    } = options;

    try {
      const usage = this.getUserUsage(userId);
      const now = Date.now();

      // Decrement concurrent requests
      usage.concurrentRequests = Math.max(0, usage.concurrentRequests - 1);

      // Record request
      usage.requestsPerMinute++;
      usage.requestsPerHour++;
      usage.requestsPerDay++;
      usage.totalRequests++;

      // Record tokens
      usage.tokensPerMinute += tokens;
      usage.tokensPerHour += tokens;
      usage.tokensPerDay += tokens;
      usage.totalTokens += tokens;

      // Record cost
      usage.totalCost += cost;

      // Add to history
      usage.history.push({
        timestamp: now,
        tokens,
        cost,
        requestType,
        success
      });

      // Keep only last 1000 entries in history
      if (usage.history.length > 1000) {
        usage.history = usage.history.slice(-1000);
      }

      // Update last used timestamp
      usage.lastUsed = now;

      logger.debug('Usage recorded', {
        userId,
        tokens,
        cost,
        requestType,
        success
      });

      return usage;

    } catch (error) {
      logger.error('Failed to record usage', {
        userId,
        error: error.message,
        tokens,
        cost
      });
      throw error;
    }
  }

  /**
   * Get user quota
   */
  getUserQuota(userId) {
    if (!this.quotas.has(userId)) {
      // Create default quota for new user
      this.quotas.set(userId, {
        ...this.config.defaultQuota,
        userId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    return this.quotas.get(userId);
  }

  /**
   * Set user quota
   */
  setUserQuota(userId, quota) {
    const currentQuota = this.getUserQuota(userId);
    const newQuota = {
      ...currentQuota,
      ...quota,
      userId,
      updatedAt: Date.now()
    };

    this.quotas.set(userId, newQuota);

    logger.info('User quota updated', {
      userId,
      quota: newQuota
    });

    return newQuota;
  }

  /**
   * Get user usage statistics
   */
  getUserUsage(userId) {
    if (!this.usage.has(userId)) {
      this.usage.set(userId, this.createDefaultUsage(userId));
    }

    return this.usage.get(userId);
  }

  /**
   * Create default usage object
   */
  createDefaultUsage(userId) {
    const now = Date.now();
    return {
      userId,
      requestsPerMinute: 0,
      requestsPerHour: 0,
      requestsPerDay: 0,
      totalRequests: 0,
      tokensPerMinute: 0,
      tokensPerHour: 0,
      tokensPerDay: 0,
      totalTokens: 0,
      totalCost: 0,
      concurrentRequests: 0,
      lastUsed: now,
      createdAt: now,
      history: []
    };
  }

  /**
   * Check rate limits
   */
  checkRateLimits(usage, quota, tokens) {
    // Check minute limits
    if (usage.requestsPerMinute >= quota.requestsPerMinute) {
      throw new Error('Rate limit exceeded: requests per minute');
    }
    if (usage.tokensPerMinute + tokens > quota.tokensPerMinute) {
      throw new Error('Rate limit exceeded: tokens per minute');
    }

    // Check hour limits
    if (usage.requestsPerHour >= quota.requestsPerHour) {
      throw new Error('Rate limit exceeded: requests per hour');
    }
    if (usage.tokensPerHour + tokens > quota.tokensPerHour) {
      throw new Error('Rate limit exceeded: tokens per hour');
    }

    // Check day limits
    if (usage.requestsPerDay >= quota.requestsPerDay) {
      throw new Error('Rate limit exceeded: requests per day');
    }
    if (usage.tokensPerDay + tokens > quota.tokensPerDay) {
      throw new Error('Rate limit exceeded: tokens per day');
    }
  }

  /**
   * Check soft limits (warnings)
   */
  checkSoftLimits(usage, quota) {
    const checks = {
      requestsPerMinute: usage.requestsPerMinute / quota.requestsPerMinute,
      requestsPerHour: usage.requestsPerHour / quota.requestsPerHour,
      requestsPerDay: usage.requestsPerDay / quota.requestsPerDay,
      tokensPerMinute: usage.tokensPerMinute / quota.tokensPerMinute,
      tokensPerHour: usage.tokensPerHour / quota.tokensPerHour,
      tokensPerDay: usage.tokensPerDay / quota.tokensPerDay
    };

    const approachingLimit = Object.entries(checks)
      .some(([_, ratio]) => ratio >= this.config.softLimitThreshold);

    const limits = Object.entries(checks)
      .filter(([_, ratio]) => ratio >= this.config.softLimitThreshold)
      .map(([limit, ratio]) => ({
        limit,
        ratio: Math.round(ratio * 100),
        threshold: Math.round(this.config.softLimitThreshold * 100)
      }));

    return {
      approachingLimit,
      limits,
      currentUsage: checks
    };
  }

  /**
   * Calculate remaining quota
   */
  calculateRemaining(usage, quota) {
    return {
      requests: {
        perMinute: Math.max(0, quota.requestsPerMinute - usage.requestsPerMinute),
        perHour: Math.max(0, quota.requestsPerHour - usage.requestsPerHour),
        perDay: Math.max(0, quota.requestsPerDay - usage.requestsPerDay)
      },
      tokens: {
        perMinute: Math.max(0, quota.tokensPerMinute - usage.tokensPerMinute),
        perHour: Math.max(0, quota.tokensPerHour - usage.tokensPerHour),
        perDay: Math.max(0, quota.tokensPerDay - usage.tokensPerDay)
      },
      concurrentRequests: Math.max(0, quota.concurrentRequests - usage.concurrentRequests)
    };
  }

  /**
   * Reset usage counters based on time windows
   */
  resetUsageCounters() {
    const now = Date.now();

    for (const [userId, usage] of this.usage.entries()) {
      // Reset minute counters
      if (now - usage.lastResetMinute >= this.config.resetIntervals.minute) {
        usage.requestsPerMinute = 0;
        usage.tokensPerMinute = 0;
        usage.lastResetMinute = now;
      }

      // Reset hour counters
      if (now - usage.lastResetHour >= this.config.resetIntervals.hour) {
        usage.requestsPerHour = 0;
        usage.tokensPerHour = 0;
        usage.lastResetHour = now;
      }

      // Reset day counters
      if (now - usage.lastResetDay >= this.config.resetIntervals.day) {
        usage.requestsPerDay = 0;
        usage.tokensPerDay = 0;
        usage.lastResetDay = now;
      }

      // Reset concurrent requests (safety check)
      if (usage.concurrentRequests > 0 && now - usage.lastUsed > 60000) {
        usage.concurrentRequests = 0;
      }
    }

    logger.debug('Usage counters reset completed');
  }

  /**
   * Start quota reset timers
   */
  startQuotaResetTimers() {
    // Reset minute counters every minute
    setInterval(() => {
      this.resetUsageCounters();
    }, 60000);

    logger.info('Quota reset timers started');
  }

  /**
   * Get quota information for user
   */
  getQuotaInfo(userId) {
    const quota = this.getUserQuota(userId);
    const usage = this.getUserUsage(userId);
    const remaining = this.calculateRemaining(usage, quota);
    const softLimitInfo = this.checkSoftLimits(usage, quota);

    return {
      userId,
      quota,
      usage: {
        requests: {
          perMinute: usage.requestsPerMinute,
          perHour: usage.requestsPerHour,
          perDay: usage.requestsPerDay,
          total: usage.totalRequests
        },
        tokens: {
          perMinute: usage.tokensPerMinute,
          perHour: usage.tokensPerHour,
          perDay: usage.tokensPerDay,
          total: usage.totalTokens
        },
        cost: usage.totalCost,
        concurrentRequests: usage.concurrentRequests,
        lastUsed: usage.lastUsed
      },
      remaining,
      softLimitInfo,
      resetIntervals: this.config.resetIntervals
    };
  }

  /**
   * Get usage statistics
   */
  getUsageStats(userId, options = {}) {
    const {
      startDate,
      endDate = new Date().toISOString()
    } = options;

    const usage = this.getUserUsage(userId);
    
    // Filter history by date range
    let history = usage.history;
    if (startDate) {
      history = history.filter(entry => 
        entry.timestamp >= new Date(startDate).getTime()
      );
    }
    if (endDate) {
      history = history.filter(entry => 
        entry.timestamp <= new Date(endDate).getTime()
      );
    }

    // Calculate statistics
    const stats = {
      userId,
      period: {
        start: startDate || new Date(Math.min(...history.map(h => h.timestamp))).toISOString(),
        end: endDate
      },
      totalRequests: history.length,
      successfulRequests: history.filter(h => h.success).length,
      failedRequests: history.filter(h => !h.success).length,
      totalTokens: history.reduce((sum, h) => sum + h.tokens, 0),
      totalCost: history.reduce((sum, h) => sum + h.cost, 0),
      averageTokensPerRequest: history.length > 0 
        ? history.reduce((sum, h) => sum + h.tokens, 0) / history.length 
        : 0,
      averageCostPerRequest: history.length > 0 
        ? history.reduce((sum, h) => sum + h.cost, 0) / history.length 
        : 0,
      requestTypes: {},
      hourlyDistribution: {},
      dailyDistribution: {}
    };

    // Calculate request type distribution
    history.forEach(entry => {
      stats.requestTypes[entry.requestType] = 
        (stats.requestTypes[entry.requestType] || 0) + 1;
    });

    // Calculate hourly distribution
    history.forEach(entry => {
      const hour = new Date(entry.timestamp).getHours();
      stats.hourlyDistribution[hour] = 
        (stats.hourlyDistribution[hour] || 0) + 1;
    });

    // Calculate daily distribution
    history.forEach(entry => {
      const day = new Date(entry.timestamp).toISOString().split('T')[0];
      stats.dailyDistribution[day] = 
        (stats.dailyDistribution[day] || 0) + 1;
    });

    return stats;
  }

  /**
   * Reset user quota
   */
  resetUserQuota(userId) {
    const usage = this.getUserUsage(userId);
    
    // Reset all counters
    usage.requestsPerMinute = 0;
    usage.requestsPerHour = 0;
    usage.requestsPerDay = 0;
    usage.tokensPerMinute = 0;
    usage.tokensPerHour = 0;
    usage.tokensPerDay = 0;
    usage.concurrentRequests = 0;
    usage.lastResetMinute = Date.now();
    usage.lastResetHour = Date.now();
    usage.lastResetDay = Date.now();

    logger.info('User quota reset', { userId });
    return this.getQuotaInfo(userId);
  }

  /**
   * Cleanup old usage data
   */
  cleanupOldUsage(maxAgeDays = 30) {
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [userId, usage] of this.usage.entries()) {
      // Remove old history entries
      const oldLength = usage.history.length;
      usage.history = usage.history.filter(entry => entry.timestamp > cutoffTime);
      
      if (usage.history.length !== oldLength) {
        cleaned += oldLength - usage.history.length;
      }

      // Remove users with no recent activity
      if (usage.lastUsed < cutoffTime && usage.history.length === 0) {
        this.usage.delete(userId);
        cleaned++;
      }
    }

    logger.info('Usage data cleanup completed', { cleaned, maxAgeDays });
    return cleaned;
  }

  /**
   * Health check
   */
  healthCheck() {
    try {
      const totalUsers = this.usage.size;
      const totalRequests = Array.from(this.usage.values())
        .reduce((sum, usage) => sum + usage.totalRequests, 0);

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        totalUsers,
        totalRequests,
        activeUsers: Array.from(this.usage.values()).filter(u => 
          Date.now() - u.lastUsed < 60000
        ).length
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

module.exports = new QuotaService();