import { useCallback } from "react";

const BASE_URL = "/api";

interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export function useAPI() {
  const get = useCallback(async <T = unknown>(path: string, options?: RequestOptions): Promise<T> => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", ...options?.headers },
      signal: options?.signal,
    });
    return handleResponse<T>(res);
  }, []);

  const post = useCallback(async <T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...options?.headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    });
    return handleResponse<T>(res);
  }, []);

  const put = useCallback(async <T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...options?.headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    });
    return handleResponse<T>(res);
  }, []);

  const del = useCallback(async <T = unknown>(path: string, options?: RequestOptions): Promise<T> => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...options?.headers },
      signal: options?.signal,
    });
    return handleResponse<T>(res);
  }, []);

  const getBlob = useCallback(async (path: string, options?: RequestOptions): Promise<Blob> => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: options?.headers,
      signal: options?.signal,
    });
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
    return res.blob();
  }, []);

  return { get, post, put, del, getBlob };
}
