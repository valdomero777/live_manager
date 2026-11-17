# 2. Planes de entrenamiento

> **Aviso:** estos planes son un borrador de producto basado en principios generales de entrenamiento para principiantes (progresión gradual, intervalos de caminar/correr, días de descanso). **Antes del lanzamiento deben ser revisados y firmados por un entrenador certificado, un fisioterapeuta y un médico deportivo.** La app no es un dispositivo médico y no da diagnósticos.

## 2.1 Evaluación inicial (onboarding)

1. **Cuestionario de aptitud** (tipo PAR-Q+): problemas cardíacos, dolor en el pecho, mareos, enfermedades crónicas, medicamentos, embarazo, lesiones recientes.
   - Si hay alguna respuesta "sí" → mensaje claro de **consultar a un profesional de salud antes de empezar**, se ofrece solo la Etapa 0 (caminar) hasta que la persona confirme que tiene autorización médica.
2. **Nivel actual:** "¿Puedes caminar 30 min seguidos?", "¿Has trotado en los últimos 3 meses?", "¿Cuánto tiempo puedes trotar sin parar?" (nada / 1-5 min / 5-20 min / 20-40 min / > 40 min).
3. **Condiciones** (opcional, multiselección): ver §2.4.
4. **Disponibilidad:** días por semana (2, 3 o 4) y días preferidos.
5. **Objetivo:** hábito, perder peso, primer 5 km, 10 km, media maratón.

El sistema asigna **etapa + variante + frecuencia**. El usuario puede bajar de etapa en cualquier momento; subir de etapa sin completar la anterior requiere una "prueba de nivel".

## 2.2 Etapas (temática perruna)

| Etapa | Nombre | Para quién | Duración | Meta final |
|-------|--------|-----------|----------|-----------|
| 0 | **Olfateo** 🐾 | Sedentarios, condiciones de salud, mayores | 4 semanas | Caminar 30 min a paso vivo, 3 veces/semana |
| 1 | **Cachorro** | Empieza a correr | 9 semanas | Trotar 30 min seguidos (~5 km) |
| 2 | **Explorador** | Ya corre 30 min | 6 semanas | 5 km cómodos + primeros cambios de ritmo |
| 3 | **Rastreador** | Corre 5 km | 10 semanas | 10 km |
| 4 | **Lobo** | Corre 10 km | 12 semanas | Media maratón (21,1 km) |
| ∞ | **Manada** | Mantenimiento | Continuo | Mantener 3 sesiones/semana con variedad |

Toda sesión incluye **5 min de calentamiento caminando** y **5 min de vuelta a la calma + estiramientos**, no contados en la tabla.

### Etapa 0 — Olfateo (caminar)

| Semana | Sesión (3/semana) |
|--------|------------------|
| 1 | Caminar 15 min a paso cómodo |
| 2 | Caminar 20 min; los últimos 5 min a paso vivo |
| 3 | Caminar 25 min: alternar 3 min cómodo / 2 min vivo |
| 4 | Caminar 30 min a paso vivo (test del habla: puedes hablar, no cantar) |

### Etapa 1 — Cachorro (0 → 30 min trotando)

Intervalos trotar / caminar (T = trotar, C = caminar):

| Semana | Sesión tipo (3/semana) | Tiempo total de trote |
|--------|------------------------|----------------------|
| 1 | 8 × (1 min T + 1,5 min C) | 8 min |
| 2 | 6 × (1,5 min T + 2 min C) | 9 min |
| 3 | 2 × (1,5 T + 1,5 C + 3 T + 3 C) | 9 min |
| 4 | 3 T + 1,5 C + 5 T + 2,5 C + 3 T + 1,5 C + 5 T | 16 min |
| 5 | S1: 3 × (5 T + 3 C) · S2: 2 × (8 T + 5 C) · S3: 20 T | 15-20 min |
| 6 | S1: 5 T + 3 C + 8 T + 3 C + 5 T · S2: 2 × (10 T + 3 C) · S3: 22 T | 18-22 min |
| 7 | 25 min T | 25 min |
| 8 | 28 min T | 28 min |
| 9 | 30 min T 🎉 graduación | 30 min |

La semana 5 sesión 3 (20 min seguidos) es el mayor salto: el perro ofrece la **alternativa "repetir semana 4 + 1 sesión"** si la RPE de la semana 4 fue ≥ 7.

### Etapa 2 — Explorador (consolidar 5 km)

- 3 sesiones/semana: **fácil** (30-35 min), **juego** (fartlek: 6-8 × 1 min un poco más rápido, "persigue la pelota"), **larga suave** (subiendo de 35 a 45 min).
- Semana 6: "5 km del perro" (prueba de tiempo opcional, sin presión).

### Etapa 3 — Rastreador (10 km)

- 3-4 sesiones/semana: fácil, cambios de ritmo/cuestas cortas, larga (de 45 min a 75 min / ~10 km), opcional 4.ª fácil.
- Semanas de descarga en 4 y 8 (volumen −30 %).
- Volumen semanal: nunca más de **+10 %** respecto a la semana anterior.

