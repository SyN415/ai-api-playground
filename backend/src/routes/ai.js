const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const quotaService = require('../services/quotaService');
const webhookService = require('../services/webhookService');
const minimaxService = require('../services/minimaxService');
const loggingService = require('../services/loggingService');
const auth = require('../middleware/auth');
const { body, query, validationResult } = require('express-validator');
const responseFormatter = require('../utils/responseFormatter');

/**
 * Validation middleware for AI routes
 */
const validateAiRequest = [
  body('prompt')
    .optional()
    .isString()
    .withMessage('Prompt must be a string')
    .isLength({ max: 10000 })
    .withMessage('Prompt must be less than 10000 characters'),
  
  body('messages')
    .optional()
    .isArray()
    .withMessage('Messages must be an array'),
  
  body('model')
    .optional()
    .isString()
    .withMessage('Model must be a string'),
  
  body('provider')
    .optional()
    .isIn(['minimax', 'openai', 'anthropic'])
    .withMessage('Provider must be one of: minimax, openai, anthropic'),
  
  body('temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Temperature must be between 0 and 2'),
  
  body('maxTokens')
    .optional()
    .isInt({ min: 1, max: 8192 })
    .withMessage('Max tokens must be between 1 and 8192'),
  
  body('stream')
    .optional()
    .isBoolean()
    .withMessage('Stream must be a boolean'),
  
  body('functions')
    .optional()
    .isArray()
    .withMessage('Functions must be an array')
];

const validateEmbeddingsRequest = [
  body('texts')
    .isArray({ min: 1 })
    .withMessage('Texts must be a non-empty array'),
  
  body('texts.*')
    .isString()
    .withMessage('Each text must be a string')
    .isLength({ max: 8192 })
    .withMessage('Each text must be less than 8192 characters'),
  
  body('model')
    .optional()
    .isString()
    .withMessage('Model must be a string'),
  
  body('provider')
    .optional()
    .isIn(['minimax'])
    .withMessage('Provider must be minimax for embeddings')
];

const validateImageRequest = [
  body('prompt')
    .isString()
    .withMessage('Prompt must be a string')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Prompt must be between 1 and 1000 characters'),
  
  body('model')
    .optional()
    .isString()
    .withMessage('Model must be a string'),
  
  body('size')
    .optional()
    .isIn(['1024x1024', '1024x1792', '1792x1024'])
    .withMessage('Size must be one of: 1024x1024, 1024x1792, 1792x1024'),
  
  body('quality')
    .optional()
    .isIn(['standard', 'high'])
    .withMessage('Quality must be standard or high')
];

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json(
      responseFormatter.validationError(errors.array()).body
    );
  }
  next();
};

/**
 * @route   POST /api/v1/ai/generate
 * @desc    Generate AI content
 * @access  Private
 */
