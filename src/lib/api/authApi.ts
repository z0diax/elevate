import { UserProfile, UserRole } from '../../types';
import { apiRequest, rememberCsrfToken } from './client';
import { normalizeUser } from './normalizers';
import { clearCaches, fetchCurrentSessionUser, loadUsers, sortedUsers, state } from './state';

type CreateUserPayload = Omit<UserProfile, 'id' | 'created_at'> & {
  password: string;
  is_active?: boolean;
  must_change_password?: boolean;
};

export const authApi = {
  async changePassword(currentPassword: string, newPassword: string): Promise<UserProfile> {
    const response = await apiRequest<any>('auth.php?action=change_password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    rememberCsrfToken(response);
    const user = normalizeUser(response);
    state.currentUser = user;
    return user;
  },
  async login(email: string, password: string): Promise<UserProfile> {
    const response = await apiRequest<any>('auth.php?action=login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    rememberCsrfToken(response);
    const user = normalizeUser(response);
    state.currentUser = user;
    return user;
  },

  async registerNominee(fullName: string, email: string, password: string): Promise<UserProfile> {
    const response = await apiRequest<any>('auth.php?action=register_nominee', {
      method: 'POST',
      body: JSON.stringify({ full_name: fullName, email, password }),
    });
    rememberCsrfToken(response);
    const user = normalizeUser(response);
    state.currentUser = user;
    return user;
  },

  async logout(): Promise<void> {
    await apiRequest('auth.php?action=logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    clearCaches();
  },

  async getSessionUser(): Promise<UserProfile | null> {
    return fetchCurrentSessionUser();
  },

  getCurrentUser(): UserProfile | null {
    return state.currentUser;
  },

  getAllUsers(): UserProfile[] {
    return sortedUsers(state.cachedUsers);
  },

  getUsers(): UserProfile[] {
    return sortedUsers(state.cachedUsers);
  },

  async createUser(user: CreateUserPayload): Promise<UserProfile> {
    const createdUser = normalizeUser(await apiRequest<any>('auth.php', {
      method: 'POST',
      body: JSON.stringify(user),
    }));
    await loadUsers();
    return createdUser;
  },

  async updateUserRole(userId: string, newRole: UserRole, officeId?: string, officeName?: string, password?: string): Promise<UserProfile> {
    const updatedUser = normalizeUser(await apiRequest<any>('auth.php', {
      method: 'PUT',
      body: JSON.stringify({
        id: userId,
        role: newRole,
        office_id: officeId || null,
        office_name: officeName || null,
        password: password || undefined,
      }),
    }));
    await loadUsers();
    if (state.currentUser?.id === userId) {
      state.currentUser = updatedUser;
    }
    return updatedUser;
  },

  async deleteUser(userId: string): Promise<void> {
    await apiRequest('auth.php', {
      method: 'DELETE',
      body: JSON.stringify({ id: userId }),
    });
    await loadUsers();
  },
};
