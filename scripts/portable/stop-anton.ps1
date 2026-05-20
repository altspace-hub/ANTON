<#
================================================================
 ANTON portable bundle - stop-anton.ps1
================================================================
 Stops everything the portable bundle started: the ANTON server,
 Ollama, and the bundled PostgreSQL. Safe to run at any time -
 it does nothing if those processes are not running.

 Called by 'Stop ANTON.bat', and also by run-anton.ps1 at startup
 to clear out anything left over from an ungraceful close.
================================================================
#>
[CmdletBinding()]
param([switch]$Quiet)

$ErrorActionPreference = 'SilentlyContinue'

$Root   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$PgBin  = Join-Path $Root 'pgsql\bin'
$PgData = Join-Path $Root 'pgdata'
$RunDir = Join-Path $Root '.portable-run'

function Say($m){ if (-not $Quiet) { Write-Host "  $m" -ForegroundColor Gray } }

# --- stop a process recorded in a pid file, but only if it really
#     is the process we started (guard against PID reuse) -----------
function Stop-Pid($pidFile, $expectedName, $label) {
  if (-not (Test-Path $pidFile)) { return }
  $processId = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  if (-not $processId) { return }
  $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -like $expectedName) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Say "stopped $label"
  }
}

if (-not $Quiet) { Write-Host ""; Write-Host "Stopping ANTON ..." -ForegroundColor Cyan }

Stop-Pid (Join-Path $RunDir 'server.pid') 'node*'   'ANTON server'
Stop-Pid (Join-Path $RunDir 'ollama.pid') 'ollama*' 'Ollama'
# Phase 2 v2 (May 20 2026): FutureChain runs as a SEPARATE supervised
# process now (scripts/portable/start-futurechain.ps1). 'Stop ANTON'
# intentionally does NOT stop FutureChain — they're independent.
# Use 'Stop FutureChain.bat' to stop the node.

# --- PostgreSQL: pg_ctl uses the data directory, no pid needed ------
if (Test-Path (Join-Path $PgData 'postmaster.pid')) {
  $pgCtl = Join-Path $PgBin 'pg_ctl.exe'
  if (Test-Path $pgCtl) {
    & $pgCtl -D $PgData -m fast stop 2>$null | Out-Null
    Say "stopped PostgreSQL"
  }
}

if (-not $Quiet) {
  Write-Host "ANTON stopped." -ForegroundColor Green
  Write-Host ""
}
