const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const crypto = require('crypto');
const db = require('../config/database');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    this.accessTokenExpiresIn = process.env.JWT_EXPIRES_IN || '15m';
    this.refreshTokenExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET must be defined in environment variables');
    }
  }

  /**
   * Generate JWT tokens
   * @param {Object} payload - Token payload
   * @returns {Object} Access and refresh tokens
   */
  generateTokens(payload) {
    try {
      // Generate access token (short-lived)
      const accessToken = jwt.sign(
        {
          userId: payload.userId,
          email: payload.email,
          role: payload.role,
          type: 'access'
        },
        this.jwtSecret,
        { expiresIn: this.accessTokenExpiresIn }
      );

      // Generate refresh token (long-lived)
      const refreshToken = jwt.sign(
        {
          userId: payload.userId,
          email: payload.email,
          role: payload.role,
          type: 'refresh'
        },
        this.jwtSecret,
        { expiresIn: this.refreshTokenExpiresIn }
      );

      logger.info(`Tokens generated for user: ${payload.email}`);
      
      return {
        accessToken,
        refreshToken,
        expiresIn: this.getTokenExpiration(accessToken)
      };
    } catch (error) {
      logger.error('Token generation failed:', error);
      throw new Error('Failed to generate tokens');
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object} Decoded token payload
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      logger.debug('Token verified successfully');
      return decoded;
    } catch (error) {
      logger.error('Token verification failed:', error);
      
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      }
      
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      
      throw new Error('Token verification failed');
    }
  }

  /**
   * Get token expiration time
   * @param {string} token - JWT token
   * @returns {Date|null} Expiration date or null
   */
  getTokenExpiration(token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        return new Date(decoded.exp * 1000);
      }
      return null;
    } catch (error) {
      logger.error('Failed to get token expiration:', error);
      return null;
    }
  }

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Object} User data and tokens
   */
  async register(userData) {
    try {
      // Create user
      const user = await User.create(userData);
      
      // Generate tokens
      const tokens = this.generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role
      });

      logger.info(`User registered successfully: ${user.email}`);
      
      return {
        user: user.toJSON(),
        tokens
      };
    } catch (error) {
      logger.error('Registration failed:', error);
      throw error;
    }
  }

  /**
   * Login user
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Object} User data and tokens
   */
  async login(email, password) {
    try {
      // Find user by email
      const user = await User.findByEmail(email);
      
      if (!user) {
        logger.warn(`Login failed: User not found for email ${email}`);
        throw new Error('Invalid credentials');
      }

      // Check if account is active
      if (!user.is_active) {
        logger.warn(`Login failed: Account inactive for ${email}`);
        throw new Error('Account is deactivated');
      }

      // Verify password
      const isPasswordValid = await User.comparePassword(password, user.password_hash);
      
      if (!isPasswordValid) {
        logger.warn(`Login failed: Invalid password for ${email}`);
        throw new Error('Invalid credentials');
      }

      // Update last login
      await user.updateLastLogin();

      // Generate tokens
      const tokens = this.generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role
      });

      logger.info(`User logged in successfully: ${user.email}`);
      
      return {
        user: user.toJSON(),
        tokens
      };
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Object} New access token
   */
  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = this.verifyToken(refreshToken);
      
      // Check if it's a refresh token
      if (decoded.type !== 'refresh') {
        logger.warn('Invalid token type for refresh');
        throw new Error('Invalid refresh token');
      }

      // Find user
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        logger.warn('Refresh token failed: User not found');
        throw new Error('Invalid refresh token');
      }

      // Check if account is active
      if (!user.is_active) {
        logger.warn('Refresh token failed: Account inactive');
        throw new Error('Account is deactivated');
      }

      // Generate new access token
      const tokens = this.generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role
      });

      logger.info(`Token refreshed for user: ${user.email}`);
      
      return {
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn
      };
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Request password reset
   * @param {string} email - User email
   * @returns {Object} Reset token and expiration
   */
  async requestPasswordReset(email) {
    try {
      // Find user by email
      const user = await User.findByEmail(email);
      
      if (!user) {
        // Don't reveal if user exists or not for security
        logger.info(`Password reset requested for non-existent email: ${email}`);
        return {
          message: 'If an account exists with this email, a password reset link will be sent'
        };
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour from now

      // Save reset token to user
      await user.setPasswordResetToken(resetToken, resetExpires);

      // In a real application, you would send an email with the reset link
      // For now, we'll return the token (in production, this should be emailed)
      logger.info(`Password reset token generated for user: ${user.email}`);
      
      return {
        message: 'Password reset link sent to your email',
        resetToken, // Remove this in production - only for testing
        resetExpires
      };
    } catch (error) {
      logger.error('Password reset request failed:', error);
      throw error;
    }
  }

  /**
   * Reset password
   * @param {string} token - Reset token
   * @param {string} newPassword - New password
   * @returns {Object} Success message
   */
  async resetPassword(token, newPassword) {
    try {
      // Find user by reset token
      const client = db.getClient();
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('password_reset_token', token)
        .single();
      
      if (error || !data) {
        logger.warn('Invalid or expired reset token');
        throw new Error('Invalid or expired reset token');
      }

      const user = new User(data);

      // Verify token is still valid
      const isTokenValid = await user.verifyPasswordResetToken(token);
      if (!isTokenValid) {
        logger.warn('Expired reset token used');
        throw new Error('Invalid or expired reset token');
      }

      // Update password
      await user.updatePassword(newPassword);

      logger.info(`Password reset successfully for user: ${user.email}`);
      
      return {
        message: 'Password reset successfully'
      };
    } catch (error) {
      logger.error('Password reset failed:', error);
      throw error;
    }
  }

  /**
   * Get current user profile
   * @param {string} userId - User ID
   * @returns {Object} User profile
   */
  async getCurrentUser(userId) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        logger.warn('User not found for profile request:', userId);
        throw new Error('User not found');
      }

      logger.debug(`User profile retrieved: ${user.email}`);
      
      return {
        user: user.toJSON()
      };
    } catch (error) {
      logger.error('Get current user failed:', error);
      throw error;
    }
  }

  /**
   * Logout user (blacklist token)
   * @param {string} token - Access token to blacklist
   * @returns {Object} Success message
   */
  async logout(token) {
    try {
      // Verify token first
      const decoded = this.verifyToken(token);
      
      // In a real implementation, you would blacklist the token
      // For now, we'll just log the logout
      logger.info(`User logged out: ${decoded.email}`);
      
      return {
        message: 'Logged out successfully'
      };
    } catch (error) {
      logger.error('Logout failed:', error);
      throw error;
    }
  }

  /**
   * Generate email verification token
   * @param {string} userId - User ID
   * @returns {string} Verification token
   */
  generateEmailVerificationToken(userId) {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      logger.debug(`Email verification token generated for user: ${userId}`);
      return token;
    } catch (error) {
      logger.error('Failed to generate email verification token:', error);
      throw new Error('Failed to generate verification token');
    }
  }

  /**
   * Verify email
   * @param {string} token - Verification token
   * @returns {Object} Success message
   */
  async verifyEmail(token) {
    try {
      // In a real implementation, you would find the user by verification token
      // For now, this is a placeholder
      logger.info('Email verification attempted with token:', token);
      
      return {
        message: 'Email verified successfully'
      };
    } catch (error) {
      logger.error('Email verification failed:', error);
      throw error;
    }
  }

  /**
   * Change user role
   * @param {string} userId - User ID
   * @param {string} newRole - New role
   * @returns {Object} Updated user data
   */
  async changeUserRole(userId, newRole) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        logger.warn('User not found for role change:', userId);
        throw new Error('User not found');
      }

      // Update role in database
      const client = db.getClient();
      const { error } = await client
        .from('users')
        .update({ 
          role: newRole,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (error) {
        logger.error('Failed to update user role:', error);
        throw new Error(`Failed to update user role: ${error.message}`);
      }

      user.role = newRole;
      logger.info(`User role updated: ${user.email} -> ${newRole}`);
      
      return {
        user: user.toJSON()
      };
    } catch (error) {
      logger.error('Change user role failed:', error);
      throw error;
    }
  }
}

module.exports = new AuthService();