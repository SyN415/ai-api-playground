const { body, validationResult, query, param } = require('express-validator');
const logger = require('../utils/logger');
const path = require('path');

/**
 * Middleware to handle validation results
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Validation failed:', { errors: errors.array() });
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        details: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
          value: err.value
        }))
      }
    });
  }
  next();
};

/**
 * Registration validation rules
 */
const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
    .isLength({ max: 255 })
    .withMessage('Email must be less than 255 characters'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character (!@#$%^&*)'),
  
  body('role')
    .optional()
    .isIn(['user', 'admin'])
    .withMessage('Role must be either "user" or "admin"')
];

/**
 * Login validation rules
 */
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

/**
 * Password reset request validation
 */
const validatePasswordResetRequest = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
];

/**
 * Password reset confirmation validation
 */
const validatePasswordReset = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character (!@#$%^&*)'),
  
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
];

/**
 * Token refresh validation
 */
const validateTokenRefresh = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
];

/**
 * API key validation
 */
const validateApiKey = [
  query('api_key')
    .optional()
    .isString()
    .withMessage('API key must be a string')
];

/**
 * Input sanitization middleware
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    
    const sanitized = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Remove potential XSS payloads
        sanitized[key] = value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+="[^"]*"/gi, '')
          .replace(/on\w+='[^']*'/gi, '')
          .trim();
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  };
  
  if (req.body) {
    req.body = sanitize(req.body);
  }
  
  if (req.query) {
    req.query = sanitize(req.query);
  }
  
  if (req.params) {
    req.params = sanitize(req.params);
  }
  
  next();
};

/**
 * Rate limiting validation for auth endpoints
 */
const validateRateLimit = (windowMs = 15 * 60 * 1000, max = 5) => {
  return (req, res, next) => {
    // This will be handled by the rate limiter middleware
    // This validation ensures the endpoint is properly configured
    next();
  };
};

