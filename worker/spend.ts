/**
 * Spend guard (owner, Sat Nov 7: "make sure it's not gonna exceed 100").
 *
 * One ledger for the whole app in D1 (`spend_ledger`, one row per UTC day). Every model call adds
 * its cost: the session agent's usage sink (text models, priced by worker/engine/pricing.ts at the
 * prices GCP Billing actually charged) and the media routes (portraits, voice, transcription, at
 * per-call estimates). Two caps read it:
 *
 *   SPEND_CAP_USD          (default 30) all spend since the ledger started (Sat Nov 7 ~4:45pm EST,
 *                          when $58.76 of the $100 hackathon credit was left). At the cap, every
 *                          model call throws GenerationDisabledError, exactly like the D-032 kill
 *                          switch: new sessions get the offline engine, running ones finish on it.
 *   SESSION_SOFT_CAP_USD   (default 2.5) one session: no more small cards for the rest of the life.
 *   SESSION_HARD_CAP_USD   (default 5) one session: no more model calls (the offline engine finishes it).
 *
 * The total is cached per isolate for a few seconds, so the check costs no D1 read on most calls.
 * Any D1 failure fails OPEN (the expo must not stall on a ledger hiccup): the GCP budget alerts and
 * the kill switch are the backstop.
 */
export type SpendEnv = { DB?: D1Database; SPEND_CAP_USD?: string };

const TTL_MS = 5_000;
const day = () => new Date().toISOString().slice(0, 10);

let ensured: Promise<void> | null = null;
let cache: { total: number; at: number } | null = null;
let pending = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Per-call estimates for calls that don't report tokens to us (GCP Billing, Sat Nov 7). */
export const MEDIA_USD = {
  /** gemini-3.1-flash-image: ~1,290 image tokens at $60/M. */
  image: 0.08,
  /** gemini-3.8-flash TTS: ~$18/M audio tokens; a 20-40 s line. */
  tts: 0.02,
  /** gemini-3.5-flash-lite audio in: tiny. */
  transcribe: 0.002,
} as const;

export const capUsd = (env: SpendEnv) => {
  const n = Number(env.SPEND_CAP_USD);
  return Number.isFinite(n) && n > 0 ? n : 30;
};

function ensure(db: D1Database): Promise<void> {
  // The table also has a migration (0005_spend.sql); creating it here means a deploy never depends on it.
  ensured ??= db
    .prepare("CREATE TABLE IF NOT EXISTS spend_ledger (day TEXT PRIMARY KEY, usd REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')))")
    .run()
    .then(() => undefined)
    .catch((e) => {
      ensured = null;
      throw e;
    });
  return ensured;
}

async function readTotal(db: D1Database): Promise<number> {
  await ensure(db);
  const r = await db.prepare("SELECT COALESCE(SUM(usd), 0) AS t FROM spend_ledger").first<{ t: number }>();
  return Number(r?.t ?? 0);
}

/** All recorded spend (USD), including what this isolate hasn't flushed yet. */
export async function spendTotal(env: SpendEnv): Promise<number> {
  if (!env.DB) return pending;
  if (!cache || Date.now() - cache.at > TTL_MS) cache = { total: await readTotal(env.DB), at: Date.now() };
  return cache.total + pending;
}

/** True once the app-wide cap is reached. Fails open. */
export async function overCap(env: SpendEnv): Promise<boolean> {
  if (!env.DB) return false;
  try {
    return (await spendTotal(env)) >= capUsd(env);
  } catch {
    return false;
  }
}

async function flush(db: D1Database): Promise<void> {
  const x = pending;
  if (x <= 0) return;
  pending = 0;
  try {
    await ensure(db);
    await db
      .prepare("INSERT INTO spend_ledger (day, usd) VALUES (?1, ?2) ON CONFLICT(day) DO UPDATE SET usd = usd + ?2, updated_at = datetime('now')")
      .bind(day(), x)
      .run();
    if (cache) cache.total += x;
  } catch {
    pending += x; // try again with the next flush
  }
}

/**
 * Add spend to the ledger. Batched: written within ~2 s (one D1 write per batch). `now: true`
 * writes immediately (Worker routes, which may not outlive their response).
 */
export async function recordSpend(env: SpendEnv, usd: number, opts: { now?: boolean } = {}): Promise<void> {
  if (!env.DB || !(usd > 0)) return;
  pending += usd;
  if (opts.now) return flush(env.DB);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush(env.DB!);
  }, 2_000);
}

/** For /api/health and /admin. */
export async function spendStatus(env: SpendEnv): Promise<{ usd: number; cap: number; capped: boolean } | null> {
  if (!env.DB) return null;
  try {
    const usd = await spendTotal(env);
    return { usd: Math.round(usd * 100) / 100, cap: capUsd(env), capped: usd >= capUsd(env) };
  } catch {
    return null;
  }
}
