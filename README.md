# TikLive

Plataforma local que convierte los eventos de un TikTok LIVE propio (comentarios, regalos, likes,
follows, entradas) en sonidos, voz, alertas y, más adelante, rankings y metas. Corre en una laptop
de la LAN; la PC de stream solo abre una pestaña de audio y las URLs de overlay.

Especificación completa: `Especificación técnica plataforma local de interacción para TikTok LIVE.md`.
Plan y estado por fases: [docs/plan.md](docs/plan.md).

## Requisitos

- Node.js 22 LTS o superior (`.nvmrc`).
- Windows o Linux. `better-sqlite3` usa binarios precompilados.

## Puesta en marcha (desarrollo)

```bash
npm install
npm run build -w @tiklive/overlays
npm run build -w @tiklive/dashboard
npm run seed                # sonido de prueba, reglas y meta de ejemplo
npm run dev                 # servidor en http://localhost:3000
```

Abre `http://localhost:3000/` (redirige al panel `/admin/`). La primera vez el panel pide crear
la contraseña con el **código de configuración** que aparece en la consola del servidor
(`setupCode`). Desde **Ajustes** se editan todas las variables de entorno; lo guardado en el panel
va a `data/config.json` y tiene prioridad sobre `.env`. En **Estado** están las URLs de los overlays
listas para copiar, con la IP de la red local.

Las herramientas de consola (`simulate`, `watch-events`) inician sesión con la contraseña del
panel: en PowerShell, `$env:TIKLIVE_PASSWORD = "tu-contraseña"`.

Luego, en la PC de stream:

1. Abre `http://<ip-laptop>:3000/screen/audio/?key=<OVERLAY_KEY>` y pulsa **Iniciar audio**.
2. Agrega `http://<ip-laptop>:3000/screen/alerts/?key=<OVERLAY_KEY>` como fuente Link (LIVE Studio)
   o Browser Source (OBS). Parámetros: `position=top|center|bottom`, `scale`, `debug=1`.

Overlays de datos (misma `key`; todos aceptan `theme=card|clear|light`, `scale`, `font` y `debug=1`):

| URL | Parámetros |
| --- | --- |
| `/overlay/leaderboard/` | `metric=diamonds\|gift_count\|likes`, `scope=session\|week\|total`, `limit`, `title`, `name=alias` |
| `/overlay/goal/` | `goalId`, `showNumbers=0` |
| `/overlay/stats/` | `fields=viewers,peakViewers,likes,diamonds,newFollowers,duration`, `layout=row\|column` |
| `/overlay/rotator/` | `config=<id>` (se configura con `PUT /api/v1/rotators/<id>`) |

Para ensayar:

```bash
npm run simulate -- full                                  # regalo + likes + comentario
npm run simulate -- gift --user ana --quantity 10 --streak
npm run simulate -- comment --user leo --text "!di hola a todos"
```

Para conectar a un live real: `SIMULATE=false` y `TIKTOK_USERNAME=tu_usuario` en `.env`, o
`POST /api/v1/connector/connect` con `{ "username": "tu_usuario" }`.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor con recarga (tsx) |
| `npm run dev:overlays` | Vite para overlays, con proxy al backend |
| `npm run dev:dashboard` | `ng serve` del panel en :4200, con proxy al backend |
| `npm test` | Vitest (unitarias, contrato, integración, e2e) |
| `npm run lint` · `typecheck` · `depcheck` | ESLint, `tsc`, regla de capas (dependency-cruiser) |
| `npm run build` · `start` | Compila contratos, overlays y servidor; arranca `dist/` |
| `npm run seed` | Datos de ejemplo |
| `npm run simulate -- <tipo>` | CLI del simulador (`replay archivo.jsonl --speed 2` incluido) |
| `npm run load-test -- --rate 1000` | Gate de carga: desfase del ranking frente a 500 ms |

## Estructura

```
apps/server/src/
  domain/          lógica pura: rachas, likes, condiciones, limitador, cola, filtros TTS
  application/     casos de uso y puertos: supervisor del conector, pipeline, motor de reglas
  infrastructure/  adaptadores: tiktok-live-connector, SQLite (Kysely), WebSocket, Pino
  interface/       Fastify: /api/v1 y /ws
  main/            composition root, config, seed
packages/contracts Zod: eventos, mensajes WS, reglas (compartido por servidor y overlays)
apps/dashboard     panel Angular 21 (/admin): dashboard, estado, eventos, reglas, triggers, rankings
                   y metas, assets, overlays, simulador y ajustes. UI con Tailwind v4 y componentes
                   estilo shadcn/ui sobre Angular CDK + Lucide (docs/adr/0010-dashboard-design-system.md)
packages/overlays  pantallas sin framework (Vite): /screen/audio, /screen/alerts, /overlay/*
tools/simulate.ts  CLI del simulador
```

## API

`GET /api/v1/health` · `GET /api/v1/connector` · `POST /api/v1/connector/connect|disconnect` ·
`GET|POST /api/v1/rules` · `GET|PUT|DELETE /api/v1/rules/:id` · `POST /api/v1/rules/:id/test` ·
`GET|POST /api/v1/assets` (multipart) · `DELETE /api/v1/assets/:id` · `GET /api/v1/events/recent` ·
`POST /api/v1/simulator/emit` · `POST /api/v1/queue/clear` ·
`GET /api/v1/leaderboards/:metric?scope=&limit=` · `POST /api/v1/leaderboards/reset` ·
`GET|PUT /api/v1/settings/leaderboard` · `GET|POST /api/v1/goals` · `GET|PUT|DELETE /api/v1/goals/:id` ·
`GET /api/v1/stats` · `GET|PUT /api/v1/rotators/:id`.
Triggers de sonido: `GET /api/v1/sounds/search?q=&page=` · `GET|POST /api/v1/triggers` ·
`GET|PUT|DELETE /api/v1/triggers/:id` · `POST /api/v1/triggers/:id/test`. Solo se guardan metadatos y la
URL del MP3 de MyInstants; el navegador (pestaña de audio) lo reproduce directamente. La búsqueda usa
la API comunitaria no oficial `MYINSTANTS_API_URL` (ver `.env.example`).
WebSocket: `/ws/screen/:screenId?key=` (overlays) y `/ws/admin` (dashboard).

Autenticación: `GET /api/v1/auth/status` · `POST /api/v1/auth/setup|login|logout|password`.
Ajustes: `GET|PATCH /api/v1/settings` · `POST /api/v1/settings/restart` ·
`POST /api/v1/settings/overlay-key/rotate` · `GET|PUT /api/v1/settings/moderation` ·
`GET /api/v1/settings/addresses`. Todo `/api/v1` (salvo `health` y `auth`) y `/ws/admin` exigen sesión.

> **Seguridad:** contraseña argon2id, cookie `HttpOnly` + `SameSite=Strict`, bloqueo tras 5
> intentos fallidos y verificación de origen. Aun así, expón el puerto solo en la LAN (sección 4
> de la especificación); el panel se sirve por http.
