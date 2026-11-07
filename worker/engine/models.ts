/**
 * Engine-side model calls: routing (Gemini vs the OpenAI-compatible gpt-oss endpoint), hedged
 * requests, usage reporting and zod parsing. Everything else in the engine calls through here.
 *
 * Hedging: on Sat Nov 7 ~2:40am we measured gemini-3.8-flash streams that stall ~25 s after the
 * headers in about 1 of 3 calls. A second identical request started after `hedgeMs` without a
 * first token wins in those cases; the loser is aborted, so the extra spend is bounded.
 */
import type { z } from "zod";
import { geminiSchema } from "../../shared/schema";
import { extractJsonText, isOpenAIModel, LlmError, type LlmPort, type LlmTurn, type LlmUsage, type ThinkingLevel } from "./llm-port";

export type Tier = "heavy" | "fast" | "branch" | "repair";

export interface EngineModels {
  /** Lives, big decisions, profile, ending, chat. Default gemini-3.8-flash (thinking low). */
  heavy: string;
  /** Small decisions, answer folding, safety, captions. Default gemini-3.5-flash-lite. */
  fast: string;
  /** Coarse hidden-branch steps. Default = fast. */
  branch: string;
  /** Validator repair calls. Default = heavy. */
  repair: string;
  /**
   * Chosen-life years model per playback speed (falls back to `heavy`). Auto plays a year every
   * 1.5 s, so its writer must produce a year in < 1.5 s; 1x plays one every 6 s.
   */
  yearsBySpeed: Partial<Record<"1x" | "2x" | "4x" | "auto", string>>;
  /** Fallback model raced in when a request and its hedge both stall ("" = none). Default gemini-3.6-flash. */
  fallback: string;
  /** Thinking level for Gemini 3.x heavy calls ("low" per D-062). */
  heavyThinking: ThinkingLevel;
}

export const DEFAULT_MODELS: EngineModels = {
  heavy: "gemini-3.8-flash",
  fast: "gemini-3.5-flash-lite",
  branch: "gemini-3.5-flash-lite",
  repair: "gemini-3.8-flash",
  fallback: "gemini-3.6-flash",
  yearsBySpeed: {},
  heavyThinking: "low",
};

export interface UsageEvent extends LlmUsage {
  /** What the call was for: "profile", "years", "decision.big", ... */
  purpose: string;
  hedged: boolean;
}

export interface CallerDeps {
  llm: LlmPort;
  models: EngineModels;
  onUsage?: (u: UsageEvent) => void;
}

export interface JsonCall<S extends z.ZodType> {
  tier: Tier;
  purpose: string;
  system: string;
  prompt: string;
  history?: LlmTurn[];
  schema: S;
  maxOutputTokens?: number;
  /** Start a duplicate request if the first has not answered after this long. 0 = never. */
  hedgeMs?: number;
  timeoutMs?: number;
}

export function modelFor(models: EngineModels, tier: Tier): string {
  switch (tier) {
    case "heavy":
      return models.heavy;
    case "fast":
      return models.fast;
    case "branch":
      return models.branch;
    case "repair":
      return models.repair;
  }
}

function thinkingFor(models: EngineModels, model: string, tier: Tier): ThinkingLevel | undefined {
  if (isOpenAIModel(model)) return undefined;
  if (/flash-lite/.test(model)) return undefined; // levels not listed for 3.5 Flash-Lite; its default is fast
  if (tier === "fast") return "low";
  return models.heavyThinking;
}

