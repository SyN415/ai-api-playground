const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Security middleware collection for comprehensive API protection
 */

class SecurityMiddleware {
  constructor() {
    this.config = {
      maxRequestSize: parseInt(process.env.MAX_REQUEST_SIZE) || 10 * 1024 * 1024, // 10MB default
      maxParameterCount: parseInt(process.env.MAX_PARAMETER_COUNT) || 100,
      maxArrayLength: parseInt(process.env.MAX_ARRAY_LENGTH) || 1000,
      maxStringLength: parseInt(process.env.MAX_STRING_LENGTH) || 10000,
      allowedContentTypes: process.env.ALLOWED_CONTENT_TYPES?.split(',') || [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data'
      ],
      allowedMethods: process.env.ALLOWED_METHODS?.split(',') || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHosts: process.env.ALLOWED_HOSTS?.split(',') || [],
      cspDirectives: this.parseCSPDirectives(process.env.CSP_DIRECTIVES),
      hstsMaxAge: parseInt(process.env.HSTS_MAX_AGE) || 31536000, // 1 year
      referrerPolicy: process.env.REFERRER_POLICY || 'strict-origin-when-cross-origin'
    };
  }

  parseCSPDirectives(directives) {
    if (!directives) {
      return {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"]
      };
    }

    const parsed = {};
    directives.split(';').forEach(directive => {
      const [key, ...values] = directive.trim().split(/\s+/);
      if (key && values.length > 0) {
        parsed[key] = values;
      }
    });
    return parsed;
  }

