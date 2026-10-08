-- 0001_init: esquema v1 (especificación, sección 6)
CREATE TABLE live_session (
  id            INTEGER PRIMARY KEY,
  tiktok_user   TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER
);

CREATE TABLE viewer (
  id             INTEGER PRIMARY KEY,
  tiktok_user_id TEXT NOT NULL UNIQUE,
  unique_id      TEXT NOT NULL,
  nickname       TEXT,
  avatar_url     TEXT,
  is_follower    INTEGER NOT NULL DEFAULT 0,
  is_subscriber  INTEGER NOT NULL DEFAULT 0,
  is_moderator   INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE live_event (
  id          INTEGER PRIMARY KEY,
  event_uid   TEXT NOT NULL UNIQUE,
  session_id  INTEGER NOT NULL REFERENCES live_session(id),
  viewer_id   INTEGER REFERENCES viewer(id),
  type        TEXT NOT NULL,
  payload     TEXT NOT NULL,
  dedupe_key  TEXT,
  occurred_at INTEGER NOT NULL
);
CREATE INDEX ix_event_session_type ON live_event(session_id, type, occurred_at);
CREATE UNIQUE INDEX ux_event_dedupe ON live_event(session_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE rule (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  trigger          TEXT NOT NULL,
  conditions       TEXT NOT NULL,
  actions          TEXT NOT NULL,
  mode             TEXT NOT NULL DEFAULT 'all',
  cooldown_ms      INTEGER NOT NULL DEFAULT 0,
  user_cooldown_ms INTEGER NOT NULL DEFAULT 0,
  probability      REAL NOT NULL DEFAULT 1.0,
  priority         INTEGER NOT NULL DEFAULT 0,
  enabled          INTEGER NOT NULL DEFAULT 1,
  version          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE asset (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,
  filename    TEXT NOT NULL,
  sha256      TEXT NOT NULL UNIQUE,
  duration_ms INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE goal (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  metric        TEXT NOT NULL,
  target        INTEGER NOT NULL,
  scope         TEXT NOT NULL,
  on_reach      TEXT,
  repeat_factor REAL
);

CREATE TABLE goal_cycle (
  goal_id    INTEGER NOT NULL REFERENCES goal(id),
  cycle      INTEGER NOT NULL,
  reached_at INTEGER NOT NULL,
  PRIMARY KEY (goal_id, cycle)
);

CREATE TABLE leaderboard_total (
  viewer_id INTEGER NOT NULL REFERENCES viewer(id),
  scope     TEXT NOT NULL,
  metric    TEXT NOT NULL,
  value     INTEGER NOT NULL,
  PRIMARY KEY (viewer_id, scope, metric)
);
CREATE INDEX ix_lb_rank ON leaderboard_total(scope, metric, value DESC);

CREATE TABLE app_setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
