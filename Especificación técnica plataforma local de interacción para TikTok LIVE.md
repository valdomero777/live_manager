# Especificación técnica: plataforma local de interacción para TikTok LIVE

Oct 6, 2026 · @Alan

## 1. Resumen y alcance

El sistema es una plataforma autoalojada que convierte los eventos de un TikTok LIVE propio (comentarios, regalos, likes, follows, entradas) en reacciones en pantalla y en audio: alertas, TTS, leaderboards, metas y estadísticas. Corre en una laptop vieja dentro de la LAN; la PC de stream solo renderiza una pestaña de audio y las URLs de overlay.

**Objetivos**

- Cubrir las funciones esenciales de TikFinity y TikOps sin costo recurrente ni dependencia de terceros.
- Mantener el consumo de la PC de stream cercano a cero: toda la lógica vive en la laptop.
- Tolerar fallos del conector no oficial sin tumbar el resto del sistema.
- Mantener el código modular, probado y mantenible (SOLID, Clean Code).

**Alcance por versión**

| Versión | Funciones | Criterio de salida |
| --- | --- | --- |
| v1 | Conector, bus de eventos, simulador, reglas evento→acción, sonidos, TTS de comentarios, alertas, leaderboards (regalos y likes), metas, stats, rotator, dashboard básico | Un live completo de 2 horas sin intervención manual |
| v2 | Ticker, comandos por palabra clave, puntos de lealtad, subasta, ruleta de acciones, control de OBS por obs-websocket, import/export de reglas | Reglas complejas reproducibles desde JSON |
| v3 | Teclas simuladas (agente local en PC de stream), Minecraft, avatares animados | Un agente externo ejecuta acciones sin tocar el núcleo |

**Fuera de alcance**

- Envío de mensajes al chat de TikTok (requiere sesión autenticada y arriesga la cuenta).
- Multiusuario, multi-streamer y alojamiento público.
- Cualquier integración que dependa de una API oficial de TikTok, que no existe para eventos de LIVE.

**Supuestos por verificar**

- TikTok LIVE Studio acepta URLs como fuente de tipo Link para los overlays.
- La laptop tiene al menos 4 GB de RAM y un procesador de dos núcleos o más.
- La PC de stream y la laptop comparten red local por cable o Wi-Fi estable.

## 2. Requisitos

Cada requisito tiene un identificador estable para trazarlo en pruebas, issues y commits. Prioridad: M = obligatorio, S = deseable.

**Requisitos funcionales**

| ID | Requisito | Ver. | Prio. | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| RF-01 | Conectar a un LIVE por @usuario y recibir comentarios, regalos, likes, follows, entradas, shares y fin de transmisión | v1 | M | Un evento real aparece en el log en menos de 2 s |
| RF-02 | Reconexión automática con backoff exponencial y jitter | v1 | M | Tras cortar la red 60 s, el conector reconecta solo |
| RF-03 | Consolidar rachas de regalos en un único evento final | v1 | M | Una racha de 10 regalos genera 1 evento con cantidad 10 |
| RF-04 | Simulador de eventos desde el dashboard y por CLI | v1 | M | Cada tipo de evento se puede disparar sin estar en vivo |
| RF-05 | Reglas evento→condiciones→acciones editables | v1 | M | Una regla creada en el dashboard se ejecuta sin reiniciar |
| RF-06 | Condiciones: tipo, regalo (id/nombre), mínimo de diamantes, likes acumulados, rol del usuario, palabra clave | v1 | M | Cada condición tiene prueba unitaria |
| RF-07 | Cooldown global y por usuario, probabilidad y prioridad por regla | v1 | M | Una regla con cooldown 30 s no se ejecuta dos veces en 30 s |
| RF-08 | Acciones: sonido, alerta visual, TTS, actualizar meta, webhook HTTP | v1 | M | Una regla puede encadenar varias acciones |
| RF-09 | Un evento puede disparar varias acciones o una al azar | v1 | S | Modo `all` y modo `random` configurables |
| RF-10 | TTS de comentarios con voz, idioma, volumen y límite de longitud | v1 | M | Un comentario de 300 caracteres se recorta al límite |
| RF-11 | Filtro de moderación previo al TTS (lista de bloqueo, spam, repeticiones) | v1 | M | Un comentario bloqueado nunca llega a la cola de audio |
| RF-12 | Leaderboard de regalos por diamantes y por cantidad | v1 | M | El orden cambia en menos de 1 s tras un regalo |
| RF-13 | Leaderboard de likes | v1 | M | La suma coincide con los likes recibidos |
| RF-14 | Alcances de ranking: sesión, semanal y total, con reset manual | v1 | M | El reset de sesión no borra el total |
| RF-15 | Metas (regalos, likes, diamantes) con barra de progreso | v1 | M | Al alcanzar la meta se dispara una acción |
| RF-16 | Overlay de estadísticas: espectadores, likes, diamantes totales | v1 | M | Los valores se actualizan sin refrescar |
| RF-17 | Rotator: varios overlays alternados en una sola URL | v1 | M | Una única URL cicla leaderboards, meta y stats |
| RF-18 | Pestaña de audio con cola, volumen y botón de inicio | v1 | M | El audio suena tras un clic inicial y respeta la cola |
| RF-19 | Biblioteca de assets (audio, imágenes, GIF) con carga desde el dashboard | v1 | M | Un archivo subido se puede asignar a una regla |
| RF-20 | Ticker de mensajes y hitos | v2 | S | Texto configurable que desplaza o rota |
| RF-21 | Comandos por palabra clave en el chat (solo lectura) | v2 | S | `!comando` dispara una regla |
| RF-22 | Puntos de lealtad por usuario | v2 | S | Los puntos se acumulan por regalos y persisten |
| RF-23 | Subasta (mayor donador gana) | v2 | S | Cierra al terminar el tiempo y declara ganador |
| RF-24 | Ruleta de acciones | v2 | S | Resultado ponderado y reproducible con semilla |
| RF-25 | Control de OBS por obs-websocket (escenas, fuentes) | v2 | S | Una regla cambia de escena |
| RF-26 | Import/export de reglas y configuración en JSON versionado | v2 | S | Un export se importa en otra instalación |
| RF-27 | Agente local de teclas simuladas en la PC de stream | v3 | S | Una acción presiona una tecla en la PC remota |

**Requisitos no funcionales**

| ID | Requisito | Métrica objetivo |
| --- | --- | --- |
| RNF-01 | Latencia evento→overlay en LAN | p95 menor a 300 ms desde la recepción en el backend |
| RNF-02 | Consumo de la laptop en vivo | CPU media menor a 25 %, RAM menor a 400 MB sin Piper |
| RNF-03 | Consumo en la PC de stream | Una pestaña de audio y una URL de overlay; menos de 2 % de CPU |
| RNF-04 | Disponibilidad durante un live | Sin reinicios manuales en 4 horas continuas |
| RNF-05 | Recuperación ante caída del proceso | Reinicio automático en menos de 10 s |
| RNF-06 | Persistencia | Ningún evento aceptado se pierde ante un reinicio |
| RNF-07 | Seguridad | Dashboard con autenticación; puertos solo en LAN |
| RNF-08 | Mantenibilidad | Cobertura de pruebas del dominio mayor al 80 %; lint sin errores en CI |
| RNF-09 | Portabilidad | Ejecutable en Ubuntu Server y Windows con Node LTS |
| RNF-10 | Observabilidad | Logs estructurados y endpoint de salud |
| RNF-11 | Compatibilidad de overlays | Funcionan como Browser Source y como Link Source |
| RNF-12 | Accesibilidad básica del dashboard | Navegación por teclado y contraste AA |

## 3. Arquitectura general

&#91;embedded content: arquitectura · 2 zonas, 11 componentes\]

Los eventos entran por el conector, se normalizan y alimentan en paralelo al motor de reglas y a las proyecciones; la interfaz HTTP/WebSocket entrega acciones y estado a la pestaña de audio, a los overlays y al dashboard. El motor de reglas (resaltado) es el único componente que decide qué reacción ocurre.

**Flujo de un evento**

1. El conector recibe el mensaje crudo de TikTok y lo entrega al normalizador.
2. El normalizador valida con Zod, deduplica, consolida rachas de regalos y emite un `LiveEvent`.
3. El caso de uso `IngestLiveEvent` guarda el evento y actualiza las proyecciones en una sola transacción SQLite.
4. El motor de reglas selecciona las reglas aplicables, evalúa condiciones y límites, y planifica acciones.
5. La cola ordena las acciones por prioridad y pantalla; la interfaz las envía por WebSocket.
6. El overlay ejecuta la acción y responde `action.done`; la cola avanza a la siguiente.
7. Las proyecciones publican snapshots a los overlays de leaderboard, metas y estadísticas.

**Modelo de concurrencia**

- Un solo proceso Node con un bucle de eventos; las operaciones de SQLite son síncronas y breves, dentro de transacciones cortas.
- El procesamiento de eventos es secuencial por sesión (cola FIFO interna), lo que garantiza orden y evita condiciones de carrera en los acumulados.
- Las tareas pesadas (Piper) se ejecutan como proceso hijo; nunca bloquean el bucle de eventos.

**Decisiones de arquitectura (ADR resumidos)**

| ADR | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 0001 | Monolito modular en un proceso | Una laptop vieja se opera mejor con un solo servicio | Los módulos se aíslan por interfaces, no por red |
| 0002 | Conector detrás del puerto `LiveEventSource` | Dependencia no oficial y frágil | Reemplazable sin tocar el dominio |
| 0003 | SQLite en modo WAL | Un solo escritor, sin servidor de base de datos | Sin acceso concurrente desde otros procesos |
| 0004 | Reglas como datos (JSON validado) | Editables desde el dashboard sin redeploy | Requiere versionado de esquema |
| 0005 | Proyecciones incrementales y snapshots por WebSocket | Los overlays no consultan la base | Los overlays son clientes tontos y livianos |
| 0006 | Audio en la PC de stream, lógica en la laptop | Minimiza el consumo donde corre el juego | El audio depende de la conexión por LAN |
| 0007 | TypeScript de extremo a extremo con contratos compartidos | Un solo lenguaje y tipos comunes | El paquete `contracts` es crítico para la compatibilidad |