  /**
   * Request size limiting middleware
   */
  requestSizeLimiter = (req, res, next) => {
    try {
      const contentLength = req.headers['content-length'];
      
      if (contentLength && parseInt(contentLength) > this.config.maxRequestSize) {
        logger.warn('Request size limit exceeded', {
          size: contentLength,
          maxSize: this.config.maxRequestSize,
          ip: req.ip,
          path: req.path
        });
        
        return res.status(413).json({
          success: false,
          error: {
            message: `Request entity too large. Maximum size is ${this.config.maxRequestSize} bytes`,
            code: 'REQUEST_TOO_LARGE',
            maxSize: this.config.maxRequestSize
          }
        });
      }

      // Monitor request size during data reception
      let receivedBytes = 0;
      const originalWrite = res.write;
      const originalEnd = res.end;

      req.on('data', (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes > this.config.maxRequestSize) {
          logger.warn('Request size exceeded during transmission', {
            received: receivedBytes,
            maxSize: this.config.maxRequestSize,
            ip: req.ip
          });
          
          req.destroy();
          res.status(413).json({
            success: false,
            error: {
              message: 'Request entity too large',
              code: 'REQUEST_TOO_LARGE'
            }
          });
        }
      });

      next();
    } catch (error) {
      logger.error('Request size limiter error:', error);
      next();
    }
  };

  /**
   * Parameter pollution protection
   */
  parameterPollutionProtection = (req, res, next) => {
    try {
      const checkObject = (obj, depth = 0, path = '') => {
        if (depth > 10) {
          throw new Error(`Object nesting too deep at ${path}`);
        }

        if (Array.isArray(obj) && obj.length > this.config.maxArrayLength) {
          throw new Error(`Array too large at ${path}: ${obj.length} items`);
        }

        if (typeof obj === 'object' && obj !== null) {
          const keys = Object.keys(obj);
          if (keys.length > this.config.maxParameterCount) {
            throw new Error(`Too many parameters at ${path}: ${keys.length} parameters`);
          }

          for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (typeof value === 'string' && value.length > this.config.maxStringLength) {
              throw new Error(`String too long at ${currentPath}: ${value.length} characters`);
            }

            checkObject(value, depth + 1, currentPath);
          }
        }
      };

      // Check query parameters
      if (req.query) {
        checkObject(req.query, 0, 'query');
      }

      // Check body parameters
      if (req.body) {
        checkObject(req.body, 0, 'body');
      }

      next();
    } catch (error) {
      logger.warn('Parameter pollution detected:', {
        error: error.message,
        ip: req.ip,
        path: req.path
      });

      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request parameters',
          code: 'PARAMETER_POLLUTION',
          details: error.message
        }
      });
    }
  };

  /**
   * SQL injection prevention
   */
  sqlInjectionProtection = (req, res, next) => {
    try {
      const sqlPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|WHERE|OR|1=1)\b)/i,
        /(\b(AND|OR)\s+\d+\s*=\s*\d+)/i,
        /(--|\*\/|\/\*)/,
        /(;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b)/i,
        /(\bWAITFOR\s+DELAY\b)/i,
        /(\bSHUTDOWN\b)/i,
        /(\bXP_\w+|SP_\w+|SYS_\w+)\b/i
      ];

      const checkForSQLInjection = (obj, path = '') => {
        if (typeof obj === 'string') {
          for (const pattern of sqlPatterns) {
            if (pattern.test(obj)) {
              logger.warn('Potential SQL injection detected', {
                pattern: pattern.source,
                value: obj.substring(0, 100), // Log first 100 chars
                path,
                ip: req.ip
              });
              return true;
            }
          }
        } else if (typeof obj === 'object' && obj !== null) {
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            if (checkForSQLInjection(value, currentPath)) {
              return true;
            }
          }
        }
        return false;
      };

      // Check query parameters
      if (checkForSQLInjection(req.query)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid input detected',
            code: 'INVALID_INPUT',
            details: 'Potential SQL injection pattern detected'
          }
        });
      }

      // Check body parameters
      if (checkForSQLInjection(req.body)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid input detected',
            code: 'INVALID_INPUT',
            details: 'Potential SQL injection pattern detected'
          }
        });
      }

      next();
    } catch (error) {
      logger.error('SQL injection protection error:', error);
      next();
    }
  };

  /**
   * XSS protection headers
   */
  xssProtectionHeaders = (req, res, next) => {
    try {
      // X-XSS-Protection header (legacy but still useful)
      res.setHeader('X-XSS-Protection', '1; mode=block');
      
      // X-Content-Type-Options header
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // Clear-Site-Data header for sensitive endpoints
      if (req.path.includes('/auth/') || req.path.includes('/logout')) {
        res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
      }

      next();
    } catch (error) {
      logger.error('XSS protection headers error:', error);
      next();
    }
  };

  /**
   * Content Security Policy headers
   */
  contentSecurityPolicy = (req, res, next) => {
    try {
      const cspDirectives = [];
      
      for (const [directive, values] of Object.entries(this.config.cspDirectives)) {
        cspDirectives.push(`${directive} ${values.join(' ')}`);
      }
      
      const cspHeader = cspDirectives.join('; ');
      
      // Set CSP header
      res.setHeader('Content-Security-Policy', cspHeader);
      
      // Also set X-CSP header for older browsers
      res.setHeader('X-Content-Security-Policy', cspHeader);
      
      next();
    } catch (error) {
      logger.error('Content Security Policy error:', error);
      next();
    }
  };

  /**
   * DNS rebinding protection
   */
  dnsRebindingProtection = (req, res, next) => {
    try {
      const host = req.headers.host;
      const origin = req.headers.origin;
      
      // Check if host is in allowed hosts list
      if (this.config.allowedHosts.length > 0) {
        const isHostAllowed = this.config.allowedHosts.some(allowedHost => {
          if (allowedHost.startsWith('.')) {
            // Subdomain matching
            return host.endsWith(allowedHost) || host === allowedHost.substring(1);
          }
          return host === allowedHost;
        });
        
        if (!isHostAllowed) {
          logger.warn('DNS rebinding attempt detected', {
            host,
            ip: req.ip,
            path: req.path
          });
          
          return res.status(403).json({
            success: false,
            error: {
              message: 'Invalid host header',
              code: 'INVALID_HOST',
              details: 'The host header is not in the allowed list'
            }
          });
        }
      }
      
      // Check origin header if present
      if (origin) {
        try {
          const originUrl = new URL(origin);
          if (originUrl.hostname !== req.hostname) {
            logger.warn('Origin header mismatch detected', {
              origin,
              hostname: req.hostname,
              ip: req.ip
            });
          }
        } catch (e) {
          logger.warn('Invalid origin header', {
            origin,
            ip: req.ip
          });
        }
      }
      
      // Set X-Frame-Options for clickjacking protection
      res.setHeader('X-Frame-Options', 'DENY');
      
      // Set X-Frame-Options successor
      res.setHeader('X-Frame-Options', 'DENY');
      
      next();
    } catch (error) {
      logger.error('DNS rebinding protection error:', error);
      next();
    }
  };

  /**
   * Frame options security
   */
  frameOptionsSecurity = (req, res, next) => {
    try {
      // DENY - No rendering within a frame
      res.setHeader('X-Frame-Options', 'DENY');
      
      // CSP frame-ancestors for modern browsers
      res.setHeader('Content-Security-Policy', 
        `${res.getHeader('Content-Security-Policy') || ''}; frame-ancestors 'none'`.trim()
      );
      
      next();
    } catch (error) {
      logger.error('Frame options security error:', error);
      next();
    }
  };

  /**
   * Method validation middleware
   */
  methodValidation = (req, res, next) => {
    try {
      if (!this.config.allowedMethods.includes(req.method)) {
        logger.warn('Invalid HTTP method attempted', {
          method: req.method,
          ip: req.ip,
          path: req.path
        });
        
        return res.status(405).json({
          success: false,
          error: {
            message: 'Method not allowed',
            code: 'METHOD_NOT_ALLOWED',
            allowedMethods: this.config.allowedMethods
          }
        });
      }
      
      next();
    } catch (error) {
      logger.error('Method validation error:', error);
      next();
    }
  };

  /**
   * Content type validation
   */
  contentTypeValidation = (req, res, next) => {
    try {
      if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'HEAD') {
        return next(); // No content type needed for these methods
      }
      
      const contentType = req.headers['content-type'];
      
      if (!contentType) {
        logger.warn('Missing content-type header', {
          ip: req.ip,
          path: req.path
        });
        
        return res.status(400).json({
          success: false,
          error: {
            message: 'Content-Type header is required',
            code: 'MISSING_CONTENT_TYPE'
          }
        });
      }
      
      const isAllowed = this.config.allowedContentTypes.some(allowed => 
        contentType.includes(allowed)
      );
      
      if (!isAllowed) {
        logger.warn('Invalid content-type attempted', {
          contentType,
          ip: req.ip,
          path: req.path
        });
        
        return res.status(415).json({
          success: false,
          error: {
            message: 'Unsupported media type',
            code: 'UNSUPPORTED_MEDIA_TYPE',
            allowedTypes: this.config.allowedContentTypes
          }
        });
      }
      
      next();
    } catch (error) {
      logger.error('Content type validation error:', error);
      next();
    }
  };

  /**
   * HSTS (HTTP Strict Transport Security)
   */
  hsts = (req, res, next) => {
    try {
      if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 
          `max-age=${this.config.hstsMaxAge}; includeSubDomains; preload`
        );
      }
      
      next();
    } catch (error) {
      logger.error('HSTS error:', error);
      next();
    }
  };

  /**
   * Referrer policy
   */
  referrerPolicy = (req, res, next) => {
    try {
      res.setHeader('Referrer-Policy', this.config.referrerPolicy);
      next();
    } catch (error) {
      logger.error('Referrer policy error:', error);
      next();
    }
  };

  /**
   * Remove sensitive headers
   */
  removeSensitiveHeaders = (req, res, next) => {
    try {
      // Remove server identification headers
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');
      
      next();
    } catch (error) {
      logger.error('Remove sensitive headers error:', error);
      next();
    }
  };

  /**
   * Feature policy (Permissions-Policy)
   */
  featurePolicy = (req, res, next) => {
    try {
      const permissions = [
        'geolocation=()',
        'camera=()',
        'microphone=()',
        'notifications=()',
        'push=()',
        'sync-xhr=()',
        'payment=()',
        'usb=()',
        'magnetometer=()',
        'gyroscope=()',
        'speaker=()',
        'vibrate=()',
        'bluetooth=()',
        'midi=()'
      ];
      
      res.setHeader('Permissions-Policy', permissions.join(', '));
      next();
    } catch (error) {
      logger.error('Feature policy error:', error);
      next();
    }
  };

  /**
   * Cache control for sensitive data
   */
  cacheControl = (req, res, next) => {
    try {
      // Don't cache sensitive endpoints
      if (req.path.includes('/auth/') || 
          req.path.includes('/api/') || 
          req.path.includes('/admin/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        // Default cache control for other endpoints
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
      
      next();
    } catch (error) {
      logger.error('Cache control error:', error);
      next();
    }
  };
}

// Create security middleware instance
const security = new SecurityMiddleware();

// Export individual middleware functions
module.exports = {
  requestSizeLimiter: security.requestSizeLimiter,
  parameterPollutionProtection: security.parameterPollutionProtection,
  sqlInjectionProtection: security.sqlInjectionProtection,
  xssProtectionHeaders: security.xssProtectionHeaders,
  contentSecurityPolicy: security.contentSecurityPolicy,
  dnsRebindingProtection: security.dnsRebindingProtection,
  frameOptionsSecurity: security.frameOptionsSecurity,
  methodValidation: security.methodValidation,
  contentTypeValidation: security.contentTypeValidation,
  hsts: security.hsts,
  referrerPolicy: security.referrerPolicy,
  removeSensitiveHeaders: security.removeSensitiveHeaders,
  featurePolicy: security.featurePolicy,
  cacheControl: security.cacheControl,
  
  // Export all middleware as a combined middleware
  all: [
    security.removeSensitiveHeaders,
    security.methodValidation,
    security.contentTypeValidation,
    security.requestSizeLimiter,
    security.parameterPollutionProtection,
    security.sqlInjectionProtection,
    security.dnsRebindingProtection,
    security.xssProtectionHeaders,
    security.contentSecurityPolicy,
    security.frameOptionsSecurity,
    security.hsts,
    security.referrerPolicy,
    security.featurePolicy,
    security.cacheControl
  ]
};