-- 0006_trigger_params: parametros propios de cada trigger (corte, enfriamiento y probabilidad)
ALTER TABLE sound_trigger ADD COLUMN max_ms INTEGER;
ALTER TABLE sound_trigger ADD COLUMN cooldown_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sound_trigger ADD COLUMN probability REAL NOT NULL DEFAULT 1;
