const request = require('supertest');
const express = require('express');
const minimaxService = require('../src/services/minimaxService');
const MinimaxTask = require('../src/models/MinimaxTask');
const loggingService = require('../src/services/loggingService');
const { v4: uuidv4 } = require('uuid');

// Mock dependencies
jest.mock('../src/services/quotaService');
jest.mock('../src/services/webhookService');
jest.mock('../src/utils/logger');

describe('Minimax Integration Tests', () => {
  let app;
  let authToken;

  beforeAll(() => {
    // Setup test app
    app = express();
    app.use(express.json());
    
    // Mock auth middleware
    jest.mock('../src/middleware/auth', () => ({
      verifyToken: (req, res, next) => {
        req.user = { id: 'test-user-id' };
        next();
      }
    }));
    
    const aiRoutes = require('../src/routes/ai');
    app.use('/api/v1/ai', aiRoutes);
    
    authToken = 'test-token';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Minimax Configuration', () => {
    test('should have valid configuration', () => {
      const config = require('../src/config/minimax');
      expect(config.config).toBeDefined();
      expect(config.config.models['hailuo-2.3']).toBeDefined();
      expect(config.config.models['hailuo-2.3'].cost.perCall).toBe(0.49);
    });

    test('should calculate model costs correctly', () => {
      const config = require('../src/config/minimax');
      
      // Test perCall cost
      const videoCost = config.getModelCost('hailuo-2.3');
      expect(videoCost).toBe(0.49);
      
      // Test perToken cost
      const tokenCost = config.getModelCost('abab5.5-chat', { tokens: 1000 });
      expect(tokenCost).toBe(0.1); // 1000 * 0.0001
      
      // Test perImage cost
      const imageCost = config.getModelCost('hailuo-img', { images: 2 });
      expect(imageCost).toBe(0.1); // 2 * 0.05
    });
  });

  describe('Minimax Service - Video Generation', () => {
    test('should generate video with text prompt', async () => {
      const mockResponse = {
        data: {
          task_id: 'minimax-task-123'
        }
      };

      // Mock axios post
      const axios = require('axios');
      axios.post = jest.fn().mockResolvedValue(mockResponse);

      const result = await minimaxService.generateVideo({
        prompt: 'A beautiful sunset over mountains',
        model: 'hailuo-2.3',
        userId: 'test-user'
      });

      expect(result).toBeDefined();
      expect(result.taskId).toBeDefined();
      expect(result.minimaxTaskId).toBe('minimax-task-123');
      expect(result.status).toBe('processing');
      expect(result.estimatedTime).toBe(10); // 5 seconds * 2
    });

    test('should validate video parameters', async () => {
      await expect(
        minimaxService.generateVideo({
          prompt: 'Test',
          duration: 15, // Invalid: > 10 seconds
          userId: 'test-user'
        })
      ).rejects.toThrow('Duration must be between 1 and 10 seconds');
    });

    test('should handle video generation errors', async () => {
      const axios = require('axios');
      axios.post = jest.fn().mockRejectedValue(new Error('API Error'));

      await expect(
        minimaxService.generateVideo({
          prompt: 'Test',
          userId: 'test-user'
        })
      ).rejects.toThrow();
    });
  });

  describe('Minimax Service - Status Checking', () => {
    test('should check video status successfully', async () => {
      const mockStatusResponse = {
        data: {
          status: 'completed',
          video_url: 'https://example.com/video.mp4',
          thumbnail_url: 'https://example.com/thumbnail.jpg',
          duration: 5,
          resolution: '1280x720',
          file_size: 1024000
        }
      };

      const axios = require('axios');
      axios.post = jest.fn().mockResolvedValue(mockStatusResponse);

      // First generate a task
      const generateResult = await minimaxService.generateVideo({
        prompt: 'Test video',
        userId: 'test-user'
      });

      // Then check status
      const statusResult = await minimaxService.checkVideoStatus(generateResult.taskId);

      expect(statusResult.status).toBe('completed');
      expect(statusResult.result).toBeDefined();
      expect(statusResult.result.videoUrl).toBe('https://example.com/video.mp4');
    });

    test('should handle failed video generation', async () => {
      const mockStatusResponse = {
        data: {
          status: 'failed',
          error_message: 'Video generation failed due to content policy'
        }
      };

      const axios = require('axios');
      axios.post = jest.fn().mockResolvedValue(mockStatusResponse);

      const generateResult = await minimaxService.generateVideo({
        prompt: 'Test video',
        userId: 'test-user'
      });

      const statusResult = await minimaxService.checkVideoStatus(generateResult.taskId);

      expect(statusResult.status).toBe('failed');
      expect(statusResult.error).toBeDefined();
    });
  });

  describe('Minimax Task Model', () => {
    test('should create a new Minimax task', async () => {
      const taskData = {
        userId: 'test-user-id',
        minimaxTaskId: 'minimax-task-456',
        type: 'video_generation',
        model: 'hailuo-2.3',
        prompt: 'Test prompt',
        parameters: { duration: 5, resolution: '1280x720' }
      };

      // Mock database client
      const db = require('../src/config/database');
      db.getClient = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ data: [taskData], error: null }),
        select: jest.fn().mockResolvedValue({ data: taskData, error: null })
      });

      const task = await MinimaxTask.create(taskData);
      
      expect(task).toBeDefined();
      expect(task.userId).toBe('test-user-id');
      expect(task.minimaxTaskId).toBe('minimax-task-456');
      expect(task.status).toBe('pending');
    });

    test('should update task status', async () => {
      const task = new MinimaxTask({
        id: 'task-123',
        userId: 'test-user',
        status: 'pending'
      });

      // Mock database update
      const db = require('../src/config/database');
      db.getClient = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue({ data: { ...task, status: 'completed' }, error: null }),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({ data: { ...task, status: 'completed' }, error: null })
      });

      const updatedTask = await task.updateStatus('completed', {
        result: { videoUrl: 'https://example.com/video.mp4' }
      });

      expect(updatedTask.status).toBe('completed');
      expect(updatedTask.result).toBeDefined();
    });

    test('should calculate task cost', async () => {
      const task = new MinimaxTask({
        id: 'task-123',
        model: 'hailuo-2.3',
        parameters: {}
      });

      const cost = await task.calculateCost();
      
      expect(cost).toBe(0.49); // Hailuo 2.3 cost per call
      expect(task.cost).toBe(0.49);
      expect(task.costCalculated).toBe(true);
    });
  });

  describe('Logging Service', () => {
    test('should log Minimax video generation', () => {
      const logSpy = jest.spyOn(loggingService, 'writeLog');
      
      loggingService.logMinimaxVideoGeneration({
        userId: 'test-user',
        model: 'hailuo-2.3',
        prompt: 'A beautiful sunset',
        duration: 5,
        hasImage: false,
        taskId: 'task-123'
      });

      expect(logSpy).toHaveBeenCalledWith('minimax_video', expect.objectContaining({
        type: 'minimax_video_generation',
        userId: 'test-user',
        model: 'hailuo-2.3',
        duration: 5
      }));
    });

    test('should sanitize sensitive data from logs', () => {
      const payload = {
        prompt: 'Test prompt',
        api_key: 'secret-key-123',
        password: 'secret-password',
        authorization: 'Bearer secret-token'
      };

      const sanitized = loggingService.sanitizePayload(payload);
      
      expect(sanitized.api_key).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.prompt).toBe('Test prompt'); // Non-sensitive data preserved
    });
  });

  describe('API Routes', () => {
    test('POST /api/v1/ai/minimax/video should generate video', async () => {
      const mockVideoResult = {
        taskId: 'task-123',
        minimaxTaskId: 'minimax-task-456',
        status: 'processing',
        estimatedTime: 10,
        statusUrl: '/api/v1/ai/minimax/status/task-123',
        resultUrl: '/api/v1/ai/minimax/result/task-123'
      };

      jest.spyOn(minimaxService, 'generateVideo').mockResolvedValue(mockVideoResult);

      const response = await request(app)
        .post('/api/v1/ai/minimax/video')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          prompt: 'A beautiful sunset over mountains',
          model: 'hailuo-2.3',
          duration: 5
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.taskId).toBe('task-123');
      expect(response.body.data.status).toBe('processing');
    });

    test('GET /api/v1/ai/minimax/status/:taskId should return status', async () => {
      const mockStatus = {
        taskId: 'task-123',
        status: 'processing',
        minimaxTaskId: 'minimax-task-456',
        progress: 50
      };

      jest.spyOn(minimaxService, 'checkVideoStatus').mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/v1/ai/minimax/status/task-123')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('processing');
    });

    test('GET /api/v1/ai/minimax/models should return available models', async () => {
      const mockModels = [
        {
          id: 'hailuo-2.3',
          name: 'Hailuo 2.3',
          type: 'video',
          cost: { perCall: 0.49 }
        },
        {
          id: 'abab5.5-chat',
          name: 'Abab5.5 Chat',
          type: 'chat',
          cost: { perToken: 0.0001 }
        }
      ];

      jest.spyOn(minimaxService, 'listModels').mockReturnValue(mockModels);

      const response = await request(app)
        .get('/api/v1/ai/minimax/models');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].id).toBe('hailuo-2.3');
    });

    test('should validate video generation parameters', async () => {
      const response = await request(app)
        .post('/api/v1/ai/minimax/video')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          prompt: '', // Empty prompt should fail
          duration: 15 // Invalid duration should fail
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle Minimax API errors gracefully', async () => {
      const axios = require('axios');
      axios.post = jest.fn().mockRejectedValue({
        response: {
          status: 429,
          data: { base_resp: { status_msg: 'Rate limit exceeded' } }
        }
      });

      await expect(
        minimaxService.generateVideo({
          prompt: 'Test',
          userId: 'test-user'
        })
      ).rejects.toThrow('Minimax rate limit exceeded');
    });

    test('should handle network errors with retry', async () => {
      const axios = require('axios');
      let attemptCount = 0;
      
      axios.post = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject({ request: {} }); // Network error
        }
        return Promise.resolve({
          data: { task_id: 'minimax-task-789' }
        });
      });

      const result = await minimaxService.generateVideo({
        prompt: 'Test',
        userId: 'test-user'
      });

      expect(result.minimaxTaskId).toBe('minimax-task-789');
      expect(attemptCount).toBe(3); // 2 failures + 1 success
    });
  });

  describe('Cost Calculation', () => {
    test('should track costs accurately', async () => {
      const tasks = [
        { model: 'hailuo-2.3', type: 'video_generation' },
        { model: 'abab5.5-chat', type: 'chat', tokens: 1500 },
        { model: 'hailuo-img', type: 'image', images: 3 }
      ];

      let totalCost = 0;

      tasks.forEach(task => {
        const config = require('../src/config/minimax');
        const cost = config.getModelCost(task.model, {
          tokens: task.tokens,
          images: task.images
        });
        totalCost += cost;
      });

      expect(totalCost).toBeCloseTo(0.49 + 0.15 + 0.15, 2); // 0.49 + (1500 * 0.0001) + (3 * 0.05)
    });
  });

  describe('Performance Metrics', () => {
    test('should log performance metrics', () => {
      const logSpy = jest.spyOn(loggingService, 'writeLog');
      
      loggingService.logPerformanceMetrics('minimax', 'video_generation', {
        duration: 5000,
        tokensProcessed: 1000,
        success: true
      });

      expect(logSpy).toHaveBeenCalledWith('performance', expect.objectContaining({
        type: 'performance_metrics',
        service: 'minimax',
        operation: 'video_generation',
        duration: 5000,
        tokensProcessed: 1000,
        throughput: 200 // 1000 tokens / 5 seconds
      }));
    });
  });
});

