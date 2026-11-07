/**
 * worker/llm.ts — THE model module. The engine (worker/engine/) imports only this file for model
 * calls. Plain fetch to Google Cloud Agent Platform (via ./gemini.ts), no SDK.
 *
 * SETUP
 *   The session agent calls `bindLlm(env)` once (constructor) and the Hono app does it per request,
 *   so engine code never touches env. Node scripts (evals): `bindLlm(process.env as never)`.
 *   GENERATION_ENABLED="false" makes every call throw GenerationDisabledError (D-032 kill switch).
 *
 * AI SDK CHECK (Sat Nov 7): `@ai-sdk/google-vertex` works with our key (express mode `apiKey`, and
 * with project+location). We still use plain fetch here: it already does JSON schema, thinking
 * level, fallback, image and TTS. Images: gemini-3.1-flash-image. TTS: gemini-3.8-flash-tts.
 *
 * MODELS — `ModelRef` is a tier or an explicit model id:
 *   "heavy"   gemini-3.8-flash      → 3.6-flash → 3.5-flash-lite   (lives, years, profile)
 *   "fast"    gemini-3.5-flash-lite → 3.6-flash                    (decisions, chat, transcription)
 *   "quality" gemini-4-argon        → 3.8-flash → 3.6-flash        (A/B, showcase)
 *   any other string is used as-is, then MODEL_FALLBACK.
 *   Temperature is ignored on 3.6+: make outputs differ through prompts.
 *
 * API (all async; all accept opts.signal to stop upstream spend)
 *   type Prompt = string | Content[]             // Content = { role: "user"|"model", parts: Part[] }
 *   interface LlmOpts { system?; thinkingLevel?: "minimal"|"low"|"medium"|"high"; maxOutputTokens?;
 *                       timeoutMs?; attempts?; signal? }
 *
 *   generateJSON<T>(model, schema: z.ZodType<T>, prompt, opts?: LlmOpts & { repair?: boolean })
 *       → Promise<{ data: T; model: string; ms: number }>
 *     Sends geminiSchema(schema) as responseJsonSchema, validates with zod, and on failure makes ONE
 *     repair call with the zod issues (repair: false disables). Throws LlmValidationError if still bad.
 *
 *   streamJSON<T>(model, schema, prompt, opts?: LlmOpts & { onPartial?(partial: unknown, text: string): void })
 *       → Promise<{ data: T; model; ms }>
 *     Streams; calls onPartial with partial-json parses as text arrives (e.g. watch
 *     partial.years.length to emit each finished year: items [0..n-2] are complete). Final zod check,
 *     with one non-streaming repair call on failure.
 *
 *   generateText(model, prompt, opts?) → Promise<{ text; model; ms }>
 *   streamText(model, prompt, opts?)   → AsyncIterable<string>        // text deltas, thoughts dropped
 *
 *   chatCompletionsOpenAI(model = "openai/gpt-oss-120b-maas", messages: {role:"system"|"user"|"assistant"; content: string}[],
 *                         opts?: { maxTokens?; json?: boolean; timeoutMs?; signal? })
 *       → Promise<{ text; model; ms }>        // OpenAI-compatible endpoint on Agent Platform
 *
 *   generateImage(prompt, opts?: { image?: { mimeType; data: base64 }; aspectRatio?: "1:1"|"3:4"|"4:3"|...; model?; signal? })
 *       → Promise<{ bytes: Uint8Array; mimeType: string; model: string }>
 *
 *   tts(text, opts?: { voice?: string; style?: string; model?; signal? })
 *       → Promise<{ bytes: Uint8Array; mimeType: "audio/wav"; model: string }>   // PCM wrapped as WAV
 *     VOICES.future = an older, warm voice for future selves; VOICES.interviewer = neutral.
 *
 *   transcribe(audio: { mimeType; data: base64 }, opts?) → Promise<string>   // fast model, verbatim
 *
 *   Errors: GenerationDisabledError (kill switch), GeminiError (status, model, retryable),
 *           LlmValidationError (zod issues after repair). Never log prompts or outputs (user data).
 */
import { parse as parsePartial } from "partial-json";
import type { z } from "zod";
import { geminiSchema } from "../shared/schema";
import {
  GeminiError,
  GenerationDisabledError,
  generate,
  generationEnabled,
  modelChain,
  stream,
  textDeltas,
  type Content,
  type GeminiEnv,
  type GenerateOptions,
  type ModelTier,
  type Part,
  type ThinkingLevel,
} from "./gemini";

export { GeminiError, GenerationDisabledError, generationEnabled };
export type { Content, Part, ThinkingLevel };

// ---------------------------------------------------------------------------------------------
// Env binding
// ---------------------------------------------------------------------------------------------

export type LlmEnv = GeminiEnv & { MODEL_IMAGE?: string; MODEL_TTS?: string };
let ENV: LlmEnv | null = null;

