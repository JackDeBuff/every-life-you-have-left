/**
 * Admin API (D-033) for /admin (src/screens/Admin.tsx). Header `x-admin-passcode: <ADMIN_PASSCODE>`.
 * Every response is no-store and noindex.
 *   GET /api/admin/ping
 *   GET /api/admin/sessions?limit=200          newest first: summary columns + counts (D1)
 *   GET /api/admin/session/:id                 every D1 row for the session (JSON columns parsed)
 *                                              + `live`: the session's Durable Object state (AgentState)
 *   GET /api/admin/session/:id/checks          the engine's pure code checks over the stored session
 *   GET /api/admin/spend                       the app-wide ledger (worker/spend.ts), caps and the price table
 *
 * Sources. D1 (worker/agent/mirror.ts) has the list columns and most of a session, but not the life
 * log, and only since 0004_admin.sql the spend, the warm-up and the engine log. The Durable Object
 * holds everything (AgentState), so the detail and the checks read it through the agent's admin-only
 * RPC (SessionAgent.adminSnapshot: plain stub, no onStart, so a read never resumes or changes a
 * session; passcode checked again there). Without it (an evicted class, local dev on the remote DB)
 * they fall back to the D1 copy.
 */
import { decryptText, type CryptoEnv } from "./crypto";
import { Hono, type MiddlewareHandler } from "hono";
import type { Ending } from "../shared/engine";
import type { Profile } from "../shared/schema";
import type { Branch, Decision, LiveSetting, Portrait, SimYear, StartInput } from "../shared/sim";
import type { AgentState, ChatMessage, SessionUsage, WarmupState } from "./agent/protocol";
import { Mirror } from "./agent/mirror";
import { runChecks } from "./admin-checks";
import { passcodeOk } from "./admin-auth";
import { PRICES_FIXED_AT, sessionCost } from "./admin-cost";
import { CACHED_INPUT_FACTOR, PRICES, SEARCH_QUERY_USD } from "./engine/pricing";
import { MEDIA_USD, sessionCaps, spendRows, spendStatus } from "./spend";

type AppEnv = { Bindings: Env };
export const admin = new Hono<AppEnv>();

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.header("cache-control", "no-store");
  c.header("x-robots-tag", "noindex, nofollow");
  if (!c.env.ADMIN_PASSCODE) return c.json({ ok: false, error: "admin_disabled" }, 401);
  if (!passcodeOk(c.req.header("x-admin-passcode") ?? "", c.env.ADMIN_PASSCODE)) return c.json({ ok: false, error: "unauthorized" }, 401);
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

/** ADMIN_BACKFILL=off: never write to D1 from these routes (local dev against the production DB). */
const backfillOn = (env: Env) => String((env as Env & { ADMIN_BACKFILL?: string }).ADMIN_BACKFILL ?? "on").toLowerCase() !== "off";

type Live = { state: AgentState; awake: boolean };
type AdminStub = {
  adminSnapshot(passcode: string): Promise<Live | null>;
  adminSummary(passcode: string): Promise<{ usage: SessionUsage | null | undefined; warmup: WarmupState | null | undefined; error: string | null } | null>;
};

/** A plain stub (not getAgentByName: that runs onStart, which may resume a warm-up). */
function agentStub(env: Env, id: string): AdminStub {
  const ns = env.SessionAgent as unknown as DurableObjectNamespace;
  return ns.get(ns.idFromName(id)) as unknown as AdminStub;
}

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<T>((_, rej) => (t = setTimeout(() => rej(new Error("timeout")), ms)))]).finally(() => clearTimeout(t));
}

async function readLive(env: Env, id: string): Promise<{ live: Live | null; error: string | null }> {
  try {
    const r = await within(agentStub(env, id).adminSnapshot(env.ADMIN_PASSCODE), 8000);
    if (r && r.state.sessionId !== id) return { live: null, error: "no_state" };
    return { live: r, error: r ? null : "no_state" };
  } catch (e) {
    return { live: null, error: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 160) : "error" };
  }
}

// ---------------------------------------------------------------------------------------------
// Sessions list
// ---------------------------------------------------------------------------------------------

