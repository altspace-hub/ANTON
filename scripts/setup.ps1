# ANTON Setup Script
# Runs from scripts/ — repo root is one level up
$RepoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $RepoRoot

# ── Helpers ───────────────────────────────────────────────────────────────────

function Write-Step($n, $msg) { Write-Host "  [$n/7] $msg" -ForegroundColor Cyan }
function Write-OK($msg)       { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Fail($msg)     { Write-Host "  FAIL  $msg" -ForegroundColor Red }
function Write-Info($msg)     { Write-Host "        $msg" -ForegroundColor DarkGray }
function Write-Blank          { Write-Host "" }

# ── Banner ────────────────────────────────────────────────────────────────────

Clear-Host
Write-Host ""
Write-Host "  +-----------------------------------------+" -ForegroundColor DarkCyan
Write-Host "  |                                         |" -ForegroundColor DarkCyan
Write-Host "  |   ANTON  --  First-Time Setup           |" -ForegroundColor Cyan
Write-Host "  |                                         |" -ForegroundColor DarkCyan
Write-Host "  +-----------------------------------------+" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  This takes about 2-3 minutes." -ForegroundColor DarkGray
Write-Host "  You only need to do this once per computer." -ForegroundColor DarkGray
Write-Blank

# ── Step 1: Node.js ───────────────────────────────────────────────────────────

Write-Step 1 "Checking Node.js..."
try {
    $nodeRaw = & node --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "not found" }
    $major = [int]($nodeRaw -replace 'v(\d+)\..*', '$1')
    if ($major -lt 20) {
        Write-Fail "Node.js $nodeRaw is too old. ANTON requires v20+."
        Write-Blank
        Write-Info "Run this in a terminal to upgrade, then re-run setup:"
        Write-Info ""
        Write-Info "    winget upgrade OpenJS.NodeJS.LTS"
        Write-Blank
        Write-Info "Close and reopen the terminal after upgrading."
        Write-Blank
        Read-Host "  Press Enter to close"
        exit 1
    }
    Write-OK "Node.js $nodeRaw"
} catch {
    Write-Fail "Node.js not found."
    Write-Blank
    Write-Info "Install it from https://nodejs.org  (choose the LTS version)"
    Write-Info "Or run:  winget install OpenJS.NodeJS.LTS"
    Write-Info ""
    Write-Info "Then close and reopen this window and run setup again."
    Write-Blank
    Read-Host "  Press Enter to close"
    exit 1
}

# ── Step 2: pnpm ──────────────────────────────────────────────────────────────

Write-Step 2 "Checking pnpm..."
$pnpmRaw = & pnpm --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "        pnpm not found -- installing..." -ForegroundColor DarkGray
    & npm install -g pnpm | Out-Null
    $pnpmRaw = & pnpm --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Could not install pnpm automatically."
        Write-Info "Run this manually then re-run setup:  npm install -g pnpm"
        Write-Blank
        Read-Host "  Press Enter to close"
        exit 1
    }
    Write-OK "pnpm $pnpmRaw  (just installed)"
} else {
    Write-OK "pnpm $pnpmRaw"
}

# ── Step 3: API key ───────────────────────────────────────────────────────────

Write-Step 3 "Configuring API key..."
$envFile    = Join-Path $RepoRoot ".env"
$envExample = Join-Path $RepoRoot ".env.example"

# Create .env from example if it doesn't exist
if (-not (Test-Path $envFile)) {
    Copy-Item $envExample $envFile
}

$envContent = Get-Content $envFile -Raw

# Check whether the key is still the placeholder
$placeholderPattern = 'ANTHROPIC_API_KEY=sk-ant-\.\.\.'
$hasPlaceholder = $envContent -match $placeholderPattern

if ($hasPlaceholder) {
    Write-Blank
    Write-Host "  Claude needs your Anthropic API key to work." -ForegroundColor White
    Write-Host "  Get one free at: https://console.anthropic.com" -ForegroundColor DarkCyan
    Write-Blank
    $apiKey = Read-Host "  Paste your API key (starts with sk-ant-)"
    $apiKey  = $apiKey.Trim()

    if ($apiKey -match '^sk-ant-') {
        $envContent = $envContent -replace [regex]::Escape('ANTHROPIC_API_KEY=sk-ant-...'), "ANTHROPIC_API_KEY=$apiKey"
        Set-Content -Path $envFile -Value $envContent -NoNewline
        Write-OK "API key saved to .env"
    } else {
        Write-Host "    >>  Key doesn't look right (should start with sk-ant-)." -ForegroundColor Yellow
        Write-Host "        You can edit .env manually later and paste it there." -ForegroundColor DarkGray
    }
} else {
    Write-OK "API key already set in .env"
}

