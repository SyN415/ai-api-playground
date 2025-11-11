const minimaxService = require('./minimaxService');
const logger = require('../utils/logger');
const responseFormatter = require('../utils/responseFormatter');

/**
 * AI Service Orchestrator
 * Manages multiple AI providers and routes requests to appropriate services
 */
class AiService {
  constructor() {
    this.providers = {
      minimax: {
        service: minimaxService,
        enabled: this.isProviderEnabled('minimax'),
        models: minimaxService.listModels(),
        priority: 1
      },
      openai: {
        service: null, // Would be implemented similarly to minimaxService
        enabled: false,
        models: [],
        priority: 2
      },
      anthropic: {
        service: null, // Would be implemented similarly to minimaxService
        enabled: false,
        models: [],
        priority: 3
      }
    };

    this.taskQueue = new Map(); // In-memory task queue (use Redis in production)
    this.taskResults = new Map(); // In-memory task results (use Redis in production)
    
    this.initializeProviders();
  }

  /**
   * Initialize enabled providers
   */
  initializeProviders() {
    logger.info('Initializing AI providers', {
      providers: Object.entries(this.providers)
        .filter(([_, provider]) => provider.enabled)
        .map(([name, _]) => name)
    });
  }

  /**
   * Check if provider is enabled
   */
  isProviderEnabled(providerName) {
    const envVar = process.env[`${providerName.toUpperCase()}_ENABLED`];
    return envVar === 'true' || envVar === true;
  }

  /**
   * Generate content using AI
   */
  async generate(options) {
    const {
      prompt,
      model,
      provider,
      temperature = 0.7,
      maxTokens = 1000,
      stream = false,
      messages = null,
      functions = null,
      userId = null,
      taskId = null
    } = options;

    try {
      // Determine provider and model
      const providerInfo = this.selectProvider(provider, model);
      
      logger.info('AI generation started', {
        provider: providerInfo.name,
        model: providerInfo.model,
        stream,
        userId,
        taskId
      });

      // Create task for tracking
      const task = this.createTask('generation', {
        provider: providerInfo.name,
        model: providerInfo.model,
        userId,
        stream
      }, taskId);

      // Generate content
      const result = await providerInfo.service.generate({
        prompt,
        model: providerInfo.model,
        temperature,
        maxTokens,
        stream,
        messages,
        functions,
        userId
      });

      // Update task result
      this.updateTask(task.id, 'completed', result);

      logger.info('AI generation completed', {
        taskId: task.id,
        provider: providerInfo.name,
        model: providerInfo.model,
        tokensUsed: result.usage?.totalTokens || 0
      });

      return {
        ...result,
        taskId: task.id,
        provider: providerInfo.name
      };

    } catch (error) {
      logger.error('AI generation failed', {
        provider: provider || 'auto',
        model: model || 'auto',
        error: error.message,
        userId
      });

      // Update task as failed
      if (taskId) {
        this.updateTask(taskId, 'failed', { error: error.message });
      }

      throw error;
    }
  }

  /**
   * Generate embeddings
   */
  async generateEmbeddings(options) {
    const {
      texts,
      model,
      provider,
      userId = null,
      taskId = null
    } = options;

    try {
      const providerInfo = this.selectProvider(provider, model, 'embeddings');
      
      logger.info('Embeddings generation started', {
        provider: providerInfo.name,
        model: providerInfo.model,
        textCount: texts.length,
        userId
      });

      const task = this.createTask('embeddings', {
        provider: providerInfo.name,
        model: providerInfo.model,
        userId
      }, taskId);

      const result = await providerInfo.service.generateEmbeddings({
        texts,
        model: providerInfo.model,
        userId
      });

      this.updateTask(task.id, 'completed', result);

      logger.info('Embeddings generation completed', {
        taskId: task.id,
        provider: providerInfo.name,
        embeddingsCount: result.embeddings.length
      });

      return {
        ...result,
        taskId: task.id,
        provider: providerInfo.name
      };

    } catch (error) {
      logger.error('Embeddings generation failed', {
        provider: provider || 'auto',
        error: error.message,
        userId
      });

      if (taskId) {
        this.updateTask(taskId, 'failed', { error: error.message });
      }

      throw error;
    }
  }

