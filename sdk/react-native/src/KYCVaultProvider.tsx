import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";

interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  jwtToken?: string;
  timeout?: number;
  retryCount?: number;
}

interface KYCVaultState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: KYCVaultError | null;
  userId: string | null;
}

interface KYCVaultContextValue extends KYCVaultState {
  baseUrl: string;
  setJWT: (token: string) => void;
  clearAuth: () => void;
  reset: () => void;
}

interface KYCVaultError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const KYCVaultContext = createContext<KYCVaultContextValue | null>(null);

interface KYCVaultProviderProps {
  children: React.ReactNode;
  config: ProviderConfig;
}

export function KYCVaultProvider({ children, config }: KYCVaultProviderProps) {
  const jwtTokenRef = useRef<string | undefined>(config.jwtToken);
  const baseUrlRef = useRef(config.baseUrl.replace(/\/+$/, ""));

  const [state, setState] = useState<KYCVaultState>({
    isAuthenticated: !!config.jwtToken,
    isLoading: false,
    error: null,
    userId: null,
  });

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active") {
          setState((prev) => ({ ...prev, error: null }));
        }
      },
    );
    return () => subscription.remove();
  }, []);

  const setJWT = useCallback((token: string) => {
    jwtTokenRef.current = token;
    setState((prev) => ({ ...prev, isAuthenticated: true }));
  }, []);

  const clearAuth = useCallback(() => {
    jwtTokenRef.current = undefined;
    setState((prev) => ({
      ...prev,
      isAuthenticated: false,
      userId: null,
      error: null,
    }));
  }, []);

  const reset = useCallback(() => {
    jwtTokenRef.current = undefined;
    setState({
      isAuthenticated: false,
      isLoading: false,
      error: null,
      userId: null,
    });
  }, []);

  const contextValue: KYCVaultContextValue = {
    ...state,
    baseUrl: baseUrlRef.current,
    setJWT,
    clearAuth,
    reset,
  };

  return (
    <KYCVaultContext.Provider value={contextValue}>
      {children}
    </KYCVaultContext.Provider>
  );
}

export function useKYCVault(): KYCVaultContextValue {
  const context = useContext(KYCVaultContext);
  if (!context) {
    throw new Error("useKYCVault must be used within a KYCVaultProvider");
  }
  return context;
}

function useAPIClient() {
  const { baseUrl, setJWT: _setJWT, clearAuth: _clearAuth, ...state } = useKYCVault();

  const request = useCallback(
    async <T,>(
      method: string,
      path: string,
      body?: unknown,
      params?: Record<string, string>,
    ): Promise<T> => {
      const url = buildUrl(`${baseUrl}${path}`, params);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      const jwt = jwtTokenRef.current;
      if (jwt) {
        headers["Authorization"] = `Bearer ${jwt}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const responseBody = await response.json().catch(() => ({}));
          const error = {
            code: responseBody.error || "UNKNOWN",
            message: responseBody.message || `HTTP ${response.status}`,
            details: responseBody,
          };
          throw error;
        }

        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    },
    [baseUrl],
  );

  const get = useCallback(
    <T,>(path: string, params?: Record<string, string>) =>
      request<T>("GET", path, undefined, params),
    [request],
  );

  const post = useCallback(
    <T,>(path: string, body?: unknown) => request<T>("POST", path, body),
    [request],
  );

  return { get, post, ...state };
}

function buildUrl(base: string, params?: Record<string, string>): string {
  const url = new URL(base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

const jwtTokenRef: { current: string | undefined } = { current: undefined };

export { useAPIClient, jwtTokenRef };
export type { KYCVaultContextValue, KYCVaultProviderProps, ProviderConfig };
