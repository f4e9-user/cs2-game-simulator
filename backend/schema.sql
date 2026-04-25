-- D1 schema for cs2 simulator MVP.
-- Session is stored as a JSON blob for simplicity; history is a separate table
-- so we can later query leaderboard / run stats without parsing JSON.

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  stage      TEXT NOT NULL,
  round      INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'active',
  ending     TEXT,
  data       TEXT NOT NULL,                 -- serialized GameSession JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status  ON sessions (status);

CREATE TABLE IF NOT EXISTS round_results (
  session_id TEXT NOT NULL,
  round      INTEGER NOT NULL,
  event_id   TEXT NOT NULL,
  event_type TEXT NOT NULL,
  choice_id  TEXT NOT NULL,
  success    INTEGER NOT NULL,
  data       TEXT NOT NULL,                 -- serialized RoundResult JSON
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, round),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rounds_session ON round_results (session_id, round DESC);

-- Reserved for future leaderboard / ending summaries.
CREATE TABLE IF NOT EXISTS runs (
  session_id     TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  final_stage    TEXT NOT NULL,
  rounds_played  INTEGER NOT NULL,
  score          INTEGER NOT NULL DEFAULT 0,
  ending         TEXT,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_score ON runs (score DESC);
