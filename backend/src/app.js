const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const rateLimitMiddleware = require('./middleware/rateLimit');
const requestLogger = require('./middleware/requestLogger');
const gateway = require('./middleware/gateway');
const responseFormatter = require('./utils/responseFormatter');
const security = require('./middleware/security');
const { validateParameterTypes, validateContentType } = require('./middleware/validation');

// Route imports
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const aiRoutes = require('./routes/ai');
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: {
    action: 'deny'
  },
  xssFilter: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}));

// Performance middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(requestLogger.logRequest);

// Apply security middleware before other middleware
app.use(security.removeSensitiveHeaders);
app.use(security.methodValidation);
app.use(security.contentTypeValidation);
app.use(security.requestSizeLimiter);
app.use(security.parameterPollutionProtection);
app.use(security.sqlInjectionProtection);
app.use(security.dnsRebindingProtection);
app.use(security.xssProtectionHeaders);
app.use(security.contentSecurityPolicy);
app.use(security.frameOptionsSecurity);
app.use(security.hsts);
app.use(security.referrerPolicy);
app.use(security.featurePolicy);
app.use(security.cacheControl);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced validation middleware
app.use(validateParameterTypes);
app.use(validateContentType);

// Rate limiting
app.use(rateLimitMiddleware);

// Gateway middleware for API versioning and routing
app.use('/api/v1', gateway.gateway);

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
  res.redirect('/api/v1/docs');
});

// API routes - v1
app.use('/api/auth', authRoutes);
app.use('/api/v1', apiRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json(responseFormatter.apiInfo({
    message: 'Welcome to AI API Playground',
    documentation: '/api/docs'
  }).body);
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        api: 'operational',
        database: 'operational',
        redis: process.env.REDIS_URL ? 'operational' : 'not_configured'
      }
    };

    res.status(200).json(responseFormatter.success(health).body);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json(
      responseFormatter.error(error, {
        message: 'Service unavailable',
        statusCode: 503,
        code: 'HEALTH_CHECK_FAILED'
      }).body
    );
  }
});

// Error handling middleware
app.use(notFound);
app.use(requestLogger.logErrors);
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  logger.info(`🔍 Health Check: http://localhost:${PORT}/health`);
});

module.exports = app;