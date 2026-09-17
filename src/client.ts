/**
 * Thin HTTP client for the Alternatives Partner API v3 (https://api.altdmp.io/v3).
 *
 * Handles the API-key -> bearer-token exchange, caches the token until it is
 * close to expiry, and exposes helpers for the list/detail endpoints.
 */

export interface AltDmpClientOptions {
  apiKey: string;
  /** Base URL without a trailing slash, e.g. https://api.altdmp.io/v3 */
  baseUrl?: string;
}

interface TokenResponse {
  access_token: string;
  token_duration: number; // minutes
  expires_at: string; // ISO 8601
}

export interface ListParams {
  limit?: number;
  offset?: number;
  search?: string;
  ordering?: string;
  /** Filter tree passed in the POST body (all / any / not). */
  filters?: Record<string, unknown>;
}

const DEFAULT_BASE_URL = "https://api.altdmp.io/v3";

/** Refresh the token this many milliseconds before it actually expires. */
const TOKEN_REFRESH_SKEW_MS = 60_000;

export class AltDmpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "AltDmpError";
  }
}

export class AltDmpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private token: string | null = null;
  private tokenExpiresAt = 0; // epoch ms
  private tokenRefresh: Promise<string> | null = null;

  constructor(options: AltDmpClientOptions) {
    if (!options.apiKey) {
      throw new Error("ALTDMP_API_KEY is required");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  /** Exchange the API key for a bearer token, reusing a cached one when valid. */
  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
      return this.token;
    }
    // Collapse concurrent refreshes into a single request.
    if (!this.tokenRefresh) {
      this.tokenRefresh = this.issueToken().finally(() => {
        this.tokenRefresh = null;
      });
    }
    return this.tokenRefresh;
  }

  private async issueToken(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/token/issue/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: this.apiKey }),
    });
    if (!res.ok) {
      const body = await safeBody(res);
      throw new AltDmpError(
        `Token issue failed (${res.status})`,
        res.status,
        body,
      );
    }
    const data = (await res.json()) as TokenResponse;
    this.token = data.access_token;
    this.tokenExpiresAt = data.expires_at
      ? Date.parse(data.expires_at)
      : Date.now() + (data.token_duration ?? 1440) * 60_000;
    return this.token;
  }

  /**
   * GET a resource under /partners/, e.g. `capital-receivers/{uuid}/`.
   */
  async get(path: string): Promise<unknown> {
    return this.request("GET", this.partnersUrl(path));
  }

  /**
   * POST a filtered list request. `filters` goes in the body; pagination,
   * search and ordering stay in the query string.
   */
  async list(path: string, params: ListParams = {}): Promise<unknown> {
    const url = new URL(this.partnersUrl(path));
    if (params.limit != null) url.searchParams.set("limit", String(params.limit));
    if (params.offset != null) url.searchParams.set("offset", String(params.offset));
    if (params.search) url.searchParams.set("search", params.search);
    if (params.ordering) url.searchParams.set("ordering", params.ordering);

    const body = params.filters ? { filters: params.filters } : undefined;
    return this.request("POST", url.toString(), body);
  }

  private partnersUrl(path: string): string {
    const clean = path.replace(/^\/+/, "");
    return `${this.baseUrl}/partners/${clean}`;
  }

  private async request(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<unknown> {
    const token = await this.getToken();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await safeBody(res);
      throw new AltDmpError(
        `Request failed: ${method} ${url} (${res.status})`,
        res.status,
        errBody,
      );
    }
    return safeBody(res);
  }
}

async function safeBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