/** Bind the Worker env (or process.env in Node). Safe to call repeatedly. */
export function bindLlm(env: LlmEnv): void {
  ENV = env;
}
function env(): LlmEnv {
  if (!ENV) throw new Error("llm: bindLlm(env) was not called");
  return ENV;
}
/** True when model calls are allowed (env bound, key present, kill switch off). */
export function llmAvailable(): boolean {
  return !!ENV && !!ENV.GCP_API_KEY && generationEnabled(ENV);
}

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type ModelRef = ModelTier | "fallback" | (string & {});
export type Prompt = string | Content[];

export interface LlmOpts {
  system?: string;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  timeoutMs?: number;
  attempts?: number;
  signal?: AbortSignal;
}

export interface JsonResult<T> {
  data: T;
  model: string;
  ms: number;
}
export interface TextResult {
  text: string;
  model: string;
  ms: number;
}

export class LlmValidationError extends Error {
  constructor(
    message: string,
    readonly model: string,
    readonly issues: unknown,
  ) {
    super(message);
    this.name = "LlmValidationError";
  }
}

const TIERS = new Set(["heavy", "fast", "quality"]);

/** Resolve a ModelRef to an ordered fallback list. */
export function models(ref: ModelRef): string[] {
  const e = env();
  if (TIERS.has(ref)) return modelChain(e, ref as ModelTier);
  if (ref === "fallback") return [e.MODEL_FALLBACK];
  return [...new Set([ref, e.MODEL_FALLBACK].filter(Boolean))];
}

function base(ref: ModelRef, prompt: Prompt, o: LlmOpts = {}): GenerateOptions {
  return {
    models: models(ref),
    contents: prompt,
    system: o.system,
    thinkingLevel: o.thinkingLevel,
    maxOutputTokens: o.maxOutputTokens,
    timeoutMs: o.timeoutMs,
    attempts: o.attempts,
    signal: o.signal,
  };
}

const asContents = (p: Prompt): Content[] => (typeof p === "string" ? [{ role: "user", parts: [{ text: p }] }] : p);

