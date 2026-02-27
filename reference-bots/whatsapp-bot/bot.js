/**
 * bot.js
 * WhatsApp Cloud API helpers.
 * Parses incoming webhook payloads and sends reply messages.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

'use strict';

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;

const WA_API_BASE = 'https://graph.facebook.com/v19.0';

/**
 * Parse the first text message from a WhatsApp webhook payload.
 * Returns null if the payload doesn't contain a text message.
 *
 * @param {object} body — parsed JSON body from the POST /webhook handler
 * @returns {{ from: string, text: string, phone_number_id: string } | null}
 */
function parseIncomingMessage(body) {
  try {
    const entry   = body?.entry?.[0];
    const change  = entry?.changes?.[0];
    const value   = change?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== 'text') return null;

    return {
      from:             message.from,
      text:             message.text.body,
      phone_number_id:  value.metadata?.phone_number_id ?? PHONE_NUMBER_ID,
    };
  } catch {
    return null;
  }
}

/**
 * Send a plain-text WhatsApp message.
 *
 * @param {string} phoneNumberId  — The WhatsApp Business phone number ID
 * @param {string} to             — Recipient phone number (e164 format, e.g. '46701234567')
 * @param {string} text           — Message text
 */
async function sendTextMessage(phoneNumberId, to, text) {
  const url = `${WA_API_BASE}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`WhatsApp send failed: ${JSON.stringify(data)}`);
  }

  return response.json();
}

/**
 * Send a "typing..." indicator (optional — shows a read receipt).
 *
 * @param {string} phoneNumberId
 * @param {string} messageId — The incoming message ID to mark as read
 */
async function markAsRead(phoneNumberId, messageId) {
  const url = `${WA_API_BASE}/${phoneNumberId}/messages`;
  await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  }).catch(() => {}); // Non-critical
}

module.exports = { parseIncomingMessage, sendTextMessage, markAsRead };