  /**
   * Generate images
   */
  async generateImage(options) {
    const {
      prompt,
      model,
      provider,
      size = '1024x1024',
      quality = 'standard',
      userId = null,
      taskId = null
    } = options;

    try {
      const providerInfo = this.selectProvider(provider, model, 'image');
      
      logger.info('Image generation started', {
        provider: providerInfo.name,
        model: providerInfo.model,
        size,
        quality,
        userId
      });

      const task = this.createTask('image_generation', {
        provider: providerInfo.name,
        model: providerInfo.model,
        userId
      }, taskId);

      const result = await providerInfo.service.generateImage({
        prompt,
        model: providerInfo.model,
        size,
        quality,
        userId
      });

      this.updateTask(task.id, 'completed', result);

      logger.info('Image generation completed', {
        taskId: task.id,
        provider: providerInfo.name,
        model: providerInfo.model
      });

      return {
        ...result,
        taskId: task.id,
        provider: providerInfo.name
      };

    } catch (error) {
      logger.error('Image generation failed', {
        provider: provider || 'auto',
        error: error.message,
        userId
      });

      if (taskId) {
        this.updateTask(taskId, 'failed', { error: error.message });
      }

      throw error;
    }
  }

  /**
   * Select appropriate provider and model
   */
  selectProvider(requestedProvider, requestedModel, taskType = 'generation') {
    // If specific provider requested, use it
    if (requestedProvider && this.providers[requestedProvider]?.enabled) {
      const provider = this.providers[requestedProvider];
      const model = requestedModel || provider.models[0]?.id;
      
      if (model && provider.models.some(m => m.id === model)) {
        return {
          name: requestedProvider,
          service: provider.service,
          model: model
        };
      }
    }

    // If specific model requested, find provider that supports it
    if (requestedModel) {
      for (const [providerName, provider] of Object.entries(this.providers)) {
        if (provider.enabled) {
          const model = provider.models.find(m => m.id === requestedModel);
          if (model) {
            return {
              name: providerName,
              service: provider.service,
              model: requestedModel
            };
          }
        }
      }
    }

    // Auto-select best available provider
    const availableProviders = Object.entries(this.providers)
      .filter(([_, provider]) => provider.enabled)
      .sort(([_, a], [__, b]) => a.priority - b.priority);

    if (availableProviders.length === 0) {
      throw new Error('No AI providers are enabled');
    }

    const [providerName, provider] = availableProviders[0];
    const model = provider.models[0]?.id;

    if (!model) {
      throw new Error(`No models available for provider: ${providerName}`);
    }

    return {
      name: providerName,
      service: provider.service,
      model: model
    };
  }

  /**
   * Create task for async operation tracking
   */
  createTask(type, metadata, taskId = null) {
    const id = taskId || this.generateTaskId();
    const task = {
      id,
      type,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata,
      result: null,
      error: null
    };

    this.taskQueue.set(id, task);
    return task;
  }

  /**
   * Update task status
   */
  updateTask(taskId, status, result = null) {
    const task = this.taskQueue.get(taskId);
    if (!task) {
      logger.warn('Task not found for update', { taskId });
      return null;
    }

    task.status = status;
    task.updatedAt = new Date().toISOString();

    if (status === 'completed') {
      task.result = result;
      this.taskResults.set(taskId, result);
    } else if (status === 'failed') {
      task.error = result?.error || 'Unknown error';
    }

    this.taskQueue.set(taskId, task);
    return task;
  }

  /**
   * Get task status
   */
  getTask(taskId) {
    const task = this.taskQueue.get(taskId);
    if (!task) {
      return null;
    }

    return {
      ...task,
      result: task.status === 'completed' ? this.taskResults.get(taskId) : null
    };
  }

  /**
   * List tasks with filtering
   */
  listTasks(options = {}) {
    const {
      userId = null,
      status = null,
      type = null,
      limit = 50,
      offset = 0
    } = options;

    let tasks = Array.from(this.taskQueue.values());

    // Apply filters
    if (userId) {
      tasks = tasks.filter(task => task.metadata.userId === userId);
    }
    if (status) {
      tasks = tasks.filter(task => task.status === status);
    }
    if (type) {
      tasks = tasks.filter(task => task.type === type);
    }

    // Apply pagination
    const total = tasks.length;
    tasks = tasks.slice(offset, offset + limit);

    return {
      tasks,
      total,
      limit,
      offset
    };
  }

