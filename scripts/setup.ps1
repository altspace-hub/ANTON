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

# ── Find psql on Windows ─────────────────────────────────────────────────────

function Find-Psql {
    # Check PATH first
    $inPath = Get-Command psql -ErrorAction SilentlyContinue
    if ($inPath) { return $inPath.Source }

    # Check common PostgreSQL install locations
    $pgDirs = @(
        "C:\Program Files\PostgreSQL",
        "C:\Program Files (x86)\PostgreSQL",
        "$env:ProgramFiles\PostgreSQL"
    )
    foreach ($base in $pgDirs) {
        if (Test-Path $base) {
            # Find the highest version
            $versions = Get-ChildItem $base -Directory | Sort-Object Name -Descending
            foreach ($ver in $versions) {
                $psqlPath = Join-Path $ver.FullName "bin\psql.exe"
                if (Test-Path $psqlPath) { return $psqlPath }
            }
        }
    }
    return $null
}

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

# ── Step 4: PostgreSQL — auto-detect and configure ────────────────────────────

Write-Blank
Write-Step 4 "Setting up PostgreSQL..."

# Re-read .env in case step 3 changed it
$envContent = Get-Content $envFile -Raw
$hasDbUrl = ($envContent -match '(?m)^\s*DATABASE_URL\s*=') -and ($envContent -notmatch '(?m)^\s*#\s*DATABASE_URL')

if ($hasDbUrl) {
    Write-OK "PostgreSQL already configured in .env"
} else {
    $psqlPath = Find-Psql

    if (-not $psqlPath) {
        Write-Fail "PostgreSQL not found."
        Write-Blank
        Write-Host "  ANTON requires PostgreSQL. Install it:" -ForegroundColor White
        Write-Host "    1. Download from https://www.postgresql.org/download/windows/" -ForegroundColor DarkCyan
        Write-Host "    2. Run the installer (use default port 5432)" -ForegroundColor DarkCyan
        Write-Host "    3. Set a password for the 'postgres' user when prompted" -ForegroundColor DarkCyan
        Write-Host "    4. Re-run this setup script after installation" -ForegroundColor DarkCyan
        Write-Blank
        Write-Info "Or install via:  winget install PostgreSQL.PostgreSQL"
        Write-Blank
        Read-Host "  Press Enter to close"
        exit 1
    }

    Write-Info "Found psql at: $psqlPath"

    # Default credentials for the ANTON database
    $pgUser     = "anton"
    $pgPassword = "anton"
    $pgDatabase = "anton"
    $pgHost     = "localhost"
    $pgPort     = "5432"

    # Ask for postgres superuser password to create the anton user/database
    Write-Blank
    Write-Host "  PostgreSQL found. Creating the ANTON database automatically." -ForegroundColor White
    Write-Host "  Enter the password for the 'postgres' superuser" -ForegroundColor DarkCyan
    Write-Host "  (the one you set when installing PostgreSQL):" -ForegroundColor DarkCyan
    Write-Blank
    $pgAdminPassword = Read-Host "  postgres password"
    $pgAdminPassword = $pgAdminPassword.Trim()

    # Set PGPASSWORD for non-interactive psql
    $env:PGPASSWORD = $pgAdminPassword

    # Create user (ignore error if already exists)
    Write-Info "Creating user '$pgUser'..."
    $createUserSql = "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$pgUser') THEN CREATE ROLE $pgUser WITH LOGIN PASSWORD '$pgPassword' CREATEDB; END IF; END `$`$;"
    & $psqlPath -h $pgHost -p $pgPort -U postgres -c $createUserSql 2>&1 | Out-Null

    # Create database (ignore error if already exists)
    Write-Info "Creating database '$pgDatabase'..."
    & $psqlPath -h $pgHost -p $pgPort -U postgres -c "SELECT 1 FROM pg_database WHERE datname = '$pgDatabase'" -t 2>&1 | Out-String | ForEach-Object {
        if ($_.Trim() -ne "1") {
            & $psqlPath -h $pgHost -p $pgPort -U postgres -c "CREATE DATABASE $pgDatabase OWNER $pgUser" 2>&1 | Out-Null
        }
    }

    # Clear admin password from environment
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

    # Test connection with the anton user
    $env:PGPASSWORD = $pgPassword
    $testResult = & $psqlPath -h $pgHost -p $pgPort -U $pgUser -d $pgDatabase -c "SELECT 1" -t 2>&1
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

    if ($testResult -match "1") {
        # Save DATABASE_URL to .env
        $dbUrl = "postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${pgDatabase}"
        if ($envContent -match '#\s*DATABASE_URL=') {
            $envContent = $envContent -replace '(?m)#\s*DATABASE_URL=.*', "DATABASE_URL=$dbUrl"
        } else {
            $envContent += "`nDATABASE_URL=$dbUrl`n"
        }
        Set-Content -Path $envFile -Value $envContent -NoNewline
        Write-OK "PostgreSQL database ready (anton@localhost:5432/anton)"
    } else {
        Write-Fail "Could not connect to PostgreSQL."
        Write-Info "Check that PostgreSQL is running and the postgres password is correct."
        Write-Info "You can add DATABASE_URL to .env manually:"
        Write-Info "  DATABASE_URL=postgresql://anton:anton@localhost:5432/anton"
        Write-Blank
        Read-Host "  Press Enter to close"
        exit 1
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

# ── Step 6: Ollama (embedding model) ─────────────────────────────────────────

Write-Blank
Write-Step 6 "Checking Ollama (for knowledge memory)..."
$ollamaVersion = & ollama --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-OK "Ollama $ollamaVersion"
    Write-Info "Pulling embedding model (nomic-embed-text)..."
    & ollama pull nomic-embed-text 2>&1 | Out-Null
    Write-OK "Embedding model ready"
} else {
    Write-Host "    >>  Ollama not found (optional — knowledge memory will not work)" -ForegroundColor Yellow
    Write-Info "Install from https://ollama.com then run: ollama pull nomic-embed-text"
}

# ── Step 7: Initialize database schema ────────────────────────────────────────

Write-Blank
Write-Step 7 "Initializing database schema..."
& pnpm run db:init
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Database initialization failed."
    Write-Info "Try running  pnpm run db:init  manually to see the full error."
    Write-Blank
    Read-Host "  Press Enter to close"
    exit 1
}
Write-OK "Database schema ready"

# ── Done ──────────────────────────────────────────────────────────────────────

Write-Blank
Write-Host "  +-----------------------------------------+" -ForegroundColor Green
Write-Host "  |                                         |" -ForegroundColor Green
Write-Host "  |   Setup complete! ANTON is ready.       |" -ForegroundColor Green
Write-Host "  |                                         |" -ForegroundColor Green
Write-Host "  +-----------------------------------------+" -ForegroundColor Green
Write-Blank
Write-Host "  To start ANTON:" -ForegroundColor White
Write-Host "    pnpm run dev            (development)" -ForegroundColor DarkCyan
Write-Host "    start-anton.bat         (production)" -ForegroundColor DarkCyan
Write-Blank
Write-Host "  Then open:  http://localhost:3001" -ForegroundColor DarkCyan
Write-Blank
Read-Host "  Press Enter to close"