### Etapa 4 — Lobo (media maratón)

- 4 sesiones/semana; tirada larga de 60 a 120 min; descarga cada 4.ª semana; 2 semanas de reducción (tapering) antes de la meta.
- Requiere haber completado la Etapa 3 o la prueba de nivel (10 km continuos).

## 2.3 Reglas de adaptación automática

| Señal | Acción |
|-------|--------|
| RPE ≥ 8 en una sesión de intervalos | La siguiente sesión repite el mismo nivel |
| RPE ≥ 8 en 2 sesiones de la misma semana | Se repite la semana |
| Sesión completada < 70 % | Se repite la sesión |
| Botón "me duele" usado | Pausa de 48 h + sugerencia de caminar; si se repite 2 veces en 14 días → recomendar consulta profesional y bajar una semana |
| 7-13 días sin entrenar | Retroceder 1 semana |
| ≥ 14 días sin entrenar | Retroceder 2 semanas (o a Etapa 0 si eran > 6 semanas) |
| RPE ≤ 3 de forma constante y completa todo | Ofrecer (no imponer) la prueba de nivel para saltar semanas |
| Calor extremo (índice de calor > 32 °C) o aviso de calidad del aire mala | Sugerir horario fresco, sesión más corta o sustituirla por caminata; no penaliza |

Reglas fijas: mínimo **1 día de descanso entre sesiones de carrera** en Etapas 0-2; nunca 2 sesiones duras seguidas en Etapas 3-4.

## 2.4 Variantes por condición

Cada variante modifica la plantilla base de la etapa. Todas muestran un aviso específico y piden confirmación de autorización médica cuando corresponde (🩺).

| Condición | Ajustes principales |
|-----------|---------------------|
| **Sobrepeso / obesidad** | Etapa 0 alargada a 6 semanas; Etapa 1 con intervalos más cortos (30 s T) y 12 semanas; recomendar superficies blandas y calzado adecuado; metas de tiempo, nunca de peso en el perro |
| **Rodillas / articulaciones sensibles** | Trote muy suave, intervalos cortos, evitar cuestas abajo; alternativa de caminata en pendiente; ejercicios de fuerza de 10 min (sentadilla a silla, puente de glúteo) 2×/semana |
| **Mayores de 60** 🩺 | Etapa 0 obligatoria; progresión 1,5× más lenta; 2 días de descanso entre sesiones; textos y botones grandes por defecto; ejercicios de equilibrio |
| **Asma** 🩺 | Calentamiento de 10 min; aviso de llevar inhalador; alerta por frío/aire seco y mala calidad del aire; RPE máximo recomendado 6 |
| **Diabetes** 🩺 | Recordatorio de controlar glucosa antes/después y llevar carbohidratos rápidos; sesiones en horarios regulares |
| **Hipertensión** 🩺 | Intensidad moderada (test del habla siempre), sin series intensas; evitar cuestas fuertes al principio |
| **Embarazo / posparto** 🩺 | Solo con aval médico explícito; embarazo: caminata y trote suave solo si ya corría antes; posparto: empezar en Etapa 0 tras el alta médica, con foco en suelo pélvico |
| **Regreso tras lesión** 🩺 | Alta del fisioterapeuta; comienza 2 semanas antes de su nivel previo; seguimiento de dolor en cada sesión (escala 0-10, parar si > 3) |
| **Poco tiempo (2 días/semana)** | Misma progresión con 2 sesiones/semana; etapas duran ~1,5× más |
| **Clima / entorno** | Calor: sesiones al amanecer/anochecer y recordatorios de hidratación; frío: calentamiento más largo; altitud > 1500 m: ritmo más suave las primeras 2 semanas; ciudad sin parques: rutas en circuito corto |

Las condiciones son **datos de salud sensibles**: se almacenan cifrados, con consentimiento explícito y se pueden borrar en cualquier momento (ver arquitectura §3.10).

## 2.5 Modelo de contenido (para desarrollo)

Los planes se definen como **datos versionados**, no como código:

```json
{
  "planId": "stage1-cachorro",
  "version": 3,
  "variants": ["base", "low-impact", "senior", "two-days"],
  "weeks": [
    {
      "week": 1,
      "sessions": [
        {
          "id": "s1w1",
          "warmup": { "type": "walk", "seconds": 300 },
          "blocks": [
            { "repeat": 8, "steps": [
              { "type": "run", "seconds": 60, "cue": "run_start" },
              { "type": "walk", "seconds": 90, "cue": "walk_start" }
            ]}
          ],
          "cooldown": { "type": "walk", "seconds": 300 },
          "stretchRoutine": "basic-5"
        }
      ]
    }
  ],
  "adaptationRules": "default-v2"
}
```

Las variantes se expresan como **transformaciones** (escalar duración de intervalos, insertar semanas, cambiar descansos) aplicadas a la plantilla base, para no duplicar contenido.