/**
 * D-101: the team only sees lives whose owner ticked "help improve it" (StartInput.privacy.improve;
 * sessions from before the split have no privacy field and agreed to the old single consent).
 */
const SHAREABLE = `COALESCE(json_extract(s.start_json, '$.privacy.improve'), 1) != 0`;

/** A life the team may not open: incognito, or saved without "help improve it". */
function isPrivate(d: { start?: unknown } | null, live: { state: { privacy?: { save: boolean; improve: boolean } | null } } | null): boolean {
  const p = live?.state.privacy ?? (d?.start as { privacy?: { save: boolean; improve: boolean } } | null)?.privacy ?? null;
  return !!p && (!p.save || !p.improve);
}

const LIST_BASE = `s.id, s.created_at, s.updated_at, s.first_name, s.age, s.city, s.country, s.speed, s.phase, s.engine,
  s.end_age, s.playhead_year,
  (SELECT COUNT(*) FROM sim_decisions d WHERE d.session_id = s.id) AS decisions,
  (SELECT COUNT(*) FROM sim_decisions d WHERE d.session_id = s.id AND d.kind = 'big') AS forks,
  (SELECT COUNT(*) FROM sim_answers a WHERE a.session_id = s.id) AS answers,
  (SELECT COUNT(*) FROM sim_answers a WHERE a.session_id = s.id AND a.decision_id NOT LIKE 'w-%' AND a.slid = 0) AS answered,
  (SELECT COUNT(*) FROM sim_answers a WHERE a.session_id = s.id AND a.slid = 1) AS slid,
  (SELECT COUNT(*) FROM sim_answers a WHERE a.session_id = s.id AND a.decision_id LIKE 'w-%') AS warm_answered,
  (SELECT COUNT(*) FROM sim_years y WHERE y.session_id = s.id) AS years,
  (SELECT COUNT(*) FROM sim_chat m WHERE m.session_id = s.id) AS chat`;
// 0004_admin.sql columns; the list falls back to LIST_BASE before that migration is applied
const LIST_ADMIN = `, s.usage_usd, s.usage_json, s.warm_asked, s.last_error, (s.usage_json IS NOT NULL) AS has_usage,
  (SELECT COUNT(*) FROM sim_engine_log e WHERE e.session_id = s.id AND e.level = 'error') AS errors,
  (SELECT COUNT(*) FROM sim_engine_log e WHERE e.session_id = s.id AND e.level = 'warn') AS warnings`;

type ListRow = Record<string, unknown> & {
  id: string;
  phase: string | null;
  created_at?: string;
  updated_at?: string;
  has_usage?: number;
  usage_usd?: number | null;
  usage_json?: string | null;
  warm_asked?: number | null;
  last_error?: string | null;
};

