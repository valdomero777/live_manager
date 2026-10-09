<#
.SYNOPSIS
  Goes back to the previous release (or to -To <release name>) in one command.
.DESCRIPTION
  powershell -ExecutionPolicy Bypass -File rollback.ps1 [-To tiklive-0.1.0-...] [-Root C:\TikLive]
  Note: if the newer version changed the database schema, restore a backup too
  (docs/operacion.md); migrations only go forward.
#>
param(
  [string]$To,
  [string]$Root = 'C:\TikLive',
  [int]$HealthTimeoutSeconds = 40
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

$active = Get-ActiveRelease $Root
$all = Get-ChildItem (Join-Path $Root 'releases') -Directory | Sort-Object LastWriteTime -Descending
if ($To) {
  $target = $all | Where-Object { $_.Name -eq $To } | Select-Object -First 1
} else {
  $target = $all | Where-Object { $_.FullName -ne $active } | Select-Object -First 1
}
if (-not $target) { throw 'No hay otro release al que volver.' }

Write-Host "Volviendo a $($target.Name)..."
Stop-TikLive $Root
Set-ActiveRelease $Root $target.FullName
Start-TikLive
if (Wait-Healthy $Root $HealthTimeoutSeconds) { Write-Host 'TikLive responde.' }
else { Write-Error 'No respondió tras el rollback. Revisa logs\.'; exit 1 }
