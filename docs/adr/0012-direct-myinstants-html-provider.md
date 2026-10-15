# ADR 0012 — Lectura directa del HTML de MyInstants

Fecha: 2026-10-15 · Estado: aceptada

## Contexto

La búsqueda de MyInstants dependía de `myinstants-api.vercel.app`, una API comunitaria no oficial.
El 2026-10-14 respondía `503`; el 2026-10-15 su despliegue seguía en `DEPLOYMENT_PAUSED`. El ADR 0011
descartó leer `www.myinstants.com` porque estaba detrás de un desafío de Cloudflare, pero el
2026-10-15 las búsquedas con `fetch` de Node (sin User-Agent especial, incluidas respuestas
`EXPIRED` que llegan al origen) devolvieron `200` con HTML completo y sin `cf-mitigated`.

## Decisión

- `MyInstantsHtmlProvider` (nuevo) implementa `SoundProvider` leyendo
  `/en/search/?name=&page=`. Extrae de cada resultado `onclick="play('<mp3>', 'loader-N', '<slug>')"`
  y el enlace `class="instant-link"` con el título. El `id` es el slug.
- `404` significa «sin resultados» (o página pasada del final). Un `cf-mitigated`, un HTTP no OK o
  una página con el desafío de Cloudflare y sin resultados lanzan `SoundSourceError` (502), así
  que el dashboard puede sugerir Freesound o Assets.
- No hay marcado de paginación: `hasNext` es verdadero cuando la página trae 36 resultados (el
  tamaño de página observado).
- `MYINSTANTS_API_URL` pasa a ser opcional y vacío por defecto. Si se define, se sigue usando
  `MyInstantsProvider` (API comunitaria alojada por el usuario); si no, se usa la lectura directa.
- Los mismos controles de URL de siempre: `isAllowedSoundUrl` descarta cualquier MP3 o página fuera
  de `https://*.myinstants.com`; el CSP no cambia.

## Consecuencias

- El HTML no es un contrato: un cambio de maquetación deja la búsqueda sin resultados o rota hasta
  actualizar las expresiones de `myinstants-html-provider.ts`. El spec fija el formato observado.
- Cloudflare puede volver a bloquear (según IP o volumen). Se mitiga con la caché de
  `SoundSearchService`, un único GET por búsqueda y timeout de 8 s; la salida es Freesound o Assets.
- Es *scraping* de un sitio sin API pública y podría contravenir sus términos de uso; el uso es de
  baja frecuencia y solo para elegir sonidos, no para descargarlos en bloque.
- Quien tenga `MYINSTANTS_API_URL=https://myinstants-api.vercel.app` en su `.env` sigue usando la API
  caída y debe dejarlo vacío.
