<#
================================================================
 ANTON portable bundle - start-futurechain.ps1
================================================================
 Launches the bundled FutureChain node as a separate, user-controlled
 supervised process. Sibling of run-anton.ps1 — they don't depend on
 each other. ANTON's fc-* services pick up whichever node is running
 on 127.0.0.1:<rpc-port> via fc_connection_config.

 This script:
   1. on first run, asks the user what kind of node they want
      (light hub by default, standard, or mining) and which peer
      to bootstrap from (default: Bahnhof seed)
   2. persists that choice to .portable-run\futurechain-config.json
      so subsequent runs skip the prompts
   3. spawns `futurechain.exe node ...` with the chosen settings
   4. waits for /health to answer, writes futurechain.pid
   5. stays open as a control window; closing it (or running
      'Stop FutureChain.bat') shuts the node down cleanly

 Re-run with -Reconfigure to wipe the saved config and re-prompt.
================================================================
#>
[CmdletBinding()]
param(
  [switch]$Reconfigure
)

$ErrorActionPreference = 'Stop'

# ---- paths ------------------------------------------------------
$Root       = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$FcDir      = Join-Path $Root 'futurechain'
$FcExe      = Join-Path $FcDir 'futurechain.exe'
$FcData     = Join-Path $FcDir 'data'
$RunDir     = Join-Path $Root '.portable-run'
$ConfigFile = Join-Path $RunDir 'futurechain-config.json'
$PidFile    = Join-Path $RunDir 'futurechain.pid'

# ---- defaults (used on first run / -Reconfigure) ---------------
$DefaultRpcPort       = 8546
$DefaultP2pPort       = 30304
$DefaultWindowDays    = 7
$DefaultSeed          = '79.136.1.113:30303'   # Bahnhof — the standing public seed

