# Plan de implementación — TikLive

Derivado de `Especificación técnica plataforma local de interacción para TikTok LIVE.md`.
Los IDs (RF/RNF) refieren a la sección 2 de la especificación.

## Análisis rápido

- **Núcleo de riesgo:** el conector no oficial (R-01). Todo el diseño gira en aislarlo detrás de
  `LiveEventSource`, con un simulador que recorre exactamente el mismo camino.
- **Núcleo de valor:** motor de reglas (evento → condiciones → acciones) + cola por pantalla con
  acuse `action.done`. Es lo que convierte eventos en reacciones.
- **Restricción dominante:** laptop vieja y PC de stream con consumo ~0 → monolito de un proceso,
  SQLite WAL, overlays sin framework.
- **Decisión tomada al implementar:** el adaptador de TikTok traduce los mensajes de la librería a un
  `RawLiveEvent` neutral (definido en `contracts`). El simulador emite ese mismo `RawLiveEvent`.
  El normalizador (dedupe, rachas, deltas de likes, validación Zod) es común y vive en `application`.
  Así ningún código fuera de `infrastructure/tiktok` conoce la librería.
- **TypeScript 6.0** (no 7): `typescript-eslint` aún exige `<6.1`.

## Fases (sección 17) y estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 0 | Laptop, SO, firewall, verificación de supuestos (sección 18) | Manual — checklist en [fase-0.md](fase-0.md) y `npm run phase0`; pendiente de ejecutar |
| 1 | Monorepo + CI, `contracts`, dominio, `LiveEventSource` (conector + simulador), normalizador, SQLite + migraciones, pestaña de audio | **Hecha** (falta validar con un live real) |
| 2 | Motor de reglas, condiciones/acciones, cola con prioridad, limitadores, TTS + filtros, assets, overlay de alertas | **Hecha** (acciones `webhook` y `updateGoal` el 2026-10-08) |
| 3 | Proyecciones, leaderboards, metas, stats, rotator | **Hecha** (ver abajo) |
| 4 | Dashboard Angular, auth, respaldos, `/health` completo, métricas, runbook, despliegue | Pendiente |
| 5 | v2/v3 | Pendiente |

## Fase 1 — tareas

1. Raíz del monorepo: workspaces npm, `tsconfig.base.json`, ESLint (flat), Prettier,
   dependency-cruiser (regla de capas), Vitest con cobertura, CI de GitHub Actions, `.nvmrc`,
   `.env.example`.
2. `packages/contracts`: esquemas Zod de `LiveEvent`, `RawLiveEvent`, sobres WS, reglas y acciones.
3. `apps/server/src/domain`: `GiftStreakAggregator`, `LikeDeltaTracker`, `LruSet`, `backoff`,
   máquina de estados del conector, condiciones, limitador, planificador, plantillas, cola de acciones.
4. `apps/server/src/application`: puertos, `EventNormalizer`, `ConnectorSupervisor`
   (reconexión con backoff), `IngestLiveEvent`, `RuleEngine`.
5. `apps/server/src/infrastructure`: SQLite (Kysely + better-sqlite3, migraciones SQL),
   repositorios, adaptador `tiktok-live-connector`, `SimulatedSource`, hub WebSocket, Pino.
6. `apps/server/src/interface`: Fastify (`/api/v1/health`, connector, simulator, rules),
   WS `/ws/screen/:screenId` y `/ws/admin`.
7. `packages/overlays`: cliente WS con reconexión, `/screen/audio` con botón "Iniciar audio",
   cola local y `action.done`; `/screen/alerts`.
8. `tools/simulate.ts`: CLI del simulador (RF-04).

## Estado al 2026-10-06

Hecho y verificado (117 pruebas en verde; lint, tipos y regla de capas sin errores; cobertura del
dominio > 90 %):

- Monorepo, CI, contratos Zod, dominio completo de normalización y reglas.
- `ConnectorSupervisor` + adaptador `tiktok-live-connector` 2.5.0 + `SimulatedSource`.
- SQLite con migraciones, persistencia de eventos con deduplicación tras reinicio.
- Motor de reglas con 8 condiciones, 3 acciones (`playSound`, `showAlert`, `speak`), modos
  `all`/`random`, cooldowns, probabilidad, prioridad y recarga en caliente.
- Cola por pantalla con acuse, timeout, reencolado (3 intentos) y descarte de acciones viejas.
- Moderación TTS (8 filtros) aplicada a `{comment}` y `{commandArgs}`.
- Pantallas `/screen/audio` y `/screen/alerts`; CLI `npm run simulate`; `npm run seed`.
- Probado en navegador: simulador → sonido + voz + alerta, con `action.done` de vuelta.

Pendiente, en orden propuesto:

1. **Fase 0 (manual):** verificar los supuestos de la sección 18 con un live real
   (`SIMULATE=false`, `TIKTOK_USERNAME=…`), LIVE Studio con fuente Link y transparencia.
2. ~~Modo `record`~~ hecho: `RECORD_PATH=data/live.jsonl` graba cada evento crudo del conector real
   (no del simulador) y `npm run simulate -- replay data/live.jsonl` lo reproduce. Pendiente: grabar
   un live real y convertir un fragmento en prueba de regresión del mapeo.
3. ~~Resto de fase 2~~ hecho (ver abajo).
4. Fase 3: proyecciones, leaderboards, metas, stats y rotator.
5. Fase 4: dashboard Angular, autenticación (argon2id + cookie), respaldos, `/metrics`, systemd.

## Fase 3 — estado al 2026-10-06

Hecho y verificado (pruebas unitarias, de integración con SQLite y e2e por WebSocket; probado
en el navegador):

