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
| 0 | Laptop, SO, firewall, verificación de supuestos (sección 18) | Manual — checklist en [fase-0.md](fase-0.md) y `npm run phase0`. Hecha en parte con un live real (2026-10-14); falta anotar en el checklist qué supuestos se comprobaron y las mediciones (CPU, `load-test`) |
| 1 | Monorepo + CI, `contracts`, dominio, `LiveEventSource` (conector + simulador), normalizador, SQLite + migraciones, pestaña de audio | **Hecha y probada en un live real** (2026-10-14). Pendiente: grabar un live y convertirlo en prueba de regresión del mapeo; probar la reconexión tras cortar la red 60 s |
| 2 | Motor de reglas, condiciones/acciones, cola con prioridad, limitadores, TTS + filtros, assets, overlay de alertas | **Hecha** (acciones `webhook` y `updateGoal` el 2026-10-08) |
| 3 | Proyecciones, leaderboards, metas, stats, rotator | **Hecha** (ver abajo) |
| 4 | Dashboard Angular, auth, respaldos, `/health` completo, métricas, runbook, despliegue | **Casi cerrada**: hechos dashboard completo (español e inglés, pruebas e2e), auth, respaldos, restauración, retención, `/health`, `/metrics`, alertas, runbook y despliegue en Windows (ver `docs/operacion.md`, `docs/runbook.md`, `docs/despliegue-windows.md`). Falta el ensayo del despliegue en la laptop y el ensayo de 4 h |
| 5 | v2/v3 | Pendiente: sin alcance definido en este plan; se define al cerrar el ensayo de la fase 4 |

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

1. ~~**Fase 0 (manual):** verificar los supuestos de la sección 18 con un live real~~ hecho en
   parte (2026-10-14); falta registrar el resultado de cada casilla de [fase-0.md](fase-0.md).
2. ~~Modo `record`~~ hecho: `RECORD_PATH=data/live.jsonl` graba cada evento crudo del conector real
   (no del simulador) y `npm run simulate -- replay data/live.jsonl` lo reproduce. Pendiente: grabar
   un live real y convertir un fragmento en prueba de regresión del mapeo.
3. ~~Resto de fase 2~~ hecho (ver abajo).
4. ~~Fase 3: proyecciones, leaderboards, metas, stats y rotator~~ hecha.
5. ~~Fase 4: dashboard Angular, autenticación, respaldos, `/metrics`, despliegue~~ casi cerrada (ver abajo).

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
- Overlays `/overlay/topgifter` (líder de un ranking, reutiliza su canal), `/overlay/ticker` y
  `/overlay/social` (listas en el parámetro, separadas por `|`, sin WebSocket) y galería de plantillas
  predefinidas en la página Overlays (catálogo en el panel, editable y guardable como plantilla propia).
  Overlay `/overlay/feed` (últimos eventos): canal `feed` del servidor (`FeedProjection`, últimos 30
  regalos consolidados, seguidores, compartidos y entradas de la sesión, sin duplicados por id).
  Pendientes de la especificación de overlays que necesitan proyecciones nuevas en el servidor: racha
  más larga, desafíos de regalos con filtro por regalo y guía regalo→acción;
  y los que necesitan integración o motor propio: Spotify, subasta y ruleta.
- API: `GET /leaderboards/:metric`, `POST /leaderboards/reset`, `GET|PUT /settings/leaderboard`,
  CRUD `/goals`, `GET /stats`, `GET|PUT /rotators/:id` y `GET /overlay-data/rotators/:id?key=`.
- `npm run load-test`: el gate de carga contra los 500 ms de desfase.

Pendiente o diferido:

- Ejecutar `npm run load-test -- --rate 1000` con la máquina libre. En la prueba local la CPU
  estaba al 100 % por otras aplicaciones: 200 eventos dieron 234 ms de desfase, pero la tasa real
  solo llegó a 99/s.
- ~~Acciones `updateGoal` y `webhook`~~: hechas el 2026-10-08 (ver «Acciones de servidor»).
- Métrica `top_gift` como ranking: hoy solo existe como "mejor regalo" en stats.
- ~~Retención de 90 días de `live_event`~~: hecha en la fase 4 (limpieza diaria en bloques).

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
- Textos del dashboard en archivos de traducción (español e inglés, 2026-10-15): ver [i18n.md](i18n.md).
- Pruebas e2e del dashboard con Playwright (2026-10-15): ver [e2e.md](e2e.md).

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