function issuesText(err: z.ZodError): string {
  return err.issues
    .slice(0, 12)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

// ---------------------------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------------------------

export async function generateJSON<T>(
  model: ModelRef,
  schema: z.ZodType<T>,
  prompt: Prompt,
  opts: LlmOpts & { repair?: boolean } = {},
): Promise<JsonResult<T>> {
  const t0 = Date.now();
  const jsonSchema = geminiSchema(schema);
  const r = await generate(env(), { ...base(model, prompt, opts), jsonSchema });
  const parsed = schema.safeParse(r.json);
  if (parsed.success) return { data: parsed.data, model: r.model, ms: Date.now() - t0 };
  if (opts.repair === false) throw new LlmValidationError("schema validation failed", r.model, parsed.error.issues);
  return repairJSON(model, schema, prompt, r.text, parsed.error, opts, t0);
}

async function repairJSON<T>(
  model: ModelRef,
  schema: z.ZodType<T>,
  prompt: Prompt,
  badText: string,
  err: z.ZodError,
  opts: LlmOpts,
  t0: number,
): Promise<JsonResult<T>> {
  const contents: Content[] = [
    ...asContents(prompt),
    { role: "model", parts: [{ text: badText }] },
    {
      role: "user",
      parts: [{ text: `That JSON failed validation:\n${issuesText(err)}\nReturn the full corrected JSON only.` }],
    },
  ];
  const r = await generate(env(), { ...base(model, contents, opts), jsonSchema: geminiSchema(schema) });
  const parsed = schema.safeParse(r.json);
  if (parsed.success) return { data: parsed.data, model: r.model, ms: Date.now() - t0 };
  throw new LlmValidationError("schema validation failed after repair", r.model, parsed.error.issues);
}

export async function streamJSON<T>(
  model: ModelRef,
  schema: z.ZodType<T>,
  prompt: Prompt,
  opts: LlmOpts & { repair?: boolean; onPartial?: (partial: unknown, text: string) => void } = {},
): Promise<JsonResult<T>> {
  const t0 = Date.now();
  const { res, model: used } = await stream(env(), { ...base(model, prompt, opts), jsonSchema: geminiSchema(schema) });
  let text = "";
  for await (const d of textDeltas(res)) {
    if (!d.text) continue;
    text += d.text;
    if (opts.onPartial) {
      try {
        opts.onPartial(parsePartial(text), text);
      } catch {
        /* not parseable yet */
      }
    }
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { data: parsed.data, model: used, ms: Date.now() - t0 };
  if (opts.repair === false) throw new LlmValidationError("schema validation failed", used, parsed.error.issues);
  return repairJSON(model, schema, prompt, text, parsed.error, opts, t0);
}

// ---------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------

export async function generateText(model: ModelRef, prompt: Prompt, opts: LlmOpts = {}): Promise<TextResult> {
  const r = await generate(env(), base(model, prompt, opts));
  return { text: r.text, model: r.model, ms: r.ms };
}

export async function* streamText(model: ModelRef, prompt: Prompt, opts: LlmOpts = {}): AsyncIterable<string> {
  const { res } = await stream(env(), base(model, prompt, opts));
  for await (const d of textDeltas(res)) if (d.text) yield d.text;
}

// ---------------------------------------------------------------------------------------------
// gpt-oss (OpenAI-compatible endpoint on Agent Platform)
// ---------------------------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatCompletionsOpenAI(
  model: string = "openai/gpt-oss-120b-maas",
  messages: ChatMessage[],
  opts: { maxTokens?: number; json?: boolean; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<TextResult> {
  const e = env();
  if (!generationEnabled(e)) throw new GenerationDisabledError();
  const t0 = Date.now();
  const loc = e.GCP_LOCATION || "global";
  const host = loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${e.GCP_PROJECT}/locations/${loc}/endpoints/openapi/chat/completions`;
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": e.GCP_API_KEY },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens ?? 4096,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new GeminiError(`${model} ${res.status}: ${detail}`, res.status, model, res.status === 429 || res.status >= 500);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { text: data.choices?.[0]?.message?.content ?? "", model, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

// ---------------------------------------------------------------------------------------------
// Bytes helpers
// ---------------------------------------------------------------------------------------------

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function inlinePart(parts: Part[]): { mimeType: string; data: string } | null {
  for (const p of parts) if (p.inlineData?.data) return p.inlineData;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Image (portraits) — illustrated only, never photoreal (D-086)
// ---------------------------------------------------------------------------------------------

/** Verified live Sat Nov 7: gemini-3.1-flash-image (~7s), gemini-2.5-flash-image (~4s). gemini-3-pro-image works too (~15s). */
export const IMAGE_MODELS_DEFAULT = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];

export async function generateImage(
  prompt: string,
  opts: { image?: { mimeType: string; data: string }; aspectRatio?: string; model?: string; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ bytes: Uint8Array; mimeType: string; model: string }> {
  const e = env();
  const list = opts.model ? [opts.model] : [...new Set([e.MODEL_IMAGE, ...IMAGE_MODELS_DEFAULT].filter(Boolean) as string[])];
  const parts: Part[] = [];
  if (opts.image) parts.push({ inlineData: opts.image });
  parts.push({ text: prompt });
  const r = await generate(e, {
    models: list,
    contents: [{ role: "user", parts }],
    timeoutMs: opts.timeoutMs ?? 60_000,
    attempts: 1,
    signal: opts.signal,
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      ...(opts.aspectRatio ? { imageConfig: { aspectRatio: opts.aspectRatio } } : {}),
    },
  });
  const img = inlinePart(r.parts);
  if (!img) throw new GeminiError(`${r.model}: no image in response (${r.finishReason ?? "?"})`, 502, r.model, true);
  return { bytes: b64ToBytes(img.data), mimeType: img.mimeType || "image/png", model: r.model };
}

// ---------------------------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------------------------

/** Verified live Sat Nov 7: gemini-3.8-flash-tts returns audio/wav (~2.7s); 2.5-flash-tts returns raw L16 PCM. */
export const TTS_MODELS_DEFAULT = ["gemini-3.8-flash-tts", "gemini-2.5-flash-tts"];
/** Prebuilt Gemini voices. "future" reads as older and warmer. */
export const VOICES = { future: "Gacrux", futureAlt: "Algenib", interviewer: "Sulafat" } as const;

export async function tts(
  text: string,
  opts: { voice?: string; style?: string; model?: string; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ bytes: Uint8Array; mimeType: "audio/wav"; model: string }> {
  const e = env();
  const list = opts.model ? [opts.model] : [...new Set([e.MODEL_TTS, ...TTS_MODELS_DEFAULT].filter(Boolean) as string[])];
  const say = opts.style ? `${opts.style}: ${text}` : text;
  const r = await generate(e, {
    models: list,
    contents: say,
    timeoutMs: opts.timeoutMs ?? 45_000,
    attempts: 1,
    signal: opts.signal,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice ?? VOICES.future } } },
    },
  });
  const audio = inlinePart(r.parts);
  if (!audio) throw new GeminiError(`${r.model}: no audio in response`, 502, r.model, true);
  const pcm = b64ToBytes(audio.data);
  if (/wav/i.test(audio.mimeType)) return { bytes: pcm, mimeType: "audio/wav", model: r.model };
  const rate = Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] ?? 24000);
  return { bytes: pcmToWav(pcm, rate), mimeType: "audio/wav", model: r.model };
}

/** Wrap 16-bit mono little-endian PCM in a WAV header. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------------------------

export async function transcribe(audio: { mimeType: string; data: string }, opts: LlmOpts = {}): Promise<string> {
  const r = await generate(env(), {
    ...base("fast", [
      {
        role: "user",
        parts: [
          { inlineData: audio },
          { text: "Transcribe this audio verbatim. Return only the words spoken, no labels or notes. If silent, return nothing." },
        ],
      },
    ], opts),
    timeoutMs: opts.timeoutMs ?? 30_000,
  });
  return r.text.trim();
}