admin.get("/api/admin/sessions", async (c) => {
  const limit = Math.max(1, Math.min(500, Number(c.req.query("limit") ?? 200)));
  const db = c.env.DB;
  let rows: ListRow[];
  let migrated = true;
  try {
    rows = (await db.prepare(`SELECT ${LIST_BASE}${LIST_ADMIN} FROM sim_sessions s WHERE ${SHAREABLE} ORDER BY s.created_at DESC LIMIT ?1`).bind(limit).all<ListRow>()).results;
  } catch {
    migrated = false;
    rows = (await db.prepare(`SELECT ${LIST_BASE} FROM sim_sessions s WHERE ${SHAREABLE} ORDER BY s.created_at DESC LIMIT ?1`).bind(limit).all<ListRow>()).results;
  }
  // Sessions mirrored before 0004_admin.sql: read spend / warm-up / last error from their Durable
  // Object (a few per request) and save them, so the list fills in over a couple of refreshes.
  if (migrated) {
    const todo = rows.filter((r) => !r.has_usage && r.phase && r.phase !== "start").slice(0, 6);
    const got = await Promise.all(
      todo.map((r) =>
        within(agentStub(c.env, r.id).adminSummary(c.env.ADMIN_PASSCODE), 4000)
          .then((x) => ({ r, x }))
          .catch(() => ({ r, x: undefined })),
      ),
    );
    const writes: D1PreparedStatement[] = [];
    for (const { r, x } of got) {
      if (x === undefined) continue; // unreachable now: try again next time
      const w = x?.warmup ?? null;
      const asked = w ? w.questions.filter((q) => q.status === "answered" || q.status === "skipped").length : null;
      r.usage_usd = x?.usage?.usd ?? null;
      r.usage_json = x?.usage ? JSON.stringify(x.usage) : null;
      r.warm_asked = asked;
      r.last_error = x?.error ?? null;
      r.has_usage = 1;
      writes.push(
        db
          .prepare(`UPDATE sim_sessions SET usage_usd = ?2, usage_json = ?3, warm_asked = ?4, warmup_json = COALESCE(warmup_json, ?5), last_error = COALESCE(last_error, ?6) WHERE id = ?1`)
          // 'null' (JSON) marks "looked, nothing there" so it isn't asked again
          .bind(r.id, r.usage_usd, x?.usage ? JSON.stringify(x.usage) : "null", asked, w ? JSON.stringify(w) : null, r.last_error),
      );
    }
    if (writes.length && backfillOn(c.env)) c.executionCtx.waitUntil(db.batch(writes).catch(() => undefined));
  }
  // Recorded vs corrected cost (worker/admin-cost.ts); usage_json itself stays out of the list.
  const sessions = rows.map(({ usage_json, ...r }) => {
    const cv = sessionCost(parse(usage_json) as SessionUsage | null, r.created_at, r.updated_at);
    return { ...r, usage_corrected: cv?.corrected ?? r.usage_usd ?? null, old_rates: cv?.oldRates ?? "no" };
  });
  return c.json({ ok: true, migrated, sessions });
});

// ---------------------------------------------------------------------------------------------
// Spend (worker/spend.ts)
// ---------------------------------------------------------------------------------------------

admin.get("/api/admin/spend", async (c) => {
  let rows: Awaited<ReturnType<typeof spendRows>> = [];
  let error: string | null = null;
  try {
    rows = await spendRows(c.env);
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 160) : "error";
  }
  return c.json({
    ok: true,
    status: await spendStatus(c.env),
    error,
    rows,
    sessionCaps: sessionCaps(c.env),
    prices: PRICES,
    cachedInputFactor: CACHED_INPUT_FACTOR,
    searchQueryUsd: SEARCH_QUERY_USD,
    media: MEDIA_USD,
    pricesFixedAt: PRICES_FIXED_AT,
  });
});

// ---------------------------------------------------------------------------------------------
// One session
// ---------------------------------------------------------------------------------------------

interface D1Detail {
  row: Record<string, unknown>;
  start: StartInput | null;
  profile: Profile | null;
  ending: Ending | null;
  usage: SessionUsage | null;
  warmup: WarmupState | null;
  decisions: Decision[];
  decisionTimes: Record<string, { created: string; updated: string }>;
  answers: Record<string, unknown>[];
  years: SimYear[];
  branches: Branch[];
  settings: { at: string; settings: LiveSetting[] }[];
  nudges: Record<string, unknown>[];
  chat: Record<string, unknown>[];
  uploads: Record<string, unknown>[];
  media: Record<string, unknown>[];
  engineLog: Record<string, unknown>[];
}

