# Public demo on a Linux VM (OpenRouter)

This runbook sets up ANTON as a public showcase: strangers sign up with an invite code and try the Work modules. The AI is one OpenRouter key with a spending limit. It is written for an Ubuntu 24.04 VM at Bahnhof, but any Linux VM works.

What you get:

- **Visitors sign up with an invite code.** They choose a username and a password. No email address is asked for. Google and GitHub sign-in are off.
- **Visitors reach the Work modules only.** Every other API route answers 404 to anyone who is not an administrator. You can open more pillars or routes in the `.env`.
- **Accounts expire.** After `DEMO_ACCOUNT_TTL_DAYS` (default 30) an account is deleted, with its sessions, answers, uploads and log rows.
- **ANTON does not learn from visitors.** Memory learning is off. Markets, the missions runner, the memory sweep and radar automation do not run.
- **Spending is capped in four places.** The OpenRouter key has a hard credit limit. ANTON has a daily cap for the whole server and one per visitor, and sign-ups are limited per address and per day. Each account also has a monthly token budget.
- **Visitors see a banner.** It says "Demo — do not enter personal or client data" and links a privacy notice.

> **Before you open it to the public.** The privacy notice at `/privacy` is a **draft**. A lawyer must review it, and you must fill in the placeholders: controller, contact, legal bases and transfer safeguards. Visitors' prompts go to OpenRouter, Inc. in the USA and on to the model provider. Plan a short DPIA for that. The existing hosted-ANTON plans do not cover this demo, because they assume no AI and no transfers outside the EU.

## What runs where

```
visitor ──https──▶ nginx (TLS, :443) ──▶ ANTON (Node 22, 127.0.0.1:3001)
                                          ├─▶ PostgreSQL 16 (127.0.0.1:5432, database anton_demo)
                                          ├─▶ Ollama (127.0.0.1:11434, nomic-embed-text only, CPU)
                                          └─▶ OpenRouter (https://openrouter.ai/api/v1) — the only model provider
```

- **Keep it separate.** Use its own VM and its own database. Do not put it on the `connect.anton.network` messaging host: that brief rules out AI and Work modules.
- **No Anthropic key, no subscription engine.** Leave `ANTHROPIC_API_KEY` unset and do not enable the SDK or Codex engine. With either one, visitors would run Claude on your account.

## 1. OpenRouter account

Do these in the OpenRouter dashboard. The labels below were right when this was written; check them against the current UI.

