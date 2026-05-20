<#
================================================================
 ANTON portable bundle - fetch-runtimes.ps1
================================================================
 Downloads the portable runtimes ANTON Local needs into the repo
 root, so the whole folder can later be zipped into a single
 self-contained bundle that runs with one script - no Node, no
 PostgreSQL and no Ollama install on the user's machine.

 It places, at the repo root:
     node\           portable Node.js (win-x64)
     pgsql\          portable PostgreSQL binaries (win-x64)
     ollama\         portable Ollama (win-amd64)  [optional]
     futurechain\    bundled FutureChain light-hub node (Phase 2,
                     May 20 2026)                  [optional]

 None of these are committed to git (see .gitignore) - they are
 only there to be swept into the distributable zip.

 The FutureChain binary has no public download URL (it's our own
 build). The script looks for it at $FcSourcePath - either a
 pre-built futurechain.exe on disk (set via -FcSourcePath) or, by
 default, the CI-produced location runtimes-source\futurechain\
 futurechain.exe. If the source binary isn't found, the script
 warns and continues (ANTON runs in fc-stub mode without it).

 Usage (from the repo root):
     powershell -ExecutionPolicy Bypass -File scripts\portable\fetch-runtimes.ps1

 Options:
     -Force            re-download even if a target dir already exists
     -SkipOllama       skip Ollama entirely (smaller bundle)
     -SkipOllamaModel  download Ollama but not the embedding model
     -KeepGpu          keep Ollama's CUDA GPU libraries (~3.3 GB);
                       by default they are removed (CPU-only is enough
                       for the embedding model)
     -NodeVersion      pin a Node version, e.g. v22.13.1 (default: latest v22 LTS)
     -PgUrl            override the PostgreSQL binaries zip URL
     -OllamaUrl        override the Ollama zip URL
     -SkipFutureChain  skip bundling the FutureChain light hub
     -FcSourcePath     where to find a pre-built futurechain.exe
                       (default: runtimes-source\futurechain\futurechain.exe)
