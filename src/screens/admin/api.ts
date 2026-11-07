/**
 * Admin API client. The passcode lives in sessionStorage (this tab only, gone when it closes) and is
 * sent as `x-admin-passcode`. A 401 anywhere clears it and sends the page back to the login.
 */
import type { ChecksResponse, DetailResponse, ListResponse } from "./types";

const KEY = "elyl.admin.passcode";

export function getPasscode(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setPasscode(p: string | null): void {
  try {
    if (p) sessionStorage.setItem(KEY, p);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the passcode then lasts until reload (kept in memory by the caller) */
  }
}

export class AuthError extends Error {
  constructor(readonly code: "unauthorized" | "admin_disabled") {
    super(code);
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
    this.name = "ApiError";
  }
}

let memory: string | null = null;
export const passcode = () => getPasscode() ?? memory;
export const rememberPasscode = (p: string | null) => {
  memory = p;
  setPasscode(p);
};

async function get<T>(path: string, pass = passcode(), signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { "x-admin-passcode": pass ?? "" }, cache: "no-store", signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network");
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (res.status === 401) throw new AuthError(body?.error === "admin_disabled" ? "admin_disabled" : "unauthorized");
  if (!res.ok || !body?.ok) throw new ApiError(res.status, body?.error ?? "error");
  return body as T;
}

export const ping = (pass: string) => get<{ ok: true }>("/api/admin/ping", pass);
export const listSessions = (signal?: AbortSignal) => get<ListResponse>("/api/admin/sessions?limit=300", undefined, signal);
export const sessionDetail = (id: string, signal?: AbortSignal) => get<DetailResponse>(`/api/admin/session/${encodeURIComponent(id)}`, undefined, signal);
export const sessionChecks = (id: string, signal?: AbortSignal) => get<ChecksResponse>(`/api/admin/session/${encodeURIComponent(id)}/checks`, undefined, signal);
