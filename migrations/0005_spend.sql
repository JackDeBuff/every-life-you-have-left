-- App-wide spend ledger (worker/spend.ts): one row per UTC day, every model call's cost added.
-- worker/spend.ts also creates it on first use, so a deploy never depends on this migration.
CREATE TABLE IF NOT EXISTS spend_ledger (
  day        TEXT PRIMARY KEY,
  usd        REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
