<#
================================================================
 ANTON portable bundle - run-anton.ps1
================================================================
 The one script that runs everything. Launched by 'Start ANTON.bat'.

 It:
   1. clears anything left over from a previous run
   2. on first run: asks once for an Anthropic API key, writes .env,
      and creates the bundled PostgreSQL database
   3. starts the bundled PostgreSQL (private port, localhost only)
   4. makes sure the database schema is up to date
   5. starts Ollama (optional - for knowledge memory)
   6. starts the ANTON server and opens it in the browser
   7. stays open as a small control window; closing it (or running
      'Stop ANTON.bat') shuts everything down cleanly

 Nothing here changes how ANTON itself works - it only sets a few
 environment values and launches the existing server.
================================================================
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# ---- paths -----------------------------------------------------
$Root    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$NodeExe = Join-Path $Root 'node\node.exe'
$PgBin   = Join-Path $Root 'pgsql\bin'
$PgData  = Join-Path $Root 'pgdata'
$Ollama  = Join-Path $Root 'ollama'
$RunDir  = Join-Path $Root '.portable-run'
$EnvFile = Join-Path $Root '.env'
$TsxCli  = Join-Path $Root 'node_modules\tsx\dist\cli.mjs'

# ---- settings --------------------------------------------------
$PgPort  = 54329                  # private port - avoids clashing with any other PostgreSQL
$AppPort = 3001
$DbUrl   = "postgresql://anton:anton@127.0.0.1:$PgPort/anton"

