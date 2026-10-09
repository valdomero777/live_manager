<#
.SYNOPSIS
  One-time setup of TikLive on Windows: folders, config file, startup task and firewall rule.
.DESCRIPTION
  Run in an elevated PowerShell (Run as administrator):
    powershell -ExecutionPolicy Bypass -File install.ps1 [-Root C:\TikLive] [-Port 3000]
  Layout under -Root:
    releases\<name>\   each deployed version        current\   junction to the active release
    data\              database, assets, backups     logs\      tiklive.log
    tiklive.env        settings (KEY=value)          scripts\   these scripts
  Requires Node.js 22 LTS (https://nodejs.org) on the PATH.
#>
param(
  [string]$Root = 'C:\TikLive',
  [int]$Port = 3000
)
$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Ejecuta este script como administrador.'
}
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'No se encontró Node.js. Instala Node 22 LTS desde https://nodejs.org' }
$major = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($major -lt 22) { throw "Se necesita Node 22 o superior (hay $major)." }

foreach ($dir in 'releases', 'data', 'logs', 'scripts') {
  New-Item -ItemType Directory -Force -Path (Join-Path $Root $dir) | Out-Null
}
Copy-Item -Force (Join-Path $PSScriptRoot '*.ps1') (Join-Path $Root 'scripts')

$envFile = Join-Path $Root 'tiklive.env'
if (-not (Test-Path $envFile)) {
  @"
# Ajustes de TikLive. Las variables se pueden cambiar también desde el panel (Ajustes).
PORT=$Port
HOST=0.0.0.0
DB_PATH=$Root\data\app.db
ASSETS_DIR=$Root\data\assets
BACKUP_DIR=$Root\data\backups
CONFIG_PATH=$Root\data\config.json
LOG_LEVEL=info
# TIKTOK_USERNAME=tu_usuario
# WEBHOOK_ALLOWED_HOSTS=
"@ | Set-Content -Encoding UTF8 $envFile
}
# The env file may hold secrets: only administrators and SYSTEM can read it.
icacls $envFile /inheritance:r /grant:r 'Administrators:(F)' 'SYSTEM:(F)' | Out-Null

$runner = Join-Path $Root 'scripts\run-tiklive.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -Root `"$Root`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'TikLive' -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null

# Reachable from the home network only, never from the internet.
Get-NetFirewallRule -DisplayName 'TikLive' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'TikLive' -Direction Inbound -Protocol TCP -LocalPort $Port `
  -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null

# The laptop must not sleep during a live.
powercfg /change standby-timeout-ac 0 | Out-Null

Write-Host "Listo. Siguiente paso: deploy.ps1 -Package <tiklive-....tgz> (ver docs/despliegue-windows.md)."
