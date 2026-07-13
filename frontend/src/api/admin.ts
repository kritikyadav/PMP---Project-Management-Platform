import { apiFetch } from './client.js';

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
}

export interface ProjectRow {
  id: string;
  name: string;
  client_name: string;
  assigned_pm_id: string | null;
  pm_name: string | null;
  pm_email: string | null;
  status: string;
}

export const adminApi = {
  listUsers: (role?: string) =>
    apiFetch<UserRow[]>(`/admin/users${role ? `?role=${role}` : ''}`),

  createUser: (data: { email: string; name?: string; role: string; password: string }) =>
    apiFetch<UserRow>('/admin/users', { method: 'POST', body: JSON.stringify(data) }),

  changeRole: (id: string, role: string) =>
    apiFetch<{ success: boolean }>(`/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  deactivateUser: (id: string) =>
    apiFetch<{ success: boolean }>(`/admin/users/${id}/deactivate`, { method: 'PATCH' }),

  activateUser: (id: string) =>
    apiFetch<{ success: boolean }>(`/admin/users/${id}/activate`, { method: 'PATCH' }),

  listProjects: () =>
    apiFetch<ProjectRow[]>('/admin/projects'),

  createProject: (data: { name: string; client_name: string; assigned_pm_id?: string }) =>
    apiFetch<ProjectRow>('/admin/projects', { method: 'POST', body: JSON.stringify(data) }),

  assignPM: (projectId: string, pm_id: string) =>
    apiFetch<{ success: boolean }>(`/admin/projects/${projectId}/assign-pm`, {
      method: 'PATCH',
      body: JSON.stringify({ pm_id }),
    }),

  archiveProject: (id: string) =>
    apiFetch<{ success: boolean }>(`/admin/projects/${id}/archive`, { method: 'PATCH' }),

  unarchiveProject: (id: string) =>
    apiFetch<{ success: boolean }>(`/admin/projects/${id}/unarchive`, { method: 'PATCH' }),
};
