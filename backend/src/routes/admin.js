const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const aiService = require('../services/aiService');
const quotaService = require('../services/quotaService');
const webhookService = require('../services/webhookService');
const analyticsService = require('../services/analyticsService');
const monitoringService = require('../services/monitoringService');
const { body, query, param, validationResult } = require('express-validator');
const responseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');

/**
 * Validation middleware for admin routes
 */
const validateUserUpdate = [
  body('role')
    .optional()
    .isIn(['user', 'admin'])
    .withMessage('Role must be either user or admin'),
  
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean'),
  
  body('quota')
    .optional()
    .isObject()
    .withMessage('Quota must be an object')
];

const validateQuotaUpdate = [
  body('requestsPerMinute')
    .optional()
    .isInt({ min: 1 })
    .withMessage('requestsPerMinute must be a positive integer'),
  
  body('requestsPerHour')
    .optional()
    .isInt({ min: 1 })
    .withMessage('requestsPerHour must be a positive integer'),
  
  body('requestsPerDay')
    .optional()
    .isInt({ min: 1 })
    .withMessage('requestsPerDay must be a positive integer'),
  
  body('tokensPerMinute')
    .optional()
    .isInt({ min: 1 })
    .withMessage('tokensPerMinute must be a positive integer'),
  
  body('tokensPerHour')
    .optional()
    .isInt({ min: 1 })
    .withMessage('tokensPerHour must be a positive integer'),
  
  body('tokensPerDay')
    .optional()
    .isInt({ min: 1 })
    .withMessage('tokensPerDay must be a positive integer'),
  
  body('concurrentRequests')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('concurrentRequests must be between 1 and 100')
];

