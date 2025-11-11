import { apiService, ApiResponse } from './api';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  apiKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

class AuthService {
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await apiService.post<ApiResponse<AuthResponse>>('/auth/login', credentials);
      if (response.data.success && response.data.data?.token) {
        apiService.setToken(response.data.data.token);
      }
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed',
        message: error.response?.data?.message || 'An error occurred during login'
      };
    }
  }

  async register(credentials: RegisterCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await apiService.post<ApiResponse<AuthResponse>>('/auth/register', credentials);
      if (response.data.success && response.data.data?.token) {
        apiService.setToken(response.data.data.token);
      }
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Registration failed',
        message: error.response?.data?.message || 'An error occurred during registration'
      };
    }
  }

  async logout(): Promise<void> {
    try {
      await apiService.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      apiService.removeToken();
    }
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    try {
      const response = await apiService.get<ApiResponse<User>>('/auth/me');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get user',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    try {
      const response = await apiService.put<ApiResponse<User>>('/auth/profile', data);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Profile update failed',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    try {
      const response = await apiService.post<ApiResponse<void>>('/auth/change-password', {
        oldPassword,
        newPassword
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Password change failed',
        message: error.response?.data?.message || 'An error occurred'
      };
    }
  }

  isAuthenticated(): boolean {
    return !!apiService.getToken();
  }
}

export const authService = new AuthService();
export default authService;