async function readD1(db: D1Database, id: string): Promise<D1Detail | null> {
  const q = (sql: string) => db.prepare(sql).bind(id);
  const [session, decisions, decisionTimes, answers, years, branches, settings, nudges, chat, uploads, mediaRows] = await db.batch([
    q(`SELECT * FROM sim_sessions WHERE id = ?1`),
    q(`SELECT json FROM sim_decisions WHERE session_id = ?1 ORDER BY year, created_at`),
    q(`SELECT id, created_at, updated_at FROM sim_decisions WHERE session_id = ?1`),
    q(`SELECT * FROM sim_answers WHERE session_id = ?1 ORDER BY id`),
    q(`SELECT json FROM sim_years WHERE session_id = ?1 ORDER BY year`),
    q(`SELECT json FROM sim_branches WHERE session_id = ?1 ORDER BY updated_at`),
    q(`SELECT json, created_at FROM sim_settings WHERE session_id = ?1 ORDER BY id`),
    q(`SELECT * FROM sim_nudges WHERE session_id = ?1 ORDER BY id`),
    q(`SELECT * FROM sim_chat WHERE session_id = ?1 ORDER BY created_at`),
    q(`SELECT id, kind, r2_key, filename, length(text) AS chars, text, created_at FROM sim_uploads WHERE session_id = ?1 ORDER BY created_at`),
    q(`SELECT * FROM sim_media WHERE session_id = ?1 ORDER BY created_at`),
  ]);
  const s = session?.results?.[0] as Record<string, unknown> | undefined;
  if (!s) return null;
  let engineLog: Record<string, unknown>[] = [];
  try {
    engineLog = (await q(`SELECT level, code, life, year, detail, created_at FROM sim_engine_log WHERE session_id = ?1 ORDER BY id`).all()).results as Record<string, unknown>[];
  } catch {
    /* before 0004_admin.sql */
  }
  const jsonCol = <T>(r: D1Result | undefined) => (r?.results ?? []).map((x) => parse((x as { json: string }).json) as T);
  const { start_json, profile_json, ending_json, usage_json, warmup_json, ...row } = s;
  return {
    row,
    start: parse(start_json) as StartInput | null,
    profile: parse(profile_json) as Profile | null,
    ending: parse(ending_json) as Ending | null,
    usage: (parse(usage_json) as SessionUsage | null) ?? null,
    warmup: (parse(warmup_json) as WarmupState | null) ?? null,
    decisions: jsonCol<Decision>(decisions),
    decisionTimes: Object.fromEntries((decisionTimes?.results ?? []).map((x) => { const r = x as { id: string; created_at: string; updated_at: string }; return [r.id, { created: r.created_at, updated: r.updated_at }]; })),
    answers: (answers?.results ?? []) as Record<string, unknown>[],
    years: jsonCol<SimYear>(years),
    branches: jsonCol<Branch>(branches),
    settings: (settings?.results ?? []).map((x) => ({ at: (x as { created_at: string }).created_at, settings: parse((x as { json: string }).json) as LiveSetting[] })),
    nudges: (nudges?.results ?? []) as Record<string, unknown>[],
    chat: (chat?.results ?? []) as Record<string, unknown>[],
    uploads: (uploads?.results ?? []) as Record<string, unknown>[],
    media: (mediaRows?.results ?? []).map((m) => ({ ...(m as object), url: `/media/${(m as { key: string }).key}` })),
    engineLog,
  };
}

const iso = (d1Time: unknown) => (typeof d1Time === "string" && !d1Time.includes("T") ? `${d1Time.replace(" ", "T")}Z` : String(d1Time ?? ""));

/** The D1 copy as an AgentState (no life log; the played years only), for when the Durable Object can't be read. */
function stateFromD1(id: string, d: D1Detail): AgentState {
  const r = d.row as Record<string, string | number | null>;
  const profile = d.profile;
  const startAge = profile?.age ?? (r.age as number | null) ?? 0;
  const startYear = profile?.startYear ?? d.years[0]?.year ?? new Date().getUTCFullYear();
  const ph = (r.playhead_year as number | null) ?? startYear;
  const latest = d.settings.at(-1)?.settings ?? [];
  const portraits: Portrait[] = d.media
    .filter((m) => m.kind === "portrait")
    .map((m) => ({ band: (m.band as Portrait["band"]) ?? "now", url: String(m.url), forAge: m.band === "now" || !m.band ? startAge : Number(m.band) }));
  return {
    sessionId: id,
    phase: (r.phase as AgentState["phase"]) ?? "start",
    speed: (r.speed as AgentState["speed"]) ?? "auto",
    profile,
    appearance: d.start?.appearance ?? null,
    portraits,
    settings: latest,
    nudges: d.nudges.map((n) => ({ settingId: String(n.setting_id), from: String(n.from_value), to: String(n.to_value), year: Number(n.year), age: Number(n.age) })),
    decisions: d.decisions,
    answers: d.answers
      .filter((a) => !String(a.decision_id).startsWith("w-"))
      .map((a) => ({ decisionId: String(a.decision_id), optionId: (a.option_id as string | null) ?? null, text: (a.text as string | null) ?? null, via: (a.via as "text" | "voice" | "tap") ?? "tap", quoteId: (a.quote_id as string | null) ?? null, answeredAt: iso(a.created_at) })),
    years: d.years,
    playhead: { year: ph, age: startAge + (ph - startYear), paused: true },
    branches: d.branches,
    log: [],
    status: d.years.find((y) => y.year === ph)?.states ?? null,
    budgets: { smallLeft: 0, bigLeft: 0 },
    endAge: (r.end_age as number | null) ?? profile?.endAge ?? 70,
    verdictAtEnd: d.ending?.verdict ?? null,
    updatedAt: iso(r.updated_at),
    chat: d.chat.map((m): ChatMessage => ({ id: String(m.id), life: String(m.life), age: Number(m.age), role: m.role === "user" ? "user" : "assistant", text: String(m.text), done: true, at: iso(m.created_at) })),
    interlude: null,
    ending: d.ending,
    safety: null,
    thinking: false,
    bufferedTo: d.years.at(-1)?.year ?? null,
    engine: r.engine === "real" ? "real" : "mock",
    error: (r.last_error as string | null) ?? null,
    usage: d.usage,
    warmup: d.warmup,
  };
}

