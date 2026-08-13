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

  # ── Added 2026-07-29 after proving what the old list shipped ──────────────
  #
  # 'not_to_git' above does NOT match the directory that actually exists, which
  # is `not_to_github` (455 files, including SECURITY_AUDIT_2026-07-25.md, which
  # documents UNPATCHED Critical findings). tar's --exclude is a glob, and
  # `not_to_git` matches only that literal name. Verified empirically: with the
  # old list, not_to_github/SECURITY_AUDIT.md landed in the archive. Both names
  # are listed now because both directories exist.
  'not_to_github',

  # Release signing material. These are on this machine and in no repo, and the
  # old list did not mention them — a public download would have handed anyone
  # the ability to sign an APK as ANTON.
  #
  # EVERY pattern here starts with `*` on purpose. The loop below prefixes each
  # entry with "$leaf/", and tested against bsdtar: `*` DOES span `/`, so
  # `leaf/*.keystore` correctly catches android-pay/app.keystore and
  # deep/nested/x.keystore — but a BARE filename becomes `leaf/keystore.properties`
  # and then matches ONLY the top level, missing android-*/keystore.properties,
  # which is exactly where those files live. The leading `*` absorbs the path.
  '*.keystore', '*.keystore.bak', '*keystore.properties', '*keystore.properties.bak',
  '*.jks', '*.p12', '*.pepk',

  # The phone apps: private source the owner publishes commercially, plus ~1.2 GB
  # of native build trees that also carry the keystores. ANTON Local serves only
  # dist/client, dist/app and docs/help (server/index.ts:978-992), so none of
  # this is needed to run the bundle — it was pure bloat and pure risk.
  'android', 'android-pay', 'android-comm', 'android-business', 'android-agent',
  'src/pay', 'src/comm', 'src/business', 'src/agent',
  'dist/pay', 'dist/comm', 'dist/business', 'dist/agent',
  'ios-templates', 'ios-templates-comm',

  # Other local-only secrets and scratch that no distributable needs. Same `*`
  # rule as above for anything that can appear below the top level.
  '*.env.local', '*.env.production', '.env.*', 'coverage', 'playwright-report',
  'test-results', '.claude',

  # ── Gitignored LOCAL STATE. This is the category the old list missed entirely,
  # because it was written from a "what is in git" mindset — and git-ignored
  # working state is precisely what leaks, since nobody reviews it.
  #
  # What was actually sitting in these on 2026-07-29, all of which the June zip
  # would have published:
  #   .live-walk/        50 MB of live payment-test scripts and output, containing
  #                      FOUR real fc_ wallet addresses, a device-pulled
  #                      installed-comm.apk, and a 64-hex Ed25519 PRIVATE KEY in
  #                      biz-authorize.cjs
  #   .artifacts/        30 MB, 54 device screenshots from wallet/identity testing
  #   .anton/            12 MB of local orchestrator state
  #   .studio-workspaces/ a Studio demo project
  '.anton', '.artifacts', '.live-walk', '.studio-workspaces',

  # Stale phone-app zips that happen to sit in the repo root. Shipping June-dated
  # app builds inside the current ANTON Local download is 62 MB of confusion:
  # whoever unzips it gets APKs older than the bundle around them. The apps are
  # distributed through Play, not through here.
  'ANTON-apps-*.zip', 'ANTON-Comm-*.zip', 'ANTON-Companion-*.zip',
  'ANTON-Pay-Business-*.zip',
  # ─────────────────────────────────────────────────────────────────────────
  'anton-business/packages/futurechain-sdk/node_modules',
  'anton-business/packages/shared-types/node_modules',
  # Anton Agent Pay (Electron desktop app, merged from another machine):
  # its node_modules carries dangling pnpm links that break tar, and the
  # portable ANTON Local bundle doesn't run it anyway.
  'apps/anton-agent-pay/node_modules',
  # Phase 2 (May 20 2026): the bundled FutureChain light hub.
  #   futurechain\futurechain.exe  → bundled (carries the runtime)
  #   futurechain\data\            → per-install blockchain data; built
  #                                   on first run, NOT for distribution
  #   runtimes-source\             → developer source for the pre-built
  #                                   futurechain.exe; fetch-runtimes.ps1
  #                                   reads it, not the runtime
  'futurechain/data',
  'runtimes-source'
)
$tarArgs = @('-a', '-c', '-f', $zipPath, '-C', $parent)
foreach ($e in $exclude) { $tarArgs += '--exclude'; $tarArgs += "$leaf/$e" }
$tarArgs += $leaf