# ---- helpers ----------------------------------------------------
function Say  ($m){ Write-Host "  $m" -ForegroundColor Gray }
function Step ($m){ Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok   ($m){ Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn ($m){ Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Die  ($m){ Write-Host ""; Write-Host "  [X]  $m" -ForegroundColor Red; Write-Host ""; exit 1 }

# ---- banner -----------------------------------------------------
Write-Host ""
Write-Host "  FutureChain node  -  starting up" -ForegroundColor White
Write-Host "  $Root" -ForegroundColor DarkGray

# ================================================================
# 0. Sanity — do we have the binary?
# ================================================================
if (-not (Test-Path $FcExe)) {
  Write-Host ""
  Write-Host "  futurechain.exe is not bundled in this install." -ForegroundColor Red
  Write-Host ""
  Write-Host "  Expected at: $FcExe" -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "  How to get one:" -ForegroundColor Gray
  Write-Host "    - Download the matching Windows release from the FutureChain" -ForegroundColor Gray
  Write-Host "      release feed and drop futurechain.exe in: futurechain\" -ForegroundColor Gray
  Write-Host "    - Or build from source with: cargo build --release --bin futurechain" -ForegroundColor Gray
  Write-Host ""
  Write-Host "  ANTON still works without it — it falls back to stub mode" -ForegroundColor Gray
  Write-Host "  for wallet creation and payment submission." -ForegroundColor Gray
  Write-Host ""
  exit 2
}

New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
New-Item -ItemType Directory -Path $FcData -Force | Out-Null

# ================================================================
# 1. Load or build the saved config
# ================================================================
function Read-NonEmpty($prompt, $default) {
  while ($true) {
    if ($default) {
      $ans = Read-Host "$prompt [default: $default]"
      if (-not $ans -or $ans.Trim() -eq '') { return $default }
    } else {
      $ans = Read-Host $prompt
    }
    if ($ans -and $ans.Trim() -ne '') { return $ans.Trim() }
    Warn "value required"
  }
}

function Read-Choice($prompt, $choices, $default) {
  $list = ($choices | ForEach-Object { "[$($_.key)] $($_.label)" }) -join '  '
  while ($true) {
    $ans = Read-Host "$prompt`n  $list`n  choice [default: $default]"
    if (-not $ans -or $ans.Trim() -eq '') { $ans = $default }
    $hit = $choices | Where-Object { $_.key -eq $ans.Trim() } | Select-Object -First 1
    if ($hit) { return $hit.value }
    Warn "Please pick one of: $($choices.key -join ', ')"
  }
}

if ($Reconfigure -and (Test-Path $ConfigFile)) {
  Remove-Item $ConfigFile -Force -ErrorAction SilentlyContinue
  Say "re-configuring (old choices cleared)"
}

if (Test-Path $ConfigFile) {
  $config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
  Step "Configuration"
  Say "loaded saved choices from .portable-run\futurechain-config.json"
  Say "(re-run with -Reconfigure to change them)"
} else {
  Step "Configuration (first run)"
  Write-Host ""
  Write-Host "  Pick the kind of node you want to run. The choice is saved." -ForegroundColor Gray
  Write-Host ""

  $modeChoices = @(
    @{ key = '1'; value = 'light-hub'; label = 'Light hub (default, recommended)' },
    @{ key = '2'; value = 'standard';  label = 'Standard (full chain, no mining)' },
    @{ key = '3'; value = 'mine';      label = 'Mine for FTC rewards (uses CPU)' }
  )
  $mode = Read-Choice "  What kind of node?" $modeChoices '1'

  $minerAddress = $null
  if ($mode -eq 'mine') {
    Write-Host ""
    Write-Host "  Enter the wallet address that should receive mining rewards." -ForegroundColor Gray
    Write-Host "  (Format: starts with 'fc_' followed by ~33 characters.)" -ForegroundColor DarkGray
    while ($true) {
      $minerAddress = Read-Host "  Miner address"
      if ($minerAddress -and $minerAddress.Trim() -match '^fc_[A-Za-z0-9]{20,}$') {
        $minerAddress = $minerAddress.Trim()
        break
      }
      Warn "that doesn't look like a valid FutureChain address (expected fc_…)"
    }
  }

  Write-Host ""
  Write-Host "  Connect to a known seed peer on first start? An open-network seed" -ForegroundColor Gray
  Write-Host "  lets the node discover the rest of the network automatically." -ForegroundColor DarkGray
  Write-Host "  Hit enter to use Bahnhof; or paste another host:port; or 'none'" -ForegroundColor DarkGray
  Write-Host "  to start standalone (loopback-only, useful for local dev)." -ForegroundColor DarkGray
  $seedIn = Read-Host "  Seed peer [default: $DefaultSeed]"
  if (-not $seedIn -or $seedIn.Trim() -eq '') { $connectSeed = $DefaultSeed }
  elseif ($seedIn.Trim() -eq 'none') { $connectSeed = '' }
  else { $connectSeed = $seedIn.Trim() }

  $config = [PSCustomObject]@{
    node_type             = $mode                # 'light-hub' | 'standard' | 'mine'
    rpc_port              = $DefaultRpcPort
    p2p_port              = $DefaultP2pPort
    light_hub_window_days = $DefaultWindowDays
    mining                = ($mode -eq 'mine')
    miner_address         = $minerAddress
    connect_seed          = $connectSeed
  }
  $config | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
  Ok "configuration saved (re-run with -Reconfigure to change)"
}

Say "  node_type    = $($config.node_type)"
Say "  rpc_port     = $($config.rpc_port)"
Say "  p2p_port     = $($config.p2p_port)"
if ($config.node_type -eq 'light-hub') {
  Say "  window_days  = $($config.light_hub_window_days)"
}
if ($config.mining) {
  Say "  mining       = ON  (rewards → $($config.miner_address))"
}
if ($config.connect_seed) {
  Say "  seed peer    = $($config.connect_seed)"
} else {
  Say "  seed peer    = (none — standalone loopback)"
}

# ================================================================
# 2. Stop any previous run on the same PID file
# ================================================================
& (Join-Path $PSScriptRoot 'stop-futurechain.ps1') -Quiet

# ================================================================
# 3. Spawn
# ================================================================
Step "Launching FutureChain node"

# Build args. `--node-type standard` is the wire value for both 'standard'
# and 'mine' modes — the only differences for the binary are the extra
# `--mine` + `--miner-address` flags.
$cliNodeType = if ($config.node_type -eq 'light-hub') { 'light-hub' } else { 'standard' }

$fcArgs = @(
  'node',
  '--node-type', $cliNodeType,
  '--rpc-port',  "$($config.rpc_port)",
  '--port',      "$($config.p2p_port)",
  '--datadir',   $FcData
)
if ($config.node_type -eq 'light-hub') {
  $fcArgs += @('--light-hub-window-days', "$($config.light_hub_window_days)")
}
if ($config.mining) {
  $fcArgs += @('--mine', '--miner-address', $config.miner_address)
}
if ($config.connect_seed) {
  $fcArgs += @('--connect', $config.connect_seed)
}

$fcOut = Join-Path $RunDir 'futurechain.log'
$fcErr = Join-Path $RunDir 'futurechain.err.log'
$fc = Start-Process -FilePath $FcExe -ArgumentList $fcArgs `
        -WorkingDirectory $FcDir -PassThru `
        -RedirectStandardOutput $fcOut `
        -RedirectStandardError  $fcErr
Set-Content -Path $PidFile -Value $fc.Id

# ================================================================
# 4. Wait for /health
# ================================================================
$up = $false
for ($i = 0; $i -lt 60; $i++) {
  if ($fc.HasExited) {
    Die "FutureChain stopped during startup — see $fcErr"
  }
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$($config.rpc_port)/health" `
           -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $up = $true; break }
  } catch { }
  Start-Sleep -Seconds 1
}
if (-not $up) { Die "FutureChain did not respond on /health within 60s — see $fcErr" }

Ok "FutureChain is running"
Say "  RPC:        http://127.0.0.1:$($config.rpc_port)"
Say "  P2P:        127.0.0.1:$($config.p2p_port)"
Say "  logs:       .portable-run\futurechain.log (and .err.log)"
Say "  PID file:   .portable-run\futurechain.pid"

# ================================================================
# 5. Stay open as a control window
# ================================================================
Write-Host ""
Write-Host "  ==================================================" -ForegroundColor Green
Write-Host "   FutureChain is running.  RPC: http://127.0.0.1:$($config.rpc_port)" -ForegroundColor Green
Write-Host "  ==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Leave this window open.  ANTON will pick up the node automatically." -ForegroundColor White
Write-Host "  To stop the node: close this window, or run 'Stop FutureChain.bat'." -ForegroundColor Gray
Write-Host ""

try {
  Wait-Process -Id $fc.Id
  Write-Host ""
  Warn "the FutureChain node has stopped"
} finally {
  # On exit (window close / Ctrl+C), make sure the supervised process is
  # gone too. stop-futurechain.ps1 is idempotent.
  & (Join-Path $PSScriptRoot 'stop-futurechain.ps1') -Quiet
}