  /**
   * Get user request history
   */
  getUserHistory(userId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      type = null,
      startDate = null,
      endDate = null
    } = options;

    const tasks = Array.from(this.taskQueue.values())
      .filter(task => task.metadata.userId === userId);

    // Apply date filters
    let filteredTasks = tasks;
    if (startDate || endDate) {
      filteredTasks = tasks.filter(task => {
        const taskDate = new Date(task.createdAt);
        if (startDate && taskDate < new Date(startDate)) return false;
        if (endDate && taskDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Apply type filter
    if (type) {
      filteredTasks = filteredTasks.filter(task => task.type === type);
    }

    const total = filteredTasks.length;
    const paginatedTasks = filteredTasks.slice(offset, offset + limit);

    return {
      tasks: paginatedTasks,
      total,
      limit,
      offset
    };
  }

  /**
   * Get available models across all providers
   */
  getAvailableModels() {
    const models = [];

    for (const [providerName, provider] of Object.entries(this.providers)) {
      if (provider.enabled) {
        provider.models.forEach(model => {
          models.push({
            ...model,
            provider: providerName
          });
        });
      }
    }

    return models;
  }

  /**
   * Get provider information
   */
  getProviderInfo(providerName) {
    const provider = this.providers[providerName];
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    return {
      name: providerName,
      enabled: provider.enabled,
      models: provider.models,
      priority: provider.priority
    };
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(userId, options = {}) {
    const {
      startDate,
      endDate = new Date().toISOString(),
      provider = null
    } = options;

    const tasks = Array.from(this.taskQueue.values())
      .filter(task => 
        task.metadata.userId === userId &&
        task.status === 'completed'
      );

    // Apply date filters
    let filteredTasks = tasks;
    if (startDate || endDate) {
      filteredTasks = tasks.filter(task => {
        const taskDate = new Date(task.createdAt);
        if (startDate && taskDate < new Date(startDate)) return false;
        if (endDate && taskDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Calculate statistics
    const stats = {
      userId,
      startDate: startDate || new Date(Math.min(...filteredTasks.map(t => new Date(t.createdAt)))).toISOString(),
      endDate,
      totalRequests: filteredTasks.length,
      totalTokens: 0,
      totalCost: 0,
      providers: {},
      models: {},
      taskTypes: {}
    };

    filteredTasks.forEach(task => {
      const provider = task.metadata.provider || 'unknown';
      const model = task.metadata.model || 'unknown';
      const type = task.type;

      // Count by provider
      stats.providers[provider] = (stats.providers[provider] || 0) + 1;

      // Count by model
      stats.models[model] = (stats.models[model] || 0) + 1;

      // Count by task type
      stats.taskTypes[type] = (stats.taskTypes[type] || 0) + 1;

      // Sum tokens (if available)
      if (task.result?.usage?.totalTokens) {
        stats.totalTokens += task.result.usage.totalTokens;
      }
    });

    // Calculate cost (simplified calculation)
    stats.totalCost = stats.totalTokens * 0.0001; // $0.0001 per token

    return stats;
  }

  /**
   * Cleanup old tasks
   */
  cleanupOldTasks(maxAgeHours = 24) {
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [taskId, task] of this.taskQueue.entries()) {
      if (new Date(task.createdAt).getTime() < cutoffTime) {
        this.taskQueue.delete(taskId);
        this.taskResults.delete(taskId);
        cleaned++;
      }
    }

    logger.info('Task cleanup completed', { cleaned, maxAgeHours });
    return cleaned;
  }

  /**
   * Generate task ID
   */
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Health check for all providers
   */
  async healthCheck() {
    const results = {};

    for (const [providerName, provider] of Object.entries(this.providers)) {
      if (provider.enabled && provider.service?.healthCheck) {
        try {
          results[providerName] = await provider.service.healthCheck();
        } catch (error) {
          results[providerName] = {
            status: 'unhealthy',
            error: error.message
          };
        }
      } else if (provider.enabled) {
        results[providerName] = {
          status: 'unknown',
          message: 'Health check not implemented'
        };
      } else {
        results[providerName] = {
          status: 'disabled'
        };
      }
    }

    return {
      timestamp: new Date().toISOString(),
      providers: results,
      overall: Object.values(results).some(r => r.status === 'healthy') ? 'healthy' : 'unhealthy'
    };
  }
}

module.exports = new AiService();