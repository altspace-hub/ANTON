<#
.SYNOPSIS
  Build one ANTON phone app as a signed release AAB + APK.

.DESCRIPTION
  The whole chain in one place, because it was previously four undocumented manual
  steps and only Companion had a script (`pnpm build:android`). Getting one step wrong
  is silent: a fresh APK wrapping a stale web bundle looks completely normal and ships
  last month's UI.

  The steps:
    1. vite build with CAPACITOR_BUILD=1  ->  dist/<app>
    2. mirror dist/<app> -> android-<app>/app/src/main/assets/public
    3. gradlew bundleRelease assembleRelease
    4. verify the APK is signed with the RELEASE key, not the debug key

  WHY STEP 2 IS ROBOCOPY AND NOT `npx cap sync`
  Capacitor 8 removed the `--config` flag, and CAPACITOR_CONFIG_FILE is ignored by
  `cap copy`. Running plain `npx cap sync android` for one of these apps silently uses
  the DEFAULT config — it copies dist/app into android/ (Companion) no matter which app
  you meant. That is not a no-op, it overwrites another app's assets. Only Companion,
  whose config *is* the default, can use cap sync.

  /MIR is deliberate: it deletes files in the destination that are no longer in the
  build. A plain copy leaves orphaned chunks from previous builds inside the APK.

.PARAMETER App
  pay | business | comm | agent | companion

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/build-release-app.ps1 -App pay
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('pay', 'business', 'comm', 'agent', 'companion')]
  [string]$App
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

# Companion is the odd one out: its web bundle is dist/app and its native project is
# plain `android/`, because it was the first and owns the default Capacitor config.
$webName     = if ($App -eq 'companion') { 'app' } else { $App }
$androidDir  = if ($App -eq 'companion') { 'android' } else { "android-$App" }
# ${App} braces are load-bearing: "build:$App:cap" makes PowerShell read `$App:` as a
# scope qualifier (like $env: or $global:) and expand to nothing, so npm is handed
# "build::cap" and fails with an unhelpful "supported npm commands" dump.
$buildScript = if ($App -eq 'companion') { 'build:app:cap' } else { "build:${App}:cap" }

$dist   = Join-Path $repo "dist\$webName"
$native = Join-Path $repo "$androidDir\app\src\main\assets\public"
$gradle = Join-Path $repo "$androidDir\gradlew.bat"

Write-Output "=== $App : building web bundle ($buildScript) ==="
Set-Location $repo
# npm.cmd, not npm: on this machine `npm` resolves to npm.ps1, which mangles the
# argument list — `npm run build:business:cap` arrives as the command "pm" and fails
# with an unrelated "supported npm commands" dump.
& npm.cmd run $buildScript | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { throw "$App web build failed" }
if (-not (Test-Path $dist)) { throw "$App produced no $dist" }

Write-Output "=== $App : mirroring $dist -> assets/public ==="
robocopy $dist $native /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
# robocopy uses exit codes 0-7 for success; 8+ is a real failure.
if ($LASTEXITCODE -ge 8) { throw "$App robocopy failed with $LASTEXITCODE" }
$fileCount = (Get-ChildItem -Recurse -File $native).Count
Write-Output "    $fileCount files in assets/public"
if ($fileCount -lt 3) { throw "$App assets/public looks empty ($fileCount files)" }

Write-Output "=== $App : gradle bundleRelease assembleRelease ==="
if (-not $env:JAVA_HOME) {
  $jbr = "C:\Program Files\Android\Android Studio\jbr"
  if (Test-Path $jbr) { $env:JAVA_HOME = $jbr }
}
Set-Location (Join-Path $repo $androidDir)
& $gradle --quiet bundleRelease assembleRelease
if ($LASTEXITCODE -ne 0) { throw "$App gradle build failed" }
Set-Location $repo

$aab = Join-Path $repo "$androidDir\app\build\outputs\bundle\release\app-release.aab"
$apk = Join-Path $repo "$androidDir\app\build\outputs\apk\release\app-release.apk"
foreach ($f in @($aab, $apk)) {
  if (-not (Test-Path $f)) { throw "$App did not produce $f" }
}

# ── Step 4: prove it is the release key ──────────────────────────────────────
# Worth doing every time rather than trusting the gradle config: signingConfig is
# applied only `if (hasKeystore)`, so a missing or misread keystore.properties yields a
# perfectly ordinary-looking UNSIGNED or debug-signed build, and Play rejects it only
# after upload.
$DEBUG_SHA = '8dd44b15299d20c04df269cb069445204b1ea34e2b4d879be783945cf6e432da'
$apksigner = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools\*\apksigner.bat" -ErrorAction SilentlyContinue |
             Sort-Object FullName | Select-Object -Last 1
if ($apksigner) {
  $certs = & $apksigner.FullName verify --print-certs $apk 2>&1 | Out-String
  if ($certs -match 'Signer #1 certificate SHA-256 digest:\s*([0-9a-f]+)') {
    $sha = $Matches[1]
    if ($sha -eq $DEBUG_SHA) { throw "$App release APK is DEBUG-signed - keystore not applied" }
    Write-Output "=== $App : signed with $($sha.Substring(0,16))... (not debug) OK"
  } else {
    throw "$App release APK appears UNSIGNED - keystore not applied"
  }
} else {
  Write-Warning "apksigner not found - signature NOT verified for $App"
}

Write-Output ""
Write-Output "$App done:"
Write-Output "  AAB (Play)   $aab  $([math]::Round((Get-Item $aab).Length/1MB,2)) MB"
Write-Output "  APK (device) $apk  $([math]::Round((Get-Item $apk).Length/1MB,2)) MB"
