# ANTON by openEXPERT — Windows Setup Guide

Complete step-by-step guide for setting up ANTON on a fresh Windows machine.

---

## Prerequisites

### 1. Node.js v22+

```powershell
winget install OpenJS.NodeJS.LTS
```

Verify: `node --version` (v22+ required)

### 2. pnpm

```bash
npm install -g pnpm
```

### 3. PostgreSQL 16+

```powershell
winget install PostgreSQL.PostgreSQL.16
```

During installation, remember the `postgres` superuser password. Default port 5432 is fine.

Add to PATH: `C:\Program Files\PostgreSQL\16\bin`

### 4. Python 3.x

```powershell
winget install Python.Python.3.13
```

Check "Add Python to PATH" during installation. The Windows Store `python` stub does NOT count.

### 5. Visual Studio Build Tools 2022

Required for compiling native Node.js modules:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

~2 GB download, takes several minutes with no progress bar.

### 6. Ollama (optional — for knowledge memory)

Download from [ollama.com](https://ollama.com), then:

```bash
ollama pull nomic-embed-text
```

### 7. Anthropic API Key

Get from [console.anthropic.com](https://console.anthropic.com) — starts with `sk-ant-...`

---

## Installation

### Automatic Setup (Recommended)

```bash
git clone https://github.com/altspace-hub/ANTON.git
cd ANTON
setup-anton.bat
```

The setup wizard handles everything: dependency checks, database creation, env config, schema init.

### Manual Setup

#### Step 1: Clone and install

```bash
git clone https://github.com/altspace-hub/ANTON.git
cd ANTON
pnpm install
```

#### Step 2: Create the PostgreSQL database

```bash
psql -U postgres -h localhost
```

```sql
CREATE USER anton WITH PASSWORD 'anton_dev';
CREATE DATABASE anton OWNER anton;
\q
```

#### Step 3: Configure environment

```bash
cp .env.example .env
```

Edit `.env` — set at minimum:

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
DATABASE_URL=postgresql://anton:anton_dev@localhost:5432/anton
```

#### Step 4: Initialize database

```bash
pnpm run db:init
```

#### Step 5: Start

```bash
pnpm run dev
```

Opens:
- **Frontend**: http://localhost:5183
- **Backend**: http://localhost:3001 (or whatever PORT is set to in .env)

---

## Ports

| Service | Default Port | Config |
|---------|-------------|--------|
| Express API | 3001 | `PORT` in `.env` |
| Vite dev server | 5183 | `vite.config.ts` |
| PostgreSQL | 5432 | Standard |
| Ollama | 11434 | Standard |

The Vite proxy automatically forwards `/api/*` requests to the Express port.

---

## ANTON-to-ANTON Connection (P2P)

To connect two ANTON instances on the same network:

### On both machines:

1. Add to `.env`:
   ```env
   ALLOW_PRIVATE_P2P=true
   ```

2. Open Windows Firewall for the Express port:
   ```powershell
   New-NetFirewallRule -DisplayName "ANTON P2P" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
   ```

3. Restart ANTON

### Setup connection:

1. **Community > Identity** — activate identity, copy Contact Hash + Encryption Key
2. **Community > Contacts > Add Contact** — paste the other machine's Contact Hash, Public Key, Encryption Key, and P2P Endpoint (`http://<IP>:<PORT>`)
3. Do this on BOTH machines (mutual trust required)
4. **Click "Test Connection"** to verify all 4 checks pass

### For cross-network connections:

Set up a public relay (see `PUBLIC_RELAY_URL` in `.env.example`) or use port forwarding / VPN.

---

## Troubleshooting

### `gyp ERR! find VS` during pnpm install

Install Visual Studio Build Tools (prerequisite #5).

### Port already in use

Change `PORT` in `.env`. The Vite proxy auto-detects the port.

### PostgreSQL connection refused

- Check the service is running: `services.msc` > postgresql
- Verify credentials: `psql -U anton -d anton -h localhost`

### P2P messages not delivering

1. Check firewall: `New-NetFirewallRule` (see above)
2. Check endpoint port matches the other machine's `PORT`
3. Use **Test Connection** button in Contacts to diagnose
4. Both machines must have each other as contacts

### Migration failures

Some Layer 3 migrations may fail on first run — this is expected. Core features work. Restart the server to resolve interdependencies.

---

## Summary

| Software | Version | Required |
|----------|---------|----------|
| Node.js | 22+ | Yes |
| pnpm | 10+ | Yes |
| PostgreSQL | 16+ | Yes |
| Python | 3.x | Yes |
| VS Build Tools 2022 | Latest | Yes |
| Anthropic API Key | — | Yes |
| Ollama | Latest | Optional |
