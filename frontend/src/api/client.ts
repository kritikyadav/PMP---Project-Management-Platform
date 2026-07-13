import { tokenStore } from '../utils/tokenStore.js';

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:4000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let isRefreshing = false;
let refreshSubscribers: ((token: boolean) => void)[] = [];

function subscribeTokenRefresh(cb: (token: boolean) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(success: boolean) {
  refreshSubscribers.forEach(cb => cb(success));
  refreshSubscribers = [];
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const runFetch = async () => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/credentials' && path !== '/auth/me') {
      return null; // Signals we need a refresh
    }
    
    if (res.status === 401) {
      // For /auth/me, /auth/credentials, /auth/refresh: just return the error
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
    }
    
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  };

  let result = await runFetch();
  if (result === null) {
    // Attempt refresh
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (refreshRes.ok) {
          const body = await refreshRes.json().catch(() => ({})) as { accessToken?: string };
          if (body.accessToken) {
            tokenStore.setToken(body.accessToken);
          }
          onRefreshed(true);
        } else {
          onRefreshed(false);
          window.location.href = '/login';
        }
      } catch (err) {
        onRefreshed(false);
        window.location.href = '/login';
      } finally {
        isRefreshing = false;
      }
    }
    
    // Wait for refresh to complete
    const refreshSuccess = await new Promise<boolean>(resolve => {
      subscribeTokenRefresh(resolve);
    });
    
    if (refreshSuccess) {
      result = await runFetch();
      if (result === null) throw new ApiError(401, 'Session expired');
    } else {
      throw new ApiError(401, 'Session expired');
    }
  }
  
  return result;
}

export async function apiFetchBlob(path: string, options?: RequestInit): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...options?.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      // Basic refresh handler for blobs, simpler than the full interceptor for now
      window.location.href = '/login';
    }
    throw new ApiError(res.status, `HTTP ${res.status}`);
  }
  return res.blob();
}
