# Operación — respaldos, métricas y salud

## Respaldos (automáticos)

El servidor se encarga solo, sin cron, igual en Linux y Windows:

- **Base de datos:** copia consistente (API de respaldo de SQLite, segura con el live en marcha) a
  `BACKUP_DIR/app-<fecha UTC>.db`. Una al día; se conservan 14 días y siempre la más reciente.
- **Assets:** copia de `ASSETS_DIR` a `BACKUP_DIR/assets-<fecha UTC>/` cada 7 días; 4 semanas.
- **Retención de eventos:** `live_event` más viejo de 90 días se borra una vez al día. Los
  rankings (`leaderboard_total`) y los espectadores no se tocan.
- Se revisa un minuto después de arrancar y cada hora; si ya hay un respaldo reciente no se repite.
- Para llevarlos fuera del equipo (spec §4): copia `BACKUP_DIR` a un disco externo, p. ej.
  `rsync -a data/backups/ /mnt/externo/tiklive/`.

API (requiere sesión): `GET /api/v1/backups` (estado y lista) y `POST /api/v1/backups`
(`{"kind":"db"|"assets"}`, respaldar ahora).

### Restaurar

1. Detén el servidor.
2. `npm run restore -- data/backups/app-20261008T040000Z.db` (opcional `--db ./data/app.db`).
   Verifica la integridad del archivo y que sea de TikLive antes de tocar nada; la base actual
   queda como `app.db.before-restore`.
3. Arranca el servidor: las migraciones pendientes se aplican solas.
4. Assets: copia de vuelta la carpeta `assets-<fecha>` a `ASSETS_DIR`.

## `/health` y alertas

`GET /api/v1/health` (público) devuelve estado, conector, pantallas, colas, memoria, retraso del
bucle de eventos, espacio libre, último respaldo y `alerts`. Responde 503 si la base no contesta.
El panel (Estado) muestra las alertas:

| Alerta | Cuándo |
| --- | --- |
| `connector_down` | Hay un usuario configurado y lleva más de 30 s sin conectar (no si lo detuviste). |
| `audio_offline` | El conector está conectado pero no hay pestaña de audio. |
| `queue_full` | Una cola supera el 80 % de su capacidad (50). |
| `disk_low` | Menos del 10 % libre en el disco de la base de datos. |
| `backup_stale` | Sin respaldo en 36 h (se calla los primeros 5 minutos tras arrancar). |

## `/metrics` (Prometheus)

`GET /api/v1/metrics`, detrás de la sesión del panel (no es público). `events_received_total`,
`events_dropped_total`, `connector_state`, `connector_reconnects_total`, `rule_executions_total`,
`actions_total`, `action_queue_depth`, `action_latency_ms` (histograma), `ws_clients`,
`process_rss_bytes`, `event_loop_lag_ms`.