================================================================
#>
[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$SkipOllama,
  [switch]$SkipOllamaModel,
  [switch]$KeepGpu,
  [string]$NodeVersion = '',
  [string]$PgUrl = 'https://get.enterprisedb.com/postgresql/postgresql-16.6-1-windows-x64-binaries.zip',
  [string]$OllamaUrl = 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip',
  [switch]$SkipFutureChain,
  [string]$FcSourcePath = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # makes Invoke-WebRequest downloads fast

# ---- paths -----------------------------------------------------
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$TmpDir   = Join-Path $RepoRoot '.portable-tmp'
$NodeDir  = Join-Path $RepoRoot 'node'
$PgDir    = Join-Path $RepoRoot 'pgsql'
$OllamaDir= Join-Path $RepoRoot 'ollama'
# Phase 2 (May 20 2026): bundled FutureChain light hub.
$FcDir    = Join-Path $RepoRoot 'futurechain'
if (-not $FcSourcePath) {
  $FcSourcePath = Join-Path $RepoRoot 'runtimes-source\futurechain\futurechain.exe'
}

# ---- helpers ---------------------------------------------------
function Say   ($m){ Write-Host "  $m" -ForegroundColor Gray }
function Step  ($m){ Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok    ($m){ Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn  ($m){ Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Die   ($m){ Write-Host ""; Write-Host "  [X]  $m" -ForegroundColor Red; exit 1 }

function Test-Url ($url) {
  try {
    $r = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 30
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

function Get-File ($url, $dest) {
  Say "downloading $url"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
  $sw.Stop()
  $mb = [Math]::Round((Get-Item $dest).Length / 1MB, 1)
  Ok ("got {0} MB in {1}s" -f $mb, [Math]::Round($sw.Elapsed.TotalSeconds))
}

function Reset-Dir ($path) {
  if (Test-Path $path) { Remove-Item $path -Recurse -Force }
  New-Item -ItemType Directory -Path $path -Force | Out-Null
}

# ---- banner ----------------------------------------------------
Write-Host ""
Write-Host "ANTON portable bundle - runtime fetcher" -ForegroundColor White
Write-Host "Repo root: $RepoRoot" -ForegroundColor DarkGray

Reset-Dir $TmpDir

# ================================================================
# 1. Node.js  (portable win-x64 zip)
# ================================================================
Step "Node.js"
if ((Test-Path $NodeDir) -and -not $Force) {
  Warn "node\ already exists - skipping (use -Force to re-download)"
} else {
  if (-not $NodeVersion) {
    Say "resolving the latest Node 22 LTS from nodejs.org ..."
    $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
    $pick  = $index | Where-Object { $_.lts -and $_.version -like 'v22.*' } | Select-Object -First 1
    if (-not $pick) { Die "could not find a Node 22 LTS release; pass -NodeVersion explicitly" }
    $NodeVersion = $pick.version
  }
  Say "Node version: $NodeVersion"
  $nodeUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
  $nodeZip = Join-Path $TmpDir 'node.zip'
  if (-not (Test-Url $nodeUrl)) { Die "Node zip not found at $nodeUrl" }
  Get-File $nodeUrl $nodeZip

  # verify SHA-256 against the official SHASUMS256.txt
  try {
    $sums = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$NodeVersion/SHASUMS256.txt" -UseBasicParsing).Content
    $want = ($sums -split "`n" | Where-Object { $_ -match "node-$NodeVersion-win-x64\.zip" }) -split '\s+' | Select-Object -First 1
    $have = (Get-FileHash $nodeZip -Algorithm SHA256).Hash.ToLower()
    if ($want -and $have -ne $want.ToLower()) { Die "Node checksum mismatch (expected $want, got $have)" }
    if ($want) { Ok "checksum verified" }
  } catch { Warn "could not verify Node checksum: $($_.Exception.Message)" }

  Say "extracting ..."
  Expand-Archive -Path $nodeZip -DestinationPath $TmpDir -Force
  $extracted = Join-Path $TmpDir "node-$NodeVersion-win-x64"
  if (-not (Test-Path $extracted)) { Die "unexpected Node archive layout" }
  if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
  Move-Item $extracted $NodeDir
  if (-not (Test-Path (Join-Path $NodeDir 'node.exe'))) { Die "node.exe missing after extract" }
  Ok "node\ ready ($NodeVersion)"
}

# ================================================================
# 2. PostgreSQL  (EDB portable binaries zip - extracts to pgsql\)
# ================================================================
Step "PostgreSQL"
if ((Test-Path $PgDir) -and -not $Force) {
  Warn "pgsql\ already exists - skipping (use -Force to re-download)"
} else {
  if (-not (Test-Url $PgUrl)) {
    Warn "PostgreSQL zip not reachable at:"
    Say  "  $PgUrl"
    Say  "EDB rotates these URLs. Get the current 'Windows x86-64 zip archive' from"
    Say  "  https://www.enterprisedb.com/download-postgresql-binaries"
    Say  "then re-run with:  -PgUrl <that url>"
    Die  "PostgreSQL download URL is stale - supply -PgUrl"
  }
  $pgZip = Join-Path $TmpDir 'pgsql.zip'
  Get-File $PgUrl $pgZip
  Say "extracting ..."
  if (Test-Path $PgDir) { Remove-Item $PgDir -Recurse -Force }
  # the EDB zip contains a top-level 'pgsql' folder, so extract to repo root
  Expand-Archive -Path $pgZip -DestinationPath $RepoRoot -Force
  if (-not (Test-Path (Join-Path $PgDir 'bin\initdb.exe'))) {
    Die "initdb.exe missing after extract - the zip layout was unexpected"
  }
  Ok "pgsql\ ready"
}

# ================================================================
# 3. Ollama  (optional - portable win-amd64 zip)
# ================================================================
if ($SkipOllama) {
  Step "Ollama"
  Warn "skipped (-SkipOllama)"
} else {
  Step "Ollama"
  if ((Test-Path $OllamaDir) -and -not $Force) {
    Warn "ollama\ already exists - skipping (use -Force to re-download)"
  } else {
    if (-not (Test-Url $OllamaUrl)) { Die "Ollama zip not found at $OllamaUrl" }
    $olZip = Join-Path $TmpDir 'ollama.zip'
    Get-File $OllamaUrl $olZip
    Say "extracting ..."
    Reset-Dir $OllamaDir
    Expand-Archive -Path $olZip -DestinationPath $OllamaDir -Force
    if (-not (Test-Path (Join-Path $OllamaDir 'ollama.exe'))) {
      Die "ollama.exe missing after extract"
    }
    Ok "ollama\ ready"
  }

  # 3a. slim Ollama to CPU-only - the bundled CUDA GPU libraries are
  #     ~3.3 GB and are not needed to run a small embedding model on
  #     the CPU. Drop them unless -KeepGpu was passed. Runs even when
  #     ollama\ was already present, so a re-run also slims it.
  if (-not $KeepGpu) {
    $freed = 0
    foreach ($g in @('lib\ollama\cuda_v12', 'lib\ollama\cuda_v13')) {
      $p = Join-Path $OllamaDir $g
      if (Test-Path $p) {
        $freed += ((Get-ChildItem $p -Recurse -File -ErrorAction SilentlyContinue |
                    Measure-Object Length -Sum).Sum)
        Remove-Item $p -Recurse -Force
      }
    }
    if ($freed -gt 0) {
      Ok ("slimmed Ollama to CPU-only (freed {0} MB of GPU libraries)" -f [Math]::Round($freed/1MB,0))
    }
  }

  # 3b. pull the embedding model into ollama\models so it ships in the zip
  if ($SkipOllamaModel) {
    Warn "embedding model not pulled (-SkipOllamaModel)"
  } else {
    $modelsDir = Join-Path $OllamaDir 'models'
    $haveModel = (Test-Path $modelsDir) -and `
      (Get-ChildItem $modelsDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0
    if ($haveModel -and -not $Force) {
      Warn "ollama\models already populated - skipping model pull"
    } else {
      Say "pulling 'nomic-embed-text' embedding model (~270 MB, one-time) ..."
      New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null
      # use a custom port for the build-time pull so it never collides
      # with an Ollama that may already be running on the default 11434;
      # 'ollama pull' below inherits OLLAMA_HOST and so talks to OUR
      # server, which writes into the bundled ollama\models directory.
      $env:OLLAMA_MODELS = $modelsDir
      $env:OLLAMA_HOST   = '127.0.0.1:11543'
      $serve = $null
      try {
        $serve = Start-Process -FilePath (Join-Path $OllamaDir 'ollama.exe') `
                   -ArgumentList 'serve' -PassThru -WindowStyle Hidden
        Start-Sleep -Seconds 4
        if ($serve.HasExited) { throw "the bundled Ollama server did not start (is port 11543 in use?)" }
        & (Join-Path $OllamaDir 'ollama.exe') pull nomic-embed-text
        if ($LASTEXITCODE -ne 0) { throw "ollama pull exited with $LASTEXITCODE" }
        Ok "embedding model bundled into ollama\models"
      } catch {
        Warn "could not pre-pull the embedding model: $($_.Exception.Message)"
        Warn "this is optional - ANTON runs without it (knowledge memory degrades gracefully)"
      } finally {
        if ($serve -and -not $serve.HasExited) { Stop-Process -Id $serve.Id -Force -ErrorAction SilentlyContinue }
      }
    }
  }
}

# ================================================================
# 4. FutureChain light hub (optional - Phase 2, May 20 2026)
# ================================================================
# Cross-compiled `futurechain.exe` is dropped in by CI (or a developer
# running `cargo build --release --bin futurechain` on Windows). This
# script just copies it from the source location into the bundle dir.
# If the source binary isn't present we warn and continue — the
# resulting bundle works in stub mode (no real wallet / tx settlement,
# per fc_connection_config.stub_mode = TRUE default).
if ($SkipFutureChain) {
  Step "FutureChain light hub"
  Warn "skipped (-SkipFutureChain)"
} else {
  Step "FutureChain light hub"
  if ((Test-Path (Join-Path $FcDir 'futurechain.exe')) -and -not $Force) {
    Warn "futurechain\ already populated - skipping (use -Force to re-copy)"
  } elseif (Test-Path $FcSourcePath) {
    Reset-Dir $FcDir
    Copy-Item -Path $FcSourcePath -Destination (Join-Path $FcDir 'futurechain.exe') -Force
    # Reserve a data subdir so run-anton.ps1 can populate it on first run.
    New-Item -ItemType Directory -Path (Join-Path $FcDir 'data') -Force | Out-Null
    Ok "futurechain.exe placed (source: $FcSourcePath)"
  } else {
    Warn "futurechain source not found at $FcSourcePath"
    Warn "  → ANTON bundle will run in stub mode for wallets / transactions"
    Warn "  → drop a Windows-built futurechain.exe at that path, or pass -FcSourcePath"
  }
}

# ---- cleanup ---------------------------------------------------
Step "Cleanup"
Remove-Item $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
Ok "removed temp files"

# ---- summary ---------------------------------------------------
Write-Host ""
Write-Host "Done. Runtimes downloaded into the repo root:" -ForegroundColor White
function Show-Size ($label, $path) {
  if (Test-Path $path) {
    $mb = [Math]::Round(((Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue |
           Measure-Object Length -Sum).Sum) / 1MB, 0)
    Write-Host ("  {0,-10} {1,7} MB   {2}" -f $label, $mb, $path) -ForegroundColor Green
  } else {
    Write-Host ("  {0,-10} {1,7}      (not present)" -f $label, '-') -ForegroundColor DarkGray
  }
}
Show-Size 'node'        $NodeDir
Show-Size 'pgsql'       $PgDir
Show-Size 'ollama'      $OllamaDir
Show-Size 'futurechain' $FcDir
Write-Host ""
Write-Host "Next: Phase 2 builds 'Start ANTON.bat' which uses these runtimes." -ForegroundColor DarkGray
Write-Host ""
