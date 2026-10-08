# 0009 — Proyecciones en la transacción del evento y ruta caliente sin Kysely

Fecha: 2026-10-06 · Estado: aceptada

## Contexto

La especificación (secciones 6 y 11) exige que `leaderboard_total` se actualice en la misma
transacción que guarda el evento, que las metas se disparen una sola vez aunque haya reinicios,
y que el sistema aguante 1000 eventos/s sin que el top-N se desfase más de 500 ms.

Con Kysely, cada evento compilaba y ejecutaba de forma asíncrona unas 12 sentencias (viewer,
evento y 2 métricas × 3 alcances × 2 tablas): unos 2,2 ms por evento en la máquina de desarrollo.

## Decisión

1. **Deltas puros en el dominio.** `metricDeltas(event)` y `scopeKeysFor(event)` calculan qué
   suma cada evento (solo regalos finales y `likeDelta`). `IngestLiveEvent` los pasa al
   `EventStore`, que los aplica atómicamente con el evento. Un duplicado no escribe nada.
2. **Totales de sala** en `metric_total` (migración 0002). Las metas leen su progreso de ahí; el
   progreso nunca se guarda, solo los ciclos alcanzados en `goal_cycle(goal_id, scope_key,
   cycle)`. La clave única impide disparar `on_reach` dos veces y una meta de sesión reinicia en
   cada sesión.
3. **`SqliteEventStore` usa `better-sqlite3` directo** con sentencias preparadas dentro de una
   transacción síncrona. Kysely se mantiene en el resto de repositorios, donde la legibilidad pesa
   más que los microsegundos.
4. **Publicación por canales.** Los overlays declaran sus suscripciones en `client.hello`
   (`leaderboard:<métrica>:<alcance>`, `goal:<id>`, `stats`). El servidor envía primero un
   snapshot completo y luego, como mucho, un snapshot por canal cada 250 ms, con un `seq`
   monótono. Los canales sin suscriptores no se calculan.
5. **Stats en memoria.** Se reinician con cada sesión, coherente con "tras un corte la sesión se
   reanuda como nueva".

## Consecuencias

- Ranking y log nunca divergen (lo comprueba una prueba de consistencia).
- En memoria, la ruta caliente baja a ~0,33 ms por evento. El objetivo de 1000 eventos/s se
  valida con `npm run load-test` antes de cada release.
- El SQL del `EventStore` queda escrito a mano: un cambio de esquema exige revisarlo junto con
  `schema.ts`.
- `PlannedAction` lleva un `origin` (`rule` o `goal`) en lugar de `ruleId`, para que la cola y
  los logs distingan qué produjo cada acción.
