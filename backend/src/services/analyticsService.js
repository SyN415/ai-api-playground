const UsageLog = require('../models/UsageLog');
const RequestLog = require('../models/RequestLog');
const MinimaxTask = require('../models/MinimaxTask');
const logger = require('../utils/logger');

/**
 * Analytics Service
 * Provides comprehensive analytics and reporting for API usage, costs, and performance
 */
class AnalyticsService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get cached data or compute and cache new data
   */
  async getCached(key, computeFn) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const data = await computeFn();
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    return data;
  }

  /**
   * Get usage statistics with caching
   */
  async getUsageStats(options = {}) {
    const {
      userId = null,
      startDate = null,
      endDate = new Date().toISOString(),
      groupBy = 'day' // day, hour, week, month
    } = options;

    const cacheKey = `usage_${userId}_${startDate}_${endDate}_${groupBy}`;
    
    return this.getCached(cacheKey, async () => {
      try {
        if (userId) {
          return await UsageLog.getUserStats(userId, { startDate, endDate });
        } else {
          return await UsageLog.getSystemStats({ startDate, endDate });
        }
      } catch (error) {
        logger.error('Error getting usage statistics:', error);
        throw error;
      }
    });
  }

  /**
   * Get cost analysis and breakdown
   */
  async getCostAnalysis(options = {}) {
    const {
      userId = null,
      startDate = null,
      endDate = new Date().toISOString(),
      groupBy = 'day'
    } = options;

    const cacheKey = `cost_${userId}_${startDate}_${endDate}_${groupBy}`;
    
    return this.getCached(cacheKey, async () => {
      try {
        if (userId) {
          return await UsageLog.getCostBreakdown(userId, { startDate, endDate });
        } else {
          // Get system-wide cost breakdown
          const stats = await UsageLog.getSystemStats({ startDate, endDate });
          const costByProvider = {};
          const costByModel = {};
          const costByTaskType = {};
          const dailyCosts = {};

          // This would need to be enhanced to properly aggregate costs
          // For now, we'll use the existing stats structure
          return {
            period: stats.period,
            totalCost: stats.totalCost,
            costByProvider: stats.providers,
            costByModel: stats.models,
            costByTaskType: stats.taskTypes,
            dailyCosts: stats.dailyUsage
          };
        }
      } catch (error) {
        logger.error('Error getting cost analysis:', error);
        throw error;
      }
    });
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(options = {}) {
    const {
      userId = null,
      startDate = null,
      endDate = new Date().toISOString(),
      endpoint = null
    } = options;

    const cacheKey = `performance_${userId}_${startDate}_${endDate}_${endpoint}`;
    
    return this.getCached(cacheKey, async () => {
      try {
        return await RequestLog.getPerformanceMetrics({ startDate, endDate, endpoint });
      } catch (error) {
        logger.error('Error getting performance metrics:', error);
        throw error;
      }
    });
  }

  /**
   * Get user activity analytics
   */
  async getUserActivity(options = {}) {
    const {
      startDate = null,
      endDate = new Date().toISOString(),
      limit = 100,
      offset = 0
    } = options;

    const cacheKey = `user_activity_${startDate}_${endDate}_${limit}_${offset}`;
    
    return this.getCached(cacheKey, async () => {
      try {
        const client = db.getClient();
        let query = client
          .from('usage_logs')
          .select('user_id, COUNT(*) as request_count, SUM(cost) as total_cost, SUM(tokens_total) as total_tokens')
          .not('user_id', 'is', null)
          .groupBy('user_id')
          .order('request_count', { ascending: false })
          .range(offset, offset + limit - 1);

        if (startDate) {
          query = query.gte('created_at', startDate);
        }

        if (endDate) {
          query = query.lte('created_at', endDate);
        }

        const { data, error, count } = await query;

        if (error) {
          logger.error('Database error in getUserActivity:', error);
          throw new Error(`Database error: ${error.message}`);
        }

        return {
          users: data.map(row => ({
            userId: row.user_id,
            requestCount: parseInt(row.request_count),
            totalCost: parseFloat(row.total_cost) || 0,
            totalTokens: parseInt(row.total_tokens) || 0
          })),
          total: count || data.length,
          limit,
          offset
        };
      } catch (error) {
        logger.error('Error getting user activity:', error);
        throw error;
      }
    });
  }

  /**
   * Get API endpoint usage patterns
   */
  async getEndpointUsage(options = {}) {
    const {
      startDate = null,
      endDate = new Date().toISOString(),
      limit = 50
    } = options;

    const cacheKey = `endpoints_${startDate}_${endDate}_${limit}`;
    
    return this.getCached(cacheKey, async () => {
      try {
        const client = db.getClient();
        let query = client
          .from('request_logs')
          .select('endpoint, COUNT(*) as request_count, AVG(response_time) as avg_response_time')
          .not('endpoint', 'is', null)
          .groupBy('endpoint')
          .order('request_count', { ascending: false })
          .limit(limit);

        if (startDate) {
          query = query.gte('created_at', startDate);
        }

        if (endDate) {
          query = query.lte('created_at', endDate);
        }

        const { data, error } = await query;

        if (error) {
          logger.error('Database error in getEndpointUsage:', error);
          throw new Error(`Database error: ${error.message}`);
        }

        return data.map(row => ({
          endpoint: row.endpoint,
          requestCount: parseInt(row.request_count),
          averageResponseTime: parseFloat(row.avg_response_time) || 0
        }));
      } catch (error) {
        logger.error('Error getting endpoint usage:', error);
        throw error;
      }
    });
  }

  /**
   * Get provider comparison analytics
   */
  async getProviderComparison(options = {}) {
    const {
      startDate = null,
      endDate = new Date().toISOString()
    } = options;

    const cacheKey = `providers_${startDate}_${endDate}`;
    
    return this.getCached(cacheKey, async () => {
      try {
        const client = db.getClient();
        let query = client
          .from('usage_logs')
          .select('provider, COUNT(*) as request_count, SUM(cost) as total_cost, AVG(response_time) as avg_response_time')
          .not('provider', 'is', null)
          .groupBy('provider')
          .order('request_count', { ascending: false });

        if (startDate) {
          query = query.gte('created_at', startDate);
        }

        if (endDate) {
          query = query.lte('created_at', endDate);
        }

        const { data, error } = await query;

        if (error) {
          logger.error('Database error in getProviderComparison:', error);
          throw new Error(`Database error: ${error.message}`);
        }

        return data.map(row => ({
          provider: row.provider,
          requestCount: parseInt(row.request_count),
          totalCost: parseFloat(row.total_cost) || 0,
          averageResponseTime: parseFloat(row.avg_response_time) || 0,
          averageCostPerRequest: parseFloat(row.total_cost) / parseInt(row.request_count) || 0
        }));
      } catch (error) {
        logger.error('Error getting provider comparison:', error);
        throw error;
      }
    });
  }

  /**
   * Get error tracking and analysis
   */
  async getErrorAnalysis(options = {}) {
    const {
      userId = null,
      startDate = null,
      endDate = new Date().toISOString(),
      limit = 100
    } = options;

    const cacheKey = `errors_${userId}_${startDate}_${endDate}_${limit}`;
    
    return this.getCached(cacheKey, async () => {
      try {
        const errorLogs = await RequestLog.getErrorLogs({
          userId,
          startDate,
          endDate,
          limit
        });

        // Analyze error patterns
        const errorPatterns = {};
        errorLogs.errors.forEach(log => {
          const errorType = log.error.split(':')[0] || 'Unknown';
          errorPatterns[errorType] = (errorPatterns[errorType] || 0) + 1;
        });

        return {
          totalErrors: errorLogs.total,
          errorPatterns,
          recentErrors: errorLogs.errors,
          errorRate: await this.calculateErrorRate({ userId, startDate, endDate })
        };
      } catch (error) {
        logger.error('Error getting error analysis:', error);
        throw error;
      }
    });
  }

  /**
   * Calculate error rate
   */
  async calculateErrorRate(options = {}) {
    const {
      userId = null,
      startDate = null,
      endDate = new Date().toISOString()
    } = options;

    try {
      const client = db.getClient();
      
      // Get total requests
      let totalQuery = client
        .from('request_logs')
        .select('COUNT(*) as total', { count: 'exact' });

      // Get error requests
      let errorQuery = client
        .from('request_logs')
        .select('COUNT(*) as errors', { count: 'exact' })
        .or('response_status.gte.400,error.not.is.null');

      if (userId) {
        totalQuery = totalQuery.eq('user_id', userId);
        errorQuery = errorQuery.eq('user_id', userId);
      }

      if (startDate) {
        totalQuery = totalQuery.gte('created_at', startDate);
        errorQuery = errorQuery.gte('created_at', startDate);
      }

      if (endDate) {
        totalQuery = totalQuery.lte('created_at', endDate);
        errorQuery = errorQuery.lte('created_at', endDate);
      }

      const [{ data: totalData, error: totalError }, { data: errorData, error: errorError }] = 
        await Promise.all([totalQuery, errorQuery]);

      if (totalError || errorError) {
        throw new Error(`Database error: ${(totalError || errorError).message}`);
      }

      const total = parseInt(totalData[0].total) || 0;
      const errors = parseInt(errorData[0].errors) || 0;

      return total > 0 ? (errors / total) * 100 : 0;
    } catch (error) {
      logger.error('Error calculating error rate:', error);
      throw error;
    }
  }

  /**
   * Get trend analysis
   */
  async getTrendAnalysis(options = {}) {
    const {
      userId = null,
      metric = 'requests', // requests, cost, tokens, response_time
      period = '7d', // 1d, 7d, 30d, 90d
      groupBy = 'day'
    } = options;

    const cacheKey = `trends_${userId}_${metric}_${period}_${groupBy}`;
    
    return this.getCached(cacheKey, async () => {
      try {
        const endDate = new Date().toISOString();
        let startDate;
        
        switch (period) {
          case '1d':
            startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            break;
          case '7d':
            startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            break;
          case '30d':
            startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            break;
          case '90d':
            startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
            break;
          default:
            startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        }

        const client = db.getClient();
        let query = client
          .from('usage_logs')
          .select('*');

        if (userId) {
          query = query.eq('user_id', userId);
        }

        query = query
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .order('created_at', { ascending: true });

        const { data, error } = await query;

        if (error) {
          logger.error('Database error in getTrendAnalysis:', error);
          throw new Error(`Database error: ${error.message}`);
        }

        const logs = data.map(log => new UsageLog(log));
        
        // Group by time period
        const trends = {};
        
        logs.forEach(log => {
          let key;
          const date = new Date(log.createdAt);
          
          switch (groupBy) {
            case 'hour':
              key = date.toISOString().slice(0, 13) + ':00:00';
              break;
            case 'day':
              key = date.toISOString().split('T')[0];
              break;
            case 'week':
              const weekStart = new Date(date);
              weekStart.setDate(date.getDate() - date.getDay());
              key = weekStart.toISOString().split('T')[0];
              break;
            case 'month':
              key = date.toISOString().slice(0, 7) + '-01';
              break;
          }

          if (!trends[key]) {
            trends[key] = {
              timestamp: key,
              requests: 0,
              cost: 0,
              tokens: 0,
              responseTime: 0,
              count: 0
            };
          }

          trends[key].requests++;
          trends[key].cost += log.cost;
          trends[key].tokens += log.tokensTotal;
          trends[key].responseTime += log.responseTime;
          trends[key].count++;
        });

        // Calculate averages
        Object.values(trends).forEach(trend => {
          trend.averageResponseTime = trend.responseTime / trend.count;
        });

        // Convert to array and sort
        const trendArray = Object.values(trends).sort((a, b) => 
          new Date(a.timestamp) - new Date(b.timestamp)
        );

        // Calculate changes
        const result = trendArray.map((trend, index) => {
          const previous = index > 0 ? trendArray[index - 1] : null;
          const change = previous ? {
            requests: previous.requests > 0 ? ((trend.requests - previous.requests) / previous.requests) * 100 : 0,
            cost: previous.cost > 0 ? ((trend.cost - previous.cost) / previous.cost) * 100 : 0,
            tokens: previous.tokens > 0 ? ((trend.tokens - previous.tokens) / previous.tokens) * 100 : 0
          } : null;

          return {
            ...trend,
            change
          };
        });

        return result;
      } catch (error) {
        logger.error('Error getting trend analysis:', error);
        throw error;
      }
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('Analytics cache cleared');
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test database connectivity
      const client = db.getClient();
      const { data, error } = await client
        .from('usage_logs')
        .select('count')
        .limit(1);

      if (error) {
        throw error;
      }

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        cacheSize: this.cache.size,
        cacheTTL: this.cacheTTL
      };
    } catch (error) {
      logger.error('Analytics service health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

module.exports = new AnalyticsService();