/**
 * Worker entry. Static assets (the SPA) are served by Workers Static Assets; only /api/*, /agents/*
 * and /media/* reach this code (wrangler.jsonc run_worker_first). Never log request bodies.
 *
 *   /agents/session-agent/<sessionId>   SessionAgent Durable Object (WebSocket + RPC), Agents SDK
 *   GET  /api/health · POST /api/smoke · GET /api/demo · GET /api/demo/life/:key (SSE envelope)
 *   POST /api/transcribe · /api/portrait · /api/tts · /api/upload · GET /media/<key>   (worker/media.ts)
 *   GET  /api/admin/sessions · /api/admin/session/:id · /api/admin/ping               (worker/admin.ts)
 */
import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import demo from "../shared/demo/alex.json";
import { LIFE_KEYS, type LifeKey } from "../shared/lives";
import { DemoBundle } from "../shared/schema";
import { admin } from "./admin";
import { wantsReal } from "./engine-select";
import { GeminiError, GenerationDisabledError, generate, generationEnabled, stream, textDeltas } from "./gemini";
import { bindLlm, type LlmEnv } from "./llm";
import { media } from "./media";
import { sseResponse } from "./sse";

export { SessionAgent } from "./agent/session-agent";
export { requireAdmin } from "./admin";

type AppEnv = { Bindings: Env };
const app = new Hono<AppEnv>();

const DEMO = DemoBundle.parse(demo);
const HAS_REAL_ENGINE = Object.keys(import.meta.glob("./engine/index.ts")).length > 0;

app.get("/api/health", async (c) => {
  let db = false;
  try {
    db = (await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>())?.ok === 1;
  } catch {
    db = false;
  }
  const env = c.env as Env & { MODEL_IMAGE?: string; MODEL_TTS?: string; ENGINE?: string };
  return c.json({
    ok: true,
    service: "every-life-you-have-left",
    time: new Date().toISOString(),
    generation: generationEnabled(c.env),
    engine: wantsReal(c.env) && HAS_REAL_ENGINE ? "real" : "mock",
    engineVar: env.ENGINE ?? "real",
    realEngineBuilt: HAS_REAL_ENGINE,
    db,
    models: {
      heavy: c.env.MODEL_HEAVY,
      fast: c.env.MODEL_FAST,
      quality: c.env.MODEL_QUALITY,
      fallback: c.env.MODEL_FALLBACK,
      image: env.MODEL_IMAGE,
      tts: env.MODEL_TTS,
    },
  });
});

/**
 * Tiny live Gemini check via MODEL_FAST. Returns no model text and never echoes the prompt.
 * ?stream=1 exercises the streaming path (stream() + textDeltas()) instead.
 */
app.post("/api/smoke", async (c) => {
  const opts = {
    models: [c.env.MODEL_FAST],
    contents: "Reply with exactly one word: ok",
    maxOutputTokens: 16,
    timeoutMs: 15_000,
    attempts: 1,
    signal: c.req.raw.signal,
  };
  try {
    if (c.req.query("stream")) {
      const t0 = Date.now();
      const { res, model } = await stream(c.env, opts);
      let chunks = 0;
      let text = "";
      for await (const d of textDeltas(res)) {
        chunks++;
        text += d.text;
      }
      return c.json({ ok: text.trim().length > 0, model, ms: Date.now() - t0, chunks });
    }
    const r = await generate(c.env, opts);
    return c.json({ ok: r.text.trim().length > 0, model: r.model, ms: r.ms });
  } catch (e) {
    if (e instanceof GenerationDisabledError) return c.json({ ok: false, error: "generation_disabled" }, 503);
    const status = e instanceof GeminiError ? e.status : 500;
    return c.json({ ok: false, error: "gemini_error", status }, 502);
  }
});

/**
 * Streams a pre-made demo life (Alex) through the SSE envelope. For UI development and the
 * offline/kill-switch fallback. ?ms=25 sets the delay per chunk.
 */
app.get("/api/demo/life/:key", (c) => {
  const key = c.req.param("key") as LifeKey;
  if (!LIFE_KEYS.includes(key)) return c.json({ ok: false, error: "unknown life key" }, 404);
  const life = DEMO.lives.find((l) => l.key === key)!;
  const delay = Math.min(500, Math.max(0, Number(c.req.query("ms") ?? 25)));
  const signal = c.req.raw.signal;
  return sseResponse(async (send) => {
    const t0 = Date.now();
    send({ type: "meta", lifeKey: key, model: "demo", requestId: crypto.randomUUID() });
    const text = JSON.stringify(life);
    for (let i = 0; i < text.length && !signal.aborted; i += 400) {
      send({ type: "delta", lifeKey: key, text: text.slice(i, i + 400) });
      if (delay) await new Promise((r) => setTimeout(r, delay));
    }
    send({ type: "result", lifeKey: key, data: life });
    send({ type: "done", lifeKey: key, ms: Date.now() - t0 });
  }, signal);
});

/** The whole demo bundle (profile, plan, 4 lives, pause, re-tune). */
app.get("/api/demo", (c) => c.json(DEMO));

app.route("/", media);
app.route("/", admin);

app.all("/api/*", (c) => c.json({ ok: false, error: "not_found" }, 404));

app.onError((e, c) => {
  console.error("unhandled", e instanceof Error ? e.name : "error"); // no bodies, no messages with user data
  return c.json({ ok: false, error: "internal" }, 500);
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    bindLlm(env as unknown as LlmEnv);
    const url = new URL(request.url);
    if (url.pathname.startsWith("/agents/")) {
      const res = await routeAgentRequest(request, env);
      return res ?? new Response("Not found", { status: 404 });
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
