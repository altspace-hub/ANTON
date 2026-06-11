# ANTON by openEXPERT

AI-powered expert workspace for professionals. Combines Claude's full capabilities with a visual, guided interface — modular knowledge sources, structured output formats, and area-specific expertise. No command-line knowledge required.

---

## Before you start — read the whitepaper

The whitepaper **"ANTON by openEXPERT"** is included in this folder as a PDF (`ANTON by openEXPERT whitepaper.pdf`). It explains the thinking behind ANTON, how AI and the platform work together, and lays the groundwork for understanding what you're setting up. If you're new to ANTON or AI tools in general, reading it first will make everything below make much more sense.

Once the app is running you can also open it at [http://localhost:3001/ANTON%20by%20openEXPERT%20whitepaper.pdf](http://localhost:3001/ANTON%20by%20openEXPERT%20whitepaper.pdf).

---

## Quick Start

### Option A — Windows launcher (recommended for most users)

#### Step 1 — Install Git

Git is the tool used to download and update ANTON from GitHub. **If you're not sure whether you have it, you probably don't.** Download and install it from:

> **[https://git-scm.com/download/win](https://git-scm.com/download/win)**

Run the installer with all default options — just keep clicking Next.

#### Step 2 — Install Node.js

Node.js is the engine that runs ANTON. Download and install **Node.js 22 LTS** from:

> **[https://nodejs.org](https://nodejs.org)** (choose the "LTS" button)

Run the installer with all default options.

#### Step 3 — Install Ollama (knowledge memory)

Ollama runs a local embedding model that powers ANTON's knowledge memory — the system that remembers insights from your previous work and uses them to improve future results. Download and install from:

> **[https://ollama.com](https://ollama.com)**

After installing, open a terminal and run:

```bash
ollama pull nomic-embed-text
```

This downloads the embedding model (~270 MB). Ollama runs in the background automatically after installation.

#### Step 4 — Restart your computer

**This step is important.** After installing Git, Node.js, and Ollama, restart your computer before continuing. The installers register themselves with Windows during restart — skipping this is the most common reason setup fails and things aren't recognised.

#### Step 5 — Clone and set up ANTON

Open a terminal (search for **"Command Prompt"** or **"PowerShell"** in the Start menu), then run:

```bash
git clone https://github.com/altspace-hub/ANTON.git
cd ANTON
```

Then double-click **`setup-anton.bat`** in the ANTON folder (or run it in the terminal).

The script handles everything automatically:
- Checks your Node.js version
- Installs pnpm if it's missing
- Creates `.env` from the template and **prompts you for your Anthropic API key**
- Runs `pnpm install`, `pnpm run db:init`, and `pnpm run build`

Get your API key at [console.anthropic.com](https://console.anthropic.com).

#### Step 6 — Run ANTON

Double-click **`start-anton.bat`** every time you want to use ANTON.

ANTON starts and your browser opens automatically at [http://localhost:3001](http://localhost:3001).

To stop: press `Ctrl+C` in the terminal window, or just close it.

---

### Troubleshooting

#### `'pnpm' is not recognized` / `command not found: pnpm`

This means pnpm isn't on your PATH yet. Try in order:

1. **Close the terminal and open a new one** — sometimes just reopening is enough after the setup script ran.
2. If that doesn't work, run this in the terminal:
   ```
   npm install -g pnpm
   ```
   Then close and reopen the terminal and try again.
3. If `npm` itself isn't recognised, your Node.js installation didn't register properly — **restart your computer** and try again.

#### `'git' is not recognized`

Git wasn't installed or hasn't registered yet. Download it from [git-scm.com](https://git-scm.com/download/win), install with defaults, then **restart your computer**.

#### `'node' is not recognized`

Same as above for Node.js — download from [nodejs.org](https://nodejs.org), install with defaults, then **restart your computer**.

#### Setup script ran but the app won't start

1. Make sure you ran `setup-anton.bat` first (not just `start-anton.bat`).
2. Check that your `.env` file exists in the ANTON folder and contains your API key (`ANTHROPIC_API_KEY=sk-ant-...`).
3. Try running `pnpm run build` in the terminal from the ANTON folder, then try `start-anton.bat` again.

---

### Option B — Docker

**Requirements:** Docker Desktop

```bash
# 1. Clone the repository
git clone https://github.com/altspace-hub/ANTON.git
cd ANTON

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

**Requirements:** Node.js 22+, pnpm, Ollama

```bash
# 1. Clone and install
git clone https://github.com/altspace-hub/ANTON.git
cd ANTON
pnpm install

# 2. Install Ollama for knowledge memory (https://ollama.com)
ollama pull nomic-embed-text

# 3. Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 4. Initialise database
pnpm run db:init

# 5. Start development server
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
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (`postgresql://anton:anton@localhost:5432/anton`) |
| `UPLOAD_DIR` | No | `./uploads` | File upload storage |
| `OUTPUT_DIR` | No | `./outputs` | Generated export storage |
| `MAX_FILE_SIZE_MB` | No | `50` | Maximum upload size |
| `MAX_CONTEXT_TOKENS` | No | `180000` | Context window budget |
| `DEFAULT_MODEL` | No | `claude-opus-4-8` | Default model (the Settings picker overrides this) |
| `CORS_ORIGINS` | No | `http://localhost:3001,http://localhost:5173` | Allowed CORS origins (comma-separated) |

**No Anthropic key, or on a budget?** ANTON runs on Mistral (~$0.10–0.50/1M
tokens), free local Ollama models, or OpenRouter/Groq/DeepSeek endpoints —
see [Running ANTON on Cost-Effective Models](docs/RUN_ON_CHEAP_MODELS.md) for
setup and an honest capability table.

---

## Project Structure

```
ANTON/
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
