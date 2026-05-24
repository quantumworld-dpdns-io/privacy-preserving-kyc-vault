const BASE_URL = "/api";

interface ApiConfig {
  baseUrl?: string;
  token?: string;
}

interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  signal?: AbortSignal;
}

export class ApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(config: ApiConfig = {}) {
    this.baseUrl = config.baseUrl ?? BASE_URL;
    this.token = config.token;
  }

  setToken(token: string | undefined) {
    this.token = token;
  }

  private async request<T>({ method, path, body, signal }: RequestOptions): Promise<T> {
    const headers: Record<string, string> = {};

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, error.message || `Request failed with status ${res.status}`);
    }

    if (res.headers.get("content-type")?.includes("application/json")) {
      return res.json();
    }

    return undefined as T;
  }

  async get<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>({ method: "GET", path, signal });
  }

  async post<T = unknown>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>({ method: "POST", path, body, signal });
  }

  async put<T = unknown>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>({ method: "PUT", path, body, signal });
  }

  async delete<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>({ method: "DELETE", path, signal });
  }

  async getBlob(path: string, signal?: AbortSignal): Promise<Blob> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers,
      signal,
    });

    if (!res.ok) {
      throw new ApiError(res.status, `Request failed with status ${res.status}`);
    }

    return res.blob();
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const apiClient = new ApiClient();
