const db = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * MinimaxTask Model
 * Tracks async Minimax tasks (video generation, etc.) with status management
 */
class MinimaxTask {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.userId = data.userId || null;
    this.minimaxTaskId = data.minimaxTaskId || null;
    this.type = data.type || 'video_generation';
    this.status = data.status || 'pending';
    this.model = data.model || 'hailuo-2.3';
    this.prompt = data.prompt || '';
    this.parameters = data.parameters || {};
    this.result = data.result || null;
    this.error = data.error || null;
    this.metadata = data.metadata || {};
    this.webhookUrl = data.webhookUrl || null;
    this.webhookAttempts = data.webhookAttempts || 0;
    this.webhookLastAttempt = data.webhookLastAttempt || null;
    this.retryAttempts = data.retryAttempts || 0;
    this.maxRetryAttempts = data.maxRetryAttempts || 3;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.submittedAt = data.submittedAt || null;
    this.completedAt = data.completedAt || null;
    this.failedAt = data.failedAt || null;
    this.cost = data.cost || 0;
    this.costCalculated = data.costCalculated || false;
  }

  /**
   * Create a new Minimax task
   */
  static async create(taskData) {
    try {
      const task = new MinimaxTask(taskData);
      
      const client = db.getClient();
      const { data, error } = await client
        .from('minimax_tasks')
        .insert([{
          id: task.id,
          user_id: task.userId,
          minimax_task_id: task.minimaxTaskId,
          type: task.type,
          status: task.status,
          model: task.model,
          prompt: task.prompt,
          parameters: task.parameters,
          result: task.result,
          error: task.error,
          metadata: task.metadata,
          webhook_url: task.webhookUrl,
          webhook_attempts: task.webhookAttempts,
          webhook_last_attempt: task.webhookLastAttempt,
          retry_attempts: task.retryAttempts,
          max_retry_attempts: task.maxRetryAttempts,
          created_at: task.createdAt,
          updated_at: task.updatedAt,
          submitted_at: task.submittedAt,
          completed_at: task.completedAt,
          failed_at: task.failedAt,
          cost: task.cost,
          cost_calculated: task.costCalculated
        }])
        .select()
        .single();

      if (error) {
        logger.error('Minimax task creation failed:', error);
        throw new Error(`Minimax task creation failed: ${error.message}`);
      }

      logger.info(`Minimax task created: ${data.id}`, {
        taskId: data.id,
        type: data.type,
        userId: data.user_id
      });

      return new MinimaxTask(data);
    } catch (error) {
      logger.error('Minimax task creation error:', error);
      throw error;
    }
  }

  /**
   * Find task by ID
   */
  static async findById(id) {
    try {
      const client = db.getClient();
      const { data, error } = await client
        .from('minimax_tasks')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Database error in findById:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      return data ? new MinimaxTask(data) : null;
    } catch (error) {
      logger.error('Error finding Minimax task by ID:', error);
      throw error;
    }
  }

  /**
   * Find task by Minimax task ID
   */
  static async findByMinimaxTaskId(minimaxTaskId) {
    try {
      const client = db.getClient();
      const { data, error } = await client
        .from('minimax_tasks')
        .select('*')
        .eq('minimax_task_id', minimaxTaskId)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Database error in findByMinimaxTaskId:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      return data ? new MinimaxTask(data) : null;
    } catch (error) {
      logger.error('Error finding Minimax task by Minimax task ID:', error);
      throw error;
    }
  }

  /**
   * Find tasks by user ID with filtering
   */
  static async findByUserId(userId, options = {}) {
    try {
      const {
        status = null,
        type = null,
        limit = 50,
        offset = 0,
        startDate = null,
        endDate = null
      } = options;

      const client = db.getClient();
      let query = client
        .from('minimax_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq('status', status);
      }

      if (type) {
        query = query.eq('type', type);
      }

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error, count } = await query;

      if (error) {
        logger.error('Database error in findByUserId:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      return {
        tasks: data.map(task => new MinimaxTask(task)),
        total: count || data.length,
        limit,
        offset
      };
    } catch (error) {
      logger.error('Error finding Minimax tasks by user ID:', error);
      throw error;
    }
  }

  /**
   * Update task status
   */
  async updateStatus(status, options = {}) {
    try {
      const {
        result = null,
        error = null,
        minimaxTaskId = null
      } = options;

      this.status = status;
      this.updatedAt = new Date().toISOString();

      if (minimaxTaskId) {
        this.minimaxTaskId = minimaxTaskId;
      }

      if (status === 'processing' && !this.submittedAt) {
        this.submittedAt = new Date().toISOString();
      }

      if (status === 'completed') {
        this.completedAt = new Date().toISOString();
        this.result = result;
        this.error = null;
      }

      if (status === 'failed') {
        this.failedAt = new Date().toISOString();
        this.error = error;
        this.retryAttempts++;
      }

      const client = db.getClient();
      const { data, error: updateError } = await client
        .from('minimax_tasks')
        .update({
          status: this.status,
          minimax_task_id: this.minimaxTaskId,
          result: this.result,
          error: this.error,
          updated_at: this.updatedAt,
          submitted_at: this.submittedAt,
          completed_at: this.completedAt,
          failed_at: this.failedAt,
          retry_attempts: this.retryAttempts
        })
        .eq('id', this.id)
        .select()
        .single();

      if (updateError) {
        logger.error('Minimax task status update failed:', updateError);
        throw new Error(`Minimax task status update failed: ${updateError.message}`);
      }

      logger.info(`Minimax task status updated: ${this.id}`, {
        taskId: this.id,
        status: this.status,
        minimaxTaskId: this.minimaxTaskId
      });

      return this;
    } catch (error) {
      logger.error('Error updating Minimax task status:', error);
      throw error;
    }
  }

  /**
   * Calculate and update task cost
   */
  async calculateCost() {
    try {
      if (this.costCalculated) {
        return this.cost;
      }

      const modelConfig = this.config.models[this.model];
      if (!modelConfig) {
        logger.warn(`Unknown model for cost calculation: ${this.model}`);
        return 0;
      }

      let cost = 0;
      const costConfig = modelConfig.cost;

      if (costConfig.perCall) {
        cost = costConfig.perCall;
      } else if (costConfig.perToken && this.parameters.tokens) {
        cost = this.parameters.tokens * costConfig.perToken;
      } else if (costConfig.perImage && this.parameters.images) {
        cost = this.parameters.images * costConfig.perImage;
      }

      this.cost = cost;
      this.costCalculated = true;

      const client = db.getClient();
      const { error } = await client
        .from('minimax_tasks')
        .update({
          cost: this.cost,
          cost_calculated: this.costCalculated
        })
        .eq('id', this.id);

      if (error) {
        logger.error('Failed to update task cost:', error);
      }

      logger.info(`Cost calculated for task ${this.id}: $${cost.toFixed(2)}`);

      return cost;
    } catch (error) {
      logger.error('Error calculating task cost:', error);
      return 0;
    }
  }

  /**
   * Record webhook attempt
   */
  async recordWebhookAttempt(success, response = null) {
    try {
      this.webhookAttempts++;
      this.webhookLastAttempt = new Date().toISOString();

      const client = db.getClient();
      const { error } = await client
        .from('minimax_tasks')
        .update({
          webhook_attempts: this.webhookAttempts,
          webhook_last_attempt: this.webhookLastAttempt
        })
        .eq('id', this.id);

      if (error) {
        logger.error('Failed to record webhook attempt:', error);
      }

      logger.info(`Webhook attempt ${this.webhookAttempts} recorded for task ${this.id}`, {
        success,
        taskId: this.id
      });

      return this.webhookAttempts;
    } catch (error) {
      logger.error('Error recording webhook attempt:', error);
      return this.webhookAttempts;
    }
  }

  /**
   * Check if task can be retried
   */
  canRetry() {
    return this.status === 'failed' && this.retryAttempts < this.maxRetryAttempts;
  }

  /**
   * Get task statistics
   */
  static async getStatistics(userId = null) {
    try {
      const client = db.getClient();
      let query = client
        .from('minimax_tasks')
        .select('*');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Database error in getStatistics:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      const tasks = data.map(task => new MinimaxTask(task));
      
      const stats = {
        totalTasks: tasks.length,
        statusBreakdown: {},
        typeBreakdown: {},
        modelBreakdown: {},
        totalCost: 0,
        averageCost: 0,
        successRate: 0,
        averageProcessingTime: 0
      };

      // Calculate breakdowns
      tasks.forEach(task => {
        // Status breakdown
        stats.statusBreakdown[task.status] = (stats.statusBreakdown[task.status] || 0) + 1;
        
        // Type breakdown
        stats.typeBreakdown[task.type] = (stats.typeBreakdown[task.type] || 0) + 1;
        
        // Model breakdown
        stats.modelBreakdown[task.model] = (stats.modelBreakdown[task.model] || 0) + 1;
        
        // Total cost
        stats.totalCost += task.cost;
      });

      // Calculate averages
      if (tasks.length > 0) {
        stats.averageCost = stats.totalCost / tasks.length;
        stats.successRate = (stats.statusBreakdown.completed || 0) / tasks.length * 100;

        // Calculate average processing time for completed tasks
        const completedTasks = tasks.filter(task => task.completedAt && task.submittedAt);
        if (completedTasks.length > 0) {
          const totalProcessingTime = completedTasks.reduce((sum, task) => {
            return sum + (new Date(task.completedAt).getTime() - new Date(task.submittedAt).getTime());
          }, 0);
          stats.averageProcessingTime = totalProcessingTime / completedTasks.length / 1000; // Convert to seconds
        }
      }

      return stats;
    } catch (error) {
      logger.error('Error getting Minimax task statistics:', error);
      throw error;
    }
  }

  /**
   * Sanitize task data for public response
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      minimaxTaskId: this.minimaxTaskId,
      type: this.type,
      status: this.status,
      model: this.model,
      prompt: this.prompt,
      parameters: this.parameters,
      result: this.result,
      error: this.error,
      metadata: this.metadata,
      webhookUrl: this.webhookUrl,
      webhookAttempts: this.webhookAttempts,
      retryAttempts: this.retryAttempts,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      submittedAt: this.submittedAt,
      completedAt: this.completedAt,
      failedAt: this.failedAt,
      cost: this.cost,
      costCalculated: this.costCalculated
    };
  }
}

module.exports = MinimaxTask;