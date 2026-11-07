/**
 * Browser side of the SSE envelope (shared/schema.ts StreamEvent).
 * Concatenates `delta` text per lifeKey and parses it with partial-json so the UI can draw a
 * life while it is still arriving. `result` replaces the partial with the validated object.
 *
 *   await streamEnvelope("/api/demo/life/leap", { method: "GET" }, {
 *     onPartial: (key, partial) => ..., onResult: (key, data) => ...,
 *   });
 *
 * Render a year only once the next year has started (or the array closed), so half-written
 * text never flickers on screen (research/04 §3.6).
 */
import { createParser } from "eventsource-parser";
import { parse as parsePartial } from "partial-json";
import { StreamEvent } from "../../shared/schema";
import type { LifeKey } from "../../shared/lives";

type Key = LifeKey | "_";

export interface StreamHandlers {
  onMeta?: (key: LifeKey | null, model: string) => void;
  onPartial?: (key: LifeKey | null, partial: unknown) => void;
  onResult?: (key: LifeKey | null, data: unknown) => void;
  onWarning?: (key: LifeKey | null, message: string) => void;
  onError?: (key: LifeKey | null, code: string, message: string, retryable: boolean) => void;
  onDone?: (key: LifeKey | null, ms: number) => void;
}

export async function streamEnvelope(
  url: string,
  init: RequestInit & { json?: unknown } = {},
  h: StreamHandlers = {},
  opts: { firstByteMs?: number; totalMs?: number } = {},
): Promise<void> {
  const ac = new AbortController();
  init.signal?.addEventListener("abort", () => ac.abort(), { once: true });
  const first = setTimeout(() => ac.abort(), opts.firstByteMs ?? 20_000);
  const total = setTimeout(() => ac.abort(), opts.totalMs ?? 90_000);
  const { json, ...rest } = init;
  try {
    const res = await fetch(url, {
      ...rest,
      method: rest.method ?? (json === undefined ? "GET" : "POST"),
      headers: { ...(json === undefined ? {} : { "content-type": "application/json" }), ...rest.headers },
      body: json === undefined ? rest.body : JSON.stringify(json),
      signal: ac.signal,
    });
    if (!res.ok || !res.body) throw new Error(`${url} ${res.status}`);
    clearTimeout(first);

    const text = new Map<Key, string>();
    const parser = createParser({
      onEvent(msg) {
        let ev: StreamEvent;
        try {
          ev = StreamEvent.parse(JSON.parse(msg.data));
        } catch {
          return;
        }
        const k: Key = ev.lifeKey ?? "_";
        switch (ev.type) {
          case "meta":
            h.onMeta?.(ev.lifeKey, ev.model);
            break;
          case "delta": {
            const t = (text.get(k) ?? "") + ev.text;
            text.set(k, t);
            try {
              h.onPartial?.(ev.lifeKey, parsePartial(t));
            } catch {
              /* not parseable yet */
            }
            break;
          }
          case "result":
            h.onResult?.(ev.lifeKey, ev.data);
            break;
          case "warning":
            h.onWarning?.(ev.lifeKey, ev.message);
            break;
          case "error":
            h.onError?.(ev.lifeKey, ev.code, ev.message, ev.retryable);
            break;
          case "done":
            h.onDone?.(ev.lifeKey, ev.ms);
            break;
        }
      },
    });
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(value);
    }
  } finally {
    clearTimeout(first);
    clearTimeout(total);
  }
}
