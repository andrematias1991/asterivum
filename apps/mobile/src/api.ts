import * as SecureStore from 'expo-secure-store';
import type { AuthResponse, Language } from './types';

const SESSION_KEY = 'asterivum.native-session.v1';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://api.asterivum.com/api').replace(/\/$/, '');

let cachedToken: string | null | undefined;

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function getSessionToken() {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = await SecureStore.getItemAsync(SESSION_KEY);
  return cachedToken;
}

export async function setSessionToken(token: string | null) {
  cachedToken = token;
  if (token) await SecureStore.setItemAsync(SESSION_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}

type RequestOptions = RequestInit & { language?: Language; authenticated?: boolean };

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { language = 'en', authenticated = false, headers, ...request } = options;
  const token = authenticated ? await getSessionToken() : null;
  const response = await fetch(`${API_URL}${path}`, {
    ...request,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Client-Platform': 'mobile',
      'X-App-Language': language,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (response.status === 401 && authenticated) await setSessionToken(null);
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error || `Request failed (${response.status})`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function authenticate(kind: 'login' | 'register', input: { email: string; password: string; name?: string }) {
  const result = await api<AuthResponse>(`/auth/${kind}`, { method: 'POST', body: JSON.stringify(input) });
  await setSessionToken(result.sessionToken);
  return result.user;
}

