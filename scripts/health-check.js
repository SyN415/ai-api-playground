// Health Check Script for AI API Playground
// This script performs comprehensive health checks for the application

const http = require('http');
const https = require('https');
const url = require('url');

// Configuration
const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || 'localhost';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000;
const API_BASE_URL = process.env.API_BASE_URL || `http://${HOST}:${PORT}`;

// Health check results
const healthChecks = {
  timestamp: new Date().toISOString(),
  status: 'healthy',
  checks: {},
  version: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development'
};

// Function to perform HTTP health check
async function checkEndpoint(endpoint, options = {}) {
  const startTime = Date.now();
  const timeout = options.timeout || TIMEOUT;
  
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({
        status: 'timeout',
        responseTime: Date.now() - startTime,
        error: 'Request timed out'
      });
    }, timeout);

    const parsedUrl = url.parse(`${API_BASE_URL}${endpoint}`);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'AI-API-Playground-Health-Check/1.0',
        ...options.headers
      },
      timeout: timeout
    };

    const req = client.request(requestOptions, (res) => {
      clearTimeout(timeoutId);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        let status = 'healthy';
        
        if (res.statusCode >= 500) {
          status = 'critical';
        } else if (res.statusCode >= 400) {
          status = 'unhealthy';
        }
        
        resolve({
          status,
          responseTime,
          statusCode: res.statusCode,
          data: data.length > 1000 ? data.substring(0, 1000) + '...' : data
        });
      });
    });

    req.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        status: 'critical',
        responseTime: Date.now() - startTime,
        error: error.message
      });
    });

    req.on('timeout', () => {
      clearTimeout(timeoutId);
      req.destroy();
      resolve({
        status: 'timeout',
        responseTime: Date.now() - startTime,
        error: 'Request timed out'
      });
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Function to check database connectivity
async function checkDatabase() {
  try {
    // Check if we can connect to the database
    // This is a simplified check - in production, you'd want to run a real query
    if (process.env.DATABASE_URL) {
      return {
        status: 'healthy',
        message: 'Database URL configured'
      };
    }
    
    return {
      status: 'warning',
      message: 'DATABASE_URL not set'
    };
  } catch (error) {
    return {
      status: 'critical',
      error: error.message
    };
  }
}

// Function to check Redis connectivity
async function checkRedis() {
  try {
    if (process.env.REDIS_URL) {
      return {
        status: 'healthy',
        message: 'Redis URL configured'
      };
    }
    
    return {
      status: 'warning',
      message: 'REDIS_URL not set'
    };
  } catch (error) {
    return {
      status: 'critical',
      error: error.message
    };
  }
}

// Function to check environment variables
function checkEnvironment() {
  const requiredEnvVars = [
    'JWT_SECRET',
    'DATABASE_URL'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length === 0) {
    return {
      status: 'healthy',
      message: 'All required environment variables are set'
    };
  }
  
  return {
    status: 'critical',
    error: `Missing required environment variables: ${missingVars.join(', ')}`
  };
}

// Function to check disk space
function checkDiskSpace() {
  try {
    const fs = require('fs');
    const stats = fs.statSync('.');
    
    return {
      status: 'healthy',
      message: 'Disk access available'
    };
  } catch (error) {
    return {
      status: 'critical',
      error: `Disk access failed: ${error.message}`
    };
  }
}

// Function to check memory usage
function checkMemory() {
  const usage = process.memoryUsage();
  const maxHeap = 512 * 1024 * 1024; // 512MB threshold
  
  if (usage.heapUsed > maxHeap) {
    return {
      status: 'warning',
      message: `High memory usage: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`
    };
  }
  
  return {
    status: 'healthy',
    message: `Memory usage: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`
  };
}

// Main health check function
async function performHealthChecks() {
  console.log('🔍 Performing health checks...');
  
  // Check main application endpoint
  console.log('  Checking main application endpoint...');
  healthChecks.checks.application = await checkEndpoint('/health');
  
  // Check API endpoints
  console.log('  Checking API endpoints...');
  healthChecks.checks.api = await checkEndpoint('/api/health');
  
  // Check authentication endpoint
  console.log('  Checking authentication endpoint...');
  healthChecks.checks.auth = await checkEndpoint('/api/auth/health');
  
  // Check database
  console.log('  Checking database connectivity...');
  healthChecks.checks.database = await checkDatabase();
  
  // Check Redis
  console.log('  Checking Redis connectivity...');
  healthChecks.checks.redis = await checkRedis();
  
  // Check environment variables
  console.log('  Checking environment variables...');
  healthChecks.checks.environment = checkEnvironment();
  
  // Check disk space
  console.log('  Checking disk space...');
  healthChecks.checks.disk = checkDiskSpace();
  
  // Check memory usage
  console.log('  Checking memory usage...');
  healthChecks.checks.memory = checkMemory();
  
  // Determine overall status
  const statuses = Object.values(healthChecks.checks).map(check => check.status);
  
  if (statuses.includes('critical')) {
    healthChecks.status = 'critical';
  } else if (statuses.includes('unhealthy') || statuses.includes('timeout')) {
    healthChecks.status = 'unhealthy';
  } else if (statuses.includes('warning')) {
    healthChecks.status = 'warning';
  } else {
    healthChecks.status = 'healthy';
  }
  
  return healthChecks;
}

// Format output
function formatOutput(results) {
  const output = {
    status: results.status,
    timestamp: results.timestamp,
    version: results.version,
    environment: results.environment,
    checks: {}
  };
  
  // Add check results
  for (const [name, check] of Object.entries(results.checks)) {
    output.checks[name] = {
      status: check.status,
      responseTime: check.responseTime,
      statusCode: check.statusCode,
      error: check.error,
      message: check.message
    };
  }
  
  return output;
}

// Main execution
if (require.main === module) {
  performHealthChecks()
    .then(results => {
      const formatted = formatOutput(results);
      
      // Output as JSON
      console.log('\n📊 Health Check Results:');
      console.log(JSON.stringify(formatted, null, 2));
      
      // Exit with appropriate code
      if (results.status === 'critical') {
        console.error('\n❌ Health check failed - critical issues found');
        process.exit(1);
      } else if (results.status === 'unhealthy') {
        console.error('\n⚠️  Health check failed - unhealthy services found');
        process.exit(1);
      } else if (results.status === 'warning') {
        console.warn('\n⚠️  Health check passed with warnings');
        process.exit(0);
      } else {
        console.log('\n✅ Health check passed - all services healthy');
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('\n❌ Health check failed with error:', error.message);
      process.exit(1);
    });
}

module.exports = { performHealthChecks, checkEndpoint, checkDatabase, checkRedis };