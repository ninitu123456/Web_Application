import { apiErrorText, type ErrorContext } from "./error-messages";
import type { Envelope, Item, Query } from "./types";

const base = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3001/api"
).replace(/\/$/, "");
const key = "findit.session";
let token: string | null = null;
try {
  token = sessionStorage.getItem(key);
} catch {
  /* Memory session remains available. */
}
let expire: () => void = () => {};
let accessDenied: () => void = () => {};
export function onAccessDenied(callback: () => void) {
  accessDenied = callback;
}
const details = new Map<number, Promise<Item>>();
const reads = new Map<string, Promise<Envelope<unknown>>>();
let revision = 0;
const listeners = new Set<() => void>();
export function onSessionExpired(callback: () => void) {
  expire = callback;
}
export function sessionToken() {
  return token;
}
export function setSession(value: string | null) {
  token = value;
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* Memory fallback. */
  }
  invalidate();
}
export function invalidate() {
  details.clear();
  reads.clear();
  revision++;
  listeners.forEach((listener) => listener());
}
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function getRevision() {
  return revision;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public context?: ErrorContext,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function errorText(error: unknown): string {
  return error instanceof ApiError
    ? apiErrorText(error.status, error.message, error.context)
    : "Đã xảy ra lỗi. Vui lòng thử lại.";
}
export function queryString(query: Query = {}) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query))
    if (value !== undefined && String(value).trim() !== "")
      params.set(name, String(value));
  return params.size ? `?${params}` : "";
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Query;
    signal?: AbortSignal;
    auth?: boolean;
  } = {},
): Promise<Envelope<T>> {
  const requestToken = token;
  const context: ErrorContext = {
    path,
    authenticated: Boolean(requestToken && options.auth !== false),
    method: (options.method || "GET").toUpperCase(),
  };
  const headers: Record<string, string> = {};
  if (requestToken && options.auth !== false)
    headers.Authorization = `Bearer ${requestToken}`;
  const multipart = options.body instanceof FormData;
  if (options.body !== undefined && !multipart)
    headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${base}${path}${queryString(options.query)}`, {
      method: options.method || "GET",
      headers,
      signal: options.signal,
      body:
        options.body === undefined
          ? undefined
          : multipart
            ? (options.body as FormData)
            : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(0, "", context);
  }
  let result: Envelope<T>;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      response.status >= 400 ? response.status : 500,
      "Phản hồi máy chủ không hợp lệ.",
      context,
    );
  }
  if (options.auth !== false && requestToken !== token)
    throw new DOMException("Session changed", "AbortError");
  if (!response.ok || !result.success) {
    if (
      response.status === 403 &&
      requestToken &&
      requestToken === token &&
      path !== "/users/me"
    )
      accessDenied();
    if (
      response.status === 401 &&
      requestToken &&
      requestToken === token &&
      options.auth !== false
    ) {
      setSession(null);
      expire();
    }
    throw new ApiError(
      response.status,
      typeof result.message === "string" ? result.message : "",
      context,
    );
  }
  // Responses started by a previous account must never populate the next session.
  if (options.auth !== false && requestToken !== token)
    throw new DOMException("Session changed", "AbortError");
  return result;
}
export function itemDetail(id: number): Promise<Item> {
  let promise = details.get(id);
  if (!promise) {
    promise = api<Item>(`/items/${id}`)
      .then((response) => response.data)
      .catch((error) => {
        if (details.get(id) === promise) details.delete(id);
        throw error;
      });
    details.set(id, promise);
  }
  return promise;
}
export function readResource<T>(
  path: string,
  query: Query = {},
): Promise<Envelope<T>> {
  const key = `${token}:${revision}:${path}${queryString(query)}`;
  const existing = reads.get(key);
  if (existing) return existing as Promise<Envelope<T>>;
  const cleanup = () => {
    if (reads.get(key) === pending) reads.delete(key);
  };
  const pending = api<T>(path, { query }).then(
    (value) => {
      cleanup();
      return value;
    },
    (error: unknown) => {
      cleanup();
      throw error;
    },
  );
  reads.set(key, pending as Promise<Envelope<unknown>>);
  return pending;
}
