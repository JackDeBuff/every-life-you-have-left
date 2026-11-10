-- One row per life started, kept even for incognito and "don't share" lives (worker/plays.ts), so the
-- team can count players: first name, age, country, speed and the consent chosen. Nothing they say.
-- Erased with the life (Delete my data) or 30 days after the start (worker/privacy.ts sweep).
-- worker/plays.ts also creates it on first use, so a deploy never depends on this migration.
CREATE TABLE IF NOT EXISTS plays (
  session_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  first_name TEXT,
  age        INTEGER,
  country    TEXT,
  speed      TEXT,
  saved      INTEGER NOT NULL DEFAULT 0,
  shared     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS plays_started ON plays (started_at);
