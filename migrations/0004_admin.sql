-- /admin (D-033): what the sessions list needs without waking every session's Durable Object.
-- Written by worker/agent/mirror.ts in its own batch, so the session mirror keeps working when
-- this migration hasn't been applied yet (those writes just fail quietly until it is).

-- Session columns: model spend, the warm-up (questions asked/answered/skipped), the last engine error.
ALTER TABLE sim_sessions ADD COLUMN usage_usd REAL;          -- AgentState.usage.usd (cache-discounted list prices)
ALTER TABLE sim_sessions ADD COLUMN usage_json TEXT;         -- SessionUsage (byPurpose, detail, smalls)
ALTER TABLE sim_sessions ADD COLUMN warm_asked INTEGER;      -- warm-up questions answered or skipped
ALTER TABLE sim_sessions ADD COLUMN warmup_json TEXT;        -- WarmupState (worker/agent/protocol.ts)
ALTER TABLE sim_sessions ADD COLUMN last_error TEXT;         -- AgentState.error

-- Engine errors (AgentState.error as it changes) and year-writer warnings (repaired, fallback,
-- filler years), one row each. `detail` may quote generated text; it is admin-only like the rest.
CREATE TABLE sim_engine_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  level       TEXT NOT NULL,                 -- error | warn
  code        TEXT NOT NULL,                 -- "generateYears", "year.fallback", "year.repaired", ...
  life        TEXT,                          -- "you" or a branch id (year warnings)
  year        INTEGER,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sim_engine_log_session ON sim_engine_log(session_id, level);
