import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl;
const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
const API_URL = (typeof configuredApiUrl === 'string' && configuredApiUrl.trim()
  ? configuredApiUrl.trim()
  : Platform.OS === 'web' ? 'http://localhost:3000'
  : `http://${expoHost || (Platform.OS === 'android' ? '10.0.2.2' : 'localhost')}:3000`).replace(/\/$/, '');
const ACCESS_KEY = 'taskvyn.access-token';
const REFRESH_KEY = 'taskvyn.refresh-token';

type Tokens = { accessToken: string; refreshToken: string; tokenType: string; expiresIn: number };
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function apiBaseUrl() { return API_URL; }

async function get(key: string): Promise<string | null> {
  if (Platform.OS === 'web') { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key); } catch { return null; } }
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}
async function set(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, value); return; } catch { throw new Error('Secure browser session storage is unavailable.'); } }
  await SecureStore.setItemAsync(key, value);
}
async function remove(key: string): Promise<void> {
  if (Platform.OS === 'web') { try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key); return; } catch { return; } }
  await SecureStore.deleteItemAsync(key);
}

export async function saveTokens(tokens: Tokens) {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  await Promise.all([set(ACCESS_KEY, tokens.accessToken), set(REFRESH_KEY, tokens.refreshToken)]);
}

export async function clearTokens() {
  accessToken = refreshToken = null;
  await Promise.all([remove(ACCESS_KEY), remove(REFRESH_KEY)]);
}

async function loadTokens() {
  if (!accessToken) accessToken = await get(ACCESS_KEY);
  if (!refreshToken) refreshToken = await get(REFRESH_KEY);
}

async function rotateTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      await loadTokens();
      if (!refreshToken) return false;
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) { await clearTokens(); return false; }
        await saveTokens(await response.json() as Tokens);
        return true;
      } catch { return false; }
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiError'; }
}

export async function api<T>(path: string, options: RequestInit = {}, authenticated = false): Promise<T> {
  const send = async () => {
    await loadTokens();
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    if (authenticated && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(`${API_URL}${path}`, { ...options, headers });
  };
  let response: Response;
  try {
    response = await send();
  } catch {
    throw new ApiError(`Cannot reach Taskvyn API at ${API_URL}. Set EXPO_PUBLIC_API_URL to the backend address reachable from this device.`, 0);
  }
  if (authenticated && response.status === 401 && await rotateTokens()) response = await send();
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.message === 'string' ? body.message : Array.isArray(body.message) ? body.message.join('\n') : 'Request failed. Please try again.';
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export const authApi = {
  signup: (input: { name: string; email: string; password: string }) => api<{ message: string; email: string }>('/auth/signup', { method: 'POST', body: JSON.stringify(input) }),
  verifyEmail: (input: { email: string; code: string }) => api<Tokens>('/auth/verify-email', { method: 'POST', body: JSON.stringify(input) }),
  resendOtp: (input: { email: string; purpose: 'verification' | 'password-reset' }) => api<{ message: string }>('/auth/resend-otp', { method: 'POST', body: JSON.stringify(input) }),
  signin: (input: { email: string; password: string }) => api<Tokens>('/auth/signin', { method: 'POST', body: JSON.stringify(input) }),
  forgotPassword: (email: string) => api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (input: { email: string; code: string; password: string }) => api<{ message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(input) }),
  me: () => api<{ id: string; name: string; email: string; isEmailVerified: boolean }>('/auth/me', {}, true),
  logout: async () => {
    await loadTokens();
    const token = refreshToken;
    if (token) await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) }).catch(() => undefined);
    await clearTokens();
  },
};
