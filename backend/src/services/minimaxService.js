const axios = require('axios');
const logger = require('../utils/logger');
const responseFormatter = require('../utils/responseFormatter');
const minimaxConfig = require('../config/minimax');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');

/**
 * Minimax Hailuo 2.3 Integration Service
 * Handles specific integration with Minimax AI models including video generation
 */
class MinimaxService {
  constructor() {
    this.config = minimaxConfig.config;
    this.activeTasks = new Map();
    this.taskResults = new Map();
    
    this.validateConfig();
    this.initializeTaskCleanup();
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.config.auth.apiKey) {
      logger.warn('Minimax API key not configured');
    }
    if (!this.config.auth.groupId) {
      logger.warn('Minimax Group ID not configured');
    }
  }

  /**
   * Initialize task cleanup timer
   */
  initializeTaskCleanup() {
    // Clean up completed tasks older than 24 hours every hour
    setInterval(() => {
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
      let cleaned = 0;

      for (const [taskId, task] of this.activeTasks.entries()) {
        if (task.status === 'completed' && new Date(task.completedAt).getTime() < cutoffTime) {
          this.activeTasks.delete(taskId);
          this.taskResults.delete(taskId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.info('Cleaned up old Minimax tasks', { cleaned });
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Generate text using Minimax models
   */
  async generate(options) {
    const {
      prompt,
      model = 'abab5.5-chat',
      temperature = 0.7,
      maxTokens = 1000,
      stream = false,
      messages = null,
      functions = null,
      userId = null
    } = options;

    try {
      this.validateModel(model);

      // Prepare messages format
      const formattedMessages = this.formatMessages(prompt, messages);

      const requestPayload = {
        model,
        messages: formattedMessages,
        temperature,
        max_tokens: maxTokens,
        stream,
        bot_setting: [
          {
            bot_name: 'AI Assistant',
            content: 'You are a helpful AI assistant.'
          }
        ]
      };

      // Add functions if provided and supported
      if (functions && this.config.models[model].supportsFunctions) {
        requestPayload.functions = functions;
      }

      logger.info('Minimax generation started', {
        model,
        messageCount: formattedMessages.length,
        stream,
        userId
      });

      const response = await this.makeRequest('/text/chatcompletion', requestPayload, { stream });

      if (stream) {
        return this.handleStreamingResponse(response);
      }

      return this.handleRegularResponse(response);

    } catch (error) {
      logger.error('Minimax generation failed', {
        model,
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Generate embeddings using Minimax
   */
  async generateEmbeddings(options) {
    const {
      texts,
      model = 'embo-01',
      userId = null
    } = options;

    try {
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Texts must be a non-empty array');
      }

      const requestPayload = {
        model,
        texts: texts.slice(0, 10) // Minimax limit per request
      };

      logger.info('Minimax embeddings generation started', {
        model,
        textCount: texts.length,
        userId
      });

      const response = await this.makeRequest('/text/embeddings', requestPayload);

      return {
        embeddings: response.data.vectors,
        model,
        usage: {
          promptTokens: response.data.total_tokens,
          totalTokens: response.data.total_tokens
        }
      };

    } catch (error) {
      logger.error('Minimax embeddings generation failed', {
        model,
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Generate images using Minimax (if supported)
   */
  async generateImage(options) {
    const {
      prompt,
      model = 'hailuo-img',
      size = '1024x1024',
      quality = 'standard',
      userId = null
    } = options;

    try {
      const requestPayload = {
        model,
        prompt,
        size,
        quality
      };

      logger.info('Minimax image generation started', {
        model,
        size,
        quality,
        userId
      });

      const response = await this.makeRequest('/images/generations', requestPayload);

      return {
        url: response.data.image_url,
        revisedPrompt: response.data.revised_prompt,
        model,
        usage: {
          // Minimax doesn't provide token usage for images
          totalTokens: 0
        }
      };

    } catch (error) {
      logger.error('Minimax image generation failed', {
        model,
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Generate video using Hailuo 2.3
   * Supports text-to-video and image-to-video generation
   */
  async generateVideo(options) {
    const {
      prompt,
      model = 'hailuo-2.3',
      imagePath = null,
      negativePrompt = '',
      duration = 5,
      resolution = '1280x720',
      frameRate = 30,
      userId = null,
      webhookUrl = null
    } = options;

    try {
      this.validateModel(model);
      const modelConfig = this.config.models[model];
      
      if (modelConfig.type !== 'video') {
        throw new Error(`Model ${model} is not a video generation model`);
      }

      // Validate parameters
      this.validateVideoParams({ duration, resolution, frameRate });

      // Create task for tracking
      const taskId = this.generateTaskId();
      const task = this.createTask(taskId, 'video_generation', {
        model,
        userId,
        prompt: prompt.substring(0, 100) // Store truncated prompt
      });

      logger.info('Minimax video generation started', {
        taskId,
        model,
        duration,
        resolution,
        hasImage: !!imagePath,
        userId
      });

      // Prepare request payload
      const payload = {
        model,
        prompt,
        negative_prompt: negativePrompt,
        duration,
        resolution,
        frame_rate: frameRate
      };

      // Add webhook if provided
      if (webhookUrl) {
        payload.webhook_url = webhookUrl;
      }

      let response;
      if (imagePath) {
        // Image-to-video generation
        response = await this.makeVideoRequestWithImage('/video/generation', payload, imagePath);
      } else {
        // Text-to-video generation
        response = await this.makeRequest('/video/generation', payload);
      }

      // Store task information
      task.status = 'processing';
      task.minimaxTaskId = response.data.task_id;
      task.submittedAt = new Date().toISOString();
      this.activeTasks.set(taskId, task);

      // Start status checking
      this.startStatusChecking(taskId, response.data.task_id);

      return {
        taskId,
        minimaxTaskId: response.data.task_id,
        status: 'processing',
        estimatedTime: duration * 2, // Rough estimate: 2 seconds per second of video
        statusUrl: `/api/v1/ai/minimax/status/${taskId}`,
        resultUrl: `/api/v1/ai/minimax/result/${taskId}`
      };

    } catch (error) {
      logger.error('Minimax video generation failed', {
        model,
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Check video generation status
   */
  async checkVideoStatus(taskId) {
    const task = this.activeTasks.get(taskId);
    
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.minimaxTaskId) {
      throw new Error(`No Minimax task ID associated with task: ${taskId}`);
    }

    try {
      logger.info('Checking Minimax video status', {
        taskId,
        minimaxTaskId: task.minimaxTaskId
      });

      const response = await this.makeRequest('/video/status', {
        task_id: task.minimaxTaskId
      });

      const statusData = response.data;
      
      // Update task status
      task.status = this.mapMinimaxStatus(statusData.status);
      task.updatedAt = new Date().toISOString();

      if (task.status === 'completed' && statusData.video_url) {
        task.result = {
          videoUrl: statusData.video_url,
          thumbnailUrl: statusData.thumbnail_url,
          duration: statusData.duration,
          resolution: statusData.resolution,
          fileSize: statusData.file_size
        };
        task.completedAt = new Date().toISOString();
        this.taskResults.set(taskId, task.result);
      } else if (task.status === 'failed' && statusData.error_message) {
        task.error = statusData.error_message;
        task.failedAt = new Date().toISOString();
      }

      this.activeTasks.set(taskId, task);

      return {
        taskId,
        status: task.status,
        minimaxTaskId: task.minimaxTaskId,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        result: task.result,
        error: task.error,
        progress: statusData.progress || 0
      };

    } catch (error) {
      logger.error('Minimax video status check failed', {
        taskId,
        minimaxTaskId: task.minimaxTaskId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get video generation result
   */
  async getVideoResult(taskId) {
    const task = this.activeTasks.get(taskId);
    
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== 'completed') {
      return {
        taskId,
        status: task.status,
        message: task.status === 'processing' ? 'Video generation still in progress' : 'Video generation failed',
        result: null
      };
    }

    const result = this.taskResults.get(taskId);
    
    if (!result) {
      throw new Error(`Result not found for completed task: ${taskId}`);
    }

    return {
      taskId,
      status: 'completed',
      result,
      createdAt: task.createdAt,
      completedAt: task.completedAt
    };
  }

  /**
   * Start automatic status checking for a task
   */
  startStatusChecking(taskId, minimaxTaskId) {
    const checkInterval = this.config.video.statusCheckInterval;
    const maxAttempts = this.config.video.maxStatusCheckAttempts;
    let attempts = 0;

    const checkStatus = async () => {
      attempts++;
      
      try {
        const task = this.activeTasks.get(taskId);
        if (!task || task.status === 'completed' || task.status === 'failed') {
          // Task is finished, stop checking
          return;
        }

        if (attempts >= maxAttempts) {
          task.status = 'failed';
          task.error = 'Max status check attempts reached';
          task.failedAt = new Date().toISOString();
          this.activeTasks.set(taskId, task);
          logger.warn('Max status check attempts reached', { taskId, minimaxTaskId });
          return;
        }

        // Check status
        await this.checkVideoStatus(taskId);

        // Continue checking if still processing
        const updatedTask = this.activeTasks.get(taskId);
        if (updatedTask.status === 'processing') {
          setTimeout(checkStatus, checkInterval);
        }

      } catch (error) {
        logger.error('Status check failed', {
          taskId,
          minimaxTaskId,
          attempt: attempts,
          error: error.message
        });

        // Continue checking on error, but with longer delay
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, checkInterval * 2);
        }
      }
    };

    // Start checking after a short delay
    setTimeout(checkStatus, checkInterval);
  }

  /**
   * Validate video generation parameters
   */
  validateVideoParams(params) {
    const { duration, resolution, frameRate } = params;
    const modelConfig = this.config.models['hailuo-2.3'];
    
    // Validate duration
    if (duration < modelConfig.capabilities.duration.minSeconds ||
        duration > modelConfig.capabilities.duration.maxSeconds) {
      throw new Error(`Duration must be between ${modelConfig.capabilities.duration.minSeconds} and ${modelConfig.capabilities.duration.maxSeconds} seconds`);
    }

    // Validate resolution
    if (!modelConfig.capabilities.resolution.supported.includes(resolution)) {
      throw new Error(`Resolution must be one of: ${modelConfig.capabilities.resolution.supported.join(', ')}`);
    }

    // Validate frame rate
    if (!modelConfig.capabilities.frameRate.supported.includes(frameRate)) {
      throw new Error(`Frame rate must be one of: ${modelConfig.capabilities.frameRate.supported.join(', ')}`);
    }
  }

  /**
   * Map Minimax status to internal status
   */
  mapMinimaxStatus(minimaxStatus) {
    const statusMap = {
      'pending': 'processing',
      'processing': 'processing',
      'generating': 'processing',
      'completed': 'completed',
      'failed': 'failed',
      'cancelled': 'failed',
      'timeout': 'failed'
    };

    return statusMap[minimaxStatus] || 'processing';
  }

  /**
   * Create task record
   */
  createTask(taskId, type, metadata) {
    const task = {
      id: taskId,
      type,
      status: 'pending',
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      minimaxTaskId: null,
      result: null,
      error: null,
      submittedAt: null,
      completedAt: null,
      failedAt: null
    };

    this.activeTasks.set(taskId, task);
    return task;
  }

  /**
   * Generate task ID
   */
  generateTaskId() {
    return `minimax_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get model information
   */
  getModelInfo(model) {
    const modelConfig = this.config.models[model];
    if (!modelConfig) {
      throw new Error(`Unknown model: ${model}`);
    }

    return {
      ...modelConfig,
      id: model,
      provider: 'minimax'
    };
  }

  /**
   * List available models
   */
  listModels() {
    return Object.entries(this.config.models).map(([id, config]) => ({
      id,
      ...config,
      provider: 'minimax'
    }));
  }

  /**
   * Format messages for Minimax API
   */
  formatMessages(prompt, messages) {
    if (messages) {
      // Use provided messages array
      return messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content || msg.text || '',
        name: msg.name
      }));
    }

    // Create messages from single prompt
    return [{
      role: 'user',
      content: prompt,
      name: 'User'
    }];
  }

  /**
   * Make request to Minimax API with image upload
   */
  async makeVideoRequestWithImage(endpoint, payload, imagePath) {
    try {
      // Read image file
      const imageBuffer = await fs.readFile(imagePath);
      const imageName = path.basename(imagePath);

      // Create form data
      const formData = new FormData();
      
      // Add payload fields
      Object.keys(payload).forEach(key => {
        formData.append(key, typeof payload[key] === 'object' ? JSON.stringify(payload[key]) : payload[key]);
      });

      // Add image file
      formData.append('image', imageBuffer, {
        filename: imageName,
        contentType: 'image/jpeg'
      });

      const response = await axios.post(
        `${this.config.api.videoBaseURL}${endpoint}`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${this.config.auth.apiKey}`
          },
          params: {
            GroupId: this.config.auth.groupId
          },
          timeout: this.config.api.timeout
        }
      );

      return response;

    } catch (error) {
      this.handleApiError(error, endpoint);
    }
  }

  /**
   * Make request to Minimax API
   */
  async makeRequest(endpoint, payload, options = {}) {
    const { stream = false, retries = 0 } = options;

    try {
      const response = await axios.post(
        `${this.config.api.baseURL}${endpoint}`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.config.auth.apiKey}`,
            'Content-Type': 'application/json'
          },
          params: {
            GroupId: this.config.auth.groupId
          },
          timeout: this.config.api.timeout,
          responseType: stream ? 'stream' : 'json'
        }
      );

      return response;

    } catch (error) {
      if (retries < this.config.api.maxRetries && this.isRetryableError(error)) {
        logger.warn(`Minimax request failed, retrying (${retries + 1}/${this.config.api.maxRetries})`, {
          endpoint,
          error: error.message
        });

        const delayTime = this.config.api.exponentialBackoff
          ? Math.min(this.config.api.retryDelay * Math.pow(2, retries), this.config.api.maxBackoffDelay)
          : this.config.api.retryDelay * (retries + 1);

        await this.delay(delayTime);
        return this.makeRequest(endpoint, payload, { ...options, retries: retries + 1 });
      }

      this.handleApiError(error, endpoint);
    }
  }

  /**
   * Handle regular (non-streaming) response
   */
  handleRegularResponse(response) {
    const data = response.data;

    if (data.base_resp && data.base_resp.status_code !== 0) {
      throw new Error(`Minimax API error: ${data.base_resp.status_msg}`);
    }

    return {
      content: this.extractContent(data),
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      },
      model: data.model,
      provider: 'minimax',
      finishReason: data.choices?.[0]?.finish_reason
    };
  }

  /**
   * Handle streaming response
   */
  handleStreamingResponse(response) {
    return {
      stream: response.data,
      usage: null, // Usage is not available in streaming mode
      model: null, // Model info will be in the stream
      provider: 'minimax'
    };
  }

  /**
   * Extract content from Minimax response
   */
  extractContent(data) {
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      if (choice.messages && choice.messages.length > 0) {
        return choice.messages[0].content;
      }
      if (choice.text) {
        return choice.text;
      }
    }

    if (data.reply && data.reply.length > 0) {
      return data.reply[0].content;
    }

    throw new Error('No content found in Minimax response');
  }

  /**
   * Validate model
   */
  validateModel(model) {
    if (!this.config.models[model]) {
      throw new Error(`Unsupported model: ${model}. Available models: ${Object.keys(this.config.models).join(', ')}`);
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    if (!error.response) return true; // Network errors are retryable
    
    const status = error.response.status;
    return status >= 500 || status === 429; // Server errors and rate limits are retryable
  }

  /**
   * Handle API errors
   */
  handleApiError(error, endpoint) {
    logger.error('Minimax API error', {
      endpoint,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          throw new Error('Invalid Minimax API key or Group ID');
        case 429:
          throw new Error('Minimax rate limit exceeded');
        case 400:
          throw new Error(`Bad request to Minimax: ${data?.base_resp?.status_msg || data?.message}`);
        case 403:
          throw new Error('Minimax access forbidden');
        case 404:
          throw new Error('Minimax endpoint not found');
        default:
          throw new Error(`Minimax error: ${data?.base_resp?.status_msg || error.message}`);
      }
    } else if (error.request) {
      throw new Error('Minimax service unavailable');
    } else {
      throw new Error(`Minimax error: ${error.message}`);
    }
  }

  /**
   * Delay helper for retries
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Process streaming response
   */
  async processStream(stream, onData, onError, onEnd) {
    try {
      let buffer = '';
      
      stream.on('data', (chunk) => {
        try {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data !== '[DONE]') {
                try {
                  const parsed = JSON.parse(data);
                  onData(parsed);
                } catch (e) {
                  logger.warn('Failed to parse streaming data', { data, error: e.message });
                }
              }
            }
          }
        } catch (error) {
          onError(error);
        }
      });

      stream.on('end', () => {
        // Process any remaining data in buffer
        if (buffer.trim()) {
          try {
            if (buffer.startsWith('data: ')) {
              const data = buffer.substring(6);
              if (data !== '[DONE]') {
                onData(JSON.parse(data));
              }
            }
          } catch (e) {
            logger.warn('Failed to parse final streaming data', { buffer, error: e.message });
          }
        }
        onEnd();
      });

      stream.on('error', onError);

    } catch (error) {
      onError(error);
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(userId, options = {}) {
    const {
      startDate,
      endDate = new Date().toISOString(),
      model = null
    } = options;

    // This would typically query a database for usage data
    // For now, return mock data
    return {
      userId,
      startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate,
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      models: {}
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test API connectivity with a simple request
      await this.makeRequest('/text/chatcompletion', {
        model: 'abab5.5-chat',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        models: this.listModels()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        models: this.listModels()
      };
    }
  }
}

module.exports = new MinimaxService();