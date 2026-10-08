-- 0005_goal_adjustment: progreso manual (acción updateGoal) sumado al total de la sala
CREATE TABLE goal_adjustment (
  goal_id   INTEGER NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
  scope_key TEXT NOT NULL,
  amount    INTEGER NOT NULL,
  PRIMARY KEY (goal_id, scope_key)
);
