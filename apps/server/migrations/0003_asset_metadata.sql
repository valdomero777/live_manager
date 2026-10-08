-- 0003_asset_metadata: nombre original y tamaño, para mostrarlos en el panel
ALTER TABLE asset ADD COLUMN original_name TEXT NOT NULL DEFAULT '';
ALTER TABLE asset ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;
