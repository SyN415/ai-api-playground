const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const authMiddleware = require('../middleware/auth');
const db = require('../config/database');
const {
  handleValidationErrors,
  validateRegistration,
  validateLogin,
  validatePasswordResetRequest,
  validatePasswordReset,
  validateTokenRefresh,
  sanitizeInput
} = require('../middleware/validation');
const logger = require('../utils/logger');

// Apply input sanitization to all auth routes
router.use(sanitizeInput);

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register',
  validateRegistration,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { email, password, role } = req.body;
      
      logger.info(`Registration attempt for email: ${email}`);
      
      const result = await authService.register({ email, password, role });
      
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Registration error:', error);
      next(error);
    }
  }
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login',
  validateLogin,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      
      logger.info(`Login attempt for email: ${email}`);
      
      const result = await authService.login(email, password);
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Login error:', error);
      next(error);
    }
  }
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh',
  validateTokenRefresh,
  handleValidationErrors,
  authMiddleware.verifyRefreshToken,
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      
      logger.info(`Token refresh attempt for user: ${req.user.email}`);
      
      const result = await authService.refreshToken(refreshToken);
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Token refresh error:', error);
      next(error);
    }
  }
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and blacklist token
 * @access  Private
 */
router.post('/logout',
  authMiddleware.verifyToken,
  authMiddleware.logout,
  async (req, res) => {
    try {
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      logger.error('Logout error:', error);
      next(error);
    }
  }
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password',
  validatePasswordResetRequest,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { email } = req.body;
      
      logger.info(`Password reset requested for email: ${email}`);
      
      const result = await authService.requestPasswordReset(email);
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Password reset request error:', error);
      next(error);
    }
  }
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password',
  validatePasswordReset,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { token, password } = req.body;
      
      logger.info('Password reset attempt with token');
      
      const result = await authService.resetPassword(token, password);
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Password reset error:', error);
      next(error);
    }
  }
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me',
  authMiddleware.verifyToken,
  async (req, res, next) => {
    try {
      logger.info(`Profile request for user: ${req.user.email}`);
      
      const result = await authService.getCurrentUser(req.user.id);
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      next(error);
    }
  }
);

/**
 * @route   PUT /api/auth/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/me',
  authMiddleware.verifyToken,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      
      logger.info(`Profile update request for user: ${req.user.email}`);
      
      // Update email if provided
      if (email && email !== req.user.email) {
        // Check if email is already taken
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Email already taken'
            }
          });
        }
        
        // Update email in database
        const client = db.getClient();
        const { error } = await client
          .from('users')
          .update({
            email: email.toLowerCase().trim(),
            updated_at: new Date().toISOString()
          })
          .eq('id', req.user.id);
        
        if (error) {
          throw new Error(`Failed to update email: ${error.message}`);
        }
      }
      
      // Update password if provided
      if (password) {
        await req.user.updatePassword(password);
      }
      
      // Get updated user
      const updatedUser = await User.findById(req.user.id);
      
      res.status(200).json({
        success: true,
        data: {
          user: updatedUser.toJSON()
        }
      });
    } catch (error) {
      logger.error('Profile update error:', error);
      next(error);
    }
  }
);

module.exports = router;