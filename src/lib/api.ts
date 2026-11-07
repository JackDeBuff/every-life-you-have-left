/** Thin fetch helpers for non-streaming /api routes. Streaming lives in ./stream.ts. */
export interface Health {
  ok: boolean;
  service: string;
  time: string;
  generation: boolean;
  db: boolean;
  models: Record<"heavy" | "fast" | "quality" | "fallback", string>;
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    method: rest.method ?? (json === undefined ? "GET" : "POST"),
    headers: { ...(json === undefined ? {} : { "content-type": "application/json" }), ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as T;
}

export const getHealth = () => api<Health>("/api/health");