module.exports = {
  handleValidationErrors,
  validateRegistration,
  validateLogin,
  validatePasswordResetRequest,
  validatePasswordReset,
  validateTokenRefresh,
  validateApiKey,
  sanitizeInput,
  validateRateLimit,
  
  // Enhanced validation rules
  validateAiRequest: [
    body('prompt')
      .optional()
      .isString()
      .withMessage('Prompt must be a string')
      .isLength({ max: 5000 })
      .withMessage('Prompt must be less than 5000 characters')
      .trim()
      .escape(),
    
    body('model')
      .optional()
      .isString()
      .withMessage('Model must be a string')
      .isIn(['abab5.5-chat', 'abab5.5s-chat', 'abab6-chat'])
      .withMessage('Invalid model specified'),
    
    body('max_tokens')
      .optional()
      .isInt({ min: 1, max: 8192 })
      .withMessage('Max tokens must be between 1 and 8192'),
    
    body('temperature')
      .optional()
      .isFloat({ min: 0, max: 2 })
      .withMessage('Temperature must be between 0 and 2'),
    
    body('top_p')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Top-p must be between 0 and 1'),
    
    body('n')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('N must be between 1 and 10'),
    
    body('stream')
      .optional()
      .isBoolean()
      .withMessage('Stream must be a boolean'),
    
    body('stop')
      .optional()
      .custom((value) => {
        if (Array.isArray(value)) {
          if (value.length > 10) {
            throw new Error('Stop sequences array must have at most 10 items');
          }
          for (const item of value) {
            if (typeof item !== 'string') {
              throw new Error('All stop sequences must be strings');
            }
          }
        } else if (typeof value !== 'string') {
          throw new Error('Stop must be a string or array of strings');
        }
        return true;
      })
  ],

  // File upload validation
  validateFileUpload: [
    (req, res, next) => {
      if (!req.files || !req.files.file) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No file uploaded',
            code: 'NO_FILE_UPLOADED'
          }
        });
      }
      next();
    },
    
    (req, res, next) => {
      const file = req.files.file;
      const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB default
      
      if (file.size > maxSize) {
        logger.warn('File size limit exceeded', {
          size: file.size,
          maxSize,
          filename: file.name
        });
        
        return res.status(413).json({
          success: false,
          error: {
            message: `File too large. Maximum size is ${maxSize} bytes`,
            code: 'FILE_TOO_LARGE',
            maxSize
          }
        });
      }
      next();
    },
    
    (req, res, next) => {
      const file = req.files.file;
      const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') ||
        ['image/jpeg', 'image/png', 'image/gif', 'text/plain', 'application/json'];
      
      if (!allowedTypes.includes(file.mimetype)) {
        logger.warn('Invalid file type attempted', {
          mimetype: file.mimetype,
          filename: file.name
        });
        
        return res.status(415).json({
          success: false,
          error: {
            message: 'Unsupported file type',
            code: 'UNSUPPORTED_FILE_TYPE',
            allowedTypes
          }
        });
      }
      next();
    },
    
    (req, res, next) => {
      const file = req.files.file;
      const filename = file.name;
      const ext = path.extname(filename).toLowerCase();
      const allowedExtensions = process.env.ALLOWED_FILE_EXTENSIONS?.split(',') ||
        ['.jpg', '.jpeg', '.png', '.gif', '.txt', '.json'];
      
      if (!allowedExtensions.includes(ext)) {
        logger.warn('Invalid file extension attempted', {
          extension: ext,
          filename
        });
        
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid file extension',
            code: 'INVALID_FILE_EXTENSION',
            allowedExtensions
          }
        });
      }
      next();
    }
  ],

  // Parameter type validation
  validateParameterTypes: (req, res, next) => {
    try {
      const validateValue = (value, path = '') => {
        if (typeof value === 'string') {
          // Check for excessive length
          if (value.length > 10000) {
            throw new Error(`String too long at ${path}: ${value.length} characters`);
          }
          
          // Check for null bytes
          if (value.includes('\0')) {
            throw new Error(`Null byte detected at ${path}`);
          }
          
          // Check for control characters (except common whitespace)
          const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value);
          if (controlChars && !/^\s+$/.test(value)) {
            throw new Error(`Control characters detected at ${path}`);
          }
        } else if (typeof value === 'number') {
          // Check for NaN, Infinity
          if (!isFinite(value)) {
            throw new Error(`Invalid number at ${path}: ${value}`);
          }
          
          // Check for reasonable range
          if (Math.abs(value) > 1e15) {
            throw new Error(`Number too large at ${path}: ${value}`);
          }
        } else if (typeof value === 'object' && value !== null) {
          // Recursively validate objects
          if (Array.isArray(value)) {
            if (value.length > 1000) {
              throw new Error(`Array too large at ${path}: ${value.length} items`);
            }
            for (let i = 0; i < value.length; i++) {
              validateValue(value[i], `${path}[${i}]`);
            }
          } else {
            const keys = Object.keys(value);
            if (keys.length > 100) {
              throw new Error(`Object too large at ${path}: ${keys.length} keys`);
            }
            for (const [key, val] of Object.entries(value)) {
              validateValue(val, `${path}.${key}`);
            }
          }
        }
      };

      // Validate query parameters
      if (req.query) {
        for (const [key, value] of Object.entries(req.query)) {
          validateValue(value, `query.${key}`);
        }
      }

      // Validate body parameters
      if (req.body) {
        validateValue(req.body, 'body');
      }

      // Validate route parameters
      if (req.params) {
        for (const [key, value] of Object.entries(req.params)) {
          validateValue(value, `params.${key}`);
        }
      }

      next();
    } catch (error) {
      logger.warn('Parameter type validation failed', {
        error: error.message,
        ip: req.ip,
        path: req.path
      });

      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid parameter types',
          code: 'INVALID_PARAMETER_TYPES',
          details: error.message
        }
      });
    }
  },

  // Content type validation
  validateContentType: (req, res, next) => {
    const allowedTypes = process.env.ALLOWED_CONTENT_TYPES?.split(',') || [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data'
    ];

    const contentType = req.headers['content-type'];
    
    if (!contentType) {
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Content-Type header is required',
            code: 'MISSING_CONTENT_TYPE'
          }
        });
      }
      return next();
    }

    const isAllowed = allowedTypes.some(type => contentType.includes(type));
    
    if (!isAllowed) {
      logger.warn('Invalid content type attempted', {
        contentType,
        ip: req.ip,
        path: req.path
      });

      return res.status(415).json({
        success: false,
        error: {
          message: 'Unsupported media type',
          code: 'UNSUPPORTED_MEDIA_TYPE',
          allowedTypes
        }
      });
    }

    next();
  },

  // Rate limiting validation
  validateRateLimit: (windowMs = 15 * 60 * 1000, max = 100) => {
    return (req, res, next) => {
      // This is a placeholder that validates rate limit configuration
      // Actual rate limiting is handled by the rate limiter middleware
      if (windowMs <= 0 || max <= 0) {
        logger.warn('Invalid rate limit configuration', {
          windowMs,
          max,
          ip: req.ip
        });
        
        return res.status(500).json({
          success: false,
          error: {
            message: 'Invalid rate limit configuration',
            code: 'INVALID_RATE_LIMIT_CONFIG'
          }
        });
      }
      next();
    };
  }
};