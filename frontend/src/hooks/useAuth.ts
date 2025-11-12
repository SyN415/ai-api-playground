import { useState, useEffect, useCallback } from 'react';
import { authService, User, LoginCredentials, RegisterCredentials } from '../services/auth';
import { ApiResponse } from '../services/api';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  const loadUser = useCallback(async () => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const response = await authService.getCurrentUser();
      if (response.success && response.data) {
        setAuthState({
          user: response.data,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        setAuthState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: response.message || 'Failed to load user',
        });
      }
    } catch (error) {
      setAuthState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: 'Failed to load user',
      });
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (credentials: LoginCredentials): Promise<ApiResponse<any>> => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const response = await authService.login(credentials);
      if (response.success && response.data) {
        setAuthState({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: response.message || 'Login failed',
        }));
      }
      return response;
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Login failed',
      }));
      return {
        success: false,
        error: 'Login failed',
        message: 'An error occurred during login',
      };
    }
  };

  const register = async (credentials: RegisterCredentials): Promise<ApiResponse<any>> => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const response = await authService.register(credentials);
      if (response.success && response.data) {
        setAuthState({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: response.message || 'Registration failed',
        }));
      }
      return response;
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Registration failed',
      }));
      return {
        success: false,
        error: 'Registration failed',
        message: 'An error occurred during registration',
      };
    }
  };

  const logout = async (): Promise<void> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    
    try {
      await authService.logout();
    } finally {
      setAuthState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  };

  const updateProfile = async (data: Partial<User>): Promise<ApiResponse<User>> => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const response = await authService.updateProfile(data);
      if (response.success && response.data) {
        setAuthState(prev => ({
          ...prev,
          user: response.data || null,
          isLoading: false,
          error: null,
        }));
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: response.message || 'Profile update failed',
        }));
      }
      return response;
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Profile update failed',
      }));
      return {
        success: false,
        error: 'Profile update failed',
        message: 'An error occurred',
      };
    }
  };

  const changePassword = async (oldPassword: string, newPassword: string): Promise<ApiResponse<void>> => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const response = await authService.changePassword(oldPassword, newPassword);
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: response.success ? null : (response.message || 'Password change failed'),
      }));
      return response;
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Password change failed',
      }));
      return {
        success: false,
        error: 'Password change failed',
        message: 'An error occurred',
      };
    }
  };

  const clearError = (): void => {
    setAuthState(prev => ({ ...prev, error: null }));
  };

  return {
    ...authState,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    clearError,
    refreshUser: loadUser,
  };
};

export default useAuth;