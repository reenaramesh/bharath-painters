export type Tokens = { access: string; refresh: string };
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export class ApiClient {
  tokens: Tokens | null = null;
  private generation = 0;
  private refreshing: Promise<void> | null = null;
  private base: string;
  private transport: typeof fetch;
  onTokens: (tokens: Tokens | null) => Promise<void> = async () => {};
  onExpired: () => void = () => {};
  constructor(base: string, transport: typeof fetch = (input, init) => fetch(input, init)) {
    this.base = base.replace(/\/+$/, ''); this.transport = transport;
  }
  setTokens(tokens: Tokens | null) { this.generation++; this.tokens = tokens; this.refreshing = null; }
  private url(path: string) {
    if (!/^\/[a-zA-Z0-9/_-]*\/?$/.test(path) || path.startsWith('//')) throw new Error('Invalid API path');
    if (!this.base) throw new Error('Configure EXPO_PUBLIC_API_URL to sign in.');
    const url = new URL(this.base);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(url.hostname))) throw new Error('Use HTTPS for the API URL.');
    return this.base + path;
  }
  private async send(path: string, init: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try { return await this.transport(this.url(path), { ...init, signal: controller.signal, redirect: 'error' }); }
    catch (error) { if (error instanceof Error && /Configure|HTTPS|Invalid API/.test(error.message)) throw error; throw new ApiError(0, 'Could not connect. Check your internet connection and try again.'); }
    finally { clearTimeout(timer); }
  }
  private async refresh() {
    if (!this.refreshing) {
      const version = this.generation, saved = this.tokens;
      const pending = (async () => {
        if (!saved) throw new ApiError(401, 'Sign in to continue.');
        const response = await this.send('/accounts/token/refresh/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: saved.refresh }) });
        if (version !== this.generation) throw new ApiError(401, 'Session changed.');
        if (!response.ok) {
          if (response.status === 401 || response.status === 400) { this.setTokens(null); this.onExpired(); await this.onTokens(null); }
          throw new ApiError(response.status, 'Please sign in again.');
        }
        const result = await response.json() as { access?: string; refresh?: string };
        if (!result.access) throw new ApiError(401, 'Please sign in again.');
        if (version !== this.generation) throw new ApiError(401, 'Session changed.');
        this.tokens = { access: result.access, refresh: result.refresh || saved.refresh };
        await this.onTokens(this.tokens);
      })();
      this.refreshing = pending;
      try { await pending; } finally { if (this.refreshing === pending) this.refreshing = null; }
    } else { await this.refreshing; }
  }
  async request<T>(path: string, body?: unknown, authenticated = true): Promise<T> {
    this.url(path);
    const version = this.generation;
    const token = this.tokens?.access;
    const execute = () => this.send(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated && this.tokens ? { Authorization: `Bearer ${this.tokens.access}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    let response = await execute();
    if (authenticated && response.status === 401 && this.tokens && version === this.generation) {
      if (this.tokens.access === token) await this.refresh();
      if (version !== this.generation) throw new ApiError(401, 'Session changed.');
      response = await execute();
    }
    if (authenticated && version !== this.generation) throw new ApiError(401, 'Session changed.');
    if (!response.ok) {
      if (authenticated && response.status === 401) { this.setTokens(null); this.onExpired(); await this.onTokens(null); }
      throw new ApiError(response.status, response.status === 403 ? 'This account does not have access to this feature.' : response.status === 401 ? 'Check your login details and try again.' : response.status === 429 ? 'Too many attempts. Please wait and try again.' : 'Could not load this information. Please try again.');
    }
    return await response.json() as T;
  }
  get<T>(path: string) { return this.request<T>(path); }
}
