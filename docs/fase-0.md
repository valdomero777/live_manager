# Fase 0 — verificación de supuestos

Puerta de salida (spec §17): comentarios y regalos reales visibles en consola; LIVE Studio carga una
URL local con fondo transparente; el audio de una pestaña llega al live; CPU de la laptop medida.
Los supuestos son los de la spec §18. Marca cada casilla con la fecha y el resultado.

## 0. Preparación (laptop)

```bash
npm install
npm run build -w @tiklive/overlays && npm run build -w @tiklive/dashboard
npm run seed
npm run phase0 -- env            # Node >= 22, requisito del conector, better-sqlite3
```

- [ ] Ubuntu/Windows elegido y Node 22 LTS instalados (`.nvmrc`).
- [ ] Puerto 3000 abierto solo para la LAN (ufw: `ufw allow from 192.168.0.0/16 to any port 3000`).
- [ ] `npm run phase0 -- env` sin FALLA (cubre «versión mínima de Node del conector compatible»).

## 1. Eventos reales en consola

Configura `TIKTOK_USERNAME` y `SIMULATE=false` en **Ajustes** (o en `.env`), inicia tu live y:

```bash
npm run dev
TIKLIVE_PASSWORD=... npm run watch-events
```

- [ ] Conector pasa a `connected`; si dice `waiting_host`, el live aún no empezó.
- [ ] Llegan comentarios, regalos, likes y follows reales con desfase < 2 s (`+x.x s`).
- [ ] Funciona sin servicio de firma externo (anota si pide clave o aparece un límite de uso;
      revisa el README de `tiktok-live-connector`).
- [ ] Una racha de regalos llega como un solo evento.
- [ ] Guarda unos minutos de eventos para regresión (pendiente: modo `record`, ver `plan.md`).

## 2. LIVE Studio y audio (R-05)

En la PC de stream:

- [ ] `http://<ip-laptop>:3000/screen/alerts/?key=<OVERLAY_KEY>` como fuente **Link** carga.
- [ ] El fondo es transparente (lanza `npm run simulate -- full` y mira las alertas sobre la cámara).
- [ ] `http://<ip-laptop>:3000/screen/audio/?key=<OVERLAY_KEY>`: pulsa **Iniciar audio**; el
      sonido de `npm run simulate -- gift` se oye en el live (captura de audio del sistema).
- [ ] Anota si alguna fuente (leaderboard, goal, stats, rotator) pierde la transparencia.

## 3. Rendimiento (R-04)

```bash
# terminal 1
npm run dev
# terminal 2: 100 eventos/s durante 60 s
npm run load-test -- --rate 100 --seconds 60
# terminal 3, a la vez
npm run phase0 -- cpu --seconds 60
```

- [ ] CPU media < 25 % (resultado: ____ %).
- [ ] `npm run load-test -- --rate 1000` con la máquina libre: desfase < 500 ms (pendiente de fase 3).
- [ ] Piper en tiempo real con la voz en español elegida (decide TTS por defecto: Web Speech o Piper).

## 4. Red

```bash
npm run phase0 -- latency --host <ip-pc-stream> --port <puerto abierto en la PC>
```

- [ ] Latencia p95 < 20 ms (resultado: ____ ms).

## Resultados

| Supuesto | Fecha | Resultado | Notas |
| --- | --- | --- | --- |
| LIVE Studio acepta Link + transparencia | | | |
| Audio de pestaña llega al live | | | |
| CPU < 25 % con 100 ev/s | | | |
| Conector sin servicio de firma | | | |
| Piper en tiempo real | | | |
| Latencia LAN < 20 ms | | | |
| Node compatible con el Ubuntu elegido | | | |
