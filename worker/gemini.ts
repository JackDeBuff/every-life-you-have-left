/**
 * Minimal Gemini client for Google Cloud Agent Platform (formerly Vertex AI). Plain fetch,
 * no SDK (CLAUDE.md). WP1 extends this; keep the public surface (generate, stream, textDeltas,
 * modelChain) stable.
 *
 *   URL   https://aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent
 *         ...:streamGenerateContent?alt=sse
 *   Auth  header x-goog-api-key: GCP_API_KEY (secret; never log it, never log request bodies)
 *
 * Behaviour:
 *   - Fallback chain: each model is tried up to `attempts` times on 429/5xx/timeout, then the next.
 *     A 400 is our bug (schema/prompt) and throws immediately.
 *   - Timeout per attempt via AbortController. For stream(), the timeout covers time-to-headers
 *     only; once the stream starts, only the caller's `signal` (client disconnect) aborts it.
 *   - GENERATION_ENABLED="false" makes every call throw GenerationDisabledError (D-032).
 *   - Temperature is ignored by 3.6+ models: make outputs differ through prompts.
 */
import { createParser } from "eventsource-parser";

import { overCap, type SpendEnv } from "./spend";

export type GeminiEnv = Pick<
  Env,
  | "GCP_PROJECT" | "GCP_LOCATION" | "GCP_API_KEY" | "MODEL_HEAVY" | "MODEL_FAST" | "MODEL_QUALITY"
  | "MODEL_FALLBACK" | "GENERATION_ENABLED"
>;

export type ModelTier = "heavy" | "fast" | "quality";
export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface Part {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string }; // base64 (PDF, audio)
}
export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export interface GenerateOptions {
  /** Which fallback chain to use (see modelChain). Ignored when `models` is given. */
  tier?: ModelTier;
  /** Explicit model list, tried in order. */
  models?: string[];
  system?: string;
  /** A plain prompt string becomes one user turn. */
  contents: Content[] | string;
  /** JSON Schema from shared/schema.ts geminiSchema(); sets responseMimeType application/json. */
  jsonSchema?: Record<string, unknown>;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  /** Per-attempt timeout (non-stream: whole response; stream: until headers). Default 30s / 20s. */
  timeoutMs?: number;
  attempts?: number;
  /** Pass c.req.raw.signal so a closed tab stops the upstream spend. */
  signal?: AbortSignal;
  /** Extra generationConfig fields merged last (responseModalities, speechConfig, imageConfig, ...). */
  generationConfig?: Record<string, unknown>;
}

export interface Usage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

export class GenerationDisabledError extends Error {
  constructor() {
    super("generation_disabled");
    this.name = "GenerationDisabledError";
  }
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly model: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export const generationEnabled = (env: Pick<Env, "GENERATION_ENABLED">) =>
  String(env.GENERATION_ENABLED).toLowerCase() !== "false";

/** Fallback chains (D-062 / PLAN §5): heavy 3.8-flash → 3.6-flash → 3.5-flash-lite. */
export function modelChain(env: GeminiEnv, tier: ModelTier): string[] {
  const chains: Record<ModelTier, string[]> = {
    heavy: [env.MODEL_HEAVY, env.MODEL_FALLBACK, env.MODEL_FAST],
    fast: [env.MODEL_FAST, env.MODEL_FALLBACK],
    quality: [env.MODEL_QUALITY, env.MODEL_HEAVY, env.MODEL_FALLBACK],
  };
  return [...new Set(chains[tier].filter(Boolean))];
}

export function endpoint(env: GeminiEnv, model: string, stream: boolean): string {
  const location = env.GCP_LOCATION || "global";
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  return (
    `https://${host}/v1/projects/${env.GCP_PROJECT}/locations/${location}/publishers/google/models/${model}:` +
    (stream ? "streamGenerateContent?alt=sse" : "generateContent")
  );
}

export function buildBody(o: GenerateOptions): Record<string, unknown> {
  const contents: Content[] =
    typeof o.contents === "string" ? [{ role: "user", parts: [{ text: o.contents }] }] : o.contents;
  const generationConfig: Record<string, unknown> = {};
  if (o.jsonSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseJsonSchema = o.jsonSchema;
  }
  if (o.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: o.thinkingLevel };
  if (o.maxOutputTokens) generationConfig.maxOutputTokens = o.maxOutputTokens;
  if (o.generationConfig) Object.assign(generationConfig, o.generationConfig);
  return {
    ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
    contents,
    generationConfig,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRetryable = (status: number) => status === 408 || status === 429 || status >= 500;

/** Shared retry/fallback loop. Returns the first OK response (headers received). */
async function call(
  env: GeminiEnv,
  o: GenerateOptions,
  stream: boolean,
): Promise<{ res: Response; model: string; clear: () => void }> {
  if (!generationEnabled(env)) throw new GenerationDisabledError();
  // App-wide spend cap (worker/spend.ts): at the cap every call behaves like the kill switch.
  if (await overCap(env as SpendEnv)) throw new GenerationDisabledError();
  if (!env.GCP_API_KEY) throw new GeminiError("GCP_API_KEY is not set", 500, "", false);
  const models = o.models?.length ? o.models : modelChain(env, o.tier ?? "heavy");
  const attempts = o.attempts ?? 2;
  const timeoutMs = o.timeoutMs ?? (stream ? 20_000 : 30_000);
  const body = JSON.stringify(buildBody(o));
  let last: GeminiError | null = null;

  for (const model of models) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (o.signal?.aborted) throw new GeminiError("aborted", 499, model, false);
      const ac = new AbortController();
      const onAbort = () => ac.abort(o.signal?.reason);
      o.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => ac.abort(new Error("timeout")), timeoutMs);
      const clear = () => {
        clearTimeout(timer);
        o.signal?.removeEventListener("abort", onAbort);
      };
      try {
        const res = await fetch(endpoint(env, model, stream), {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": env.GCP_API_KEY },
          body,
          signal: ac.signal,
        });
        if (res.ok) {
          if (stream) {
            clearTimeout(timer); // keep the client-disconnect link for the life of the stream
            return { res, model, clear };
          }
          return { res, model, clear };
        }
        clear();
        // Error bodies are Google's, not the user's data: safe to keep a short excerpt.
        const detail = (await res.text()).slice(0, 300);
        last = new GeminiError(`${model} ${res.status}: ${detail}`, res.status, model, isRetryable(res.status));
        if (!last.retryable) throw last;
      } catch (e) {
        clear();
        if (e instanceof GeminiError && !e.retryable) throw e;
        if (o.signal?.aborted) throw new GeminiError("aborted", 499, model, false);
        if (!(e instanceof GeminiError)) {
          last = new GeminiError(`${model}: ${e instanceof Error ? e.message : String(e)}`, 504, model, true);
        }
      }
      await sleep(300 * 2 ** attempt + Math.random() * 200);
    }
  }
  throw last ?? new GeminiError("no models configured", 500, "", false);
}

