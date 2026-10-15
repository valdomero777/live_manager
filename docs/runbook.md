# Runbook de incidentes

Guía para actuar **durante un live**. Primero estabiliza (que el live siga), después diagnostica.
Complementa a [operacion.md](operacion.md) (respaldos, `/health`, `/metrics`) y a
[despliegue-windows.md](despliegue-windows.md) (tarea, despliegue, rollback).

## 1. Triage en 30 segundos

1. Abre **Estado** en el panel (`/admin/`). Las alertas aparecen arriba.
2. Si el panel no abre: `http://<ip-laptop>:3000/api/v1/health` (público).
   - No responde → [§3.1](#31-el-servidor-no-responde).
   - Responde 503 → la base de datos no contesta ([§3.9](#39-base-de-datos-bloqueada-o-disco-lleno)).
3. Mira el estado del conector y las alertas (`alerts[].code`) y busca la fila en la tabla:

| Alerta o síntoma | Ir a |
| --- | --- |
| `connector_down` / conector en `reconnecting` o `stopped` | [§3.2](#32-no-llegan-eventos) |
| Conector en `waiting_host` | [§3.2](#32-no-llegan-eventos) (el live aún no está en vivo) |
| `audio_offline` o hay eventos pero no suena nada | [§3.3](#33-no-suena-el-audio) |
| Alertas o sonidos con retraso, `queue_full` | [§3.4](#34-reacciones-retrasadas-o-cola-llena) |
| Un overlay no carga o no conecta (cierre 1008) | [§3.5](#35-un-overlay-no-carga-o-pierde-la-transparencia) |
| La voz lee algo ofensivo | [§3.6](#36-el-tts-leyó-algo-que-no-debía) |
| Contraseña olvidada, 403 «Origen no permitido», 429 | [§3.7](#37-acceso-al-panel) |
| El reinicio desde Ajustes no vuelve | [§3.1](#31-el-servidor-no-responde) |
| `disk_low` / `backup_stale` | [§3.9](#39-base-de-datos-bloqueada-o-disco-lleno) |
| Webhook que no llega | [§3.8](#38-webhook-que-no-llega) |

> Regla del live: si algo se complica, **no cambies reglas ni versión en directo**. Apaga la
> fuente problemática en LIVE Studio, sigue el live y arregla después.

## 2. Dónde mirar

| Qué | Cómo |
| --- | --- |
| Estado y alertas | Panel → Estado, o `GET /api/v1/health` |
| Eventos en vivo | Panel → Eventos, o `TIKLIVE_PASSWORD=… npm run watch-events` |
| Métricas | `GET /api/v1/metrics` (con sesión del panel) |
| Logs (Windows) | `Get-Content C:\TikLive\logs\tiklive-*.log -Tail 50 -Wait` (el más reciente) |
| Logs (desarrollo) | La consola de `npm run dev`; `LOG_LEVEL=debug` para más detalle (se cambia al instante en Ajustes) |
| Tarea (Windows) | `Get-ScheduledTask TikLive` |

Métricas útiles: `connector_state`, `connector_reconnects_total`, `events_received_total`,
`events_dropped_total`, `ws_clients{screen=…}`, `action_queue_depth`, `action_latency_ms`,
`event_loop_lag_ms`, `process_rss_bytes`.

## 3. Incidentes

### 3.1 El servidor no responde

Síntomas: `/health` sin respuesta, panel en blanco, overlays desconectados.

1. En Windows la tarea lo reinicia sola en ~3 s. Espera 15 s y repite `/health`.
2. Si sigue caído: `Get-ScheduledTask TikLive` y `Start-ScheduledTask TikLive`.
3. Lee el final del log más reciente. Causas comunes:
   - `EADDRINUSE`: otro proceso usa el puerto. Cambia `PORT` en `tiklive.env` o cierra el otro.
   - `Migration … failed`: el despliegue cambió el esquema. Haz **rollback** y restaura la base
     (ver [§4](#4-restaurar-y-volver-atrás)).
   - `data\config.json` dañado (JSON roto, por ejemplo tras un corte de energía en pleno
     guardado): el servidor arranca igual. Mueve el archivo a `config.json.corrupt-<hora>` junto
     al original, usa los valores por defecto y avisa en el log (busca «está dañado»). Hay que
     crear la contraseña de nuevo con el código de configuración que sale en el log, revisar
     Ajustes (usuario de TikTok, claves) y copiar las URLs nuevas de los overlays, porque la clave
     se genera otra vez. Las reglas y los datos están en la base, no se pierden. Si el archivo
     movido era recuperable (por ejemplo, le falta solo una llave), arréglalo con cuidado y
     devuélvelo a su nombre con el servidor detenido.
   - Reinicio desde Ajustes que no vuelve (el proceso queda vivo sin servidor HTTP): mata el
     proceso (`taskkill /F /IM node.exe`) y la tarea lo arranca de nuevo.
4. Dos instancias contra el mismo `app.db` no están protegidas. Comprueba que solo hay un
   `node.exe` de TikLive.
5. Tras recuperarte, el live puede seguir: la sesión se reanuda como nueva y los eventos
   anteriores permanecen en la base.

### 3.2 No llegan eventos

Primero mira el estado del conector (Estado, o `connector_state`).

| Estado | Significa | Acción |
| --- | --- | --- |
| `waiting_host` | El usuario configurado no está en directo | Inicia el live; reintenta solo cada 30 s. Revisa que el usuario de **Ajustes** sea el correcto |
| `connecting` / `reconnecting` unos segundos | Reconexión normal con espera creciente | Espera; no hagas nada |
| `reconnecting` repetido, `connector_down` | Corte de red, bloqueo temporal o cambio de protocolo de TikTok | Pasos de abajo |
| `stopped` sin que lo detuvieras | Tras 5 fallos de protocolo seguidos el supervisor se detiene | Pasos de abajo |

1. Comprueba internet en la laptop y que el live esté realmente en vivo.
2. Lee `lastError` en Estado y el log. Si habla de firma, límite o «protocol», TikTok cambió algo
   o limitó las peticiones.
3. Reconecta: en Estado → «Conexión con TikTok», desconecta y pulsa **Conectar** de nuevo.
4. Si falla de forma persistente: es el riesgo **R-01** de la spec.
   - Mantén el live: el panel, los overlays y el simulador siguen funcionando sin el conector.
   - Prueba el simulador para confirmar que el resto del sistema está sano
     (`npm run simulate -- full`). Si el simulador funciona, el fallo está en el conector.
   - Si había una versión anterior que funcionaba, vuelve a ella con `rollback.ps1`.
   - Para diagnosticar después: graba con `RECORD_PATH=data/live.jsonl` y reproduce con
     `npm run simulate -- replay data/live.jsonl`.
5. Si pide clave de firma: `TIKTOK_SIGN_API_KEY` se configura en Ajustes (aplica con reinicio).

### 3.3 No suena el audio

Hay eventos y las reglas se ejecutan, pero no se oye (`audio_offline` si el conector está
conectado).

1. `/screen/audio/?key=<clave>` debe estar abierta en **una** pestaña de la PC de stream.
2. Pulsa **Iniciar audio**: el navegador exige un gesto del usuario antes de reproducir.
3. Verifica `ws_clients{screen="audio"}` = 1. Con 0, la pestaña no está conectada: recárgala.
   Con 2 o más, cierra las pestañas duplicadas (cada una reproduce, se oiría doble).
4. Añade `?debug=1` a la URL para ver el estado de la pestaña.
5. Comprueba que LIVE Studio recibe el audio del sistema o de la pestaña (spec R-05).
6. Si cambiaste la clave de overlays, las URLs viejas dejan de funcionar: copia las nuevas desde
   Estado.
7. Prueba rápida: Simulador → un regalo. Debe sonar y la pestaña acusar `action.done`.

### 3.4 Reacciones retrasadas o cola llena

Síntomas: alertas que llegan segundos tarde, `queue_full`, `action_latency_ms` alto.

1. Revisa CPU y memoria de la laptop (juego, LIVE Studio y navegador compiten). Cierra lo que
   sobre.
2. Mira `action_queue_depth` y `event_loop_lag_ms`.
3. Reduce la carga desde **Reglas**: desactiva (interruptor) reglas de `like` y las de TTS largas.
   Los cambios aplican sin reiniciar.
4. Las acciones con más de 60 s en la cola se descartan; los eventos descartados cuentan en
   `events_dropped_total`.
5. Si la lista de espera no baja, comprueba que la pantalla confirma las acciones
   (`action.done`): una pestaña colgada hace que la cola reintente 3 veces. Recarga la pestaña.
6. Medición reproducible: con el live detenido, `npm run load-test -- --rate 100 --seconds 60`.

### 3.5 Un overlay no carga o pierde la transparencia

- **No conecta / cierre 1008 `unauthorized`:** la `key` de la URL no coincide. Copia la URL
  actual desde Estado u Overlays.
- **En blanco en LIVE Studio:** abre la misma URL en el navegador de la PC de stream. Si carga
  allí, revisa la fuente Link (URL completa con `?key=`, ancho y alto correctos).
- **Sin transparencia:** el tema `card` pinta fondo propio; usa `clear` o `light` en el
  configurador de Overlays y copia la URL nueva.
- **Panel sin dirección de la LAN:** la URL usa la IP de la laptop; si cambió (DHCP), copia la
  nueva. Conviene reservar la IP en el router.

### 3.6 El TTS leyó algo que no debía

1. Desactiva la regla con TTS (interruptor en **Reglas**) para cortar de inmediato.
2. En **Ajustes → Moderación**, añade la palabra o patrón a la lista de bloqueo y ajusta los
   filtros. Aplica sin reiniciar.
3. Considera pasar a modo de lectura solo por comando (`{commandArgs}`) en vez de `{comment}`.
4. Anota el caso: sirve para ajustar los 8 filtros (riesgo **R-07**).

### 3.7 Acceso al panel

| Síntoma | Causa | Solución |
| --- | --- | --- |
| Vuelve al login sin parar | Sesión caducada (30 min de inactividad) o reinicio del proceso | Iniciar sesión de nuevo |
| 403 «Origen no permitido» | Entras por una dirección distinta de la que sirve el panel, o un proxy cambia el `Host` | Usa el mismo host y puerto que en la URL de Estado |
| 429 al iniciar sesión | 5 fallos en 15 min desde la misma IP | Espera 15 min o reinicia el servidor |
| Contraseña olvidada | No hay recuperación por correo | Detén el servidor, borra `adminPasswordHash` de `data\config.json` (y `ADMIN_PASSWORD_HASH` si está en `tiklive.env`), arranca y usa el código de configuración que aparece en el log |

### 3.8 Webhook que no llega

Los webhooks son fire-and-forget: nunca frenan el live.

1. Sin `WEBHOOK_ALLOWED_HOSTS` quedan desactivados. Añade el host (separados por comas) y
   reinicia.
2. Destinos en red privada o loopback se bloquean salvo que estén en `WEBHOOK_PRIVATE_HOSTS`.
3. Tras 5 fallos seguidos a un host, el *circuit breaker* lo pausa 1 minuto. Timeout de 3 s,
   sin redirecciones, respuesta máxima de 64 KB.
4. «Probar» una regla **no** ejecuta webhooks; pruébalo con un evento del simulador.

### 3.9 Base de datos bloqueada o disco lleno

- `/health` en 503 o `db: down`: cierra otra instancia que use `app.db`, libera disco y revisa
  permisos de `data\`.
- `disk_low` (< 10 % libre): borra instaladores y capturas. Los respaldos automáticos están en
  `data\backups\`; copia lo antiguo a un disco externo y bórralo de la laptop. Los eventos con
  más de 90 días se limpian solos una vez al día.
- `backup_stale` (sin respaldo en 36 h): haz uno ahora (`POST /api/v1/backups` o desde el panel)
  y revisa por qué falló en el log (disco, permisos de `BACKUP_DIR`).

## 4. Restaurar y volver atrás

- **Release nuevo con problemas:** `C:\TikLive\scripts\rollback.ps1` (o `-To <release>`).
  `deploy.ps1` ya vuelve solo si `/health` no responde en 40 s.
- **Cambió el esquema:** las migraciones solo avanzan. Haz rollback **y** restaura la base:
  1. `Stop-ScheduledTask TikLive`.
  2. Elige el respaldo: `data\backups\pre-deploy\` (copia previa al despliegue) o
     `data\backups\app-<fecha>.db`.
  3. `node C:\TikLive\current\apps\server\dist\main\restore.js <respaldo> --db C:\TikLive\data\app.db`.
     Verifica el archivo y guarda la base actual como `app.db.before-restore`.
  4. `Start-ScheduledTask TikLive` y comprueba reglas y rankings.
  5. Assets: copia de vuelta `assets-<fecha>` a `data\assets`.
- **Pérdida del equipo:** instala Node 22, ejecuta `install.ps1` y `deploy.ps1`, restaura la base
  y los assets desde la copia externa.

## 5. Después del incidente

1. Anota hora, síntoma, causa y qué lo resolvió.
2. Si fue un fallo del conector, graba un fragmento (`RECORD_PATH`) y conviértelo en prueba de
   regresión del mapeo.
3. Si cambió algo de la operación, actualiza este runbook y [operacion.md](operacion.md).
4. Si el fallo es nuevo, añade una fila a la tabla de «Fallas previsibles» de
   `DOCUMENTACION_TECNICA.md`.
