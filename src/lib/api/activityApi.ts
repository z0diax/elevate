import { ApplicationHistory, InAppNotification, UserRole } from '../../types';
import { apiRequest } from './client';
import { normalizeNotification } from './normalizers';
import { loadNotifications, state } from './state';

export const activityApi = {
  getAuditLogs(): ApplicationHistory[] {
    return [...state.cachedAuditLogs];
  },

  getAllAuditLogs(): ApplicationHistory[] {
    return [...state.cachedAuditLogs];
  },

  getAuditLogsForApplication(appId: string): ApplicationHistory[] {
    return state.cachedAuditLogs.filter(log => log.application_id === appId);
  },

  getNotifications(): InAppNotification[] {
    return [...state.cachedNotifications];
  },

  async getNotificationsForUser(userId: string, role: UserRole): Promise<InAppNotification[]> {
    const notifications = await apiRequest<any[]>(`notifications.php?${new URLSearchParams({ user_id: userId, role }).toString()}`);
    state.cachedNotifications = notifications.map(normalizeNotification);
    return state.cachedNotifications;
  },

  async markNotificationAsRead(id: string): Promise<void> {
    await apiRequest('notifications.php', {
      method: 'PUT',
      body: JSON.stringify({ id }),
    });
    if (state.currentUser) {
      await loadNotifications(state.currentUser);
    }
  },

  async markNotificationRead(id: string): Promise<void> {
    await this.markNotificationAsRead(id);
  },

  async markAllNotificationsAsRead(): Promise<void> {
    await apiRequest('notifications.php', {
      method: 'PUT',
      body: JSON.stringify({ mark_all_read: true }),
    });
    if (state.currentUser) {
      await loadNotifications(state.currentUser);
    }
  },

  async markAllNotificationsRead(): Promise<void> {
    await this.markAllNotificationsAsRead();
  },
};
