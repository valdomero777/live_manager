# ADR 0011 — Freesound como segunda fuente de sonidos

Fecha: 2026-10-14 · Estado: aceptada

## Contexto

Los triggers de sonido buscaban solo en MyInstants a través de una API comunitaria no oficial
(`myinstants-api.vercel.app`). El 2026-10-14, durante un LIVE real, esa API respondía `503` en todas
sus rutas y no había forma de elegir sonidos nuevos. `www.myinstants.com` está detrás de un desafío
de Cloudflare, así que leerlo directamente no es viable.

Alternativas revisadas:

| Opción | Resultado |
| --- | --- |
| Freesound (API oficial v2) | Estable, documentada, búsqueda + vista previa MP3, licencias por sonido. Requiere clave gratuita |
| Alojar la API comunitaria de MyInstants | Ya posible con `MYINSTANTS_API_URL`; sigue dependiendo de leer el HTML de MyInstants |
| Pixabay, Zapsplat, BBC Sound Effects | Sin API pública de audio o licencia incompatible |
| Subir MP3 propios (Assets) | Ya existe; sigue siendo el respaldo sin internet |

## Decisión

- Freesound se agrega como otra implementación del puerto `SoundProvider`; `SoundSearchService`
  recibe un proveedor por fuente y la caché separa las fuentes. La ruta
  `GET /sounds/search` acepta `source=myinstants|freesound` (por defecto `myinstants`, compatible).
- La clave (`freesoundApiKey` / `FREESOUND_API_KEY`) es un ajuste **secreto** que se aplica en vivo:
  el proveedor la lee en cada búsqueda. Se envía como cabecera `Authorization: Token …`, nunca en la
  URL, y el navegador nunca la ve.
- Solo se aceptan sonidos **CC0** y **CC BY** (NonCommercial y Sampling+ se descartan: un LIVE
  puede estar monetizado) y de hasta 30 s. Cada resultado lleva autor y licencia; el selector los
  muestra con enlace a la página del sonido para poder dar crédito.
- `isAllowedSoundUrl` conoce los hosts de cada fuente (`myinstants.com`, `freesound.org`). Al guardar
  un trigger se exige que sus URLs sean de **su** fuente; el CSP permite `media-src
  https://*.freesound.org`.
- Sin clave, o con una clave rechazada (401/403), la búsqueda responde `503` con un mensaje que
  indica dónde configurarla; un fallo de red o de Freesound responde `502`, como MyInstants.

## Consecuencias

- Los triggers de Freesound reproducen la vista previa `preview-hq-mp3` (~128 kbps) desde
  `cdn.freesound.org`: no se descarga nada, igual que con MyInstants.
- El autor y la licencia no se guardan en el trigger (no hay migración); quien use un sonido CC BY
  debe dar crédito por su cuenta. Si se necesita, guardar `author`/`license` en `sound_trigger` es
  una migración aditiva.
- Freesound tiene más efectos de sonido y menos memes que MyInstants; para memes concretos, subir el
  MP3 en Assets sigue siendo lo más confiable.
