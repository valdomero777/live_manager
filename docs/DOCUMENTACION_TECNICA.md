# DOCUMENTACIÓN TÉCNICA DEL PROYECTO — TikLive

> Generada el 2026-10-07 a partir del código fuente, la configuración y las ejecuciones de `vitest`, `eslint`, `tsc`, `depcruise` y `npm audit` hechas durante el análisis.
> **Revisada el 2026-10-15** contra `main` (tras los PR #1–#9): se actualizaron los estados, las rutas, las tablas, las variables, las pruebas, el CI y la operación, y se verificó cada hallazgo abierto contra el código. Las secciones que no cambiaron se conservan como estaban.
> Convención de estados: `IMPLEMENTADO` · `PARCIALMENTE IMPLEMENTADO` · `DETECTADO PERO NO UTILIZADO` · `CONFIGURADO PERO NO IMPLEMENTADO` · `REFERENCIADO PERO AUSENTE` · `NO DETERMINABLE` · `RECOMENDACIÓN`.
> Cada bloque separa **Evidencia encontrada**, **Interpretación** y **Recomendación**. Lo que no se pudo demostrar se marca: *"No fue posible determinarlo a partir del código analizado."*
> Alcance de la revisión: todo el repositorio salvo `node_modules/`, `dist/` y `data/`. No se leyó línea por línea cada componente Angular ni cada overlay; en esos casos se indica.

---

## 1. Resumen ejecutivo

**Qué es.** Plataforma local, de un solo proceso Node.js, que convierte los eventos de un TikTok LIVE propio (comentarios, regalos, likes, follows, entradas, shares, espectadores) en sonidos, voz (TTS), alertas visuales, rankings, metas y estadísticas, mostrados en pestañas/overlays que se cargan en la PC de stream (LIVE Studio / OBS). Se administra desde un panel Angular en `/admin/`.

**Estado.** Funcional, probado en simulador y **probado en un live real** (2026-10-14; ver ADR 0011). 310 pruebas unitarias y de integración y 30 pruebas de navegador (Playwright) en verde; lint, tipos y regla de capas sin errores; `npm audit` sin vulnerabilidades. Siguen pendientes el ensayo del despliegue en Windows, el ensayo de 4 h y una prueba de carga con la máquina libre (`docs/plan.md`).

| Aspecto | Estado |
| --- | --- |
| Arquitectura | Monolito modular en capas (domain / application / infrastructure / interface) con puertos y adaptadores; regla de capas verificada con dependency-cruiser |
| Stack | Node ≥22, TypeScript ~6.0, Fastify 5, SQLite (better-sqlite3 + Kysely), Zod 4, Pino, tiktok-live-connector 2.5.0, Angular 21, Vite 8 (overlays) |
| Fortalezas | Dominio puro y testeable; contratos Zod compartidos; transacción atómica evento+rankings; reconexión con backoff; CSP y `textContent` en overlays; contraseña argon2id; configuración editable desde la UI |
| Debilidades | Sin HTTPS (solo LAN); scripts de despliegue de Windows sin ensayar; sin Docker; un reinicio fallido desde Ajustes puede dejar el proceso vivo sin servidor HTTP (F-02); `config.json` corrupto impide arrancar (F-07); mensajes del servidor solo en español |
| Críticos | R-01 conector no oficial de TikTok (probado en un live real, sigue siendo el mayor riesgo); F-02 reinicio en proceso que puede dejar la app caída |
| Testing | 40 archivos / 310 pruebas (vitest); 30 pruebas de navegador (Playwright, `e2e/`); 0 pruebas unitarias en overlays |
| Infraestructura | CI de GitHub Actions (verificación + e2e); despliegue en Windows con tarea programada, paquete `.tgz`, despliegue y rollback (`deploy/windows`, sin ensayar); sin Dockerfile ni proxy inverso |
| Prioridades | P0: blindar `AppHost.restart()` (F-02) y `JsonConfigStore.read` (F-07). P1: ensayar el despliegue y las 4 h; `frame-ancestors`, `Origin` en `/ws/admin` y límite de intentos de `setup` (SEC-04/05/06). Ver §37 |

---

## 2. Descripción del sistema

**Evidencia encontrada** (`README.md`, `docs/plan.md`, `Especificación técnica…md`, código):

- Corre en una laptop de la LAN; la PC de stream solo abre una pestaña de audio y URLs de overlay.
- Flujo: `TikTok LIVE → tiktok-live-connector → RawLiveEvent → normalizador → persistencia + proyecciones → motor de reglas / triggers → cola por pantalla → WebSocket → overlay/audio → action.done`.
- Un **simulador** emite el mismo `RawLiveEvent` que el adaptador real, por el mismo camino (ADR 0008).
- Idioma del panel: español (fuente) e inglés, con selector en la barra superior (`docs/i18n.md`). Los mensajes que escribe el servidor siguen en español.

**Roles/actores**

| Actor | Acceso | Mecanismo |
| --- | --- | --- |
| Administrador (único) | Panel `/admin/`, `/api/v1/*`, `/ws/admin` | Contraseña argon2id + cookie de sesión |
| Overlay / pestaña de audio | `/ws/screen/:id`, `/overlay-data/*` | Token de solo lectura `?key=` (clave de overlays) |
| Herramientas CLI | API | Login con `TIKLIVE_PASSWORD` y cookie |
| Espectadores de TikTok | Solo como origen de eventos | — |

No existen roles múltiples, RBAC ni ABAC: **hay un único rol administrador** (NO hay gestión de usuarios).

## 3. Alcance

| Dentro | Fuera / pendiente |
| --- | --- |
| Conector TikTok (lectura), simulador, reglas (8 condiciones, 5 acciones: `playSound`, `showAlert`, `speak`, `updateGoal`, `webhook`), triggers de sonido (MyInstants y Freesound), assets, rankings, metas, stats, rotator, plantillas de overlay, ajustes, auth, grabación y repetición de eventos (`record`/`replay`), respaldos, retención, `/metrics`, despliegue en Windows, panel en español e inglés, pruebas de navegador | Fase 5 (v2/v3); acciones de control de OBS/LIVE Studio («Cambiar escena o fuente» aparece en el panel como «Próximamente»); HTTPS; Docker |

---

## 4. Arquitectura

### 4.1 Patrón (con evidencia)

| Patrón | ¿Presente? | Evidencia |
| --- | --- | --- |
| Monolito modular, un proceso | Sí | `apps/server/src/main/index.ts` (`AppHost`), un único `Fastify` |
| Capas + Puertos/Adaptadores (hexagonal) | Sí, **verificado por herramienta** | `.dependency-cruiser.cjs`: `domain` no importa nada externo salvo contracts/zod; `application` solo depende de puertos (`application/ports/*`); `tiktok-live-connector` solo en `infrastructure/tiktok`; `no-circular`. `npm run depcheck` → 0 violaciones (147 módulos, 2026-10-15) |
| Inyección manual (composition root) | Sí | `main/composition-root.ts` es el único lugar que instancia dependencias concretas |
| Event-driven interno | Parcial | `IngestLiveEvent` hace fan-out a consumidores (`SnapshotPublisher`, `RuleEngine`, `TriggerExecutor`); no hay bus ni cola externa. Un notificador medido (`metered-notifier.ts`) cuenta los eventos para `/metrics` |
| Read models / proyecciones | Sí | `leaderboard_total`, `metric_total`, `goal_cycle`, `StatsProjection` (memoria); ADR 0009 |
| CQRS completo / Event sourcing | No | `live_event` es log, pero el estado no se reconstruye desde él |
| Microservicios / serverless | No | — |
| MVC clásico | No | Rutas Fastify → servicios de aplicación |

**Interpretación.** El proyecto se ajusta a *Clean/Hexagonal Architecture* en el servidor porque la regla se **impone automáticamente**, no solo por nombres de carpetas.

### 4.2 Diagrama de componentes

```mermaid
flowchart LR
  subgraph TikTok
    TT[TikTok LIVE]
  end
  subgraph Laptop["Laptop (un proceso Node)"]
    ADP[infrastructure/tiktok<br/>TikTokLiveConnectorAdapter]
    SIM[SimulatedSource]
    SUP[ConnectorSupervisor<br/>backoff + estados]
    PIPE[LiveEventPipeline<br/>FIFO + EventNormalizer]
    ING[IngestLiveEvent]
    DB[(SQLite WAL<br/>data/app.db)]
    PUB[SnapshotPublisher<br/>proyecciones]
    RE[RuleEngine]
    TR[TriggerExecutor]
    AS[ActionScheduler<br/>cola por pantalla]
    HTTP[Fastify<br/>/api/v1 · estáticos · WS]
    CFG[(data/config.json)]
    ASSETS[(data/assets)]
  end
  subgraph Stream["PC de stream"]
    AUD[/screen/audio/]
    ALR[/screen/alerts/]
    OV[/overlay/*/]
  end
  ADM[Panel Angular /admin]
  MI[API comunitaria MyInstants]
  FS[API de Freesound]
  WH[Webhooks del usuario]
  BK[(data/backups)]

  TT --> ADP --> SUP
  SIM --> SUP
  SUP -->|RawLiveEvent| PIPE --> ING --> DB
  ING --> PUB & RE & TR
  RE & TR --> AS --> HTTP
  PUB --> HTTP
  HTTP <-->|WS /ws/screen| AUD & ALR & OV
  ADM <-->|REST + /ws/admin| HTTP
  HTTP --> CFG
  HTTP --> ASSETS
  HTTP --> MI & FS
  RE --> WH
  HTTP --> BK
```

### 4.3 Capas

| Capa | Ubicación | Responsabilidad | Depende de |
| --- | --- | --- | --- |
| Dominio | `apps/server/src/domain` | Rachas de regalos, ventanas de likes, condiciones, limitador, plantillas, cola con prioridad, filtros TTS, backoff, máquina de estados del conector, deltas de proyección | `@tiklive/contracts`, `zod` |
| Aplicación | `…/application` | Casos de uso, puertos, supervisor, pipeline, motor de reglas, auth, assets, ajustes, health | domain + puertos |
| Infraestructura | `…/infrastructure` | SQLite/Kysely, TikTok, MyInstants, WS hubs, argon2, JSON config, Pino, almacenamiento local | application (puertos) |
| Interfaz | `…/interface` | Rutas HTTP y WS | application (no infraestructura) |
| Main | `…/main` | Composition root, configuración, seed, `AppHost` | todas |
| Contratos | `packages/contracts` | Esquemas Zod compartidos servidor / dashboard / overlays | `zod` |
| Overlays | `packages/overlays` | Páginas sin framework (Vite) | contracts |
| Dashboard | `apps/dashboard` | SPA Angular 21 standalone | contracts |

### 4.4 Comunicación

- Frontend ↔ Backend: REST JSON con errores `application/problem+json` (RFC 9457) y WebSocket `/ws/admin` (eventos en vivo, estado del conector).
- Overlays ↔ Backend: WebSocket `/ws/screen/:screenId?key=`; sobres `{v, type, ts, payload}` versión 1; snapshot inicial + deltas con `seq`.
- Backend ↔ externos: TikTok (librería), API comunitaria MyInstants (HTTPS, timeout 8 s), API oficial de Freesound (necesita clave), catálogo de regalos de TikTok (`TikTokGiftCatalog`) y los webhooks que el usuario permita (`WEBHOOK_ALLOWED_HOSTS`; timeout 3 s, sin redirecciones, protección SSRF y *circuit breaker*).

---

## 5. Stack tecnológico

| Área | Tecnología | Versión (declarada) | Notas |
| --- | --- | --- | --- |
| Runtime | Node.js | `>=22` (`.nvmrc`: 22) | Angular 21 elegido por Node 22.20 del usuario |
| Lenguaje | TypeScript | `~6.0.3` raíz; `~5.9.2` dashboard | Dos versiones conviven |
| HTTP | Fastify | `^5.12.5` | + `@fastify/cookie`, `multipart`, `static`, `websocket` |
| Validación | Zod | `^4.6.5` | Contratos compartidos |
| BD | SQLite vía `better-sqlite3` | `^13.0.3` | WAL, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000` |
| Query builder | Kysely | `^0.29.6` | `SqliteEventStore` usa better-sqlite3 directo (ADR 0009) |
| Hash | `@node-rs/argon2` | `^2.2.2` | argon2id |
| Logging | Pino | `^10.4.0` | `pino-pretty` en dev |
| Conector | `tiktok-live-connector` | `2.5.0` (fijada) | No oficial |
| Frontend | Angular | `^21.2.0` | Standalone, signals, lazy routes; RxJS `~7.8` |
| Overlays | Vite | `^8.3.3` | Sin framework |
| Test | Vitest + v8 | `^5.0.3` | Unitarias, integración y e2e de API/WS en proceso |
| Test de navegador | Playwright (`@playwright/test`) | `1.56.1` (fija) | Suite `e2e/` contra el servidor compilado; ver `docs/e2e.md` |
| i18n | `@angular/localize` | `~21.2.0` | Español (fuente) e inglés; ver `docs/i18n.md` |
| Lint/format | ESLint 10, typescript-eslint, Prettier 3.6 | — | — |
| Arquitectura | dependency-cruiser | `^17.0.0` | — |
| CI | GitHub Actions | — | `ubuntu-latest`; jobs `verify` y `e2e` |

No existen: ORM pesado, Redis/colas externas/caché externa, Docker, Kubernetes, Nginx/Apache, CDN, SMTP, SMS, OAuth. El despliegue elegido es **Windows** (tarea programada de arranque que reinicia el servidor tras ~3 s; `deploy/windows`, `docs/despliegue-windows.md`). Un comentario de `main/index.ts` aún habla de systemd: no hay unidad para Linux.

---

## 6. Estructura del proyecto

```
.
├─ apps/
│  ├─ server/        (Fastify, dominio, SQLite) src/{domain,application,infrastructure,interface,main}, migrations/, test/
│  └─ dashboard/     (Angular 21) src/app/{core,features,components,lib}, src/locale (traducciones)
├─ packages/
│  ├─ contracts/     (Zod: eventos, WS, reglas, settings, proyecciones, sonidos, assets, simulador)
│  └─ overlays/      (Vite) screen/{audio,alerts}, overlay/{leaderboard,goal,stats,rotator}, src/{core,panels,screens,styles}
├─ e2e/              Playwright: servidor de prueba, sesión, specs del panel y overlays
├─ deploy/windows/   install · deploy · rollback · run-tiklive (PowerShell)
├─ tools/            simulate · watch-events · load-test · admin-session · package · phase0-check
├─ docs/             plan · operacion · runbook · despliegue-windows · fase-0 · i18n · e2e · adr/0008–0011 · (este documento)
├─ .github/workflows/ci.yml
├─ .claude/launch.json   (config de preview del entorno de desarrollo)
├─ .dependency-cruiser.cjs · eslint.config.js · vitest.config.ts · tsconfig.base.json · .prettierrc.json
└─ Especificación técnica plataforma local de interacción para TikTok LIVE.md  (1437 líneas)
```

### 6.1 Inventario resumido

| Componente | Ubicación | Propósito | Estado | Dependencias | Observaciones |
| --- | --- | --- | --- | --- | --- |
| Composition root | `apps/server/src/main/composition-root.ts` | Cableado manual | IMPLEMENTADO | todos | Único sitio con `new` de adaptadores |
| AppHost / reinicio | `main/index.ts` | Ciclo de vida, reinicio en proceso con rollback | PARCIALMENTE IMPLEMENTADO | config | Falla abierta F-02 (verificada 2026-10-15) |
| Config | `main/config.ts`, `infrastructure/config/json-config-store.ts` | Precedencia UI > env > defecto | IMPLEMENTADO | contracts | — |
| Seed | `main/seed.ts` | Datos de ejemplo | IMPLEMENTADO | SQLite | `npm run seed` |
| Conector | `application/connector`, `infrastructure/tiktok` | Conexión + backoff | IMPLEMENTADO (sin validar en live real) | tiktok-live-connector | R-01 |
| Simulador | `application/simulator`, `infrastructure/simulator` | Eventos sintéticos | IMPLEMENTADO | — | — |
| Ingesta | `application/ingest` | Normalizar, deduplicar, persistir | IMPLEMENTADO | SQLite | FIFO único |
| Reglas | `application/rules`, `domain/rules` | Motor evento→condiciones→acciones | IMPLEMENTADO | — | 8 condiciones, 3 acciones |
| Triggers de sonido | `application/triggers`, `sounds`, `infrastructure/{myinstants,freesound}` | Sonido de MyInstants o Freesound por tipo de evento | IMPLEMENTADO | API comunitaria + API de Freesound | MyInstants es no oficial; ADR 0011 |
| Cola de acciones | `application/actions`, `domain/queue` | Cola por pantalla con acuse | IMPLEMENTADO | WS | — |
| Proyecciones | `application/projections`, `domain/projections` | Rankings, metas, stats, rotator | IMPLEMENTADO | SQLite | Stats en memoria |
| Assets | `application/assets`, `infrastructure/storage` | Subida/borrado | IMPLEMENTADO | disco | Detección por contenido |
| Auth | `application/auth`, `infrastructure/auth` | Login/sesión | IMPLEMENTADO | argon2 | Sesiones en memoria |
| Ajustes | `application/settings` | Variables editables | IMPLEMENTADO | config | — |
| Health y alertas | `application/health` | `/health` con memoria, retraso del bucle, disco, último respaldo y alertas (`connector_down`, `audio_offline`, `queue_full`, `disk_low`, `backup_stale`) | IMPLEMENTADO | — | `docs/operacion.md` |
| Métricas | `application/metrics` | `/metrics` en formato Prometheus, detrás de la sesión | IMPLEMENTADO | — | 11 métricas registradas en `composition-root.ts` (lista en `docs/operacion.md`) |
| Mantenimiento | `application/maintenance`, `infrastructure/backup`, `sqlite/{restore,sqlite-event-retention}` | Respaldo diario de SQLite (14 días), copia semanal de assets (4), retención de `live_event` a 90 días, `npm run restore` | IMPLEMENTADO | SQLite | Probado respaldo → restauración |
| Grabación de eventos | `infrastructure/recording` | `RECORD_PATH` graba el live real en JSONL; `npm run simulate -- replay` lo repite | IMPLEMENTADO | — | Falta convertir una grabación real en prueba de regresión |
| Webhooks | `infrastructure/http/http-webhook-client.ts` | Acción `webhook` con lista de hosts, bloqueo de direcciones privadas, sin redirecciones, *circuit breaker* | IMPLEMENTADO | — | `docs/plan.md` («Acciones de servidor») |
| Despliegue Windows | `deploy/windows`, `tools/package.ts` | Paquete, tarea de arranque, despliegue con copia previa y rollback | IMPLEMENTADO (**sin ensayar en Windows**) | PowerShell 5.1 | `docs/despliegue-windows.md` |
| Dashboard | `apps/dashboard` | Panel admin en español e inglés | IMPLEMENTADO | contracts | 11 secciones; 3 specs unitarias y la suite e2e |
| Overlays | `packages/overlays` | Pantallas | IMPLEMENTADO | contracts | Sin tests |
| `tools/*` | `tools/` | CLI (`simulate`, `watch-events`, `load-test`, `admin-session`, `package`, `phase0-check`) | IMPLEMENTADO | API | — |
| ADR 0002 | — | — | REFERENCIADO PERO AUSENTE | — | citado en `tiktok-live-connector.adapter.ts` y `live-event-source.ts`; solo existen 0008–0011 |

**Obsoletos/duplicados/sin referencias detectados**

- `.env.example` tenía el bloque `MYINSTANTS_API_URL` duplicado y no listaba `OVERLAYS_DIR` ni `DASHBOARD_DIR`: corregido el 2026-10-15.
- `docs/plan.md` se reconcilió el 2026-10-15 (tabla de fases, pendientes y estado de la fase 4).
- `apps/server/dist/` y `apps/dashboard/dist/` existen localmente (ignorados por git); `.claude/launch.json` es de entorno de desarrollo.
- Endpoints sin consumidor en el dashboard (revisado el 2026-10-15): `POST /queue/clear`, `GET /stats`, `GET /overlay-data/rotators/:id` (lo consume el overlay, no el panel) y `GET /metrics` (pensado para Prometheus). **NO DETERMINABLE** si alguien los usa externamente.

---

## 7. Módulos

| Módulo | Qué hace | Archivos clave |
| --- | --- | --- |
| Ingesta | `RawLiveEvent` → `LiveEvent` (dedupe por `msgId`, rachas de regalos, deltas de likes) → SQLite → consumidores | `ingest/event-normalizer.ts`, `live-event-pipeline.ts`, `ingest-live-event.ts`, `sqlite-event-store.ts` |
| Sesión | Una `live_session` activa por destino; se cierra con `streamEnd` | `ingest/session-service.ts`, `sqlite-session-repository.ts` |
| Reglas | Compila reglas, evalúa condiciones, aplica cooldown/probabilidad/prioridad, resuelve plantillas con moderación | `rules/rule-engine.ts`, `domain/rules/*` |
| Moderación TTS | 8 filtros sobre `{comment}`/`{commandArgs}` | `domain/tts/text-filters.ts`, `settings/moderation-service.ts` |
| Cola | Concurrencia 1 por pantalla, timeout, 3 reintentos, descarta acciones >60 s | `actions/action-scheduler.ts`, `domain/queue/action-queue.ts` |
| Proyecciones | Rankings (diamonds, gift_count, likes × session/week/total), metas con ciclos, stats | `projections/*` |
| Publicación | Snapshots por canal, debounce 250 ms, `seq` | `snapshot-publisher.ts` |
| Auth | Contraseña, sesiones, bloqueo | `auth/auth-service.ts`, `interface/http/auth-routes.ts` |
| Ajustes | PATCH de 11 ajustes + moderación; reinicio | `settings/*`, `settings-routes.ts` |
| Assets | Biblioteca de audio/imagen/video | `assets/*`, `asset-routes.ts` |
| Triggers | CRUD + búsqueda en MyInstants y Freesound | `triggers/*`, `sounds/*`, `trigger-routes.ts` |
| Mantenimiento | Respaldos, retención de eventos, último respaldo para `/health` | `maintenance/maintenance-service.ts`, `backup/file-backup-store.ts`, `sqlite-event-retention.ts` |
| Métricas | Registro de contadores, *gauges* e histogramas; `/metrics` | `metrics/metrics-registry.ts`, `metered-notifier.ts` |
| Plantillas de overlay | Configuraciones guardadas de overlays (lista JSON en `app_setting`) | `projections/overlay-template-service.ts` |

---

## 8. Funcionalidades

Formato abreviado; todas con estado **IMPLEMENTADO** salvo indicación. Todas las rutas REST exigen sesión de administrador salvo `health`/`auth/status|login|setup`.

| # | Funcionalidad | Frontend | Backend | Endpoints | Tablas | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Conexión a TikTok LIVE con reconexión | `features/status` | `connector-supervisor.ts`, `tiktok-live-connector.adapter.ts` | `GET /connector`, `POST /connector/connect\|disconnect` | `live_session` | `connector-supervisor.spec.ts`, `app.e2e.spec.ts` |
| F2 | Simulador de eventos | `features/simulator` | `simulator-service.ts` | `POST /simulator/emit`, WS `simulator.emit` | todas las de ingesta | `app.e2e.spec.ts` |
| F3 | Registro de eventos y vista en vivo | `features/events` | `ingest-live-event.ts` | `GET /events/recent`, WS `event.received` | `live_event`, `viewer` | `sqlite.integration.spec.ts` |
| F4 | Reglas (CRUD, probar, duplicar) | `features/rules` | `rule-service.ts`, `rule-engine.ts` | `/rules`, `/rules/:id`, `/rules/:id/test` | `rule` | `rule-engine.spec.ts`, `conditions.spec.ts`, `rules-core.spec.ts`, `assets-rules.e2e.spec.ts` |
| F5 | Triggers de sonido (MyInstants y Freesound) | `features/triggers` | `trigger-service.ts`, `trigger-executor.ts`, `myinstants-provider.ts` | `/sounds/search`, `/triggers…` | `sound_trigger` | `trigger-executor.spec.ts`, `sound-search-service.spec.ts`, `myinstants-provider.spec.ts`, `freesound-provider.spec.ts`, `triggers.e2e.spec.ts` |
| F6 | Assets (subir/borrar) | `features/assets` | `asset-service.ts` | `/assets` | `asset` | `assets-rules.e2e.spec.ts` |
| F7 | Rankings | `features/rankings` | `leaderboard-service.ts` | `/leaderboards/:metric`, `/leaderboards/reset`, `/settings/leaderboard` | `leaderboard_total`, `metric_total`, `app_setting` | `projections.*.spec.ts` |
| F8 | Metas con ciclos | `features/rankings` | `goal-service.ts` | `/goals…` | `goal`, `goal_cycle` | `projections.integration.spec.ts` |
| F9 | Stats de sesión | `overlay/stats` | `stats-projection.ts` | `GET /stats`, WS `stats` | memoria | `projections.spec.ts` |
| F10 | Rotator de paneles | `features/overlays` | `rotator-service.ts` | `/rotators/:id`, `/overlay-data/rotators/:id` | `app_setting` (interpretación) | parcial |
| F11 | Overlays y pantalla de audio/alertas | `packages/overlays` | WS hubs | `/ws/screen/:id`, estáticos | — | sin pruebas unitarias; la alerta en el overlay se cubre en `e2e/rules.spec.ts` |
| F12 | Ajustes (env editables), rotación de clave, reinicio | `features/settings` | `settings-service.ts`, `main/index.ts` | `/settings…` | — (`config.json`) | `settings.integration.spec.ts`, `settings-auth.e2e.spec.ts` |
| F13 | Moderación TTS | `features/settings` | `moderation-service.ts` | `/settings/moderation` | `app_setting` | `text-filters.spec.ts` |
| F14 | Autenticación | `features/login` | `auth-service.ts` | `/auth/*` | `config.json` | `settings-auth.e2e.spec.ts` |
| F15 | Catálogo de regalos | `shared/gift-grid` | `gift-catalog-service.ts` | `GET /gifts` | `app_setting` (interpretación) | `gift-catalog-service.spec.ts`, `tiktok-gift-catalog.spec.ts` |
| F16 | Prueba de carga | `tools/load-test.ts` | app de test | — | — | gate manual |
| F17 | Acciones `webhook` y `updateGoal` | `features/rules` (catálogo de acciones) | `http-webhook-client.ts`, `goal-service.ts` | `POST /goals/:id/progress` | `goal_adjustment` | `http-webhook-client.spec.ts`, `server-action-runner.spec.ts`, `projections.integration.spec.ts` |
| F18 | Respaldos y retención | `features/status` (alertas) | `maintenance-service.ts` | `GET\|POST /backups` | todas | `maintenance-service.spec.ts`, `maintenance.integration.spec.ts`, `observability.e2e.spec.ts` |
| F19 | Métricas | — | `metrics-registry.ts` | `GET /metrics` | — | `metrics-registry.spec.ts`, `observability.e2e.spec.ts` |
| F20 | Plantillas de overlay | `features/overlays` | `overlay-template-service.ts` | `/overlay-templates…` | `app_setting` | `overlays.spec.ts` (e2e) |
| F21 | Idioma del panel | barra superior | — | — | — | `messages.spec.ts`, `language.spec.ts` (e2e) |

### 8.1 Detalle de la funcionalidad principal (F1→F4: de evento a reacción)

- **Precondiciones:** servidor iniciado; `SIMULATE=true` o `TIKTOK_USERNAME` definido (o `POST /connector/connect`); al menos una pantalla conectada para ver efecto.
- **Flujo principal:** (1) adaptador mapea mensaje → `RawLiveEvent`; (2) `LiveEventPipeline.accept` encola en cadena de promesas; (3) `SessionService.ensureActive`; (4) `EventNormalizer.push` (deduplicación LRU, consolidación de rachas, ventana de likes); (5) `IngestLiveEvent.execute`: `SqliteEventStore.save` (viewer + evento + deltas de 3 alcances en una transacción); (6) si no es duplicado: `event.received` al admin y consumidores en orden `[SnapshotPublisher, RuleEngine, TriggerExecutor]`; (7) `ActionScheduler` envía al WS de la pantalla; (8) la pantalla responde `action.done|failed`.
- **Alternativos:** duplicado → ignorado; consumidor falla → se registra y se publica `error.reported`, no bloquea a los demás; pantalla desconectada → reintentos (máx. 3) o descarte tras 60 s.
- **Errores:** `ConnectFailure` (`host_offline` → espera 30 s; `network` → backoff 1–30 s + jitter 0,5 s; `protocol` → detiene tras 5 fallos; `cancelled`).
- **Seguridad:** textos de espectadores pasan por moderación antes de TTS; overlays usan `textContent`.

---

## 9. Flujos de negocio

```mermaid
sequenceDiagram
  participant T as TikTok
  participant A as Adapter
  participant P as Pipeline (FIFO)
  participant D as SQLite
  participant R as RuleEngine/Trigger
  participant Q as ActionScheduler
  participant S as Pantalla /screen/audio
  T->>A: mensaje (gift, chat…)
  A->>P: RawLiveEvent
  P->>P: normalizar (dedupe, racha, likes)
  P->>D: TX: viewer + live_event + totales
  D-->>P: isNew
  P->>R: handle(event)
  R->>Q: PlannedAction
  Q->>S: action.play_sound / speak / show_alert
  S-->>Q: action.done | action.failed
  Q->>Q: siguiente acción
```

Otros flujos: **login/setup** (§11), **cambio de ajustes con reinicio** (§16), **subida de asset** (multipart → detección por magic bytes → hash SHA-256 → `data/assets/<hash16>.<ext>` → `asset`), **meta alcanzada** (`GoalService` inserta `goal_cycle` y encola `onReach` con prioridad 80, una vez por ciclo y alcance).

---

## 10. API

Base: `/api/v1`. Errores: `application/problem+json` `{type,title,status,detail?,errors?[]}`. Cuerpo validado con Zod (400 con lista de rutas inválidas). Sin paginación, sin versionado distinto de v1, sin rate limit.

**Auth «S»** = cookie `tiklive_session` requerida. **Rol** = único (administrador).

### 10.1 Catálogo

| Método | Ruta | Descripción | Auth | Archivo |
| --- | --- | --- | --- | --- |
| GET | `/health` | Salud y alertas (200/503) | Pública | `routes.ts` |
| GET | `/metrics` | Métricas en formato Prometheus | S | idem |
| GET/POST | `/backups` | Estado y lista de respaldos / respaldar ahora `{kind: db\|assets}` | S | idem |
| GET | `/auth/status` | Estado de sesión/primer uso | Pública | `auth-routes.ts` |
| POST | `/auth/setup` | Crear contraseña con código de consola | Pública | idem |
| POST | `/auth/login` | Login | Pública | idem |
| POST | `/auth/logout` | Cierra sesión (204) | S | idem |
| POST | `/auth/password` | Cambiar contraseña (204, invalida otras sesiones) | S | idem |
| GET | `/connector` | Estado del conector | S | `routes.ts` |
| POST | `/connector/connect` | Conectar `{username}` (202) | S | idem |
| POST | `/connector/disconnect` | Detener | S | idem |
| GET/POST | `/rules` | Listar / crear (201) | S | idem |
| GET/PUT/DELETE | `/rules/:id` | Leer / actualizar / borrar (204) | S | idem |
| POST | `/rules/:id/test` | Probar regla con evento de muestra | S | idem |
| GET | `/events/recent?limit=1..500` (def. 200) | Eventos recientes de la sesión actual | S | idem |
| POST | `/simulator/emit` | `{raw}` o plantilla; cabecera `Idempotency-Key` opcional (202) | S | idem |
| GET | `/gifts?refresh=` | Catálogo de regalos | S | idem |
| POST | `/queue/clear` | `{screen?}` → `{cleared}` | S | idem |
| GET | `/leaderboards/:metric?scope=&limit=1..20` | Ranking | S | `projection-routes.ts` |
| POST | `/leaderboards/reset` | `{scope, confirm}` (`total` exige `confirm:true`) | S | idem |
| GET/PUT | `/settings/leaderboard` | Usuarios excluidos | S | idem |
| GET/POST | `/goals` | Listar / crear | S | idem |
| GET/PUT/DELETE | `/goals/:id` | GET incluye `progress` | S | idem |
| POST | `/goals/:id/progress` | Suma progreso manual (`amount` entero, negativo resta) | S | idem |
| GET/POST | `/overlay-templates` | Plantillas de overlay guardadas | S | idem |
| PUT/DELETE | `/overlay-templates/:id` | Actualizar / borrar | S | idem |
| GET | `/stats` | Snapshot de stats | S | idem |
| GET/PUT | `/rotators/:id` | Config del rotator (`ROTATOR_ID` regex) | S | idem |
| GET | `/settings` | Valores (secretos solo `isSet`) | S | `settings-routes.ts` |
| PATCH | `/settings` | Parche estricto (`null` borra override) | S | idem |
| POST | `/settings/overlay-key/rotate` | Nueva clave de overlays | S | idem |
| POST | `/settings/restart` | Reinicio en proceso (202, 300 ms de retardo) | S | idem |
| GET | `/settings/addresses` | IPv4 de la LAN | S | idem |
| GET/PUT | `/settings/moderation` | Moderación TTS | S | idem |
| GET | `/sounds/search?q=&page=&source=` | Búsqueda MyInstants o Freesound (502 si falla, 503 si falta la clave de Freesound) | S | `trigger-routes.ts` |
| GET/POST | `/triggers` | Listar / crear | S | idem |
| GET/PUT/DELETE | `/triggers/:id` | CRUD | S | idem |
| POST | `/triggers/:id/test` | Encola el sonido guardado | S | idem |
| GET | `/assets` | Listar | S | `asset-routes.ts` |
| POST | `/assets` | Multipart campo `file` (201; 413/415) | S | idem |
| DELETE | `/assets/:id` | 204; 409 si en uso | S | idem |
| GET | `/overlay-data/rotators/:id?key=` | Config del rotator para overlays (fuera de `/api/v1`) | `?key=` | `overlay-routes.ts` |
| WS | `/ws/screen/:screenId?key=` | Overlays / audio | `?key=` | `socket-routes.ts` |
| WS | `/ws/admin` | Dashboard | Cookie | idem |
| GET | `/media/*` | Assets subidos | **Ninguna** | `build-http-server.ts` |
| GET | `/`, `/admin/*`, `/screen/*`, `/overlay/*` | Estáticos | Ninguna (los overlays exigen `key` al abrir el WS) | idem |

### 10.2 Contratos representativos

`POST /api/v1/auth/login`
- Body `{ "password": "…" }` (1–200). 200 `{authenticated:true,setupRequired:false}` + `Set-Cookie`. Errores: 401 contraseña incorrecta; 409 sin contraseña aún; 429 bloqueo (5 fallos / 15 min por IP).
- Flujo: `onRequest` guard → `AuthService.login` → argon2 verify → sesión en `Map`.

`POST /api/v1/rules`
- Body (`RuleDefinitionSchema`): `{name, trigger: comment|gift|like|follow|join|share|viewerCount|streamEnd, conditions[], mode: all|random, cooldownMs, userCooldownMs, probability 0..1, priority 0..100, enabled, actions[≥1]}`.
- Condiciones: `giftName`, `giftId`, `diamondsTotal`, `quantity`, `likesCumulative`, `userRole`, `keyword` (incl. `regex`), `firstTime`. Acciones: `playSound{assetId}`, `showAlert{text,durationMs 500–60000}`, `speak{text…}`, `updateGoal{goalId,amount}` y `webhook{url,method,body}` (estas dos las ejecuta el servidor; «Probar» una regla las cuenta como omitidas).
- 201 con la regla; 400 validación.

`PATCH /api/v1/settings` — claves estrictas: `port, host, dbPath, assetsDir, overlaysDir, tiktokUsername, simulate, signApiKey, freesoundApiKey, overlayKey, logLevel`. `apply`: `live` (logLevel, overlayKey, freesoundApiKey), `reconnect` (tiktokUsername), `restart` (resto). Respuesta: vista + `applied[]` + `restartRequired[]`.

`POST /api/v1/assets` — límites: audio 2 MB, imagen 5 MB, video 5 MB; formatos WAV, MP3, OGG, M4A, PNG, JPG, GIF, WebP, WebM por *magic bytes*; deduplicado por SHA-256.

`GET /api/v1/health`
```json
{ "status":"ok", "uptimeS":123, "version":"0.1.0",
  "connector":{"state":"connected","attempt":0,"target":"usuario"},
  "db":"ok", "screens":{"audio":1}, "queueDepth":{},
  "process":{"rssBytes":146251776,"eventLoopLagMs":0.2},
  "diskFreePercent":11.6, "lastBackupAt":1792000000000, "alerts":[] }
```

### 10.3 Códigos de error comunes

| HTTP | Causa |
| --- | --- |
| 400 | Zod (`errors[]` con `path`) |
| 401 | Sin sesión / credenciales |
| 403 | `Origin` distinto de `Host` en método no seguro |
| 404 | Recurso inexistente |
| 409 | Asset en uso; contraseña ya creada / aún no creada |
| 413 / 415 | Asset grande / formato no admitido |
| 429 | Bloqueo de login |
| 502 | MyInstants o Freesound no disponible |
| 503 | `/health` con BD caída |
| 500 | No controlado (mensaje genérico, detalle en log) |

### 10.4 Inconsistencias API / documentación / consumidores

- `README.md` lista `GET /settings/addresses`; las rutas `GET /backups`, `POST /backups`, `GET /metrics`, `POST /goals/:id/progress` y `/overlay-templates` están documentadas en `docs/operacion.md` y `docs/plan.md`, y conviene revisar que el README las mencione (no verificado en esta revisión).
- `.env.example` indica que «todo es opcional» y «cada valor se edita desde el panel», pero `ADMIN_PASSWORD_HASH`, `MYINSTANTS_API_URL`, `DASHBOARD_DIR`, `BACKUP_DIR`, `RECORD_PATH`, `WEBHOOK_ALLOWED_HOSTS`, `WEBHOOK_PRIVATE_HOSTS` y `CONFIG_PATH` **no** son ajustes del panel (la contraseña sí se cambia vía `/auth/password`).
- `OVERLAYS_DIR` y `DASHBOARD_DIR` se añadieron a `.env.example` el 2026-10-15.
- Respuestas de listas sin paginación ni filtros (aceptable a esta escala; NO hay límite en `GET /rules`, `/triggers`, `/assets`).

---

## 11. Autenticación

**Evidencia** (`auth-service.ts`, `auth-routes.ts`, `json-config-store.ts`, `composition-root.ts`).

| Aspecto | Comportamiento actual |
| --- | --- |
| Credencial | Contraseña única, mínimo 8 caracteres (máx. 200), hash **argon2id** |
| Almacén del hash | `data/config.json` (`adminPasswordHash`); alternativa `ADMIN_PASSWORD_HASH` (el de `config.json` prevalece) |
| Primer uso | `AuthService.prepareSetup` genera un código de 8 caracteres (alfabeto de 31) que **se escribe en el log (nivel warn, campo `setupCode`)** |
| Sesión | Token opaco de 32 bytes (`base64url`), en `Map` **en memoria**; inactividad 30 min (deslizante), máximo 12 h |
| Cookie | `tiklive_session`, `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=12h`; **sin `Secure`** (se sirve por http) |
| Bloqueo | 5 fallos en 15 min **por IP** → 429; solo en login |
| CSRF | `SameSite=Strict` + verificación `Origin`==`Host` en métodos no seguros bajo `/api/` |
| Logout | Borra token del `Map` y cookie |
| Cambio de contraseña | Exige la actual, limpia **todas** las sesiones y emite una nueva |
| Recuperación de contraseña | **No existe**; recuperación = borrar `adminPasswordHash` de `data/config.json` y reiniciar (NO DETERMINABLE si es el procedimiento previsto; deducido del código) |
| Refresh tokens / JWT / OAuth | No existen |
| Overlays | Token estático `?key=` (comparación en tiempo constante, `timingSafeEqual`); rotable; cierra todos los sockets de pantalla al rotar |
| CORS | No se registra `@fastify/cors`: sin cabeceras CORS (solo mismo origen) |

```mermaid
sequenceDiagram
  participant U as Admin
  participant F as Dashboard (/admin)
  participant A as API
  participant C as config.json
  U->>F: abre /admin
  F->>A: GET /auth/status
  A-->>F: {authenticated:false, setupRequired}
  alt primer inicio
    U->>F: código de consola + contraseña
    F->>A: POST /auth/setup
    A->>C: guarda hash argon2id
  else
    U->>F: contraseña
    F->>A: POST /auth/login
    A->>A: ¿IP bloqueada? → verify
  end
  A-->>F: 200 + Set-Cookie (HttpOnly, Strict)
  F->>A: peticiones con cookie
  A->>A: guard onRequest: Origin, sesión
```

## 12. Autorización

- Guard global `onRequest` (`registerAuthGuard`): toda ruta bajo `/api/` y `/ws/admin` exige sesión salvo `PUBLIC_API_PATHS` (`health`, `auth/status|login|setup`).
- No hay roles, permisos, políticas ni propiedad de recursos: **no aplica IDOR/BOLA** (instancia de un solo operador).
- Los overlays solo reciben datos mediante `?key=`.
- Observación: `/media/*`, `/overlay/*`, `/screen/*` y `/admin/*` (estáticos) son públicos en red.

---

## 13. Base de datos

SQLite (archivo `data/app.db`), WAL. Migraciones SQL numeradas `0001`–`0005` en `apps/server/migrations/`, aplicadas al arrancar por `runMigrations` (cada archivo en su transacción; registro en `schema_migration`). Sin triggers, vistas ni procedimientos. Sin *down migrations*.

### 13.1 Tablas

| Tabla | Propósito | PK | FKs | Índices / constraints |
| --- | --- | --- | --- | --- |
| `live_session` | Sesión de live | `id` | — | — |
| `viewer` | Espectador | `id` | — | `tiktok_user_id` UNIQUE |
| `live_event` | Log de eventos (JSON validado) | `id` | `session_id`→`live_session`, `viewer_id`→`viewer` | `event_uid` UNIQUE; `ix_event_session_type(session_id,type,occurred_at)`; `ux_event_dedupe(session_id,dedupe_key)` parcial |
| `rule` | Reglas | `id` | — | — (`conditions`/`actions` en JSON texto) |
| `asset` | Biblioteca (0003 añade `original_name` y `size_bytes`) | `id` | — | `sha256` UNIQUE |
| `goal` | Metas | `id` | — | `active` (0002) |
| `goal_cycle` | Ciclos alcanzados | `(goal_id,scope_key,cycle)` | `goal_id`→`goal` ON DELETE CASCADE | — |
| `goal_adjustment` | Progreso manual de una meta (acción `updateGoal`, 0005) | `(goal_id,scope_key)` | `goal_id`→`goal` ON DELETE CASCADE | — |
| `leaderboard_total` | Totales por espectador/alcance/métrica | `(viewer_id,scope,metric)` | `viewer_id`→`viewer` | `ix_lb_rank(scope,metric,value DESC)` |
| `metric_total` | Totales de sala | `(scope,metric)` | — | — |
| `app_setting` | Clave/valor (moderación, ajustes de ranking, rotators, plantillas de overlay, caché de regalos — **interpretación** por los servicios que reciben `SettingsRepository`) | `key` | — | — |
| `sound_trigger` | Sonidos remotos por evento | `id` AUTOINCREMENT | — | `sound_trigger_event(event,enabled)` |
| `schema_migration` | Control de migraciones | `name` | — | — |

Columnas completas: ver `migrations/*.sql` (fuente única) y `infrastructure/sqlite/schema.ts` (espejo Kysely, mantenido a mano).

```mermaid
erDiagram
  live_session ||--o{ live_event : contiene
  viewer ||--o{ live_event : origina
  viewer ||--o{ leaderboard_total : acumula
  goal ||--o{ goal_cycle : registra
  live_session { int id PK  text tiktok_user  int started_at  int ended_at }
  viewer { int id PK  text tiktok_user_id UK  text unique_id  text nickname }
  live_event { int id PK  text event_uid UK  int session_id FK  int viewer_id FK  text type  text payload  text dedupe_key }
  leaderboard_total { int viewer_id PK  text scope PK  text metric PK  int value }
  metric_total { text scope PK  text metric PK  int value }
  goal { int id PK  text name  text metric  int target  text scope  int active }
  goal_cycle { int goal_id PK  text scope_key PK  int cycle PK  int reached_at }
  rule { int id PK  text name  text trigger  text conditions  text actions }
  asset { int id PK  text sha256 UK  text filename  text kind }
  sound_trigger { int id PK  text event  text sound_url  real volume }
  app_setting { text key PK  text value }
```

### 13.2 Observaciones

- `live_event` más viejo de 90 días se borra una vez al día, en bloques (`sqlite-event-retention.ts`); los rankings y los espectadores no se tocan. La base se respalda a diario (`docs/operacion.md`).
- `rule.trigger`, `goal.metric/scope`, `*.kind`, etc. no tienen `CHECK`; la integridad depende de Zod (filas corruptas se saltan con log `stored rule is corrupt`).
- `leaderboard_total` sin ON DELETE sobre `viewer` (no se borran espectadores en el código).
- `goal.on_reach`/`rule.actions` pueden referenciar `assetId` sin FK; el borrado de asset está protegido por lógica de aplicación (`AssetService.references`), no por la BD.
- `schema.ts` coincide con las migraciones en lo revisado, pero es un espejo manual **sin prueba automática** que garantice la sincronía.

---

## 14. Integraciones externas

| Servicio | Uso | Módulo | Riesgo |
| --- | --- | --- | --- |
| TikTok LIVE (protocolo no oficial vía `tiktok-live-connector` 2.5.0) | Eventos del live | `infrastructure/tiktok/*` | Alto: puede romperse sin aviso (R-01); firma opcional `TIKTOK_SIGN_API_KEY` (Euler Stream) |
| Catálogo de regalos de TikTok | Lista de regalos para el editor | `tiktok-gift-catalog.ts` | Medio: con caché `stale` |
| API comunitaria MyInstants (`https://myinstants-api.vercel.app`) | Buscar sonidos | `myinstants-provider.ts` | Medio-alto: tercero no oficial; el audio lo reproduce el navegador directamente desde `*.myinstants.com`. El 2026-10-14 respondió `503` durante un live real (ADR 0011) |
| API de Freesound (oficial, con clave) | Segunda fuente de sonidos (solo CC0 y CC BY de hasta 30 s) | `freesound-provider.ts` | Bajo: API oficial; sin clave la búsqueda devuelve 503 |
| Webhooks configurados por el usuario | Acción `webhook` | `http-webhook-client.ts` | Medio: solo hosts de `WEBHOOK_ALLOWED_HOSTS`; direcciones privadas bloqueadas salvo `WEBHOOK_PRIVATE_HOSTS` |
| CDN de TikTok | Avatares/imagenes de regalos | overlays | Bajo (`referrerPolicy=no-referrer`, CSP `img-src https:`) |

No hay SMTP, SMS, almacenamiento en nube, colas, cachés externas ni OAuth.

---

## 15. Variables de entorno

| Variable | Obligatoria | Uso | Valor por defecto | Secreto | Ámbito / aplicación |
| --- | --- | --- | --- | --- | --- |
| `CONFIG_PATH` | No | Ruta de `config.json` | `./data/config.json` | No | Solo env |
| `PORT` | No | Puerto HTTP | `3000` | No | restart |
| `HOST` | No | Interfaz | `0.0.0.0` | No | restart |
| `DB_PATH` | No | SQLite | `./data/app.db` | No | restart |
| `ASSETS_DIR` | No | Carpeta de assets | `./data/assets` | No | restart |
| `OVERLAYS_DIR` | No | Build de overlays | `packages/overlays/dist` | No | restart (falta en `.env.example`) |
| `TIKTOK_USERNAME` | No | Usuario a conectar | vacío | No | reconnect |
| `SIMULATE` | No | `true`/`1` usa simulador | `false` | No | restart |
| `TIKTOK_SIGN_API_KEY` | No | Clave de firma | vacío | **Sí** | restart |
| `FREESOUND_API_KEY` | No | Clave de la API oficial de Freesound | vacío (solo MyInstants) | **Sí** | live |
| `OVERLAY_KEY` | No | Token de overlays (≥16, `[\w-]`) | autogenerado y guardado | **Sí** | live |
| `BACKUP_DIR` | No | Carpeta de respaldos | `./data/backups` | No | solo env |
| `RECORD_PATH` | No | Graba cada evento crudo del conector real en este JSONL (contiene usuarios y comentarios reales) | vacío | No | solo env |
| `WEBHOOK_ALLOWED_HOSTS` | No | Hosts a los que puede llamar la acción `webhook` (coma); vacío = webhooks desactivados | vacío | No | solo env |
| `WEBHOOK_PRIVATE_HOSTS` | No | Subconjunto de los anteriores que puede resolver a direcciones privadas | vacío | No | solo env |
| `LOG_LEVEL` | No | Nivel Pino | `info` | No | live |
| `ADMIN_PASSWORD_HASH` | No | Hash argon2id de la contraseña | — | **Sí** | solo env |
| `MYINSTANTS_API_URL` | No | Base de la API de sonidos | `https://myinstants-api.vercel.app` | No | solo env |
| `DASHBOARD_DIR` | No | Build del panel | `apps/dashboard/dist/dashboard/browser` | No | solo env |
| `TIKLIVE_URL` / `TIKLIVE_PASSWORD` | CLI | `tools/*` | `http://localhost:3000` / — | **Sí** | solo herramientas |
| `TIKLIVE_BACKEND` | No | Proxy de Vite en dev | `http://localhost:3000` | No | dev |
| `E2E_PORT` | No | Puerto del servidor de las pruebas de navegador | `3217` | No | solo `e2e/` |

Reglas: precedencia **panel (`config.json`) > entorno > defecto**; valores inválidos se ignoran con advertencia en el log.

**Secretos hardcodeados:** *no se encontraron* secretos reales en el código ni en `.env.example`. `data/config.json` (no versionado, ignorado por `.gitignore`) contiene secretos en claro: hash de contraseña, clave de overlays y, si se configura, la clave de firma (ver SEC-07).

---

## 16. Configuración

- `loadConfig` se vuelve a ejecutar en cada reinicio en proceso.
- Cambiar `overlayKey` en vivo desconecta todas las pantallas (`screens.closeAll()`); las URLs viejas dejan de funcionar.
- `ensureOverlayKey` **escribe** `config.json` durante la carga si no hay clave (efecto lateral en lectura de configuración).
- **Reinicio en proceso** (`AppHost.restart`): `app.stop()` → `boot()`; si falla, restaura `lastGood.settings` y llama `boot()` otra vez (ver F-02).
- CSP (solo respuestas `text/html`): `default-src 'self'; img-src 'self' https: data:; media-src 'self' blob: https://*.myinstants.com https://*.freesound.org; connect-src 'self' ws: wss: <host:*>; style-src 'self' 'unsafe-inline'`. Además `X-Content-Type-Options: nosniff`.
- Caché estático: assets con hash → `immutable` 1 año; resto `no-cache`; `/media` 30 días inmutable.

---

## 17. Dependencias

**Producción servidor:** `fastify` (crítica), `@fastify/cookie` (crítica), `@fastify/websocket` (crítica), `@fastify/multipart` (importante), `@fastify/static` (importante; **vulnerable**), `better-sqlite3` (crítica; binario nativo), `kysely` (importante), `zod` (crítica), `pino` (importante), `@node-rs/argon2` (crítica; nativo), `tiktok-live-connector` 2.5.0 (crítica, no oficial), `@tiklive/contracts` (crítica).
**Dashboard:** Angular 21 (common/compiler/core/forms/platform-browser/router/localize/cdk), `@lucide/angular`, Tailwind 4, `class-variance-authority`, `rxjs ~7.8`, `zod`, `tslib`; dev: `@angular/build`, `cli`, `compiler-cli`, TS 5.9.
**Overlays:** solo `vite` (dev) + contracts.
**Desarrollo raíz:** `eslint`, `@eslint/js`, `typescript-eslint`, `prettier`, `vitest`, `@vitest/coverage-v8`, `dependency-cruiser`, `tsx`, `globals`, `@types/node`, `@playwright/test` (1.56.1, fija).

| Hallazgo | Detalle |
| --- | --- |
| Vulnerabilidades | `npm audit --omit=dev` → 0 (2026-10-15). `@fastify/static` se actualizó a 10.1.5 (commit `4f9da06`); el análisis original había encontrado 4 avisos en 8.3.0 |
| `@types/ws` | En `devDependencies` del servidor; `ws` llega transitivamente por `@fastify/websocket` |
| Dos TypeScript | Raíz 6.0 / dashboard 5.9: deliberado (typescript-eslint), pero duplica mantenimiento |
| `zod` duplicado | Declarado en contracts, server y dashboard; hoisting npm lo resuelve (no se verificó una única instancia) |
| `tiktok-live-connector` fijada exacta | Correcto por el riesgo; sin automatización de actualización |

---

## 18. Requerimientos técnicos

| Recurso | Requerimiento |
| --- | --- |
| Hardware mínimo | **NO DETERMINABLE** a partir del código. La especificación apunta a «laptop vieja»; el `load-test` objetivo es 1000 eventos/s con desfase <500 ms (no ejecutado con la máquina libre) |
| SO | Windows (elegido para la laptop; PowerShell 5.1) o Linux; binarios precompilados de `better-sqlite3` y argon2 (en Windows se instalan en la laptop con `npm ci --omit=dev`) |
| Runtime | Node.js ≥22 (Angular 21 verificado en 22.20) |
| BD | SQLite embebida (sin servicio) |
| Navegador | Moderno en la PC de stream (Chromium/LIVE Studio/OBS); autoplay requiere pulsar «Iniciar audio». Para las pruebas e2e, Chromium de Playwright |
| Servicios externos | Internet hacia TikTok, `myinstants-api.vercel.app`, `*.myinstants.com`, `freesound.org` (API y `cdn.freesound.org`), CDN de TikTok |

| Servicio | Puerto | Protocolo | Uso |
| --- | --- | --- | --- |
| Servidor TikLive | 3000 (`PORT`) | HTTP + WS | API, panel, overlays, WS |
| `ng serve` | 4200 | HTTP | Dashboard en desarrollo (proxy a 3000) |
| Vite (overlays) | NO DETERMINABLE (puerto por defecto de Vite) | HTTP | `npm run dev:overlays` |
| Servidor de las pruebas e2e | 3217 (`E2E_PORT`) | HTTP + WS | `npm run test:e2e` |

---

## 19. Instalación

Prerrequisitos: Node ≥22, npm, Git. Para llevarlo a la laptop de Windows ver `docs/despliegue-windows.md` (`npm run package` y `deploy.ps1`).

```bash
npm ci                                  # o npm install
npm run build -w @tiklive/overlays
npm run build -w @tiklive/dashboard
npm run seed                            # opcional: sonido de prueba, reglas y meta
```

## 20. Desarrollo local

```bash
cp .env.example .env                    # opcional; SIMULATE=true para ensayar sin live
npm run dev                             # http://localhost:3000  → /admin/
# Primer inicio: copiar el 'setupCode' de la consola y crear la contraseña en el panel
npm run dev:dashboard                   # opcional: ng serve en :4200 con proxy
npm run dev:overlays                    # opcional: Vite con proxy
npm run simulate -- full                # requiere TIKLIVE_PASSWORD
```

Pantalla de audio: `http://<ip>:3000/screen/audio/?key=<OVERLAY_KEY>` → «Iniciar audio». Alertas: `/screen/alerts/?key=…` (`position`, `scale`, `debug=1`). Overlays de datos: `/overlay/{leaderboard,goal,stats,rotator}/` (`theme=card|clear|light`, `scale`, `font`, `debug=1`).

**Comandos**: `npm test` · `npm run lint` · `npm run typecheck` · `npm run depcheck` · `npm run build` · `npm run test:e2e` (tras `npm run build` y `npx playwright install chromium`) · `npm run i18n:extract` · `npm run package` · `npm run restore` · `npm run phase0` · `npm run load-test -- --rate 1000` · `npm run watch-events`.

**Depurar:** `LOG_LEVEL=debug` (también desde Ajustes, aplicado en vivo); `?debug=1` en overlays; `npm run watch-events`; vista Eventos del panel.

## 21. Docker

**NO EXISTE** (sin `Dockerfile`, `docker-compose` ni `.dockerignore`). *Recomendación:* solo si se prevé alojar fuera de la laptop; el binario nativo de SQLite exige imagen con glibc o `node:22-slim`.

## 22. CI/CD y despliegue

`.github/workflows/ci.yml`: disparadores `push` y `pull_request` (todas las ramas), `ubuntu-latest`, Node desde `.nvmrc`.

```mermaid
flowchart LR
  A[checkout] --> B[npm ci] --> C[npm audit --omit=dev --audit-level=high]
  C --> D[lint] --> E[typecheck] --> F[depcheck] --> G[vitest --coverage] --> H[build]
  H --> I[i18n:extract + git diff messages.json]
  I --> J[job e2e: playwright install, build, test:e2e]
```

- **Evidencia/Interpretación:** el paso `npm audit` pasa hoy (0 vulnerabilidades). El job `verify` falla si el catálogo de traducciones (`messages.json`) no está al día; el job `e2e` (necesita `verify`) instala Chromium, compila y corre las 30 pruebas de navegador, y sube `playwright-report/` y `test-results/` si fallan. El repo tiene historial y PR con CI en GitHub; el job `e2e` se añadió el 2026-10-15 y el workflow del merge del PR #9 en `main` terminó con éxito (run 46).
- Sin CD automático, sin entornos de staging, sin escaneo SAST, sin Dependabot/Renovate.
- **Despliegue (Windows, implementado y sin ensayar):** `npm run package` genera `release/tiklive-<versión>-<fecha>-<commit>.tgz`; `install.ps1` crea carpetas, `tiklive.env`, la tarea «TikLive» (al arrancar, como SYSTEM, reinicio en ~3 s), la regla de firewall solo LAN y desactiva la suspensión; `deploy.ps1` extrae, instala dependencias, copia la base a `data/backups/pre-deploy/`, activa el release y espera a `/health` (vuelve solo atrás a los 40 s); `rollback.ps1` vuelve a un release anterior (se conservan 3). Las migraciones solo avanzan: tras un cambio de esquema hay que restaurar también la base. Detalle en `docs/despliegue-windows.md`.
- Linux: sin unidad systemd; arranque manual con `npm ci && npm run build && npm run start`. SSL y proxy inverso: no existen (solo LAN).

---

## 23. Testing

| Tipo | Ubicación | Estado |
| --- | --- | --- |
| Unitarias dominio/aplicación | `*.spec.ts` junto al código | 310 pruebas totales en verde (40 archivos, ~7 s; 2026-10-15) |
| Integración SQLite | `apps/server/test/sqlite.integration.spec.ts`, `projections.integration.spec.ts`, `settings.integration.spec.ts`, `maintenance.integration.spec.ts` | Sí |
| E2E de API/WS (en proceso, `injectWS`) | `app.e2e.spec.ts`, `assets-rules.e2e.spec.ts`, `settings-auth.e2e.spec.ts`, `triggers.e2e.spec.ts`, `observability.e2e.spec.ts` | Sí |
| Dashboard (unitarias) | `audio.service.spec.ts`, `live-state.spec.ts`, `locale/messages.spec.ts` (valida el inglés contra el catálogo extraído) | Mínimo |
| Overlays | — | **Ninguna** |
| E2E navegador (Playwright) | `e2e/*.spec.ts` (11 archivos, 30 pruebas): login, navegación, simulador, reglas (crear, probar, alerta en el overlay, pausar, duplicar, borrar), assets, rankings y metas, overlays y plantillas, ajustes, triggers, estado, idioma | Sí; ver `docs/e2e.md` |
| Carga | `tools/load-test.ts` (gate manual: lag <500 ms) | Sigue sin ejecutarse con la máquina libre (234 ms con 200 eventos, tasa real 99/s) |

- Cobertura: umbral 80 % líneas/funciones/ramas **solo** para `domain/**`. `application/**` se mide sin umbral. No se midió cobertura numérica en esta revisión. Vitest no incluye `e2e/`.
- Nota operativa (memoria del proyecto): con CPU saturada las pruebas basadas en tiempo pueden ser inestables; relanzar aisladas.

| Funcionalidad | Unit | Integr. | E2E | Riesgo sin cobertura |
| --- | --- | --- | --- | --- |
| Normalización / rachas / likes | ✔ | ✔ | ✔ | Bajo |
| Reglas y condiciones | ✔ | — | ✔ | Bajo |
| Cola/Scheduler | ✔ | — | ✔ | Bajo |
| Conector / supervisor | ✔ (falsos) | — | simulador | **Alto**: adaptador real y `tiktok-message-mapper` solo con fixtures; sin live real |
| Auth | parcial | — | ✔ | Medio (sin pruebas de expiración real/CSRF dedicadas visibles) |
| Reinicio en proceso (`AppHost`) | ✖ | ✖ | ✖ | **Alto** (F-02); el panel solo prueba que los ajustes se guardan, no el reinicio |
| Migraciones (fallo/rollback) | parcial | ✔ | — | Medio |
| Overlays/Audio | ✖ | ✖ | parcial (alerta y conexión de la pantalla de audio) | Medio |
| Dashboard | casi ✖ | ✖ | ✔ (30 pruebas) | Bajo-Medio |
| Seguridad (CSP, traversal de `/media`, ReDoS) | parcial | — | — | Medio |

---

## 24. Logging

Pino (JSON a stdout; `pino-pretty` en dev), niveles `fatal…trace` modificables en vivo. Logs por módulo con `child({module})`. Request logging **desactivado** a propósito (los URL de WebSocket llevan `?key=`). Sin rotación/archivo (depende del supervisor del proceso). **Dato sensible:** el `setupCode` se imprime en el log al primer arranque.

## 25. Monitoring / observabilidad

| Capacidad | Estado |
| --- | --- |
| `GET /api/v1/health` | IMPLEMENTADO (200/503; uptime, versión, conector, BD, pantallas, profundidad de colas, memoria, retraso del bucle, disco libre, último respaldo, alertas) |
| `/metrics` (Prometheus) | IMPLEMENTADO, detrás de la sesión: `events_received_total`, `events_dropped_total`, `connector_state`, `connector_reconnects_total`, `rule_executions_total`, `actions_total`, `action_queue_depth`, `action_latency_ms`, `ws_clients`, `process_rss_bytes`, `event_loop_lag_ms` (`docs/operacion.md`) |
| Trazas | No existen |
| Alertas | Sí, visibles en el panel (Estado): `connector_down`, `audio_offline`, `queue_full`, `disk_low`, `backup_stale`. No se envían fuera del panel |
| Eventos operativos al panel | Sí: `connector.status`, `queue.stats`, `error.reported`, `rule.executed` (WS admin) |

*Recomendación — métricas aún no cubiertas:* resultados (`done/failed/timeout/dropped`) por pantalla, tamaño de BD/WAL y latencia de `save`.

## 26. Seguridad

Alcance: revisión estática del código y `npm audit`; no se hizo prueba dinámica ni pentest.

| ID | Vulnerabilidad / hallazgo | Sev. | Estado | Evidencia | Riesgo | Recomendación |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | Dependencia `@fastify/static` 8.3.0 con 4 avisos (traversal / bypass de guardas) | ~~Alta~~ | **RESUELTA** (2026-10-08, commit `4f9da06`; `@fastify/static` 10.1.5, `npm audit` → 0) | `apps/server/package.json` | — | Mantener `npm audit` en CI (ya está) |
| SEC-02 | Sin TLS; cookie sin `Secure`; `?key=` en URL | Media | Confirmada (diseño, documentado) | `auth-routes.ts` `setSession`; README «se sirve por http» | Intercepción en LAN de cookie/clave | Mantener solo LAN; si se expone, proxy con TLS y `Secure` |
| SEC-03 | Escucha por defecto en `0.0.0.0` | Media | Confirmada | `DEFAULT_SETTINGS.host` | Superficie accesible a toda la LAN | Documentar cortafuegos; opción `HOST=127.0.0.1` cuando no haya PC de stream remota |
| SEC-04 | Falta `frame-ancestors`/`X-Frame-Options` | Media-Baja | Confirmada (sigue abierta el 2026-10-15) | `onSend` solo añade `nosniff` y CSP sin `frame-ancestors` | Clickjacking del panel | Añadir `frame-ancestors 'none'` al CSP del panel (los overlays no necesitan ser enmarcados por terceros; **LIVE Studio/OBS** cargan la URL directa) |
| SEC-05 | `Origin` no se valida en el *upgrade* de `/ws/admin` | Media-Baja | Potencial (sigue abierta: `socket-routes.ts` no revisa `Origin`) | `isCrossOrigin` ignora métodos seguros (el upgrade es GET) | Un sitio del mismo *site* (otro puerto local) con cookie válida podría abrir el socket de admin. `SameSite=Strict` mitiga el cross-site | Verificar `Origin` también en `/ws/admin` |
| SEC-06 | Contraseña de un solo usuario; bloqueo solo por IP; intentos de `setup` sin límite; código en logs | Media-Baja | Confirmada (`AuthService.setup` no cuenta fallos) | `auth-service.ts` | Fuerza bruta del código de 8 caracteres (≈39,6 bits) por LAN antes de que exista contraseña | Limitar intentos de `setup`; invalidar el código tras N fallos |
| SEC-07 | `config.json` guarda secretos en claro; el modo 0600 no se aplica en Windows | Media | Probable | `json-config-store.ts` (`chmodSync`) | Lectura local por otros usuarios del equipo | Documentar; en Windows restringir ACL; no versionar |
| SEC-08 | Sin límite de tasa global en la API | Baja | Confirmada | No hay `@fastify/rate-limit` | DoS autenticado/LAN | Opcional |
| SEC-09 | `/media/*` sin autenticación | Baja | Confirmada | `build-http-server.ts` | Nombre = hash de 16 hex; cualquiera en la LAN que conozca el nombre puede leerlo. Necesario porque las pantallas no tienen cookie | Aceptable |
| SEC-10 | Filtro anti-ReDoS heurístico | Baja | Potencial | `safe-regex.ts` (regex `NESTED_QUANTIFIER`, longitud ≤100, sujeto ≤500) | Alternancias solapadas `(a|a)*` no detectadas; solo autenticado | Usar motor seguro (RE2) o ejecutar con tiempo límite |
| SEC-11 | CSP con `style-src 'unsafe-inline'` e `img-src https:` | Baja | Confirmada | `contentSecurityPolicy()` | Debilita la defensa en profundidad | Aceptado por Angular `inlineCritical` desactivado y avatares remotos |
| SEC-12 | Dependencia del servicio comunitario MyInstants | Media | Confirmada | `myinstants-provider.ts` | Si lo controla otro, solo puede ofrecer URLs que pasen `isAllowedSoundUrl` (https + `myinstants.com`) — **mitigado** | — |
| SEC-13 | Sin `trustProxy` | Info | Confirmada | `Fastify({…})` | Detrás de proxy, `req.ip` sería el del proxy y el bloqueo afectaría a todos | Configurar al introducir proxy |

**Revisión de categorías pedidas**

| Categoría | Resultado |
| --- | --- |
| SQL injection | No detectada: Kysely y sentencias preparadas con parámetros; SQL estático |
| NoSQL | N/A |
| XSS | Overlays con `textContent`; Angular escapa por defecto; **no hay** `innerHTML`/`eval` en `apps/dashboard/src` ni `packages` (grep). CSP presente |
| CSRF | Mitigado (SameSite Strict + Origin) |
| SSRF | La acción `webhook` solo llama a hosts de `WEBHOOK_ALLOWED_HOSTS`, bloquea direcciones privadas/loopback/metadata al conectar (salvo `WEBHOOK_PRIVATE_HOSTS`), no sigue redirecciones y corta a 3 s y 64 KB (`http-webhook-client.ts`, con pruebas); `MYINSTANTS_API_URL` solo desde entorno; `GET /gifts`, MyInstants y Freesound usan URLs fijas |
| IDOR/BOLA | N/A (un solo operador) |
| File upload | Tipo por contenido, tamaño por tipo, nombre = hash del servidor, `basename()`; el nombre original se guarda recortado a 120 caracteres y se muestra en el panel |
| Path traversal | Mitigado en almacenamiento propio; ver SEC-01 para la librería estática |
| Command injection | No hay ejecución de procesos en `src` |
| Secretos/logs | `setupCode` en el log; request logging desactivado; `signApiKey` nunca se devuelve a la UI |
| Dependencias | `npm audit --omit=dev` → 0 (2026-10-15) |

---

## 27. Manejo de errores

- HTTP: `problemErrorHandler` — `ZodError`→400 con `errors[]`; `statusCode` de Fastify; ≥500 → mensaje genérico y log con `err`.
- Dominio: `AuthError`, `AssetError`, `SoundSourceError`, `UnsafePatternError`, `ConnectFailure` con códigos tipados mapeados a HTTP.
- Pipeline: cada tarea en `.catch` que registra y continúa (la cadena no se rompe).
- Consumidores: aislados (`runConsumer`).
- WS: mensajes inválidos se descartan con `warn`; `maxPayload` 64 KB.
- Proceso: `uncaughtException` → `stop(…,1)` (cierre ordenado) esperando reinicio externo; `unhandledRejection` solo se registra.
- Reintentos: conector (backoff), cola de acciones (3). Timeouts: MyInstants 8 s, webhooks 3 s, acciones (`timeoutMs`), drenaje en apagado 5 s. *Circuit breaker* solo en webhooks (5 fallos por host, 1 min).
- Dashboard: `ApiClient` traduce a `ApiError`; el interceptor `sessionExpiredInterceptor` redirige a `/login` ante 401 fuera de `/auth/`.

---

## 28. Fallas previsibles

| ID | Problema | Prob. | Impacto | Sev. | Evidencia | Mitigación |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | El conector no oficial deja de funcionar (cambio de TikTok, límites de firma) | Alta | Alto (sin eventos) | **Crítica** operativa | `tiktok-live-connector` 2.5.0 fija; `PROTOCOL_ERROR_NAMES` | Supervisor detiene tras 5 fallos de protocolo; `lastError` y la alerta `connector_down` se ven en el panel; modo `record`/`replay` disponible. Probado en un live real el 2026-10-14. Pendiente: convertir una grabación real en prueba de regresión |
| F-02 | **Abierta (verificada 2026-10-15).** Reinicio desde Ajustes: si falla `boot()` tras el rollback, `restart()` rechaza y el rechazo es `unhandledRejection` (solo se registra) → proceso vivo **sin servidor HTTP** | Baja | Alto | `main/index.ts` `restart()`: la llamada `await this.boot()` del `catch` no tiene protección; `requestRestart: () => void this.restart()` | Probable | Capturar el error, `process.exit(1)` para que el supervisor reinicie; añadir prueba |
| F-03 | ~~Sin retención~~ **Resuelta**: limpieza diaria de `live_event` > 90 días, alerta `disk_low` y `/metrics` | Media | Medio (disco) | `sqlite-event-retention.ts`, `maintenance-service.ts` | — | Pendiente solo `VACUUM` si la base crece |
| F-04 | Cadena de promesas del pipeline sin contrapresión | Baja-Media | Medio (memoria) bajo ráfagas | `LiveEventPipeline.enqueue` | Media | Límite de cola y descarte de `viewerCount`/likes intermedios |
| F-05 | SQLite síncrono bloquea el *event loop* | Media | Bajo-Medio | `SqliteEventStore` sin hilo aparte (ADR 0009 lo asume) | Media | Medir con `load-test` en la máquina real |
| F-06 | Sesiones y bloqueos en memoria: se pierden si el proceso muere | Alta | Bajo (re-login) | `AuthService` | Baja | Aceptable; documentar |
| F-07 | **Abierta (verificada 2026-10-15).** `config.json` corrupto → `JSON.parse` sin `try/catch` en `JsonConfigStore.read` | Baja | Alto (no arranca) | `json-config-store.ts` | Media | Capturar, renombrar archivo dañado y avisar; mientras tanto el runbook (§3.1) explica cómo recuperarse |
| F-08 | Migración fallida aborta el arranque; sin *down*. `deploy.ps1` copia la base antes de desplegar, pero el servidor no lo hace al migrar por su cuenta | Baja | Alto | `migrator.ts` | Media | Copia de BD antes de migrar; `npm run restore` |
| F-09 | Pérdida del equipo: los respaldos automáticos están en la misma laptop | Media | Alto | `maintenance-service.ts` | Media | Copiar `BACKUP_DIR` a un disco externo a mano (§30) |
| F-10 | Doble instancia contra el mismo `app.db` | Baja | Medio | No hay *lock* de proceso (verificado 2026-10-15) | Baja | `busy_timeout` ayuda; añadir *lock file*. La tarea programada de Windows solo lanza una instancia |
| F-11 | Dos pestañas de audio con el mismo `screenId` reproducen duplicado | Media | Bajo | `ScreenSocketHub` permite varias conexiones por pantalla y `send` las difunde a todas | Media | Documentar o limitar a una conexión |
| F-12 | Acciones >60 s en cola se descartan silenciosamente | Media | Bajo | `MAX_ACTION_AGE_MS` | Baja | Visible en logs `warn`; exponer contador |
| F-13 | API MyInstants caída o cambia formato | Media | Bajo (solo buscar; los triggers guardados siguen sonando) | `SoundSourceError` → 502 | Baja | Ya manejado |
| F-14 | Race en `connect` simultáneos | Baja | Bajo | `generation` token en el supervisor | Baja | Cubierto |
| F-15 | Expiración de sesión durante uso | Media | Bajo | Idle 30 min; interceptor 401 redirige | Baja | OK |
| F-16 | Ejecutar con CPU al 100 % (juego + LIVE Studio) retrasa overlays | Media | Medio | Nota de uso del proyecto; `load-test` sin resultado limpio | Media | Ejecutar `load-test` en reposo |

---

## 29. Troubleshooting

Guía de incidentes durante un live (triage, pasos y recuperación): [`docs/runbook.md`](runbook.md). La tabla de abajo es la referencia corta.

| Problema | Síntomas | Causas posibles | Diagnóstico / solución |
| --- | --- | --- | --- |
| El backend no inicia | Salida inmediata; `Migration … failed`; `EADDRINUSE` | Puerto ocupado; migración rota; `config.json` corrupto (F-07); build del dashboard/overlays ausente (solo advertencia) | `LOG_LEVEL=debug npm run dev`; cambiar `PORT`; validar JSON de `data/config.json`; `npm run build -w @tiklive/overlays -w @tiklive/dashboard` |
| La BD no conecta / `degraded` | `/health` 503, `db:"down"` | Archivo bloqueado o disco lleno | Cerrar otra instancia; liberar espacio; revisar permisos de `data/` |
| El panel devuelve 500 | `Internal Server Error` | Excepción no controlada | Buscar `unhandled request error` en el log |
| El panel no carga (`/admin/` 404 en el JSON) | Mensaje `dashboard build not found` | Falta compilar | Compilar el dashboard |
| Pide login sin parar / 401 | Redirección a `/login` | Sesión caducada (30 min inactiva), reinicio del proceso | Iniciar sesión; no hay JWT |
| 403 «Origen no permitido» | POST/PUT desde otra URL | Acceso por IP/host distinto del `Host`, proxy que reescribe | Acceder por el mismo host que se sirve |
| 429 al iniciar sesión | Bloqueo | 5 fallos en 15 min por IP | Esperar 15 min o reiniciar proceso |
| Olvidó la contraseña | — | No hay recuperación | Eliminar `adminPasswordHash` de `data/config.json` (y `ADMIN_PASSWORD_HASH` si está en env), reiniciar y usar el `setupCode` de consola (*deducido del código*) |
| El overlay no conecta | Cierre 1008 `unauthorized` | `key` incorrecta o rotada | Copiar URL nueva desde Estado |
| No suena el audio | Pestaña sin interacción | Autoplay del navegador | Pulsar «Iniciar audio»; `?debug=1` |
| Conector en `waiting_host` | Reintenta cada 30 s | El usuario no está en directo | Iniciar el live |
| Conector `reconnecting`/`stopped` | `lastError` | Red; fallo de firma; límites | Ver `Estado`; revisar `TIKTOK_SIGN_API_KEY`; actualizar la librería |
| Reinicio desde Ajustes no vuelve | Panel sin respuesta | F-02 | Reiniciar el proceso manualmente |
| Docker no inicia | — | **No existe Docker** | — |
| Servicio externo no responde | `/sounds/search` 502 | MyInstants (ya falló en un live real, ADR 0011) o Freesound | Probar la otra fuente; revisar `MYINSTANTS_API_URL` y la clave de Freesound (503 si falta) |
| Pruebas inestables | Fallos por tiempo | CPU saturada | Ejecutar aislada: `npx vitest run <archivo>` |

Comandos útiles: `curl http://localhost:3000/api/v1/health`, `npm run watch-events`, `npm test`.

---

## 30. Backups

**Automáticos** (`maintenance-service.ts`, sin cron, igual en Linux y Windows; detalle en [`docs/operacion.md`](operacion.md)):

- Base de datos: copia consistente con la API de respaldo de SQLite (segura con el live en marcha) a `BACKUP_DIR/app-<fecha UTC>.db`, una al día; se conservan 14 días y siempre la más reciente.
- Assets: copia de `ASSETS_DIR` cada 7 días; 4 semanas.
- `deploy.ps1` añade una copia previa a cada despliegue en `data/backups/pre-deploy/`.
- Se revisa un minuto después de arrancar y cada hora; la alerta `backup_stale` salta tras 36 h sin respaldo. `GET|POST /api/v1/backups` lista y dispara uno a mano.
- **No se respalda** `data/config.json` (hash de contraseña, clave de overlays, ajustes del panel): cópialo a mano junto con `BACKUP_DIR`. Los respaldos viven en la misma laptop; copiarlos a un disco externo es manual.
- RPO ≈ 24 h (respaldo diario); RTO: **NO DETERMINABLE** (restauración no ensayada con el despliegue de Windows).

## 31. Disaster Recovery

1. Detén el servidor (`Stop-ScheduledTask TikLive` en Windows).
2. `npm run restore -- <respaldo>.db [--db ./data/app.db]` (en Windows: `node ...\dist\main\restore.js`): verifica la integridad y que sea una base de TikLive, y deja la actual como `app.db.before-restore`.
3. Arranca: las migraciones pendientes se aplican solas. Copia de vuelta la carpeta `assets-<fecha>` a `ASSETS_DIR`.
4. Un despliegue con cambio de esquema se deshace con `rollback.ps1` **y** restaurando la base (las migraciones solo avanzan).

Probado en Linux: respaldo con la base en uso → restauración → mismas filas. Los rankings de sesión se pierden si se reinicia la sesión; las **stats** son en memoria y se reconstruyen por sesión nueva (ADR 0009). Pasos completos y pérdida del equipo: `docs/runbook.md` §4.

## 32. Escalabilidad

- **Modelo:** vertical y de una sola instancia; no se prevé escalado horizontal (estado en memoria: colas, sesiones, stats, WS hubs).
- **Cuellos de botella actuales:** FIFO único y SQLite síncrono (F-04/F-05), JSON.stringify por evento, generación de snapshots por canal (debounce 250 ms mitiga).
- **Objetivo declarado:** 1000 eventos/s con lag <500 ms; resultado verificable pendiente (la máquina estaba ocupada en la única medición).
- **Riesgos futuros:** varios lives simultáneos (no soportado: una sesión activa por destino y una sola conexión de conector), retención de datos, múltiples operadores.

---

## 33. Deuda técnica

| ID | Deuda | Impacto | Esfuerzo | Prioridad |
| --- | --- | --- | --- | --- |
| D-01 | ~~Sin commits en el repositorio~~ **Resuelta** (31 commits, PR con CI) | — | — | — |
| D-02 | ~~`plan.md` desactualizado~~ **Resuelta** el 2026-10-15 | — | — | — |
| D-03 | ~~`.env.example` duplicado/incompleto~~ **Resuelta** el 2026-10-15 | — | — | — |
| D-04 | ADR 0002 citado y ausente | Bajo | Bajo | P3 |
| D-05 | `schema.ts` espejo manual de las migraciones, sin test de sincronía | Medio | Medio | P2 |
| D-06 | Sin tests para `AppHost` / reinicio (F-02) | Alto | Medio | P1 |
| D-07 | Overlays sin pruebas unitarias; el dashboard solo tiene 3 specs unitarias (cubierto en parte por Playwright) | Medio | Medio | P2 |
| D-08 | ~~Textos en español embebidos~~ **Resuelta** (español e inglés); quedan los mensajes del servidor | Bajo | Medio | P3 |
| D-09 | Dos versiones de TypeScript | Bajo | Bajo | P3 |
| D-10 | Cobertura con umbral solo en `domain/` | Medio | Bajo | P2 |
| D-11 | `composition-root.ts` grande (656 líneas) con tipos `ServiceParts`/`LifecycleParts` repetidos | Bajo | Medio | P3 |
| D-12 | Configuración repartida (`env`, `config.json`, `app_setting`) con reglas distintas | Medio | Medio | P2 |

No se encontraron `TODO/FIXME/HACK` en el código fuente (`grep` sobre `apps`, `packages`, `tools`; únicas coincidencias eran palabras en `build-http-server.ts`, sin marcador real).

## 34. Riesgos

| Riesgo | Prob. | Impacto | Sev. | Mitigación |
| --- | --- | --- | --- | --- |
| R-01 Dependencia de un conector/protocolo no oficial de TikTok | Alta | Alto | Crítica | Aislamiento por puerto; modo `record`; versión fija; vigilancia |
| R-02 Pérdida de datos | Baja | Alto | Media | Respaldos automáticos; falta la copia fuera del equipo |
| R-03 Vulnerabilidad de dependencia | Baja | Alto | Media | SEC-01 resuelta; `npm audit` en CI |
| R-04 Exposición del panel por HTTP en red no confiable | Media | Alto | Alta | Solo LAN/VPN, TLS si se expone |
| R-05 Despliegue de Windows sin ensayar | Media | Medio | Media | Ensayo de aceptación de `despliegue-windows.md` |
| R-06 Bus factor | Media | Medio | Media | Historial git, ADR, runbook y documentación |
| R-07 Servicio comunitario MyInstants | Alta | Bajo | Baja | Ya cayó en un live real; Freesound como segunda fuente (ADR 0011); los triggers guardados siguen sonando |
| R-08 Rendimiento no validado en la máquina real | Media | Medio | Media | Ejecutar `load-test` y `phase0 -- cpu` con la máquina libre |

## 35. Funcionalidades faltantes

| Elemento | Clasificación | Evidencia |
| --- | --- | --- |
| Acciones `webhook` y `updateGoal`, modo `record`, retención de 90 días, `/metrics`, respaldos, despliegue (Windows), runbook, i18n y Playwright | **Implementado** (2026-10-08 a 2026-10-15) | `docs/plan.md` |
| Despliegue de Windows ensayado; ensayo de 4 h; `load-test` con la máquina libre | Confirmado pendiente | `docs/plan.md` |
| Control de OBS/LIVE Studio desde las reglas | Confirmado faltante (el panel lo muestra como «Próximamente») | `action-builder.ts` |
| Métrica `top_gift` como ranking | Confirmado faltante | `plan.md`; solo existe «mejor regalo» en stats |
| Recuperación de contraseña por UI | Probablemente faltante | No existe; el procedimiento manual está en el runbook |
| Mensajes del servidor en inglés | Confirmado faltante | `docs/i18n.md` |
| Copia de los respaldos fuera de la laptop; respaldo de `config.json` | Confirmado faltante (manual) | §30 |
| Validación contra live real (fase 0) | Hecha en parte (2026-10-14); falta anotar el resultado de cada casilla | `docs/fase-0.md` |
| Fase 5 (v2/v3) | Indeterminado | Sin contenido; ver especificación |
| Tablas sin uso | Ninguna detectada |
| Endpoints sin consumidor | `POST /queue/clear`, `GET /stats`, `GET /metrics` (posible uso por herramientas externas) — Indeterminado |

---

## 36. Matriz de trazabilidad

| Funcionalidad | Frontend | Endpoint | Backend | DB | Test |
| --- | --- | --- | --- | --- | --- |
| Conectar | `status.page.ts` | `POST /connector/connect` | `connector-supervisor.ts` | `live_session` | `connector-supervisor.spec.ts` |
| Simular | `simulator.page.ts` | `POST /simulator/emit` | `simulator-service.ts` | `live_event` | `app.e2e.spec.ts` |
| Regla | `rule-editor.page.ts`, `rules.store.ts` | `/rules*` | `rule-service.ts`, `rule-engine.ts` | `rule` | `rule-engine.spec.ts`, `assets-rules.e2e.spec.ts` |
| Trigger | `triggers.page.ts` | `/triggers*`, `/sounds/search` | `trigger-service.ts`, `myinstants-provider.ts` | `sound_trigger` | `triggers.e2e.spec.ts` |
| Asset | `assets.page.ts` | `/assets*` | `asset-service.ts` | `asset` | `assets-rules.e2e.spec.ts` |
| Ranking | `rankings.page.ts` | `/leaderboards*` | `leaderboard-service.ts` | `leaderboard_total` | `projections.*.spec.ts` |
| Meta | `goal-form.ts` | `/goals*` | `goal-service.ts` | `goal`, `goal_cycle` | `projections.integration.spec.ts` |
| Ajustes | `settings.page.ts` | `/settings*` | `settings-service.ts` | `config.json` | `settings*.spec.ts` |
| Login | `login.page.ts`, `auth.guard.ts` | `/auth/*` | `auth-service.ts` | `config.json` | `settings-auth.e2e.spec.ts` |
| Overlays | `overlays.page.ts` | WS `/ws/screen` | `socket-routes.ts`, `snapshot-publisher.ts` | proyecciones | `snapshot-publisher.spec.ts`, `e2e/overlays.spec.ts` |
| Respaldos | `status.page.ts` (alertas) | `/backups` | `maintenance-service.ts` | todas | `observability.e2e.spec.ts` |
| Idioma | `topbar.ts` | — | — | — | `e2e/language.spec.ts`, `messages.spec.ts` |

---

## 37. Recomendaciones

Estado al 2026-10-15. Hechas: SEC-01 (`@fastify/static`), primer commit y ramas (D-01), retención (F-03), respaldos, despliegue en Windows, `/metrics`, runbook, i18n y Playwright.

**P0**
1. *Problema:* F-02. *Evidencia:* `main/index.ts` (`restart()`: el segundo `boot()` del `catch` no está protegido). *Solución:* capturar el error, registrar y `process.exit(1)` para que la tarea programada reinicie; añadir una prueba de `AppHost`. *Esfuerzo:* 2–4 h.
2. *Problema:* F-07. *Evidencia:* `JsonConfigStore.read` sin `try/catch`. *Solución:* renombrar el archivo dañado a `config.json.bad`, arrancar con valores por defecto y avisar en el log. *Esfuerzo:* 1–2 h.

**P1**
3. Ensayar `deploy/windows` y el ensayo de 4 h en la laptop; ejecutar `load-test` y `phase0 -- cpu` con la máquina libre (R-05, R-08).
4. `frame-ancestors 'none'` en el CSP del panel, validar `Origin` en `/ws/admin` y limitar los intentos de `setup` (SEC-04/05/06). 0,5 día.
5. Respaldar también `config.json` y copiar `BACKUP_DIR` fuera de la laptop (F-09).
6. Convertir una grabación de un live real en prueba de regresión de `tiktok-message-mapper`; probar la reconexión tras cortar la red 60 s.

**P2**
7. Test de sincronía `schema.ts` ↔ migraciones; pruebas unitarias de overlays.
8. Umbral de cobertura para `application/**`.
9. Mensajes del servidor en inglés (hoy solo se traducen las alertas de salud).
10. Revisar que el `README` mencione `/backups`, `/metrics`, `/goals/:id/progress` y `/overlay-templates`.

**P3**
11. Unificar TypeScript; refactor ligero del composition root; escribir el ADR 0002 (citado en el código); documentar o limitar el `screenId` duplicado (F-11); fijar el comentario de `main/index.ts` que habla de systemd.

---

## 38. Guía para nuevos desarrolladores

1. **Requisitos:** Node ≥22, npm, Windows/Linux.
2. **Instalar:** `npm ci`; `npm run build` compila contracts, overlays, dashboard y servidor (ver §19). Para las pruebas de navegador, `npx playwright install chromium`.
3. **Configurar:** `.env` opcional; `SIMULATE=true` para trabajar sin live.
4. **Arrancar:** `npm run dev` → `/admin/`; copiar el `setupCode` de la consola; crear contraseña.
5. **Probar:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run depcheck`, `npm run test:e2e` (tras `npm run build`). El CI las exige todas, más `npm audit` y que el catálogo de traducciones esté al día.
6. **Leer primero:** `docs/plan.md`, `docs/operacion.md`, `docs/runbook.md`, `docs/adr/0008`–`0011`, la especificación (1437 líneas) y `composition-root.ts`.
7. **Nueva funcionalidad:** (a) esquema en `packages/contracts`; (b) lógica pura en `domain`; (c) caso de uso y puerto en `application`; (d) adaptador en `infrastructure`; (e) ruta en `interface/http` y registro en `build-http-server.ts`; (f) cableado en `composition-root.ts`; (g) pantalla en `apps/dashboard/src/app/features/<x>` con ruta lazy en `app.routes.ts`. `depcheck` fallará si violas capas.
8. **Nuevo endpoint:** función `register…Routes(app, services)`; validar con Zod; errores con `sendProblem`/`notFound`; añadir el servicio a `HttpServices` (`interface/http/services.ts`); pruebas e2e con `test/support/test-app.ts`.
9. **Cambiar la BD:** crear `migrations/000N_nombre.sql` (la siguiente es `0006`) (nombre `^\d{4}_[\w-]+\.sql$`, sin *down*), actualizar `infrastructure/sqlite/schema.ts` a mano y agregar prueba en `sqlite.integration.spec.ts`. Migraciones se aplican al iniciar.
10. **Nueva condición/acción de regla:** añadir al esquema discriminado en `contracts/rules.ts` y al registro en `domain/rules/conditions.ts` / `actions.ts`; reflejar en `rule-catalog.ts` del dashboard.
11. **Convenciones:** TypeScript estricto, ESM (`.js` en imports), Prettier, Angular standalone con signals, textos de UI en español marcados con `i18n` / `$localize` y traducidos al inglés (`docs/i18n.md`), errores RFC 9457, reloj/aleatoriedad inyectados (nunca `Date.now()` en dominio). Ramas, commits y versiones: `Claude.md`.
12. **Errores comunes:** olvidar compilar overlays/dashboard (solo advertencia); `[value]` en `<select>` con `@for` (usar `[selected]`); inline handlers prohibidos por CSP; probar tiempos con CPU saturada; mezclar TS 5.9 del dashboard con 6.0 de la raíz; dependencias de la librería TikTok fuera de `infrastructure/tiktok`; poner `aria-label="… {{ x }}"` traducido en un elemento nativo (no se aplica: usa `[attr.aria-label]` con `lib/accessible-labels.ts`); olvidar `npm run i18n:extract` y la traducción al inglés tras tocar textos.

## 39. Guía de operación

| Tarea | Procedimiento actual |
| --- | --- |
| Arranque | Windows: tarea programada «TikLive» (arranca sola y reinicia tras ~3 s). Linux/desarrollo: `npm run build && npm run start` (o `npm run dev`) |
| Detención | `SIGTERM`/`SIGINT`: detiene conector, drena pipeline (5 s), cierra sesión, sockets y BD |
| Reinicio | Botón «Reiniciar ahora» (en proceso) o reinicio del proceso |
| Logs | stdout (JSON); en Windows, un archivo por arranque en `C:\TikLive\logs` (se conservan 20) |
| Health | `GET /api/v1/health` |
| Backup / Restore | Automático; `npm run restore` (§30–31, `docs/operacion.md`) |
| Migraciones | Automáticas al arranque; solo avanzan |
| Deploy / Rollback | `npm run package`, `deploy.ps1`, `rollback.ps1` (Windows, sin ensayar; `docs/despliegue-windows.md`) |
| Incidentes | `docs/runbook.md` |
| Rotar clave de overlays | Ajustes → «Rotar clave» (desconecta y exige nuevas URLs) |
| Cambiar contraseña | Ajustes (`POST /auth/password`) |
| Reset de rankings | Panel (total exige confirmación) |

---

## 40. Glosario

- **Overlay / pantalla:** página que se carga en OBS/LIVE Studio; `screen/*` ejecuta acciones, `overlay/*` muestra datos.
- **RawLiveEvent / LiveEvent:** evento neutral del adaptador / evento normalizado y validado.
- **Racha (streak):** secuencia de regalos que TikTok emite en parciales; se consolida en un único evento final.
- **Proyección:** tabla o estructura derivada (rankings, totales, metas, stats).
- **Trigger de sonido:** sonido de MyInstants asociado a un tipo de evento (distinto de una *regla*).
- **Clave de overlays:** token `?key=` de solo lectura.
- **Código de configuración (`setupCode`):** código de un solo uso de la consola para crear la contraseña.
- **ADR:** registro de decisión de arquitectura.

## 41. Anexos

**A. Comprobaciones ejecutadas durante el análisis (2026-10-07) y su repetición el 2026-10-15**

| Comando | 2026-10-07 | 2026-10-15 |
| --- | --- | --- |
| `npx vitest run` | 26 archivos, 208 pruebas, en verde | 40 archivos, 310 pruebas, en verde |
| `npm run test:e2e` | — | 30 pruebas en verde (servidor limpio, sin red) |
| `npm run lint` | Sin errores | Sin errores |
| `npm run typecheck` | Sin errores | Sin errores |
| `npm run depcheck` | 0 violaciones (122 módulos, 432 dependencias) | 0 violaciones (147 módulos, 505 dependencias) |
| `npm audit --omit=dev` | 1 vulnerabilidad **alta** (`@fastify/static`) | 0 vulnerabilidades |
| Historial git | La rama `main` no tenía commits | 31 commits; CI en verde en `main` (run 46) |

**B. Límites de este análisis (segunda revisión contra el código)**

- No se leyó en detalle: `event-normalizer.ts`, `text-filters.ts`, `condition*.ts`, `leaderboard/goal-service.ts`, `snapshot-publisher.ts`, `tiktok-message-mapper.ts`, `tiktok-gift-catalog.ts`, `seed.ts`, componentes/plantillas Angular, ni los HTML/CSS/TS de overlays más allá de `params.ts`, `ws-client.ts`, `dom.ts`, `alerts.ts`. Lo dicho sobre ellos proviene de `docs/plan.md`, ADR, contratos y nombres de pruebas, y se marcó como tal.
- Los puntos marcados «Probable», «Potencial» o «deducido» no fueron reproducidos dinámicamente.
- Esta revisión no ejecutó el servidor contra TikTok ni midió rendimiento real. El live real del 2026-10-14 lo hizo el propietario; qué supuestos de la fase 0 se comprobaron no está anotado en `docs/fase-0.md`.
- La revisión del 2026-10-15 verificó contra el código y las pruebas: rutas, migraciones, variables, acciones, alertas, CI y los hallazgos F-02, F-07, F-10, SEC-04/05/06; **no** reejecutó las secciones de seguridad que no cambiaron (SEC-02, 03, 07–13), ni verificó el contenido de `README.md` más allá de lo indicado en §10.4.
- Afirmaciones corregidas durante la revisión: se descartó asumir roles/RBAC, Docker y systemd (no existen; `/metrics` y el despliegue de Windows se añadieron después); se descartó una vulnerabilidad de inyección SQL (no hay evidencia).
