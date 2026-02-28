# ANTON by openEXPERT

AI-powered expert workspace for professionals. Combines Claude's full capabilities with a visual, guided interface — modular knowledge sources, structured output formats, and area-specific expertise. No command-line knowledge required.

---

## Quick Start

### Option A — Windows launcher (easiest)

**Prerequisites (one-time, manual):**

Install **Node.js 22+** from [nodejs.org](https://nodejs.org) (choose the LTS installer).
Already have Node but on an older version? Upgrade in a terminal:
```
winget upgrade OpenJS.NodeJS.LTS
```
Close and reopen the terminal afterwards. Confirm with `node --version` — should show v20 or higher.

**One-time setup — clone and run the setup script:**

```bash
git clone https://github.com/altspace-hub/ANTON.git
cd ANTON
```

Then double-click **`setup-anton.bat`** (or run it in a terminal).

The script handles everything automatically:
- Checks your Node.js version
- Installs pnpm if it's missing
- Creates `.env` from the template and **prompts you for your Anthropic API key**
- Runs `pnpm install`, `pnpm run db:init`, and `pnpm run build`

Get your API key at [console.anthropic.com](https://console.anthropic.com).

**Every time you want to run ANTON:**

Double-click **`start-anton.bat`**.

ANTON starts and your browser opens automatically at [http://localhost:3001](http://localhost:3001).

To stop: press `Ctrl+C` in the terminal window.

---

### Option B — Docker

**Requirements:** Docker Desktop

```bash
# 1. Clone the repository
git clone <repo-url>
cd openexpert

# 2. Set your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# 3. Start
docker compose up

# App is now running at http://localhost:3001
```

To stop: `docker compose down`
To update: `git pull && docker compose up --build`

Data (sessions, uploads) persists in named Docker volumes across restarts.

---

### Option C — Native (pnpm)

**Requirements:** Node.js 22+, pnpm

```bash
# 1. Clone and install
git clone <repo-url>
cd openexpert
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Initialise database
pnpm run db:init

# 4. Start development server
pnpm run dev
# Client: http://localhost:5173  |  API: http://localhost:3001

# OR start in production mode (builds client first)
pnpm run build && pnpm start
# App: http://localhost:3001
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | — | Your Anthropic API key (`sk-ant-...`) |
| `PORT` | No | `3001` | Server port |
| `DB_PATH` | No | `./data/workbench.sqlite` | SQLite database location |
| `UPLOAD_DIR` | No | `./uploads` | File upload storage |
| `OUTPUT_DIR` | No | `./outputs` | Generated export storage |
| `MAX_FILE_SIZE_MB` | No | `50` | Maximum upload size |
| `MAX_CONTEXT_TOKENS` | No | `180000` | Context window budget |
| `DEFAULT_MODEL` | No | `claude-opus-4-6` | Default Claude model |
| `CORS_ORIGINS` | No | `http://localhost:3001,http://localhost:5173` | Allowed CORS origins (comma-separated) |

---

## Project Structure

```
openexpert/
├── server/                    # Express API server (TypeScript)
│   ├── index.ts               # Entry point
│   ├── routes/                # API routes (claude, files, folders, export, modules)
│   ├── services/              # Core services (prompt-composer, knowledge-resolver, exporters)
│   ├── areas/                 # Area & module configs (JSON + Markdown)
│   │   └── fcp/               # Financial Crime Prevention area
│   │       ├── area.json
│   │       ├── area-context.md
│   │       └── modules/[module-id]/
│   │           ├── module.json
│   │           └── system-prompt.md
│   └── db/                    # SQLite schema & init
├── src/                       # React frontend (TypeScript + Tailwind)
│   ├── components/            # UI components
│   ├── pages/                 # Route pages
│   ├── stores/                # Zustand state
│   ├── hooks/                 # React hooks
│   └── lib/                   # API client, types, constants
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Adding a New Module

No code changes required. Create two files:

```
server/areas/fcp/modules/my-module/
├── module.json       # Config: id, label, defaults, guidedInputs
└── system-prompt.md  # Claude's expert role and instructions
```

The module-loader scans directories at startup and serves the new module automatically.

---

## Adding a New Area

1. Create `server/areas/[area-id]/area.json` (area metadata)
2. Create `server/areas/[area-id]/area-context.md` (domain context prompt)
3. Add modules under `server/areas/[area-id]/modules/`

The area appears in the API (`GET /api/areas`) immediately.

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Zustand
- **Backend:** Node.js + Express + TypeScript (tsx)
- **AI:** Anthropic Claude API (`@anthropic-ai/sdk`) — streaming, adaptive thinking, web search
- **Storage:** SQLite (`better-sqlite3`) — sessions, messages, folder registry
- **Exports:** DOCX (`docx`), XLSX (`exceljs`), PDF (`pdfkit`)

---

## Security

[![Security Audit](https://github.com/altspace-hub/ANTON/actions/workflows/security.yml/badge.svg)](https://github.com/altspace-hub/ANTON/actions/workflows/security.yml)

- CORS restricted to localhost by default
- Security headers via `helmet` (CSP, X-Frame-Options, etc.)
- Rate limiting: 300 req/15min general, 60 req/15min for Claude endpoint
- SSRF protection on URL fetching (blocks private/loopback addresses)
- Path traversal protection on folder access
- API key is server-side only — never sent to the client
- Automated dependency vulnerability scanning
- License compliance checking

### Security Documentation

- [Dependency Policy](docs/DEPENDENCY_POLICY.md) — Update schedules, license rules, approval process
- [Security Audit Guide](docs/SECURITY_AUDIT.md) — Running audits, vulnerability response, CI/CD
- [License Report](LICENSES.csv) — Generated via `pnpm run licenses:report`

### Running Security Checks

```bash
# Full security audit (vulnerabilities + licenses + outdated packages)
pnpm run audit:full

# Fix auto-fixable vulnerabilities
pnpm run audit:fix

# Generate license report
pnpm run licenses:report

# Generate vulnerability report
pnpm run security:report

# Check for outdated packages
pnpm run outdated
```

---

## Development

```bash
pnpm run dev          # Start client + server with hot reload
pnpm run typecheck    # TypeScript type check (zero errors = good)
pnpm run build        # Build for production
```

---

*ANTON by openEXPERT — built by FutureChain AB*