# ── Step 4: Database choice (PostgreSQL or SQLite) ────────────────────────────

Write-Blank
Write-Step 4 "Configuring database..."

$envContent = Get-Content $envFile -Raw
$hasDbUrl = $envContent -match '^\s*DATABASE_URL\s*=' -and $envContent -notmatch '^\s*#\s*DATABASE_URL'

if ($hasDbUrl) {
    Write-OK "PostgreSQL already configured in .env"
} else {
    Write-Host ""
    Write-Host "  ANTON supports two database modes:" -ForegroundColor Cyan
    Write-Host "    [1] PostgreSQL  (recommended — required for team mode & Azure OpenAI)" -ForegroundColor White
    Write-Host "    [2] SQLite      (simple local mode — no setup needed)" -ForegroundColor DarkGray
    Write-Host ""
    $dbChoice = Read-Host "  Choose database [1/2] (default: 1)"

    if ($dbChoice -eq '2') {
        Write-OK "Using SQLite (local mode)"
    } else {
        Write-Host ""
        Write-Host "  PostgreSQL connection string format:" -ForegroundColor DarkCyan
        Write-Host "    postgresql://username:password@localhost:5432/database_name" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "  If PostgreSQL is not installed yet:" -ForegroundColor DarkCyan
        Write-Host "    1. Download from https://www.postgresql.org/download/" -ForegroundColor DarkGray
        Write-Host "    2. During install, set a password for the 'postgres' user" -ForegroundColor DarkGray
        Write-Host "    3. Open pgAdmin or psql and run:" -ForegroundColor DarkGray
        Write-Host "       CREATE USER anton WITH PASSWORD 'your_password';" -ForegroundColor Yellow
        Write-Host "       CREATE DATABASE anton OWNER anton;" -ForegroundColor Yellow
        Write-Host ""
        $dbUrl = Read-Host "  Paste your PostgreSQL connection string"
        $dbUrl = $dbUrl.Trim()

        if ($dbUrl -match '^postgres') {
            # Add DATABASE_URL to .env (uncomment or append)
            if ($envContent -match '#\s*DATABASE_URL=') {
                $envContent = $envContent -replace '#\s*DATABASE_URL=.*', "DATABASE_URL=$dbUrl"
            } else {
                $envContent += "`nDATABASE_URL=$dbUrl`n"
            }
            Set-Content -Path $envFile -Value $envContent -NoNewline
            Write-OK "PostgreSQL connection saved to .env"
        } else {
            Write-Host "    >>  Doesn't look like a PostgreSQL URL. Falling back to SQLite." -ForegroundColor Yellow
            Write-Host "        You can add DATABASE_URL to .env manually later." -ForegroundColor DarkGray
        }
    }
}

# ── Step 5: Install dependencies ──────────────────────────────────────────────

Write-Blank
Write-Step 5 "Installing dependencies  (1-2 min on first run)..."
& pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Dependency installation failed."
    Write-Info "Try running  pnpm install  manually to see the full error."
    Write-Blank
    Read-Host "  Press Enter to close"
    exit 1
}
Write-OK "Dependencies installed"

# ── Step 6: Database initialization ───────────────────────────────────────────

Write-Blank
Write-Step 6 "Setting up database..."
& pnpm run db:init
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Database setup failed."
    Write-Info "Try running  pnpm run db:init  manually to see the full error."
    Write-Blank
    Read-Host "  Press Enter to close"
    exit 1
}
Write-OK "Database ready"

# ── Step 7: Build ─────────────────────────────────────────────────────────────

Write-Blank
Write-Step 7 "Building ANTON  (~30 seconds)..."
$env:ANTHROPIC_API_KEY = if ($apiKey -and $apiKey -match '^sk-ant-') { $apiKey } else { "sk-ant-placeholder-for-build" }
& pnpm run build
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Build failed."
    Write-Info "Run  pnpm run build  manually to see the full error."
    Write-Blank
    Read-Host "  Press Enter to close"
    exit 1
}
Write-OK "Build complete"

# ── Done ──────────────────────────────────────────────────────────────────────

Write-Blank
Write-Host "  +-----------------------------------------+" -ForegroundColor Green
Write-Host "  |                                         |" -ForegroundColor Green
Write-Host "  |   Setup complete! ANTON is ready.       |" -ForegroundColor Green
Write-Host "  |                                         |" -ForegroundColor Green
Write-Host "  +-----------------------------------------+" -ForegroundColor Green
Write-Blank
Write-Host "  To start ANTON:  double-click  start-anton.bat" -ForegroundColor White
Write-Host "  Then open:       http://localhost:3001" -ForegroundColor DarkCyan
Write-Blank
Read-Host "  Press Enter to close"
