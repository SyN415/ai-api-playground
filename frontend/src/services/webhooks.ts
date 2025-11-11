import { apiService, ApiResponse } from './api';

export interface Webhook {
  id: string;
  userId: string;
  url: string;
  events: string[];
  secret?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookData {
  url: string;
  events: string[];
  secret?: string;
}

export interface UpdateWebhookData {
  url?: string;
  events?: string[];
  secret?: string;
  isActive?: boolean;
}

export interface WebhookEvent {
  id: string;
  webhookId: string;
  event: string;
  payload: any;
  status: string;
  response: any;
  createdAt: string;
}

class WebhookService {
  async getWebhooks(): Promise<ApiResponse<Webhook[]>> {
    try {
      const response = await apiService.get<ApiResponse<Webhook[]>>('/webhooks');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get webhooks',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async getWebhook(id: string): Promise<ApiResponse<Webhook>> {
    try {
      const response = await apiService.get<ApiResponse<Webhook>>(`/webhooks/${id}`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get webhook',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async createWebhook(data: CreateWebhookData): Promise<ApiResponse<Webhook>> {
    try {
      const response = await apiService.post<ApiResponse<Webhook>>('/webhooks', data);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to create webhook',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async updateWebhook(id: string, data: UpdateWebhookData): Promise<ApiResponse<Webhook>> {
    try {
      const response = await apiService.put<ApiResponse<Webhook>>(`/webhooks/${id}`, data);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to update webhook',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async deleteWebhook(id: string): Promise<ApiResponse<void>> {
    try {
      const response = await apiService.delete<ApiResponse<void>>(`/webhooks/${id}`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to delete webhook',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async testWebhook(id: string): Promise<ApiResponse<void>> {
    try {
      const response = await apiService.post<ApiResponse<void>>(`/webhooks/${id}/test`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to test webhook',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async getWebhookEvents(webhookId: string, limit: number = 50): Promise<ApiResponse<{ events: WebhookEvent[]; total: number }>> {
    try {
      const response = await apiService.get<ApiResponse<{ events: WebhookEvent[]; total: number }>>(
        `/webhooks/${webhookId}/events?limit=${limit}`
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get webhook events',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async getAvailableEvents(): Promise<ApiResponse<string[]>> {
    try {
      const response = await apiService.get<ApiResponse<string[]>>('/webhooks/events');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get available events',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }
}

export const webhookService = new WebhookService();
export default webhookService;