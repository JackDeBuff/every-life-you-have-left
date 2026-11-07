-- Shared postcards (D-031, opt-in): POST /api/share writes one row, GET /s/<id> reads it.
-- The v1 `shares` table references the v1 `sessions` table (a foreign key the v2 agent never
-- fills), so v2 shares get their own table, with no foreign keys (like 0002_sim.sql).
-- card_json holds only what is on the postcard (worker/share-card.ts ShareCardV2): first name,
-- the four lives' titles and verdicts, the place and age at the end, the five-year answer. Never
-- quotes or answers. session_id is private (dedupe + admin) and never rendered.

CREATE TABLE postcard_shares (
  id          TEXT PRIMARY KEY,            -- short public id used in /s/<id>
  session_id  TEXT,
  card_json   TEXT NOT NULL,
  card_hash   TEXT NOT NULL,               -- sha-256 of card_json: sharing the same postcard twice returns the same link
  token_hash  TEXT NOT NULL,               -- sha-256 of the one-time upload token for the postcard image
  image_key   TEXT,                        -- R2 key of the postcard PNG (shares/<id>/postcard.png), once uploaded
  views       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_postcard_shares_session ON postcard_shares(session_id, card_hash);
