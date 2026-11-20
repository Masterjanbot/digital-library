import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || (typeof window === "undefined" ? "http://localhost/api" : `${window.location.origin}/api`),
  headers: { "Content-Type": "application/json" },
});

export function getAccessToken() {
  return typeof window === "undefined" ? null : window.sessionStorage.getItem("library.access");
}

export function saveTokens(access: string, refresh: string) {
  window.sessionStorage.setItem("library.access", access);
  window.sessionStorage.setItem("library.refresh", refresh);
  window.dispatchEvent(new Event("library-auth"));
}

export function clearTokens() {
  window.sessionStorage.removeItem("library.access");
  window.sessionStorage.removeItem("library.refresh");
  if (typeof window !== "undefined") window.dispatchEvent(new Event("library-auth"));
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshRequest: Promise<string | null> | null = null;
api.interceptors.response.use((response) => response, async (error: unknown) => {
  if (!axios.isAxiosError(error)) throw error;
  const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  const url = config?.url || "";
  if (error.response?.status !== 401 || !config || config._retried ||
      ["/auth/login/", "/auth/register/", "/auth/refresh/", "/auth/logout/"].some((path) => url.includes(path))) {
    throw error;
  }
  const refresh = typeof window === "undefined" ? null : window.sessionStorage.getItem("library.refresh");
  if (!refresh) {
    clearTokens();
    throw error;
  }
  config._retried = true;
  refreshRequest ??= api.post<{ access: string; refresh?: string }>("/auth/refresh/", { refresh })
    .then(({ data }) => {
      saveTokens(data.access, data.refresh || refresh);
      return data.access;
    })
    .catch((refreshError: unknown) => {
      clearTokens();
      throw refreshError;
    })
    .finally(() => { refreshRequest = null; });
  const access = await refreshRequest;
  if (!access) throw error;
  config.headers.Authorization = `Bearer ${access}`;
  return api.request(config);
});
