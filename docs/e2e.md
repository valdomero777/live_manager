# Pruebas de extremo a extremo (Playwright)

Prueban el panel en un navegador real contra el servidor compilado: inicio de sesión, navegación,
reglas, simulador, overlays, rankings y metas, assets, triggers y ajustes. Las acciones del live
se disparan con el simulador, así que no necesitan TikTok ni internet.

## Ejecutarlas

```bash
npm ci
npx playwright install chromium   # una vez; en CI también --with-deps
npm run build                     # el servidor, el panel y los overlays compilados
npm run test:e2e
```

- `e2e/start-server.ts` arranca el servidor compilado en `127.0.0.1:3217` (cambia el puerto con
  `E2E_PORT`) con datos desechables en una carpeta temporal, el simulador como fuente del live,
  una contraseña conocida y una clave de overlays fija (`e2e/settings.ts`).
- `e2e/auth.setup.ts` inicia sesión una vez y guarda la sesión en `e2e/.auth/` (ignorada por git);
  `login.spec.ts` es el único que prueba sin sesión.
- Playwright reutiliza un servidor ya levantado en `:3217` salvo en CI (`CI=1`). Los archivos
  comparten el servidor y la base de datos, así que corren en orden y con un solo worker; cada
  prueba crea sus propios datos con nombres únicos.
- Fallos: `playwright-report/` y `test-results/` (capturas y trazas; `npx playwright show-trace`).

## Escribir pruebas nuevas

- Busca por rol y nombre accesible (`getByRole`, `getByLabel`), no por clases CSS. Los textos son los
  del panel en español (el idioma por defecto).
- Si necesitas el overlay, ábrelo con la clave de `E2E_OVERLAY_KEY` y espera a que aparezca en
  `/api/v1/health` (`connectedScreens`) antes de disparar el evento.
- La pestaña de audio no se conecta hasta pulsar «Iniciar audio».
- El servidor guarda los archivos por contenido: un archivo repetido no crea otra entrada.
