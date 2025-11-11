const db = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * RequestLog Model
 * Tracks detailed request and response information for API calls
 */
class RequestLog {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.userId = data.userId || null;
    this.requestId = data.requestId || uuidv4();
    this.method = data.method || 'GET';
    this.endpoint = data.endpoint || '/';
    this.headers = data.headers || {};
    this.queryParams = data.queryParams || {};
    this.body = data.body || null;
    this.ipAddress = data.ipAddress || null;
    this.userAgent = data.userAgent || null;
    this.responseStatus = data.responseStatus || 200;
    this.responseHeaders = data.responseHeaders || {};
    this.responseBody = data.responseBody || null;
    this.responseSize = data.responseSize || 0;
    this.error = data.error || null;
    this.errorStack = data.errorStack || null;
    this.processingTime = data.processingTime || 0;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.metadata = data.metadata || {};
  }

  /**
   * Create a new request log entry
   */
  static async create(requestData) {
    try {
      const requestLog = new RequestLog(requestData);
      
      const client = db.getClient();
      const { data, error } = await client
        .from('request_logs')
        .insert([{
          id: requestLog.id,
          user_id: requestLog.userId,
          request_id: requestLog.requestId,
          method: requestLog.method,
          endpoint: requestLog.endpoint,
          headers: requestLog.headers,
          query_params: requestLog.queryParams,
          body: requestLog.body,
          ip_address: requestLog.ipAddress,
          user_agent: requestLog.userAgent,
          response_status: requestLog.responseStatus,
          response_headers: requestLog.responseHeaders,
          response_body: requestLog.responseBody,
          response_size: requestLog.responseSize,
          error: requestLog.error,
          error_stack: requestLog.errorStack,
          processing_time: requestLog.processingTime,
          created_at: requestLog.createdAt,
          metadata: requestLog.metadata
        }])
        .select()
        .single();

      if (error) {
        logger.error('Request log creation failed:', error);
        throw new Error(`Request log creation failed: ${error.message}`);
      }

      logger.debug(`Request log created: ${data.id}`, {
        userId: data.user_id,
        endpoint: data.endpoint,
        status: data.response_status,
        processingTime: data.processing_time
      });

      return new RequestLog(data);
    } catch (error) {
      logger.error('Request log creation error:', error);
      throw error;
    }
  }

  /**
   * Find request log by ID
   */
  static async findById(id) {
    try {
      const client = db.getClient();
      const { data, error } = await client
        .from('request_logs')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Database error in findById:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      return data ? new RequestLog(data) : null;
    } catch (error) {
      logger.error('Error finding request log by ID:', error);
      throw error;
    }
  }

  /**
   * Find request logs by user ID with filtering
   */
  static async findByUserId(userId, options = {}) {
    try {
      const {
        startDate = null,
        endDate = null,
        endpoint = null,
        method = null,
        status = null,
        limit = 100,
        offset = 0
      } = options;

      const client = db.getClient();
      let query = client
        .from('request_logs')
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

      if (endpoint) {
        query = query.eq('endpoint', endpoint);
      }

      if (method) {
        query = query.eq('method', method);
      }

      if (status) {
        query = query.eq('response_status', status);
      }

      const { data, error, count } = await query;

      if (error) {
        logger.error('Database error in findByUserId:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      return {
        logs: data.map(log => new RequestLog(log)),
        total: count || data.length,
        limit,
        offset
      };
    } catch (error) {
      logger.error('Error finding request logs by user ID:', error);
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  static async getPerformanceMetrics(options = {}) {
    try {
      const {
        startDate = null,
        endDate = new Date().toISOString(),
        endpoint = null
      } = options;

      const client = db.getClient();
      let query = client
        .from('request_logs')
        .select('*');

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      if (endpoint) {
        query = query.eq('endpoint', endpoint);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Database error in getPerformanceMetrics:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      const logs = data.map(log => new RequestLog(log));
      
      const metrics = {
        period: {
          start: startDate || (logs.length > 0 ? logs[logs.length - 1].createdAt : new Date().toISOString()),
          end: endDate
        },
        totalRequests: logs.length,
        averageResponseTime: logs.length > 0 
          ? logs.reduce((sum, log) => sum + log.processingTime, 0) / logs.length 
          : 0,
        p50ResponseTime: this.calculatePercentile(logs, 50, 'processingTime'),
        p95ResponseTime: this.calculatePercentile(logs, 95, 'processingTime'),
        p99ResponseTime: this.calculatePercentile(logs, 99, 'processingTime'),
        minResponseTime: logs.length > 0 ? Math.min(...logs.map(log => log.processingTime)) : 0,
        maxResponseTime: logs.length > 0 ? Math.max(...logs.map(log => log.processingTime)) : 0,
        statusCodes: {},
        endpoints: {},
        hourlyDistribution: {},
        dailyDistribution: {}
      };

      // Calculate status code distribution
      logs.forEach(log => {
        const statusCode = log.responseStatus;
        metrics.statusCodes[statusCode] = (metrics.statusCodes[statusCode] || 0) + 1;
      });

      // Calculate endpoint distribution
      logs.forEach(log => {
        if (log.endpoint) {
          metrics.endpoints[log.endpoint] = (metrics.endpoints[log.endpoint] || 0) + 1;
        }
      });

      // Calculate hourly distribution
      logs.forEach(log => {
        const hour = new Date(log.createdAt).getHours();
        metrics.hourlyDistribution[hour] = (metrics.hourlyDistribution[hour] || 0) + 1;
      });

      // Calculate daily distribution
      logs.forEach(log => {
        const day = log.createdAt.split('T')[0];
        metrics.dailyDistribution[day] = (metrics.dailyDistribution[day] || 0) + 1;
      });

      return metrics;
    } catch (error) {
      logger.error('Error getting performance metrics:', error);
      throw error;
    }
  }

  /**
   * Get error logs
   */
  static async getErrorLogs(options = {}) {
    try {
      const {
        userId = null,
        startDate = null,
        endDate = new Date().toISOString(),
        limit = 100,
        offset = 0
      } = options;

      const client = db.getClient();
      let query = client
        .from('request_logs')
        .select('*', { count: 'exact' })
        .or('response_status.gte.400,error.not.is.null')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error, count } = await query;

      if (error) {
        logger.error('Database error in getErrorLogs:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      return {
        errors: data.map(log => new RequestLog(log)),
        total: count || data.length,
        limit,
        offset
      };
    } catch (error) {
      logger.error('Error getting error logs:', error);
      throw error;
    }
  }

  /**
   * Calculate percentile
   */
  static calculatePercentile(logs, percentile, field) {
    if (logs.length === 0) return 0;
    
    const sorted = logs
      .map(log => log[field])
      .sort((a, b) => a - b);
    
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get request rate statistics
   */
  static async getRequestRateStats(options = {}) {
    try {
      const {
        startDate = null,
        endDate = new Date().toISOString(),
        interval = 'hour' // minute, hour, day
      } = options;

      const client = db.getClient();
      let query = client
        .from('request_logs')
        .select('*');

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Database error in getRequestRateStats:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      const logs = data.map(log => new RequestLog(log));
      
      // Group by interval
      const rates = {};
      
      logs.forEach(log => {
        let key;
        const date = new Date(log.createdAt);
        
        switch (interval) {
          case 'minute':
            key = date.toISOString().slice(0, 16) + ':00';
            break;
          case 'hour':
            key = date.toISOString().slice(0, 13) + ':00:00';
            break;
          case 'day':
            key = date.toISOString().split('T')[0];
            break;
        }

        if (!rates[key]) {
          rates[key] = {
            timestamp: key,
            requests: 0,
            errors: 0
          };
        }

        rates[key].requests++;
        if (log.responseStatus >= 400 || log.error) {
          rates[key].errors++;
        }
      });

      // Convert to array and sort
      return Object.values(rates).sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
    } catch (error) {
      logger.error('Error getting request rate statistics:', error);
      throw error;
    }
  }

  /**
   * Sanitize request log data for public response
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      requestId: this.requestId,
      method: this.method,
      endpoint: this.endpoint,
      headers: this.headers,
      queryParams: this.queryParams,
      body: this.body,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
      responseStatus: this.responseStatus,
      responseHeaders: this.responseHeaders,
      responseBody: this.responseBody,
      responseSize: this.responseSize,
      error: this.error,
      errorStack: this.errorStack,
      processingTime: this.processingTime,
      createdAt: this.createdAt,
      metadata: this.metadata
    };
  }
}

module.exports = RequestLog;