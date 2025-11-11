const express = require('express');
const router = express.Router();
const webhookService = require('../services/webhookService');
const auth = require('../middleware/auth');
const { body, query, param, validationResult } = require('express-validator');
const responseFormatter = require('../utils/responseFormatter');

/**
 * Validation middleware for webhook routes
 */
const validateWebhookRegistration = [
  body('url')
    .isURL({ require_tld: false })
    .withMessage('Valid URL is required'),
  
  body('events')
    .optional()
    .isArray()
    .withMessage('Events must be an array')
    .custom((events) => {
      if (!events || events.length === 0) return true;
      const validEvents = [
        'ai.generation.completed',
        'ai.generation.failed',
        'user.created',
        'user.updated',
        'quota.exceeded',
        '*'
      ];
      const invalidEvents = events.filter(event => !validEvents.includes(event));
      if (invalidEvents.length > 0) {
        throw new Error(`Invalid events: ${invalidEvents.join(', ')}`);
      }
      return true;
    }),
  
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  
  body('secret')
    .optional()
    .isString()
    .withMessage('Secret must be a string')
    .isLength({ min: 16, max: 128 })
    .withMessage('Secret must be between 16 and 128 characters'),
  
  body('headers')
    .optional()
    .isObject()
    .withMessage('Headers must be an object'),
  
  body('timeout')
    .optional()
    .isInt({ min: 1000, max: 60000 })
    .withMessage('Timeout must be between 1000ms and 60000ms'),
  
  body('maxRetries')
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage('Max retries must be between 0 and 10')
];

const validateWebhookUpdate = [
  body('url')
    .optional()
    .isURL({ require_tld: false })
    .withMessage('Valid URL is required'),
  
  body('events')
    .optional()
    .isArray()
    .withMessage('Events must be an array')
    .custom((events) => {
      if (!events || events.length === 0) return true;
      const validEvents = [
        'ai.generation.completed',
        'ai.generation.failed',
        'user.created',
        'user.updated',
        'quota.exceeded',
        '*'
      ];
      const invalidEvents = events.filter(event => !validEvents.includes(event));
      if (invalidEvents.length > 0) {
        throw new Error(`Invalid events: ${invalidEvents.join(', ')}`);
      }
      return true;
    }),
  
  body('active')
    .optional()
    .isBoolean()
    .withMessage('Active must be a boolean'),
  
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  
  body('headers')
    .optional()
    .isObject()
    .withMessage('Headers must be an object'),
  
  body('timeout')
    .optional()
    .isInt({ min: 1000, max: 60000 })
    .withMessage('Timeout must be between 1000ms and 60000ms'),
  
  body('maxRetries')
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage('Max retries must be between 0 and 10')
];