## Fase 4 — avance 2026-10-08

- Mantenimiento en proceso (sin cron): respaldo diario de SQLite (14 días), copia semanal de
  assets, limpieza diaria de eventos > 90 días; `npm run restore` verifica el archivo y guarda la
  base anterior. Probado: respaldo con la base en uso → restauración → mismas filas.
- `/health` ampliado (memoria, retraso del bucle, disco, último respaldo, alertas de la spec §15) y
  `/metrics` en formato Prometheus (detrás de la sesión). Alertas visibles en Estado.
- Despliegue en **Windows** (elegido): `npm run package` genera `release/tiklive-*.tgz`; los
  scripts de `deploy/windows` instalan una tarea de arranque con reinicio en ~3 s, despliegan con
  copia previa de la base y rollback automático. El paquete se probó en Linux (extraer, `npm ci
  --omit=dev`, arrancar, `/health`, panel y overlays); **los scripts de PowerShell no se han
  podido ejecutar** y hay que ensayarlos (lista al final de `despliegue-windows.md`).
- Runbook de incidentes completo en [runbook.md](runbook.md) (2026-10-15).
- Pendiente: el ensayo de 4 h.

## Pendiente actual (2026-10-15)

Manual, en la laptop o con un live real:

1. Ensayar `deploy/windows` (lista al final de `despliegue-windows.md`): tarea de arranque,
   reinicio < 10 s tras `taskkill`, reinicio de Windows, despliegue con paquete roto y rollback,
   restauración de un respaldo.
2. Ensayo de 4 h continuas con simulador y pestaña de audio abierta, sin intervención.
3. `npm run load-test -- --rate 1000` con la máquina libre (desfase < 500 ms) y `npm run phase0 -- cpu`.
4. Grabar un live (`RECORD_PATH`) y convertir un fragmento en prueba de regresión del mapeo;
   probar la reconexión tras cortar la red 60 s.
5. Anotar en [fase-0.md](fase-0.md) el resultado de cada casilla ya comprobada con el live real.

De código, sin urgencia:

- Métrica `top_gift` como ranking.
- Hallazgos abiertos de [DOCUMENTACION_TECNICA.md](DOCUMENTACION_TECNICA.md): reinicio en proceso
  que puede dejar la app sin servidor HTTP (F-02), `config.json` corrupto que impide arrancar
  (F-07), `Origin` en `/ws/admin` (SEC-05), intentos de `setup` sin límite (SEC-06),
  `frame-ancestors` (SEC-04), mensajes del servidor sin traducir.
- Fase 5 (v2/v3): definir su alcance.

## TTS: voces, audiencia e idioma — 2026-10-14

Decisiones en [ADR 0013](adr/0013-tts-voices-audience-and-language.md).

- Ajustes → **Voz (TTS)**: motor (navegador o voces neuronales de Microsoft Edge), idioma, género,
  voz concreta, velocidad, tono y «Probar voz». Con Edge la pantalla de audio pide el MP3 a
  `POST /overlay-data/tts` y, si falla, lee con la voz del navegador.
- A quién se lee: todos, o seguidores, super fans, moderadores, fan club (nivel mínimo), global
  gifters (nivel de gifter de TikTok) y top N del ranking de la sala; listas «leer siempre» y
  «no leer nunca».
- Formato: mayúsculas, repeticiones, signos y apodos decorados. Moderación: letras decoradas a
  texto normal antes de la lista de bloqueo.
- Otro alfabeto u otro idioma: omitir (por defecto), quitar letras, cambiar de voz o leer igual.
- Simulador: el comentario permite elegir seguidor, super fan, moderador y niveles.
- Probado en el navegador con un servidor aparte (simulador): lectura con Edge, filtros de
  audiencia (seguidores, global gifters), ruso y inglés omitidos, «𝓺𝓾𝓮 𝓫𝓾𝓮𝓷 𝓵𝓲𝓿𝓮» leído normal y
  respaldo al navegador cuando Edge responde error.
- Pendiente: confirmar con un live real que TikTok envía nivel de gifter y de fan club.
