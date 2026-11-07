-- Every Life You Have Left: initial schema (WP0).
-- Times are ISO-8601 UTC strings (datetime('now') format). JSON columns hold shared/schema.ts shapes.
-- ids are app-generated (crypto.randomUUID() or short prefixed ids like "s_8f2c").

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  mode        TEXT NOT NULL DEFAULT 'quick' CHECK (mode IN ('quick', 'deep')),
  voice       INTEGER NOT NULL DEFAULT 0 CHECK (voice IN (0, 1)),
  consent_at  TEXT,                 -- when the consent screen was accepted (D-030)
  age_ok      INTEGER NOT NULL DEFAULT 0 CHECK (age_ok IN (0, 1)),  -- 18+ checkbox (D-012)
  user_agent  TEXT,
  country     TEXT                  -- from request.cf.country, 2-letter
);

CREATE TABLE uploads (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('cv', 'linkedin', 'ai_export')),
  r2_key      TEXT,                 -- raw file in R2 bucket elyl-uploads (null for pasted ai_export)
  text        TEXT,                 -- extracted text (pdf.js in browser, or Gemini for scans)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_uploads_session ON uploads(session_id);

CREATE TABLE answers (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL,      -- e.g. "fast.q1", "deep.career.3", "pause.P1"
  question_text TEXT NOT NULL,
  answer_text   TEXT NOT NULL,
  via           TEXT NOT NULL DEFAULT 'text' CHECK (via IN ('voice', 'text')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_answers_session ON answers(session_id);

CREATE TABLE profiles (
  session_id     TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  json           TEXT NOT NULL,     -- Profile (shared/schema.ts)
  know_me_score  INTEGER NOT NULL DEFAULT 0 CHECK (know_me_score BETWEEN 0 AND 100),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lives (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  life_key    TEXT NOT NULL CHECK (life_key IN ('path', 'leap', 'careful', 'unjudged')),
  version     INTEGER NOT NULL DEFAULT 1,  -- bumps on every re-tune
  json        TEXT NOT NULL,     -- Life (shared/schema.ts)
  model       TEXT,              -- which Gemini model produced it (after fallback)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session_id, life_key, version)
);
CREATE INDEX idx_lives_session ON lives(session_id);

CREATE TABLE pauses (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pauses_session ON pauses(session_id);

CREATE TABLE letters (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  life_key    TEXT NOT NULL CHECK (life_key IN ('path', 'leap', 'careful', 'unjudged')),
  age         INTEGER NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('to_future', 'from_future')),
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_letters_session ON letters(session_id);

CREATE TABLE ratings (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('before', 'after', 'realism')),
  value       INTEGER NOT NULL,   -- 1-7 for before/after (D-027); 1-5 for realism
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ratings_session ON ratings(session_id);

CREATE TABLE shares (
  id          TEXT PRIMARY KEY,   -- short public id used in /s/:id
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  card_json   TEXT NOT NULL,      -- ShareCard (shared/schema.ts); only what the user opted to share
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_shares_session ON shares(session_id);

CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  session_id  TEXT REFERENCES sessions(id) ON DELETE CASCADE,  -- null for anonymous events
  name        TEXT NOT NULL,      -- e.g. "life_generated", "pause_answered", "safety_flag"
  data        TEXT,               -- small JSON; never raw personal text
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_name ON events(name, created_at);
