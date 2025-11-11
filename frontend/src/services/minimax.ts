import { apiService, ApiResponse } from './api';

export interface MinimaxVideoRequest {
  prompt: string;
  model?: string;
  resolution?: string;
  duration?: number;
  webhookUrl?: string;
}

export interface MinimaxVideoResponse {
  taskId: string;
  status: string;
  videoUrl?: string;
  progress?: number;
  error?: string;
}

export interface MinimaxTask {
  id: string;
  userId: string;
  prompt: string;
  model: string;
  resolution: string;
  duration: number;
  status: string;
  progress: number;
  videoUrl?: string;
  error?: string;
  cost: number;
  createdAt: string;
  updatedAt: string;
}

export interface MinimaxModelsResponse {
  models: Array<{
    id: string;
    name: string;
    description: string;
    supportedResolutions: string[];
    maxDuration: number;
    costPerSecond: number;
  }>;
}

class MinimaxService {
  async generateVideo(request: MinimaxVideoRequest): Promise<ApiResponse<MinimaxVideoResponse>> {
    try {
      const response = await apiService.post<ApiResponse<MinimaxVideoResponse>>('/ai/minimax/video', request);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Video generation failed',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async getTaskStatus(taskId: string): Promise<ApiResponse<MinimaxTask>> {
    try {
      const response = await apiService.get<ApiResponse<MinimaxTask>>(`/ai/minimax/tasks/${taskId}`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get task status',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async getUserTasks(limit: number = 10, offset: number = 0): Promise<ApiResponse<{ tasks: MinimaxTask[]; total: number }>> {
    try {
      const response = await apiService.get<ApiResponse<{ tasks: MinimaxTask[]; total: number }>>(
        `/ai/minimax/tasks?limit=${limit}&offset=${offset}`
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get tasks',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async getAvailableModels(): Promise<ApiResponse<MinimaxModelsResponse>> {
    try {
      const response = await apiService.get<ApiResponse<MinimaxModelsResponse>>('/ai/minimax/models');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get models',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async cancelTask(taskId: string): Promise<ApiResponse<void>> {
    try {
      const response = await apiService.post<ApiResponse<void>>(`/ai/minimax/tasks/${taskId}/cancel`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to cancel task',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }
}

export const minimaxService = new MinimaxService();
export default minimaxService;