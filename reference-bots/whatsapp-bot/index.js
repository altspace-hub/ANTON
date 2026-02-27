/**
 * index.js
 * ANTON WhatsApp Reference Bot
 *
 * This is a minimal Express server that:
 *  1. Handles Meta webhook verification (GET /webhook)
 *  2. Receives incoming WhatsApp messages (POST /webhook)
 *  3. Calls the ANTON Channel Bridge endpoint
 *  4. Sends the plain-text response back to the user via WhatsApp Cloud API
 *
 * Deployment: Render, Railway, Fly.io, or any Node.js host with a public HTTPS URL.
 * The URL must be reachable by Meta's servers for webhook delivery.
 */

'use strict';

require('dotenv').config();

const express     = require('express');
const antonClient = require('./anton-client');
const { parseIncomingMessage, sendTextMessage, markAsRead } = require('./bot');

const app  = express();
const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN; // Your custom verification string

// Parse JSON bodies
app.use(express.json());

// ── Health check ──────────────────────────────────────────

app.get('/', (_req, res) => {
  res.send('ANTON WhatsApp Bridge — running ✓');
});

// ── Webhook verification (Meta requires GET) ─────────────

app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[webhook] Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[webhook] Verification failed — token mismatch');
  return res.sendStatus(403);
});

// ── Incoming message handler ──────────────────────────────

app.post('/webhook', async (req, res) => {
  // Always respond 200 immediately so Meta doesn't retry
  res.sendStatus(200);

  try {
    const incoming = parseIncomingMessage(req.body);
    if (!incoming) return; // Not a text message — ignore (reactions, stickers, etc.)

    const { from, text, phone_number_id } = incoming;

    console.log(`[webhook] Message from ${from}: "${text.substring(0, 80)}…"`);

    // Optional: mark as read to show double blue tick
    // await markAsRead(phone_number_id, incoming.message_id);

    // Call ANTON
    let responseText;
    try {
      const result = await antonClient.query(text);
      responseText = result.response;
      console.log(`[webhook] ANTON responded (${result.tokens_used} tokens)`);
    } catch (err) {
      if (err.status === 429) {
        responseText =
          'Service is busy right now. Please try again in a minute.';
      } else if (err.status === 403) {
        responseText =
          'This bridge is not yet active. Please contact your administrator.';
      } else {
        console.error('[webhook] ANTON error:', err.message);
        responseText =
          'Sorry, I could not process your request right now. Please try again later.';
      }
    }

    // Send reply
    await sendTextMessage(phone_number_id, from, responseText);
    console.log(`[webhook] Reply sent to ${from}`);

  } catch (err) {
    console.error('[webhook] Unhandled error:', err);
  }
});

// ── Start server ──────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`ANTON WhatsApp Reference Bot listening on port ${PORT}`);
  console.log(`Webhook URL: https://<your-domain>/webhook`);
  console.log('Configure this URL in your Meta App → WhatsApp → Configuration → Webhook');
});
