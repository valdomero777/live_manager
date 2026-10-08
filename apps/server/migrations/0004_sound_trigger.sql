-- 0004_sound_trigger: sonido remoto (solo metadatos y URL) asociado a un tipo de evento
CREATE TABLE sound_trigger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  event TEXT NOT NULL,
  sound_id TEXT NOT NULL,
  sound_title TEXT NOT NULL,
  sound_url TEXT NOT NULL,
  sound_page_url TEXT NOT NULL,
  source TEXT NOT NULL,
  volume REAL NOT NULL,
  enabled INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX sound_trigger_event ON sound_trigger (event, enabled);
