/**
 * Admin API (D-033), header `x-admin-passcode: <ADMIN_PASSCODE>`:
 *   GET /api/admin/ping
 *   GET /api/admin/sessions?limit=100      newest first, summary columns + counts
 *   GET /api/admin/session/:id             everything saved for one session (JSON columns parsed)
 */
import { Hono, type MiddlewareHandler } from "hono";

type AppEnv = { Bindings: Env };
export const admin = new Hono<AppEnv>();

/** Constant-time-ish compare; passcode is the ADMIN_PASSCODE secret. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const given = c.req.header("x-admin-passcode") ?? "";
  const want = c.env.ADMIN_PASSCODE ?? "";
  let diff = given.length ^ want.length;
  for (let i = 0; i < Math.max(given.length, want.length); i++) diff |= (given.charCodeAt(i) || 0) ^ (want.charCodeAt(i) || 0);
  if (!want || diff !== 0) return c.json({ ok: false, error: "unauthorized" }, 401);
  await next();
};

admin.use("/api/admin/*", requireAdmin);

admin.get("/api/admin/ping", (c) => c.json({ ok: true }));

const parse = (s: unknown) => {
  if (typeof s !== "string") return s ?? null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

admin.get("/api/admin/sessions", async (c) => {
  const limit = Math.max(1, Math.min(500, Number(c.req.query("limit") ?? 100)));
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.created_at, s.updated_at, s.first_name, s.age, s.city, s.country, s.speed, s.phase, s.engine,
            s.end_age, s.playhead_year,
            (SELECT COUNT(*) FROM sim_decisions d WHERE d.session_id = s.id) AS decisions,
            (SELECT COUNT(*) FROM sim_answers a WHERE a.session_id = s.id) AS answers,
            (SELECT COUNT(*) FROM sim_years y WHERE y.session_id = s.id) AS years,
            (SELECT COUNT(*) FROM sim_chat m WHERE m.session_id = s.id) AS chat
       FROM sim_sessions s ORDER BY s.updated_at DESC LIMIT ?1`,
  )
    .bind(limit)
    .all();
  return c.json({ ok: true, sessions: results });
});

admin.get("/api/admin/session/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const q = (sql: string) => db.prepare(sql).bind(id);
  const [session, decisions, answers, years, branches, settings, nudges, chat, uploads, mediaRows] = await db.batch([
    q(`SELECT * FROM sim_sessions WHERE id = ?1`),
    q(`SELECT json FROM sim_decisions WHERE session_id = ?1 ORDER BY year, created_at`),
    q(`SELECT * FROM sim_answers WHERE session_id = ?1 ORDER BY id`),
    q(`SELECT json FROM sim_years WHERE session_id = ?1 ORDER BY year`),
    q(`SELECT json FROM sim_branches WHERE session_id = ?1 ORDER BY updated_at`),
    q(`SELECT json, created_at FROM sim_settings WHERE session_id = ?1 ORDER BY id`),
    q(`SELECT * FROM sim_nudges WHERE session_id = ?1 ORDER BY id`),
    q(`SELECT * FROM sim_chat WHERE session_id = ?1 ORDER BY created_at`),
    q(`SELECT id, kind, r2_key, filename, length(text) AS chars, substr(text, 1, 400) AS excerpt, created_at FROM sim_uploads WHERE session_id = ?1 ORDER BY created_at`),
    q(`SELECT * FROM sim_media WHERE session_id = ?1 ORDER BY created_at`),
  ]);
  const s = session?.results?.[0] as Record<string, unknown> | undefined;
  if (!s) return c.json({ ok: false, error: "not_found" }, 404);
  const jsonCol = (r: D1Result | undefined) => (r?.results ?? []).map((x) => parse((x as { json: string }).json));
  return c.json({
    ok: true,
    session: { ...s, start_json: undefined, profile_json: undefined, ending_json: undefined, start: parse(s.start_json), profile: parse(s.profile_json), ending: parse(s.ending_json) },
    decisions: jsonCol(decisions),
    answers: answers?.results ?? [],
    years: jsonCol(years),
    branches: jsonCol(branches),
    settings: (settings?.results ?? []).map((x) => ({ at: (x as { created_at: string }).created_at, settings: parse((x as { json: string }).json) })),
    nudges: nudges?.results ?? [],
    chat: chat?.results ?? [],
    uploads: uploads?.results ?? [],
    media: (mediaRows?.results ?? []).map((m) => ({ ...(m as object), url: `/media/${(m as { key: string }).key}` })),
  });
});
