import { useState, useCallback } from 'react';
import { 
  minimaxService, 
  MinimaxVideoRequest, 
  MinimaxVideoResponse, 
  MinimaxTask,
  MinimaxModelsResponse 
} from '../services/minimax';
import { ApiResponse } from '../services/api';

export interface UseMinimaxOptions {
  onVideoGenerated?: (response: MinimaxVideoResponse) => void;
  onStatusUpdated?: (task: MinimaxTask) => void;
  onError?: (error: string) => void;
}

export const useMinimax = (options: UseMinimaxOptions = {}) => {
  const [currentTask, setCurrentTask] = useState<MinimaxTask | null>(null);
  const [tasks, setTasks] = useState<MinimaxTask[]>([]);
  const [models, setModels] = useState<MinimaxModelsResponse['models']>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<boolean>(false);

  const generateVideo = useCallback(async (request: MinimaxVideoRequest): Promise<ApiResponse<MinimaxVideoResponse>> => {
    setGenerating(true);
    setError(null);
    
    try {
      const response = await minimaxService.generateVideo(request);
      
      if (response.success && response.data) {
        setCurrentTask({
          id: response.data.taskId,
          userId: '',
          prompt: request.prompt,
          model: request.model || 'hailuo-2.3',
          resolution: request.resolution || '1280x720',
          duration: request.duration || 5,
          status: response.data.status,
          progress: response.data.progress || 0,
          videoUrl: response.data.videoUrl,
          error: response.data.error,
          cost: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        options.onVideoGenerated?.(response.data);
      } else {
        setError(response.message || 'Video generation failed');
        options.onError?.(response.message || 'Video generation failed');
      }
      
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      options.onError?.(errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        message: errorMessage
      };
    } finally {
      setGenerating(false);
    }
  }, [options]);

  const checkTaskStatus = useCallback(async (taskId: string): Promise<ApiResponse<MinimaxTask>> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await minimaxService.getTaskStatus(taskId);
      
      if (response.success && response.data) {
        setCurrentTask(response.data);
        options.onStatusUpdated?.(response.data);
      } else {
        setError(response.message || 'Failed to get task status');
        options.onError?.(response.message || 'Failed to get task status');
      }
      
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      options.onError?.(errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        message: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, [options]);

  const loadUserTasks = useCallback(async (limit: number = 10, offset: number = 0): Promise<ApiResponse<{ tasks: MinimaxTask[]; total: number }>> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await minimaxService.getUserTasks(limit, offset);
      
      if (response.success && response.data) {
        setTasks(response.data.tasks);
      } else {
        setError(response.message || 'Failed to load tasks');
        options.onError?.(response.message || 'Failed to load tasks');
      }
      
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      options.onError?.(errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        message: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, [options]);

  const loadAvailableModels = useCallback(async (): Promise<ApiResponse<MinimaxModelsResponse>> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await minimaxService.getAvailableModels();
      
      if (response.success && response.data) {
        setModels(response.data.models);
      } else {
        setError(response.message || 'Failed to load models');
        options.onError?.(response.message || 'Failed to load models');
      }
      
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      options.onError?.(errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        message: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, [options]);

  const cancelTask = useCallback(async (taskId: string): Promise<ApiResponse<void>> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await minimaxService.cancelTask(taskId);
      
      if (!response.success) {
        setError(response.message || 'Failed to cancel task');
        options.onError?.(response.message || 'Failed to cancel task');
      }
      
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      options.onError?.(errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        message: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, [options]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearCurrentTask = useCallback(() => {
    setCurrentTask(null);
  }, []);

  return {
    currentTask,
    tasks,
    models,
    loading,
    error,
    generating,
    generateVideo,
    checkTaskStatus,
    loadUserTasks,
    loadAvailableModels,
    cancelTask,
    clearError,
    clearCurrentTask,
  };
};

export default useMinimax;