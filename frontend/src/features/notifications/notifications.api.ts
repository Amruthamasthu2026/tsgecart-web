import { apiClient } from '../../lib/apiClient';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export const notificationsApi = {
  async list(): Promise<{ notifications: Notification[]; unread: number }> {
    const { data } = await apiClient.get('/notifications');
    return data.data;
  },
  async markRead(id: string): Promise<void> {
    await apiClient.post(`/notifications/${id}/read`);
  },
  async markAllRead(): Promise<void> {
    await apiClient.post('/notifications/read-all');
  },
};
