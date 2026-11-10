/**
 * Retention and deletion (D-101; the policy people read is src/ui/privacy/PrivacyText.tsx, and it
 * must stay true to this file).
 *
 *   SESSION_DAYS    a saved life (D1 mirror, its files, its live session object) is erased 30 days
 *                   after it started
 *   UPLOAD_DAYS     uploaded files, their extracted text and selfies are erased after 7 days
 *                   (sooner if the life is deleted)
 *   INCOGNITO_HOURS an incognito life (nothing in D1) erases itself 24 hours after it started
 *                   (worker/agent/session-agent.ts: expire)
 *
 * eraseSession: everything we hold for one session id, in D1 and R2. The live session object (the
 * Durable Object) is destroyed by its own wipe() (the caller does that).
 * sweep: the daily cron (wrangler.jsonc triggers) applies the windows above.
 */
export const SESSION_DAYS = 30;
export const UPLOAD_DAYS = 7;
export const INCOGNITO_HOURS = 24;

type PEnv = { DB?: D1Database; UPLOADS?: R2Bucket };

/** Every table that holds a session's rows (old v1 tables included; missing tables are skipped). */
const SESSION_TABLES = [
  "sim_decisions", "sim_answers", "sim_years", "sim_branches", "sim_settings", "sim_nudges", "sim_chat", "sim_uploads", "sim_media", "sim_engine_log",
  "postcard_shares", "plays", "uploads", "answers", "profiles", "lives", "pauses", "letters", "ratings", "shares", "events",
];

async function rows<T>(db: D1Database, sql: string, ...bind: unknown[]): Promise<T[]> {
  try {
    return (await db.prepare(sql).bind(...bind).all<T>()).results;
  } catch {
    return [];
  }
}

async function deletePrefix(bucket: R2Bucket, prefix: string, olderThan?: Date): Promise<number> {
  let n = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.filter((o) => !olderThan || o.uploaded < olderThan).map((o) => o.key);
    if (keys.length) await bucket.delete(keys);
    n += keys.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return n;
}

/** Erase one session's rows and files. Safe to call twice. */
export async function eraseSession(env: PEnv, id: string): Promise<{ rows: number; files: number }> {
  let rowsGone = 0;
  let files = 0;
  const db = env.DB;
  const bucket = env.UPLOADS;
  const shares = db ? await rows<{ id: string }>(db, "SELECT id FROM postcard_shares WHERE session_id = ?1", id) : [];
  const media = db ? await rows<{ key: string }>(db, "SELECT key FROM sim_media WHERE session_id = ?1", id) : [];
  if (bucket) {
    const keys = media.map((m) => m.key);
    for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
    files += keys.length;
    for (const p of [`portraits/${id}/`, `uploads/${id}/`, `selfies/${id}.`, ...shares.map((s) => `shares/${s.id}/`)]) files += await deletePrefix(bucket, p);
  }
  if (db) {
    for (const t of SESSION_TABLES) {
      try {
        rowsGone += (await db.prepare(`DELETE FROM ${t} WHERE session_id = ?1`).bind(id).run()).meta.changes ?? 0;
      } catch {
        /* table not in this database */
      }
    }
    for (const t of ["sim_sessions", "sessions"]) {
      try {
        rowsGone += (await db.prepare(`DELETE FROM ${t} WHERE id = ?1`).bind(id).run()).meta.changes ?? 0;
      } catch {
        /* table not in this database */
      }
    }
  }
  return { rows: rowsGone, files };
}

/**
 * The daily retention job. Returns the session ids it erased (the caller destroys their live
 * session objects too) and how many upload files/rows aged out.
 */
export async function sweep(env: PEnv, now = new Date()): Promise<{ sessions: string[]; uploadFiles: number; uploadRows: number }> {
  const out = { sessions: [] as string[], uploadFiles: 0, uploadRows: 0 };
  const db = env.DB;
  if (db) {
    const old = await rows<{ id: string }>(db, `SELECT id FROM sim_sessions WHERE created_at < datetime('now', '-${SESSION_DAYS} days') LIMIT 200`);
    for (const { id } of old) {
      await eraseSession(env, id);
      out.sessions.push(id);
    }
    try {
      // The play log is kept as long as a saved life, for incognito lives too.
      await db.prepare(`DELETE FROM plays WHERE started_at < datetime('now', '-${SESSION_DAYS} days')`).run();
    } catch {
      /* no plays table yet */
    }
    for (const t of ["sim_uploads", "uploads"]) {
      try {
        out.uploadRows += (await db.prepare(`DELETE FROM ${t} WHERE created_at < datetime('now', '-${UPLOAD_DAYS} days')`).run()).meta.changes ?? 0;
      } catch {
        /* table not in this database */
      }
    }
    try {
      await db.prepare(`DELETE FROM sim_media WHERE (kind LIKE 'upload_%' OR kind = 'selfie') AND created_at < datetime('now', '-${UPLOAD_DAYS} days')`).run();
    } catch {
      /* no created_at on old rows */
    }
  }
  if (env.UPLOADS) {
    const cutoff = new Date(now.getTime() - UPLOAD_DAYS * 86_400_000);
    out.uploadFiles += await deletePrefix(env.UPLOADS, "uploads/", cutoff);
    out.uploadFiles += await deletePrefix(env.UPLOADS, "selfies/", cutoff);
  }
  return out;
}
