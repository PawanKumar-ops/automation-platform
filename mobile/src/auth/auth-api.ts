import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl;
const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
const configuredUrl = typeof configuredApiUrl === 'string' ? configuredApiUrl.trim() : '';
// 10.0.2.2 is only valid inside an Android emulator. Prefer the host that
// Expo is already using so a physical device reaches the same dev machine.
const isEmulatorHost = /^https?:\/\/10\.0\.2\.2(?::3000)?\/?$/i.test(configuredUrl);
const API_URL = (configuredUrl && !(isEmulatorHost && expoHost)
  ? configuredUrl
  // On web, reach the backend on the same host that served the page so a phone
  // browser on the LAN does not try to call its own localhost.
  : Platform.OS === 'web' ? `http://${typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost'}:3000`
  : `http://${expoHost || (Platform.OS === 'android' ? '10.0.2.2' : 'localhost')}:3000`).replace(/\/$/, '');
const ACCESS_KEY = 'taskvyn.access-token';
const REFRESH_KEY = 'taskvyn.refresh-token';
const REQUEST_TIMEOUT_MS = 15_000;

// A fetch to an unreachable host can hang indefinitely on mobile networks,
// which left the sign-in button permanently busy. Always bound requests.
async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); }
}

type Tokens = { accessToken: string; refreshToken: string; tokenType: string; expiresIn: number };
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function apiBaseUrl() { return API_URL; }

