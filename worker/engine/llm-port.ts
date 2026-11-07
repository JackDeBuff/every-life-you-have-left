/**
 * The engine's thin LLM port. The engine depends only on this interface, so it runs in the
 * Worker (wired to Foundation's worker/llm.ts at integration) and in node scripts (the direct
 * fetch implementation below). Names match worker/llm.ts: generateJSON / streamText /
 * chatCompletionsOpenAI.
 *
 * Endpoints (docs/AGENTS.md, research/04 §3.4):
 *   Gemini   https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/{model}:generateContent
 *            ...:streamGenerateContent?alt=sse            header x-goog-api-key
 *   gpt-oss  https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/endpoints/openapi/chat/completions
 *            model "openai/gpt-oss-120b-maas"              header x-goog-api-key
 *
 * Never log keys or request bodies (personal data).
 */
import { createParser } from "eventsource-parser";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface LlmTurn {
  role: "user" | "assistant";
  text: string;
}

export interface LlmUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  /** Prompt tokens served from Gemini's implicit context cache (usageMetadata.cachedContentTokenCount); part of inputTokens. */
  cachedTokens?: number;
  /** Wall time of the whole call. */
  ms: number;
  /** Streaming only: time to the first non-thought text. */
  firstTokenMs?: number;
}

export interface GenerateJSONRequest {
  model: string;
  system?: string;
  /** The final user turn. */
  prompt: string;
  /** Earlier turns, oldest first. */
  history?: LlmTurn[];
  /** JSON Schema (shared/schema.ts geminiSchema()). */
  schema: Record<string, unknown>;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface GenerateJSONResult<T> {
  json: T;
  text: string;
  usage: LlmUsage;
  finishReason?: string;
}

export interface StreamTextRequest extends Omit<GenerateJSONRequest, "schema"> {
  /** Optional JSON Schema; when set the stream is partial JSON text. */
  schema?: Record<string, unknown>;
}

export interface StreamChunk {
  text: string;
  /** Present on the final chunk. */
  usage?: LlmUsage;
  finishReason?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionsRequest {
  model: string;
  messages: ChatMessage[];
  /** JSON Schema for response_format json_schema; falls back to json_object if rejected. */
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Stream deltas (text only) as they arrive; the promise still resolves with the full text. */
  onDelta?: (text: string) => void;
}

export interface ChatCompletionsResult {
  text: string;
  usage: LlmUsage;
  finishReason?: string;
}

export interface LlmPort {
  generateJSON<T = unknown>(req: GenerateJSONRequest): Promise<GenerateJSONResult<T>>;
  streamText(req: StreamTextRequest): AsyncIterable<StreamChunk>;
  chatCompletionsOpenAI(req: ChatCompletionsRequest): Promise<ChatCompletionsResult>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly model: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

// ---------------------------------------------------------------------------------------------
// Direct fetch implementation (node scripts + usable in the Worker as-is)
// ---------------------------------------------------------------------------------------------

export interface FetchLlmConfig {
  apiKey: string;
  project: string;
  location?: string;
  /** Retries per call on 408/429/5xx/timeouts before the first byte. Default 2 (3 tries). */
  retries?: number;
  fetchImpl?: typeof fetch;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (s: number) => s === 408 || s === 429 || s >= 500;
const partsText = (r: GeminiResponse) =>
  (r.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("");

/** Strip ```json fences and leading prose some models add despite JSON mode. */
export function extractJsonText(text: string): string {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1]!.trim();
  const first = t.search(/[[{]/);
  return first > 0 ? t.slice(first) : t;
}

export function createFetchLlm(cfg: FetchLlmConfig): LlmPort {
  const f = cfg.fetchImpl ?? fetch;
  const location = cfg.location || "global";
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const base = `https://${host}/v1/projects/${cfg.project}/locations/${location}`;
  const tries = (cfg.retries ?? 2) + 1;

  const geminiUrl = (model: string, stream: boolean) =>
    `${base}/publishers/google/models/${model}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;

  function geminiBody(req: StreamTextRequest): Record<string, unknown> {
    const contents = [
      ...(req.history ?? []).map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
      { role: "user", parts: [{ text: req.prompt }] },
    ];
    const generationConfig: Record<string, unknown> = {};
    if (req.schema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseJsonSchema = req.schema;
    }
    if (req.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: req.thinkingLevel };
    if (req.maxOutputTokens) generationConfig.maxOutputTokens = req.maxOutputTokens;
    return {
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
      contents,
      generationConfig,
    };
  }

  /** POST with retries before the first byte. Returns an OK response. */
  async function post(url: string, body: string, model: string, timeoutMs: number, signal?: AbortSignal) {
    let last: LlmError | null = null;
    for (let attempt = 0; attempt < tries; attempt++) {
      if (signal?.aborted) throw new LlmError("aborted", 499, model, false);
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await f(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
          body,
          signal: ac.signal,
        });
        clearTimeout(timer);
        if (res.ok) return { res, done: () => signal?.removeEventListener("abort", onAbort) };
        const detail = (await res.text()).slice(0, 300);
        signal?.removeEventListener("abort", onAbort);
        last = new LlmError(`${model} ${res.status}: ${detail}`, res.status, model, retryable(res.status));
        if (!last.retryable) throw last;
      } catch (e) {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (e instanceof LlmError && !e.retryable) throw e;
        if (signal?.aborted) throw new LlmError("aborted", 499, model, false);
        if (!(e instanceof LlmError)) last = new LlmError(`${model}: ${e instanceof Error ? e.message : String(e)}`, 504, model, true);
      }
      await sleep(500 * 2 ** attempt + Math.random() * 300);
    }
    throw last ?? new LlmError("request failed", 500, model, false);
  }

  const usageOf = (model: string, u: GeminiResponse["usageMetadata"], ms: number, firstTokenMs?: number): LlmUsage => ({
    model,
    inputTokens: u?.promptTokenCount ?? 0,
    outputTokens: u?.candidatesTokenCount ?? 0,
    thoughtTokens: u?.thoughtsTokenCount ?? 0,
    ...(u?.cachedContentTokenCount ? { cachedTokens: u.cachedContentTokenCount } : {}),
    ms,
    ...(firstTokenMs !== undefined ? { firstTokenMs } : {}),
  });

  async function generateJSON<T>(req: GenerateJSONRequest): Promise<GenerateJSONResult<T>> {
    const t0 = Date.now();
    const { res, done } = await post(geminiUrl(req.model, false), JSON.stringify(geminiBody(req)), req.model, req.timeoutMs ?? 60_000, req.signal);
    try {
      const data = (await res.json()) as GeminiResponse;
      const text = partsText(data);
      const finishReason = data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason;
      let json: T;
      try {
        json = JSON.parse(extractJsonText(text)) as T;
      } catch {
        throw new LlmError(`${req.model}: response was not valid JSON (finish ${finishReason ?? "?"})`, 502, req.model, true);
      }
      return { json, text, usage: usageOf(req.model, data.usageMetadata, Date.now() - t0), finishReason };
    } finally {
      done();
    }
  }

  async function* streamText(req: StreamTextRequest): AsyncGenerator<StreamChunk> {
    const t0 = Date.now();
    const { res, done } = await post(geminiUrl(req.model, true), JSON.stringify(geminiBody(req)), req.model, req.timeoutMs ?? 30_000, req.signal);
    if (!res.body) {
      done();
      return;
    }
    const queue: GeminiResponse[] = [];
    const parser = createParser({
      onEvent(ev) {
        if (!ev.data || ev.data === "[DONE]") return;
        try {
          queue.push(JSON.parse(ev.data) as GeminiResponse);
        } catch {
          /* keep-alive or malformed frame */
        }
      },
    });
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let lastUsage: GeminiResponse["usageMetadata"];
    let finishReason: string | undefined;
    let firstTokenMs: number | undefined;
    try {
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        parser.feed(value);
        while (queue.length) {
          const chunk = queue.shift()!;
          if (chunk.usageMetadata) lastUsage = chunk.usageMetadata;
          finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
          const text = partsText(chunk);
          if (text) {
            firstTokenMs ??= Date.now() - t0;
            yield { text };
          }
        }
      }
    } finally {
      reader.releaseLock();
      done();
    }
    yield { text: "", usage: usageOf(req.model, lastUsage, Date.now() - t0, firstTokenMs), finishReason };
  }

  async function chatCompletionsOpenAI(req: ChatCompletionsRequest): Promise<ChatCompletionsResult> {
    const t0 = Date.now();
    const url = `${base}/endpoints/openapi/chat/completions`;
    const stream = Boolean(req.onDelta);
    const mk = (format: "schema" | "object" | "none") => {
      const body: Record<string, unknown> = { model: req.model, messages: req.messages, stream };
      if (req.maxTokens) body.max_tokens = req.maxTokens;
      if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort;
      if (stream) body.stream_options = { include_usage: true };
      if (req.jsonSchema && format === "schema")
        body.response_format = { type: "json_schema", json_schema: { name: "out", schema: req.jsonSchema, strict: false } };
      else if (req.jsonSchema && format === "object") body.response_format = { type: "json_object" };
      return JSON.stringify(body);
    };
    let resp: Awaited<ReturnType<typeof post>>;
    try {
      resp = await post(url, mk("schema"), req.model, req.timeoutMs ?? 90_000, req.signal);
    } catch (e) {
      if (!(e instanceof LlmError) || e.status !== 400 || !req.jsonSchema) throw e;
      resp = await post(url, mk("object"), req.model, req.timeoutMs ?? 90_000, req.signal);
    }
    const { res, done } = resp;
    try {
      type OaUsage = { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
      const toUsage = (u: OaUsage | undefined, firstTokenMs?: number): LlmUsage => {
        const reasoning = u?.completion_tokens_details?.reasoning_tokens ?? 0;
        return {
          model: req.model,
          inputTokens: u?.prompt_tokens ?? 0,
          outputTokens: Math.max(0, (u?.completion_tokens ?? 0) - reasoning),
          thoughtTokens: reasoning,
          ms: Date.now() - t0,
          ...(firstTokenMs !== undefined ? { firstTokenMs } : {}),
        };
      };
      if (!stream) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string | null }; finish_reason?: string }[];
          usage?: OaUsage;
        };
        return {
          text: data.choices?.[0]?.message?.content ?? "",
          usage: toUsage(data.usage),
          finishReason: data.choices?.[0]?.finish_reason,
        };
      }
      let text = "";
      let usage: OaUsage | undefined;
      let finishReason: string | undefined;
      let firstTokenMs: number | undefined;
      const parser = createParser({
        onEvent(ev) {
          if (!ev.data || ev.data === "[DONE]") return;
          try {
            const c = JSON.parse(ev.data) as {
              choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
              usage?: OaUsage;
            };
            if (c.usage) usage = c.usage;
            const d = c.choices?.[0]?.delta?.content;
            if (c.choices?.[0]?.finish_reason) finishReason = c.choices[0].finish_reason ?? undefined;
            if (d) {
              firstTokenMs ??= Date.now() - t0;
              text += d;
              req.onDelta?.(d);
            }
          } catch {
            /* ignore */
          }
        },
      });
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      try {
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          parser.feed(value);
        }
      } finally {
        reader.releaseLock();
      }
      return { text, usage: toUsage(usage, firstTokenMs), finishReason };
    } finally {
      done();
    }
  }

  return { generateJSON, streamText, chatCompletionsOpenAI };
}

/** True for models served by the OpenAI-compatible endpoint (gpt-oss). */
export const isOpenAIModel = (model: string) => model.startsWith("openai/");
