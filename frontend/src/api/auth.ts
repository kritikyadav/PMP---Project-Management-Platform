import { apiFetch } from './client.js';
import { tokenStore } from '../utils/tokenStore.js';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name?: string;
}

export async function checkSession(): Promise<AuthUser | null> {
  try {
    const data = await apiFetch<{ user: AuthUser; accessToken?: string }>('/auth/me');
    if (data.accessToken) tokenStore.setToken(data.accessToken);
    return data.user;
  } catch (err) {
    return null;
  }
}

export async function credentialsLogin(email: string, password: string): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser; accessToken?: string }>('/auth/credentials', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.accessToken) tokenStore.setToken(data.accessToken);
  return data.user;
}

export async function logout(): Promise<void> {
  tokenStore.clearToken();
  await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
}

/**
 * Request a password reset link for the given email address.
 * Always resolves — backend never reveals whether the email exists.
 */
export async function requestPasswordReset(email: string): Promise<string> {
  const data = await apiFetch<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return data.message;
}

/**
 * Validate a raw reset token against the backend before showing the new password form.
 * Returns false (instead of throwing) so the UI can show a clean "expired" state.
 */
export async function validateResetToken(token: string): Promise<boolean> {
  try {
    const data = await apiFetch<{ valid: boolean }>(
      `/auth/validate-reset-token?token=${encodeURIComponent(token)}`
    );
    return data.valid;
  } catch {
    return false;
  }
}

/**
 * Submit a new password using the raw reset token from the URL query param.
 */
export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const data = await apiFetch<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
  return data.message;
}
