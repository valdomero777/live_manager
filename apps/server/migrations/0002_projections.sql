-- 0002_projections: totales de sala por alcance, ciclos de metas por alcance, metas activables

-- Total de sala por alcance y métrica (metas y verificación de consistencia).
CREATE TABLE metric_total (
  scope  TEXT NOT NULL,
  metric TEXT NOT NULL,
  value  INTEGER NOT NULL,
  PRIMARY KEY (scope, metric)
);

-- Una meta de sesión se cumple una vez por sesión: el ciclo se registra por clave de alcance.
DROP TABLE goal_cycle;
CREATE TABLE goal_cycle (
  goal_id    INTEGER NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
  scope_key  TEXT NOT NULL,
  cycle      INTEGER NOT NULL,
  reached_at INTEGER NOT NULL,
  PRIMARY KEY (goal_id, scope_key, cycle)
);

ALTER TABLE goal ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