router.post('/generate', 
  auth.verifyToken, 
  validateAiRequest, 
  handleValidationErrors,
  async (req, res) => {
    try {
      const { prompt, messages, model, provider, temperature, maxTokens, stream, functions } = req.body;
      const userId = req.user.id;

      // Check quota
      const estimatedTokens = maxTokens || 1000;
      await quotaService.checkQuota(userId, { tokens: estimatedTokens });

      // Generate content
      const result = await aiService.generate({
        prompt,
        messages,
        model,
        provider,
        temperature,
        maxTokens,
        stream,
        functions,
        userId
      });

      // Record usage
      const tokensUsed = result.usage?.totalTokens || estimatedTokens;
      const cost = tokensUsed * 0.0001; // $0.0001 per token
      quotaService.recordUsage(userId, { tokens: tokensUsed, cost });

      // Trigger webhook for AI generation event
      webhookService.triggerEvent('ai.generation.completed', {
        userId,
        taskId: result.taskId,
        model: result.model,
        provider: result.provider,
        tokensUsed,
        cost
      }).catch(err => {
        logger.error('Webhook trigger failed', { error: err.message });
      });

      // Handle streaming response
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // For now, return a simple streaming response
        // In production, this would stream tokens as they arrive
        res.write(`data: ${JSON.stringify(result)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.json(responseFormatter.success(result).body);
      }

    } catch (error) {
      logger.error('AI generation failed', {
        userId: req.user.id,
        error: error.message
      });

      // Record failed usage
      quotaService.recordUsage(req.user.id, { 
        tokens: 0, 
        cost: 0, 
        success: false 
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'AI_GENERATION_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   POST /api/v1/ai/embeddings
 * @desc    Generate embeddings
 * @access  Private
 */
router.post('/embeddings', 
  auth.verifyToken, 
  validateEmbeddingsRequest, 
  handleValidationErrors,
  async (req, res) => {
    try {
      const { texts, model, provider } = req.body;
      const userId = req.user.id;

      // Check quota
      const estimatedTokens = texts.length * 100; // Rough estimate
      await quotaService.checkQuota(userId, { tokens: estimatedTokens });

      // Generate embeddings
      const result = await aiService.generateEmbeddings({
        texts,
        model,
        provider,
        userId
      });

      // Record usage
      const tokensUsed = result.usage?.totalTokens || estimatedTokens;
      const cost = tokensUsed * 0.0001;
      quotaService.recordUsage(userId, { tokens: tokensUsed, cost });

      res.json(responseFormatter.success(result).body);

    } catch (error) {
      logger.error('Embeddings generation failed', {
        userId: req.user.id,
        error: error.message
      });

      quotaService.recordUsage(req.user.id, { 
        tokens: 0, 
        cost: 0, 
        success: false 
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'EMBEDDINGS_GENERATION_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   POST /api/v1/ai/images
 * @desc    Generate images
 * @access  Private
 */
router.post('/images', 
  auth.verifyToken, 
  validateImageRequest, 
  handleValidationErrors,
  async (req, res) => {
    try {
      const { prompt, model, size, quality } = req.body;
      const userId = req.user.id;

      // Check quota
      await quotaService.checkQuota(userId, { tokens: 1000 }); // Image generation cost

      // Generate image
      const result = await aiService.generateImage({
        prompt,
        model,
        size,
        quality,
        userId
      });

      // Record usage
      const cost = 0.05; // $0.05 per image
      quotaService.recordUsage(userId, { tokens: 1000, cost });

      res.json(responseFormatter.success(result).body);

    } catch (error) {
      logger.error('Image generation failed', {
        userId: req.user.id,
        error: error.message
      });

      quotaService.recordUsage(req.user.id, { 
        tokens: 0, 
        cost: 0, 
        success: false 
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'IMAGE_GENERATION_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/ai/status/:taskId
 * @desc    Get task status
 * @access  Private
 */
router.get('/status/:taskId', 
  auth.verifyToken,
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const userId = req.user.id;

      const task = aiService.getTask(taskId);
      
      if (!task) {
        return res.status(404).json(
          responseFormatter.notFound('Task').body
        );
      }

      // Check if user owns this task
      if (task.metadata.userId !== userId) {
        return res.status(403).json(
          responseFormatter.forbidden('You do not have access to this task').body
        );
      }

      res.json(responseFormatter.success(task).body);

    } catch (error) {
      logger.error('Get task status failed', {
        userId: req.user.id,
        taskId: req.params.taskId,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get task status',
          code: 'GET_TASK_STATUS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/ai/history
 * @desc    Get user request history
 * @access  Private
 */
router.get('/history', 
  auth.verifyToken,
  query(['limit', 'offset', 'type', 'startDate', 'endDate'])
    .optional()
    .isString(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0, type, startDate, endDate } = req.query;

      const history = aiService.getUserHistory(userId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        type,
        startDate,
        endDate
      });

      res.json(responseFormatter.success(history).body);

    } catch (error) {
      logger.error('Get user history failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get user history',
          code: 'GET_USER_HISTORY_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/ai/models
 * @desc    Get available AI models
 * @access  Public
 */
router.get('/models', async (req, res) => {
  try {
    const models = aiService.getAvailableModels();
    
    res.json(responseFormatter.success(models).body);

  } catch (error) {
    logger.error('Get models failed', { error: error.message });

    res.status(500).json(
      responseFormatter.error(error, {
        message: 'Failed to get available models',
        code: 'GET_MODELS_FAILED'
      }).body
    );
  }
});

/**
 * @route   GET /api/v1/ai/models/:provider
 * @desc    Get models for specific provider
 * @access  Public
 */
router.get('/models/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const providerInfo = aiService.getProviderInfo(provider);
    
    res.json(responseFormatter.success(providerInfo).body);

  } catch (error) {
    logger.error('Get provider models failed', {
      provider: req.params.provider,
      error: error.message
    });

    res.status(error.statusCode || 500).json(
      responseFormatter.error(error, {
        message: error.message,
        statusCode: error.statusCode || 500,
        code: error.code || 'GET_PROVIDER_MODELS_FAILED'
      }).body
    );
  }
});

/**
 * @route   GET /api/v1/ai/usage
 * @desc    Get AI usage statistics
 * @access  Private
 */
router.get('/usage', 
  auth.verifyToken,
  query(['startDate', 'endDate', 'provider'])
    .optional()
    .isString(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { startDate, endDate, provider } = req.query;

      const usage = await aiService.getUsageStats(userId, {
        startDate,
        endDate,
        provider
      });

      res.json(responseFormatter.success(usage).body);

    } catch (error) {
      logger.error('Get usage stats failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get usage statistics',
          code: 'GET_USAGE_STATS_FAILED'
        }).body
      );
    }
  }
);

/**
 * Minimax-specific routes
 */

/**
 * @route   POST /api/v1/ai/minimax/video
 * @desc    Generate video using Minimax Hailuo 2.3
 * @access  Private
 */
router.post('/minimax/video',
  auth.verifyToken,
  [
    body('prompt')
      .isString()
      .withMessage('Prompt must be a string')
      .isLength({ min: 1, max: 5000 })
      .withMessage('Prompt must be between 1 and 5000 characters'),
    
    body('model')
      .optional()
      .isString()
      .withMessage('Model must be a string'),
    
    body('negativePrompt')
      .optional()
      .isString()
      .withMessage('Negative prompt must be a string')
      .isLength({ max: 1000 })
      .withMessage('Negative prompt must be less than 1000 characters'),
    
    body('duration')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Duration must be between 1 and 10 seconds'),
    
    body('resolution')
      .optional()
      .isIn(['1280x720', '1024x576', '854x480'])
      .withMessage('Resolution must be one of: 1280x720, 1024x576, 854x480'),
    
    body('frameRate')
      .optional()
      .isIn([24, 30, 60])
      .withMessage('Frame rate must be 24, 30, or 60'),
    
    body('imagePath')
      .optional()
      .isString()
      .withMessage('Image path must be a string')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { prompt, model = 'hailuo-2.3', negativePrompt, duration, resolution, frameRate, imagePath } = req.body;
      const userId = req.user.id;

      // Check quota - Hailuo 2.3 costs $0.49 per call
      const estimatedCost = 0.49;
      await quotaService.checkQuota(userId, { cost: estimatedCost });

      // Log the request
      loggingService.logMinimaxVideoGeneration({
        userId,
        model,
        prompt,
        duration: duration || 5,
        resolution: resolution || '1280x720',
        hasImage: !!imagePath
      });

      // Generate video
      const result = await minimaxService.generateVideo({
        prompt,
        model,
        negativePrompt,
        duration: duration || 5,
        resolution: resolution || '1280x720',
        frameRate: frameRate || 30,
        imagePath,
        userId
      });

      // Record usage
      quotaService.recordUsage(userId, {
        tokens: 0, // Video generation doesn't use tokens
        cost: estimatedCost,
        requestType: 'minimax_video_generation'
      });

      // Trigger webhook
      webhookService.triggerEvent('minimax.video.generation.started', {
        userId,
        taskId: result.taskId,
        model,
        estimatedCost
      }).catch(err => {
        logger.error('Webhook trigger failed', { error: err.message });
      });

      res.json(responseFormatter.success(result).body);

    } catch (error) {
      logger.error('Minimax video generation failed', {
        userId: req.user.id,
        error: error.message
      });

      // Record failed usage
      quotaService.recordUsage(req.user.id, {
        tokens: 0,
        cost: 0,
        success: false,
        requestType: 'minimax_video_generation'
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'MINIMAX_VIDEO_GENERATION_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/ai/minimax/status/:taskId
 * @desc    Check Minimax video generation status
 * @access  Private
 */
router.get('/minimax/status/:taskId',
  auth.verifyToken,
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const userId = req.user.id;

      const status = await minimaxService.checkVideoStatus(taskId);
      
      // Verify user owns this task
      if (status.userId && status.userId !== userId) {
        return res.status(403).json(
          responseFormatter.forbidden('You do not have access to this task').body
        );
      }

      res.json(responseFormatter.success(status).body);

    } catch (error) {
      logger.error('Minimax status check failed', {
        userId: req.user.id,
        taskId: req.params.taskId,
        error: error.message
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'MINIMAX_STATUS_CHECK_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/ai/minimax/result/:taskId
 * @desc    Get Minimax video generation result
 * @access  Private
 */
router.get('/minimax/result/:taskId',
  auth.verifyToken,
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const userId = req.user.id;

      const result = await minimaxService.getVideoResult(taskId);
      
      // Verify user owns this task
      if (result.userId && result.userId !== userId) {
        return res.status(403).json(
          responseFormatter.forbidden('You do not have access to this task').body
        );
      }

      // If completed, trigger webhook
      if (result.status === 'completed' && result.result) {
        webhookService.triggerEvent('minimax.video.generation.completed', {
          userId,
          taskId,
          result: result.result
        }).catch(err => {
          logger.error('Webhook trigger failed', { error: err.message });
        });
      }

      res.json(responseFormatter.success(result).body);

    } catch (error) {
      logger.error('Minimax result retrieval failed', {
        userId: req.user.id,
        taskId: req.params.taskId,
        error: error.message
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'MINIMAX_RESULT_RETRIEVAL_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   POST /api/v1/ai/minimax/image-to-video
 * @desc    Convert image to video using Minimax Hailuo 2.3
 * @access  Private
 */
router.post('/minimax/image-to-video',
  auth.verifyToken,
  [
    body('prompt')
      .isString()
      .withMessage('Prompt must be a string')
      .isLength({ min: 1, max: 5000 })
      .withMessage('Prompt must be between 1 and 5000 characters'),
    
    body('imageUrl')
      .isString()
      .withMessage('Image URL must be a string')
      .isURL()
      .withMessage('Image URL must be a valid URL'),
    
    body('model')
      .optional()
      .isString()
      .withMessage('Model must be a string'),
    
    body('negativePrompt')
      .optional()
      .isString()
      .withMessage('Negative prompt must be a string')
      .isLength({ max: 1000 })
      .withMessage('Negative prompt must be less than 1000 characters'),
    
    body('duration')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Duration must be between 1 and 10 seconds'),
    
    body('resolution')
      .optional()
      .isIn(['1280x720', '1024x576', '854x480'])
      .withMessage('Resolution must be one of: 1280x720, 1024x576, 854x480')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { prompt, imageUrl, model = 'hailuo-2.3', negativePrompt, duration, resolution } = req.body;
      const userId = req.user.id;

      // Download image temporarily
      const imagePath = await downloadImageTemp(imageUrl);
      
      try {
        // Check quota
        const estimatedCost = 0.49;
        await quotaService.checkQuota(userId, { cost: estimatedCost });

        // Log the request
        loggingService.logMinimaxVideoGeneration({
          userId,
          model,
          prompt,
          duration: duration || 5,
          resolution: resolution || '1280x720',
          hasImage: true
        });

        // Generate video from image
        const result = await minimaxService.generateVideo({
          prompt,
          model,
          imagePath,
          negativePrompt,
          duration: duration || 5,
          resolution: resolution || '1280x720',
          userId
        });

        // Record usage
        quotaService.recordUsage(userId, {
          tokens: 0,
          cost: estimatedCost,
          requestType: 'minimax_image_to_video'
        });

        // Trigger webhook
        webhookService.triggerEvent('minimax.image_to_video.started', {
          userId,
          taskId: result.taskId,
          model,
          estimatedCost
        }).catch(err => {
          logger.error('Webhook trigger failed', { error: err.message });
        });

        res.json(responseFormatter.success(result).body);

      } finally {
        // Clean up temporary image file
        try {
          await fs.unlink(imagePath);
        } catch (e) {
          logger.warn('Failed to clean up temporary image file', { error: e.message });
        }
      }

    } catch (error) {
      logger.error('Minimax image-to-video conversion failed', {
        userId: req.user.id,
        error: error.message
      });

      // Record failed usage
      quotaService.recordUsage(req.user.id, {
        tokens: 0,
        cost: 0,
        success: false,
        requestType: 'minimax_image_to_video'
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'MINIMAX_IMAGE_TO_VIDEO_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/ai/minimax/models
 * @desc    List available Minimax models
 * @access  Public
 */
router.get('/minimax/models', async (req, res) => {
  try {
    const models = minimaxService.listModels();
    
    res.json(responseFormatter.success(models).body);

  } catch (error) {
    logger.error('Get Minimax models failed', { error: error.message });

    res.status(500).json(
      responseFormatter.error(error, {
        message: 'Failed to get Minimax models',
        code: 'GET_MINIMAX_MODELS_FAILED'
      }).body
    );
  }
);

/**
 * Helper function to download image temporarily
 */
async function downloadImageTemp(imageUrl) {
  const axios = require('axios');
  const path = require('path');
  const fs = require('fs').promises;
  
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const tempFile = path.join(tempDir, `temp_image_${Date.now()}.jpg`);
    await fs.writeFile(tempFile, response.data);
    
    return tempFile;
  } catch (error) {
    throw new Error(`Failed to download image: ${error.message}`);
  }
}

module.exports = router;