describe('Integration Scenarios', () => {
  test('complete video generation workflow', async () => {
    // Step 1: Generate video
    const generateResult = await minimaxService.generateVideo({
      prompt: 'A cat playing with a ball of yarn',
      duration: 3,
      userId: 'test-user'
    });

    expect(generateResult.taskId).toBeDefined();
    expect(generateResult.status).toBe('processing');

    // Step 2: Check status multiple times (simulating polling)
    const axios = require('axios');
    
    // First status check: still processing
    axios.post = jest.fn().mockResolvedValue({
      data: { status: 'processing', progress: 50 }
    });

    let status = await minimaxService.checkVideoStatus(generateResult.taskId);
    expect(status.status).toBe('processing');
    expect(status.progress).toBe(50);

    // Second status check: completed
    axios.post = jest.fn().mockResolvedValue({
      data: {
        status: 'completed',
        video_url: 'https://cdn.minimax.ai/videos/cat_yarn.mp4',
        thumbnail_url: 'https://cdn.minimax.ai/thumbnails/cat_yarn.jpg',
        duration: 3,
        resolution: '1280x720',
        file_size: 2048000
      }
    });

    status = await minimaxService.checkVideoStatus(generateResult.taskId);
    expect(status.status).toBe('completed');
    expect(status.result.videoUrl).toBeDefined();

    // Step 3: Get final result
    const finalResult = await minimaxService.getVideoResult(generateResult.taskId);
    expect(finalResult.status).toBe('completed');
    expect(finalResult.result.duration).toBe(3);
  });

  test('image-to-video conversion workflow', async () => {
    const fs = require('fs').promises;
    
    // Mock image file
    jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('fake-image-data'));

    const result = await minimaxService.generateVideo({
      prompt: 'Make this image come to life',
      imagePath: '/path/to/image.jpg',
      userId: 'test-user'
    });

    expect(result.taskId).toBeDefined();
    expect(result.minimaxTaskId).toBeDefined();
  });
});