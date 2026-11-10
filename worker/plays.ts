/**
 * The play log (owner, Nov 9): one row per life started, whatever the consent, so /admin can count
 * players and see who played: first name, age, country, speed and the consent they chose. Nothing they
 * say or upload. Disclosed in src/ui/privacy/PrivacyText.tsx ("a one-line play record"); erased with
 * the life (eraseSession) or 30 days after the start (sweep). Best-effort: a failed write never stops
 * a life.
 */
import type { Privacy, StartInput } from "../shared/sim";

const CREATE = `CREATE TABLE IF NOT EXISTS plays (session_id TEXT PRIMARY KEY, started_at TEXT NOT NULL DEFAULT (datetime('now')), first_name TEXT, age INTEGER, country TEXT, speed TEXT, saved INTEGER NOT NULL DEFAULT 0, shared INTEGER NOT NULL DEFAULT 0)`;

export async function recordPlay(db: D1Database | undefined, sessionId: string, input: StartInput, privacy: Privacy): Promise<void> {
  if (!db) return;
  const ins = () =>
    db
      .prepare(`INSERT OR IGNORE INTO plays (session_id, first_name, age, country, speed, saved, shared) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
      .bind(sessionId, input.firstName.slice(0, 40), input.age, input.country, input.speed, privacy.save ? 1 : 0, privacy.save && privacy.improve ? 1 : 0)
      .run();
  try {
    await ins();
  } catch {
    try {
      await db.prepare(CREATE).run();
      await ins();
    } catch (e) {
      console.error("play log failed", e instanceof Error ? e.message.slice(0, 80) : "error");
    }
  }
}

export type PlayRow = { session_id: string; started_at: string; first_name: string | null; age: number | null; country: string | null; speed: string | null; saved: number; shared: number };

export async function listPlays(db: D1Database, limit: number): Promise<{ rows: PlayRow[]; total: number; today: number }> {
  try {
    const rows = (await db.prepare(`SELECT * FROM plays ORDER BY started_at DESC LIMIT ?1`).bind(limit).all<PlayRow>()).results;
    const c = await db.prepare(`SELECT COUNT(*) AS total, SUM(started_at >= datetime('now', '-1 day')) AS today FROM plays`).first<{ total: number; today: number | null }>();
    return { rows, total: c?.total ?? 0, today: c?.today ?? 0 };
  } catch {
    return { rows: [], total: 0, today: 0 };
  }
}
