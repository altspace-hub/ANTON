# Public demo on a Linux VM (OpenRouter)

This runbook sets up ANTON as a public showcase: strangers sign up with an invite code and try the Work modules. The AI is one OpenRouter key with a spending limit. It is written for an Ubuntu 24.04 VM at Bahnhof, but any Linux VM works.

What you get:

- **Visitors sign up with an invite code.** They choose a username and a password, confirm they are 18 or over and accept the demo terms. No email address is asked for. Google and GitHub sign-in are off.
- **Visitors reach the Work modules only.** Every other API route answers 404 to anyone who is not an administrator. Modules that invite health, employment, credit or criminal-offence data are hidden, by built-in lists you can change (`DEMO_HIDDEN_AREAS`, `DEMO_HIDDEN_MODULES`). You can open more pillars or routes in the `.env`.
- **Accounts expire.** After `DEMO_ACCOUNT_TTL_DAYS` (default 30) an account is deleted, with its sessions, answers, uploads and log rows.
- **ANTON does not learn from visitors.** Memory learning is off. Markets, the missions runner, the memory sweep and radar automation do not run.
- **Every prompt goes to one model host.** OpenRouter passes it only to Inceptron (EU/EEA, zero data retention). On a demo ANTON refuses to send anything to OpenRouter without that pin (section 5).
- **Spending is capped in four places.** The OpenRouter key has a hard credit limit. ANTON has a daily cap for the whole server and one per visitor, and sign-ups are limited per address and per day. Each account also has a monthly token budget.
- **Visitors see a banner** on every page. It says the answers come from AI (the model, via OpenRouter in the USA) and can be wrong, asks them not to enter personal or client data, and links the privacy notice and the demo terms.

