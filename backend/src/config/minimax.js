/**
 * Minimax AI Configuration
 * Configuration for Minimax Hailuo 2.3 and other models
 */

const config = {
  // API Configuration
  api: {
    baseURL: process.env.MINIMAX_API_BASE || 'https://api.minimax.chat/v1',
    videoBaseURL: process.env.MINIMAX_VIDEO_API_BASE || 'https://api.minimax.chat/v1',
    timeout: parseInt(process.env.MINIMAX_API_TIMEOUT) || 30000,
    maxRetries: parseInt(process.env.MINIMAX_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.MINIMAX_RETRY_DELAY) || 1000,
    exponentialBackoff: process.env.MINIMAX_EXPONENTIAL_BACKOFF === 'true',
    maxBackoffDelay: parseInt(process.env.MINIMAX_MAX_BACKOFF_DELAY) || 30000
  },

  // Authentication
  auth: {
    apiKey: process.env.MINIMAX_API_KEY,
    groupId: process.env.MINIMAX_GROUP_ID,
    enabled: process.env.MINIMAX_ENABLED === 'true'
  },

  // Model Specifications
  models: {
    'hailuo-2.3': {
      id: 'hailuo-2.3',
      name: 'Hailuo 2.3',
      type: 'video',
      description: 'Advanced video generation model with image-to-video capabilities',
      maxTokens: 8192,
      supportsStreaming: false,
      supportsFunctions: false,
      cost: {
        perCall: 0.49, // $0.49 per video generation call
        currency: 'USD'
      },
      capabilities: {
        textToVideo: true,
        imageToVideo: true,
        videoToVideo: false,
        batchProcessing: false,
        resolution: {
          maxWidth: 1280,
          maxHeight: 720,
          supported: ['1280x720', '1024x576', '854x480']
        },
        duration: {
          maxSeconds: 10,
          minSeconds: 1,
          defaultSeconds: 5
        },
        frameRate: {
          default: 30,
          supported: [24, 30, 60]
        }
      }
    },
    'abab5.5-chat': {
      id: 'abab5.5-chat',
      name: 'Abab5.5 Chat',
      type: 'chat',
      description: 'Advanced conversational AI model',
      maxTokens: 4096,
      supportsStreaming: true,
      supportsFunctions: true,
      cost: {
        perToken: 0.0001, // $0.0001 per token
        currency: 'USD'
      }
    },
    'abab5.5s-chat': {
      id: 'abab5.5s-chat',
      name: 'Abab5.5s Chat',
      type: 'chat',
      description: 'Lightweight conversational AI model',
      maxTokens: 4096,
      supportsStreaming: true,
      supportsFunctions: true,
      cost: {
        perToken: 0.00005, // $0.00005 per token
        currency: 'USD'
      }
    },
    'embo-01': {
      id: 'embo-01',
      name: 'Embo 01',
      type: 'embeddings',
      description: 'Text embeddings model',
      maxTokens: 2048,
      supportsStreaming: false,
      supportsFunctions: false,
      cost: {
        perToken: 0.00001, // $0.00001 per token
        currency: 'USD'
      }
    },
    'hailuo-img': {
      id: 'hailuo-img',
      name: 'Hailuo Image',
      type: 'image',
      description: 'Image generation model',
      maxTokens: 2048,
      supportsStreaming: false,
      supportsFunctions: false,
      cost: {
        perImage: 0.05, // $0.05 per image
        currency: 'USD'
      }
    }
  },

  // Video Generation Settings
  video: {
    defaultModel: 'hailuo-2.3',
    maxConcurrentJobs: parseInt(process.env.MINIMAX_MAX_CONCURRENT_JOBS) || 3,
    statusCheckInterval: parseInt(process.env.MINIMAX_STATUS_CHECK_INTERVAL) || 5000,
    maxStatusCheckAttempts: parseInt(process.env.MINIMAX_MAX_STATUS_CHECK_ATTEMPTS) || 60,
    webhookTimeout: parseInt(process.env.MINIMAX_WEBHOOK_TIMEOUT) || 30000,
    supportedFormats: ['mp4', 'mov', 'avi'],
    defaultFormat: 'mp4',
    qualitySettings: {
      high: { bitrate: '5000k', preset: 'slow' },
      medium: { bitrate: '3000k', preset: 'medium' },
      low: { bitrate: '1500k', preset: 'fast' }
    }
  },

  // Rate Limiting
  rateLimit: {
    requestsPerMinute: parseInt(process.env.MINIMAX_REQUESTS_PER_MINUTE) || 10,
    requestsPerHour: parseInt(process.env.MINIMAX_REQUESTS_PER_HOUR) || 100,
    requestsPerDay: parseInt(process.env.MINIMAX_REQUESTS_PER_DAY) || 1000,
    tokensPerMinute: parseInt(process.env.MINIMAX_TOKENS_PER_MINUTE) || 10000,
    tokensPerHour: parseInt(process.env.MINIMAX_TOKENS_PER_HOUR) || 100000,
    tokensPerDay: parseInt(process.env.MINIMAX_TOKENS_PER_DAY) || 1000000
  },

  // Webhook Configuration
  webhook: {
    enabled: process.env.MINIMAX_WEBHOOK_ENABLED === 'true',
    secret: process.env.MINIMAX_WEBHOOK_SECRET,
    url: process.env.MINIMAX_WEBHOOK_URL,
    events: ['video.completed', 'video.failed', 'video.processing']
  },

  // Logging Configuration
  logging: {
    logRequests: process.env.MINIMAX_LOG_REQUESTS === 'true',
    logResponses: process.env.MINIMAX_LOG_RESPONSES === 'true',
    logErrors: process.env.MINIMAX_LOG_ERRORS === 'true',
    includeHeaders: process.env.MINIMAX_LOG_HEADERS === 'true',
    includePayload: process.env.MINIMAX_LOG_PAYLOAD === 'true',
    maxPayloadSize: parseInt(process.env.MINIMAX_MAX_LOG_PAYLOAD_SIZE) || 10000
  },

  // Validation Rules
  validation: {
    maxPromptLength: parseInt(process.env.MINIMAX_MAX_PROMPT_LENGTH) || 5000,
    maxNegativePromptLength: parseInt(process.env.MINIMAX_MAX_NEGATIVE_PROMPT_LENGTH) || 1000,
    maxBatchSize: parseInt(process.env.MINIMAX_MAX_BATCH_SIZE) || 10,
    supportedImageFormats: ['jpg', 'jpeg', 'png', 'webp'],
    maxImageSize: parseInt(process.env.MINIMAX_MAX_IMAGE_SIZE) || 10 * 1024 * 1024, // 10MB
    maxVideoSize: parseInt(process.env.MINIMAX_MAX_VIDEO_SIZE) || 100 * 1024 * 1024 // 100MB
  },

  // Error Handling
  errorHandling: {
    retryableStatusCodes: [429, 500, 502, 503, 504],
    maxRetryAttempts: parseInt(process.env.MINIMAX_MAX_RETRY_ATTEMPTS) || 3,
    circuitBreakerThreshold: parseInt(process.env.MINIMAX_CIRCUIT_BREAKER_THRESHOLD) || 5,
    circuitBreakerTimeout: parseInt(process.env.MINIMAX_CIRCUIT_BREAKER_TIMEOUT) || 60000
  }
};

// Validate configuration
function validateConfig() {
  const errors = [];

  if (!config.auth.apiKey) {
    errors.push('MINIMAX_API_KEY is not configured');
  }

  if (!config.auth.groupId) {
    errors.push('MINIMAX_GROUP_ID is not configured');
  }

  if (errors.length > 0) {
    console.warn('Minimax configuration warnings:', errors.join(', '));
  }

  return errors.length === 0;
}

// Export configuration
module.exports = {
  config,
  validateConfig,
  getModel: (modelId) => config.models[modelId],
  getModelCost: (modelId, usage = {}) => {
    const model = config.models[modelId];
    if (!model) return 0;

    const costConfig = model.cost;
    
    if (costConfig.perCall) {
      return costConfig.perCall;
    } else if (costConfig.perToken && usage.tokens) {
      return usage.tokens * costConfig.perToken;
    } else if (costConfig.perImage && usage.images) {
      return usage.images * costConfig.perImage;
    }

    return 0;
  }
};