- Rankings `diamonds`, `gift_count` y `likes` en los alcances sesión, semana ISO y total, con
  reset. El reset de sesión no toca los otros alcances y el total exige `confirm: true`.
- Desempate determinista por el primer espectador visto; lista de exclusión por `uniqueId`.
- Totales escritos en la misma transacción que el evento; prueba de consistencia entre el log y
  los rankings; un duplicado no suma dos veces.
- Metas sobre totales de sala con ciclos repetibles (`repeatFactor`). `on_reach` se dispara una
  sola vez por ciclo y alcance, también tras un reinicio; acciones con prioridad 80.
- Stats de sesión: espectadores, pico, likes, diamantes, nuevos seguidores, último regalo, último
  seguidor y mejor regalo.
- Snapshots por canal con debounce de 250 ms, `seq` y snapshot completo al conectar.
- Overlays `/overlay/leaderboard`, `/overlay/goal`, `/overlay/stats` y `/overlay/rotator`.
  Animaciones FLIP y de barra solo con `transform`/`opacity`; temas `card`, `clear` y `light`;
  unos 32 KB gzip por overlay.
- API: `GET /leaderboards/:metric`, `POST /leaderboards/reset`, `GET|PUT /settings/leaderboard`,
  CRUD `/goals`, `GET /stats`, `GET|PUT /rotators/:id` y `GET /overlay-data/rotators/:id?key=`.
- `npm run load-test`: el gate de carga contra los 500 ms de desfase.

Pendiente o diferido:

- Ejecutar `npm run load-test -- --rate 1000` con la máquina libre. En la prueba local la CPU
  estaba al 100 % por otras aplicaciones: 200 eventos dieron 234 ms de desfase, pero la tasa real
  solo llegó a 99/s.
- Acción `updateGoal` (sumar progreso manual) y `webhook`: necesitan un ejecutor de acciones del
  lado del servidor; quedan junto con el resto de la fase 2.
- Métrica `top_gift` como ranking: hoy solo existe como "mejor regalo" en stats.
- Retención de 90 días de `live_event` (tarea de limpieza): pendiente para la fase 4.

## Configuración desde el panel (adelanto de fase 4) — 2026-10-07

- Todas las variables de entorno se editan en **Ajustes**. Prioridad: panel (`data/config.json`) >
  `.env` > defecto. Nivel de log, clave de overlays y usuario de TikTok se aplican al instante;
  puerto, host, rutas, simulador y clave de firma con **Reiniciar ahora** (reinicio dentro del
  proceso; si falla, vuelve a la configuración anterior). Solo `CONFIG_PATH` queda fuera del panel.
- Moderación del TTS editable (antes fija en código).
- Autenticación (RNF-07): contraseña argon2id creada con un código de un solo uso en la consola,
  sesiones con caducidad, bloqueo por IP, verificación de origen; protege `/api` y `/ws/admin`.
- Dashboard Angular 21 (Node 22.20 no admite Angular 22): login, Estado (conector, salud, URLs de
  overlays con IP de la LAN, eventos en vivo) y Ajustes. Probado en el navegador, incluido el
  cambio de puerto con reinicio y redirección automática.
- Pantallas completas del dashboard (2026-10-07): Estado, Eventos (filtro, búsqueda, pausa e
  historial de la sesión), Reglas (lista con activar/duplicar/eliminar y aviso de colisiones;
  editor con condiciones y acciones desde un catálogo, validación con el esquema compartido,
  vista JSON y «Probar»), Rankings y metas (rankings por métrica y período, reinicios, metas con
  progreso y celebración, usuarios ocultos), Sonidos e imágenes (subida con detección por
  contenido y límites, vista previa, borrado bloqueado si está en uso), Overlays (configurador
  con vista previa en vivo y URL para copiar; editor del rotator), Simulador (cada tipo de evento
  y «prueba completa») y Ajustes. Backend nuevo: `POST/DELETE /assets`, `POST /rules/:id/test`,
  `GET /events/recent`.
- Pendiente del dashboard: textos en archivos de traducción y pruebas e2e con Playwright.

## Criterios de salida de fase 1 (verificables)

- Pruebas de dominio con cobertura > 80 %.
- Una racha de 10 regalos genera 1 evento (prueba unitaria + integración).
- Reconexión con backoff probada con reloj falso.
- `npm run simulate -- gift` produce sonido en la pestaña de audio.
- Pendiente manual: reconexión tras cortar la red 60 s con un live real.

## Acciones de servidor — 2026-10-08

- `updateGoal` (`goalId`, `amount` entero, negativo resta): el progreso manual se guarda en
  `goal_adjustment` (migración 0005) y se suma al total de la sala. Cuenta como progreso ganado:
  al cruzar la meta se celebra una sola vez por ciclo. También `POST /goals/:id/progress`.
- `webhook` (`url`, `POST|PUT`, `body` JSON con `{variables}` escapadas): fire-and-forget, nunca
  frena el ingest. Protección SSRF: solo hosts de `WEBHOOK_ALLOWED_HOSTS`; las direcciones
  privadas/loopback/metadata se bloquean al conectar salvo hosts en `WEBHOOK_PRIVATE_HOSTS`; sin
  redirecciones, 3 s de timeout, respuesta máx. 64 KB, *circuit breaker* de 5 fallos por host
  (1 min). Sin lista, los webhooks quedan desactivados. `{comment}`/`{commandArgs}` pasan por la
  moderación también en el cuerpo.
- «Probar» una regla no ejecuta acciones de servidor (las cuenta como omitidas).
- Las metas (`onReach`) solo aceptan acciones de pantalla: evita bucles meta → meta.
- Variables de entorno de despliegue (no están en el panel): `WEBHOOK_ALLOWED_HOSTS`,
  `WEBHOOK_PRIVATE_HOSTS` (separadas por comas).