/** Run `fn` once; if it hasn't settled after `hedgeMs` (or fails), run it again; first success wins. */
export function hedged<T>(fn: (signal: AbortSignal) => Promise<T>, hedgeMs: number): Promise<{ value: T; hedged: boolean }> {
  return new Promise((resolve, reject) => {
    const acs: AbortController[] = [];
    let done = false;
    let failed = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const launch = (isHedge: boolean) => {
      const ac = new AbortController();
      acs.push(ac);
      fn(ac.signal).then(
        (value) => {
          if (done) return;
          done = true;
          if (timer !== undefined) clearTimeout(timer);
          for (const c of acs) if (c !== ac) c.abort();
          resolve({ value, hedged: isHedge });
        },
        (err: unknown) => {
          failed++;
          if (done) return;
          const fatal = err instanceof LlmError && !err.retryable;
          if (acs.length < 2 && !fatal && hedgeMs) {
            if (timer !== undefined) clearTimeout(timer);
            launch(true);
            return;
          }
          if (failed >= acs.length) {
            done = true;
            if (timer !== undefined) clearTimeout(timer);
            reject(err);
          }
        },
      );
    };
    launch(false);
    if (hedgeMs) timer = setTimeout(() => !done && acs.length < 2 && launch(true), hedgeMs);
  });
}

/** First-token deadlines before a duplicate request is started (see json()). */
export const HEAVY_FIRST_TOKEN_MS = 5000;
export const FAST_FIRST_TOKEN_MS = 3500;
/** Give up (retryable) if neither the request nor its hedge produced a token by then. */
export const FIRST_TOKEN_DEADLINE_MS = 30_000;
/** Abort a stream that sends nothing for this long after it started. */
export const STREAM_IDLE_MS = 20_000;
const SLOW_FIRST_TOKEN = /argon|pro|gpt-oss/;

const jsonInstruction = (system: string, schema: Record<string, unknown> | undefined) =>
  schema ? `${system}\n\nReply with one JSON object only (no prose, no code fences), matching this JSON Schema:\n${JSON.stringify(schema)}` : system;

