-- 0006_goal_gift_filter: desafios de regalos (una meta que solo cuenta un regalo concreto)
ALTER TABLE goal ADD COLUMN gift_id INTEGER;
ALTER TABLE goal ADD COLUMN gift_name TEXT;

CREATE TABLE goal_gift_total (
  goal_id   INTEGER NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
  scope_key TEXT NOT NULL,
  value     INTEGER NOT NULL,
  PRIMARY KEY (goal_id, scope_key)
);
