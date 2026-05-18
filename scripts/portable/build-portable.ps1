<#
================================================================
 ANTON portable bundle - build-portable.ps1
================================================================
 Phase 3: turns the repo + downloaded runtimes into a single
 distributable zip.

 It:
   1. fetches the runtimes (node/pgsql/ollama) if they are missing
   2. installs the app's dependencies using the BUNDLED Node, so the
      compiled native module (better-sqlite3) matches the Node that
      will run on the user's machine
   3. builds the web front-end (dist/client)
   4. zips the whole folder into dist-installer\ANTON-portable-<ver>.zip,
      leaving out git history, the dev .env, and first-run state

 This runs on YOUR machine to PRODUCE the bundle. Your friends never
 run it - they only get the resulting zip.

 Usage (from the repo root):
   powershell -ExecutionPolicy Bypass -File scripts\portable\build-portable.ps1

 Options:
   -SkipFetch     don't download runtimes (use what's already there)
   -SkipInstall   don't run the dependency install
   -SkipBuild     don't rebuild the front-end
   -SkipZip       stop before zipping (just prepare)
   -Version       override the version in the zip name
================================================================
#>
[CmdletBinding()]
param(
  [switch]$SkipFetch,
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$SkipZip,
  [string]$Version = ''
)

$ErrorActionPreference = 'Stop'

# ---- paths -----------------------------------------------------
$Root    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$NodeDir = Join-Path $Root 'node'
$NodeExe = Join-Path $NodeDir 'node.exe'
$OutDir  = Join-Path $Root 'dist-installer'

