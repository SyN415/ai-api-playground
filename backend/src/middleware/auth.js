const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const authService = require('../services/authService');
const User = require('../models/User');
const logger = require('../utils/logger');

// Redis client for token blacklisting and API key management
const redis = require('redis');
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD || undefined,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Redis max reconnection attempts reached');
        return new Error('Redis connection failed');
      }
      return Math.min(retries * 50, 500);
    }
  }
});

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    logger.info('Connected to Redis for token blacklisting and API key management');
  } catch (err) {
    logger.error('Failed to connect to Redis for token blacklisting and API key management', err);
  }
})();

class AuthMiddleware {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET must be defined in environment variables');
    }
  }

  /**
   * Verify JWT token from Authorization header
   */
  verifyToken = async (req, res, next) => {
    try {
      // Get token from header
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('No token provided in Authorization header');
        return res.status(401).json({
          success: false,
          error: {
            message: 'No token provided'
          }
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) {
        logger.warn('Blacklisted token used');
        return res.status(401).json({
          success: false,
          error: {
            message: 'Token has been revoked'
          }
        });
      }

      // Verify token
      const decoded = authService.verifyToken(token);
      
      // Find user
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        logger.warn('User not found for token:', decoded.userId);
        return res.status(401).json({
          success: false,
          error: {
            message: 'User not found'
          }
        });
      }

      // Check if account is active
      if (!user.is_active) {
        logger.warn('Inactive account attempted access:', user.email);
        return res.status(401).json({
          success: false,
          error: {
            message: 'Account is deactivated'
          }
        });
      }

      // Attach user and token to request
      req.user = user;
      req.token = token;
      
      logger.debug('Token verified successfully for user:', user.email);
      next();
    } catch (error) {
      logger.error('Token verification middleware error:', error);
      
      if (error.message === 'Token has expired') {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Token has expired'
          }
        });
      }
      
      if (error.message === 'Invalid token') {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Invalid token'
          }
        });
      }
      
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication failed'
        }
      });
    }
  };

  /**
   * Role-based access control middleware
   * @param {Array<string>} allowedRoles - Array of allowed roles
   */
  requireRole = (allowedRoles) => {
    return (req, res, next) => {
      try {
        if (!req.user) {
          logger.warn('Role check failed: No user in request');
          return res.status(401).json({
            success: false,
            error: {
              message: 'Authentication required'
            }
          });
        }

        if (!allowedRoles.includes(req.user.role)) {
          logger.warn(`Access denied for user ${req.user.email}. Required roles: ${allowedRoles}, User role: ${req.user.role}`);
          return res.status(403).json({
            success: false,
            error: {
              message: 'Insufficient permissions'
            }
          });
        }

        logger.debug(`Role check passed for user ${req.user.email} with role ${req.user.role}`);
        next();
      } catch (error) {
        logger.error('Role check middleware error:', error);
        return res.status(500).json({
          success: false,
          error: {
            message: 'Internal server error'
          }
        });
      }
    };
  };

  /**
   * Require admin role
   */
  requireAdmin = this.requireRole(['admin']);

  /**
   * Require user or admin role
   */
  requireUser = this.requireRole(['user', 'admin']);

  /**
   * API key authentication middleware
   */
  verifyApiKey = async (req, res, next) => {
    try {
      // Get API key from query parameter or header
      const apiKey = req.query.api_key || req.headers['x-api-key'];
      
      if (!apiKey) {
        logger.warn('No API key provided');
        return res.status(401).json({
          success: false,
          error: {
            message: 'API key required'
          }
        });
      }

      // In a real application, you would validate the API key against a database
      // For now, we'll use a simple check against environment variable
      const validApiKey = process.env.API_KEY;
      
      if (!validApiKey || apiKey !== validApiKey) {
        logger.warn('Invalid API key provided');
        return res.status(401).json({
          success: false,
          error: {
            message: 'Invalid API key'
          }
        });
      }

      // For API key authentication, create a system user
      req.user = {
        id: 'system',
        email: 'system@api.playground',
        role: 'admin',
        isApiKeyAuth: true
      };
      
      logger.debug('API key authentication successful');
      next();
    } catch (error) {
      logger.error('API key authentication error:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error'
        }
      });
    }
  };

  /**
   * Optional authentication (tries to authenticate but doesn't fail if no token)
   */
  optionalAuth = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No token provided, continue without authentication
        return next();
      }

      const token = authHeader.substring(7);
      
      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) {
        logger.warn('Blacklisted token used in optional auth');
        return next(); // Continue without authentication
      }

      // Verify token
      const decoded = authService.verifyToken(token);
      
      // Find user
      const user = await User.findById(decoded.userId);
      
      if (!user || !user.is_active) {
        logger.debug('Optional auth: User not found or inactive');
        return next(); // Continue without authentication
      }

      // Attach user and token to request
      req.user = user;
      req.token = token;
      
      logger.debug('Optional auth: User authenticated:', user.email);
      next();
    } catch (error) {
      logger.debug('Optional auth failed:', error.message);
      // Continue without authentication
      next();
    }
  };

  /**
   * Token refresh middleware
   */
  verifyRefreshToken = async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        logger.warn('No refresh token provided');
        return res.status(400).json({
          success: false,
          error: {
            message: 'Refresh token is required'
          }
        });
      }

      // Verify refresh token
      const decoded = authService.verifyToken(refreshToken);
      
      // Find user
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        logger.warn('Refresh token verification failed: User not found');
        return res.status(401).json({
          success: false,
          error: {
            message: 'Invalid refresh token'
          }
        });
      }

      // Check if account is active
      if (!user.is_active) {
        logger.warn('Refresh token verification failed: Account inactive');
        return res.status(401).json({
          success: false,
          error: {
            message: 'Account is deactivated'
          }
        });
      }

      // Attach user to request
      req.user = user;
      req.refreshToken = refreshToken;
      
      logger.debug('Refresh token verified for user:', user.email);
      next();
    } catch (error) {
      logger.error('Refresh token verification error:', error);
      
      if (error.message === 'Token has expired') {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Refresh token has expired'
          }
        });
      }
      
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid refresh token'
        }
      });
    }
  };

  /**
   * Blacklist a token (used for logout)
   * @param {string} token - Token to blacklist
   * @param {number} expiresIn - Expiration time in seconds
   */
  async blacklistToken(token, expiresIn = null) {
    try {
      // Get token expiration
      const expiration = authService.getTokenExpiration(token);
      if (!expiration) {
        logger.warn('Could not determine token expiration for blacklisting');
        return;
      }

      // Calculate TTL in seconds
      const now = new Date();
      const ttl = Math.ceil((expiration - now) / 1000);
      
      if (ttl > 0) {
        await redisClient.setEx(`blacklist:${token}`, ttl, '1');
        logger.info('Token blacklisted successfully');
      }
    } catch (error) {
      logger.error('Failed to blacklist token:', error);
    }
  }

  /**
   * Check if token is blacklisted
   * @param {string} token - Token to check
   * @returns {Promise<boolean>} True if blacklisted
   */
  async isTokenBlacklisted(token) {
    try {
      const result = await redisClient.get(`blacklist:${token}`);
      return result === '1';
    } catch (error) {
      logger.error('Failed to check token blacklist:', error);
      return false; // Fail open - if Redis is down, allow the token
    }
  }

  /**
   * Logout middleware
   */
  logout = async (req, res, next) => {
    try {
      if (!req.token) {
        logger.warn('Logout attempted without token');
        return res.status(400).json({
          success: false,
          error: {
            message: 'No token to logout'
          }
        });
      }

      // Blacklist the token
      await this.blacklistToken(req.token);
      
      logger.info('User logged out successfully:', req.user?.email);
      next();
    } catch (error) {
      logger.error('Logout error:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Logout failed'
        }
      });
    }
  };
  /**
   * Get API key usage statistics
   */
  async getApiKeyUsage(apiKeyId, limit = 100) {
    try {
      const usageKey = `apikey:usage:${apiKeyId}`;
      const usageData = await redisClient.lRange(usageKey, 0, limit - 1);
      
      return usageData.map(item => JSON.parse(item));
    } catch (error) {
      logger.error('Failed to get API key usage:', error);
      return [];
    }
  }

  /**
   * Get API key authentication attempts
   */
  async getApiKeyAttempts(apiKey, limit = 100) {
    try {
      const logKey = `apikey:attempts:${this.maskApiKey(apiKey)}`;
      const attempts = await redisClient.lRange(logKey, 0, limit - 1);
      
      return attempts.map(item => JSON.parse(item));
    } catch (error) {
      logger.error('Failed to get API key attempts:', error);
      return [];
    }
  }

  /**
   * Detect suspicious API key activity
   */
  async detectSuspiciousActivity(apiKey) {
    try {
      const attempts = await this.getApiKeyAttempts(apiKey, 100);
      const recentAttempts = attempts.filter(attempt => {
        const attemptTime = new Date(attempt.timestamp);
        const oneHourAgo = new Date(Date.now() - 3600000);
        return attemptTime > oneHourAgo;
      });

      const failedAttempts = recentAttempts.filter(attempt => !attempt.success);
      const uniqueIPs = new Set(recentAttempts.map(attempt => attempt.ip));
      
      const suspiciousPatterns = [];
      
      // Check for multiple failed attempts
      if (failedAttempts.length > 10) {
        suspiciousPatterns.push({
          type: 'multiple_failures',
          severity: 'high',
          details: {
            failedCount: failedAttempts.length,
            totalAttempts: recentAttempts.length
          }
        });
      }
      
      // Check for access from multiple IPs
      if (uniqueIPs.size > 5) {
        suspiciousPatterns.push({
          type: 'multiple_ips',
          severity: 'medium',
          details: {
            ipCount: uniqueIPs.size,
            ips: Array.from(uniqueIPs)
          }
        });
      }
      
      // Check for rapid attempts
      if (recentAttempts.length > 50) {
        suspiciousPatterns.push({
          type: 'rapid_attempts',
          severity: 'medium',
          details: {
            attemptCount: recentAttempts.length,
            timeWindow: '1 hour'
          }
        });
      }
      
      return suspiciousPatterns;
    } catch (error) {
      logger.error('Failed to detect suspicious activity:', error);
      return [];
    }
  }
}

module.exports = new AuthMiddleware();