admin.get("/api/admin/session/:id", async (c) => {
  const id = c.req.param("id");
  const [d, { live, error }] = await Promise.all([readD1(c.env.DB, id), readLive(c.env, id)]);
  if (!d && !live) return c.json({ ok: false, error: "not_found" }, 404);
  if (isPrivate(d, live)) return c.json({ ok: false, error: "private" }, 403);
  // uploaded documents' text is stored encrypted (worker/crypto.ts); it is decrypted only here
  if (d) d.uploads = await Promise.all(d.uploads.map(async (u) => ({ ...u, text: await decryptText(c.env as CryptoEnv, (u.text as string | null) ?? null) })));
  // Open once, filled in: a session mirrored before 0004_admin.sql gets its list columns from here.
  if (live && d && "usage_usd" in d.row && (d.row.usage_usd ?? null) !== (live.state.usage?.usd ?? null) && backfillOn(c.env))
    c.executionCtx.waitUntil(new Mirror(c.env.DB, id).extras(live.state));
  const s = d?.row ?? { id };
  return c.json({
    ok: true,
    source: live ? "durable_object" : "d1",
    liveAwake: live?.awake ?? false,
    liveError: error,
    // the D1 copy (kept in the shape the endpoint always had)
    session: { ...s, start: d?.start ?? null, profile: d?.profile ?? null, ending: d?.ending ?? null, usage: d?.usage ?? null, warmup: d?.warmup ?? null },
    decisions: d?.decisions ?? [],
    decisionTimes: d?.decisionTimes ?? {},
    answers: d?.answers ?? [],
    years: d?.years ?? [],
    branches: d?.branches ?? [],
    settings: d?.settings ?? [],
    nudges: d?.nudges ?? [],
    chat: d?.chat ?? [],
    uploads: d?.uploads ?? [],
    media: d?.media ?? [],
    engineLog: d?.engineLog ?? [],
    // the Durable Object's state, or the D1 copy rebuilt into the same shape
    live: live?.state ?? (d ? stateFromD1(id, d) : null),
    // the per-session spend caps this deployment runs with
    sessionCaps: sessionCaps(c.env),
  });
});

admin.get("/api/admin/session/:id/checks", async (c) => {
  const id = c.req.param("id");
  const [d, { live }] = await Promise.all([readD1(c.env.DB, id), readLive(c.env, id)]);
  if (isPrivate(d, live)) return c.json({ ok: false, error: "private" }, 403);
  const state = live?.state ?? (d ? stateFromD1(id, d) : null);
  if (!state) return c.json({ ok: false, error: "not_found" }, 404);
  const started = d?.row.created_at ? new Date(iso(d.row.created_at)) : new Date(state.warmup?.startedAt ?? state.updatedAt);
  const decisionTimes = Object.fromEntries(Object.entries(d?.decisionTimes ?? {}).map(([k, v]) => [k, v.created]));
  const t0 = Date.now();
  const result = runChecks(state, { today: Number.isNaN(started.getTime()) ? new Date() : started, decisionTimes });
  return c.json({ ok: true, source: live ? "durable_object" : "d1", ms: Date.now() - t0, ...result });
});
