<#
================================================================
 ANTON portable bundle - stop-futurechain.ps1
================================================================
 Stops the bundled FutureChain node. Safe to run at any time —
 it does nothing if the node isn't running.

 Called by 'Stop FutureChain.bat', and also by
 start-futurechain.ps1 at startup to clear out anything left over
 from an ungraceful close.

 Sibling of stop-anton.ps1; the two are independent — stopping
 FutureChain does NOT stop ANTON, and vice versa.
================================================================
#>
[CmdletBinding()]
param([switch]$Quiet)

$ErrorActionPreference = 'SilentlyContinue'

$Root    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$RunDir  = Join-Path $Root '.portable-run'
$PidFile = Join-Path $RunDir 'futurechain.pid'

function Say($m){ if (-not $Quiet) { Write-Host "  $m" -ForegroundColor Gray } }

if (-not $Quiet) { Write-Host ""; Write-Host "Stopping FutureChain ..." -ForegroundColor Cyan }

if (Test-Path $PidFile) {
  $processId = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  if ($processId) {
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -like 'futurechain*') {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      Say "stopped FutureChain node (PID $processId)"
    }
  }
}

if (-not $Quiet) {
  Write-Host "FutureChain stopped." -ForegroundColor Green
  Write-Host ""
}
