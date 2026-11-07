/**
 * API Worker (Hono). Static assets (the SPA) are served by Workers Static Assets; only /api/*
 * reaches this code (wrangler.jsonc run_worker_first). Never log request bodies.
 *
 * Routes (WP0):  GET /api/health · POST /api/smoke · GET /api/demo/life/:key (SSE envelope)
 *                GET /api/admin/ping (x-admin-passcode)
 * Planned routes: docs/PLAN.md §1.
 */
import { Hono, type MiddlewareHandler } from "hono";
import demo from "../shared/demo/alex.json";
import { LIFE_KEYS, type LifeKey } from "../shared/lives";
import { DemoBundle } from "../shared/schema";
import { GeminiError, GenerationDisabledError, generate, generationEnabled, stream, textDeltas } from "./gemini";
import { sseResponse } from "./sse";

type AppEnv = { Bindings: Env };
const app = new Hono<AppEnv>();

const DEMO = DemoBundle.parse(demo);

/** Admin guard (D-033). Constant-time-ish compare; passcode is the ADMIN_PASSCODE secret. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const given = c.req.header("x-admin-passcode") ?? "";
  const want = c.env.ADMIN_PASSCODE ?? "";
  let diff = given.length ^ want.length;
  for (let i = 0; i < Math.max(given.length, want.length); i++) diff |= (given.charCodeAt(i) || 0) ^ (want.charCodeAt(i) || 0);
  if (!want || diff !== 0) return c.json({ ok: false, error: "unauthorized" }, 401);
  await next();
};

app.get("/api/health", async (c) => {
  let db = false;
  try {
    db = (await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>())?.ok === 1;
  } catch {
    db = false;
  }
  return c.json({
    ok: true,
    service: "every-life-you-have-left",
    time: new Date().toISOString(),
    generation: generationEnabled(c.env),
    db,
    models: {
      heavy: c.env.MODEL_HEAVY,
      fast: c.env.MODEL_FAST,
      quality: c.env.MODEL_QUALITY,
      fallback: c.env.MODEL_FALLBACK,
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
 * Streams a pre-made demo life (Alex) through the same SSE envelope the real /api/life will use.
 * For UI development and the offline/kill-switch fallback. ?ms=25 sets the delay per chunk.
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

app.get("/api/admin/ping", requireAdmin, (c) => c.json({ ok: true }));

app.all("/api/*", (c) => c.json({ ok: false, error: "not_found" }, 404));

app.onError((e, c) => {
  console.error("unhandled", e instanceof Error ? e.name : "error"); // no bodies, no messages with user data
  return c.json({ ok: false, error: "internal" }, 500);
});

export default app;