const validateEventTrigger = [
  body('event')
    .isString()
    .withMessage('Event name is required')
    .isIn([
      'ai.generation.completed',
      'ai.generation.failed',
      'user.created',
      'user.updated',
      'quota.exceeded'
    ])
    .withMessage('Invalid event type'),
  
  body('payload')
    .isObject()
    .withMessage('Payload must be an object')
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
 * @route   POST /api/v1/webhooks
 * @desc    Register a new webhook
 * @access  Private
 */
router.post('/', 
  auth.verifyToken, 
  validateWebhookRegistration, 
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const webhookData = req.body;

      const webhook = await webhookService.registerWebhook(userId, webhookData);

      res.status(201).json(
        responseFormatter.created(webhook, {
          message: 'Webhook registered successfully'
        }).body
      );

    } catch (error) {
      logger.error('Webhook registration failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'WEBHOOK_REGISTRATION_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/webhooks
 * @desc    List user webhooks
 * @access  Private
 */
router.get('/', 
  auth.verifyToken,
  query(['limit', 'offset', 'event', 'active'])
    .optional()
    .isString(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { limit = 10, offset = 0, event, active } = req.query;

      const webhooks = webhookService.listWebhooks({
        userId,
        event,
        active: active !== undefined ? active === 'true' : null,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json(responseFormatter.success(webhooks).body);

    } catch (error) {
      logger.error('List webhooks failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to list webhooks',
          code: 'LIST_WEBHOOKS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/webhooks/:id
 * @desc    Get webhook details
 * @access  Private
 */
router.get('/:id', 
  auth.verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const webhook = webhookService.getWebhook(id);

      if (!webhook) {
        return res.status(404).json(
          responseFormatter.notFound('Webhook').body
        );
      }

      // Check ownership
      if (webhook.userId !== userId) {
        return res.status(403).json(
          responseFormatter.forbidden('You do not have access to this webhook').body
        );
      }

      // Remove secret from response
      const safeWebhook = { ...webhook };
      delete safeWebhook.secret;

      res.json(responseFormatter.success(safeWebhook).body);

    } catch (error) {
      logger.error('Get webhook failed', {
        userId: req.user.id,
        webhookId: req.params.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get webhook',
          code: 'GET_WEBHOOK_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   PUT /api/v1/webhooks/:id
 * @desc    Update webhook
 * @access  Private
 */
router.put('/:id', 
  auth.verifyToken, 
  validateWebhookUpdate, 
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const updates = req.body;

      const webhook = await webhookService.updateWebhook(userId, id, updates);

      // Remove secret from response
      const safeWebhook = { ...webhook };
      delete safeWebhook.secret;

      res.json(responseFormatter.success(safeWebhook, {
        message: 'Webhook updated successfully'
      }).body);

    } catch (error) {
      logger.error('Update webhook failed', {
        userId: req.user.id,
        webhookId: req.params.id,
        error: error.message
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'UPDATE_WEBHOOK_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   DELETE /api/v1/webhooks/:id
 * @desc    Delete webhook
 * @access  Private
 */
router.delete('/:id', 
  auth.verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      await webhookService.deleteWebhook(userId, id);

      res.json(responseFormatter.deleted({
        message: 'Webhook deleted successfully'
      }).body);

    } catch (error) {
      logger.error('Delete webhook failed', {
        userId: req.user.id,
        webhookId: req.params.id,
        error: error.message
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'DELETE_WEBHOOK_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/webhooks/:id/deliveries
 * @desc    Get webhook delivery history
 * @access  Private
 */
router.get('/:id/deliveries', 
  auth.verifyToken,
  query(['limit', 'offset', 'success'])
    .optional()
    .isString(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { limit = 20, offset = 0, success } = req.query;

      // Check ownership
      const webhook = webhookService.getWebhook(id);
      if (!webhook) {
        return res.status(404).json(
          responseFormatter.notFound('Webhook').body
        );
      }

      if (webhook.userId !== userId) {
        return res.status(403).json(
          responseFormatter.forbidden('You do not have access to this webhook').body
        );
      }

      const deliveries = webhookService.getDeliveryHistory(id, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        success: success !== undefined ? success === 'true' : null
      });

      res.json(responseFormatter.success(deliveries).body);

    } catch (error) {
      logger.error('Get delivery history failed', {
        userId: req.user.id,
        webhookId: req.params.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get delivery history',
          code: 'GET_DELIVERY_HISTORY_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   POST /api/v1/webhooks/:id/test
 * @desc    Test webhook delivery
 * @access  Private
 */
router.post('/:id/test', 
  auth.verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Check ownership
      const webhook = webhookService.getWebhook(id);
      if (!webhook) {
        return res.status(404).json(
          responseFormatter.notFound('Webhook').body
        );
      }

      if (webhook.userId !== userId) {
        return res.status(403).json(
          responseFormatter.forbidden('You do not have access to this webhook').body
        );
      }

      // Test delivery
      const testPayload = {
        test: true,
        timestamp: new Date().toISOString(),
        message: 'This is a test webhook delivery'
      };

      const result = await webhookService.deliverWebhook(
        webhook, 
        'webhook.test', 
        testPayload
      );

      res.json(responseFormatter.success(result, {
        message: 'Webhook test delivery completed'
      }).body);

    } catch (error) {
      logger.error('Test webhook failed', {
        userId: req.user.id,
        webhookId: req.params.id,
        error: error.message
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'TEST_WEBHOOK_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   POST /api/v1/webhooks/trigger
 * @desc    Trigger a webhook event (admin only)
 * @access  Private/Admin
 */
router.post('/trigger', 
  auth.verifyToken, 
  auth.requireAdmin,
  validateEventTrigger, 
  handleValidationErrors,
  async (req, res) => {
    try {
      const { event, payload } = req.body;

      const deliveries = await webhookService.triggerEvent(event, payload);

      res.json(responseFormatter.success({
        event,
        deliveries,
        timestamp: new Date().toISOString()
      }).body);

    } catch (error) {
      logger.error('Trigger webhook event failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(error.statusCode || 500).json(
        responseFormatter.error(error, {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || 'TRIGGER_WEBHOOK_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/v1/webhooks/events
 * @desc    List available webhook events
 * @access  Private
 */
router.get('/events', 
  auth.verifyToken,
  async (req, res) => {
    try {
      const events = [
        {
          name: 'ai.generation.completed',
          description: 'Triggered when AI content generation is completed',
          payload: {
            userId: 'string',
            taskId: 'string',
            model: 'string',
            provider: 'string',
            tokensUsed: 'number',
            cost: 'number'
          }
        },
        {
          name: 'ai.generation.failed',
          description: 'Triggered when AI content generation fails',
          payload: {
            userId: 'string',
            taskId: 'string',
            error: 'string'
          }
        },
        {
          name: 'user.created',
          description: 'Triggered when a new user is created',
          payload: {
            userId: 'string',
            email: 'string',
            role: 'string'
          }
        },
        {
          name: 'user.updated',
          description: 'Triggered when user information is updated',
          payload: {
            userId: 'string',
            updates: 'object'
          }
        },
        {
          name: 'quota.exceeded',
          description: 'Triggered when user exceeds quota limits',
          payload: {
            userId: 'string',
            limitType: 'string',
            currentUsage: 'number',
            limit: 'number'
          }
        },
        {
          name: '*',
          description: 'Wildcard event that matches all events',
          payload: 'varies by event'
        }
      ];

      res.json(responseFormatter.success(events).body);

    } catch (error) {
      logger.error('Get webhook events failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get webhook events',
          code: 'GET_WEBHOOK_EVENTS_FAILED'
        }).body
      );
    }
  }
);

module.exports = router;