1. **A dedicated API key** for the demo, so you can revoke it without touching anything else.
2. **A credit limit on that key, reset daily.** For example $3 a day, about $90 a month. This is the hard stop: when it is used up, OpenRouter refuses calls and ANTON shows visitors a "budget used up" message.
3. **A guardrail on the key** with:
   - **Models:** only the offered models, for example `z-ai/glm-5.3-flash`.
   - **Providers:** only the pinned EU providers, `inceptron` (Sweden, data centre in Finland) and `nextbit` (Spain).
   ANTON also enforces the model list itself (the endpoint's *allowed models*). The guardrail is the second lock.
4. **Privacy settings:** use zero-data-retention (ZDR) endpoints only, and turn off providers that may store or train on inputs. ANTON also asks for this on every call through the endpoint's extra body (section 5).

A signed data processing agreement (DPA) is only available on OpenRouter's enterprise tier. Requests pass through OpenRouter Inc. in the USA even when the model runs in the EU. The privacy notice has to say so.

## 2. The VM

### Size

The models run at OpenRouter, so the VM does no AI work apart from Ollama's small embedding model. It needs no GPU.

| | Minimum | Recommended |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | 4 GB, if you build elsewhere | 8 GB |
| SSD | 40 GB | 80 GB |

- **Memory:**
  - The ANTON process uses about 400 MB at rest (measured 2026-09-25, demo mode, background jobs off), and more while it reads a large PDF or writes an export.
  - Add PostgreSQL (0.5–1 GB), Ollama with `nomic-embed-text` (about 0.5 GB) and the OS.
  - The peak is the production build (`pnpm run build`: TypeScript plus Vite). Give it 4 GB of Node heap (`NODE_OPTIONS=--max-old-space-size=4096`), or build on another machine and copy `dist/`.
- **Disk:**
  - The code with its dependencies is about 3.5 GB (`node_modules` alone is 2.5 GB).
  - Add the 20 GB filesystem for visitors' files below, PostgreSQL, logs, the OS and room for backups.
- **CPU:**
  - Two vCPUs carry a handful of visitors at once: while an answer streams, the server mostly waits on OpenRouter.
  - Four leave room to read uploads and write exports while others' answers stream.
- **Watch it for the first week** (`free -m`, `systemd-cgtop`), then resize. OpenRouter's rate limits (section 5) will bind long before the VM does.

```bash
# As root, once
adduser --disabled-password --gecos "" anton
apt update && apt -y full-upgrade && apt -y install unattended-upgrades ufw nginx certbot python3-certbot-nginx git curl
dpkg-reconfigure -plow unattended-upgrades

# Firewall: SSH (ideally from your own address only), HTTP for the certificate, HTTPS
ufw default deny incoming
ufw allow from <your IP> to any port 22 proto tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

- **SSH:** key-only. Set `PasswordAuthentication no` in `/etc/ssh/sshd_config`.
- **Open ports:** only 80 and 443 are public. ANTON, PostgreSQL and Ollama listen on 127.0.0.1.

### Keep visitors' files off PostgreSQL's disk

Uploads and exports are written by visitors. Put them on their own, size-limited filesystem, so that if it fills, uploads fail and PostgreSQL does not:

```bash
# A 20 GB filesystem for /srv/anton (uploads, exports, workspaces, backups)
fallocate -l 20G /var/lib/anton-files.img
mkfs.ext4 -q -F /var/lib/anton-files.img
mkdir -p /srv/anton
echo '/var/lib/anton-files.img /srv/anton ext4 loop,nodev,nosuid 0 2' >> /etc/fstab
mount /srv/anton
```

A free-disk alert, `/etc/cron.d/anton-disk` — every 15 minutes, a journal line when the root disk (PostgreSQL) or `/srv/anton` is 85 percent full or more:

```cron
*/15 * * * * root df --output=pcent,target / /srv/anton | awk 'NR>1 && $1+0 >= 85 {print "disk " $2 " at " $1}' | logger -t anton-disk
```

- **Watch for `anton-disk`** in the journal (`journalctl -t anton-disk`), or point your monitoring at it.
- **ANTON also caps each visitor:** `DEMO_USER_UPLOAD_MB` and `DEMO_USER_UPLOAD_FILES` per account, and `DEMO_USER_WRITES_PER_10_MIN` uploads, exports and version saves per account (section 7). The separate filesystem is the backstop when many accounts are used at once.

## 3. Node 22, pnpm, PostgreSQL 16, Ollama

```bash
# Node 22 (NodeSource) and pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs
corepack enable && corepack prepare pnpm@10 --activate

# PostgreSQL 16 (PGDG repository)
apt -y install postgresql-common && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt -y install postgresql-16
sudo -u postgres psql -c "CREATE USER anton WITH PASSWORD '<a long password>';"
sudo -u postgres psql -c "CREATE DATABASE anton_demo OWNER anton;"
# listen_addresses stays 'localhost' (the default) in /etc/postgresql/16/main/postgresql.conf

# Ollama, embedding model only — no chat models on the showcase
curl -fsSL https://ollama.com/install.sh | sh
mkdir -p /etc/systemd/system/ollama.service.d
printf '[Service]\nEnvironment="OLLAMA_HOST=127.0.0.1:11434"\n' > /etc/systemd/system/ollama.service.d/override.conf
systemctl daemon-reload && systemctl restart ollama
ollama pull nomic-embed-text
```

- **Ollama runs on the CPU.** Embedding is light, so no GPU is needed.
- **Embeddings stay on the server.** Without Ollama, collections and memory fall back to keyword search.

## 4. ANTON

```bash
sudo -iu anton
git clone <repo> anton && cd anton
git checkout <the showcase branch or tag>
pnpm install --frozen-lockfile
pnpm run build            # builds dist/client, which the server serves
cp .env.demo.example .env # then fill in every <...> (see below)
sudo mkdir -p /srv/anton/{uploads,outputs,workspaces} && sudo chown -R anton: /srv/anton
pnpm run db:init          # schema + every migration; creates the admin account
```

- **The admin account.** `db:init` creates it in team mode. Its password is in `data/initial-credentials.txt`. Sign in once, change the password, then delete the file.
- **The `.env`** is `.env.demo.example` filled in. Each setting is explained there, and section 7 below covers the demo ones.
- **Secrets:**
  - Generate every secret fresh on this machine.
  - `ENCRYPTION_KEY` encrypts the OpenRouter key in the database. If you lose it, you have to enter the key again.

### systemd

`/etc/systemd/system/anton.service`:

```ini
[Unit]
Description=ANTON public demo
After=network-online.target postgresql.service ollama.service
Wants=network-online.target

[Service]
User=anton
WorkingDirectory=/home/anton/anton
ExecStart=/usr/bin/pnpm run start
Restart=on-failure
RestartSec=5
# The server reads .env itself; stdin must not be a terminal.
StandardInput=null
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/anton/anton /srv/anton

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now anton
journalctl -u anton -f     # look for "[demo] DEMO_MODE=true" and any "[demo]" warnings
```

At start, demo mode:

- **refuses to start** unless `DEPLOYMENT_MODE=team`;
- **forces off** Markets, the missions runner, the memory sweep and radar automation;
- **warns** about anything risky it finds: an Anthropic key, the subscription engine, open sign-up, or missing spend caps.

### nginx and TLS

`/etc/nginx/sites-available/anton-demo`:

```nginx
limit_req_zone $binary_remote_addr zone=anton_auth:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=anton_write:10m rate=30r/m;

server {
    listen 80;
    server_name <demo host>;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name <demo host>;
    # certbot fills in ssl_certificate / ssl_certificate_key

    client_max_body_size 12m;          # MAX_FILE_SIZE_MB=10 plus overhead
    add_header Strict-Transport-Security "max-age=63072000" always;
    limit_req_status 429;

    # Local tools only — never from the internet
    location /mcp     { return 404; }
    location /metrics { return 404; }

    # Sign-in, sign-up and password reset: slow down scripted guessing before
    # it reaches ANTON. Only these four: /api/auth/me and /api/auth/me/budget
    # are called on every page load, and under this limit visitors sharing an
    # address (a conference, an office) would be signed out.
    location ~ ^/api/auth/(login|demo-signup|forgot-password|reset-password)$ {
        limit_req zone=anton_auth burst=10 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Uploads and exports write to disk: a per-address limit on top of
    # ANTON's per-account one.
    location ~ ^/api/(files/upload|export) {
        limit_req zone=anton_write burst=20 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        # Streaming answers (SSE)
        proxy_set_header   Connection '';
        proxy_buffering    off;
        proxy_cache        off;
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/anton-demo /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d <demo host>
```

- **`TRUST_PROXY=loopback`** trusts the proxy on this machine. ANTON then sees each visitor's address, so the per-IP sign-up limit works. Without it, every visitor would share the address 127.0.0.1.
- **`CORS_ORIGINS`, `APP_PUBLIC_URL` and `BASE_URL`** are all `https://<demo host>`.

## 5. Point ANTON at OpenRouter

**Choose the model first.** Before launch, run the model test run from a development machine, with a separate, credit-limited OpenRouter key (not the demo server's):

```bash
pnpm run eval:openrouter -- --dry-run            # the plan and a cost estimate, no calls
OPENROUTER_API_KEY=... pnpm run eval:openrouter -- --max-usd 2 --judge
```

It runs ten Work modules, with ANTON's real composed prompts, against GLM 5.3 Flash (EU-pinned and on default routing) and Ling 3.0 Flash VL. The report goes to `not_to_github/eval/<date>/`; see `scripts/eval/README.md`.

Sign in as `admin`. Then open **Settings → Local models → OpenAI-compatible endpoints** and add one. The **OpenRouter** preset fills in everything below except the key. It sets GLM 5.3 Flash as the default and only allowed model, the EU zero-retention extra body, and the attribution headers. Open Settings from the public address, because `HTTP-Referer` is taken from the page. To keep the demo out of OpenRouter's public app rankings, add `"X-OpenRouter-App-Visibility": "hidden"` to the extra headers.

| Field | Value |
|---|---|
| Slug | `openrouter` |
| Base URL | `https://openrouter.ai/api/v1` |
| API key | the demo key from step 1 |
| Default model | `z-ai/glm-5.3-flash` |
| Allowed models | `z-ai/glm-5.3-flash`, plus any other model in `DEMO_OFFERED_MODELS` |
| Context window | `131072`, which keeps the documents one run can pack bounded |
| Max output tokens | e.g. `16000` |
| Extra headers | `HTTP-Referer: https://<demo host>`, `X-Title: ANTON demo` |
| Extra body | see below |
| Prices (per 1M tokens) | `0.165` input, `0.55` output: the dearer of the two pinned providers. OpenRouter's /models lists another provider's promotional $0.045 / $0.14, which would under-reserve. |

```json
{"provider":{"only":["inceptron","nextbit"],"allow_fallbacks":true,"zdr":true,"data_collection":"deny"}}
```

`only` keeps every call on the two EU providers. `allow_fallbacks: true` lets one stand in when the other refuses. Do not set it to `false`: OpenRouter then tries only its first pick, and a 429 from that provider fails the call even when the other one is free.

Then:

1. **Run the endpoint's health check.** It records what OpenRouter says about each model: context, output limit, reasoning, images and prices.
   - ANTON uses that to set the reasoning effort and to decide whether images can be sent.
   - It prices each call's reservation from it. Until the check has run, a call cannot reserve its worst case before it is sent.
   - Run it again after an upgrade.
2. **Settings → General → Default model:** `compat:openrouter:z-ai/glm-5.3-flash`. Leave the utility model on its default: with no Claude engine on the server, ANTON routes utility calls to the default model.
3. **Leave Double-check off.** The "independent" second opinion would be the same model checking itself. If you want it, name a second, different cheap model as the verifier.
4. **Test.** In a private window, sign up with the invite code, run a short module and export the answer. Then check the spend (section 8).

### Rate limits: the price of the EU pin

The EU pin allows exactly two providers, Inceptron and NextBit. What the live tests on 2026-09-25 showed:

- **Inceptron is often rate-limited.** It is OpenRouter's usual first pick for GLM 5.3 Flash on the pin, and it answered `429 temporarily rate-limited upstream` to about one call in three, even with nothing else on the key.
- **The first version of the pin set `allow_fallbacks: false`, and that made it worse.** OpenRouter then tried only its first pick, so a refusal from Inceptron failed the call although NextBit was free. With `allow_fallbacks: true` (still limited to the two by `only`), NextBit stood in and 3 of 3 probe calls were served. With `false`, 1 of 3 were.
- **ANTON softens what is left.** A 429 is retried three times (2, 4, then 8 s), and a visitor who still gets one sees "busy, try again in a moment". On the demo, an answer is followed by at most the session conclusion (`DEMO_POST_ANSWER_CALLS`), not three calls at once.
- **Answers are slow on the pin:** 45 s to 3.5 min for a full module answer, up to 8 min when retries pile up. Visitors see the text arrive as it is written.

If several visitors at once still get refused, you have three options:

1. **Bring your own key:** add your own Inceptron or NextBit key in OpenRouter (Settings → Integrations). Your own rate limits then apply.
2. **Let fewer people in at once:** a smaller `DEMO_MAX_SIGNUPS_PER_DAY`, or hand out invite codes in batches.
3. **Allow providers outside the pair.** Keep zero data retention, but put the two EU providers first and let OpenRouter fall back to others. Their compute may be outside the EU, so the privacy notice has to say so. On OpenRouter's default routing the same model had no 429 in 10 calls:
   ```json
   {"provider":{"order":["inceptron","nextbit"],"allow_fallbacks":true,"zdr":true,"data_collection":"deny"}}
   ```

## 6. What visitors can reach

- **Non-admins** reach only what the Work page needs:
  - running a module;
  - their own sessions, uploads, exports, ratings and sign-offs;
  - the module catalogue;
  - the settings the page reads.
- **Everything else** answers 404: other pillars, agents, data import, Code Studio, Settings changes. The list is `WORK_ROUTES` in `server/middleware/demo-mode.ts`.
- **Storage per visitor is capped.** An upload that would take an account past `DEMO_USER_UPLOAD_MB` or `DEMO_USER_UPLOAD_FILES` is refused before it is written. Uploads, exports and version saves are also limited to `DEMO_USER_WRITES_PER_10_MIN` per account.
- **Administrators** are not restricted.

Opening more:

- **`DEMO_ENABLED_PILLARS`** turns on pillars besides Work, e.g. `pathfinder`. Each adds its API prefix and appears in the pillar switch and the sidebar.
- **`DEMO_EXTRA_ROUTES`** adds API prefixes, each optionally limited to methods:
  - `/renderers` opens the Transform panel;
  - `POST:/modules/smart-search` opens "find the right module".
  Both call the model, so they spend budget.

## 7. The demo settings

| Variable | Default | Meaning |
|---|---|---|
| `DEMO_MODE` | off | `true` turns everything in this runbook on. Requires `DEPLOYMENT_MODE=team`. |
| `DEMO_SIGNUP_CODE` | — | The invite code. Unset means sign-up is closed. |
| `DEMO_SIGNUP_OPEN` | `false` | `true` with no code lets anyone sign up. Not recommended. |
| `DEMO_ACCOUNT_TTL_DAYS` | 30 | An account and everything in it is deleted this long after sign-up. The same period applies to audit, sign-in and security logs and to exported files. |
| `DEMO_USER_MONTHLY_TOKENS` | 500000 | Monthly token budget of each new account (0 = unlimited). |
| `DEMO_MAX_SIGNUPS_PER_DAY` | 100 | New accounts per rolling 24 hours, server-wide (0 = no cap). |
| `DEMO_SIGNUPS_PER_IP_PER_HOUR` | 3 | Sign-up attempts per address per hour. Failed attempts count too. |
| `DEMO_USER_UPLOAD_MB` | 50 | Megabytes of uploads one account may keep (0 = no cap). |
| `DEMO_USER_UPLOAD_FILES` | 50 | Uploaded files one account may keep (0 = no cap). |
| `DEMO_USER_WRITES_PER_10_MIN` | 30 | Uploads, exports and version saves per account per 10 minutes. |
| `DEMO_OFFERED_MODELS` | — | Full model ids the picker offers visitors. |
| `DEMO_ENABLED_PILLARS` | — | Pillars besides Work. |
| `DEMO_EXTRA_ROUTES` | — | Extra API prefixes (section 6). |
| `LLM_DAILY_SPEND_CAP_USD` | none | The server's model spend per UTC day. |
| `LLM_USER_DAILY_SPEND_CAP_USD` | none | One visitor's model spend per UTC day. |

## 8. Spending

Four limits, from the outside in:

1. **The OpenRouter key's credit limit** (daily reset). This is the hard stop, even if everything inside ANTON fails.
2. **`LLM_DAILY_SPEND_CAP_USD`** stops all priced calls for the rest of the UTC day.
3. **`LLM_USER_DAILY_SPEND_CAP_USD`** stops one visitor.
4. **Sign-up limits:** the per-address and per-day caps. Bots with many Google accounts cannot get in, because Google/GitHub sign-in is off.

To see today's spend:

```sql
SELECT COUNT(*) AS calls, ROUND(SUM(cost_usd)::numeric, 4) AS usd
  FROM llm_spend_ledger WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');
```

OpenRouter's activity page shows the same from their side.

## 9. Data and logs

- **Accounts are deleted after the TTL**, with everything they wrote. `server/services/demo-retention.ts` runs this 5 minutes after start and then every 24 hours. It logs a line `[demo-retention] expired=… deleted=…`; the line carries counts, never ids.
- **The spend ledger keeps its rows** without the person, so the day's total does not drop. A custom module a visitor shared with the community stays too, without its author.
- **An account retention cannot delete** (a table still refers to it) is switched off and tried again the next day, after the newer expiries. The log names the constraint that held it: `[demo-retention] … users(23503 <constraint>)`.
- **Backups hold visitors' data too.** Keep them no longer than the TTL:

  ```bash
  # /etc/cron.d/anton-backup — nightly dump, 7 days kept, readable by the anton user only
  15 3 * * * anton pg_dump -Fc anton_demo > /srv/anton/backup/anton_demo_$(date +\%u).dump
  ```

  The file name cycles through the weekdays, so the dumps overwrite themselves. Encrypt copies you move off the VM.
- **journald** keeps the server log. Cap it at the TTL: in `/etc/systemd/journald.conf` set `MaxRetentionSec=30day` and `SystemMaxUse=1G`, then `systemctl restart systemd-journald`.
- **nginx access logs hold visitors' IP addresses.**
  - Keep them short with logrotate: `/etc/logrotate.d/nginx` → `daily`, `rotate 14`.
  - Or drop the address with a `log_format` that leaves out `$remote_addr`.
- **Ollama and PostgreSQL logs** carry no visitor content at the default log levels.

## 10. Operating it

- **Update:**

  ```bash
  cd ~/anton && git pull && pnpm install --frozen-lockfile && pnpm run build
  sudo systemctl restart anton
  ```

  Migrations run at start.
- **Switch one account off:** Settings → Team → switch off. Its sessions end at once.
- **Keep one visitor's account** (for a helper, say): make it an ordinary account, so it neither expires nor is deleted: `UPDATE users SET demo_expires_at = NULL WHERE username = '<name>';`. Promoting it to administrator is not enough on its own: retention never deletes an administrator, but the account still expires and can no longer sign in.
- **Close sign-up:** remove `DEMO_SIGNUP_CODE` and restart. Existing accounts keep working until they expire.
- **Rotate the invite code:** change `DEMO_SIGNUP_CODE` and restart.
- **End the demo:**
  1. Expire every demo account:

     ```sql
     UPDATE users SET demo_expires_at = NOW() WHERE demo_expires_at IS NOT NULL;
     ```

  2. Restart. The first retention pass runs 5 minutes later; check its log line.
  3. Only then turn `DEMO_MODE` off. Outside demo mode a demo account can neither sign in nor use a session it already holds, but its rows would stay: retention runs only in demo mode.

## Checklist before opening

- [ ] The privacy notice (`/privacy`) is reviewed by a lawyer and every placeholder is filled in.
- [ ] OpenRouter: dedicated key, credit limit with daily reset, guardrail (models + providers), ZDR only.
- [ ] `.env`: `DEMO_MODE=true`, `DEPLOYMENT_MODE=team`, fresh secrets, `DEMO_SIGNUP_CODE` set, spend caps set, no provider keys, no SDK/Codex engine.
- [ ] The start log shows no `[demo]` warnings you have not accepted.
- [ ] The endpoint has allowed models, the extra body and a passing health check; the default and utility model are the OpenRouter model.
- [ ] From a private window: sign-up works with the code and fails without it, a module runs and exports, and `/api/agents` answers 404.
- [ ] `/mcp` and `/metrics` answer 404 from outside; only ports 80 and 443 are open.
- [ ] Backups, journald and nginx logs are capped at the TTL.
- [ ] `/srv/anton` is its own size-limited filesystem, and the `anton-disk` alert is in place.
- [ ] Web fonts:
  - Until they are served from the server itself, the page loads them from Google Fonts, and Google receives each visitor's IP address.
  - Either self-host them, or say so in the privacy notice.