const validateSystemStatsQuery = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('startDate must be a valid ISO 8601 date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('endDate must be a valid ISO 8601 date')
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
 * @route   GET /api/admin/users
 * @desc    List all users (admin only)
 * @access  Private/Admin
 */
router.get('/users', 
  auth.verifyToken, 
  auth.requireAdmin,
  query(['limit', 'offset', 'role', 'active'])
    .optional()
    .isString(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { limit = 50, offset = 0, role, active } = req.query;

      // Get users from database
      const users = await User.findAll({
        limit: parseInt(limit),
        offset: parseInt(offset),
        role: role || null,
        active: active !== undefined ? active === 'true' : null
      });

      // Format user data (remove sensitive information)
      const formattedUsers = users.map(user => ({
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login: user.last_login,
        metadata: user.metadata || {}
      }));

      res.json(responseFormatter.success({
        users: formattedUsers,
        total: users.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }).body);

    } catch (error) {
      logger.error('List users failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to list users',
          code: 'LIST_USERS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/users/:id
 * @desc    Get user details (admin only)
 * @access  Private/Admin
 */
router.get('/users/:id', 
  auth.verifyToken, 
  auth.requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const user = await User.findById(id);
      
      if (!user) {
        return res.status(404).json(
          responseFormatter.notFound('User').body
        );
      }

      // Format user data (remove sensitive information)
      const formattedUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login: user.last_login,
        metadata: user.metadata || {},
        quota: quotaService.getQuotaInfo(id)
      };

      res.json(responseFormatter.success(formattedUser).body);

    } catch (error) {
      logger.error('Get user details failed', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get user details',
          code: 'GET_USER_DETAILS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   PUT /api/admin/users/:id
 * @desc    Update user (admin only)
 * @access  Private/Admin
 */
router.put('/users/:id', 
  auth.verifyToken, 
  auth.requireAdmin,
  validateUserUpdate,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const user = await User.findById(id);
      
      if (!user) {
        return res.status(404).json(
          responseFormatter.notFound('User').body
        );
      }

      // Update user
      const updatedUser = await User.update(id, updates);

      // Format response
      const formattedUser = {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        is_active: updatedUser.is_active,
        created_at: updatedUser.created_at,
        updated_at: updatedUser.updated_at,
        last_login: updatedUser.last_login,
        metadata: updatedUser.metadata || {}
      };

      logger.info('User updated by admin', {
        adminId: req.user.id,
        userId: id,
        updates: Object.keys(updates)
      });

      res.json(responseFormatter.success(formattedUser, {
        message: 'User updated successfully'
      }).body);

    } catch (error) {
      logger.error('Update user failed', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to update user',
          code: 'UPDATE_USER_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Delete user (admin only)
 * @access  Private/Admin
 */
router.delete('/users/:id', 
  auth.verifyToken, 
  auth.requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const user = await User.findById(id);
      
      if (!user) {
        return res.status(404).json(
          responseFormatter.notFound('User').body
        );
      }

      // Prevent deleting own account
      if (id === req.user.id) {
        return res.status(400).json(
          responseFormatter.error(null, {
            message: 'Cannot delete your own account',
            statusCode: 400,
            code: 'CANNOT_DELETE_SELF'
          }).body
        );
      }

      // Delete user
      await User.delete(id);

      logger.info('User deleted by admin', {
        adminId: req.user.id,
        userId: id,
        email: user.email
      });

      res.json(responseFormatter.deleted({
        message: 'User deleted successfully'
      }).body);

    } catch (error) {
      logger.error('Delete user failed', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to delete user',
          code: 'DELETE_USER_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/users/:id/quota
 * @desc    Get user quota information (admin only)
 * @access  Private/Admin
 */
router.get('/users/:id/quota', 
  auth.verifyToken, 
  auth.requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const quotaInfo = quotaService.getQuotaInfo(id);

      res.json(responseFormatter.success(quotaInfo).body);

    } catch (error) {
      logger.error('Get user quota failed', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get user quota',
          code: 'GET_USER_QUOTA_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   PUT /api/admin/users/:id/quota
 * @desc    Update user quota (admin only)
 * @access  Private/Admin
 */
router.put('/users/:id/quota', 
  auth.verifyToken, 
  auth.requireAdmin,
  validateQuotaUpdate,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;
      const quotaUpdates = req.body;

      const quota = quotaService.setUserQuota(id, quotaUpdates);

      logger.info('User quota updated by admin', {
        adminId: req.user.id,
        userId: id,
        quota: quotaUpdates
      });

      res.json(responseFormatter.success(quota, {
        message: 'User quota updated successfully'
      }).body);

    } catch (error) {
      logger.error('Update user quota failed', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to update user quota',
          code: 'UPDATE_USER_QUOTA_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   POST /api/admin/users/:id/quota/reset
 * @desc    Reset user quota (admin only)
 * @access  Private/Admin
 */
router.post('/users/:id/quota/reset', 
  auth.verifyToken, 
  auth.requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const quota = quotaService.resetUserQuota(id);

      logger.info('User quota reset by admin', {
        adminId: req.user.id,
        userId: id
      });

      res.json(responseFormatter.success(quota, {
        message: 'User quota reset successfully'
      }).body);

    } catch (error) {
      logger.error('Reset user quota failed', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to reset user quota',
          code: 'RESET_USER_QUOTA_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/system/stats
 * @desc    Get system statistics (admin only)
 * @access  Private/Admin
 */
router.get('/system/stats', 
  auth.verifyToken, 
  auth.requireAdmin,
  validateSystemStatsQuery,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      // Get system-wide statistics
      const stats = {
        timestamp: new Date().toISOString(),
        users: {
          total: await User.count(),
          active: await User.count({ is_active: true }),
          admin: await User.count({ role: 'admin' })
        },
        ai: {
          providers: aiService.getAvailableModels().length,
          tasks: Array.from(aiService.taskQueue.entries()).length
        },
        webhooks: {
          total: webhookService.listWebhooks().total,
          active: webhookService.listWebhooks({ active: true }).total
        },
        quota: quotaService.healthCheck()
      };

      res.json(responseFormatter.success(stats).body);

    } catch (error) {
      logger.error('Get system stats failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get system statistics',
          code: 'GET_SYSTEM_STATS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/system/health
 * @desc    Get system health check (admin only)
 * @access  Private/Admin
 */
router.get('/system/health', 
  auth.verifyToken, 
  auth.requireAdmin,
  async (req, res) => {
    try {
      const health = {
        timestamp: new Date().toISOString(),
        services: {
          ai: await aiService.healthCheck(),
          webhooks: webhookService.healthCheck(),
          quota: quotaService.healthCheck()
        },
        database: {
          status: 'healthy', // Would check actual DB connection
          lastCheck: new Date().toISOString()
        },
        overall: 'healthy'
      };

      // Determine overall health
      const serviceStatuses = Object.values(health.services);
      if (serviceStatuses.some(s => s.status === 'unhealthy')) {
        health.overall = 'unhealthy';
      } else if (serviceStatuses.some(s => s.status === 'degraded')) {
        health.overall = 'degraded';
      }

      const statusCode = health.overall === 'healthy' ? 200 : 503;

      res.status(statusCode).json(responseFormatter.success(health).body);

    } catch (error) {
      logger.error('Health check failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Health check failed',
          code: 'HEALTH_CHECK_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   POST /api/admin/system/cleanup
 * @desc    Trigger system cleanup (admin only)
 * @access  Private/Admin
 */
router.post('/system/cleanup', 
  auth.verifyToken, 
  auth.requireAdmin,
  async (req, res) => {
    try {
      const results = {
        timestamp: new Date().toISOString(),
        tasks: {
          cleaned: aiService.cleanupOldTasks(24) // Clean tasks older than 24 hours
        },
        quota: {
          cleaned: quotaService.cleanupOldUsage(30) // Clean usage older than 30 days
        },
        webhooks: {
          cleaned: webhookService.cleanupOldDeliveries(7) // Clean deliveries older than 7 days
        }
      };

      logger.info('System cleanup completed by admin', {
        adminId: req.user.id,
        results
      });

      res.json(responseFormatter.success(results).body);

    } catch (error) {
      logger.error('System cleanup failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'System cleanup failed',
          code: 'SYSTEM_CLEANUP_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/analytics/usage
 * @desc    Get overall usage statistics (admin only)
 * @access  Private/Admin
 */
router.get('/analytics/usage',
  auth.verifyToken,
  auth.requireAdmin,
  validateSystemStatsQuery,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const usageStats = await analyticsService.getUsageStats({
        startDate,
        endDate
      });

      res.json(responseFormatter.success(usageStats).body);

    } catch (error) {
      logger.error('Get usage analytics failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get usage analytics',
          code: 'GET_USAGE_ANALYTICS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/analytics/costs
 * @desc    Get cost analysis and breakdown (admin only)
 * @access  Private/Admin
 */
router.get('/analytics/costs',
  auth.verifyToken,
  auth.requireAdmin,
  validateSystemStatsQuery,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const costAnalysis = await analyticsService.getCostAnalysis({
        startDate,
        endDate
      });

      res.json(responseFormatter.success(costAnalysis).body);

    } catch (error) {
      logger.error('Get cost analytics failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get cost analytics',
          code: 'GET_COST_ANALYTICS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/analytics/users
 * @desc    Get user activity analytics (admin only)
 * @access  Private/Admin
 */
router.get('/analytics/users',
  auth.verifyToken,
  auth.requireAdmin,
  validateSystemStatsQuery,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startDate, endDate, limit = 100, offset = 0 } = req.query;

      const userActivity = await analyticsService.getUserActivity({
        startDate,
        endDate,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json(responseFormatter.success(userActivity).body);

    } catch (error) {
      logger.error('Get user analytics failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get user analytics',
          code: 'GET_USER_ANALYTICS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/analytics/performance
 * @desc    Get performance metrics (admin only)
 * @access  Private/Admin
 */
router.get('/analytics/performance',
  auth.verifyToken,
  auth.requireAdmin,
  validateSystemStatsQuery,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const performanceMetrics = await analyticsService.getPerformanceMetrics({
        startDate,
        endDate
      });

      res.json(responseFormatter.success(performanceMetrics).body);

    } catch (error) {
      logger.error('Get performance analytics failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get performance analytics',
          code: 'GET_PERFORMANCE_ANALYTICS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/analytics/errors
 * @desc    Get error tracking and analysis (admin only)
 * @access  Private/Admin
 */
router.get('/analytics/errors',
  auth.verifyToken,
  auth.requireAdmin,
  validateSystemStatsQuery,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startDate, endDate, limit = 100 } = req.query;

      const errorAnalysis = await analyticsService.getErrorAnalysis({
        startDate,
        endDate,
        limit: parseInt(limit)
      });

      res.json(responseFormatter.success(errorAnalysis).body);

    } catch (error) {
      logger.error('Get error analytics failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get error analytics',
          code: 'GET_ERROR_ANALYTICS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/analytics/endpoints
 * @desc    Get API endpoint usage patterns (admin only)
 * @access  Private/Admin
 */
router.get('/analytics/endpoints',
  auth.verifyToken,
  auth.requireAdmin,
  validateSystemStatsQuery,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startDate, endDate, limit = 50 } = req.query;

      const endpointUsage = await analyticsService.getEndpointUsage({
        startDate,
        endDate,
        limit: parseInt(limit)
      });

      res.json(responseFormatter.success(endpointUsage).body);

    } catch (error) {
      logger.error('Get endpoint analytics failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get endpoint analytics',
          code: 'GET_ENDPOINT_ANALYTICS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/analytics/providers
 * @desc    Get provider comparison analytics (admin only)
 * @access  Private/Admin
 */
router.get('/analytics/providers',
  auth.verifyToken,
  auth.requireAdmin,
  validateSystemStatsQuery,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const providerComparison = await analyticsService.getProviderComparison({
        startDate,
        endDate
      });

      res.json(responseFormatter.success(providerComparison).body);

    } catch (error) {
      logger.error('Get provider analytics failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get provider analytics',
          code: 'GET_PROVIDER_ANALYTICS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/analytics/trends
 * @desc    Get trend analysis (admin only)
 * @access  Private/Admin
 */
router.get('/analytics/trends',
  auth.verifyToken,
  auth.requireAdmin,
  validateSystemStatsQuery,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startDate, endDate, metric = 'requests', period = '7d', groupBy = 'day' } = req.query;

      const trendAnalysis = await analyticsService.getTrendAnalysis({
        startDate,
        endDate,
        metric,
        period,
        groupBy
      });

      res.json(responseFormatter.success(trendAnalysis).body);

    } catch (error) {
      logger.error('Get trend analytics failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get trend analytics',
          code: 'GET_TREND_ANALYTICS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/monitoring/alerts
 * @desc    Get recent monitoring alerts (admin only)
 * @access  Private/Admin
 */
router.get('/monitoring/alerts',
  auth.verifyToken,
  auth.requireAdmin,
  async (req, res) => {
    try {
      const { limit = 100, severity, type } = req.query;

      const alerts = monitoringService.getRecentAlerts({
        limit: parseInt(limit),
        severity,
        type
      });

      res.json(responseFormatter.success(alerts).body);

    } catch (error) {
      logger.error('Get monitoring alerts failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get monitoring alerts',
          code: 'GET_MONITORING_ALERTS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/monitoring/metrics
 * @desc    Get current monitoring metrics (admin only)
 * @access  Private/Admin
 */
router.get('/monitoring/metrics',
  auth.verifyToken,
  auth.requireAdmin,
  async (req, res) => {
    try {
      const metrics = monitoringService.getCurrentMetrics();

      res.json(responseFormatter.success(metrics).body);

    } catch (error) {
      logger.error('Get monitoring metrics failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get monitoring metrics',
          code: 'GET_MONITORING_METRICS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   GET /api/admin/monitoring/thresholds
 * @desc    Get monitoring thresholds (admin only)
 * @access  Private/Admin
 */
router.get('/monitoring/thresholds',
  auth.verifyToken,
  auth.requireAdmin,
  async (req, res) => {
    try {
      const thresholds = monitoringService.getThresholds();

      res.json(responseFormatter.success(thresholds).body);

    } catch (error) {
      logger.error('Get monitoring thresholds failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to get monitoring thresholds',
          code: 'GET_MONITORING_THRESHOLDS_FAILED'
        }).body
      );
    }
  }
);

/**
 * @route   PUT /api/admin/monitoring/thresholds
 * @desc    Update monitoring thresholds (admin only)
 * @access  Private/Admin
 */
router.put('/monitoring/thresholds',
  auth.verifyToken,
  auth.requireAdmin,
  async (req, res) => {
    try {
      const thresholds = req.body;

      monitoringService.setThresholds(thresholds);

      logger.info('Monitoring thresholds updated by admin', {
        adminId: req.user.id,
        thresholds
      });

      res.json(responseFormatter.success({
        message: 'Monitoring thresholds updated successfully',
        thresholds: monitoringService.getThresholds()
      }).body);

    } catch (error) {
      logger.error('Update monitoring thresholds failed', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(
        responseFormatter.error(error, {
          message: 'Failed to update monitoring thresholds',
          code: 'UPDATE_MONITORING_THRESHOLDS_FAILED'
        }).body
      );
    }
  }
);

module.exports = router;