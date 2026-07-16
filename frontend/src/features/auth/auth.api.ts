import { apiClient } from '../../lib/apiClient';
import type { AuthResponse, AuthUser } from './auth.types';

export interface RegisterPayload {
  name: string;
  email: string;
  phone?: string;
  password: string;
  referralCode?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export const authApi = {
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const { data } = await apiClient.post('/auth/register', payload);
    return data.data;
  },

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const { data } = await apiClient.post('/auth/login', payload);
    return data.data;
  },

  async refresh(): Promise<AuthResponse> {
    const { data } = await apiClient.post('/auth/refresh', {});
    return data.data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout', {});
  },

  async me(): Promise<AuthUser> {
    const { data } = await apiClient.get('/auth/me');
    return data.data.user;
  },

  async verifyEmail(token: string): Promise<void> {
    await apiClient.post('/auth/verify-email', { token });
  },

  async forgotPassword(email: string): Promise<void> {
    await apiClient.post('/auth/forgot-password', { email });
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await apiClient.post('/auth/reset-password', { token, password });
  },
};
