const db = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * UsageLog Model
 * Tracks AI API usage, costs, and analytics for users and the system
 */
class UsageLog {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.userId = data.userId || null;
    this.requestId = data.requestId || null;
    this.provider = data.provider || 'unknown';
    this.model = data.model || 'unknown';
    this.taskType = data.taskType || 'generation';
    this.tokensInput = data.tokensInput || 0;
    this.tokensOutput = data.tokensOutput || 0;
    this.tokensTotal = data.tokensTotal || 0;
    this.cost = data.cost || 0;
    this.costCurrency = data.costCurrency || 'USD';
    this.status = data.status || 'success';
    this.error = data.error || null;
    this.ipAddress = data.ipAddress || null;
    this.userAgent = data.userAgent || null;
    this.endpoint = data.endpoint || null;
    this.responseTime = data.responseTime || 0;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.metadata = data.metadata || {};
  }

  /**
   * Create a new usage log entry
   */
  static async create(usageData) {
    try {
      const usageLog = new UsageLog(usageData);
      
      const client = db.getClient();
      const { data, error } = await client
        .from('usage_logs')
        .insert([{
          id: usageLog.id,
          user_id: usageLog.userId,
          request_id: usageLog.requestId,
          provider: usageLog.provider,
          model: usageLog.model,
          task_type: usageLog.taskType,
          tokens_input: usageLog.tokensInput,
          tokens_output: usageLog.tokensOutput,
          tokens_total: usageLog.tokensTotal,
          cost: usageLog.cost,
          cost_currency: usageLog.costCurrency,
          status: usageLog.status,
          error: usageLog.error,
          ip_address: usageLog.ipAddress,
          user_agent: usageLog.userAgent,
          endpoint: usageLog.endpoint,
          response_time: usageLog.responseTime,
          created_at: usageLog.createdAt,
          metadata: usageLog.metadata
        }])
        .select()
        .single();

      if (error) {
        logger.error('Usage log creation failed:', error);
        throw new Error(`Usage log creation failed: ${error.message}`);
      }

      logger.info(`Usage log created: ${data.id}`, {
        userId: data.user_id,
        provider: data.provider,
        model: data.model,
        cost: data.cost,
        tokens: data.tokens_total
      });

      return new UsageLog(data);
    } catch (error) {
      logger.error('Usage log creation error:', error);
      throw error;
    }
  }

  /**
   * Find usage log by ID
   */
  static async findById(id) {
    try {
      const client = db.getClient();
      const { data, error } = await client
        .from('usage_logs')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Database error in findById:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      return data ? new UsageLog(data) : null;
    } catch (error) {
      logger.error('Error finding usage log by ID:', error);
      throw error;
    }
  }

  /**
   * Find usage logs by user ID with filtering
   */
  static async findByUserId(userId, options = {}) {
    try {
      const {
        startDate = null,
        endDate = null,
        provider = null,
        model = null,
        taskType = null,
        status = null,
        limit = 100,
        offset = 0
      } = options;

      const client = db.getClient();
      let query = client
        .from('usage_logs')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      if (provider) {
        query = query.eq('provider', provider);
      }

      if (model) {
        query = query.eq('model', model);
      }

      if (taskType) {
        query = query.eq('task_type', taskType);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query;

      if (error) {
        logger.error('Database error in findByUserId:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      return {
        logs: data.map(log => new UsageLog(log)),
        total: count || data.length,
        limit,
        offset
      };
    } catch (error) {
      logger.error('Error finding usage logs by user ID:', error);
      throw error;
    }
  }

  /**
   * Get usage statistics for a user
   */
  static async getUserStats(userId, options = {}) {
    try {
      const {
        startDate = null,
        endDate = new Date().toISOString()
      } = options;

      const client = db.getClient();
      let query = client
        .from('usage_logs')
        .select('*')
        .eq('user_id', userId);

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Database error in getUserStats:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      const logs = data.map(log => new UsageLog(log));
      
      const stats = {
        userId,
        period: {
          start: startDate || (logs.length > 0 ? logs[logs.length - 1].createdAt : new Date().toISOString()),
          end: endDate
        },
        totalRequests: logs.length,
        successfulRequests: logs.filter(log => log.status === 'success').length,
        failedRequests: logs.filter(log => log.status === 'error').length,
        totalTokens: logs.reduce((sum, log) => sum + log.tokensTotal, 0),
        totalInputTokens: logs.reduce((sum, log) => sum + log.tokensInput, 0),
        totalOutputTokens: logs.reduce((sum, log) => sum + log.tokensOutput, 0),
        totalCost: logs.reduce((sum, log) => sum + log.cost, 0),
        averageResponseTime: logs.length > 0 
          ? logs.reduce((sum, log) => sum + log.responseTime, 0) / logs.length 
          : 0,
        providers: {},
        models: {},
        taskTypes: {},
        dailyUsage: {},
        hourlyUsage: {}
      };

      // Calculate breakdowns
      logs.forEach(log => {
        // Provider breakdown
        stats.providers[log.provider] = (stats.providers[log.provider] || 0) + 1;
        
        // Model breakdown
        stats.models[log.model] = (stats.models[log.model] || 0) + 1;
        
        // Task type breakdown
        stats.taskTypes[log.taskType] = (stats.taskTypes[log.taskType] || 0) + 1;

        // Daily usage
        const day = log.createdAt.split('T')[0];
        stats.dailyUsage[day] = (stats.dailyUsage[day] || 0) + 1;

        // Hourly usage
        const hour = new Date(log.createdAt).getHours();
        stats.hourlyUsage[hour] = (stats.hourlyUsage[hour] || 0) + 1;
      });

      return stats;
    } catch (error) {
      logger.error('Error getting user usage statistics:', error);
      throw error;
    }
  }

  /**
   * Get system-wide usage statistics
   */
  static async getSystemStats(options = {}) {
    try {
      const {
        startDate = null,
        endDate = new Date().toISOString()
      } = options;

      const client = db.getClient();
      let query = client
        .from('usage_logs')
        .select('*');

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Database error in getSystemStats:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      const logs = data.map(log => new UsageLog(log));
      
      const stats = {
        period: {
          start: startDate || (logs.length > 0 ? logs[logs.length - 1].createdAt : new Date().toISOString()),
          end: endDate
        },
        totalRequests: logs.length,
        successfulRequests: logs.filter(log => log.status === 'success').length,
        failedRequests: logs.filter(log => log.status === 'error').length,
        totalTokens: logs.reduce((sum, log) => sum + log.tokensTotal, 0),
        totalInputTokens: logs.reduce((sum, log) => sum + log.tokensInput, 0),
        totalOutputTokens: logs.reduce((sum, log) => sum + log.tokensOutput, 0),
        totalCost: logs.reduce((sum, log) => sum + log.cost, 0),
        averageResponseTime: logs.length > 0 
          ? logs.reduce((sum, log) => sum + log.responseTime, 0) / logs.length 
          : 0,
        uniqueUsers: new Set(logs.map(log => log.userId).filter(Boolean)).size,
        providers: {},
        models: {},
        taskTypes: {},
        dailyUsage: {},
        hourlyUsage: {},
        userActivity: {}
      };

      // Calculate breakdowns
      logs.forEach(log => {
        // Provider breakdown
        stats.providers[log.provider] = (stats.providers[log.provider] || 0) + 1;
        
        // Model breakdown
        stats.models[log.model] = (stats.models[log.model] || 0) + 1;
        
        // Task type breakdown
        stats.taskTypes[log.taskType] = (stats.taskTypes[log.taskType] || 0) + 1;

        // Daily usage
        const day = log.createdAt.split('T')[0];
        stats.dailyUsage[day] = (stats.dailyUsage[day] || 0) + 1;

        // Hourly usage
        const hour = new Date(log.createdAt).getHours();
        stats.hourlyUsage[hour] = (stats.hourlyUsage[hour] || 0) + 1;

        // User activity
        if (log.userId) {
          stats.userActivity[log.userId] = (stats.userActivity[log.userId] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      logger.error('Error getting system usage statistics:', error);
      throw error;
    }
  }

  /**
   * Calculate cost for Minimax usage
   */
  static calculateMinimaxCost(model, tokensInput = 0, tokensOutput = 0, taskType = 'generation') {
    // Minimax pricing (example rates - adjust based on actual pricing)
    const pricing = {
      'hailuo-2.3': {
        input: 0.0001,  // $0.0001 per input token
        output: 0.0002, // $0.0002 per output token
        video: 0.05     // $0.05 per video generation
      },
      'hailuo-1.5': {
        input: 0.00008,
        output: 0.00016,
        video: 0.04
      }
    };

    const modelPricing = pricing[model] || pricing['hailuo-2.3'];
    
    let cost = 0;
    
    if (taskType === 'video_generation') {
      cost = modelPricing.video;
    } else {
      cost = (tokensInput * modelPricing.input) + (tokensOutput * modelPricing.output);
    }

    return cost;
  }

  /**
   * Get cost breakdown by user
   */
  static async getCostBreakdown(userId, options = {}) {
    try {
      const {
        startDate = null,
        endDate = new Date().toISOString()
      } = options;

      const client = db.getClient();
      let query = client
        .from('usage_logs')
        .select('*')
        .eq('user_id', userId);

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Database error in getCostBreakdown:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      const logs = data.map(log => new UsageLog(log));
      
      const breakdown = {
        userId,
        period: {
          start: startDate || (logs.length > 0 ? logs[logs.length - 1].createdAt : new Date().toISOString()),
          end: endDate
        },
        totalCost: logs.reduce((sum, log) => sum + log.cost, 0),
        costByProvider: {},
        costByModel: {},
        costByTaskType: {},
        dailyCosts: {}
      };

      // Calculate cost breakdowns
      logs.forEach(log => {
        // Cost by provider
        breakdown.costByProvider[log.provider] = 
          (breakdown.costByProvider[log.provider] || 0) + log.cost;
        
        // Cost by model
        breakdown.costByModel[log.model] = 
          (breakdown.costByModel[log.model] || 0) + log.cost;
        
        // Cost by task type
        breakdown.costByTaskType[log.taskType] = 
          (breakdown.costByTaskType[log.taskType] || 0) + log.cost;

        // Daily costs
        const day = log.createdAt.split('T')[0];
        breakdown.dailyCosts[day] = 
          (breakdown.dailyCosts[day] || 0) + log.cost;
      });

      return breakdown;
    } catch (error) {
      logger.error('Error getting cost breakdown:', error);
      throw error;
    }
  }

  /**
   * Sanitize usage log data for public response
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      requestId: this.requestId,
      provider: this.provider,
      model: this.model,
      taskType: this.taskType,
      tokensInput: this.tokensInput,
      tokensOutput: this.tokensOutput,
      tokensTotal: this.tokensTotal,
      cost: this.cost,
      costCurrency: this.costCurrency,
      status: this.status,
      error: this.error,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
      endpoint: this.endpoint,
      responseTime: this.responseTime,
      createdAt: this.createdAt,
      metadata: this.metadata
    };
  }
}

module.exports = UsageLog;