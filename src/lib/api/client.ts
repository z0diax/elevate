import { getDefaultXamppApiUrl } from '../mysqlService';

type ApiEnvelope<T> = {
  status: 'success' | 'error';
  message: string;
  data: T;
  timestamp: string;
};

const API_BASE = getDefaultXamppApiUrl().replace(/\/$/, '');
let csrfToken: string | null = null;
let unauthorizedHandler: () => void = () => {};

export function rememberCsrfToken(user: any): void {
  csrfToken = typeof user?.csrf_token === 'string' && user.csrf_token ? user.csrf_token : null;
}

export function clearCsrfToken(): void {
  csrfToken = null;
}

export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

export async function apiRequest<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (!(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetch(`${API_BASE}/${endpoint}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    if (response.status === 204) {
      return undefined as T;
    }
    throw new Error('The server returned an unexpected response. Please try again.');
  }

  if (!payload || typeof payload !== 'object' || (payload.status !== 'success' && payload.status !== 'error')) {
    throw new Error('The server returned an unexpected response. Please try again.');
  }

  if (!response.ok || payload.status === 'error') {
    if (response.status === 401) {
      unauthorizedHandler();
    }
    if (response.status >= 500) {
      throw new Error('The server could not complete the request. Please try again.');
    }
    throw new Error(typeof payload.message === 'string' && payload.message
      ? payload.message
      : 'The request could not be completed.');
  }

  return payload.data;
}

