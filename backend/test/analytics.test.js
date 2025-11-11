const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const { expect } = chai;
const app = require('../src/app');
const db = require('../src/config/database');
const UsageLog = require('../src/models/UsageLog');
const RequestLog = require('../src/models/RequestLog');
const analyticsService = require('../src/services/analyticsService');
const monitoringService = require('../src/services/monitoringService');
const usageTracker = require('../src/middleware/usageTracker');

chai.use(chaiHttp);
chai.use(sinonChai);

/**
 * Analytics Test Suite
 * Comprehensive tests for usage tracking, analytics, and monitoring functionality
 */

describe('Analytics System', () => {
  let sandbox;
  let testUser;
  let authToken;

  before(async () => {
    // Initialize database connection
    await db.initialize();
    
    // Create test user
    const User = require('../src/models/User');
    testUser = await User.create({
      email: 'analytics-test@example.com',
      password: 'TestPassword123!',
      role: 'user'
    });
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Stub monitoring service alerts to avoid noise during tests
    sandbox.stub(monitoringService, 'triggerAlert').resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  after(async () => {
    // Clean up test data
    const client = db.getClient();
    await client
      .from('usage_logs')
      .delete()
      .eq('user_id', testUser.id);
    
    await client
      .from('request_logs')
      .delete()
      .eq('user_id', testUser.id);
    
    // Delete test user
    await client
      .from('users')
      .delete()
      .eq('id', testUser.id);
  });

  describe('UsageLog Model', () => {
    describe('create', () => {
      it('should create a usage log entry', async () => {
        const usageData = {
          userId: testUser.id,
          provider: 'minimax',
          model: 'hailuo-2.3',
          taskType: 'generation',
          tokensInput: 100,
          tokensOutput: 200,
          tokensTotal: 300,
          cost: 0.05,
          status: 'success',
          endpoint: '/api/v1/ai/generate',
          responseTime: 1500
        };

        const usageLog = await UsageLog.create(usageData);

        expect(usageLog).to.be.an.instanceOf(UsageLog);
        expect(usageLog.userId).to.equal(testUser.id);
        expect(usageLog.provider).to.equal('minimax');
        expect(usageLog.model).to.equal('hailuo-2.3');
        expect(usageLog.tokensTotal).to.equal(300);
        expect(usageLog.cost).to.equal(0.05);
      });

      it('should calculate Minimax cost correctly', () => {
        const cost = UsageLog.calculateMinimaxCost('hailuo-2.3', 100, 200, 'generation');
        expect(cost).to.be.a('number');
        expect(cost).to.be.greaterThan(0);
      });

      it('should calculate video generation cost correctly', () => {
        const cost = UsageLog.calculateMinimaxCost('hailuo-2.3', 0, 0, 'video_generation');
        expect(cost).to.equal(0.05); // Based on pricing in UsageLog model
      });
    });

    describe('findByUserId', () => {
      before(async () => {
        // Create test usage logs
        for (let i = 0; i < 5; i++) {
          await UsageLog.create({
            userId: testUser.id,
            provider: 'minimax',
            model: 'hailuo-2.3',
            taskType: 'generation',
            tokensInput: 50 + i,
            tokensOutput: 100 + i,
            tokensTotal: 150 + i,
            cost: 0.02 + (i * 0.01),
            status: 'success',
            endpoint: '/api/v1/ai/generate',
            responseTime: 1000 + (i * 100)
          });
        }
      });

      it('should retrieve usage logs for a user', async () => {
        const result = await UsageLog.findByUserId(testUser.id, { limit: 10 });
        
        expect(result.logs).to.be.an('array');
        expect(result.logs.length).to.be.greaterThan(0);
        expect(result.total).to.be.a('number');
        expect(result.limit).to.equal(10);
      });

      it('should filter usage logs by date range', async () => {
        const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const endDate = new Date().toISOString();
        
        const result = await UsageLog.findByUserId(testUser.id, {
          startDate,
          endDate,
          limit: 10
        });
        
        expect(result.logs).to.be.an('array');
        result.logs.forEach(log => {
          expect(new Date(log.createdAt)).to.be.at.least(new Date(startDate));
          expect(new Date(log.createdAt)).to.be.at.most(new Date(endDate));
        });
      });
    });

    describe('getUserStats', () => {
      it('should calculate user usage statistics', async () => {
        const stats = await UsageLog.getUserStats(testUser.id);
        
        expect(stats).to.be.an('object');
        expect(stats.userId).to.equal(testUser.id);
        expect(stats.totalRequests).to.be.a('number');
        expect(stats.totalTokens).to.be.a('number');
        expect(stats.totalCost).to.be.a('number');
        expect(stats.averageResponseTime).to.be.a('number');
        expect(stats.providers).to.be.an('object');
        expect(stats.models).to.be.an('object');
        expect(stats.taskTypes).to.be.an('object');
      });

      it('should calculate statistics for date range', async () => {
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const stats = await UsageLog.getUserStats(testUser.id, { startDate });
        
        expect(stats.period.start).to.equal(startDate);
        expect(stats.totalRequests).to.be.a('number');
      });
    });

    describe('getSystemStats', () => {
      it('should calculate system-wide statistics', async () => {
        const stats = await UsageLog.getSystemStats();
        
        expect(stats).to.be.an('object');
        expect(stats.totalRequests).to.be.a('number');
        expect(stats.totalTokens).to.be.a('number');
        expect(stats.totalCost).to.be.a('number');
        expect(stats.uniqueUsers).to.be.a('number');
        expect(stats.providers).to.be.an('object');
        expect(stats.userActivity).to.be.an('object');
      });
    });

    describe('getCostBreakdown', () => {
      it('should provide detailed cost breakdown', async () => {
        const breakdown = await UsageLog.getCostBreakdown(testUser.id);
        
        expect(breakdown).to.be.an('object');
        expect(breakdown.userId).to.equal(testUser.id);
        expect(breakdown.totalCost).to.be.a('number');
        expect(breakdown.costByProvider).to.be.an('object');
        expect(breakdown.costByModel).to.be.an('object');
        expect(breakdown.costByTaskType).to.be.an('object');
        expect(breakdown.dailyCosts).to.be.an('object');
      });
    });
  });

  describe('RequestLog Model', () => {
    describe('create', () => {
      it('should create a request log entry', async () => {
        const requestData = {
          userId: testUser.id,
          method: 'POST',
          endpoint: '/api/v1/ai/generate',
          headers: { 'content-type': 'application/json' },
          body: { prompt: 'Test prompt' },
          ipAddress: '127.0.0.1',
          responseStatus: 200,
          responseSize: 1024,
          processingTime: 1200
        };

        const requestLog = await RequestLog.create(requestData);

        expect(requestLog).to.be.an.instanceOf(RequestLog);
        expect(requestLog.userId).to.equal(testUser.id);
        expect(requestLog.method).to.equal('POST');
        expect(requestLog.endpoint).to.equal('/api/v1/ai/generate');
        expect(requestLog.responseStatus).to.equal(200);
        expect(requestLog.processingTime).to.equal(1200);
      });
    });

    describe('getPerformanceMetrics', () => {
      before(async () => {
        // Create test request logs
        const client = db.getClient();
        await client.from('request_logs').insert([
          {
            user_id: testUser.id,
            method: 'POST',
            endpoint: '/api/v1/ai/generate',
            response_status: 200,
            processing_time: 1000,
            created_at: new Date().toISOString()
          },
          {
            user_id: testUser.id,
            method: 'POST',
            endpoint: '/api/v1/ai/generate',
            response_status: 200,
            processing_time: 1500,
            created_at: new Date().toISOString()
          },
          {
            user_id: testUser.id,
            method: 'POST',
            endpoint: '/api/v1/ai/embeddings',
            response_status: 500,
            processing_time: 2000,
            error: 'Internal server error',
            created_at: new Date().toISOString()
          }
        ]);
      });

      it('should calculate performance metrics', async () => {
        const metrics = await RequestLog.getPerformanceMetrics();
        
        expect(metrics).to.be.an('object');
        expect(metrics.totalRequests).to.be.a('number');
        expect(metrics.averageResponseTime).to.be.a('number');
        expect(metrics.p50ResponseTime).to.be.a('number');
        expect(metrics.p95ResponseTime).to.be.a('number');
        expect(metrics.p99ResponseTime).to.be.a('number');
        expect(metrics.minResponseTime).to.be.a('number');
        expect(metrics.maxResponseTime).to.be.a('number');
        expect(metrics.statusCodes).to.be.an('object');
        expect(metrics.endpoints).to.be.an('object');
      });

      it('should filter metrics by endpoint', async () => {
        const metrics = await RequestLog.getPerformanceMetrics({
          endpoint: '/api/v1/ai/generate'
        });
        
        expect(metrics.endpoints['/api/v1/ai/generate']).to.be.greaterThan(0);
      });
    });

    describe('getErrorLogs', () => {
      it('should retrieve error logs', async () => {
        const errorLogs = await RequestLog.getErrorLogs({ limit: 10 });
        
        expect(errorLogs.errors).to.be.an('array');
        expect(errorLogs.total).to.be.a('number');
        errorLogs.errors.forEach(log => {
          expect(log.responseStatus >= 400 || log.error).to.be.true;
        });
      });

      it('should filter error logs by user', async () => {
        const errorLogs = await RequestLog.getErrorLogs({
          userId: testUser.id,
          limit: 10
        });
        
        errorLogs.errors.forEach(log => {
          expect(log.userId).to.equal(testUser.id);
        });
      });
    });
  });

  describe('Analytics Service', () => {
    describe('getUsageStats', () => {
      it('should get usage statistics with caching', async () => {
        const stats = await analyticsService.getUsageStats();
        
        expect(stats).to.be.an('object');
        expect(stats.totalRequests).to.be.a('number');
      });

      it('should get user-specific usage statistics', async () => {
        const stats = await analyticsService.getUsageStats({ userId: testUser.id });
        
        expect(stats.userId).to.equal(testUser.id);
        expect(stats.totalRequests).to.be.a('number');
      });
    });

    describe('getCostAnalysis', () => {
      it('should analyze costs for user', async () => {
        const costAnalysis = await analyticsService.getCostAnalysis({
          userId: testUser.id
        });
        
        expect(costAnalysis).to.be.an('object');
        expect(costAnalysis.totalCost).to.be.a('number');
        expect(costAnalysis.costByProvider).to.be.an('object');
      });

      it('should analyze system-wide costs', async () => {
        const costAnalysis = await analyticsService.getCostAnalysis();
        
        expect(costAnalysis).to.be.an('object');
        expect(costAnalysis.totalCost).to.be.a('number');
      });
    });

    describe('getPerformanceMetrics', () => {
      it('should get performance metrics', async () => {
        const metrics = await analyticsService.getPerformanceMetrics();
        
        expect(metrics).to.be.an('object');
        expect(metrics.averageResponseTime).to.be.a('number');
      });
    });

    describe('getUserActivity', () => {
      it('should get user activity analytics', async () => {
        const activity = await analyticsService.getUserActivity({ limit: 10 });
        
        expect(activity.users).to.be.an('array');
        expect(activity.total).to.be.a('number');
        activity.users.forEach(user => {
          expect(user.userId).to.be.a('string');
          expect(user.requestCount).to.be.a('number');
          expect(user.totalCost).to.be.a('number');
        });
      });
    });

    describe('getEndpointUsage', () => {
      it('should get endpoint usage patterns', async () => {
        const endpointUsage = await analyticsService.getEndpointUsage({ limit: 10 });
        
        expect(endpointUsage).to.be.an('array');
        endpointUsage.forEach(endpoint => {
          expect(endpoint.endpoint).to.be.a('string');
          expect(endpoint.requestCount).to.be.a('number');
          expect(endpoint.averageResponseTime).to.be.a('number');
        });
      });
    });

    describe('getProviderComparison', () => {
      it('should compare provider performance', async () => {
        const comparison = await analyticsService.getProviderComparison();
        
        expect(comparison).to.be.an('array');
        comparison.forEach(provider => {
          expect(provider.provider).to.be.a('string');
          expect(provider.requestCount).to.be.a('number');
          expect(provider.totalCost).to.be.a('number');
          expect(provider.averageResponseTime).to.be.a('number');
        });
      });
    });

    describe('getErrorAnalysis', () => {
      it('should analyze errors', async () => {
        const errorAnalysis = await analyticsService.getErrorAnalysis({ limit: 10 });
        
        expect(errorAnalysis).to.be.an('object');
        expect(errorAnalysis.totalErrors).to.be.a('number');
        expect(errorAnalysis.errorPatterns).to.be.an('object');
        expect(errorAnalysis.recentErrors).to.be.an('array');
        expect(errorAnalysis.errorRate).to.be.a('number');
      });
    });

    describe('getTrendAnalysis', () => {
      it('should analyze trends over time', async () => {
        const trends = await analyticsService.getTrendAnalysis({
          metric: 'requests',
          period: '1d'
        });
        
        expect(trends).to.be.an('array');
        if (trends.length > 0) {
          const trend = trends[0];
          expect(trend.timestamp).to.be.a('string');
          expect(trend.requests).to.be.a('number');
        }
      });
    });

    describe('caching', () => {
      it('should cache analytics results', async () => {
        const cacheKey = 'test_cache';
        let callCount = 0;
        
        const computeFn = async () => {
          callCount++;
          return { data: 'test', timestamp: Date.now() };
        };
        
        // First call should compute
        const result1 = await analyticsService.getCached(cacheKey, computeFn);
        expect(callCount).to.equal(1);
        
        // Second call should use cache
        const result2 = await analyticsService.getCached(cacheKey, computeFn);
        expect(callCount).to.equal(1); // Should not increment
        expect(result1).to.deep.equal(result2);
      });

      it('should clear cache', () => {
        analyticsService.clearCache();
        // If no errors thrown, test passes
        expect(true).to.be.true;
      });
    });
  });

  describe('Monitoring Service', () => {
    describe('alert system', () => {
      it('should trigger alerts', async () => {
        const alert = await monitoringService.triggerAlert('test_alert', {
          message: 'Test alert',
          severity: 'low'
        });
        
        expect(alert).to.be.an('object');
        expect(alert.id).to.be.a('string');
        expect(alert.type).to.equal('test_alert');
        expect(alert.data.message).to.equal('Test alert');
        expect(alert.severity).to.be.a('string');
        expect(alert.timestamp).to.be.a('string');
      });

      it('should store and retrieve alerts', () => {
        monitoringService.triggerAlert('test_alert_2', { test: true });
        
        const alerts = monitoringService.getRecentAlerts({ limit: 10 });
        expect(alerts).to.be.an('array');
        expect(alerts.length).to.be.greaterThan(0);
      });

      it('should filter alerts by severity', () => {
        const alerts = monitoringService.getRecentAlerts({
          severity: 'high',
          limit: 10
        });
        
        alerts.forEach(alert => {
          expect(alert.severity).to.equal('high');
        });
      });
    });

    describe('metrics collection', () => {
      it('should collect usage metrics', async () => {
        await monitoringService.monitorUsage();
        
        const metrics = monitoringService.getCurrentMetrics();
        expect(metrics.usage).to.be.an('object');
        expect(metrics.usage.hourlyCost).to.be.a('number');
        expect(metrics.usage.dailyCost).to.be.a('number');
      });

      it('should collect performance metrics', async () => {
        await monitoringService.monitorPerformance();
        
        const metrics = monitoringService.getCurrentMetrics();
        expect(metrics.performance).to.be.an('object');
        expect(metrics.performance.averageResponseTime).to.be.a('number');
      });

      it('should collect error metrics', async () => {
        await monitoringService.monitorErrorRates();
        
        const metrics = monitoringService.getCurrentMetrics();
        expect(metrics.errors).to.be.an('object');
        expect(metrics.errors.errorRate).to.be.a('number');
      });
    });

    describe('threshold management', () => {
      it('should get current thresholds', () => {
        const thresholds = monitoringService.getThresholds();
        
        expect(thresholds).to.be.an('object');
        expect(thresholds.dailyCost).to.be.a('number');
        expect(thresholds.errorRate).to.be.a('number');
        expect(thresholds.responseTime).to.be.a('number');
      });

      it('should update thresholds', () => {
        const newThresholds = {
          dailyCost: 200,
          errorRate: 10
        };
        
        monitoringService.setThresholds(newThresholds);
        
        const updated = monitoringService.getThresholds();
        expect(updated.dailyCost).to.equal(200);
        expect(updated.errorRate).to.equal(10);
      });
    });

    describe('alert callbacks', () => {
      it('should call registered alert callbacks', async () => {
        let callbackCalled = false;
        let receivedAlert = null;
        
        const callback = (alert) => {
          callbackCalled = true;
          receivedAlert = alert;
        };
        
        monitoringService.addAlertCallback(callback);
        
        await monitoringService.triggerAlert('callback_test', { test: true });
        
        expect(callbackCalled).to.be.true;
        expect(receivedAlert).to.be.an('object');
        expect(receivedAlert.type).to.equal('callback_test');
        
        monitoringService.removeAlertCallback(callback);
      });
    });

    describe('data cleanup', () => {
      it('should clean up old monitoring data', () => {
        const deleted = monitoringService.cleanupOldData(1); // 1 hour
        
        expect(deleted).to.be.a('number');
        expect(deleted).to.be.at.least(0);
      });
    });

    describe('health check', () => {
      it('should perform health check', () => {
        const health = monitoringService.healthCheck();
        
        expect(health).to.be.an('object');
        expect(health.status).to.be.a('string');
        expect(health.timestamp).to.be.a('string');
        expect(health.activeIntervals).to.be.a('number');
        expect(health.totalAlerts).to.be.a('number');
      });
    });
  });

  describe('UsageTracker Middleware', () => {
    describe('tracking functionality', () => {
      it('should track API requests', async () => {
        const req = {
          user: { id: testUser.id },
          id: 'test-request-id',
          method: 'POST',
          path: '/api/v1/ai/generate',
          headers: { 'content-type': 'application/json' },
          query: {},
          body: { prompt: 'Test prompt' },
          ip: '127.0.0.1',
          get: (header) => {
            const headers = {
              'User-Agent': 'Test Agent',
              'Content-Type': 'application/json'
            };
            return headers[header];
          }
        };

        const res = {
          statusCode: 200,
          getHeaders: () => ({ 'content-type': 'application/json' }),
          on: (event, callback) => {
            if (event === 'finish') {
              // Simulate response finish
              setTimeout(callback, 10);
            }
          },
          json: function(data) {
            this.responseBody = data;
            return this;
          },
          send: function(data) {
            this.responseBody = data;
            return this;
          }
        };

        const next = sinon.spy();

        const middleware = usageTracker.middleware();
        await middleware(req, res, next);

        expect(next).to.have.been.calledOnce;
      });

      it('should extract usage data from AI requests', () => {
        const req = {
          path: '/api/v1/ai/generate',
          body: {
            model: 'hailuo-2.3',
            prompt: 'Test prompt'
          }
        };

        const responseBody = {
          provider: 'minimax',
          model: 'hailuo-2.3',
          usage: {
            promptTokens: 50,
            completionTokens: 100,
            totalTokens: 150
          }
        };

        const usageData = usageTracker.extractUsageData(req, {}, responseBody);
        
        expect(usageData).to.be.an('object');
        expect(usageData.provider).to.equal('minimax');
        expect(usageData.model).to.equal('hailuo-2.3');
        expect(usageData.tokensInput).to.equal(50);
        expect(usageData.tokensOutput).to.equal(100);
        expect(usageData.tokensTotal).to.equal(150);
      });

      it('should calculate costs correctly', () => {
        const usageData = {
          model: 'hailuo-2.3',
          tokensInput: 100,
          tokensOutput: 200,
          taskType: 'generation'
        };

        const cost = usageTracker.calculateCost(usageData);
        
        expect(cost).to.be.a('number');
        expect(cost).to.be.greaterThan(0);
      });

      it('should sanitize headers', () => {
        const headers = {
          'content-type': 'application/json',
          'authorization': 'Bearer secret-token',
          'cookie': 'session=secret',
          'x-api-key': 'secret-key'
        };

        const sanitized = usageTracker.sanitizeHeaders(headers);
        
        expect(sanitized['content-type']).to.equal('application/json');
        expect(sanitized['authorization']).to.equal('[REDACTED]');
        expect(sanitized['cookie']).to.equal('[REDACTED]');
        expect(sanitized['x-api-key']).to.equal('[REDACTED]');
      });

      it('should truncate large bodies', () => {
        const largeBody = 'x'.repeat(20000); // 20KB
        const truncated = usageTracker.truncateBody(largeBody);
        
        expect(truncated.length).to.be.lessThan(20000);
        expect(truncated).to.include('[TRUNCATED]');
      });
    });

    describe('status management', () => {
      it('should enable and disable tracking', () => {
        usageTracker.disable();
        let status = usageTracker.getStatus();
        expect(status.enabled).to.be.false;

        usageTracker.enable();
        status = usageTracker.getStatus();
        expect(status.enabled).to.be.true;
      });

      it('should return tracking status', () => {
        const status = usageTracker.getStatus();
        
        expect(status).to.be.an('object');
        expect(status.enabled).to.be.a('boolean');
        expect(status.trackRequestBody).to.be.a('boolean');
        expect(status.trackResponseBody).to.be.a('boolean');
        expect(status.maxBodySize).to.be.a('number');
      });
    });
  });

  describe('API Endpoints', () => {
    before(async () => {
      // Login to get auth token
      const res = await chai.request(app)
        .post('/api/auth/login')
        .send({
          email: 'analytics-test@example.com',
          password: 'TestPassword123!'
        });
      
      authToken = res.body.data.token;
    });

    describe('User Analytics Endpoints', () => {
      it('GET /api/v1/analytics/usage - should get user usage stats', async () => {
        const res = await chai.request(app)
          .get('/api/v1/analytics/usage')
          .set('Authorization', `Bearer ${authToken}`);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data).to.be.an('object');
        expect(res.body.data.userId).to.equal(testUser.id);
        expect(res.body.data.totalRequests).to.be.a('number');
      });

      it('GET /api/v1/analytics/costs - should get user cost breakdown', async () => {
        const res = await chai.request(app)
          .get('/api/v1/analytics/costs')
          .set('Authorization', `Bearer ${authToken}`);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data).to.be.an('object');
        expect(res.body.data.totalCost).to.be.a('number');
      });

      it('GET /api/v1/analytics/history - should get user request history', async () => {
        const res = await chai.request(app)
          .get('/api/v1/analytics/history')
          .set('Authorization', `Bearer ${authToken}`);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data.logs).to.be.an('array');
      });
    });

    describe('Admin Analytics Endpoints', () => {
      let adminToken;

      before(async () => {
        // Create and login as admin
        const User = require('../src/models/User');
        const adminUser = await User.create({
          email: 'analytics-admin@example.com',
          password: 'AdminPassword123!',
          role: 'admin'
        });

        const res = await chai.request(app)
          .post('/api/auth/login')
          .send({
            email: 'analytics-admin@example.com',
            password: 'AdminPassword123!'
          });
        
        adminToken = res.body.data.token;
      });

      after(async () => {
        // Clean up admin user
        const client = db.getClient();
        await client
          .from('users')
          .delete()
          .eq('email', 'analytics-admin@example.com');
      });

      it('GET /api/admin/analytics/usage - should get system usage stats', async () => {
        const res = await chai.request(app)
          .get('/api/admin/analytics/usage')
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data).to.be.an('object');
        expect(res.body.data.totalRequests).to.be.a('number');
      });

      it('GET /api/admin/analytics/costs - should get system cost analysis', async () => {
        const res = await chai.request(app)
          .get('/api/admin/analytics/costs')
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data).to.be.an('object');
        expect(res.body.data.totalCost).to.be.a('number');
      });

      it('GET /api/admin/analytics/users - should get user activity', async () => {
        const res = await chai.request(app)
          .get('/api/admin/analytics/users?limit=10')
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data.users).to.be.an('array');
      });

      it('GET /api/admin/analytics/performance - should get performance metrics', async () => {
        const res = await chai.request(app)
          .get('/api/admin/analytics/performance')
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data).to.be.an('object');
        expect(res.body.data.averageResponseTime).to.be.a('number');
      });

      it('GET /api/admin/analytics/errors - should get error analysis', async () => {
        const res = await chai.request(app)
          .get('/api/admin/analytics/errors?limit=10')
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data).to.be.an('object');
        expect(res.body.data.totalErrors).to.be.a('number');
      });

      it('GET /api/admin/monitoring/alerts - should get monitoring alerts', async () => {
        const res = await chai.request(app)
          .get('/api/admin/monitoring/alerts?limit=10')
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data).to.be.an('array');
      });

      it('GET /api/admin/monitoring/metrics - should get monitoring metrics', async () => {
        const res = await chai.request(app)
          .get('/api/admin/monitoring/metrics')
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data).to.be.an('object');
      });

      it('GET /api/admin/monitoring/thresholds - should get monitoring thresholds', async () => {
        const res = await chai.request(app)
          .get('/api/admin/monitoring/thresholds')
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data).to.be.an('object');
        expect(res.body.data.dailyCost).to.be.a('number');
      });

      it('PUT /api/admin/monitoring/thresholds - should update monitoring thresholds', async () => {
        const newThresholds = {
          dailyCost: 150,
          errorRate: 5
        };

        const res = await chai.request(app)
          .put('/api/admin/monitoring/thresholds')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newThresholds);
        
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.data.thresholds.dailyCost).to.equal(150);
        expect(res.body.data.thresholds.errorRate).to.equal(5);
      });
    });
  });
});