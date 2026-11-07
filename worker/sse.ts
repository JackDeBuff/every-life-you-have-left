/**
 * Server side of the SSE envelope (shared/schema.ts StreamEvent). Routes build a stream with
 * sseResponse(), and use pipeGemini() to turn a Gemini stream into `delta` events while keeping
 * the full text for the validator.
 */
import { encodeSse, type StreamEvent } from "../shared/schema";
import type { LifeKey } from "../shared/lives";
import { textDeltas } from "./gemini";

export type Send = (ev: StreamEvent) => void;

/** Open an SSE response; `run` writes events and the stream closes when it resolves. */
export function sseResponse(run: (send: Send, signal: AbortSignal) => Promise<void>, signal: AbortSignal): Response {
  const { readable, writable } = new TransformStream<string, string>();
  const writer = writable.getWriter();
  let closed = false;
  const send: Send = (ev) => {
    if (closed) return;
    writer.write(encodeSse(ev)).catch(() => (closed = true));
  };
  (async () => {
    try {
      await run(send, signal);
    } catch (e) {
      send({ type: "error", lifeKey: null, code: "internal", message: e instanceof Error ? e.message : "error", retryable: true });
    } finally {
      closed = true;
      writer.close().catch(() => {});
    }
  })();
  return new Response(readable.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

/** Forward a Gemini SSE response as `delta` events; resolves with the full concatenated text. */
export async function pipeGemini(res: Response, lifeKey: LifeKey | null, send: Send): Promise<{ text: string; finishReason?: string }> {
  let text = "";
  let finishReason: string | undefined;
  for await (const d of textDeltas(res)) {
    if (d.finishReason) finishReason = d.finishReason;
    if (!d.text) continue;
    text += d.text;
    send({ type: "delta", lifeKey, text: d.text });
  }
  return { text, finishReason };
}
