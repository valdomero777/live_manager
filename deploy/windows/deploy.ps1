<#
.SYNOPSIS
  Installs a release package, switches to it and rolls back automatically if it does not start.
.DESCRIPTION
  powershell -ExecutionPolicy Bypass -File deploy.ps1 -Package tiklive-0.1.0-....tgz [-Root C:\TikLive]
  Steps (spec 4): extract to releases\<name>, npm ci --omit=dev, point the "current" junction
  at it, restart the task, wait for /api/v1/health. If health fails, "current" goes back to the
  previous release. The 3 newest releases are kept. Needs internet for npm.
#>
param(
  [Parameter(Mandatory)][string]$Package,
  [string]$Root = 'C:\TikLive',
  [int]$HealthTimeoutSeconds = 40
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

if (-not (Test-Path $Package)) { throw "No existe el paquete $Package" }
$name = [IO.Path]::GetFileNameWithoutExtension((Split-Path $Package -Leaf))
$releases = Join-Path $Root 'releases'
$target = Join-Path $releases $name
$previous = Get-ActiveRelease $Root

if (Test-Path $target) { throw "El release $name ya está instalado. Usa rollback.ps1 para volver a él." }
try {
  tar -xzf $Package -C $releases
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo extraer el paquete.' }
  Push-Location $target
  try {
    npm ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci falló.' }
  } finally { Pop-Location }
} catch {
  Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
  throw
}

# Back up the database right before the new version can migrate it.
Write-Host 'Deteniendo TikLive...'
Stop-TikLive $Root
Backup-Database $Root
Set-ActiveRelease $Root $target
Write-Host "Activo: $name. Iniciando..."
Start-TikLive

if (Wait-Healthy $Root $HealthTimeoutSeconds) {
  Write-Host 'TikLive responde. Despliegue correcto.'
  Remove-OldReleases $Root 3
} elseif ($previous) {
  Write-Warning "El nuevo release no respondió en $HealthTimeoutSeconds s. Volviendo a $(Split-Path $previous -Leaf)."
  Stop-TikLive $Root
  Set-ActiveRelease $Root $previous
  Start-TikLive
  if (Wait-Healthy $Root $HealthTimeoutSeconds) { Write-Warning 'Rollback completado.' }
  else { Write-Error 'Tampoco responde el release anterior. Revisa logs\.' }
  exit 1
} else {
  Write-Error 'TikLive no respondió y no hay un release anterior. Revisa logs\.'
  exit 1
}
