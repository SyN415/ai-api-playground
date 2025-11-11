const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const responseFormatter = require('../utils/responseFormatter');

/**
 * Webhook Management Service
 * Handles webhook registration, delivery, retry logic, and management
 */
class WebhookService {
  constructor() {
    // In-memory webhook storage (use database in production)
    this.webhooks = new Map();
    this.deliveryHistory = new Map();
    
    this.config = {
      maxWebhooksPerUser: 10,
      maxRetries: 3,
      retryDelay: 5000, // 5 seconds
      timeout: 10000, // 10 seconds
      maxPayloadSize: 1024 * 1024, // 1MB
      enableSigning: true,
      signatureHeader: 'X-Webhook-Signature',
      signatureAlgorithm: 'sha256',
      userAgent: 'AI-API-Playground-Webhook/1.0'
    };

    // Start delivery cleanup timer
    this.startDeliveryCleanup();
  }

  /**
   * Register a new webhook
   */
  async registerWebhook(userId, webhookData) {
    try {
      // Validate webhook data
      this.validateWebhookData(webhookData);

      // Check webhook limit per user
      const userWebhooks = this.getUserWebhooks(userId);
      if (userWebhooks.length >= this.config.maxWebhooksPerUser) {
        throw new Error(`Maximum webhooks per user (${this.config.maxWebhooksPerUser}) exceeded`);
      }

      // Check for duplicate URL
      const duplicate = userWebhooks.find(w => w.url === webhookData.url);
      if (duplicate) {
        throw new Error('Webhook with this URL already exists');
      }

      // Create webhook object
      const webhook = {
        id: this.generateWebhookId(),
        userId,
        url: webhookData.url,
        events: webhookData.events || ['*'],
        secret: webhookData.secret || this.generateSecret(),
        active: webhookData.active !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          description: webhookData.description || '',
          headers: webhookData.headers || {},
          timeout: webhookData.timeout || this.config.timeout,
          maxRetries: webhookData.maxRetries || this.config.maxRetries,
          retryDelay: webhookData.retryDelay || this.config.retryDelay
        }
      };

      // Store webhook
      this.webhooks.set(webhook.id, webhook);

      logger.info('Webhook registered', {
        webhookId: webhook.id,
        userId,
        url: webhook.url,
        events: webhook.events
      });

      return webhook;

    } catch (error) {
      logger.error('Webhook registration failed', {
        userId,
        error: error.message,
        url: webhookData.url
      });
      throw error;
    }
  }

  /**
   * Update existing webhook
   */
  async updateWebhook(userId, webhookId, updates) {
    try {
      const webhook = this.webhooks.get(webhookId);
      
      if (!webhook) {
        throw new Error('Webhook not found');
      }

      if (webhook.userId !== userId) {
        throw new Error('Unauthorized to update this webhook');
      }

      // Update allowed fields
      const allowedUpdates = ['url', 'events', 'active', 'metadata'];
      const updatedWebhook = { ...webhook };

      for (const field of allowedUpdates) {
        if (updates[field] !== undefined) {
          if (field === 'metadata') {
            updatedWebhook.metadata = { ...webhook.metadata, ...updates[field] };
          } else {
            updatedWebhook[field] = updates[field];
          }
        }
      }

      updatedWebhook.updatedAt = new Date().toISOString();
      this.webhooks.set(webhookId, updatedWebhook);

      logger.info('Webhook updated', {
        webhookId,
        userId,
        updates: Object.keys(updates)
      });

      return updatedWebhook;

    } catch (error) {
      logger.error('Webhook update failed', {
        webhookId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(userId, webhookId) {
    try {
      const webhook = this.webhooks.get(webhookId);
      
      if (!webhook) {
        throw new Error('Webhook not found');
      }

      if (webhook.userId !== userId) {
        throw new Error('Unauthorized to delete this webhook');
      }

      this.webhooks.delete(webhookId);

      logger.info('Webhook deleted', {
        webhookId,
        userId,
        url: webhook.url
      });

      return { success: true };

    } catch (error) {
      logger.error('Webhook deletion failed', {
        webhookId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get webhook by ID
   */
  getWebhook(webhookId) {
    return this.webhooks.get(webhookId) || null;
  }

  /**
   * Get webhooks for user
   */
  getUserWebhooks(userId) {
    return Array.from(this.webhooks.values())
      .filter(webhook => webhook.userId === userId);
  }

  /**
   * List webhooks with filtering
   */
  listWebhooks(options = {}) {
    const {
      userId = null,
      event = null,
      active = null,
      limit = 50,
      offset = 0
    } = options;

    let webhooks = Array.from(this.webhooks.values());

    // Apply filters
    if (userId) {
      webhooks = webhooks.filter(w => w.userId === userId);
    }
    if (event) {
      webhooks = webhooks.filter(w => w.events.includes(event) || w.events.includes('*'));
    }
    if (active !== null) {
      webhooks = webhooks.filter(w => w.active === active);
    }

    const total = webhooks.length;
    webhooks = webhooks.slice(offset, offset + limit);

    return {
      webhooks,
      total,
      limit,
      offset
    };
  }

  /**
   * Trigger webhooks for an event
   */
  async triggerEvent(event, payload, options = {}) {
    const {
      userId = null,
      timeout = this.config.timeout
    } = options;

    try {
      // Find matching webhooks
      const matchingWebhooks = this.findMatchingWebhooks(event, userId);
      
      if (matchingWebhooks.length === 0) {
        logger.debug('No matching webhooks found for event', { event, userId });
        return [];
      }

      logger.info('Triggering webhooks for event', {
        event,
        userId,
        webhookCount: matchingWebhooks.length
      });

      // Trigger webhooks concurrently
      const results = await Promise.allSettled(
        matchingWebhooks.map(webhook => 
          this.deliverWebhook(webhook, event, payload, { timeout })
        )
      );

      // Process results
      const deliveries = results.map((result, index) => ({
        webhookId: matchingWebhooks[index].id,
        success: result.status === 'fulfilled',
        error: result.status === 'rejected' ? result.reason.message : null,
        timestamp: new Date().toISOString()
      }));

      logger.info('Webhook deliveries completed', {
        event,
        successful: deliveries.filter(d => d.success).length,
        failed: deliveries.filter(d => !d.success).length
      });

      return deliveries;

    } catch (error) {
      logger.error('Event triggering failed', {
        event,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find webhooks matching an event
   */
  findMatchingWebhooks(event, userId = null) {
    return Array.from(this.webhooks.values())
      .filter(webhook => {
        if (!webhook.active) return false;
        if (userId && webhook.userId !== userId) return false;
        return webhook.events.includes(event) || webhook.events.includes('*');
      });
  }

  /**
   * Deliver webhook payload
   */
  async deliverWebhook(webhook, event, payload, options = {}) {
    const {
      timeout = webhook.metadata.timeout || this.config.timeout,
      retryCount = 0
    } = options;

    const deliveryId = this.generateDeliveryId();
    const timestamp = new Date().toISOString();

    try {
      // Prepare payload
      const webhookPayload = {
        event,
        timestamp,
        deliveryId,
        payload,
        metadata: {
          webhookId: webhook.id,
          userId: webhook.userId
        }
      };

      // Sign payload if secret is available
      const signature = this.signPayload(webhookPayload, webhook.secret);
      
      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': this.config.userAgent,
        'X-Webhook-Event': event,
        'X-Webhook-Delivery-ID': deliveryId,
        'X-Webhook-Timestamp': timestamp,
        ...webhook.metadata.headers
      };

      if (signature) {
        headers[this.config.signatureHeader] = signature;
      }

      // Make request
      const response = await axios.post(webhook.url, webhookPayload, {
        timeout,
        headers,
        validateStatus: (status) => status < 500 // Retry only on server errors
      });

      // Record successful delivery
      this.recordDelivery(deliveryId, {
        webhookId: webhook.id,
        event,
        success: true,
        statusCode: response.status,
        timestamp,
        retryCount
      });

      logger.debug('Webhook delivered successfully', {
        deliveryId,
        webhookId: webhook.id,
        event,
        statusCode: response.status
      });

      return {
        deliveryId,
        success: true,
        statusCode: response.status,
        timestamp
      };

    } catch (error) {
      // Record failed delivery
      this.recordDelivery(deliveryId, {
        webhookId: webhook.id,
        event,
        success: false,
        error: error.message,
        timestamp,
        retryCount
      });

      // Retry if applicable
      if (retryCount < webhook.metadata.maxRetries) {
        logger.warn(`Webhook delivery failed, retrying (${retryCount + 1}/${webhook.metadata.maxRetries})`, {
          deliveryId,
          webhookId: webhook.id,
          event,
          error: error.message
        });

        await this.delay(webhook.metadata.retryDelay * (retryCount + 1));
        return this.deliverWebhook(webhook, event, payload, {
          timeout,
          retryCount: retryCount + 1
        });
      }

      logger.error('Webhook delivery failed after all retries', {
        deliveryId,
        webhookId: webhook.id,
        event,
        error: error.message,
        retryCount
      });

      throw error;
    }
  }

  /**
   * Sign webhook payload
   */
  signPayload(payload, secret) {
    if (!this.config.enableSigning || !secret) {
      return null;
    }

    try {
      const payloadString = JSON.stringify(payload);
      return crypto
        .createHmac(this.config.signatureAlgorithm, secret)
        .update(payloadString)
        .digest('hex');
    } catch (error) {
      logger.error('Failed to sign webhook payload', { error: error.message });
      return null;
    }
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload, signature, secret) {
    if (!this.config.enableSigning || !secret) {
      return true;
    }

    try {
      const expectedSignature = this.signPayload(payload, secret);
      return signature === expectedSignature;
    } catch (error) {
      logger.error('Failed to verify webhook signature', { error: error.message });
      return false;
    }
  }

  /**
   * Record delivery attempt
   */
  recordDelivery(deliveryId, deliveryInfo) {
    if (!this.deliveryHistory.has(deliveryInfo.webhookId)) {
      this.deliveryHistory.set(deliveryInfo.webhookId, []);
    }

    const history = this.deliveryHistory.get(deliveryInfo.webhookId);
    history.push({
      deliveryId,
      ...deliveryInfo
    });

    // Keep only last 100 deliveries per webhook
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    this.deliveryHistory.set(deliveryInfo.webhookId, history);
  }

  /**
   * Get delivery history for webhook
   */
  getDeliveryHistory(webhookId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      success = null
    } = options;

    let history = this.deliveryHistory.get(webhookId) || [];

    // Filter by success status
    if (success !== null) {
      history = history.filter(d => d.success === success);
    }

    const total = history.length;
    history = history.slice(offset, offset + limit);

    return {
      deliveries: history,
      total,
      limit,
      offset
    };
  }

  /**
   * Validate webhook data
   */
  validateWebhookData(data) {
    if (!data.url) {
      throw new Error('Webhook URL is required');
    }

    if (!this.isValidUrl(data.url)) {
      throw new Error('Invalid webhook URL');
    }

    if (data.events && !Array.isArray(data.events)) {
      throw new Error('Events must be an array');
    }

    if (data.events && data.events.length === 0) {
      throw new Error('At least one event must be specified');
    }

    if (data.timeout && (data.timeout < 1000 || data.timeout > 60000)) {
      throw new Error('Timeout must be between 1000ms and 60000ms');
    }

    if (data.maxRetries && (data.maxRetries < 0 || data.maxRetries > 10)) {
      throw new Error('Max retries must be between 0 and 10');
    }

    return true;
  }

  /**
   * Validate URL
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate webhook ID
   */
  generateWebhookId() {
    return `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate delivery ID
   */
  generateDeliveryId() {
    return `dlv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate secret
   */
  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Start delivery cleanup timer
   */
  startDeliveryCleanup() {
    // Clean up old delivery history every hour
    setInterval(() => {
      this.cleanupOldDeliveries();
    }, 60 * 60 * 1000);

    logger.info('Webhook delivery cleanup timer started');
  }

  /**
   * Cleanup old delivery history
   */
  cleanupOldDeliveries(maxAgeDays = 7) {
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [webhookId, history] of this.deliveryHistory.entries()) {
      const oldLength = history.length;
      const filteredHistory = history.filter(delivery => 
        new Date(delivery.timestamp).getTime() > cutoffTime
      );

      if (filteredHistory.length !== oldLength) {
        cleaned += oldLength - filteredHistory.length;
        this.deliveryHistory.set(webhookId, filteredHistory);
      }

      // Remove empty histories
      if (filteredHistory.length === 0) {
        this.deliveryHistory.delete(webhookId);
      }
    }

    logger.debug('Delivery history cleanup completed', { cleaned, maxAgeDays });
    return cleaned;
  }

  /**
   * Health check
   */
  healthCheck() {
    try {
      const totalWebhooks = this.webhooks.size;
      const totalDeliveries = Array.from(this.deliveryHistory.values())
        .reduce((sum, history) => sum + history.length, 0);

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        totalWebhooks,
        totalDeliveries,
        config: {
          maxWebhooksPerUser: this.config.maxWebhooksPerUser,
          maxRetries: this.config.maxRetries,
          enableSigning: this.config.enableSigning
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

module.exports = new WebhookService();