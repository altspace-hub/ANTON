<#
================================================================
 ANTON portable bundle - test-bundle.ps1
================================================================
 Phase 4, part A: verifies the packaged zip WITHOUT extracting it.

 Checks, by listing the archive:
   - the things a friend needs ARE in the zip
     (node, pgsql, ollama + model, hoisted node_modules, dist/client,
      the launch scripts and .bat files)
   - the things that must NOT ship are absent
     (.git history, the dev's .env, first-run pgdata, the .pnpm farm)
   - the archive contains no symlinks (would not survive relocation)

 Usage (from the repo root):
   powershell -ExecutionPolicy Bypass -File scripts\portable\test-bundle.ps1
================================================================
#>
[CmdletBinding()]
param([string]$Zip = '')

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Say ($m){ Write-Host "  $m" -ForegroundColor Gray }
function Step($m){ Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }

# ---- locate the zip -------------------------------------------
if (-not $Zip) {
  $Zip = (Get-ChildItem (Join-Path $Root 'dist-installer') -Filter 'ANTON-portable-*.zip' `
            -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending |
            Select-Object -First 1).FullName
}
if (-not $Zip -or -not (Test-Path $Zip)) {
  Write-Host "  [X] no bundle zip found in dist-installer\ - build it first" -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "ANTON portable bundle - verification" -ForegroundColor White
Say ("zip:  {0}" -f $Zip)
Say ("size: {0} MB" -f [Math]::Round((Get-Item $Zip).Length / 1MB, 0))

# ---- read the archive listing ---------------------------------
Step "Reading the archive index"
$paths = & tar.exe -tf $Zip
if ($LASTEXITCODE -ne 0) { Write-Host "  [X] could not read the zip" -ForegroundColor Red; exit 1 }
$top = ($paths | Select-Object -First 1).Split('/')[0]
Say ("$($paths.Count) entries; top-level folder: $top")

$results = @()
function Check($label, $ok, $detail) {
  $script:results += [pscustomobject]@{ ok = $ok; label = $label; detail = $detail }
  $tag = if ($ok) { '[ok]' } else { '[X] ' }
  $col = if ($ok) { 'Green' } else { 'Red' }
  Write-Host ("  {0} {1}" -f $tag, $label) -ForegroundColor $col
  if ($detail) { Write-Host ("       $detail") -ForegroundColor DarkGray }
}
function HasExact($p){ $paths -contains "$top/$p" }
function HasUnder($p){ [bool]($paths | Where-Object { $_ -like "$top/$p*" } | Select-Object -First 1) }

# ---- required content -----------------------------------------
Step "Required content is present"
Check "bundled Node"             (HasExact 'node/node.exe')                 'node/node.exe'
Check "bundled PostgreSQL"       (HasExact 'pgsql/bin/initdb.exe')           'pgsql/bin/initdb.exe'
Check "PostgreSQL pg_ctl"        (HasExact 'pgsql/bin/pg_ctl.exe')           'pgsql/bin/pg_ctl.exe'
Check "bundled Ollama"           (HasExact 'ollama/ollama.exe')              'ollama/ollama.exe'
Check "embedding model"          (HasUnder 'ollama/models/')                'ollama/models/...'
Check "node_modules (deps)"      (HasUnder 'node_modules/tsx/')              'node_modules/tsx/'
Check "embedded @futurechain/sdk" (HasExact 'node_modules/@futurechain/sdk/package.json') 'real file, not a link'
Check "built web UI"             (HasExact 'dist/client/index.html')         'dist/client/index.html'
Check "server entry"             (HasExact 'server/index.ts')                'server/index.ts'
Check "launch script"            (HasExact 'scripts/portable/run-anton.ps1') 'scripts/portable/run-anton.ps1'
Check "Start .bat"               (HasExact 'Start ANTON (portable).bat')     'double-click launcher'
Check "Stop .bat"                (HasExact 'Stop ANTON (portable).bat')      ''

# ---- things that must NOT ship --------------------------------
Step "Excluded content is absent"
Check "no .git history"          (-not (HasUnder '.git/'))                   ''
Check "no dev .env"              (-not (HasExact '.env'))                    'the dev API key must never ship'
Check "no first-run pgdata"      (-not (HasUnder 'pgdata/'))                 ''
Check "no .pnpm symlink farm"    (-not (HasUnder 'node_modules/.pnpm/'))     'must be a flat hoisted layout'
Check "no scratch dirs"          (-not (HasUnder '.portable-run/') -and -not (HasUnder '.portable-tmp/')) ''

# ---- no symlinks (they do not relocate) -----------------------
Step "Archive has no symlinks"
$verbose = & tar.exe -tvf $Zip
$links = @($verbose | Where-Object { $_ -match '^l' })
Check "zero symlink entries" ($links.Count -eq 0) ("found $($links.Count) symlink(s)")
if ($links.Count -gt 0) { $links | Select-Object -First 5 | ForEach-Object { Say $_ } }

# ---- verdict --------------------------------------------------
Step "Verdict"
$fail = @($results | Where-Object { -not $_.ok })
if ($fail.Count -eq 0) {
  Write-Host "  ALL CHECKS PASSED - the zip is correctly packaged." -ForegroundColor Green
  Write-Host ""
  exit 0
} else {
  Write-Host ("  {0} CHECK(S) FAILED:" -f $fail.Count) -ForegroundColor Red
  $fail | ForEach-Object { Write-Host ("   - {0}" -f $_.label) -ForegroundColor Red }
  Write-Host ""
  exit 1
}