> **Before you open it to the public,** work through [Compliance before launch](#compliance-before-launch). Visitors' prompts go to OpenRouter, Inc. in the USA and on to Inceptron in the EU/EEA. The privacy notice, the demo terms and the impact assessment need a lawyer's sign-off first.

## What runs where

```
visitor ──https──▶ nginx (TLS, :443) ──▶ ANTON (Node 22, 127.0.0.1:3001)
                                          ├─▶ PostgreSQL 16 (127.0.0.1:5432, database anton_demo)
                                          ├─▶ Ollama (127.0.0.1:11434, nomic-embed-text only, CPU)
                                          └─▶ OpenRouter, USA (https://openrouter.ai/api/v1)
                                                └─▶ Inceptron, EU/EEA: the only model host
```

- **Keep it separate.** Use its own VM and its own database. Do not put it on the `connect.anton.network` messaging host: that brief rules out AI and Work modules.
- **No Anthropic key, no subscription engine.** Leave `ANTHROPIC_API_KEY` unset and do not enable the SDK or Codex engine. With either one, visitors would run Claude on your account.
- **Nothing else between visitors and the VM.** A CDN or proxy in front of the demo (Cloudflare, say) would be a new processor and a new transfer: update the privacy notice, the record of processing and the transfer impact assessment first.

## 1. OpenRouter account

Do these in the OpenRouter dashboard. The labels below were right when this was written; check them against the current UI.

1. **The account belongs to the controller:** the business named in `DEMO_OPERATOR_NAME` and in the privacy notice, not a personal account.
2. **A dedicated API key** for the demo, so you can revoke it without touching anything else.
3. **A credit limit on that key, reset daily.** For example $3 a day, about $90 a month. This is the hard stop: when it is used up, OpenRouter refuses calls and ANTON shows visitors a "budget used up" message.
4. **A guardrail on the key** with:
   - **Models:** only the offered models, for example `z-ai/glm-5.3-flash`.
   - **Providers:** only `inceptron`. Inceptron AB (Lund, Sweden) says it processes customer content only in the EU/EEA; OpenRouter lists its data centre as Finland.
   ANTON also enforces the model list itself (the endpoint's *allowed models*) and the provider pin (the endpoint's extra body, section 5). The guardrail is the second lock.
5. **Exclude every other provider in the account settings.** The DPA provides for this (§5.2: "Customer may configure in Customer's account settings to exclude Processing by certain AI Model Providers").
6. **Privacy settings:**
   - Turn **off** both logging opt-ins, "Private Input & Output Logging" and "OpenRouter Use of Inputs/Outputs". Opting in means OpenRouter keeps inputs for at least 3 months and, under Terms §6.2, takes a perpetual licence to them.
   - Use zero-data-retention (ZDR) endpoints only, and no provider that may store or train on inputs. ANTON also asks for this on every call (section 5).
7. **Subscribe to OpenRouter's sub-processor notices** (DPA §5.2). They leave out AI model providers, which is one more reason for the pin and the account exclusion.

### The contract with OpenRouter

Checked on 2026-09-26. Re-check whenever OpenRouter changes its terms.

- **The data processing agreement comes with the Terms.** Terms §10.2 incorporate the DPA for anyone who represents an organisation or uses the service for commercial, for-profit purposes. The pricing page shows the DPA "Via Terms of Service" on every tier; on Business a signed copy is available on request. No enterprise plan is needed.
  - **Not verified:** that OpenRouter treats a sole trader's account as covered. Ask OpenRouter to confirm it in writing for the controller's account.
- **The transfer to the USA.**
  - DPA Schedule 2 names "Google Cloud Platform hosting in US regions". Every prompt therefore passes through the USA, even though the model runs in the EU/EEA. That is a transfer under GDPR Chapter V.
  - OpenRouter, Inc. is **not** certified under the EU-US Data Privacy Framework: it was on neither the active nor the inactive list on 2026-09-26. There is no adequacy decision to rely on.
  - The transfer rests on the Standard Contractual Clauses. DPA §13.2 enters Module 2 (controller to processor), under Irish law and the courts of Dublin, and gives the Clauses precedence over the DPA and the Terms (which are under New York law and cap liability).
  - Write a **transfer impact assessment** before launch. Do not rely on the Art. 49 derogations instead: they cover only transfers that are not repetitive.
- **OpenRouter's own purposes.** It screens requests for misuse, keeps request metadata, and Terms §6.5 give it a licence to use inputs "in anonymized form" for usage statistics. For these it decides the purposes itself, so it is a controller in its own right, and the privacy notice says so.
- **Keep dated copies:** PDFs of the Terms ("Last Updated: August 31, 2026"), the DPA with its Schedules ("Last Updated: August 26, 2026") and the pricing page.
- **Ask in writing, and keep the answers:**
  1. Do risk classification and prompt categorisation run on ZDR API traffic with logging off, and is anything kept?
  2. How long is request metadata kept, and does it include the `user` field?
  3. Please send the sub-processor list (Schedule 3); the Trust Center is gated.
  4. Are stray financial or employment details within Schedule 1?
  5. Will you give notice before any change of AI model provider for this account?
  6. Is there an EEA-only, zero-retention arrangement with NextBit? (Only relevant if you ever want it back; see section 5.)
- **The alternative:** Inceptron under its own DPA, without OpenRouter, removes the US transfer. See section 5.

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
apt update && apt -y full-upgrade && apt -y install unattended-upgrades ufw nginx certbot python3-certbot-nginx git curl age
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
- **The host holds every visitor's data**, so it is a processor too: see G8 in [Compliance before launch](#compliance-before-launch).

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
# Short error lines: no DETAIL, which can quote values such as a username
echo "log_error_verbosity = terse" >> /etc/postgresql/16/main/postgresql.conf
systemctl restart postgresql

# Ollama, embedding model only — no chat models on the showcase
curl -fsSL https://ollama.com/install.sh | sh
mkdir -p /etc/systemd/system/ollama.service.d
printf '[Service]\nEnvironment="OLLAMA_HOST=127.0.0.1:11434"\n' > /etc/systemd/system/ollama.service.d/override.conf
systemctl daemon-reload && systemctl restart ollama
ollama pull nomic-embed-text
```

- **A new, empty database.** `anton_demo` is created here for the demo alone. Never restore another ANTON's dump into it: the owner's organisation context, Trades business identity, fund identity and shared memory would travel with visitors' prompts to OpenRouter (section 4 has the check).
- **Ollama runs on the CPU.** Embedding is light, so no GPU is needed.
- **Embeddings stay on the server.** Without Ollama, collections and memory fall back to keyword search.

## 4. ANTON

```bash
sudo -iu anton
git clone <repo> anton && cd anton
git checkout <the showcase branch or tag>
pnpm install --frozen-lockfile
ANTON_DEMO_BUILD=true pnpm run build   # builds dist/client without a service worker
cp .env.demo.example .env              # then fill in every <...> (see below)
sudo mkdir -p /srv/anton/{uploads,outputs,workspaces,backup} && sudo chown -R anton: /srv/anton
sudo chmod 700 /srv/anton/backup
pnpm run db:init                       # schema + every migration; creates the admin account
```

- **The demo build.** `ANTON_DEMO_BUILD=true` leaves out the service worker, so visitors' browsers keep no offline copy of the pages. The build reads it, not the server: set it on every build (section 10 has the update command).
- **The admin account.** `db:init` creates it in team mode. Its password is in `data/initial-credentials.txt`. Sign in once, change the password, turn on two-factor sign-in (below), then delete the file.
- **The `.env`** is `.env.demo.example` filled in. Each setting is explained there, and section 7 below covers the demo ones.
- **Secrets:**
  - Generate every secret fresh on this machine.
  - `ENCRYPTION_KEY` encrypts the OpenRouter key in the database. If you lose it, you have to enter the key again.
  - `LLM_USER_HASH_SECRET` keys the pseudonymous `user` id sent to OpenRouter with every call (an HMAC of the visitor's account id). It must be at least 32 characters and differ from `JWT_SECRET`.
- **Check that the owner's data is not in the database.** After `db:init`, and again before opening:

  ```sql
  SELECT (SELECT COUNT(*) FROM knowledge_atoms WHERE owner_user_id IS NULL) AS shared_atoms,
         (SELECT COUNT(*) FROM business_identity) AS trades_identity,
         (SELECT COUNT(*) FROM fund_identity) AS fund_identity;
  SELECT * FROM org_context;   -- a default row may exist; every field must be empty
  ```

  All three counts must be 0. The server also checks at every start in demo mode and logs one `[demo]` warning naming what it found (the org context, the Trades business identity, the fund identity or shared knowledge atoms), never the content.

### Two-factor sign-in for every administrator

An administrator sees every visitor's content, so each admin account uses a TOTP code as well as its password. Enrolment has no settings screen yet. Signed in as the admin, open the browser console on the demo's own page:

```js
const csrf = (await (await fetch('/api/csrf-token')).json()).csrfToken;
const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body ?? {}) }).then((r) => r.json());
(await post('/api/auth/mfa/enable')).otpAuthUrl    // add this to your authenticator app
await post('/api/auth/mfa/confirm', { token: '123456' })   // the app's current 6-digit code
```

From then on the sign-in page asks for the code. Do the same for every other administrator.

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

- **refuses to start** unless `DEPLOYMENT_MODE=team`, both spend caps can be read, and `LLM_USER_HASH_SECRET` is set, at least 32 characters and different from `JWT_SECRET`;
- **forces off** Markets, the missions runner, the memory sweep and radar automation;
- **warns** about anything risky it finds: an Anthropic key, the subscription engine, open sign-up, missing spend caps, no `DEMO_OPERATOR_NAME`, hidden lists set to `none` or leaving out a recommended module, or the owner's data in the database (section 4).
- **caps a sign-in at 8 hours**, whatever `JWT_EXPIRY` says, as the privacy notice promises.

### nginx and TLS

`/etc/nginx/sites-available/anton-demo`:

```nginx
limit_req_zone $binary_remote_addr zone=anton_auth:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=anton_write:10m rate=30r/m;

