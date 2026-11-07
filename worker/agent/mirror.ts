/**
 * D1 mirror of each session (migrations/0002_sim.sql) for /admin (D-030, D-033).
 * Every write is best-effort: failures are logged by name only and never reach the session.
 */
import type { StartInput } from "../../shared/sim";
import type { Branch, Decision, DecisionAnswer, LiveSetting, SettingNudge, SimYear } from "../../shared/sim";
import type { ChatMessage, AgentState } from "./protocol";

const j = (x: unknown) => JSON.stringify(x);

export class Mirror {
  constructor(
    private readonly db: D1Database | undefined,
    private readonly sessionId: string,
  ) {}

  private run(stmts: D1PreparedStatement[]): Promise<void> {
    if (!this.db || !stmts.length) return Promise.resolve();
    return this.db
      .batch(stmts)
      .then(() => undefined)
      .catch((e: unknown) => console.error("mirror failed", e instanceof Error ? e.name : "error"));
  }

  session(s: AgentState, start?: StartInput): Promise<void> {
    if (!this.db) return Promise.resolve();
    const p = s.profile;
    return this.run([
      this.db
        .prepare(
          `INSERT INTO sim_sessions (id, first_name, age, city, country, speed, phase, engine, end_age, playhead_year, start_json, profile_json, ending_json)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
           ON CONFLICT(id) DO UPDATE SET updated_at = datetime('now'),
             first_name = COALESCE(excluded.first_name, first_name), age = COALESCE(excluded.age, age),
             city = COALESCE(excluded.city, city), country = COALESCE(excluded.country, country),
             speed = excluded.speed, phase = excluded.phase, engine = excluded.engine, end_age = excluded.end_age,
             playhead_year = excluded.playhead_year,
             start_json = COALESCE(excluded.start_json, start_json),
             profile_json = COALESCE(excluded.profile_json, profile_json),
             ending_json = COALESCE(excluded.ending_json, ending_json)`,
        )
        .bind(
          this.sessionId, p?.firstName ?? start?.firstName ?? null, p?.age ?? start?.age ?? null, p?.city ?? start?.city ?? null,
          p?.country ?? start?.country ?? null, s.speed, s.phase, s.engine, s.endAge, s.playhead.year,
          start ? j(start) : null, p ? j(p) : null, s.ending ? j(s.ending) : null,
        ),
    ]);
  }

  decisions(ds: Decision[]): Promise<void> {
    if (!this.db) return Promise.resolve();
    const db = this.db;
    return this.run(
      ds.map((d) =>
        db
          .prepare(
            `INSERT INTO sim_decisions (session_id, id, kind, year, age, status, json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(session_id, id) DO UPDATE SET status = excluded.status, json = excluded.json, updated_at = datetime('now')`,
          )
          .bind(this.sessionId, d.id, d.kind, d.year, d.age, d.status, j(d)),
      ),
    );
  }

  answer(a: DecisionAnswer, slid: boolean): Promise<void> {
    if (!this.db) return Promise.resolve();
    return this.run([
      this.db
        .prepare(`INSERT INTO sim_answers (session_id, decision_id, option_id, text, via, slid, quote_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
        .bind(this.sessionId, a.decisionId, a.optionId, a.text, a.via, slid ? 1 : 0, a.quoteId),
    ]);
  }

  years(ys: SimYear[]): Promise<void> {
    if (!this.db) return Promise.resolve();
    const db = this.db;
    return this.run(
      ys.map((y) =>
        db
          .prepare(
            `INSERT INTO sim_years (session_id, year, age, json) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(session_id, year) DO UPDATE SET json = excluded.json, age = excluded.age`,
          )
          .bind(this.sessionId, y.year, y.age, j(y)),
      ),
    );
  }

  branches(bs: Branch[]): Promise<void> {
    if (!this.db) return Promise.resolve();
    const db = this.db;
    return this.run(
      bs.map((b) =>
        db
          .prepare(
            `INSERT INTO sim_branches (session_id, id, title, status, json) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(session_id, id) DO UPDATE SET status = excluded.status, json = excluded.json, updated_at = datetime('now')`,
          )
          .bind(this.sessionId, b.id, b.title, b.status, j(b)),
      ),
    );
  }

  settings(ss: LiveSetting[]): Promise<void> {
    if (!this.db) return Promise.resolve();
    return this.run([this.db.prepare(`INSERT INTO sim_settings (session_id, json) VALUES (?1, ?2)`).bind(this.sessionId, j(ss))]);
  }

  nudge(n: SettingNudge): Promise<void> {
    if (!this.db) return Promise.resolve();
    return this.run([
      this.db
        .prepare(`INSERT INTO sim_nudges (session_id, setting_id, from_value, to_value, year, age) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
        .bind(this.sessionId, n.settingId, n.from, n.to, n.year, n.age),
    ]);
  }

  chat(m: ChatMessage): Promise<void> {
    if (!this.db) return Promise.resolve();
    return this.run([
      this.db
        .prepare(
          `INSERT INTO sim_chat (session_id, id, life, age, role, text) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(session_id, id) DO UPDATE SET text = excluded.text`,
        )
        .bind(this.sessionId, m.id, m.life, m.age, m.role, m.text),
    ]);
  }

  upload(id: string, kind: string, r2Key: string | null, filename: string | null, text: string): Promise<void> {
    if (!this.db) return Promise.resolve();
    return this.run([
      this.db
        .prepare(`INSERT OR REPLACE INTO sim_uploads (id, session_id, kind, r2_key, filename, text) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
        .bind(id, this.sessionId, kind, r2Key, filename, text),
    ]);
  }
}
