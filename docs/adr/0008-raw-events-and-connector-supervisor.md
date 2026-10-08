# 0008 — Evento crudo neutral y supervisor del conector

Fecha: 2026-10-06 · Estado: aceptada

## Contexto

La especificación (sección 8) define `LiveEventSource` con `onStatus` y deja la reconexión dentro
del módulo del conector, y pide que el simulador recorra exactamente el mismo camino que el live.
Si cada adaptador implementara su propio backoff y su propio mapeo a `LiveEvent`, esa lógica se
duplicaría y el simulador no probaría la del adaptador real.

## Decisión

1. **`RawLiveEvent`** (en `packages/contracts`) es un evento neutral, sin `id` ni `sessionId`. El
   adaptador de TikTok es el único que conoce la librería y traduce sus mensajes a este formato;
   el simulador emite el mismo formato.
2. **`EventNormalizer`** (capa `application`) es común: deduplicación por `msgId`, consolidación de
   rachas, ventanas de likes y validación Zod hacia `LiveEvent`.
3. **`LiveEventSource.start()` hace un único intento** y falla con `ConnectFailure` clasificado
   (`host_offline`, `network`, `protocol`, `cancelled`). En lugar de `onStatus`, el puerto expone
   `onDisconnect`. **`ConnectorSupervisor`** implementa la máquina de estados, el backoff con jitter
   y la espera de 30 s cuando el host no está en vivo, y emite `connector.status`.
4. **Moderación en el motor:** las variables con texto de espectadores (`{comment}`,
   `{commandArgs}`) se resuelven solo tras pasar la cadena de filtros; si un filtro descarta el
   texto, la acción no se encola.

## Consecuencias

- La reconexión y la normalización se prueban una vez con reloj y planificador falsos.
- Reemplazar la librería (riesgo R-01/R-03) solo exige otro adaptador + mapper.
- `tiktok-live-connector` tipa su emisor con un `export default` CJS que no resuelve bajo
  `NodeNext`; el adaptador usa una vista estructural mínima (`ConnectionEmitter`).
- La regla de capas se verifica con dependency-cruiser, incluida una regla que prohíbe importar la
  librería fuera de `infrastructure/tiktok`.
