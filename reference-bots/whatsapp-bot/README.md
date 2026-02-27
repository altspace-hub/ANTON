# ANTON WhatsApp Reference Bot

A minimal Node.js/Express app that connects a WhatsApp Business account to
ANTON's Channel Bridge, giving users AML/CFT compliance assistance directly
in WhatsApp.

## Architecture

```
User → WhatsApp → Meta Cloud API
                        ↓ webhook POST /webhook
              [This bot — index.js]
                        ↓ POST /api/bridges/<id>/query
              [ANTON Channel Bridge]
                        ↓
              [Claude — plain text response]
                        ↓
              [This bot — sendTextMessage]
                        ↓
User ← WhatsApp ← Meta Cloud API
```

ANTON is the expertise layer. This bot is purely the delivery layer.

---

## Prerequisites

- Node.js 18+
- An ANTON instance with a Channel Bridge created and approved
  (Settings → Connections → Channel Bridges → New Bridge)
- A Meta Developer account with a WhatsApp Business app
- A public HTTPS URL for your webhook (Render, Railway, Fly.io, ngrok for local dev)

---

## Setup

### 1. Clone / copy this folder

```bash
# Copy the reference bot to your own project
cp -r reference-bots/whatsapp-bot/ my-whatsapp-bot/
cd my-whatsapp-bot/
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Where to find it |
|---|---|
| `ANTON_BRIDGE_URL` | ANTON → Settings → Connections → Channel Bridges → copy endpoint URL |
| `BRIDGE_TOKEN` | Shown once when you create the bridge — copy it from the wizard |
| `PHONE_NUMBER_ID` | Meta App Dashboard → WhatsApp → API Setup |
| `WHATSAPP_TOKEN` | Meta App Dashboard → WhatsApp → API Setup (access token) |
| `VERIFY_TOKEN` | You choose — any random string; you'll enter it in Meta too |
| `PORT` | Port to listen on (default: 3000) |

### 4. Deploy to get a public HTTPS URL

**Render** (recommended — free tier available):
1. Create a new Web Service → connect your repo
2. Build command: `npm install`
3. Start command: `npm start`
4. Add environment variables from your `.env`
5. Note your service URL (e.g. `https://my-bot.onrender.com`)

**Railway**:
```bash
npm install -g @railway/cli
railway init
railway up
railway variables set ANTON_BRIDGE_URL=... BRIDGE_TOKEN=... # etc.
```

**Local dev with ngrok**:
```bash
npm start &
ngrok http 3000
# Use the ngrok HTTPS URL as your webhook
```

### 5. Configure Meta Webhook

1. Go to [Meta App Dashboard](https://developers.facebook.com/apps)
2. Select your app → WhatsApp → Configuration
3. Under **Webhook**, click **Edit**:
   - **Callback URL**: `https://<your-domain>/webhook`
   - **Verify token**: the same string you put in `VERIFY_TOKEN`
4. Click **Verify and Save**
5. Subscribe to the `messages` webhook field

### 6. Test

```bash
# Test the ANTON bridge directly
curl -X POST https://your-anton-host/api/bridges/<bridge-id>/query \
  -H "Authorization: Bearer <your-bridge-token>" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the AMLR regulation?"}'

# Expected response:
# { "response": "The Anti-Money Laundering Regulation...", "tokens_used": 142, ... }
```

Then send a WhatsApp message to your business number and watch the bot reply.

---

## Customisation

### Multi-module routing

Pass `module_id` to route to a specific ANTON module:

```js
// In anton-client.js query call:
const result = await antonClient.query(userMessage, 'sanctions-advisory');
```

Or detect keywords and route automatically:
```js
const moduleId = text.toLowerCase().includes('sanction') ? 'sanctions-advisory'
               : text.toLowerCase().includes('risk')     ? 'risk-assessment'
               : null; // uses bridge default_module
const result = await antonClient.query(text, moduleId);
```

### Language detection

```js
// Pass detected language to ANTON for localised responses
const result = await antonClient.query(text, null, 'sv'); // Swedish
```

### Persistent conversations

For multi-turn conversations, store message history per user and include
it in the message (or implement conversation threading on the ANTON side
using sessions).

---

## Rate limiting

The Channel Bridge enforces a per-bridge rate limit (configured in ANTON).
If the bot receives `429 Too Many Requests`, it will reply with a friendly
"try again later" message. You can increase the bridge's `rate_limit_rpm`
in ANTON → Settings → Connections → Channel Bridges → Edit limits.

---

## Security

- Never commit `.env` to version control
- The `BRIDGE_TOKEN` is equivalent to an API key — treat it as a secret
- Set `VERIFY_TOKEN` to a long random string (e.g. `openssl rand -hex 16`)
- Use HTTPS for the webhook URL (required by Meta)
- Consider adding IP allowlisting to your hosting provider for Meta's IPs

---

## Files

| File | Purpose |
|---|---|
| `index.js` | Express app — webhook verification + message handler |
| `bot.js` | WhatsApp Cloud API: send messages, parse incoming |
| `anton-client.js` | Calls ANTON `/api/bridges/<id>/query` |
| `.env.example` | Environment variable template |
| `package.json` | Dependencies and scripts |
| `README.md` | This file |
