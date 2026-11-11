# ADR 0014 — Conexión con Spotify

Fecha: 2026-11-10 · Estado: aceptada (fase 1 de 3 implementada)

## Contexto

El plan (fase 3, overlays) deja pendiente «Spotify» entre los overlays que necesitan una
integración propia. Lo que se espera de ella en un LIVE: mostrar la canción que suena y, después,
que el público pida canciones o las salte con comandos o regalos.

Restricciones de la plataforma de Spotify verificadas el 2026-11-10 (guía oficial *February 2026
Web API Dev Mode Changes* y documentación de *Redirect URIs*):

| Restricción | Efecto en TikLive |
| --- | --- |
| Las apps en modo desarrollo exigen que el **dueño tenga Premium**; si caduca, la app deja de funcionar | El streamer registra su propia app con su cuenta Premium |
| Máximo **5 usuarios** por app en modo desarrollo | Sin efecto: solo se conecta la cuenta del streamer |
| `localhost` ya no se acepta como redirect; HTTP solo con IP de loopback explícita (`http://127.0.0.1:PUERTO`) | El redirect es `http://127.0.0.1:<puerto>/spotify/callback` y debe abrirse en la máquina del servidor |
| Se quitaron endpoints de lote, `browse`, `top-tracks`, campos de `/me` (`product`, `email`…) y `search` baja a 10 resultados | No se usan. Los endpoints de reproducción (`/me/player/*`, cola, saltar) **no** cambiaron |

Alternativas:

| Opción | Resultado |
| --- | --- |
| Authorization Code **con PKCE** y Client ID del propio streamer | Sin secreto que guardar; cumple las reglas de 2026; elegida |
| Authorization Code con Client Secret | Un secreto más en `config.json`/respaldos sin ganancia para una app local |
| Una app de Spotify compartida por TikLive | Límite de 5 usuarios y cuota extendida solo para empresas: no escala |
| Leer la canción de la app de escritorio (título de la ventana) | Frágil, solo Windows, sin cola ni control |

## Decisión

- Ajuste **`spotifyClientId`** (`SPOTIFY_CLIENT_ID`), no secreto, aplicado al instante. Cambiarlo
  invalida la conexión guardada (el token pertenece a la app anterior).
- `SpotifyService` (aplicación) hace el flujo PKCE: `state` aleatorio de un solo uso que caduca a los
  10 min (máx. 5 pendientes), intercambio del código y renovación del token con un solo vuelo a la
  vez. El *refresh token* se guarda en SQLite (`app_setting`, clave `spotify.connection`) junto al
  Client ID con que se emitió; el *access token* solo vive en memoria y se renueva 60 s antes de
  caducar. Un 401 renueva y reintenta una vez; un `invalid_grant` marca la conexión como revocada.
- `SpotifyWebClient` (infraestructura) habla con `accounts.spotify.com` y `api.spotify.com`: tokens
  solo en cabeceras o cuerpo, 8 s de timeout, logs con el estado HTTP y nunca el token ni el cuerpo.
  Solo deja pasar enlaces de `open.spotify.com` e imágenes `https`.
- Rutas:
  - Panel (sesión): `GET /spotify/status`, `POST /spotify/authorize`, `POST /spotify/complete`
    (pegar la URL de vuelta), `DELETE /spotify/connection`, `GET /spotify/now-playing`.
  - Públicas: `GET /spotify/callback` (sin cookie del panel, porque el panel puede estar abierto por
    IP de la LAN; la protege el `state`) y `GET /overlay-data/spotify/now-playing?key=` para el
    overlay.
- «Qué suena» se cachea 2 s para todos los que pregunten y, tras un 429, se sirve la última lectura
  hasta que pase el `Retry-After`.
- Panel → Ajustes → **Spotify**: Client ID, Redirect URI para copiar, «Conectar con Spotify» (abre
  Spotify en otra pestaña y espera la conexión), pegar la URL de vuelta si se aprobó desde otro
  dispositivo, «Ver qué suena» y «Desconectar».

## Plan por fases

1. **Conexión y «qué suena»** — esta ADR, rama `feat/add-spotify-connection`.
2. **Overlay `/overlay/spotify`** (portada, título, artista, barra de progreso extrapolada con
   `fetchedAt`) que consulta `/overlay-data/spotify/now-playing` cada ~5 s, solo mientras está
   abierto; plantilla en la galería de overlays.
3. **Acciones de servidor** `spotifyQueue` y `spotifySkip` — rama
   `feat/add-spotify-song-request-actions`. Se usan en cualquier regla (comentario con «empieza por
   `!sr`», un regalo concreto…) y se ejecutan como `updateGoal`/`webhook`: sin pantalla, sin esperar
   a la red y nunca en «Probar».
   - `spotifyQueue` (`query`, por defecto `{commandArgs}`; `allowExplicit`, por defecto `false`;
     `maxDurationS`, por defecto 600): busca con `market=from_token` y 5 resultados (Spotify admite
     10), elige el primero que no sea explícito (si no se permiten) ni más largo que el máximo y
     llama a `POST /me/player/queue`. Si ninguno sirve no pone nada. `{commandArgs}`/`{comment}`
     pasan por la moderación del TTS (lista de bloqueo incluida) antes de buscar; un `!sr` vacío
     no hace nada.
   - `spotifySkip`: `POST /me/player/next` y olvida la caché de «qué suena».
   - Límites: el enfriamiento por usuario y global de la regla, y además un máximo de 20 llamadas
     de control por minuto en total, para que ninguna regla mal configurada sature la cuenta.
   - Errores: sin dispositivo activo (404), sin Premium o con una conexión anterior a estos
     permisos (403), Spotify sin conectar o el tope por minuto se avisan en el panel
     (`error.reported`, módulo `spotify`); en el directo no se muestra nada.
   - Pendiente: anunciar en pantalla la canción añadida (hoy solo queda en el log).

## Consecuencias

- El *refresh token* entra en los respaldos diarios de la base de datos (locales). Quien tenga un
  respaldo puede leer qué suena y controlar la reproducción de esa cuenta hasta que se quite el
  permiso en Spotify (cuenta → Apps).
- La revocación se detecta al renovar; tras un reinicio, el estado muestra «conectado» hasta la
  primera renovación fallida.
- Si el panel se usa desde otro dispositivo, la vuelta de Spotify a `127.0.0.1` falla en ese
  dispositivo y hay que pegar la URL. Con el túnel público (rama `feat/add-public-tunnel-url-setting`)
  se podría registrar una redirect `https` en su lugar.
- Si el dueño de la app pierde Premium, Spotify rechaza las llamadas y el panel lo muestra como
  error de Spotify.