# ---- helpers ---------------------------------------------------
function Say  ($m){ Write-Host "  $m" -ForegroundColor Gray }
function Step ($m){ Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok   ($m){ Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn ($m){ Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Die  ($m){ Write-Host ""; Write-Host "  [X]  $m" -ForegroundColor Red; Write-Host ""; exit 1 }
function Test-PortFree($p){
  try {
    $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, [int]$p)
    $l.Start(); $l.Stop(); return $true
  } catch { return $false }
}

Write-Host ""
Write-Host "  ANTON  -  starting up" -ForegroundColor White
Write-Host "  $Root" -ForegroundColor DarkGray

# ================================================================
# 0. Sanity checks - is this a complete bundle?
# ================================================================
if (-not (Test-Path $NodeExe))                  { Die "node\ is missing - run scripts\portable\fetch-runtimes.ps1" }
if (-not (Test-Path (Join-Path $PgBin 'initdb.exe'))) { Die "pgsql\ is missing - run scripts\portable\fetch-runtimes.ps1" }
if (-not (Test-Path (Join-Path $Root 'node_modules'))) { Die "node_modules is missing - the bundle was not prepared (Phase 3)" }
if (-not (Test-Path $TsxCli))                    { Die "tsx is missing from node_modules - the bundle was not prepared (Phase 3)" }
if (-not (Test-Path (Join-Path $Root 'dist\client'))) { Warn "dist\client is missing - the web UI may not load until the bundle is prepared (Phase 3)" }

New-Item -ItemType Directory -Path $RunDir -Force | Out-Null

# ================================================================
# 1. Clear anything left over from a previous run
# ================================================================
& (Join-Path $PSScriptRoot 'stop-anton.ps1') -Quiet

# pick a free web port - 3001 by default, step aside if something
# else (e.g. another ANTON) already holds it
if (-not (Test-PortFree $AppPort)) {
  $taken = $AppPort
  $AppPort = (3002..3030 | Where-Object { Test-PortFree $_ } | Select-Object -First 1)
  if (-not $AppPort) { Die "no free web port found in the range 3001-3030" }
  Warn "port $taken is busy - ANTON will use port $AppPort instead"
}
Set-Content -Path (Join-Path $RunDir 'webport.txt') -Value "$AppPort"

$firstRun = -not (Test-Path (Join-Path $PgData 'PG_VERSION'))

# everything from here down is wrapped so PostgreSQL/Ollama are
# always shut down again, even on Ctrl+C
try {

  # ==============================================================
  # 2. First run - API key + create the database cluster
  # ==============================================================
  if ($firstRun) {
    Step "First-time setup"
    Say "This happens only once. It takes a few minutes - please wait."

    # ---- .env (ask for the Anthropic API key) -------------------
    if (-not (Test-Path $EnvFile)) {
      Write-Host ""
      Write-Host "  ANTON needs an Anthropic API key to talk to Claude." -ForegroundColor White
      Write-Host "  Get one at  https://console.anthropic.com" -ForegroundColor DarkGray
      Write-Host ""
      $key = Read-Host "  Paste your API key (starts with sk-ant-), or press Enter to add it later"
      $key = $key.Trim()
      if ($key -and -not $key.StartsWith('sk-ant-')) {
        Warn "that does not look like an Anthropic key - saving it anyway; you can fix it in .env later"
      }
      $envText = @"
# ANTON portable - generated on first run. Edit values here if needed.
ANTHROPIC_API_KEY=$key
DATABASE_URL=$DbUrl
DEPLOYMENT_MODE=solo
PORT=$AppPort
OLLAMA_BASE_URL=http://127.0.0.1:11434
"@
      Set-Content -Path $EnvFile -Value $envText -Encoding ASCII
      Ok ".env created"
    } else {
      Say ".env already exists - keeping it"
    }

    # ---- initdb -------------------------------------------------
    Say "creating the bundled database (initdb) ..."
    $pwFile = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $pwFile -Value 'anton' -Encoding ASCII -NoNewline
    try {
      & (Join-Path $PgBin 'initdb.exe') -D $PgData -U anton -A scram-sha-256 `
          --pwfile=$pwFile -E UTF8 --locale=C 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { Die "initdb failed" }
    } finally {
      Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
    }
    # localhost-only, on our private port
    Add-Content -Path (Join-Path $PgData 'postgresql.conf') `
      -Value "`n# ANTON portable`nport = $PgPort`nlisten_addresses = '127.0.0.1'`n"
    Ok "database cluster created"
  }

  # ==============================================================
  # 3. Start PostgreSQL
  # ==============================================================
  Step "PostgreSQL"
  $pgLog = Join-Path $RunDir 'postgres.log'
  & (Join-Path $PgBin 'pg_ctl.exe') -D $PgData -l $pgLog -w start 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Die "PostgreSQL would not start - see $pgLog" }

  # wait until it actually accepts connections
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    & (Join-Path $PgBin 'pg_isready.exe') -h 127.0.0.1 -p $PgPort -q 2>$null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 700
  }
  if (-not $ready) { Die "PostgreSQL did not become ready - see $pgLog" }
  Ok "PostgreSQL running on 127.0.0.1:$PgPort"

  $env:PGPASSWORD = 'anton'

  # first run: create the 'anton' database
  if ($firstRun) {
    & (Join-Path $PgBin 'createdb.exe') -h 127.0.0.1 -p $PgPort -U anton anton 2>$null | Out-Null
    Ok "database 'anton' created"
  }

  # ==============================================================
  # 4. Bring the database schema up to date
  # ==============================================================
  Step "Database schema"
  if ($firstRun) {
    Say "applying the full schema and migrations - this is the slow part, please wait ..."
  } else {
    Say "checking for any new migrations ..."
  }
  $env:DATABASE_URL    = $DbUrl
  $env:DEPLOYMENT_MODE = 'solo'
  $env:NODE_ENV        = 'production'
  $env:PORT            = "$AppPort"
  Set-Location $Root
  & $NodeExe $TsxCli (Join-Path $Root 'server\db\init-unified.ts')
  if ($LASTEXITCODE -ne 0) { Die "database setup failed - see the messages above" }
  Ok "database ready"

  # ==============================================================
  # 5. Ollama (optional - knowledge memory / embeddings)
  # ==============================================================
  Step "Ollama (optional)"
  $ollamaExe = Join-Path $Ollama 'ollama.exe'
  if (Test-Path $ollamaExe) {
    $env:OLLAMA_MODELS = Join-Path $Ollama 'models'
    $env:OLLAMA_HOST   = '127.0.0.1:11434'
    $ol = Start-Process -FilePath $ollamaExe -ArgumentList 'serve' `
            -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $RunDir 'ollama.log') `
            -RedirectStandardError  (Join-Path $RunDir 'ollama.err.log')
    Set-Content -Path (Join-Path $RunDir 'ollama.pid') -Value $ol.Id
    Ok "Ollama started"
  } else {
    Warn "ollama\ not bundled - ANTON runs fine without it (knowledge memory is reduced)"
  }

  # ==============================================================
  # 6. Start the ANTON server
  # ==============================================================
  Step "ANTON server"
  $srvOut = Join-Path $RunDir 'anton-server.log'
  $srvErr = Join-Path $RunDir 'anton-server.err.log'
  $srv = Start-Process -FilePath $NodeExe `
           -ArgumentList @($TsxCli, (Join-Path $Root 'server\index.ts')) `
           -WorkingDirectory $Root -PassThru `
           -RedirectStandardOutput $srvOut -RedirectStandardError $srvErr
  Set-Content -Path (Join-Path $RunDir 'server.pid') -Value $srv.Id
  Say "server starting (logs: .portable-run\anton-server.log) ..."

  # wait for the server to answer
  $up = $false
  for ($i = 0; $i -lt 60; $i++) {
    if ($srv.HasExited) { Die "the ANTON server stopped unexpectedly - see $srvErr" }
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:$AppPort/api/health" `
             -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { $up = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
  }
  if (-not $up) { Die "the ANTON server did not come up in time - see $srvErr" }
  Ok "ANTON server running"

  # ==============================================================
  # 7. Open the browser + create a desktop shortcut on first run
  # ==============================================================
  Start-Process "http://localhost:$AppPort"

  if ($firstRun) {
    try {
      $desktop = [Environment]::GetFolderPath('Desktop')
      $ws  = New-Object -ComObject WScript.Shell
      $lnk = $ws.CreateShortcut((Join-Path $desktop 'ANTON.lnk'))
      $lnk.TargetPath       = (Join-Path $Root 'Start ANTON (portable).bat')
      $lnk.WorkingDirectory = $Root
      $lnk.Description      = 'Start ANTON'
      $lnk.Save()
      Ok "added an 'ANTON' shortcut to your desktop"
    } catch {
      Warn "could not create a desktop shortcut (not essential)"
    }
  }

  # ==============================================================
  # 8. Stay open as a control window
  # ==============================================================
  Write-Host ""
  Write-Host "  ============================================" -ForegroundColor Green
  Write-Host "   ANTON is running:  http://localhost:$AppPort" -ForegroundColor Green
  Write-Host "  ============================================" -ForegroundColor Green
  Write-Host ""
  Write-Host "  Keep this window open while you use ANTON." -ForegroundColor White
  Write-Host "  To stop ANTON: close this window, or run 'Stop ANTON.bat'." -ForegroundColor Gray
  Write-Host ""
  Wait-Process -Id $srv.Id
  Write-Host ""
  Warn "the ANTON server has stopped"

} finally {
  # always shut PostgreSQL and Ollama down again
  & (Join-Path $PSScriptRoot 'stop-anton.ps1') -Quiet
}
