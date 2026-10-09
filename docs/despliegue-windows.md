# Despliegue en Windows

La laptop corre TikLive como una **tarea programada de arranque** que reinicia el servidor ~3 s
después de cualquier caída (la spec pide < 10 s). Sin servicios de terceros: PowerShell 5.1,
Node.js y `tar` (incluido en Windows 10/11).

> Estos scripts se escribieron y revisaron sin poder ejecutarlos en Windows. Pruébalos primero con
> el ensayo de abajo antes de depender de ellos en un live.

## Estructura

```
C:\TikLive\
  releases\<nombre>\   cada versión desplegada (se conservan las 3 últimas)
  current\             junction al release activo
  data\                app.db, assets\, backups\, config.json   <- lo único que importa respaldar
  logs\                un log por arranque + runner.log (se conservan 20)
  tiklive.env          ajustes (KEY=valor); solo lo leen administradores y SYSTEM
  scripts\             install.ps1, deploy.ps1, rollback.ps1, run-tiklive.ps1
```

## 1. Preparar (una vez)

1. Instala **Node.js 22 LTS** (https://nodejs.org) en la laptop.
2. Copia la carpeta `deploy\windows` del repositorio a la laptop y, en PowerShell **como
   administrador**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1 -Root C:\TikLive -Port 3000
   ```
   Crea carpetas, `tiklive.env`, la tarea «TikLive» (al arrancar, como SYSTEM), la regla de
   firewall (solo red local, nunca internet) y desactiva la suspensión con corriente.

## 2. Empaquetar (en tu máquina de desarrollo)

```bash
npm ci
npm run package        # compila todo y escribe release/tiklive-<versión>-<fecha>-<commit>.tgz
```

El paquete es pequeño (~0,6 MB): código compilado, migraciones y manifiestos. Las dependencias se
instalan en la laptop para que los módulos nativos (SQLite, argon2) sean los de Windows.

## 3. Desplegar

Copia el `.tgz` a la laptop y, como administrador:

```powershell
C:\TikLive\scripts\deploy.ps1 -Package C:\ruta\tiklive-0.1.0-....tgz
```

Extrae, hace `npm ci --omit=dev` (necesita internet), **detiene la app y copia la base de datos**
(`data\backups\pre-deploy\`), activa el release, arranca y espera a `/api/v1/health`. Si no
responde en 40 s vuelve solo al release anterior.

Primer despliegue: abre `http://localhost:3000/admin/`, mira `logs\tiklive-*.log` para el
**código de configuración** y crea la contraseña. Pon tu usuario de TikTok en **Ajustes**.

### Volver atrás

```powershell
C:\TikLive\scripts\rollback.ps1            # al release anterior
C:\TikLive\scripts\rollback.ps1 -To tiklive-0.1.0-...   # a uno concreto
```

Las migraciones solo avanzan: si el release nuevo cambió el esquema, restaura también la base
(abajo).

## Operación diaria

| Acción | Comando |
| --- | --- |
| Estado | `Get-ScheduledTask TikLive`  ·  `http://localhost:3000/api/v1/health` |
| Parar / iniciar | `Stop-ScheduledTask TikLive` / `Start-ScheduledTask TikLive` |
| Logs | `Get-Content C:\TikLive\logs\tiklive-*.log -Tail 50 -Wait` (el más reciente) |
| Respaldo a mano | panel → o `POST /api/v1/backups` (ver `operacion.md`) |
| Restaurar | detén la tarea y `node C:\TikLive\current\apps\server\dist\main\restore.js C:\TikLive\data\backups\app-<fecha>.db --db C:\TikLive\data\app.db` |

Node no recibe un apagado ordenado en Windows (la tarea lo termina). SQLite en modo WAL lo
tolera: no se pierden transacciones confirmadas. Los respaldos automáticos van a
`data\backups\`; copia esa carpeta a un disco externo de vez en cuando.

## Ensayo de aceptación (spec §17, fase 4)

- [ ] Tras `deploy.ps1`, `/api/v1/health` responde `ok`.
- [ ] Reinicio automático < 10 s: `taskkill /F /IM node.exe` y mide hasta que `/api/v1/health`
      vuelva (esperado ~5 s). Anota: ____ s.
- [ ] Reinicia Windows: la app vuelve sola, sin iniciar sesión.
- [ ] `deploy.ps1` con un paquete roto (p. ej. borra `apps\server\dist` del `.tgz`) vuelve solo al
      release anterior.
- [ ] Restauración: apaga, restaura un respaldo, arranca y comprueba las reglas.
- [ ] 4 horas continuas con simulador + audio abierto, sin intervención.