Say "zipping the whole bundle (this is the slow part - several minutes) ..."
Say "leaving out: $($exclude -join ', ')"
& tar.exe @tarArgs
if ($LASTEXITCODE -ne 0) { Die "zip step failed" }

# ---- leak check: inspect the ARCHIVE, not the exclusion list ----
#
# This exists because the exclusion list above silently rotted. It said
# 'not_to_git' while the directory on disk was `not_to_github` — 455 files
# including a security audit of unpatched Critical findings — and nothing at all
# mentioned the five release keystores or their plaintext passwords. Nobody
# noticed, because a wrong exclusion produces a perfectly ordinary-looking zip.
#
# So the list is no longer trusted. Whatever it says, the finished archive is read
# back and the build FAILS if anything sensitive is in it. A list can drift; a
# check on the artifact cannot be wrong about what shipped.
Step "checking the archive for anything that must not ship"
$entries = & tar.exe -tf $zipPath
if ($LASTEXITCODE -ne 0) { Die "could not read back $zipPath to verify it" }
Say "$($entries.Count) entries"
if ($entries.Count -lt 100) { Die "archive has only $($entries.Count) entries - something went wrong" }

# Anchors matter here, and every one of them was earned on the first run: the initial
# patterns failed the build on three FALSE positives, all of which SHOULD ship —
#   keystore.properties.example   a template, no secret in it
#   relay/.env.example            ditto, x3
#   tests/android/                this repo's own Android test directory
# Failing closed on those was the right instinct, but a gate that cries wolf gets
# loosened by whoever hits it next, so the patterns are now exact:
#   - `$` on the file patterns, so `.example` variants are not secrets
#   - `^[^/]+/` on the directory patterns, which pins them to the TOP level of the
#     bundle folder — `tests/android/` is not `android/`
# Do not relax these into bare substrings. Tighten the exclusion list instead.
$forbidden = @(
  @{ Label = 'signing keystore';         Pattern = '\.(keystore|jks|p12|pepk)(\.bak)?$' },
  @{ Label = 'keystore password file';   Pattern = '(^|/)keystore\.properties(\.bak)?$' },
  @{ Label = 'internal/private docs';    Pattern = '(^|/)not_to_git(hub)?/' },
  @{ Label = 'real dev environment file'; Pattern = '(^|/)\.env(\.local|\.production)?$' },
  @{ Label = 'private phone-app source'; Pattern = '^[^/]+/src/(pay|comm|business|agent)/' },
  @{ Label = 'native app tree';          Pattern = '^[^/]+/android(-pay|-comm|-business|-agent)?/' },
  @{ Label = 'git history';              Pattern = '(^|/)\.git/' },
  # Local working state. `.live-walk` held a real Ed25519 private key and four live
  # wallet addresses; `.artifacts` held 54 device screenshots. Gated as well as
  # excluded, because this is the category the exclusion list forgot once already.
  @{ Label = 'local test/run state';     Pattern = '^[^/]+/\.(live-walk|artifacts|anton|studio-workspaces|claude)/' },
  @{ Label = 'stale phone-app zip';      Pattern = '^[^/]+/ANTON-[A-Za-z-]+-?[0-9.]*\.zip$' },
  # Belt and braces on the thing that would actually hurt: a device-pulled APK has
  # no business in a source bundle and is how the .live-walk debris got noticed.
  @{ Label = 'device-pulled APK';        Pattern = '(^|/)installed-[a-z]+\.apk$' }
)
$leaks = @()
foreach ($rule in $forbidden) {
  $hits = @($entries | Where-Object { $_ -match $rule.Pattern })
  if ($hits.Count -gt 0) {
    $leaks += "$($rule.Label): $($hits.Count) entr$(if($hits.Count -eq 1){'y'}else{'ies'}), e.g. $($hits[0])"
  }
}
if ($leaks.Count -gt 0) {
  Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
  Write-Host ""
  foreach ($l in $leaks) { Write-Host "  [LEAK] $l" -ForegroundColor Red }
  Die "archive contained material that must not be published - zip DELETED, fix `$exclude and rebuild"
}
Ok "no keystores, secrets, private app source or internal docs in the archive"

# Positive control: the things the bundle NEEDS must actually be present, or a
# runaway exclusion would produce a clean-but-useless zip that passes the checks
# above by containing nothing.
$required = @('/dist/client/index.html', '/dist/app/index.html', '/docs/help/index.html',
              '/server/index.ts', '/package.json')
$missing = @($required | Where-Object { $m = $_; -not ($entries | Where-Object { $_ -like "*$m" }) })
if ($missing.Count -gt 0) { Die "archive is missing what the bundle needs: $($missing -join ', ')" }
Ok "dist/client, dist/app, docs/help, server and package.json all present"

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