# ---- helpers ---------------------------------------------------
function Say  ($m){ Write-Host "  $m" -ForegroundColor Gray }
function Step ($m){ Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok   ($m){ Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn ($m){ Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Die  ($m){ Write-Host ""; Write-Host "  [X]  $m" -ForegroundColor Red; Write-Host ""; exit 1 }

Write-Host ""
Write-Host "ANTON portable bundle - builder (Phase 3)" -ForegroundColor White
Write-Host "Repo root: $Root" -ForegroundColor DarkGray

# ---- version (from package.json) -------------------------------
if (-not $Version) {
  try {
    $pkg = Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
    $Version = $pkg.version
  } catch { $Version = '0.0.0' }
}
Say "bundle version: $Version"

# ================================================================
# 1. Runtimes
# ================================================================
Step "Runtimes (node / pgsql / ollama)"
$haveNode = Test-Path $NodeExe
$havePg   = Test-Path (Join-Path $Root 'pgsql\bin\initdb.exe')
if ($SkipFetch) {
  Say "skipped (-SkipFetch)"
} elseif ($haveNode -and $havePg) {
  Say "runtimes already present - skipping fetch (delete the dirs or use fetch-runtimes.ps1 -Force to redo)"
} else {
  Say "fetching runtimes ..."
  & (Join-Path $PSScriptRoot 'fetch-runtimes.ps1')
  if ($LASTEXITCODE -ne 0) { Die "runtime fetch failed" }
}
if (-not (Test-Path $NodeExe)) { Die "node\ is missing - cannot continue" }
Ok "runtimes in place"

# the bundled Node goes first on PATH for every step below, so the
# dependency install compiles native modules for THIS Node version
$env:Path = "$NodeDir;$NodeDir\node_modules\npm\bin;$env:Path"
Say ("using Node " + (& $NodeExe --version))

# ================================================================
# 2. Dependencies
# ================================================================
Step "Dependencies"
if ($SkipInstall) {
  Say "skipped (-SkipInstall)"
} else {
  $pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue)
  if (-not $pnpm) {
    # try to provision pnpm through the bundled Node's corepack
    $corepack = Join-Path $NodeDir 'corepack.cmd'
    if (Test-Path $corepack) {
      Say "pnpm not found - enabling it via corepack ..."
      & $corepack enable 2>&1 | Out-Null
      $pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue)
    }
  }
  if (-not $pnpm) { Die "pnpm is not available - install it (npm i -g pnpm) and re-run" }
  Set-Location $Root
  # wipe any existing node_modules first - a layout left from a previous
  # 'isolated' install keeps a .pnpm symlink farm that breaks zipping and
  # is not relocatable. cmd's rmdir is junction-safe (it removes a link
  # without following it into the linked source).
  if (Test-Path 'node_modules') {
    Say "removing the old node_modules for a clean hoisted install ..."
    cmd /c rmdir /s /q node_modules
  }
  Say "installing (pnpm install, hoisted layout) - this can take a few minutes ..."
  # node-linker=hoisted gives a flat, real-file node_modules (no pnpm
  # symlink farm), so the folder can be zipped and moved to another
  # machine. The default 'isolated' layout uses symlinks/junctions that
  # do not survive being relocated.
  & pnpm install --frozen-lockfile --config.node-linker=hoisted
  if ($LASTEXITCODE -ne 0) { Die "dependency install failed" }
  Ok "dependencies installed (hoisted)"

  # the @futurechain/sdk workspace package is linked, not copied - a link
  # does not survive zip + move. Replace it with a real copy.
  $sdkLink = Join-Path $Root 'node_modules\@futurechain\sdk'
  $sdkSrc  = Join-Path $Root 'anton-business\packages\futurechain-sdk'
  $sdkItem = Get-Item $sdkLink -Force -ErrorAction SilentlyContinue
  if ($sdkItem -and ($sdkItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    Say "embedding @futurechain/sdk as real files ..."
    cmd /c rmdir "$sdkLink" 2>$null
    if (Test-Path $sdkLink) { Remove-Item $sdkLink -Recurse -Force -ErrorAction SilentlyContinue }
    robocopy $sdkSrc $sdkLink /E /XD node_modules /NFL /NDL /NJH /NJS /NP | Out-Null
    if (-not (Test-Path (Join-Path $sdkLink 'package.json'))) { Die "failed to embed @futurechain/sdk" }
    Ok "@futurechain/sdk embedded as real files"
  } else {
    Say "@futurechain/sdk is already a real folder"
  }

  # a correct hoisted node_modules is flat (npm-style) and needs no
  # .pnpm symlink store; if one is present (left by an earlier install)
  # remove it - it is symlink-heavy and not relocatable.
  if (Test-Path 'node_modules\.pnpm') {
    Say "removing a leftover node_modules\.pnpm symlink store ..."
    cmd /c rmdir /s /q "node_modules\.pnpm"
  }
  $rp = @(Get-ChildItem 'node_modules' -Recurse -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue)
  Ok ("node_modules is flat and relocatable ({0} links remain)" -f $rp.Count)
}
if (-not (Test-Path (Join-Path $Root 'node_modules\tsx'))) {
  Die "node_modules\tsx is missing - the runtime scripts need it; run without -SkipInstall"
}

# ================================================================
# 3. Build the front-end
# ================================================================
Step "Front-end build"
if ($SkipBuild) {
  Say "skipped (-SkipBuild)"
} else {
  Set-Location $Root
  Say "building (pnpm run build) - this can take a few minutes ..."
  & pnpm run build
  if ($LASTEXITCODE -ne 0) { Die "front-end build failed" }
  Ok "front-end built"
}
if (-not (Test-Path (Join-Path $Root 'dist\client\index.html'))) {
  Die "dist\client\index.html is missing - the build did not produce the web UI"
}
Ok "dist\client present"

# ================================================================
# 4. Zip the bundle
# ================================================================
Step "Package"
if ($SkipZip) {
  Say "skipped (-SkipZip) - the folder is prepared but not zipped"
  Write-Host ""
  Ok "prepare complete"
  exit 0
}

$tar = (Get-Command tar.exe -ErrorAction SilentlyContinue)
if (-not $tar) { Die "tar.exe not found (needs Windows 10 1803+); cannot zip" }

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$zipPath = Join-Path $OutDir "ANTON-portable-$Version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# things that must NOT ship: git history, the dev's own .env (it holds
# the dev's API key), first-run database state, runtime scratch dirs,
# and the output folder itself.
$leaf   = Split-Path $Root -Leaf
$parent = Split-Path $Root -Parent
# nested node_modules of the workspace sub-projects keep pnpm symlink
# farms - excluded (ANTON Local does not need them; @futurechain/sdk is
# already embedded as real files in the root node_modules).
$exclude = @(
  '.git', '.env', 'pgdata', '.portable-run', '.portable-tmp',
  'dist-installer', 'node_modules/.cache', 'not_to_git',
  'relay/node_modules',
  'anton-business/packages/futurechain-sdk/node_modules',
  'anton-business/packages/shared-types/node_modules'
)
$tarArgs = @('-a', '-c', '-f', $zipPath, '-C', $parent)
foreach ($e in $exclude) { $tarArgs += '--exclude'; $tarArgs += "$leaf/$e" }
$tarArgs += $leaf

Say "zipping the whole bundle (this is the slow part - several minutes) ..."
Say "leaving out: $($exclude -join ', ')"
& tar.exe @tarArgs
if ($LASTEXITCODE -ne 0) { Die "zip step failed" }

# ---- summary ---------------------------------------------------
$zipMb = [Math]::Round((Get-Item $zipPath).Length / 1MB, 0)
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Portable bundle built." -ForegroundColor Green
Write-Host ("   {0}" -f $zipPath) -ForegroundColor Green
Write-Host ("   size: {0} MB" -f $zipMb) -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Give this zip to a friend. They unzip it, open the" -ForegroundColor Gray
Write-Host "'$leaf' folder, and double-click 'Start ANTON (portable).bat'." -ForegroundColor Gray
Write-Host ""
