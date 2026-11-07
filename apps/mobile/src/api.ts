/** Small transport with a bounded request and no automatic mutation replay. */
export class RequestError extends Error {
  constructor(message: string, public status = 0, public code = 'NETWORK_ERROR') {
    super(message); this.name = 'RequestError';
  }
}
export function normalizeApiUrl(value: string | undefined, webOrigin?: string): string | null {
  if (value === 'same-origin') return webOrigin ? normalizeApiUrl(`${webOrigin}/api`) : null;
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}
export function createApiClient(baseUrl: string | null, fetcher: typeof fetch = fetch, timeoutMs = 15000) {
  return async function request<T>(path: string, token?: string | null, body?: unknown, method?: 'POST' | 'PATCH'): Promise<T> {
    if (!baseUrl) throw new RequestError('Set EXPO_PUBLIC_API_URL to a reachable API URL, including /api, then restart Expo.', 0, 'CONFIG_REQUIRED');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${baseUrl}${path}`, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      let data: any;
      try { data = await response.json(); }
      catch { throw new RequestError('The API returned an unreadable response. Refresh before retrying.', response.status, 'INVALID_RESPONSE'); }
      if (!response.ok) throw new RequestError(data.error || 'The request could not be completed.', response.status, data.code || 'API_ERROR');
      return data as T;
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError(controller.signal.aborted
        ? 'The API did not respond in time. A submitted change may have reached the server; refresh before retrying.'
        : 'Could not reach the API. A submitted change may have reached the server; refresh before retrying.');
    } finally { clearTimeout(timer); }
  };
}

export function conflictMessage(error: RequestError): string {
  return ['STALE_VERSION', 'STALE_PLAN', 'CONSTRAINT_CHANGED', 'PLAN_EXPIRED'].includes(error.code)
    ? 'This workspace or proposal changed. The latest data is now loaded; review it before trying again. Nothing was automatically replayed.'
    : error.message;
}
