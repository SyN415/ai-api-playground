const UsageLog = require('../models/UsageLog');
const RequestLog = require('../models/RequestLog');
const analyticsService = require('./analyticsService');
const logger = require('../utils/logger');

/**
 * Monitoring Service
 * Provides real-time monitoring, alerting, and system health tracking
 */
class MonitoringService {
  constructor() {
    this.alerts = new Map();
    this.metrics = new Map();
    this.thresholds = {
      // Usage thresholds
      dailyCost: 100, // $100 per day
      hourlyCost: 20, // $20 per hour
      errorRate: 5, // 5% error rate
      responseTime: 5000, // 5 seconds
      concurrentRequests: 100, // 100 concurrent requests
      
      // User-specific thresholds
      userDailyCost: 10, // $10 per user per day
      userHourlyRequests: 100, // 100 requests per user per hour
      
      // System thresholds
      cpuUsage: 80, // 80% CPU usage
      memoryUsage: 85, // 85% memory usage
      diskUsage: 90 // 90% disk usage
    };
    
    this.alertCallbacks = [];
    this.monitoringIntervals = new Map();
    
    // Start monitoring intervals
    this.startMonitoring();
  }

  /**
   * Start monitoring intervals
   */
  startMonitoring() {
    // Real-time usage monitoring (every 30 seconds)
    this.monitoringIntervals.set('usage', setInterval(() => {
      this.monitorUsage();
    }, 30000));

    // Performance monitoring (every minute)
    this.monitoringIntervals.set('performance', setInterval(() => {
      this.monitorPerformance();
    }, 60000));

    // Error rate monitoring (every 2 minutes)
    this.monitoringIntervals.set('errors', setInterval(() => {
      this.monitorErrorRates();
    }, 120000));

    // System health monitoring (every 5 minutes)
    this.monitoringIntervals.set('health', setInterval(() => {
      this.monitorSystemHealth();
    }, 300000));

    logger.info('Monitoring service started');
  }

  /**
   * Stop monitoring intervals
   */
  stopMonitoring() {
    for (const [name, interval] of this.monitoringIntervals) {
      clearInterval(interval);
      logger.info(`Monitoring interval stopped: ${name}`);
    }
    this.monitoringIntervals.clear();
  }

