# Shared helpers for deploy.ps1 and rollback.ps1.

function Get-Setting([string]$Root, [string]$Key, [string]$Default) {
  $file = Join-Path $Root 'tiklive.env'
  if (Test-Path $file) {
    $line = Get-Content $file | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
    if ($line) { return ($line -split '=', 2)[1].Trim() }
  }
  return $Default
}

function Get-ActiveRelease([string]$Root) {
  $link = Join-Path $Root 'current'
  if (-not (Test-Path $link)) { return $null }
  return (Get-Item $link).Target | Select-Object -First 1
}

# A junction (not a symlink) so no special privilege is needed. rmdir removes only the link.
function Set-ActiveRelease([string]$Root, [string]$Release) {
  $link = Join-Path $Root 'current'
  if (Test-Path $link) { cmd /c rmdir "`"$link`"" | Out-Null }
  New-Item -ItemType Junction -Path $link -Target $Release | Out-Null
}

function Stop-TikLive([string]$Root) {
  Stop-ScheduledTask -TaskName 'TikLive' -ErrorAction SilentlyContinue
  # The task kills the runner; make sure no node is left holding the database.
  Start-Sleep -Seconds 2
  $pidFile = Join-Path $Root 'tiklive.pid'
  if (Test-Path $pidFile) {
    Stop-Process -Id ([int](Get-Content $pidFile)) -Force -ErrorAction SilentlyContinue
    Remove-Item $pidFile -ErrorAction SilentlyContinue
  }
}

function Start-TikLive { Start-ScheduledTask -TaskName 'TikLive' }

function Wait-Healthy([string]$Root, [int]$TimeoutSeconds) {
  $port = Get-Setting $Root 'PORT' '3000'
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/v1/health" -TimeoutSec 3
      if ($health.db -eq 'ok') { return $true }
    } catch { }
    Start-Sleep -Seconds 1
  }
  return $false
}

# Offline copy of the database taken while the app is stopped (the app also makes its own).
# Node is killed without a clean shutdown on Windows, so recent writes may still be in the -wal
# file: the three files are copied together into one folder.
function Backup-Database([string]$Root) {
  $db = Get-Setting $Root 'DB_PATH' (Join-Path $Root 'data\app.db')
  if (-not (Test-Path $db)) { return }
  $base = Join-Path (Get-Setting $Root 'BACKUP_DIR' (Join-Path $Root 'data\backups')) 'pre-deploy'
  $dir = Join-Path $base ("{0:yyyyMMdd-HHmmss}" -f (Get-Date))
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  foreach ($suffix in '', '-wal', '-shm') {
    if (Test-Path "$db$suffix") { Copy-Item "$db$suffix" $dir }
  }
  Get-ChildItem $base -Directory | Sort-Object Name -Descending | Select-Object -Skip 5 |
    Remove-Item -Recurse -Force
}

function Remove-OldReleases([string]$Root, [int]$Keep) {
  $active = Get-ActiveRelease $Root
  Get-ChildItem (Join-Path $Root 'releases') -Directory | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $Keep | Where-Object { $_.FullName -ne $active } |
    Remove-Item -Recurse -Force
}