## 4. Infraestructura y despliegue

Todo el backend corre como un único servicio systemd en la laptop, accesible solo por LAN; la PC de stream consume HTTP y WebSocket por la red local.

**Dimensionamiento de la laptop**

| Recurso | Mínimo | Recomendado | Nota |
| --- | --- | --- | --- |
| CPU | 2 núcleos | 4 núcleos | Piper (TTS local) exige más; probar antes de adoptarlo |
| RAM | 4 GB | 8 GB | Node + SQLite caben en menos de 400 MB |
| Disco | 20 GB | SSD de 60 GB | Assets de audio e imágenes ocupan la mayor parte |
| Red | Wi-Fi estable | Ethernet | El conector mantiene un WebSocket largo hacia TikTok |
| Energía | Corriente continua | Batería sana como mini UPS | Evita apagones durante un live |

**Sistema operativo y runtime**

- Ubuntu Server LTS vigente, sin entorno gráfico. Alternativa: Windows con NSSM o pm2.
- Node.js LTS vigente; verificar la versión mínima que exige `tiktok-live-connector` antes de fijarla.
- SQLite en modo WAL, dentro de `/var/lib/tiklive`.
- Sincronización horaria con `chrony` para que las marcas de tiempo de los eventos sean coherentes.

**Red**

- Reserva DHCP en el router (IP fija) y nombre `tiklive.local` con avahi para no depender de la IP.
- Un único puerto HTTP/WS (por ejemplo 3000) para API, overlays y WebSocket.
- Firewall `ufw`: denegar todo entrante salvo SSH y el puerto de la app, ambos restringidos a la subred local.

```bash
sudo ufw default deny incoming
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
sudo ufw enable
```

**Evitar suspensión de la laptop**

```bash
# /etc/systemd/logind.conf
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore

sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

**Servicio systemd**

```ini
# /etc/systemd/system/tiklive.service
[Unit]
Description=TikLive Control
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=tiklive
WorkingDirectory=/opt/tiklive/current
EnvironmentFile=/etc/tiklive/env
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/tiklive /var/log/tiklive

[Install]
WantedBy=multi-user.target
```

**Configuración por entorno**

- Variables en `/etc/tiklive/env` (permisos 600): `PORT`, `TIKTOK_USERNAME`, `DB_PATH`, `ASSETS_DIR`, `ADMIN_PASSWORD_HASH`, `LOG_LEVEL`.
- Ningún secreto en el repositorio; el repositorio incluye solo `.env.example`.

**Flujo de despliegue**

1. En desarrollo: `npm ci`, pruebas y build en tu máquina.
2. Empaquetar `dist/`, `package.json` y `package-lock.json` en un artefacto versionado (`tiklive-<version>.tgz`).
3. Copiar a `/opt/tiklive/releases/<version>` por `scp` o `rsync`.
4. `npm ci --omit=dev` en esa carpeta y migraciones de base de datos.
5. Cambiar el symlink `/opt/tiklive/current` al nuevo release y ejecutar `systemctl restart tiklive`.
6. Verificar `GET /health`; si falla, volver el symlink al release anterior (rollback en un comando).

Conservar los últimos 3 releases en disco. Fijar la versión exacta de `tiktok-live-connector` en `package-lock.json` y actualizarla solo tras probar con el simulador.

**Respaldo y retención**

```bash
# /etc/cron.d/tiklive-backup
0 4 * * * tiklive sqlite3 /var/lib/tiklive/app.db ".backup '/var/backups/tiklive/app-$(date +\%F).db'" && find /var/backups/tiklive -name 'app-*.db' -mtime +14 -delete
```

- Copiar `ASSETS_DIR` con `rsync` a un disco externo una vez por semana.
- Logs por journald con límite de tamaño (`SystemMaxUse=500M`).

**Acceso remoto opcional**

- Preferir VPN (WireGuard/Tailscale) para administrar la laptop fuera de casa.
- Si se usa Cloudflare Tunnel, protegerlo con Cloudflare Access y exponer solo el dashboard, nunca los overlays ni el WebSocket de eventos.

## 5. Stack tecnológico

Todo el servidor y los overlays usan TypeScript en modo estricto; el dashboard usa Angular por afinidad con tu experiencia. Las versiones concretas se fijan en `package-lock.json` al iniciar el proyecto, usando las LTS o estables vigentes.

| Capa | Tecnología | Justificación | Alternativa |
| --- | --- | --- | --- |
| Lenguaje | TypeScript (`strict`, `noUncheckedIndexedAccess`) | Tipos para eventos y contratos; un solo lenguaje en back y overlays | JavaScript con JSDoc |
| Runtime | Node.js LTS | Requisito del conector `tiktok-live-connector` | Bun (no validado con el conector) |
| Conector TikTok | `tiktok-live-connector` | Librería abierta, sin credenciales, con eventos tipados | `TikTokLive` (Python) en un proceso aparte |
| HTTP + WS | Fastify + `@fastify/websocket` | Bajo consumo, esquemas de validación, buen rendimiento | Express + `ws` |
| Validación | Zod | Un esquema genera el tipo y valida en runtime | Valibot, TypeBox |
| Base de datos | SQLite (`better-sqlite3`, modo WAL) | Sin servidor, un archivo, suficiente para un solo streamer | MySQL (innecesario aquí) |
| Acceso a datos | Kysely + migraciones SQL versionadas | Consultas tipadas sin ORM pesado | Drizzle ORM |
| Logs | Pino (JSON) | Rápido y estructurado | Winston |
| Dashboard | Angular (standalone components, signals) | Tu stack principal | React |
| Overlays | TypeScript + Vite, sin framework | Páginas mínimas y livianas para la PC de stream | Preact |
| Audio | HTML5 Audio + Web Audio API (`GainNode`) | Control de volumen y cola en el navegador | Howler.js |
| TTS | Web Speech API; opcional Piper en la laptop | Gratis y sin carga en el servidor; Piper da mejor calidad | Servicios en la nube (descartados por costo) |
| Pruebas | Vitest + Playwright (solo overlays y dashboard) | Rápido, nativo de TypeScript | Jest |
| Calidad | ESLint, Prettier, `tsc --noEmit`, dependency-cruiser | Reglas de capas verificables | Biome |
| Control de versiones | Git + Conventional Commits | Changelog y versionado automáticos | n/a |
| CI | GitHub Actions | Lint, pruebas y build en cada push | GitLab CI |
| Procesos | systemd | Reinicio, logs y arranque en frío | pm2, NSSM en Windows |

**Decisiones de diseño del stack**

- **Monolito modular en un solo proceso.** Un proceso es más fácil de operar en una laptop vieja que varios servicios; los módulos se aíslan por interfaces, no por red.
- **Sin ORM completo.** Kysely mantiene el SQL visible y el tipado fuerte sin coste en memoria.
- **Inyección de dependencias manual** en un único *composition root*. No se usan decoradores ni contenedores IoC para mantener el arranque simple y las dependencias explícitas.
- **Sin Docker en la laptop** por defecto, para ahorrar recursos. El proyecto debe poder ejecutarse en un contenedor si más adelante se desea.
- **Overlays sin framework** para minimizar el consumo en la PC de stream, donde cada MB cuenta.

## 6. Modelo de dominio y de datos

El dominio se modela con entidades inmutables y objetos de valor; la base de datos es un detalle de infraestructura detrás de repositorios.

**Conceptos del dominio**

| Concepto | Tipo | Descripción |
| --- | --- | --- |
| `LiveSession` | Entidad | Un live: inicio, fin, usuario de TikTok; delimita el alcance de los rankings de sesión |
| `Viewer` | Entidad | Espectador identificado por `tiktok_user_id`; guarda alias, avatar, rol y acumulados |
| `LiveEvent` | Objeto de valor | Evento normalizado e inmutable (comentario, regalo, like, follow, entrada, share) |
| `Rule` | Entidad | Disparador, condiciones, acciones, cooldowns, prioridad, estado activo |
| `Asset` | Entidad | Archivo de audio o imagen con hash, tipo, duración y ruta |
| `Goal` | Entidad | Meta con métrica, objetivo, progreso y acción al cumplirse |
| `LeaderboardEntry` | Proyección | Total por espectador, métrica y alcance |
| `PointsLedger` (v2) | Entidad | Movimientos de puntos por espectador |

**Esquema SQLite (v1)**

```sql
CREATE TABLE live_session (
  id            INTEGER PRIMARY KEY,
  tiktok_user   TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER
);