  /**
   * Monitor usage in real-time
   */
  async monitorUsage() {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      // Get current usage statistics
      const [hourlyStats, dailyStats] = await Promise.all([
        analyticsService.getUsageStats({ startDate: oneHourAgo }),
        analyticsService.getUsageStats({ startDate: oneDayAgo })
      ]);

      // Check system-wide thresholds
      if (hourlyStats.totalCost > this.thresholds.hourlyCost) {
        await this.triggerAlert('high_hourly_cost', {
          current: hourlyStats.totalCost,
          threshold: this.thresholds.hourlyCost,
          period: 'hour'
        });
      }

      if (dailyStats.totalCost > this.thresholds.dailyCost) {
        await this.triggerAlert('high_daily_cost', {
          current: dailyStats.totalCost,
          threshold: this.thresholds.dailyCost,
          period: 'day'
        });
      }

      // Check user-specific thresholds
      const userActivity = await analyticsService.getUserActivity({
        startDate: oneHourAgo,
        limit: 100
      });

      for (const user of userActivity.users) {
        if (user.totalCost > this.thresholds.userDailyCost) {
          await this.triggerAlert('user_high_cost', {
            userId: user.userId,
            current: user.totalCost,
            threshold: this.thresholds.userDailyCost
          });
        }

        if (user.requestCount > this.thresholds.userHourlyRequests) {
          await this.triggerAlert('user_high_requests', {
            userId: user.userId,
            current: user.requestCount,
            threshold: this.thresholds.userHourlyRequests
          });
        }
      }

      // Store metrics for dashboard
      this.metrics.set('usage', {
        timestamp: now.toISOString(),
        hourlyCost: hourlyStats.totalCost,
        dailyCost: dailyStats.totalCost,
        hourlyRequests: hourlyStats.totalRequests,
        dailyRequests: dailyStats.totalRequests,
        activeUsers: dailyStats.uniqueUsers
      });

    } catch (error) {
      logger.error('Usage monitoring failed:', error);
    }
  }

  /**
   * Monitor performance metrics
   */
  async monitorPerformance() {
    try {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

      const performanceMetrics = await analyticsService.getPerformanceMetrics({
        startDate: fiveMinutesAgo
      });

      // Check response time threshold
      if (performanceMetrics.averageResponseTime > this.thresholds.responseTime) {
        await this.triggerAlert('high_response_time', {
          current: performanceMetrics.averageResponseTime,
          threshold: this.thresholds.responseTime,
          p95: performanceMetrics.p95ResponseTime,
          p99: performanceMetrics.p99ResponseTime
        });
      }

      // Store performance metrics
      this.metrics.set('performance', {
        timestamp: now.toISOString(),
        averageResponseTime: performanceMetrics.averageResponseTime,
        p50ResponseTime: performanceMetrics.p50ResponseTime,
        p95ResponseTime: performanceMetrics.p95ResponseTime,
        p99ResponseTime: performanceMetrics.p99ResponseTime,
        totalRequests: performanceMetrics.totalRequests
      });

    } catch (error) {
      logger.error('Performance monitoring failed:', error);
    }
  }

  /**
   * Monitor error rates
   */
  async monitorErrorRates() {
    try {
      const now = new Date();
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

      const errorRate = await analyticsService.calculateErrorRate({
        startDate: fifteenMinutesAgo
      });

      // Check error rate threshold
      if (errorRate > this.thresholds.errorRate) {
        await this.triggerAlert('high_error_rate', {
          current: errorRate,
          threshold: this.thresholds.errorRate,
          period: '15 minutes'
        });
      }

      // Get error analysis
      const errorAnalysis = await analyticsService.getErrorAnalysis({
        startDate: fifteenMinutesAgo,
        limit: 50
      });

      // Store error metrics
      this.metrics.set('errors', {
        timestamp: now.toISOString(),
        errorRate,
        totalErrors: errorAnalysis.totalErrors,
        errorPatterns: errorAnalysis.errorPatterns
      });

    } catch (error) {
      logger.error('Error rate monitoring failed:', error);
    }
  }

  /**
   * Monitor system health
   */
  async monitorSystemHealth() {
    try {
      const now = new Date();
      
      // Get system usage statistics
      const dailyStats = await analyticsService.getUsageStats({
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
      });

      // Check system capacity
      const concurrentRequests = dailyStats.totalRequests / 24; // Rough estimate
      if (concurrentRequests > this.thresholds.concurrentRequests) {
        await this.triggerAlert('high_concurrent_requests', {
          current: concurrentRequests,
          threshold: this.thresholds.concurrentRequests
        });
      }

      // Store system health metrics
      this.metrics.set('system', {
        timestamp: now.toISOString(),
        totalRequests24h: dailyStats.totalRequests,
        totalCost24h: dailyStats.totalCost,
        uniqueUsers24h: dailyStats.uniqueUsers,
        averageResponseTime: dailyStats.averageResponseTime,
        errorRate: (dailyStats.failedRequests / dailyStats.totalRequests) * 100
      });

    } catch (error) {
      logger.error('System health monitoring failed:', error);
    }
  }

  /**
   * Trigger an alert
   */
  async triggerAlert(type, data) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: new Date().toISOString(),
      severity: this.getAlertSeverity(type, data)
    };

    // Store alert
    this.alerts.set(alert.id, alert);

    // Log alert
    logger.warn(`Alert triggered: ${type}`, {
      alertId: alert.id,
      severity: alert.severity,
      data
    });

    // Call alert callbacks
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Alert callback failed:', error);
      }
    });

    // Cleanup old alerts (keep last 1000)
    if (this.alerts.size > 1000) {
      const oldestAlerts = Array.from(this.alerts.entries())
        .sort(([,a], [,b]) => new Date(a.timestamp) - new Date(b.timestamp))
        .slice(0, this.alerts.size - 1000);
      
      oldestAlerts.forEach(([id]) => this.alerts.delete(id));
    }

    return alert;
  }

  /**
   * Get alert severity based on type and data
   */
  getAlertSeverity(type, data) {
    const severityMap = {
      'high_daily_cost': 'high',
      'high_hourly_cost': 'high',
      'user_high_cost': 'medium',
      'user_high_requests': 'medium',
      'high_response_time': 'medium',
      'high_error_rate': 'high',
      'high_concurrent_requests': 'medium'
    };

    // Adjust severity based on how far over threshold
    const baseSeverity = severityMap[type] || 'low';
    
    if (data.current && data.threshold) {
      const ratio = data.current / data.threshold;
      if (ratio > 2) return 'critical';
      if (ratio > 1.5) return 'high';
    }

    return baseSeverity;
  }

  /**
   * Add alert callback
   */
  addAlertCallback(callback) {
    if (typeof callback === 'function') {
      this.alertCallbacks.push(callback);
      logger.info('Alert callback added');
    }
  }

  /**
   * Remove alert callback
   */
  removeAlertCallback(callback) {
    const index = this.alertCallbacks.indexOf(callback);
    if (index > -1) {
      this.alertCallbacks.splice(index, 1);
      logger.info('Alert callback removed');
    }
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(options = {}) {
    const {
      limit = 100,
      severity = null,
      type = null
    } = options;

    let alerts = Array.from(this.alerts.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }

    if (type) {
      alerts = alerts.filter(alert => alert.type === type);
    }

    return alerts.slice(0, limit);
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics() {
    return Object.fromEntries(this.metrics);
  }

  /**
   * Get quota threshold status
   */
  async getQuotaStatus(userId) {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const [hourlyStats, dailyStats] = await Promise.all([
        analyticsService.getUsageStats({ userId, startDate: oneHourAgo }),
        analyticsService.getUsageStats({ userId, startDate: oneDayAgo })
      ]);

      const status = {
        userId,
        timestamp: now.toISOString(),
        thresholds: {
          hourlyRequests: {
            current: hourlyStats.totalRequests,
            threshold: this.thresholds.userHourlyRequests,
            percentage: (hourlyStats.totalRequests / this.thresholds.userHourlyRequests) * 100,
            exceeded: hourlyStats.totalRequests > this.thresholds.userHourlyRequests
          },
          dailyCost: {
            current: dailyStats.totalCost,
            threshold: this.thresholds.userDailyCost,
            percentage: (dailyStats.totalCost / this.thresholds.userDailyCost) * 100,
            exceeded: dailyStats.totalCost > this.thresholds.userDailyCost
          }
        },
        overall: 'ok'
      };

      // Determine overall status
      const exceeded = Object.values(status.thresholds).filter(t => t.exceeded);
      if (exceeded.length > 0) {
        status.overall = 'warning';
      }
      if (exceeded.some(t => t.percentage > 150)) {
        status.overall = 'critical';
      }

      return status;
    } catch (error) {
      logger.error('Error getting quota status:', error);
      throw error;
    }
  }

  /**
   * Set custom thresholds
   */
  setThresholds(thresholds) {
    this.thresholds = {
      ...this.thresholds,
      ...thresholds
    };
    logger.info('Monitoring thresholds updated', { thresholds: this.thresholds });
  }

  /**
   * Get current thresholds
   */
  getThresholds() {
    return { ...this.thresholds };
  }

  /**
   * Clear old metrics and alerts
   */
  cleanupOldData(maxAgeHours = 24) {
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    let cleaned = 0;

    // Clean metrics
    for (const [key, metric] of this.metrics) {
      if (new Date(metric.timestamp).getTime() < cutoffTime) {
        this.metrics.delete(key);
        cleaned++;
      }
    }

    // Clean alerts
    for (const [id, alert] of this.alerts) {
      if (new Date(alert.timestamp).getTime() < cutoffTime) {
        this.alerts.delete(id);
        cleaned++;
      }
    }

    logger.info('Monitoring data cleanup completed', { cleaned, maxAgeHours });
    return cleaned;
  }

  /**
   * Health check
   */
  healthCheck() {
    const activeIntervals = this.monitoringIntervals.size;
    const recentAlerts = this.getRecentAlerts({ limit: 10 });
    const criticalAlerts = recentAlerts.filter(alert => alert.severity === 'critical').length;

    return {
      status: activeIntervals > 0 ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      activeIntervals,
      totalAlerts: this.alerts.size,
      recentAlerts: recentAlerts.length,
      criticalAlerts,
      metricsCount: this.metrics.size,
      callbacksCount: this.alertCallbacks.length
    };
  }
}

module.exports = new MonitoringService();