export function createCaller(deps: CallerDeps) {
  const { llm, models } = deps;
  const report = (purpose: string, usage: LlmUsage, wasHedged: boolean) => deps.onUsage?.({ ...usage, purpose, hedged: wasHedged });

  /**
   * One JSON call, parsed and zod-validated. Returns the raw object too (for code-side fixes).
   * Runs over the streaming endpoint so the hedge can fire on time-to-first-token: the stalls
   * we measured (25-60 s) all happen before the first token, while normal first tokens take
   * 0.5-2 s. `hedgeMs` is therefore a first-token deadline (default 5 s heavy, 3.5 s fast).
   */
  async function json<S extends z.ZodType>(c: JsonCall<S>): Promise<{ data: z.infer<S> | null; raw: unknown; issues: string[]; model: string }> {
    const model = modelFor(models, c.tier);
    let text = "";
    for await (const d of stream({
      tier: c.tier,
      purpose: c.purpose,
      system: c.system,
      prompt: c.prompt,
      history: c.history,
      schema: c.schema,
      maxOutputTokens: c.maxOutputTokens,
      hedgeMs: c.tier === "fast" || c.tier === "branch" ? FAST_FIRST_TOKEN_MS : HEAVY_FIRST_TOKEN_MS,
    }))
      text += d;
    return parseJson(c.schema, text, model);
  }

  function parseJson<S extends z.ZodType>(schema: S, text: string, model: string): { data: z.infer<S> | null; raw: unknown; issues: string[]; model: string } {
    let raw: unknown;
    try {
      raw = JSON.parse(extractJsonText(text));
    } catch {
      return { data: null, raw: null, issues: ["response was not valid JSON"], model };
    }
    const parsed = schema.safeParse(raw);
    if (parsed.success) return { data: parsed.data, raw, issues: [], model };
    return { data: null, raw, issues: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".")}: ${i.message}`), model };
  }

  /** Non-streaming variant (kept for callers that need generateJSON semantics, e.g. the Worker port). */
  async function jsonOnce<S extends z.ZodType>(c: JsonCall<S>): Promise<{ data: z.infer<S> | null; raw: unknown; issues: string[]; model: string }> {
    const model = modelFor(models, c.tier);
    const jsonSchema = geminiSchema(c.schema);
    const run = async (signal: AbortSignal): Promise<{ text: string; usage: LlmUsage }> => {
      if (isOpenAIModel(model)) {
        const r = await llm.chatCompletionsOpenAI({
          model,
          messages: [
            { role: "system", content: jsonInstruction(c.system, jsonSchema) },
            ...(c.history ?? []).map((t) => ({ role: t.role, content: t.text })),
            { role: "user", content: c.prompt },
          ],
          jsonSchema,
          maxTokens: c.maxOutputTokens ? c.maxOutputTokens + 3000 : undefined,
          reasoningEffort: "low",
          timeoutMs: c.timeoutMs,
          signal,
        });
        return { text: r.text, usage: r.usage };
      }
      const r = await llm.generateJSON<unknown>({
        model,
        system: c.system,
        prompt: c.prompt,
        history: c.history,
        schema: jsonSchema,
        thinkingLevel: thinkingFor(models, model, c.tier),
        maxOutputTokens: c.maxOutputTokens,
        timeoutMs: c.timeoutMs,
        signal,
      });
      return { text: r.text, usage: r.usage };
    };
    const { value, hedged: wasHedged } = await hedged(run, c.hedgeMs ?? 0);
    report(c.purpose, value.usage, wasHedged);
    return parseJson(c.schema, value.text, model);
  }

  interface StreamCall {
    tier: Tier;
    purpose: string;
    system: string;
    prompt: string;
    history?: LlmTurn[];
    schema?: z.ZodType;
    maxOutputTokens?: number;
    /** Start a duplicate stream if no first token arrives within this long. 0 = never. */
    hedgeMs?: number;
    /** Use this model instead of the tier's (e.g. the per-speed years model). */
    model?: string;
  }

  type Chunk = { text: string; usage?: LlmUsage };
  type Src = { ac: AbortController; it: AsyncIterator<Chunk> };

  function open(c: StreamCall, model: string, jsonSchema: Record<string, unknown> | undefined): Src {
    const ac = new AbortController();
    if (!isOpenAIModel(model)) {
      const iterable = llm.streamText({
        model,
        system: c.system,
        prompt: c.prompt,
        history: c.history,
        schema: jsonSchema,
        thinkingLevel: thinkingFor(models, model, c.tier),
        maxOutputTokens: c.maxOutputTokens,
        signal: ac.signal,
      });
      return { ac, it: iterable[Symbol.asyncIterator]() };
    }
    // Adapt the callback-style OpenAI stream to an async iterator.
    const queue: Chunk[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let error: unknown = null;
    llm
      .chatCompletionsOpenAI({
        model,
        messages: [
          { role: "system", content: jsonInstruction(c.system, jsonSchema) },
          ...(c.history ?? []).map((t) => ({ role: t.role, content: t.text })),
          { role: "user", content: c.prompt },
        ],
        jsonSchema,
        maxTokens: c.maxOutputTokens ? c.maxOutputTokens + 3000 : undefined,
        reasoningEffort: "low",
        signal: ac.signal,
        onDelta: (t) => {
          queue.push({ text: t });
          wake?.();
        },
      })
      .then((r) => void queue.push({ text: "", usage: r.usage }))
      .catch((e: unknown) => void (error = e))
      .finally(() => {
        finished = true;
        wake?.();
      });
    const it: AsyncIterator<Chunk> = {
      async next() {
        for (;;) {
          if (queue.length) return { value: queue.shift()!, done: false };
          if (error) throw error;
          if (finished) return { value: undefined, done: true };
          await new Promise<void>((r) => (wake = r));
          wake = null;
        }
      },
    };
    return { ac, it };
  }

  /**
   * Streamed call: yields raw text deltas. Hedged on time-to-first-token. Works for JSON (schema
   * set) and plain text. Usage is reported when the stream ends.
   */
  async function* stream(c: StreamCall): AsyncGenerator<string> {
    const model = c.model || modelFor(models, c.tier);
    const jsonSchema = c.schema ? geminiSchema(c.schema) : undefined;
    type First = { kind: "ok"; s: Src; chunk: Chunk | null } | { kind: "err"; s: Src; err: unknown };
    // Thinking-first models (argon, gpt-oss) normally take 5-15 s to a first token: hedge later, wait longer.
    const slow = SLOW_FIRST_TOKEN.test(model);
    const hedgeMs = c.hedgeMs ? (slow ? Math.max(c.hedgeMs, 15_000) : c.hedgeMs) : 0;
    const deadlineMs = slow ? 2 * FIRST_TOKEN_DEADLINE_MS : FIRST_TOKEN_DEADLINE_MS;
    const firstText = (s: Src): Promise<First> =>
      (async (): Promise<First> => {
        for (;;) {
          const r = await s.it.next();
          if (r.done) return { kind: "ok", s, chunk: null };
          if (r.value.text || r.value.usage) return { kind: "ok", s, chunk: r.value };
        }
      })().catch((err: unknown): First => ({ kind: "err", s, err }));
    const sources: Src[] = [];
    const pending = new Map<Src, Promise<First>>();
    const add = (m = model) => {
      const s = open(c, m, jsonSchema);
      sources.push(s);
      pending.set(s, firstText(s));
    };
    // Third racer: the fallback model (D-062 chain), if the request and its hedge both stall.
    const fallbackModel = models.fallback && models.fallback !== model && !isOpenAIModel(model) ? models.fallback : null;
    const t0 = Date.now();
    add();
    let winner: Src | null = null;
    let firstChunk: Chunk | null = null;
    const deadline = t0 + deadlineMs;
    while (!winner) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let stop: ReturnType<typeof setTimeout> | undefined;
      const racers: Promise<First | { kind: "hedge" } | { kind: "fallback" } | { kind: "deadline" }>[] = [...pending.values()];
      if (hedgeMs && sources.length === 1) racers.push(new Promise((r) => (timer = setTimeout(() => r({ kind: "hedge" }), Math.max(0, t0 + hedgeMs - Date.now())))));
      else if (hedgeMs && sources.length === 2 && fallbackModel)
        racers.push(new Promise((r) => (timer = setTimeout(() => r({ kind: "fallback" }), Math.max(0, t0 + 2.5 * hedgeMs - Date.now())))));
      racers.push(new Promise((r) => (stop = setTimeout(() => r({ kind: "deadline" }), Math.max(0, deadline - Date.now())))));
      const got = await Promise.race(racers);
      if (timer) clearTimeout(timer);
      if (stop) clearTimeout(stop);
      if (got.kind === "deadline") {
        for (const s of sources) s.ac.abort();
        throw new LlmError(`${model}: no first token in ${deadlineMs}ms`, 504, model, true);
      }
      if (got.kind === "hedge") {
        add();
        continue;
      }
      if (got.kind === "fallback") {
        add(fallbackModel!);
        continue;
      }
      if (got.kind === "err") {
        pending.delete(got.s);
        const fatal = got.err instanceof LlmError && !got.err.retryable && got.err.status !== 404;
        if (sources.length < 2 && !fatal) add();
        else if (pending.size === 0 && fallbackModel && sources.length < 3) add(fallbackModel);
        else if (pending.size === 0) throw got.err;
        continue;
      }
      winner = got.s;
      firstChunk = got.chunk;
    }
    const wasHedged = winner !== sources[0];
    for (const s of sources) if (s !== winner) s.ac.abort();

    if (firstChunk?.usage) report(c.purpose, firstChunk.usage, wasHedged);
    if (firstChunk?.text) yield firstChunk.text;
    const w = winner;
    for (;;) {
      // idle timeout: a stream that goes silent mid-way is aborted (the caller retries the rest)
      let idle: ReturnType<typeof setTimeout> | undefined;
      const r = await Promise.race([
        w.it.next(),
        new Promise<never>((_, rej) => (idle = setTimeout(() => rej(new LlmError(`${model}: stream idle ${STREAM_IDLE_MS}ms`, 504, model, true)), STREAM_IDLE_MS))),
      ]).catch((e: unknown) => {
        w.ac.abort();
        throw e;
      }).finally(() => idle && clearTimeout(idle));
      if (r.done) break;
      if (r.value.usage) report(c.purpose, r.value.usage, wasHedged);
      if (r.value.text) yield r.value.text;
    }
  }

  return { json, jsonOnce, stream, model: (t: Tier) => modelFor(models, t) };
}

export type Caller = ReturnType<typeof createCaller>;