# The access log keeps a shortened address: the /24 of an IPv4 address,
# the first 32 bits of an IPv6 one.
map $remote_addr $remote_addr_short {
    ~^(?P<net>\d+\.\d+\.\d+)\.      $net.0;
    ~^(?P<net>[0-9a-fA-F]*:[0-9a-fA-F]*):  $net::;
    default                         0.0.0.0;
}
log_format anton_short '$remote_addr_short - [$time_local] "$request" $status $body_bytes_sent "$http_user_agent"';

server {
    listen 80;
    server_name <demo host>;
    access_log /var/log/nginx/access.log anton_short;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name <demo host>;
    # certbot fills in ssl_certificate / ssl_certificate_key
    access_log /var/log/nginx/access.log anton_short;

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
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Uploads and exports write to disk: a per-address limit on top of
    # ANTON's per-account one.
    location ~ ^/api/(files/upload|export) {
        limit_req zone=anton_write burst=20 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
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
        proxy_set_header   X-Forwarded-For $remote_addr;
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

- **`X-Forwarded-For $remote_addr`** replaces whatever the client sent with the address nginx saw. With `$proxy_add_x_forwarded_for`, a client could put any address in front of its own.
- **`TRUST_PROXY=loopback`** trusts the proxy on this machine. ANTON then sees each visitor's address, so the per-IP sign-up limit works. Without it, every visitor would share the address 127.0.0.1.
- **`CORS_ORIGINS`, `APP_PUBLIC_URL` and `BASE_URL`** are all `https://<demo host>`.

## 5. Point ANTON at OpenRouter

**Choose the model first.** Before launch, run the model test run from a development machine, with a separate, credit-limited OpenRouter key (not the demo server's):

```bash
pnpm run eval:openrouter -- --dry-run            # the plan and a cost estimate, no calls
OPENROUTER_API_KEY=... pnpm run eval:openrouter -- --max-usd 2 --judge
```

It runs ten Work modules, with ANTON's real composed prompts, against GLM 5.3 Flash (pinned to Inceptron, and on default routing) and Ling 3.0 Flash VL. The report goes to `not_to_github/eval/<date>/`; see `scripts/eval/README.md`.

Sign in as `admin`. Then open **Settings → Local models → OpenAI-compatible endpoints** and add one. The **OpenRouter** preset fills in everything below except the key. It sets GLM 5.3 Flash as the default and only allowed model, the extra body that pins Inceptron, and the attribution headers. Open Settings from the public address, because `HTTP-Referer` is taken from the page. To keep the demo out of OpenRouter's public app rankings, add `"X-OpenRouter-App-Visibility": "hidden"` to the extra headers.

| Field | Value |
|---|---|
| Slug | `openrouter` |
| Base URL | `https://openrouter.ai/api/v1` |
| API key | the demo key from section 1 |
| Default model | `z-ai/glm-5.3-flash` |
| Allowed models | `z-ai/glm-5.3-flash`. Offer more only if the privacy notice, the banner and the sign-up text name each one. |
| Context window | `131072`, which keeps the documents one run can pack bounded |
| Max output tokens | e.g. `16000` |
| Extra headers | `HTTP-Referer: https://<demo host>`, `X-OpenRouter-Title: ANTON by openEXPERT` |
| Extra body | see below |
| Prices (per 1M tokens) | `0.11` input, `0.5` output: Inceptron's price. OpenRouter lists $0.11 / $0.45, and a live call on 2026-09-25 was billed about $0.50 per million output tokens. Its /models listing shows another provider's promotional $0.045 / $0.14, which would under-reserve. |

```json
{"provider":{"only":["inceptron"],"zdr":true,"data_collection":"deny"}}
```

- **`only`** keeps every call on Inceptron. No other provider is tried, not even when Inceptron is busy.
- **`zdr: true`** asks for zero-data-retention endpoints only, and **`data_collection: "deny"`** for no provider that stores or trains on prompts.
- **ANTON enforces it.** In demo mode, a call to an OpenRouter endpoint whose extra body lacks `zdr: true`, `data_collection: "deny"` or a non-empty `only` is refused before anything is sent. So is one whose `only` names a provider outside `DEMO_ALLOWED_PROVIDERS` (default `inceptron`): an endpoint saved from the 2026-09-25 preset, `["inceptron","nextbit"]`, is refused until you correct its extra body. The visitor is told the AI service is switched off, and the log has a line `[demo] refused a call to the OpenRouter endpoint "openrouter": its extra body lacks …`, naming only the slug and the missing settings.
- **Read it back** after saving, and in every monthly check (section 10):

  ```bash
  sudo -u postgres psql anton_demo -c "SELECT slug, enabled, extra_body, allowed_models FROM custom_model_endpoints;"
  ```

Then:

1. **Run the endpoint's health check.** It records what OpenRouter says about each model: context, output limit, reasoning, images and prices.
   - ANTON uses that to set the reasoning effort and to decide whether images can be sent.
   - It prices each call's reservation from it. Until the check has run, a call cannot reserve its worst case before it is sent.
   - Run it again after an upgrade.
2. **Settings → General → Default model:** `compat:openrouter:z-ai/glm-5.3-flash`. Leave the utility model on its default: with no Claude engine on the server, ANTON routes utility calls (session titles and summaries) to the default model, the one the privacy notice names.
3. **Leave Double-check off.** The "independent" second opinion would be the same model checking itself. If you want it, name a second, different cheap model as the verifier, and name it in the privacy notice.
4. **Test.** In a private window, sign up with the invite code, run a short module and export the answer. Then check the spend (section 8).

### Rate limits: the price of the EU pin

The pin allows one provider, Inceptron. That is what keeps every prompt with a zero-retention host in the EU/EEA, and it has a cost:

- **Inceptron is often rate-limited.** In live tests on 2026-09-25 it answered `429 temporarily rate-limited upstream` to about one call in three, even with nothing else on the key.
- **Nothing stands in for it.** Until 2026-09-26 the pin also allowed NextBit, and NextBit served the calls Inceptron refused (3 of 3 probe calls). NextBit is out: its own ZDR statement says request data may be kept for up to 90 days, and its terms place compute nodes inside and outside the EEA. With one provider, expect more "busy" answers than those tests showed. `allow_fallbacks` makes no difference with a single provider in `only`.
- **ANTON softens what it can.** A 429 is retried three times (2, 4, then 8 s), and a visitor who still gets one sees "busy, try again in a moment". On the demo, an answer is followed by at most the session conclusion (`DEMO_POST_ANSWER_CALLS`), not three calls at once.
- **Answers are slow on the pin:** 45 s to 3.5 min for a full module answer, up to 8 min when retries pile up. Visitors see the text arrive as it is written.

If too many visitors are refused:

1. **The fix is Inceptron under a direct contract.**
   - Your own Inceptron key in OpenRouter ("bring your own key", Settings → Integrations) gives you your own rate limits. Traffic still passes through OpenRouter in the USA, and you now also have a contract with Inceptron: execute its DPA (its terms §6.5 offer one).
   - Or run Inceptron's API directly as its own endpoint, without OpenRouter, once Inceptron confirms such an API (not verified). This also removes the US transfer. The privacy notice, the record of processing and the transfer impact assessment change with it.
2. **Let fewer people in at once:** a smaller `DEMO_MAX_SIGNUPS_PER_DAY`, or hand out invite codes in batches.

Do not add NextBit back to `only`, and do not swap `only` for `order` with fallbacks. Either sends prompts to providers the privacy notice does not name, possibly outside the EEA, and on a demo ANTON refuses an extra body without `only`. NextBit could come back only after OpenRouter confirms in writing that its endpoint is zero-retention and EEA-only, and after the notice names it.

## 6. What visitors can reach

- **Non-admins** reach only what the Work page needs:
  - running a module;
  - their own sessions, uploads, exports and ratings;
  - the module catalogue;
  - the settings the page reads.
- **Everything else** answers 404: other pillars, agents, data import, Code Studio, Settings changes. The list is `WORK_ROUTES` in `server/middleware/demo-mode.ts`.
- **Hidden modules.** Areas in `DEMO_HIDDEN_AREAS` and modules in `DEMO_HIDDEN_MODULES` are left out of the catalogue for visitors (the server's listings, the community modules and, from the lists in `/api/config`, the web client's catalogue), and a run of one is refused. They invite health, employment, credit or criminal-offence data, which the demo must not receive, and the privacy notice says the demo does not offer them.
  - **The recommended lists are built in.** With both settings left out, demo mode hides the areas health, community health, HR and workers' rights, and the modules on credit risk and credit scoring (`credit-risk`, `fintech-credit-risk-assessment`, `microfinance-credit-scoring`, `credit-score-builder`), CV writing (`cv-writer`), employment and social protection (`employment-rights`, `social-protection-navigator`), and criminal law and investigations (`court-process-demystifier`, `alert-investigation`, `investigation-support`, `ivts-detection-investigation`, `blockchain-investigation`, `investigative-research`, `sar-quality-check`, `daily-screening-review`, `sanctions-advisory`). The rest of the `fcp` area stays open. `.env.demo.example` repeats the lists.
  - **A list you set replaces the built-in one.** The server warns at start about each recommended id it leaves out. `none` turns a list off.
- **Storage per visitor is capped.** An upload that would take an account past `DEMO_USER_UPLOAD_MB` or `DEMO_USER_UPLOAD_FILES` is refused before it is written. Uploads, exports and version saves are also limited to `DEMO_USER_WRITES_PER_10_MIN` per account.
- **Administrators** are not restricted.

Opening more:

- **`DEMO_ENABLED_PILLARS`** turns on pillars besides Work, e.g. `pathfinder`. Each adds its API prefix and appears in the pillar switch and the sidebar.
- **`DEMO_EXTRA_ROUTES`** adds API prefixes, each optionally limited to methods:
  - `/renderers` opens the Transform panel;
  - `POST:/modules/smart-search` opens "find the right module".
  Both call the model, so they spend budget.
- Anything you open is processing the privacy notice has to describe. Check the notice before you open it.

## 7. The demo settings

| Variable | Default | Meaning |
|---|---|---|
| `DEMO_MODE` | off | `true` turns everything in this runbook on. Requires `DEPLOYMENT_MODE=team`. |
| `LLM_USER_HASH_SECRET` | — | Keys the pseudonymous `user` id sent to OpenRouter. Required on a demo: at least 32 characters and not `JWT_SECRET`, or the server does not start. Outside demo mode it falls back on `JWT_SECRET`. |
| `DEMO_OPERATOR_NAME` | — | The controller's legal name, shown as "Operated by …" on the sign-in page and in the notice and terms. Warned about at start while unset. |
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
| `DEMO_HIDDEN_AREAS` | the recommended list | Area ids kept off the demo for visitors (section 6). `none` turns it off; warned about at start when both lists are `none`, or when a list leaves out a recommended id. |
| `DEMO_HIDDEN_MODULES` | the recommended list | Module ids kept off the demo for visitors (section 6). `none` turns it off. |
| `DEMO_ALLOWED_PROVIDERS` | `inceptron` | The OpenRouter providers the endpoint's `provider.only` may name (section 5). A call pinned to any other provider is refused. |
| `JWT_EXPIRY` | 7 days (8 hours on a demo) | How long a sign-in lasts. Demo mode caps it at 8 hours whatever it says. |
| `DEMO_ENABLED_PILLARS` | — | Pillars besides Work. |
| `DEMO_EXTRA_ROUTES` | — | Extra API prefixes (section 6). |
| `LLM_DAILY_SPEND_CAP_USD` | none | The server's model spend per UTC day. |
| `LLM_USER_DAILY_SPEND_CAP_USD` | none | One visitor's model spend per UTC day. |
| `ANTON_DEMO_BUILD` | — | Read by `pnpm run build`, not by the server. `true` builds the web client without a service worker. Set it on every demo build. |

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

The privacy notice states how long each of these is kept. Configure exactly that, and change the notice if you configure something else.

- **Accounts are deleted after the TTL.** `server/services/demo-retention.ts` runs this 5 minutes after start and then every 24 hours. It logs a line `[demo-retention] expired=… deleted=…`; the line carries counts, never ids.
- **The spend ledger keeps its rows** without the person, so the day's total does not drop. A custom module a visitor shared with the community stays too, without its author.
- **An account retention cannot delete** (a table still refers to it) is switched off and tried again the next day, after the newer expiries. The log names the constraint that held it: `[demo-retention] … users(23503 <constraint>)`.
- **Backups hold visitors' data too.** Keep 7 days, readable by nobody but the `anton` user, and encrypted to a key that is not on the VM:

  ```bash
  # Once, on your own machine (not the VM): age-keygen -o anton-backup.key
  # Its "public key: age1…" line goes into the cron entry below.

  # /etc/cron.d/anton-backup — nightly dump, 7 days kept, encrypted
  15 3 * * * anton umask 077 && pg_dump -Fc anton_demo | age -r <age1… public key> > /srv/anton/backup/anton_demo_$(date +\%u).dump.age
  ```

  - The file name cycles through the weekdays, so the dumps overwrite themselves.
  - `/srv/anton/backup` is mode 0700 (section 4), and `umask 077` makes each file 0600.
  - The private key stays off the VM, so a copy of the VM's disk does not expose the backups.
  - **Test a restore once before launch** (section 10), and again after any change to the cron entry.
- **journald** keeps the server log. In `/etc/systemd/journald.conf` set `MaxRetentionSec=30day` and `SystemMaxUse=1G`, then `systemctl restart systemd-journald`. Error lines are not meant to hold visitors' content, but one can name an uploaded file or a username.
- **The PostgreSQL log** (`/var/log/postgresql/`) can quote values from a failed statement, a username for instance. `log_error_verbosity = terse` (section 3) leaves out most of that. Rotate it at 30 days or less: in `/etc/logrotate.d/postgresql-common` set `weekly` and `rotate 4` (the package default keeps 10 weeks).
- **The nginx access log** keeps only the shortened address (`anton_short`, section 4). Keep it 7 days: in `/etc/logrotate.d/nginx` set `daily` and `rotate 7`.
- **Ollama** logs to journald, under the same 30 days.

## 10. Operating it

- **Update:**

  ```bash
  cd ~/anton && git pull && pnpm install --frozen-lockfile && ANTON_DEMO_BUILD=true pnpm run build
  sudo systemctl restart anton
  ```

  Migrations run at start.
- **Switch one account off:** Settings → Team → switch off. Its sessions end at once.
- **Keep one visitor's account** (for a helper, say): make it an ordinary account, so it neither expires nor is deleted: `UPDATE users SET demo_expires_at = NULL WHERE username = '<name>';`. Promoting it to administrator is not enough on its own: retention never deletes an administrator, but the account still expires and can no longer sign in.
- **Close sign-up:** remove `DEMO_SIGNUP_CODE` and restart. Existing accounts keep working until they expire.
- **Rotate the invite code:** change `DEMO_SIGNUP_CODE` and restart. Hand codes out privately, and never note which person got which username.
- **End the demo:**
  1. Expire every demo account:

     ```sql
     UPDATE users SET demo_expires_at = NOW() WHERE demo_expires_at IS NOT NULL;
     ```

  2. Restart. The first retention pass runs 5 minutes later; check its log line.
  3. Only then turn `DEMO_MODE` off. Outside demo mode a demo account can neither sign in nor use a session it already holds, but its rows would stay: retention runs only in demo mode.

### Requests from visitors (access, deletion)

No email address is on file, so the privacy notice (section 12) has the visitor prove the account from inside the demo. Answer within one month.

1. **Log the request:** date received, the one-month deadline, the username, and later what was done. No content.
2. **Access or a copy:** reply with a one-time code and ask the visitor to rename one of their sessions to it. Then check:

   ```sql
   SELECT u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.title = '<code>';
   ```

   Only when it names the account, export it. From the ANTON directory (the script reads `DATABASE_URL` from its `.env`, and refuses to run without it):

   ```bash
   npx tsx scripts/demo-account.ts export <username> > <username>.json
   ```

   The file holds every row of the account as JSON. Passwords, sign-in tokens and key material show as `[redacted]`. If the script reports the export as INCOMPLETE (exit code 1, the tables listed under `unreadTables`), do not send it as the complete copy. Otherwise send that file, then delete your copy.
3. **Deletion:** a username plus a session title or the rough sign-up date is enough. Switch the account off at once (Settings → Team), then delete it now, from the ANTON directory:

   ```bash
   npx tsx scripts/demo-account.ts delete <username>         # counts what it holds; deletes nothing
   npx tsx scripts/demo-account.ts delete <username> --yes   # deletes the account and every row now
   ```

   Both print row counts only. The script refuses an administrator and an account that is not a demo account. If an account cannot be deleted (a table still holds it), the script says so; the account stays switched off and the daily retention pass tries again.
4. **A lost password:** the account cannot be proved. Say so, switch it off, and let it expire.

### Restoring a backup

A restore brings back what was deleted after the backup was taken, so visitors must not see the restored data until those deletions are made again:

1. **Close the demo:** `systemctl stop nginx anton`.
2. **Restore:** copy the dump off the VM, decrypt it with the private key (`age -d -i anton-backup.key anton_demo_<n>.dump.age > anton_demo.dump`), copy it back, and restore it with `pg_restore` into a new, empty `anton_demo`.
3. **Re-apply the deletions recorded since the backup:** every account in the request log, and every account you switched off since. Use the deletion step of the request procedure above.
4. **Start ANTON** and wait for the retention pass 5 minutes later. It deletes the accounts that expired meanwhile; check its log line.
5. **Note the gap.** Sessions that visitors deleted themselves since the backup cannot be re-applied: nothing records them outside the database. Write the restore and this gap in the incident log.
6. **Reopen:** `systemctl start nginx`.

Test this once before launch with a copy of the database.

### Monthly configuration check

- The endpoint's extra body still reads `{"provider":{"only":["inceptron"],"zdr":true,"data_collection":"deny"}}` (section 5), and the allowed models are unchanged.
- In OpenRouter: both logging opt-ins off, every other provider excluded, the key guardrail and its credit limit unchanged.
- OpenRouter's Terms, DPA and sub-processor notices: anything new since the archived copies?
- The start log since the last check shows no `[demo]` warning you have not accepted, and no `[demo] refused a call` line.
- A `[demo-retention]` line every day, and a test account created for the check is gone after its TTL.
- A private window loads `/`, `/login`, `/privacy`, `/terms` and a module page with no request to any other host (the browser's network panel).

## Compliance before launch

A compliance review of the demo on 2026-09-26 set twelve gates. The review itself is kept privately; each gate is summarised here. Share the public address only when all twelve are met.

- **G1 Controller.** Decide who is the controller: the business that holds the OpenRouter, Bahnhof and domain accounts. Its name, address, organisation and VAT numbers and a privacy email address go into the privacy notice, and its name into `DEMO_OPERATOR_NAME` for the "Operated by …" line.
- **G2 Provider pin.** The extra body is `{"provider":{"only":["inceptron"],"zdr":true,"data_collection":"deny"}}`, read back from the database on the VM. Every other provider is excluded in the OpenRouter account and in the key's guardrail.
- **G3 OpenRouter.** The account is in the controller's name. Its DPA cover is confirmed in writing and archived with the Terms and pricing page as dated PDFs. Both logging opt-ins are off. The transfer impact assessment is written. The questions in section 1 are sent.
- **G4 Deletion.** Deleting a session removes its answer copies and embeddings, an expired account leaves no rows behind (answer copies, edited prompts, embeddings and session rows included), and the retention test proves it, having failed on the old code first.
- **G5 Fonts.** Fonts come from the demo's own server. The network panel shows no request to Google, or to any other host, on `/`, `/login` and `/privacy`.
- **G6 Clean database.** A new `anton_demo`, with the organisation context, Trades identity, fund identity and shared memory empty (section 4). Memory injection is forced off in demo mode.
- **G7 Terms.** The demo terms are published at `/terms`. Sign-up has two ticks ("18 or over"; "accept the terms and have read the notice"), and the terms version and the times are stored on the account.
- **G8 Hosting provider.** A processor agreement with Bahnhof (a personuppgiftsbiträdesavtal), or a documented alternative such as your own Art. 28(3) addendum or another host.
- **G9 Paperwork.** Dated and signed: the record of processing (Art. 30), a short DPIA, the legitimate-interest assessments, the transfer impact assessment, and the breach, rights-request and restore procedures and the administrator access rule. Section 10 has the operational half.
- **G10 Notice.** The privacy notice, the banner and the sign-up text are deployed, every placeholder is filled, a lawyer has signed them off, and the DRAFT box is gone.
- **G11 Retention on the VM.** The periods the notice states are what the VM does: journald 30 days, the PostgreSQL log 30 days or less, the nginx log 7 days, backups 7 days (section 9).
- **G12 Owner choices.** The choices the notice still leaves open are made, and the matching code is deployed.

## Checklist before opening

**Owner and documents**

- [ ] The controller is chosen (G1): the privacy notice names it, `DEMO_OPERATOR_NAME` is set, and the privacy mailbox is live and read.
- [ ] Demo terms, record of processing, DPIA, legitimate-interest assessments, transfer impact assessment, the breach, rights and restore procedures, the access rule and a short AI-literacy note are dated and signed.
- [ ] A lawyer has signed off the notice, the terms and the DPIA.

**Contracts**

- [ ] OpenRouter: the account is in the controller's name, the DPA cover is confirmed in writing, dated PDFs of the Terms, DPA and pricing page are archived, the questions in section 1 are sent, and sub-processor notices are subscribed to.
- [ ] Bahnhof: the processor agreement is signed, or the alternative is documented.

**OpenRouter configuration**

- [ ] Both logging opt-ins are off.
- [ ] Every provider except Inceptron is excluded in the account settings.
- [ ] The key's guardrail allows only `z-ai/glm-5.3-flash` and `inceptron`, with a daily credit limit.
- [ ] The saved extra body is `{"provider":{"only":["inceptron"],"zdr":true,"data_collection":"deny"}}`, read back from `custom_model_endpoints` on the VM.
- [ ] The endpoint has allowed models and a passing health check; the default and utility model are the OpenRouter model.

**VM**

- [ ] `.env`: `DEMO_MODE=true`, `DEPLOYMENT_MODE=team`, fresh secrets, `LLM_USER_HASH_SECRET` set and different from `JWT_SECRET`, `DEMO_SIGNUP_CODE`, `DEMO_OPERATOR_NAME`, the hidden areas and modules (or both left out, for the built-in lists), `DEMO_ALLOWED_PROVIDERS=inceptron`, spend caps set, no provider keys, no SDK/Codex engine.
- [ ] The start log shows no `[demo]` warnings you have not accepted.
- [ ] A new `anton_demo`; the owner-data check in section 4 shows 0, 0, 0 and an empty `org_context`.
- [ ] Built with `ANTON_DEMO_BUILD=true`.
- [ ] `/srv/anton/backup` is mode 0700; the cron uses `umask 077` and encrypts to a key off the VM; one restore has been tested.
- [ ] journald `MaxRetentionSec=30day`; PostgreSQL `log_error_verbosity = terse` and its log rotated at 30 days or less; nginx logs the shortened address and keeps 7 days.
- [ ] nginx sends `X-Forwarded-For $remote_addr`.
- [ ] Every administrator account has two-factor sign-in; `data/initial-credentials.txt` is deleted.
- [ ] `/srv/anton` is its own size-limited filesystem, and the `anton-disk` alert is in place.
- [ ] `/mcp` and `/metrics` answer 404 from outside; only ports 80 and 443 are open.

**From a private window**

- [ ] The network panel shows no request to any host but the demo's own on `/`, `/login`, `/privacy`, `/terms` and a module page.
- [ ] Sign-up works with the code and both ticks, and fails without the code; the new `users` row stores the terms version and the times.
- [ ] A module runs and exports; a hidden module is not listed; `/api/agents` answers 404.
- [ ] Deleting the session leaves no rows for it in `versions`, `embeddings` or `system_prompts`.
- [ ] An expired test account is fully gone after a retention pass.
- [ ] The banner shows on the sign-in page and in the app and cannot be closed.
- [ ] `/privacy` shows no DRAFT box and no `[[` placeholder.

**Publish**

- [ ] Set the notice's effective date, and hand out invite codes privately.