async function get(key: string): Promise<string | null> {
  if (Platform.OS === 'web') { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key); } catch { return null; } }
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}
async function set(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); return; } catch { throw new Error('Browser storage is unavailable.'); } }
  await SecureStore.setItemAsync(key, value);
}
async function remove(key: string): Promise<void> {
  if (Platform.OS === 'web') { try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); return; } catch { return; } }
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
        const response = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }),
        });
        // Only a rejected refresh token ends the session; transient errors keep it.
        if (response.status === 401) { await clearTokens(); return false; }
        if (!response.ok) return false;
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
    return fetchWithTimeout(`${API_URL}${path}`, { ...options, headers });
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
  google: (input: { idToken: string }) => api<Tokens>('/auth/google', { method: 'POST', body: JSON.stringify(input) }),
  forgotPassword: (email: string) => api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (input: { email: string; code: string; password: string }) => api<{ message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(input) }),
  me: () => api<{ id: string; name: string; email: string; avatarUrl?: string | null; isEmailVerified: boolean }>('/auth/me', {}, true),
  logout: async () => {
    await loadTokens();
    const token = refreshToken;
    if (token) await fetchWithTimeout(`${API_URL}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) }).catch(() => undefined);
    await clearTokens();
  },
};

export async function hasStoredSession() {
  await loadTokens();
  return Boolean(accessToken || refreshToken);
}

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';
export type ConnectedAccount = {
  id: string;
  provider: string;
  accountEmail: string;
  displayName?: string;
  grantedScopes: string[];
  /** Apps this account has granted every permission for. */
  authorizedApps: string[];
  status: ConnectionStatus;
  accessTokenExpiresAt: string;
  lastValidatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export const connectionsApi = {
  /** Starts OAuth for a provider, requesting permissions for the given apps. */
  beginConnect: (provider: string, apps: string[]) => api<{ authorizationUrl: string; callbackUrl: string; expiresAt: string }>(
    `/connections/${encodeURIComponent(provider)}/connect`, { method: 'POST', body: JSON.stringify({ apps }) }, true,
  ),
  beginGmailConnect: () => connectionsApi.beginConnect('google', ['gmail']),
  list: (filter: { provider?: string; app?: string } = {}) => {
    const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => Boolean(value)) as [string, string][]).toString();
    return api<ConnectedAccount[]>(`/connections${query ? `?${query}` : ''}`, {}, true);
  },
  get: (id: string) => api<ConnectedAccount>(`/connections/${encodeURIComponent(id)}`, {}, true),
  refresh: (id: string) => api<ConnectedAccount>(`/connections/${encodeURIComponent(id)}/refresh`, { method: 'POST' }, true),
  disconnect: (id: string) => api<{ id: string; disconnected: true; providerRevoked: boolean }>(
    `/connections/${encodeURIComponent(id)}`, { method: 'DELETE' }, true,
  ),
};

export type FieldType = 'string' | 'text' | 'email' | 'number' | 'boolean' | 'datetime' | 'select' | 'string[]' | 'json';
export type FieldDefinition = {
  key: string; label: string; type: FieldType; required?: boolean; helpText?: string; placeholder?: string;
  default?: unknown; options?: { label: string; value: string }[]; dynamicOptions?: string;
};
export type OperationDefinition = {
  key: string; name: string; description: string; inputFields: FieldDefinition[]; sample: Record<string, unknown>; type?: 'polling' | 'webhook';
};
export type IntegrationApp = {
  key: string; name: string; description: string; icon: string; category: string;
  auth: { type: 'oauth2'; provider: string; scopes: string[] } | { type: 'none' };
  triggers: OperationDefinition[]; actions: OperationDefinition[];
};

let catalogCache: Promise<IntegrationApp[]> | null = null;

export const integrationsApi = {
  /** Installed apps and what they can do (cached for the session). */
  catalog: () => {
    if (!catalogCache) catalogCache = api<IntegrationApp[]>('/integrations', {}, true).catch((error: unknown) => { catalogCache = null; throw error; });
    return catalogCache;
  },
  options: (app: string, loader: string, connectionId: string | undefined, input: Record<string, unknown>) =>
    api<{ label: string; value: string }[]>(`/integrations/${app}/options/${loader}`, { method: 'POST', body: JSON.stringify({ connectionId, input }) }, true),
  testTrigger: (app: string, trigger: string, connectionId: string | undefined, input: Record<string, unknown>) =>
    api<{ items: { id: string; data: Record<string, unknown> }[]; usedSample: boolean; sample: Record<string, unknown> }>(
      `/integrations/${app}/triggers/${trigger}/test`, { method: 'POST', body: JSON.stringify({ connectionId, input }) }, true),
};

export type WorkflowStepConfig = { id: string; app: string; operation: string; connectionId?: string | null; input: Record<string, unknown> };
export type Workflow = {
  id: string; name: string; status: 'draft' | 'active' | 'paused' | 'error'; statusReason: string | null;
  trigger: WorkflowStepConfig | null; steps: WorkflowStepConfig[]; pollIntervalSeconds: number; lastRunAt: string | null;
  /** Saved editor layout; `nodes` are canvas cards, `steps` per-card settings. */
  canvas: { nodes?: unknown[]; steps?: Record<string, unknown> } | null;
  createdAt: string; updatedAt: string;
  triggerState: { initialized: boolean; lastPolledAt: string | null; lastError: string | null; consecutiveFailures: number };
};
export type WorkflowRun = {
  id: string; status: 'queued' | 'running' | 'succeeded' | 'failed'; manual: boolean; error: string | null; createdAt: string;
  steps: { stepId: string; app: string; operation: string; status: string; error?: string }[];
};
type WorkflowBody = {
  name: string; trigger: WorkflowStepConfig | null; steps: WorkflowStepConfig[]; pollIntervalSeconds?: number;
  canvas?: { nodes: unknown[]; steps: Record<string, unknown> };
};

const clean = (step: WorkflowStepConfig): WorkflowStepConfig => ({
  id: step.id, app: step.app, operation: step.operation, input: step.input, ...(step.connectionId ? { connectionId: step.connectionId } : {}),
});

export const workflowsApi = {
  list: () => api<Workflow[]>('/workflows', {}, true),
  get: (id: string) => api<Workflow>(`/workflows/${encodeURIComponent(id)}`, {}, true),
  create: (body: WorkflowBody) => api<Workflow>('/workflows', { method: 'POST', body: JSON.stringify({ ...body, trigger: body.trigger ? clean(body.trigger) : null, steps: body.steps.map(clean) }) }, true),
  update: (id: string, body: Partial<WorkflowBody>) => api<Workflow>(`/workflows/${id}`, {
    method: 'PATCH', body: JSON.stringify({ ...body, ...(body.trigger ? { trigger: clean(body.trigger) } : {}), ...(body.steps ? { steps: body.steps.map(clean) } : {}) }),
  }, true),
  remove: (id: string) => api<{ id: string; deleted: true }>(`/workflows/${encodeURIComponent(id)}`, { method: 'DELETE' }, true),
  activate: (id: string) => api<Workflow>(`/workflows/${id}/activate`, { method: 'POST' }, true),
  pause: (id: string) => api<Workflow>(`/workflows/${id}/pause`, { method: 'POST' }, true),
  runNow: (id: string) => api<WorkflowRun>(`/workflows/${id}/run`, { method: 'POST' }, true),
  runs: (id: string) => api<WorkflowRun[]>(`/workflows/${id}/runs?limit=10`, {}, true),
};
