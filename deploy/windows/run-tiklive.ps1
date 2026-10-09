<#
.SYNOPSIS
  Keeps TikLive running: starts the active release and restarts it ~3 s after it exits.
.DESCRIPTION
  Started at boot by the "TikLive" scheduled task (see install.ps1). Each start writes its own
  logs\tiklive-<date>-<time>.log (+ .err.log); the 20 newest are kept. Runner messages go to
  logs\runner.log. Stopping the task stops the app.
#>
param([string]$Root = 'C:\TikLive')
$ErrorActionPreference = 'Continue'

$current = Join-Path $Root 'current'
$envFile = Join-Path $Root 'tiklive.env'
$logDir = Join-Path $Root 'logs'
$runnerLog = Join-Path $logDir 'runner.log'
$pidFile = Join-Path $Root 'tiklive.pid'
$restartDelaySeconds = 3
$keepLogs = 20

function Write-Log([string]$message) {
  Add-Content -Path $runnerLog -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $message)
}

function Remove-OldLogs {
  Get-ChildItem $logDir -Filter 'tiklive-*.log' |
    Sort-Object LastWriteTime -Descending | Select-Object -Skip ($keepLogs * 2) |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

# A previous runner killed abruptly (task stopped, power cut) can leave its node child behind.
function Stop-Stale {
  if (-not (Test-Path $pidFile)) { return }
  $old = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($old) { Stop-Process -Id ([int]$old) -Force -ErrorAction SilentlyContinue }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Stop-Stale
$child = $null
try {
  while ($true) {
    $entry = Join-Path $current 'apps\server\dist\main\index.js'
    if (-not (Test-Path $entry)) {
      Write-Log "No hay release activo en $current. Ejecuta deploy.ps1."
      Start-Sleep -Seconds 10
      continue
    }
    Remove-OldLogs
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $out = Join-Path $logDir "tiklive-$stamp.log"
    $err = Join-Path $logDir "tiklive-$stamp.err.log"
    Write-Log "Iniciando $((Get-Item $current).Target) -> $out"
    $child = Start-Process -FilePath 'node' -WorkingDirectory $current `
      -ArgumentList @("--env-file=`"$envFile`"", "`"$entry`"") `
      -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -NoNewWindow
    Set-Content -Path $pidFile -Value $child.Id
    $child.WaitForExit()
    Write-Log "node terminó con código $($child.ExitCode); reinicio en $restartDelaySeconds s"
    Remove-Item $pidFile -ErrorAction SilentlyContinue
    Start-Sleep -Seconds $restartDelaySeconds
  }
} finally {
  if ($child -and -not $child.HasExited) { Stop-Process -Id $child.Id -Force }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}