interface GeminiResponse {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  usageMetadata?: Usage;
  promptFeedback?: { blockReason?: string };
}

const partsText = (r: GeminiResponse) =>
  (r.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("");

export interface GenerateResult<T = unknown> {
  text: string;
  /** Parsed JSON when jsonSchema was given (validate it with zod!), else undefined. */
  json: T | undefined;
  model: string;
  ms: number;
  finishReason: string | undefined;
  usage: Usage | undefined;
  /** Raw candidate parts (inlineData for image / audio responses). */
  parts: Part[];
}

/** Non-streaming call. */
export async function generate<T = unknown>(env: GeminiEnv, o: GenerateOptions): Promise<GenerateResult<T>> {
  const t0 = Date.now();
  const { res, model, clear } = await call(env, o, false);
  try {
    const data = (await res.json()) as GeminiResponse;
    const text = partsText(data);
    let json: T | undefined;
    if (o.jsonSchema) {
      try {
        json = JSON.parse(text) as T;
      } catch {
        throw new GeminiError(`${model}: response was not valid JSON`, 502, model, true);
      }
    }
    return {
      text, json, model, ms: Date.now() - t0,
      finishReason: data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason,
      usage: data.usageMetadata,
      parts: data.candidates?.[0]?.content?.parts ?? [],
    };
  } finally {
    clear();
  }
}

/**
 * Streaming call. Returns Gemini's raw SSE Response (passthrough) and the model that answered.
 * Retries and fallback happen before the first byte (D-064). Either pipe `res.body` to the
 * browser unchanged, or read it with textDeltas() and re-wrap it in our envelope (worker/sse.ts).
 */
export async function stream(env: GeminiEnv, o: GenerateOptions): Promise<{ res: Response; model: string }> {
  const { res, model } = await call(env, o, true);
  return { res, model };
}

/** Parse a Gemini SSE Response into text fragments (thought parts dropped). */
export async function* textDeltas(res: Response): AsyncGenerator<{ text: string; finishReason?: string; usage?: Usage }> {
  if (!res.body) return;
  const queue: { text: string; finishReason?: string; usage?: Usage }[] = [];
  const parser = createParser({
    onEvent(ev) {
      if (!ev.data || ev.data === "[DONE]") return;
      try {
        const chunk = JSON.parse(ev.data) as GeminiResponse;
        queue.push({
          text: partsText(chunk),
          finishReason: chunk.candidates?.[0]?.finishReason,
          usage: chunk.usageMetadata,
        });
      } catch {
        /* ignore keep-alives / malformed frames */
      }
    },
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(value);
      while (queue.length) yield queue.shift()!;
    }
    while (queue.length) yield queue.shift()!;
  } finally {
    reader.releaseLock();
  }
}