CREATE TABLE viewer (
  id             INTEGER PRIMARY KEY,
  tiktok_user_id TEXT NOT NULL UNIQUE,
  unique_id      TEXT NOT NULL,
  nickname       TEXT,
  avatar_url     TEXT,
  is_follower    INTEGER NOT NULL DEFAULT 0,
  is_subscriber  INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE live_event (
  id          INTEGER PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES live_session(id),
  viewer_id   INTEGER REFERENCES viewer(id),
  type        TEXT NOT NULL,
  payload     TEXT NOT NULL,   -- JSON validado con Zod
  dedupe_key  TEXT,
  occurred_at INTEGER NOT NULL
);
CREATE INDEX ix_event_session_type ON live_event(session_id, type, occurred_at);
CREATE UNIQUE INDEX ux_event_dedupe ON live_event(session_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE rule (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  trigger     TEXT NOT NULL,   -- tipo de evento
  conditions  TEXT NOT NULL,   -- JSON
  actions     TEXT NOT NULL,   -- JSON
  mode        TEXT NOT NULL DEFAULT 'all',  -- all | random
  cooldown_ms INTEGER NOT NULL DEFAULT 0,
  user_cooldown_ms INTEGER NOT NULL DEFAULT 0,
  probability REAL NOT NULL DEFAULT 1.0,
  priority    INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  version     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE asset (
  id        INTEGER PRIMARY KEY,
  kind      TEXT NOT NULL,     -- audio | image | video
  filename  TEXT NOT NULL,
  sha256    TEXT NOT NULL UNIQUE,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE goal (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  metric    TEXT NOT NULL,     -- diamonds | gifts | likes
  target    INTEGER NOT NULL,
  scope     TEXT NOT NULL,     -- session | total
  on_reach  TEXT,              -- JSON de acciones
  repeat_factor REAL           -- NULL = no se repite
);

CREATE TABLE goal_cycle (
  goal_id    INTEGER NOT NULL REFERENCES goal(id),
  cycle      INTEGER NOT NULL,
  reached_at INTEGER NOT NULL,
  PRIMARY KEY (goal_id, cycle)
);

CREATE TABLE leaderboard_total (
  viewer_id INTEGER NOT NULL REFERENCES viewer(id),
  scope     TEXT NOT NULL,     -- session:<id> | week:<yyyy-ww> | total
  metric    TEXT NOT NULL,     -- diamonds | gift_count | likes
  value     INTEGER NOT NULL,
  PRIMARY KEY (viewer_id, scope, metric)
);
CREATE INDEX ix_lb_rank ON leaderboard_total(scope, metric, value DESC);

CREATE TABLE app_setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**Pragmas de conexión**

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

**Reglas de datos**

- Los tiempos se guardan como milisegundos Unix en UTC; la presentación convierte a zona local.
- Las migraciones son archivos SQL numerados (`0001_init.sql`) aplicados al arrancar, dentro de una transacción.
- `live_event.payload` se valida con Zod al escribir y al leer; ningún JSON sin validar entra al dominio.
- Retención: conservar `live_event` 90 días y consolidar en `leaderboard_total`; los totales no se borran salvo reset explícito.
- `leaderboard_total` se actualiza de forma incremental con `INSERT … ON CONFLICT DO UPDATE` dentro de la misma transacción que guarda el evento, para que ranking y log no diverjan.
- Las rachas de regalos se persisten solo como evento final consolidado.

## 7. Contratos: eventos, WebSocket y API REST

Los contratos se definen una vez con Zod en un paquete compartido (`packages/contracts`); el backend, el dashboard y los overlays importan los mismos tipos. Todo mensaje lleva versión (`v`) para poder evolucionar sin romper clientes.

**Evento normalizado de dominio**

```ts
export type LiveEvent =
  | CommentEvent | GiftEvent | LikeEvent | FollowEvent
  | JoinEvent | ShareEvent | ViewerCountEvent | StreamEndEvent;

interface BaseEvent {
  readonly id: string;            // UUID generado al normalizar
  readonly sessionId: number;
  readonly occurredAt: number;    // epoch ms UTC
  readonly dedupeKey?: string;    // msgId de TikTok cuando existe
}

export interface ViewerRef {
  readonly tiktokUserId: string;
  readonly uniqueId: string;
  readonly nickname: string;
  readonly avatarUrl?: string;
  readonly isFollower: boolean;
  readonly isSubscriber: boolean;
}

export interface CommentEvent extends BaseEvent {
  readonly type: 'comment';
  readonly viewer: ViewerRef;
  readonly text: string;
}

export interface GiftEvent extends BaseEvent {
  readonly type: 'gift';
  readonly viewer: ViewerRef;
  readonly giftId: number;
  readonly giftName: string;
  readonly diamondValue: number;    // por unidad
  readonly quantity: number;        // total de la racha consolidada
  readonly isStreakFinal: boolean;
}

export interface LikeEvent extends BaseEvent {
  readonly type: 'like';
  readonly viewer: ViewerRef;
  readonly likeDelta: number;        // likes de este paquete
  readonly totalLikes: number;       // acumulado reportado por TikTok
}
```

**Mensajes de WebSocket (envelope común)**

```ts
interface WsEnvelope<T extends string, P> {
  readonly v: 1;
  readonly type: T;
  readonly ts: number;
  readonly payload: P;
}
```

| Canal | Ruta | Dirección | Mensajes principales |
| --- | --- | --- | --- |
| Overlay/audio | `/ws/screen/:screenId` | servidor → cliente | `action.play_sound`, `action.show_alert`, `action.speak`, `leaderboard.snapshot`, `goal.progress`, `stats.snapshot`, `config.changed` |
| Overlay/audio | `/ws/screen/:screenId` | cliente → servidor | `client.hello`, `action.done`, `action.failed`, `ping` |
| Dashboard | `/ws/admin` | servidor → cliente | `connector.status`, `event.received`, `rule.executed`, `queue.stats`, `error.reported` |
| Dashboard | `/ws/admin` | cliente → servidor | `simulator.emit`, `queue.clear`, `session.reset` |

- Cada acción lleva un `actionId` único; el cliente responde `action.done` al terminar. Esto permite cola ordenada y reintento si el overlay se desconecta.
- Al conectarse, el overlay envía `client.hello` con su `screenId` y recibe un snapshot completo (leaderboards, metas, stats) antes de recibir deltas.
- Los mensajes se validan con Zod en ambos extremos; uno inválido se descarta y se registra con nivel `warn`.

**API REST (prefijo `/api/v1`)**

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/health` | Estado del proceso, conector, base de datos y cola |
| GET | `/connector` | Estado y @usuario actual del conector |
| POST | `/connector/connect` | Conecta a un @usuario |
| POST | `/connector/disconnect` | Desconecta el conector |
| GET/POST | `/rules` | Lista y crea reglas |
| GET/PUT/DELETE | `/rules/:id` | Lee, actualiza, elimina una regla |
| POST | `/rules/:id/test` | Ejecuta la regla con un evento de prueba |
| GET/POST | `/assets` | Lista y sube assets (multipart) |
| DELETE | `/assets/:id` | Elimina un asset no referenciado |
| GET/POST | `/goals` | Lista y crea metas |
| GET | `/leaderboards/:metric` | Ranking por métrica; query `scope` (session, week o total) y `limit` |
| POST | `/leaderboards/reset` | Reinicia un alcance |
| GET | `/stats` | Estadísticas de la sesión actual |
| POST | `/simulator/emit` | Inyecta un evento sintético |
| GET/PUT | `/settings` | Configuración global |
| POST | `/config/export` · `/config/import` | Exporta e importa configuración JSON versionada |

**Convenciones de la API**

- JSON con `Content-Type: application/json`; errores con formato RFC 9457 (`application/problem+json`).
- Paginación por cursor en listados largos; ordenamiento explícito.
- Idempotencia: `PUT` y `DELETE` son idempotentes; `POST /simulator/emit` acepta un `Idempotency-Key` opcional.
- Versionado por prefijo (`/api/v1`); un cambio incompatible crea `/api/v2`.
- Autenticación: el dashboard usa sesión con cookie `HttpOnly` y `SameSite=Strict`. Los overlays se autentican con un token de solo lectura en la query (`?key=`), porque las fuentes Link o Browser Source no pueden enviar cabeceras personalizadas. El token se rota desde el dashboard.

## 8. Módulo Conector TikTok

El conector aísla la dependencia no oficial detrás de un puerto (`LiveEventSource`). Si TikTok rompe el protocolo, solo se reemplaza el adaptador; el dominio, las reglas y los overlays no cambian.

**Puerto y adaptador**

```ts
// application/ports/live-event-source.ts
export interface LiveEventSource {
  start(target: string): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (event: RawLiveEvent) => void): Unsubscribe;
  onStatus(handler: (status: ConnectorStatus) => void): Unsubscribe;
}

// infrastructure/tiktok/tiktok-live-connector.adapter.ts
// Implementa LiveEventSource envolviendo tiktok-live-connector.
// infrastructure/simulator/simulated-source.adapter.ts
// Implementa LiveEventSource emitiendo eventos sintéticos o grabados.
```

El simulador usa el mismo puerto que el conector real. Así las pruebas y los ensayos recorren exactamente el mismo camino que un live.

**Máquina de estados**

| Estado | Entra desde | Sale a | Acción |
| --- | --- | --- | --- |
| `idle` | inicio, `stopped` | `connecting` | Espera orden de conectar |
| `connecting` | `idle`, `waiting_host`, `reconnecting` | `connected`, `waiting_host`, `reconnecting` | Abre la conexión y obtiene el `roomId` |
| `connected` | `connecting` | `reconnecting`, `stopped` | Emite eventos; reinicia el contador de reintentos |
| `waiting_host` | `connecting` | `connecting` | El usuario no está en vivo; reintenta cada 30 s |
| `reconnecting` | `connected`, `connecting` | `connecting` | Espera con backoff exponencial y jitter |
| `stopped` | cualquiera | `idle` | Cierre ordenado pedido por el usuario o por fin de live |

**Reintentos**

```ts
// delay = min(maxDelay, base * 2^attempt) + random(0, jitter)
const delay = Math.min(30_000, 1_000 * 2 ** attempt) + Math.random() * 500;
```

- Base 1 s, tope 30 s, jitter hasta 500 ms; el contador se reinicia tras 60 s de conexión estable.
- Errores se clasifican: *host offline* (reintento lento), *red* (backoff), *protocolo/firma* (alerta al dashboard y reintento limitado), *cancelación* (no reintenta).
- Cada transición emite `connector.status` al dashboard.

**Normalización**

- Un `EventMapper` por tipo de evento convierte el objeto crudo de la librería en un `LiveEvent` validado con Zod; si la validación falla, el evento se descarta y se cuenta en una métrica.
- El mapeo es una función pura `map(raw): LiveEvent | null`; no accede a base de datos ni reloj.
- El adaptador es el único lugar que conoce los nombres de eventos y campos de la librería.

**Deduplicación**

- Se usa el `msgId` del mensaje cuando existe como `dedupeKey`; un conjunto LRU en memoria (por ejemplo 5 000 claves) filtra repetidos, y el índice único en SQLite protege tras un reinicio.
- Los eventos sin `msgId` (likes agregados, conteo de espectadores) no se deduplican; son idempotentes por diseño.

**Consolidación de rachas de regalos**

Los regalos con racha emiten eventos repetidos con cantidad creciente. La consolidación se hace en una clase pura `GiftStreakAggregator` con reloj inyectado:

```ts
export class GiftStreakAggregator {
  private readonly open = new Map<string, OpenStreak>();

  constructor(
    private readonly clock: Clock,
    private readonly idleMs = 3_000,
  ) {}

  ingest(g: RawGift): GiftEvent | null {
    if (!g.streakable) return this.toEvent(g, g.quantity);   // se emite de inmediato
    const key = `${g.userId}:${g.giftId}`;
    this.open.set(key, { last: g, updatedAt: this.clock.now() });
    return g.streakEnded ? this.close(key) : null;           // cierra al terminar la racha
  }

  flushIdle(): GiftEvent[] {                                  // llamado por un temporizador
    const out: GiftEvent[] = [];
    for (const [key, s] of this.open) {
      if (this.clock.now() - s.updatedAt >= this.idleMs) out.push(this.close(key)!);
    }
    return out;
  }
  // close() y toEvent() construyen el GiftEvent con isStreakFinal = true
}
```

- Si la racha no recibe señal de fin, se cierra tras 3 s sin actualizaciones.
- Para alertas inmediatas durante una racha larga, la regla puede suscribirse también a eventos parciales (`isStreakFinal = false`), pero los rankings solo suman el final.

**Likes y espectadores**

- `LikeEvent.likeDelta` se calcula por diferencia contra el `totalLikes` reportado; si el total retrocede, se descarta el delta negativo.
- Los likes se agrupan en ventanas de 1 s antes de entrar al motor de reglas para no saturarlo.
- El conteo de espectadores es un evento de estado: se conserva solo el último valor.

**Fin de transmisión**

- Al recibir el evento de fin o tras `N` reintentos sin que el host vuelva, se cierra la `LiveSession` y se actualiza `ended_at`.

**Grabación y reproducción**

- Un modo `record` guarda los eventos crudos (JSONL) de un live real; el modo `replay` los reproduce a velocidad configurable. Esos archivos sirven como pruebas de regresión del mapeo cuando TikTok cambie su protocolo.

**Pruebas**

- Pruebas unitarias del `EventMapper`, `GiftStreakAggregator` y backoff con reloj falso.
- Prueba de contrato: el adaptador real y el simulador cumplen la misma suite de comportamiento del puerto.

## 9. Módulo Motor de reglas y acciones

El motor evalúa cada `LiveEvent` contra las reglas activas y produce acciones que se encolan por pantalla. Es el núcleo del dominio y no depende de Fastify, SQLite ni WebSocket: recibe puertos por constructor.

**Pipeline de procesamiento**

1. **Matcher:** selecciona reglas cuyo `trigger` coincide con el tipo de evento.
2. **Evaluador de condiciones:** aplica todas las condiciones de la regla (AND).
3. **Limitador:** comprueba cooldown global, cooldown por usuario y probabilidad.
4. **Planificador:** según `mode`, elige todas las acciones o una al azar.
5. **Resolución de plantillas:** sustituye variables como `{nickname}`, `{giftName}`, `{quantity}`.
6. **Cola por pantalla:** inserta cada acción en la cola de su destino con prioridad.
7. **Despachador:** envía la acción por WebSocket y espera `action.done` o agota el tiempo.

**Regla de ejemplo (JSON versionado)**

```json
{
  "schemaVersion": 1,
  "name": "Rosa grande",
  "trigger": "gift",
  "conditions": [
    { "type": "giftName", "op": "eq", "value": "Rose" },
    { "type": "quantity", "op": "gte", "value": 10 }
  ],
  "mode": "all",
  "cooldownMs": 5000,
  "userCooldownMs": 0,
  "probability": 1,
  "priority": 50,
  "actions": [
    { "type": "playSound", "screen": "audio", "assetId": 12, "volume": 0.8 },
    { "type": "showAlert", "screen": "alerts", "assetId": 31, "text": "{nickname} envió {quantity} {giftName}", "durationMs": 5000 },
    { "type": "speak", "screen": "audio", "text": "Gracias {nickname}", "voice": "es-MX" }
  ]
}
```

**Condiciones (patrón Specification)**

Cada condición es un objeto pequeño que implementa una interfaz común. Agregar una condición nueva no modifica el evaluador.

```ts
export interface Condition {
  readonly type: string;
  isSatisfiedBy(event: LiveEvent, ctx: EvaluationContext): boolean;
}

export class ConditionRegistry {
  private readonly factories = new Map<string, (cfg: unknown) => Condition>();
  register(type: string, factory: (cfg: unknown) => Condition): void {
    this.factories.set(type, factory);
  }
  create(type: string, cfg: unknown): Condition {
    const f = this.factories.get(type);
    if (!f) throw new UnknownConditionError(type);
    return f(cfg);
  }
}
```

| Condición | Aplica a | Parámetros |
| --- | --- | --- |
| `giftName` / `giftId` | gift | operador, valor |
| `diamondsTotal` | gift | `gte`, `lte`, `eq` sobre `diamondValue × quantity` |
| `quantity` | gift | comparador numérico |
| `likesCumulative` | like | múltiplo o umbral (por ejemplo cada 100) |
| `userRole` | todos | follower, subscriber, moderador |
| `keyword` | comment | contiene, empieza con, regex segura |
| `firstTime` | gift, comment | primera acción del espectador en la sesión |

**Acciones (patrón Strategy + registro)**

```ts
export interface ActionHandler<T extends ActionConfig = ActionConfig> {
  readonly type: T['type'];
  plan(config: T, event: LiveEvent): PlannedAction;   // pura: no hace E/S
}

export interface ActionDispatcher {
  dispatch(action: PlannedAction): Promise<ActionResult>;
}
```

| Acción | Destino | Efecto |
| --- | --- | --- |
| `playSound` | audio | Reproduce un asset con volumen y límite de duración |
| `speak` | audio | Lee un texto con TTS |
| `showAlert` | alerts | Muestra imagen/GIF y texto durante `durationMs` |
| `updateGoal` | servidor | Suma progreso a una meta |
| `webhook` | servidor | Llama a una URL HTTP con un cuerpo plantilla |
| `obsScene` (v2) | OBS | Cambia de escena o fuente |
| `keystroke` (v3) | agente local | Envía teclas a la PC de stream |

**Cola de acciones**

| Parámetro | Valor por defecto | Comportamiento |
| --- | --- | --- |
| Concurrencia por pantalla | 1 | Una acción visible o sonando a la vez |
| Orden | prioridad descendente, luego llegada | Mayor prioridad pasa primero |
| Longitud máxima | 50 | Al llenarse, descarta la de menor prioridad y más antigua |
| Tiempo máximo por acción | `durationMs` + 2 s | Sin `action.done`, se marca como fallida y se continúa |
| Desconexión del overlay | reencola hasta 3 veces | Tras 3 fallos se descarta y se registra |
| Comentarios en TTS | límite por segundo y deduplicación de textos repetidos | Evita saturar el audio |

**Limitadores**

- El cooldown global se guarda por `ruleId`; el de usuario por `ruleId:viewerId`. Se mantienen en memoria con expiración y no necesitan persistirse.
- La probabilidad usa un generador inyectable (`Random`) para poder probarlo de forma determinista.

**Aislamiento de fallos**

- Cada acción se ejecuta dentro de su propio `try/catch`; un fallo registra `rule.action_failed` y no bloquea las demás ni la siguiente regla.
- Una regla mal formada se desactiva automáticamente y se notifica al dashboard.

**Recarga en caliente**

- Al guardar una regla, el servidor reconstruye su representación compilada y la intercambia de forma atómica; los eventos en curso terminan con la versión anterior (`version` en la tabla `rule`).

**Pruebas**

- Una prueba por condición y por acción con eventos de ejemplo.
- Pruebas de propiedades para el limitador (nunca ejecutar dentro del cooldown).
- Prueba de integración: simulador → motor → cola → despachador falso, verificando orden y prioridad.

## 10. Módulo TTS y audio

El audio se reproduce en la PC de stream, en una pestaña dedicada (`/screen/audio`) cuyo sonido llega al live por la captura de audio del sistema. El servidor decide qué suena y en qué orden; la pestaña solo ejecuta.

**Pestaña de audio**

- Botón "Iniciar audio" obligatorio: los navegadores bloquean la reproducción hasta que hay un gesto del usuario. Al pulsarlo se crea el `AudioContext`, se reanuda y se reproduce un sonido de prueba.
- Cada sonido pasa por un `GainNode` global (volumen maestro) y por un `GainNode` por acción (volumen de la regla).
- Cola local de una sola reproducción simultánea por categoría (`sfx`, `speech`); el servidor garantiza el orden, el cliente evita solapamientos.
- Precarga de los assets más usados con `fetch` + `decodeAudioData` al recibir `config.changed`, para evitar latencia en el primer disparo.
- La lógica de tiempo (esperas, reintentos) vive en el servidor; la pestaña no depende de temporizadores, que el navegador puede ralentizar en segundo plano.
- Cada acción responde `action.done` con la duración real o `action.failed` con el motivo.

```ts
export interface AudioPlayer {
  play(asset: AssetRef, opts: { volume: number; maxMs?: number }): Promise<void>;
  stopAll(): void;
}

export interface SpeechSynthesizer {
  speak(text: string, opts: SpeakOptions): Promise<void>;
  cancel(): void;
}
```

**Proveedores de TTS (patrón Strategy)**

| Proveedor | Dónde corre | Ventajas | Límites |
| --- | --- | --- | --- |
| `BrowserSpeechSynthesizer` | Pestaña de audio (Web Speech API) | Sin costo, sin carga en la laptop, latencia baja | Las voces dependen del sistema y navegador de la PC de stream |
| `PiperSynthesizer` | Laptop (proceso externo Piper) | Voz consistente, calidad superior, funciona sin depender de la PC | Consume CPU en la laptop; probar su rendimiento antes de adoptarlo |

- El proveedor se elige por configuración; ambos cumplen `SpeechSynthesizer`, por lo que el motor de reglas no sabe cuál se usa.
- **Flujo Piper:** el servidor ejecuta Piper como proceso hijo con el texto, genera un WAV, lo convierte a un formato ligero y lo sirve como asset temporal. Se cachea por hash `sha256(texto + voz)` con límite de tamaño y expiración.
- **Flujo navegador:** el servidor envía `action.speak` con texto y voz; la pestaña usa `speechSynthesis` y espera el evento `end`. Las voces se leen tras el evento `voiceschanged`.

**Pipeline de moderación y preparación de texto**

Cada comentario pasa por una cadena de filtros antes de llegar a TTS. Cada filtro es una clase pequeña con la interfaz `TextFilter` (`apply(text, ctx): string | null`); devolver `null` descarta el comentario.

| Orden | Filtro | Efecto |
| --- | --- | --- |
| 1 | Normalización | Recorta espacios, colapsa letras repetidas ("holaaaaa" → "holaa") |
| 2 | Enlaces y menciones | Elimina URLs y correos; configurable para leer o no @usuarios |
| 3 | Emojis | Elimina o sustituye por texto corto, según configuración |
| 4 | Lista de bloqueo | Descarta o enmascara términos prohibidos (lista editable) |
| 5 | Límite de longitud | Trunca a N caracteres (por defecto 150) |
| 6 | Spam por usuario | Máximo de lecturas por usuario por minuto |
| 7 | Duplicados | Descarta el mismo texto repetido en una ventana de 30 s |
| 8 | Diccionario de pronunciación | Sustituye siglas o apodos por su forma hablada |

**Quién puede ser leído**

- Filtro configurable por rol: todos, seguidores, suscriptores o una lista permitida.
- Un modo de comando (`!di texto`) permite que solo se lea lo que el espectador pide expresamente.
- Opciones de voz por regla (idioma, velocidad, tono) cuando el proveedor las soporta.

**Mezcla y eco**

- Volúmenes por defecto: efectos 0.8, voz 1.0, ajustables por regla y por maestro.
- Normalizar los assets (por ejemplo a -16 LUFS) al subirlos para evitar saltos de volumen entre sonidos.
- Usar audífonos durante el live para evitar que el micrófono recapture el audio de la PC.

**Pruebas**

- Pruebas unitarias de cada `TextFilter` y de la cadena completa.
- Prueba manual guiada con una lista de comentarios problemáticos (enlaces, insultos, repeticiones, emojis).
- Medición de CPU de Piper en la laptop durante 30 minutos con comentarios simulados.

## 11. Módulo Leaderboards, metas y estadísticas

Los tres se calculan como proyecciones de solo lectura sobre el flujo de eventos: ningún overlay consulta la base de datos directamente. Cada proyección se actualiza de forma incremental al llegar un evento y publica un `snapshot` por WebSocket.

**Métricas y alcances**

| Métrica | Fuente | Fórmula |
| --- | --- | --- |
| `diamonds` | `GiftEvent` finales | `diamondValue × quantity` por espectador |
| `gift_count` | `GiftEvent` finales | Suma de `quantity` por espectador |
| `likes` | `LikeEvent` | Suma de `likeDelta` por espectador |
| `top_gift` | `GiftEvent` | Regalo individual de mayor valor en el alcance |

| Alcance | Clave en `leaderboard_total.scope` | Reset |
| --- | --- | --- |
| Sesión | `session:<id>` | Automático al iniciar una nueva `LiveSession` |
| Semana | `week:<aaaa-ww>` | Cambia sola al empezar la semana ISO |
| Total | `total` | Solo manual, con confirmación |

**Puerto de la proyección**

```ts
export interface LeaderboardProjection {
  apply(event: LiveEvent): void;                                  // actualiza acumulados
  top(metric: Metric, scope: Scope, limit: number): LeaderboardRow[];
  reset(scope: Scope): void;
}

export interface LeaderboardRow {
  readonly rank: number;
  readonly viewerId: number;
  readonly nickname: string;
  readonly avatarUrl?: string;
  readonly value: number;
}
```

**Persistencia y consulta**

- `apply` ejecuta, en la misma transacción que guarda el evento, un `INSERT … ON CONFLICT(viewer_id, scope, metric) DO UPDATE SET value = value + :delta` por cada alcance activo (sesión, semana, total).
- Consulta del top-N, apoyada en el índice `ix_lb_rank`:

```sql
SELECT v.id, v.nickname, v.avatar_url, t.value
FROM leaderboard_total t
JOIN viewer v ON v.id = t.viewer_id
WHERE t.scope = :scope AND t.metric = :metric
ORDER BY t.value DESC, v.id ASC
LIMIT :limit;
```

- Desempate: mayor valor primero; ante empate, el espectador que llegó antes (menor `id`). El orden es determinista para que dos clientes muestren lo mismo.
- Se mantiene una caché en memoria del top-N por métrica y alcance, invalidada por `apply`, para no consultar SQLite en cada cuadro de animación.

**Publicación de actualizaciones**

- `leaderboard.snapshot` se emite con *debounce* de 250 ms por canal para no inundar a los overlays durante rachas de regalos.
- El payload incluye el top-N completo y la versión (`seq`), de modo que el overlay descarta snapshots viejos si llegan desordenados.
- Los cambios de posición se animan en el cliente comparando el snapshot anterior con el nuevo; el servidor no calcula animaciones.

**Privacidad y filtros**

- Opción para ocultar usuarios específicos de los rankings (lista de exclusión).
- Opción de mostrar solo el alias (`unique_id`) o el apodo.
- Los espectadores anónimos o sin identificador se agrupan o se omiten, según configuración.

**Metas (Goals)**

- Una meta define `metric`, `target`, `scope` y acciones al cumplirse.
- Estados: `active` → `reached` → (`repeating` si está configurada con `repeat`, que crea la siguiente meta con `target × k`).
- La acción `on_reach` se ejecuta una sola vez; una restricción de unicidad por `(goalId, cycle)` evita duplicados ante reinicios.
- `goal.progress` envía `{ current, target, ratio, cycle }` con el mismo *debounce* de 250 ms.

**Estadísticas (Stats)**

| Dato | Origen | Actualización |
| --- | --- | --- |
| Espectadores actuales | `ViewerCountEvent` | Último valor |
| Pico de espectadores | Máximo de la sesión | Al recibir cada conteo |
| Likes totales | `LikeEvent.totalLikes` | Último valor reportado |
| Diamantes de la sesión | Suma de regalos finales | Incremental |
| Nuevos seguidores | `FollowEvent` | Contador |
| Duración del live | `LiveSession.started_at` | Calculada en el cliente |
| Último regalo / último seguidor | Eventos recientes | Último elemento |

**Rotator**

Una sola URL (`/overlay/rotator?config=<id>`) alterna paneles según una configuración:

```json
{
  "schemaVersion": 1,
  "transition": "fade",
  "panels": [
    { "type": "leaderboard", "metric": "diamonds", "scope": "session", "limit": 5, "durationMs": 12000 },
    { "type": "leaderboard", "metric": "likes", "scope": "session", "limit": 5, "durationMs": 12000 },
    { "type": "goal", "goalId": 1, "durationMs": 8000 },
    { "type": "stats", "fields": ["viewers", "likes", "diamonds"], "durationMs": 8000 }
  ]
}
```

- El rotator mantiene un único WebSocket y un único árbol DOM; cambia de panel por CSS, sin recargar la página. Esto reduce el consumo frente a usar varias fuentes de navegador.
- Los paneles son módulos que implementan `OverlayPanel` (`mount`, `update`, `unmount`); agregar un panel nuevo no modifica el rotator.

**Pruebas**

- Pruebas unitarias de `apply` con secuencias de regalos y likes, incluyendo empates y resets.
- Prueba de consistencia: la suma de `leaderboard_total` por métrica coincide con la suma de `live_event` del alcance.
- Prueba de carga: 1 000 eventos por segundo simulados sin que el top-N se desfase más de 500 ms.

## 12. Overlays

Cada overlay es una página estática servida por el backend, con fondo transparente y configuración por parámetros de URL. Se agregan a TikTok LIVE Studio como fuente de tipo Link (por confirmar en tu versión) o a OBS como Browser Source, con la misma URL.

**Catálogo de overlays**

| Ruta | Propósito | Parámetros principales |
| --- | --- | --- |
| `/screen/audio` | Reproduce sonidos y TTS; sin elementos visuales | `key`, `master` (volumen), `debug` |
| `/screen/alerts` | Alertas visuales (imagen/GIF + texto) | `key`, `position`, `scale`, `font`, `debug` |
| `/overlay/leaderboard` | Ranking de regalos o likes | `key`, `metric`, `scope`, `limit`, `theme`, `font` |
| `/overlay/goal` | Barra de meta | `key`, `goalId`, `theme`, `showNumbers` |
| `/overlay/stats` | Espectadores, likes, diamantes | `key`, `fields`, `layout`, `theme` |
| `/overlay/ticker` (v2) | Texto desplazable | `key`, `speed`, `source` |
| `/overlay/rotator` | Varios paneles en una sola URL | `key`, `config` |

El `key` es el token de solo lectura descrito en la sección 7. Todos los parámetros tienen un valor por defecto razonable y se validan con Zod; un valor inválido se reemplaza por el defecto y se muestra un aviso cuando `debug=1`.

**Configurador de URLs**

- El dashboard genera la URL final con vista previa en vivo y un botón de copiar. Así no se editan parámetros a mano.
- Los presets de tema (colores, tipografía, tamaño) se guardan en `app_setting` y se referencian por nombre.

**Estructura del paquete de overlays**

```
packages/overlays/
  src/
    core/            # cliente WS con reconexión, store, validación de mensajes
      ws-client.ts
      store.ts
    panels/          # un módulo por panel (implementa OverlayPanel)
      leaderboard.ts
      goal.ts
      stats.ts
    screens/         # puntos de entrada por ruta
      audio.ts
      alerts.ts
      rotator.ts
    styles/          # CSS con variables de tema
  vite.config.ts
```

**Comportamiento común**

- **Conexión:** WebSocket con reconexión exponencial y reenvío de `client.hello`; al reconectar recibe un `snapshot` completo antes de los deltas.
- **Transparencia:** `html, body { background: transparent; }`, sin barras de scroll y con `overflow: hidden`.
- **Tamaño:** layout fluido en `vw`/`vh` y un parámetro `scale` para ajustar sin recompilar.
- **Estado de conexión:** un indicador discreto solo con `debug=1`.
- **Caché:** los assets estáticos se sirven con hash en el nombre y `Cache-Control: immutable`; el HTML con `no-cache`.

**Presupuesto de rendimiento (PC de stream)**

| Métrica | Objetivo |
| --- | --- |
| JavaScript por overlay | Menos de 50 KB comprimido |
| Memoria por pestaña | Menos de 100 MB |
| Animaciones | Solo `transform` y `opacity` (aceleradas por GPU) |
| Imágenes animadas | WebP o WebM de tamaño acotado; evitar GIF pesados |
| Fotogramas | Sin bucles `requestAnimationFrame` cuando no hay animación activa |
| Fuentes | Fuentes del sistema o una sola web font precargada |

- Usar el rotator en lugar de varias fuentes sueltas para reducir procesos de navegador dentro de LIVE Studio u OBS.
- Limitar el tamaño máximo de assets al subirlos (por ejemplo 2 MB para audio y 5 MB para imágenes) y rechazar los que excedan.

**Overlay de alertas**

- Muestra una alerta a la vez; el orden y los tiempos los define el servidor (`action.show_alert` con `durationMs`).
- Animación de entrada y salida en CSS; al terminar, envía `action.done`.
- Plantillas de texto con variables ya resueltas por el servidor; el cliente solo escapa el HTML (nunca inserta texto con `innerHTML`).

**Seguridad en el cliente**

- Todo texto de espectadores (apodos, comentarios) se inserta con `textContent`, nunca como HTML, para evitar inyección de código en el overlay.
- La política `Content-Security-Policy` de las páginas permite solo orígenes propios.
- Las URLs de avatar remotas se cargan con `referrerpolicy="no-referrer"` y tienen una imagen de reserva.

**Pruebas**

- Pruebas de componentes de cada panel con datos de ejemplo.
- Pruebas con Playwright: cargar cada overlay contra el simulador y comparar capturas.
- Verificación manual en LIVE Studio de que cada ruta carga y mantiene el fondo transparente.

## 13. Dashboard (Angular)

El dashboard es la consola de operación: conecta el live, edita reglas y assets, configura overlays y permite ensayar con el simulador. Se sirve como archivos estáticos desde el mismo backend, por lo que no requiere otro servidor.

**Pantallas**

| Pantalla | Función | Requisitos relacionados |
| --- | --- | --- |
| Estado | Conectar/desconectar, @usuario, estado del conector, salud del sistema, estado de las pantallas conectadas | RF-01, RF-02, RNF-10 |
| Eventos en vivo | Feed filtrable de eventos y de reglas ejecutadas, con búsqueda | RF-01, RF-05 |
| Reglas | Lista, editor, activar/desactivar, probar, duplicar | RF-05 a RF-09 |
| Assets | Subir, previsualizar y eliminar audios e imágenes | RF-19 |
| Rankings y metas | Ver rankings, crear metas, reiniciar alcances | RF-12 a RF-15 |
| Overlays | Configurador con vista previa y generación de URLs | RF-16, RF-17 |
| TTS | Proveedor, voz, filtros, lista de bloqueo, quién se lee | RF-10, RF-11 |
| Simulador | Disparar eventos sintéticos y secuencias grabadas | RF-04 |
| Ajustes | Contraseña, token de overlays, respaldos, import/export | RF-26, RNF-07 |

**Arquitectura del frontend**

- Angular con componentes *standalone*, estrategia `OnPush` y *signals* para el estado; sin NgModules.
- Organización por funcionalidades (*feature folders*) con carga diferida de rutas.
- Separación entre componentes inteligentes (orquestan datos) y de presentación (solo `input`/`output`).
- Los tipos de contratos se importan de `packages/contracts`; no se redefinen en el frontend.

```
apps/dashboard/src/app/
  core/              # ApiClient, AdminSocketService, AuthGuard, interceptores
  shared/            # componentes de presentación y pipes reutilizables
  features/
    status/
    live-feed/
    rules/
      rule-list.page.ts
      rule-editor.page.ts
      rule-editor.store.ts
    assets/
    leaderboards/
    overlays/
    tts/
    simulator/
    settings/
  app.routes.ts
```

**Servicios clave**

```ts
@Injectable({ providedIn: 'root' })
export class AdminSocketService {
  private readonly socket$ = webSocket<WsEnvelope>(this.url);
  readonly connectorStatus = signal<ConnectorStatus>('idle');
  readonly events = signal<readonly LiveEvent[]>([]);   // buffer circular de 500
  // reconexión con retry exponencial; valida cada mensaje con los esquemas Zod
}
```

- `ApiClient` envuelve `HttpClient`, tipa las respuestas con los contratos y traduce errores `problem+json` a un modelo propio.
- Un interceptor agrega manejo de sesión expirada y notificaciones de error no esperado.

**Editor de reglas**

- Formularios reactivos tipados (`FormGroup` con tipos estrictos) generados a partir del esquema Zod; las condiciones y acciones se agregan como filas dinámicas.
- Cada tipo de condición o acción tiene su propio subformulario (componente), registrado en un mapa; agregar uno nuevo no modifica el editor.
- Vista previa en JSON de la regla resultante y botón *Probar*, que llama a `POST /rules/:id/test` con un evento de ejemplo.
- Validación en cliente con el mismo esquema que el servidor; los errores se muestran junto al campo.
- Aviso si dos reglas pueden dispararse con el mismo evento y el mismo destino (colisión de prioridades).

**Simulador**

- Plantillas de eventos editables (regalo con diamantes y cantidad, ráfaga de likes, comentario con texto).
- Secuencias: reproducir un JSONL grabado a velocidad ×1, ×2 o ×10.
- Un botón de "prueba completa" dispara regalo, like y comentario falsos para validar audio y overlays antes de salir en vivo.

**Estado de la aplicación**

- Estado local por *store* de funcionalidad con *signals* (`rule-editor.store.ts`), sin librería de estado global; el estado compartido se limita al socket y a la sesión.
- Los cambios se envían al servidor mediante comandos explícitos; la UI se actualiza al recibir el evento de confirmación (`config.changed`), no de forma optimista, para evitar divergencias.

**Calidad y accesibilidad**

- Presupuestos de build en `angular.json` (por ejemplo, inicial menor a 500 KB comprimido).
- Navegación por teclado, etiquetas asociadas a campos y contraste AA.
- Textos en español en archivos de traducción para poder cambiarlos sin tocar los componentes.

**Pruebas**

- Pruebas unitarias de stores y servicios; pruebas de componentes de presentación con datos de ejemplo.
- Pruebas de extremo a extremo (Playwright): crear una regla, simular un regalo y verificar la alerta.

## 14. SOLID, Clean Code y Clean Architecture

Estas reglas son criterios de revisión de código obligatorios: un cambio que las viola se corrige antes de fusionarse. Cada principio se traduce a una decisión concreta del proyecto.

**Arquitectura en capas y regla de dependencia**

| Capa | Contiene | Puede depender de |
| --- | --- | --- |
| `domain` | Entidades, objetos de valor, reglas de negocio, eventos | Nada (solo TypeScript) |
| `application` | Casos de uso, puertos (interfaces), servicios de aplicación | `domain` |
| `infrastructure` | Adaptadores: TikTok, SQLite, WebSocket, Piper, sistema de archivos | `application`, `domain` |
| `interface` | Controladores HTTP/WS, esquemas de entrada y salida | `application` |
| `main` (composition root) | Ensambla dependencias y arranca | Todas |

- Las dependencias apuntan siempre hacia adentro. `domain` nunca importa Fastify, Kysely, `ws` ni la librería de TikTok.
- Se verifica en CI con `dependency-cruiser`; una importación que rompa la regla falla el build.

**SOLID aplicado**

| Principio | Cómo se aplica aquí | Ejemplo |
| --- | --- | --- |
| **S**: Responsabilidad única | Una clase, una razón para cambiar | `GiftStreakAggregator` solo consolida rachas; `EventMapper` solo traduce; `RuleMatcher` solo selecciona reglas |
| **O**: Abierto/cerrado | Se extiende registrando piezas, no editando el núcleo | Nuevas condiciones y acciones se agregan en `ConditionRegistry` y `ActionHandlerRegistry`; el evaluador no cambia |
| **L**: Sustitución de Liskov | Toda implementación cumple el contrato del puerto | `TikTokLiveConnectorAdapter` y `SimulatedSource` pasan la misma suite de contrato de `LiveEventSource` |
| **I**: Segregación de interfaces | Puertos pequeños y específicos | `EventPublisher`, `RuleRepository` y `LeaderboardReader` son interfaces separadas; un consumidor no depende de métodos que no usa |
| **D**: Inversión de dependencias | El núcleo depende de abstracciones; los detalles se inyectan | `RuleEngine` recibe `Clock`, `Random`, `ActionDispatcher` y `RuleRepository` por constructor |

**Composition root**

Un único archivo ensambla todo; el resto del código no usa `new` sobre dependencias externas.

```ts
// main/composition-root.ts
export function buildApp(cfg: AppConfig): App {
  const clock = new SystemClock();
  const db = openDatabase(cfg.dbPath);
  const rules = new SqliteRuleRepository(db);
  const leaderboards = new SqliteLeaderboardProjection(db);
  const sockets = new ScreenSocketHub();
  const dispatcher = new SocketActionDispatcher(sockets);
  const engine = new RuleEngine({ rules, dispatcher, clock, random: new CryptoRandom() });
  const source: LiveEventSource = cfg.simulate
    ? new SimulatedSource(clock)
    : new TikTokLiveConnectorAdapter(cfg.tiktok);
  const ingest = new IngestLiveEvent({ source, engine, leaderboards, events: new SqliteEventStore(db), clock });
  return new App({ ingest, http: buildHttpServer({ rules, leaderboards, sockets }) });
}
```

**Ejemplo: de una función que hace todo a piezas con una responsabilidad**

```ts
// Evitar: mezcla parseo, regla de negocio, base de datos y red
async function onGift(raw: any) {
  const v = await db.query('SELECT ...');
  if (raw.giftName === 'Rose' && raw.repeatCount >= 10) ws.send(JSON.stringify({ sound: 'rose.mp3' }));
  await db.exec('UPDATE ...');
}

// Preferir: cada paso en su componente
const event = mapper.map(raw);                 // traducción pura
if (!event) return;
await events.save(event);                      // persistencia
leaderboards.apply(event);                     // proyección
await engine.handle(event);                    // reglas y acciones
```

**Clean Code: reglas del equipo**

- **Nombres que revelan intención:** `isStreakFinal`, no `flag2`; verbos para funciones (`resolveTemplate`), sustantivos para clases (`RuleMatcher`). Sin abreviaturas ambiguas.
- **Funciones pequeñas:** una sola tarea, idealmente menos de 20 líneas y máximo 3 parámetros; si hay más, se agrupa en un objeto de opciones con nombre.
- **Sin números ni cadenas mágicas:** constantes nombradas (`STREAK_IDLE_MS = 3_000`) o configuración tipada.
- **Comentarios:** explican el porqué, no el qué. El código claro no necesita comentar lo obvio; los comentarios obsoletos se eliminan.
- **Manejo de errores:** errores de dominio como clases (`UnknownConditionError`), nunca cadenas; no se tragan excepciones; los límites del sistema (HTTP, WS, TikTok) validan y traducen.
- **Inmutabilidad:** eventos y objetos de valor son `readonly`; se prefiere devolver valores nuevos a mutar parámetros.
- **Funciones puras donde sea posible:** mapeo, evaluación de condiciones y resolución de plantillas no tienen efectos secundarios y se prueban sin mocks.
- **Sin `any`:** `unknown` en los bordes y validación con Zod; `@typescript-eslint/no-explicit-any` en modo error.
- **Composición sobre herencia:** la herencia se reserva para jerarquías de errores; el comportamiento compartido se inyecta.
- **Ley de Demeter y *Tell, don't ask*:** un componente habla con sus colaboradores directos y les pide acciones en lugar de inspeccionar su estado.
- **DRY con criterio:** se extrae duplicación después de la tercera repetición; se evita abstraer antes de entender el patrón.
- **KISS y YAGNI:** no se implementa una función de v2 o v3 dentro de v1; se deja el puerto o el punto de extensión, no el código.
- **Un nivel de abstracción por función:** una función de orquestación no manipula detalles de bajo nivel.
- **Cohesión por módulo:** el código que cambia junto vive junto (por funcionalidad, no por tipo técnico).

**Patrones de diseño permitidos**

| Patrón | Uso en el proyecto |
| --- | --- |
| Strategy | Proveedores de TTS, manejadores de acción |
| Registry / Factory | Creación de condiciones y acciones desde JSON |
| Specification | Condiciones composables de las reglas |
| Adapter | Conector de TikTok, SQLite, Piper, obs-websocket |
| Observer (publicación/suscripción) | Bus de eventos interno |
| Repository | Acceso a reglas, assets, metas, espectadores |
| Projection (CQRS ligero) | Rankings y estadísticas como lecturas derivadas |
| State | Máquina de estados del conector |

No se introducen patrones sin una necesidad demostrada en el código; cada patrón de la tabla ya está justificado por un requisito de este documento.

**Lista de verificación de revisión de código**

- [ ] La función o clase tiene una sola responsabilidad.
- [ ] Las dependencias se reciben por constructor y están tipadas por interfaz.
- [ ] No hay `any`, `console.log` ni números mágicos.
- [ ] Los errores se manejan y se registran con contexto.
- [ ] Hay pruebas para el comportamiento nuevo y para el caso de error.
- [ ] El dominio no importa infraestructura (verificado por CI).
- [ ] Los nombres se entienden sin leer la implementación.
- [ ] El cambio es pequeño y enfocado en un solo objetivo.

## 15. Repositorio, convenciones y calidad

**Estructura del monorepo (npm workspaces)**

```
tiklive/
  apps/
    server/                 # backend Node + TypeScript
      src/
        domain/             # entidades, objetos de valor, reglas puras
        application/        # casos de uso y puertos
        infrastructure/     # tiktok/, sqlite/, ws/, piper/, obs/
        interface/          # http/ y ws/ (controladores, esquemas)
        main/               # composition-root.ts, index.ts
      migrations/           # 0001_init.sql, ...
      test/                 # integración y contrato
    dashboard/              # Angular
  packages/
    contracts/              # esquemas Zod y tipos compartidos
    overlays/               # pantallas y paneles (Vite)
  tools/
    simulate.ts             # CLI del simulador
    record.ts               # grabación de eventos crudos
  docs/
    adr/                    # decisiones de arquitectura
    runbook.md              # operación y recuperación
  .github/workflows/ci.yml
  package.json
  tsconfig.base.json
```

**Configuración de TypeScript**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true
  }
}
```

**Convenciones de código**

| Aspecto | Convención |
| --- | --- |
| Archivos | `kebab-case`; sufijo por rol: `.adapter.ts`, `.repository.ts`, `.handler.ts`, `.spec.ts` |
| Clases y tipos | `PascalCase`; interfaces sin prefijo `I` |
| Funciones y variables | `camelCase`; booleanos con prefijo `is`, `has`, `can` |
| Constantes | `UPPER_SNAKE_CASE` solo para constantes de módulo inmutables |
| Exportaciones | Exportaciones con nombre; `default` solo donde lo exige el framework |
| Importaciones | Absolutas por alias de paquete; ciclos prohibidos (`dependency-cruiser`) |
| Idioma | Código, identificadores y commits en inglés; documentación y textos de UI en español |
| Fechas | Epoch ms en UTC dentro del sistema; formato local solo en la UI |
| Asincronía | `async/await`; promesas siempre manejadas (`no-floating-promises`) |

**Reglas de lint relevantes**

- `@typescript-eslint/no-explicit-any`, `no-floating-promises`, `no-misused-promises`, `consistent-type-imports`: error.
- `complexity` (máximo 10) y `max-lines-per-function` (máximo 40): advertencia que bloquea en CI.
- `no-console`: error en el servidor (se usa el logger).
- Regla de capas con `dependency-cruiser`: `domain` no importa `infrastructure` ni `interface`.

**Flujo de trabajo con Git**

- Ramas cortas desde `main` (`feat/…`, `fix/…`, `chore/…`); fusión por *pull request* con CI en verde, aunque trabajes solo.
- Mensajes con Conventional Commits: `feat(rules): add cooldown per user`. Esto permite generar el changelog y el número de versión (SemVer) automáticamente.
- Etiquetas `vX.Y.Z` por release; el artefacto de despliegue lleva esa versión.
- Cada decisión importante se registra en `docs/adr/NNNN-titulo.md` (contexto, decisión, consecuencias).

**Estrategia de pruebas**

| Nivel | Herramienta | Qué cubre | Objetivo |
| --- | --- | --- | --- |
| Unitarias | Vitest | Dominio puro: mapeo, condiciones, limitador, agregador, filtros TTS | Cobertura de dominio mayor al 80 % |
| Contrato | Vitest | Cada implementación de puerto cumple la misma suite (`LiveEventSource`, `SpeechSynthesizer`) | 100 % de los puertos |
| Integración | Vitest + SQLite en memoria | Repositorios, migraciones, proyecciones, flujo simulador→motor→cola | Casos críticos |
| Componentes | Vitest + testing de Angular | Stores y componentes de presentación | Lógica no trivial |
| Extremo a extremo | Playwright | Dashboard + overlays contra el simulador | 5 a 8 recorridos clave |
| Carga | Script propio | 1 000 eventos/s sin pérdida ni desfase mayor a 500 ms | Antes de cada release |
| Regresión del conector | Reproducción de JSONL grabado | Mapeo de eventos reales | Antes de actualizar la librería |

- **Reloj y aleatoriedad inyectados** (`Clock`, `Random`): ninguna prueba depende de `Date.now()` ni de `Math.random()`.
- **Datos de prueba** con constructores (*builders*) tipados; no se copian eventos a mano en cada prueba.
- **Nombres de pruebas** en formato *dado/cuando/entonces*: `given a gift streak, when idle 3s, then emits final event`.

**Pipeline de CI (GitHub Actions)**

```yaml
name: ci
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run depcheck      # dependency-cruiser
      - run: npm test -- --coverage
      - run: npm run build
      - run: npm run e2e
```

**Definition of Done**

- [ ] Cumple los criterios de aceptación del requisito (RF/RNF).
- [ ] Pruebas nuevas en verde y cobertura del dominio sin bajar del umbral.
- [ ] Lint, tipos y regla de capas sin errores.
- [ ] Contratos actualizados y versionados si cambiaron.
- [ ] Documentación y `runbook` actualizados cuando cambia la operación.
- [ ] Probado con el simulador y, si toca audio u overlays, en LIVE Studio.

**Entorno de desarrollo**

- Scripts: `npm run dev` (backend con recarga), `npm run dev:dashboard`, `npm run simulate`, `npm run record -- @usuario`.
- `.nvmrc` fija la versión de Node; `.env.example` documenta las variables.
- Datos de semilla (`npm run seed`) con reglas de ejemplo, assets de prueba y una sesión simulada.

## 16. Observabilidad, seguridad y resiliencia

**Observabilidad**

- **Logs estructurados (Pino, JSON)** con campos fijos: `ts`, `level`, `module`, `msg`, `eventId`, `ruleId`, `screenId`, `durationMs`. El `eventId` permite seguir un evento desde su recepción hasta su acción ejecutada.
- **Niveles:** `error` (acción fallida o excepción), `warn` (mensaje inválido, reintento), `info` (conexión, regla ejecutada), `debug` (detalle, apagado por defecto).
- **Redacción:** nunca se registran contraseñas, tokens ni textos completos de comentarios en nivel `info`.
- **Métricas internas** expuestas en `GET /health` y, opcionalmente, en `/metrics` (formato Prometheus):

| Métrica | Tipo | Uso |
| --- | --- | --- |
| `events_received_total{type}` | contador | Volumen por tipo de evento |
| `events_dropped_total{reason}` | contador | Validación fallida, duplicados |
| `connector_state` | indicador | Estado de la máquina del conector |
| `connector_reconnects_total` | contador | Estabilidad de la conexión |
| `rule_executions_total{ruleId,result}` | contador | Éxito, fallo, limitada |
| `action_queue_depth{screen}` | indicador | Saturación de la cola |
| `action_latency_ms{type}` | histograma | Del evento a `action.done` |
| `ws_clients{screen}` | indicador | Overlays conectados |
| `process_rss_bytes`, `event_loop_lag_ms` | indicador | Salud del proceso |

- **Respuesta de `/health`:** `{ status, uptimeS, connector, db, screens, queueDepth, version }`; devuelve 503 si la base de datos no responde.
- **Alertas visibles en el dashboard:** conector desconectado más de 30 s, cola mayor a 80 % de su capacidad, overlay de audio desconectado durante un live, disco con menos de 10 % libre.

**Seguridad: modelo de amenazas**

| Activo | Amenaza | Mitigación |
| --- | --- | --- |
| Dashboard | Acceso no autorizado desde la LAN | Contraseña con hash (argon2id), límite de intentos de acceso, cookie `HttpOnly` + `SameSite=Strict`, cierre de sesión por inactividad |
| API REST | CSRF y solicitudes cruzadas | `SameSite=Strict`, verificación de `Origin`, sin CORS abierto |
| Overlays | Uso de la URL por terceros | Token de solo lectura rotable; escucha solo en LAN |
| Overlays | Inyección de HTML con apodos o comentarios | Texto siempre con `textContent`; CSP restrictiva |
| Subida de archivos | Archivos maliciosos o ruta traversal | Validar tipo por contenido (*magic bytes*), tamaño máximo, renombrar con hash, directorio fuera de la raíz web |
| Acción `webhook` | SSRF hacia la red interna | Lista permitida de hosts, bloqueo de rangos privados salvo los configurados, tiempo de espera y tamaño máximo de respuesta |
| Reglas con regex | Denegación de servicio por expresiones costosas | Biblioteca de regex segura o límite de longitud y tiempo |
| Dependencias | Vulnerabilidades en paquetes | `npm audit` en CI, lockfile versionado, actualizaciones revisadas |
| Secretos | Fuga de credenciales | Variables de entorno con permisos 600; nada en el repositorio |
| Datos de espectadores | Exposición de datos personales | Se guarda solo lo necesario (alias, apodo, avatar, métricas); retención de 90 días para eventos; opción de borrado por espectador |
| Red | Exposición a Internet | Firewall solo a LAN; acceso remoto por VPN o túnel con autenticación |

**Resiliencia y modos degradados**

| Falla | Comportamiento esperado |
| --- | --- |
| Caída de la conexión a TikTok | Reintento con backoff; los overlays conservan el último estado y el dashboard muestra la alerta |
| Overlay de audio desconectado | Las acciones se reencolan hasta 3 veces; se avisa en el dashboard |
| Cola saturada | Se descartan las acciones de menor prioridad y se registra |
| Base de datos no disponible | El sistema sigue sirviendo overlays con datos en memoria y reintenta; `/health` devuelve 503 |
| Excepción no controlada | Registro, cierre ordenado y reinicio automático por systemd |
| Corte de energía | WAL de SQLite preserva los datos confirmados; la sesión se reanuda como nueva al arrancar |
| Webhook lento o caído | Tiempo de espera de 3 s y *circuit breaker* tras 5 fallos seguidos |

**Prácticas de resiliencia**

- **Apagado ordenado:** al recibir `SIGTERM`, el servidor deja de aceptar eventos, vacía la cola con un plazo máximo y cierra la base de datos.
- **Contrapresión:** las colas tienen límite; ante saturación se descarta con política explícita en lugar de crecer sin control.
- **Tiempos de espera** en toda llamada externa; ninguna operación puede bloquear el bucle de eventos.
- **Idempotencia:** el índice único de `dedupe_key` evita doble registro tras un reintento.
- **Migraciones:** idempotentes y transaccionales; el arranque falla de forma explícita si una migración no se puede aplicar.

**Runbook de incidentes (resumen)**

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| No llegan eventos, conector en `waiting_host` | El LIVE aún no está en vivo | Iniciar el live; el conector reintenta solo |
| No llegan eventos, conector en `reconnecting` repetido | Cambio de protocolo de TikTok o bloqueo temporal | Revisar logs; probar con el modo `replay`; actualizar o revertir la versión de la librería |
| Hay eventos pero no suena el audio | Pestaña de audio sin iniciar o desconectada | Pulsar "Iniciar audio"; verificar `ws_clients{screen=audio}` |
| Alertas retrasadas | Cola saturada o laptop sobrecargada | Revisar `action_queue_depth` y CPU; deshabilitar Piper; reducir reglas de likes |
| Panel inaccesible | Servicio caído o firewall | `systemctl status tiklive`; revisar `ufw status` |

## 17. Roadmap por fases

&#91;embedded content: roadmap · 6 fases, 5 puertas\]

Cada fase termina en una puerta con un criterio verificable; no se empieza la siguiente hasta cumplirla. Las duraciones son estimaciones para trabajo a medio tiempo y se ajustan con la medición real de la fase 0.

**Entregables y criterios de aceptación por fase**

| Fase | Entregables | Criterios de aceptación medibles |
| --- | --- | --- |
| 0 | Laptop con SO, Node, systemd y firewall; script de grabación mínimo; checklist de supuestos de la sección 18 | Comentarios y regalos reales de tu live visibles en consola; LIVE Studio carga una URL local con fondo transparente; el audio de una pestaña llega al live; CPU de la laptop medida |
| 1 | Monorepo con CI, paquete `contracts`, dominio, `LiveEventSource` con conector y simulador, normalizador, SQLite con migraciones, pestaña de audio con botón de inicio | Pruebas de dominio con cobertura mayor al 80 %; reconexión tras cortar la red 60 s; una racha de 10 regalos genera 1 evento; el simulador produce sonido en la PC de stream |
| 2 | Motor de reglas, condiciones y acciones, cola con prioridad, limitadores, TTS con filtros, biblioteca de assets, overlay de alertas | Cooldown respetado en pruebas de propiedades; un comentario bloqueado nunca llega al audio; la cola respeta prioridad; ningún evento aceptado se pierde tras reiniciar |
| 3 | Proyecciones, leaderboards de regalos y likes, metas, estadísticas, rotator | El ranking cambia en menos de 1 s tras un regalo; la suma de rankings coincide con los eventos; el reset de sesión no borra el total; 1 000 eventos por segundo sin desfase mayor a 500 ms |
| 4 | Dashboard con todas las pantallas de v1, configurador de overlays, autenticación, respaldos, `/health` y métricas, runbook, despliegue con rollback | Reglas editadas y activas sin reiniciar; reinicio automático en menos de 10 s; restauración de un respaldo probada; 4 horas continuas sin intervención en el ensayo |
| 5 | Módulos de v2 y v3 priorizados según uso real | Cada módulo cumple su criterio de aceptación (RF-20 a RF-27) sin cambios en el núcleo |

**Orden de trabajo dentro de cada fase**

1. Escribir primero las pruebas del comportamiento (contratos y dominio).
2. Implementar el caso de uso con puertos e implementaciones falsas.
3. Implementar el adaptador real y pasar la suite de contrato.
4. Exponer por API y WebSocket; actualizar `contracts`.
5. Probar con el simulador y, al final de la fase, en un live de prueba.
6. Actualizar documentación, ADR y runbook.

## 18. Riesgos y supuestos por verificar

Probabilidad e impacto son estimaciones iniciales (A = alta, M = media, B = baja) y se revisan al cerrar cada fase.

**Riesgos**

| ID | Riesgo | Prob. | Imp. | Mitigación |
| --- | --- | --- | --- | --- |
| R-01 | TikTok cambia su protocolo y el conector deja de funcionar | A | A | Puerto `LiveEventSource` aislado; versión fijada; grabación y reproducción de eventos; plan de actualización tras pruebas |
| R-02 | Acceso no oficial contrario a los términos de TikTok | M | A | Solo lectura de eventos; sin envío de mensajes; uso en cuenta propia; aceptar el riesgo de forma explícita |
| R-03 | El mantenedor de la librería deja de publicar correcciones | M | A | Alternativa documentada (cliente en otro lenguaje o API gestionada como respaldo) detrás del mismo puerto |
| R-04 | La laptop no soporta la carga durante un live | M | M | Medir en la fase 1; Web Speech en lugar de Piper; reducir reglas de likes; límite de cola |
| R-05 | LIVE Studio no acepta una de las fuentes o pierde la transparencia | M | A | Probar en la fase 0; mantener la pestaña de audio como único requisito obligatorio |
| R-06 | Voces de Web Speech inconsistentes entre equipos | M | B | Selector de voz en el dashboard; opción de Piper |
| R-07 | Comentarios ofensivos leídos en voz alta | A | A | Pipeline de moderación obligatorio, lista de bloqueo, modo de lectura solo por comando |
| R-08 | Desfase entre el audio y la imagen en el live | M | B | Latencia de LAN baja; medición de `action_latency_ms`; compensación opcional |
| R-09 | Pérdida de datos por fallo de disco | B | M | Respaldo diario de SQLite y semanal de assets |
| R-10 | Crecimiento de alcance (v2 y v3 invaden v1) | A | M | Criterios de salida por versión; YAGNI como regla de revisión |
| R-11 | Bloqueo temporal de la IP residencial por conexiones repetidas | B | M | Backoff con jitter; evitar reconexiones agresivas; no conectar varias instancias a la vez |
| R-12 | Alertas simultáneas ensucian el live | M | B | Cola con prioridad, límite por segundo y cooldowns por regla |

**Supuestos por verificar antes de la fase 1**

- [ ] TikTok LIVE Studio acepta una URL local como fuente de tipo Link y mantiene el fondo transparente.
- [ ] El audio de una pestaña del navegador llega al live mediante la captura de audio del sistema.
- [ ] La laptop mantiene menos de 25 % de CPU con el conector, el servidor y 100 eventos por segundo simulados.
- [ ] La versión actual de `tiktok-live-connector` funciona sin servicio de firma externo con tu cuenta y red; confirmar en su README si existen límites de uso sin clave.
- [ ] Piper alcanza tiempo real en la laptop con la voz elegida en español.
- [ ] El Wi-Fi o Ethernet entre la laptop y la PC mantiene una latencia menor a 20 ms.
- [ ] La versión mínima de Node que exige el conector es compatible con el Ubuntu elegido.

**Decisiones abiertas**

- ¿El TTS por defecto será Web Speech o Piper? Se decide con la medición de CPU de la fase 1.
- ¿La subasta y la ruleta se implementan como módulos propios o como plantillas de reglas? Se decide al cerrar la v1.
- ¿Se expone el dashboard fuera de la LAN? Por defecto no; si se requiere, solo por VPN.
