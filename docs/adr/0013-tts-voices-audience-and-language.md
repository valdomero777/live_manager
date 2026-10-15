# ADR 0013 — TTS: voces de Edge, audiencia y protección de idioma

Fecha: 2026-10-14 · Estado: aceptada

## Contexto

El TTS solo usaba la Web Speech API de la pantalla de audio: sin elección fiable de género, con
voces que dependen del sistema operativo de la PC de stream y sin forma de decidir a quién se le
lee. Se pidió configurar género e idioma de la voz, buscar voces disponibles en la red, filtrar
a quién se lee (seguidores, super fans, moderadores, fan club, global gifters, top gifters o
todos) y reglas de formato y de protección contra alfabetos e idiomas distintos al de la voz.

Opciones de voz evaluadas (2026-10-14):

| Opción | Calidad | Coste / requisitos | Riesgo |
| --- | --- | --- | --- |
| Web Speech API (actual) | Variable según el SO | Ninguno | El género no se expone; voces distintas en cada PC |
| **Microsoft Edge "Read Aloud"** (`msedge-tts`, MIT) | Neuronal, 322 voces con género y región | Gratis, sin clave; necesita internet | No oficial: cambia sin aviso; el texto sale a Microsoft |
| Piper (offline, MIT) | Neuronal, pocas voces por idioma | Binario + ~60 MB por voz; CPU de la laptop | Peso y mantenimiento de binarios |
| Google Translate TTS / StreamElements | Una voz por idioma / voces Polly | No oficial | Sin género (Google); autenticación incierta (SE) |
| Azure, Google Cloud, ElevenLabs, Polly | Alta | Clave y facturación | Secretos y costo |

## Decisión

1. **Dos motores**: `browser` (sigue siendo el valor por defecto, no cambia nada para quien no
   toque la configuración) y `edge`. Con `edge`, la pantalla de audio envía el texto por
   `POST /overlay-data/tts?key=` (texto en el cuerpo, nunca en la URL), el servidor sintetiza con
   `msedge-tts` y devuelve MP3. **Si Edge falla, la pantalla usa la voz del navegador**: un corte
   de Microsoft nunca deja a un espectador sin leer.
2. **Versión exacta `msedge-tts@2.1.0`**, aunque tenía un día de publicada: el 2026-10-13 Microsoft
   movió el servicio a `api.msedgeservices.com` y la 2.0.8 (la última con más de dos semanas)
   responde 403. Se revisó el diff 2.0.8 → 2.1.0: solo cambia el host (de Microsoft) y agrega
   timeouts; sin dependencias ni scripts nuevos. `npm audit --omit=dev`: 0 vulnerabilidades.
3. **Selección de voz** por idioma + género (región exacta, luego la región preferida del idioma,
   luego cualquiera; el género solo se relaja si el idioma no tiene voces de ese género), o por
   nombre exacto. Para el navegador, el género se infiere del nombre de la voz (Sabina, Raúl…).
4. **Audiencia** (`TtsAudience`): `neverRead` gana; luego `alwaysRead`; luego «todos»; si no, el
   espectador debe pertenecer a algún grupo activado. Interpretación acordada:
   - *Super fans* = suscriptores de LIVE (`isSubscriberOfAnchor`).
   - *Global gifters* = nivel de gifter de la cuenta en TikTok (insignia `USER_GRADE` o
     `payGrade`), con nivel mínimo.
   - *Fan club* = membresía activa en el club del streamer (o su insignia), con nivel mínimo.
   - *Top gifters* = top N del ranking de diamantes **de la sala** (sesión, semana o total). Se lee
     de un caché de 5 s que se refresca en segundo plano: el motor de reglas sigue siendo síncrono.
   La audiencia solo se aplica cuando la acción «Hablar» lee texto del espectador (`{comment}`,
   `{commandArgs}`); «Gracias {nickname}» se sigue leyendo a todos. Se evalúa **antes** de la
   moderación, así quien no está en la audiencia no gasta el límite por usuario.
5. **Formato** (solo lo que se lee): mayúsculas gritadas a minúsculas, repeticiones
   («jajajaja» → «jaja»), signos repetidos, y apodos limpios («✨𝓜𝓪𝓻𝓲𝓪✨» → «Maria»). Las alertas
   en pantalla conservan el texto original.
6. **Letras decoradas** («𝓗𝓸𝓵𝓪», «ｈｏｌａ», «🅷🅾🅻🅰», zalgo) se normalizan con NFKC como **primer
   filtro de la moderación** (`normalizeFancyText`, activo por defecto): así la lista de bloqueo
   no se esquiva con otra fuente.
7. **Alfabeto e idioma**: un comentario con letras de otro alfabeto (cirílico, árabe, CJK…) se
   omite por defecto; también se puede quitar esas letras, leerlo con una voz de ese idioma o
   leerlo igual. Unas pocas letras extrañas dentro de un comentario en el alfabeto de la voz
   (un «ツ») se quitan siempre. Para el mismo alfabeto (inglés con voz en español) se usa
   `franc-min` (MIT, offline) restringido a 10 idiomas candidatos y solo desde 20 letras; si el
   idioma de la voz queda a ≥ 90 % del mejor puntaje, se considera el mismo.

## Consecuencias

- Con `edge`, el texto de los comentarios sale a Microsoft. Está dicho en el panel junto al motor.
- El servicio de Edge es no oficial (mismo tipo de riesgo que el conector de TikTok): si cambia,
  hay que actualizar `msedge-tts`. El respaldo al navegador evita silencios.
- `gifterLevel` y `fanClubLevel` se leen de campos del protocolo que **no se han verificado con un
  live real** (fase 0). Si TikTok no los envía, esos grupos simplemente no coinciden.
- La detección de idioma en textos cortos es poco fiable; por eso el umbral de 20 letras.
- La latencia de Edge (~1 s por frase) se suma al tiempo de espera del acuse (`+4 s`).
