-- v2 simulation mirror (D-030 save all; D-033 /admin). The live session lives in the SessionAgent
-- Durable Object (SQLite); these tables are the admin/analytics copy, written by worker/agent/mirror.ts.
-- No foreign keys: the agent writes rows in any order and must never fail on the mirror.
-- JSON columns hold shared/sim.ts shapes.

CREATE TABLE sim_sessions (
  id             TEXT PRIMARY KEY,           -- the agent instance name (client-generated session id)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  first_name     TEXT,
  age            INTEGER,
  city           TEXT,
  country        TEXT,
  speed          TEXT,
  phase          TEXT,
  engine         TEXT,                       -- "mock" | "real"
  end_age        INTEGER,
  playhead_year  INTEGER,
  start_json     TEXT,                       -- StartInput
  profile_json   TEXT,                       -- latest Profile
  ending_json    TEXT                        -- Ending (verdicts + five-year answers)
);
CREATE INDEX idx_sim_sessions_updated ON sim_sessions(updated_at);

CREATE TABLE sim_decisions (
  session_id  TEXT NOT NULL,
  id          TEXT NOT NULL,
  kind        TEXT NOT NULL,                 -- small | big
  year        INTEGER NOT NULL,
  age         INTEGER NOT NULL,
  status      TEXT NOT NULL,                 -- pending | answered | slid
  json        TEXT NOT NULL,                 -- Decision
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, id)
);

CREATE TABLE sim_answers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  decision_id  TEXT NOT NULL,
  option_id    TEXT,
  text         TEXT,
  via          TEXT NOT NULL,
  slid         INTEGER NOT NULL DEFAULT 0,
  quote_id     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sim_answers_session ON sim_answers(session_id);

-- Played years of the chosen life (final once the playhead passes them).
CREATE TABLE sim_years (
  session_id  TEXT NOT NULL,
  year        INTEGER NOT NULL,
  age         INTEGER NOT NULL,
  json        TEXT NOT NULL,                 -- SimYear
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, year)
);

CREATE TABLE sim_branches (
  session_id  TEXT NOT NULL,
  id          TEXT NOT NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL,
  json        TEXT NOT NULL,                 -- Branch
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, id)
);

-- Every generated settings set (start + after each big decision).
CREATE TABLE sim_settings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  json        TEXT NOT NULL,                 -- LiveSetting[]
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sim_settings_session ON sim_settings(session_id);

CREATE TABLE sim_nudges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  setting_id  TEXT NOT NULL,
  from_value  TEXT NOT NULL,
  to_value    TEXT NOT NULL,
  year        INTEGER NOT NULL,
  age         INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sim_nudges_session ON sim_nudges(session_id);

CREATE TABLE sim_chat (
  session_id  TEXT NOT NULL,
  id          TEXT NOT NULL,
  life        TEXT NOT NULL,
  age         INTEGER NOT NULL,
  role        TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, id)
);

CREATE TABLE sim_uploads (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,                 -- cv | linkedin | ai_export
  r2_key      TEXT,
  filename    TEXT,
  text        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sim_uploads_session ON sim_uploads(session_id);

-- Generated media in R2 (portraits, TTS), served at /media/<key>.
CREATE TABLE sim_media (
  key         TEXT PRIMARY KEY,
  session_id  TEXT,
  kind        TEXT NOT NULL,                 -- portrait | tts | selfie
  band        TEXT,
  model       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sim_media_session ON sim_media(session_id);
