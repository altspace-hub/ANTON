# openEXPERT Deployment Guide

This guide covers all supported deployment modes for openEXPERT: local development, production local, Docker (solo), and team deployment with authentication.

---

## 1. Local Development

Local development runs two processes: the Vite dev server (frontend with HMR) and the Express API server.

### Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com)

### Setup

```bash
git clone https://github.com/altspace-hub/ANTON.git
cd openexpert

# Install dependencies
pnpm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env — at minimum set ANTHROPIC_API_KEY

# Initialise the SQLite database
pnpm run db:init

# Start both servers
pnpm run dev
```

The frontend is available at `http://localhost:5173`. The API runs at `http://localhost:3001`. Vite proxies all `/api` requests to the Express server automatically.

### Hot Reload

- Frontend: Vite HMR — React components reload instantly on save.
- Server: `tsx --watch` restarts the Express server on save.
- Database: Re-run `pnpm run db:init` only if you change `server/db/schema.sql`.

---

## 2. Production Local

For a single-machine production deployment (e.g. a consultant's laptop), build the frontend and serve everything from the Express server on a single port.

### Build

```bash
pnpm run build
```

This compiles the React app into `dist/` and the server TypeScript into `dist-server/`.

### Run

```bash
pnpm run start
```

The application is available at `http://localhost:3001` (or `PORT` if overridden). The Express server serves the React build as static files and handles all API routes.

### Running as a background process

Use a process manager to keep openEXPERT running after you close the terminal:

```bash
# Using pm2
npm install -g pm2
pm2 start "pnpm run start" --name openexpert
pm2 save
pm2 startup   # Follow the printed instructions to start on boot
```

---

## 3. Docker (Solo Mode)

Docker is the simplest way to run openEXPERT on any machine without installing Node.js or pnpm.

### Prerequisites

- Docker Desktop (Mac/Windows) or Docker Engine + Docker Compose (Linux)

### Quick start

```bash
git clone https://github.com/altspace-hub/ANTON.git
cd openexpert

# Set your API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Build and start
docker compose up --build
```

The application is available at `http://localhost:3001`.

### Volume mounts

The `docker-compose.yml` mounts three host directories so your data persists across container restarts:

| Host path | Container path | Purpose |
|---|---|---|
| `./data` | `/app/data` | SQLite database |
| `./uploads` | `/app/uploads` | Uploaded documents |
| `./outputs` | `/app/outputs` | Generated export files |

These directories are created automatically on first run. Back them up to preserve sessions, registered folders, and exports.

### Stopping and updating

```bash
# Stop
docker compose down

# Update to latest version
git pull
docker compose up --build
```

### Custom port

To run on a different port, set `PORT` in `.env` and update the `ports` mapping in `docker-compose.yml`:

```yaml
ports:
  - "8080:8080"   # host:container
```

---

## 4. Team Deployment

Team mode enables JWT-based authentication so multiple consultants can share a single openEXPERT instance. Each user has their own sessions and settings. Admins can view all sessions and the audit log.

### Requirements

- A Linux server or VM accessible on your office network (or VPN)
- Docker + Docker Compose (recommended) or Node.js 20+
- A reverse proxy (nginx or Caddy) — required for HTTPS in team mode
- A strong `JWT_SECRET` (minimum 32 random characters)

### Environment configuration for team mode

```bash
DEPLOYMENT_MODE=team
JWT_SECRET=replace-with-a-long-random-string-minimum-32-chars
JWT_EXPIRY=8h               # Session token lifetime (e.g. 1h, 8h, 24h)
CORS_ORIGINS=https://openexpert.yourcompany.com
PORT=3001
```

Generate a secure `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### First launch admin setup

On first launch in team mode, openEXPERT runs a setup wizard at `http://your-server:3001/setup`:

1. Set the admin username and password
2. Configure the instance name (shown in the UI header)
3. Optionally configure LDAP/SSO (future feature — currently manual user creation only)

After setup, navigate to Settings → Users to create accounts for your team.

### nginx reverse proxy

Install nginx and create a site configuration:

```nginx
server {
    listen 80;
    server_name openexpert.yourcompany.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name openexpert.yourcompany.com;

    # SSL certificates — use certbot or your internal CA
    ssl_certificate     /etc/letsencrypt/live/openexpert.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/openexpert.yourcompany.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    # Proxy to openEXPERT
    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;

        # Required for SSE streaming (Claude responses)
        proxy_set_header   Connection '';
        proxy_buffering    off;
        proxy_cache        off;
        chunked_transfer_encoding on;

        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;

        # Increase timeout for long analyses
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Reload nginx: `sudo nginx -s reload`

### User roles

| Role | Permissions |
|---|---|
| `admin` | All modules, all sessions (own + others), audit log, user management, settings |
| `consultant` | All modules, own sessions only, export |
| `viewer` | Read-only: view sessions shared with them, no run or export |

---

## 5. Environment Variables Reference

All variables are set in `.env` (development) or passed as environment variables in production/Docker.

### Required

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key. Get one at console.anthropic.com. Starts with `sk-ant-`. |

### Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the Express server listens on. |
| `DEPLOYMENT_MODE` | `solo` | `solo` (no auth) or `team` (JWT auth). |
| `JWT_SECRET` | — | Required when `DEPLOYMENT_MODE=team`. Minimum 32 characters. Keep secret. |
| `JWT_EXPIRY` | `8h` | How long a login session lasts. Uses ms/zeit format: `1h`, `8h`, `7d`. |
| `CORS_ORIGINS` | `http://localhost:3001,http://localhost:5173` | Comma-separated allowed origins for CORS. Set to your domain in production. |

### Storage

| Variable | Default | Description |
|---|---|---|
| `UPLOAD_DIR` | `./uploads` | Directory for user-uploaded files. Must be writable by the server process. |
| `OUTPUT_DIR` | `./outputs` | Directory for generated export files (.docx, .xlsx, .pdf, .pptx). |
| `DATABASE_URL` | — (required) | PostgreSQL connection string, e.g. `postgresql://anton:anton@localhost:5432/anton`. |
| `MAX_FILE_SIZE_MB` | `50` | Maximum size for a single uploaded file in megabytes. |

### AI Defaults

These apply when a user has not overridden the setting for their session.

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_MODEL` | `claude-opus-4-8` | Default Claude model. Options: `claude-opus-4-8`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001`. |
| `DEFAULT_THINKING` | `think_hard` | Default thinking level. Options: `quick`, `think`, `think_hard`, `investigate`, `plan_first`. |
| `DEFAULT_CREATIVITY` | `balanced` | Default creativity level. Options: `strict`, `balanced`, `creative`. |
| `MAX_CONTEXT_TOKENS` | `180000` | Maximum tokens to include in a single request. Warn at 80% (144,000 tokens). |

### Multi-LLM Providers (optional)

Setting these keys enables the corresponding models in the model selector. openEXPERT routes requests to the appropriate SDK based on the selected model.

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key. Enables GPT-4o and GPT-4o-mini. |
| `GOOGLE_API_KEY` | Google AI API key. Enables Gemini 1.5 Pro and Gemini 1.5 Flash. |
| `MISTRAL_API_KEY` | Mistral API key. Enables Mistral Large and Mistral Small. |

---

## Troubleshooting

**The app loads but Claude calls fail.**
Check that `ANTHROPIC_API_KEY` is set correctly in `.env` and that the key is active. Test it: `curl https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -d '{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'`

**Streaming responses stop mid-way.**
If using nginx, ensure `proxy_buffering off` and `proxy_read_timeout 300s` are set. Claude analyses can take 2–3 minutes for complex tasks.

**Database errors on startup.**
Run `pnpm run db:init` to create or migrate the database schema. This is safe to run multiple times.

**Uploaded files are not extracted.**
Ensure `UPLOAD_DIR` is writable. For PDF extraction, check that Puppeteer's Chromium binary is present: `node -e "require('puppeteer')"`.

**Docker: permission errors on volume mounts.**
Run `mkdir -p data uploads outputs && chmod 777 data uploads outputs` on the host before `docker compose up`.
