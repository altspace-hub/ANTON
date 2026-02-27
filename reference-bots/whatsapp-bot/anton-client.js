/**
 * anton-client.js
 * Calls the ANTON Channel Bridge endpoint.
 * Abstracts the HTTP call so bot.js stays clean.
 */

'use strict';

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const ANTON_BRIDGE_URL  = process.env.ANTON_BRIDGE_URL;   // e.g. http://localhost:3001/api/bridges/<id>/query
const BRIDGE_TOKEN      = process.env.BRIDGE_TOKEN;        // 64-char hex bearer token

if (!ANTON_BRIDGE_URL || !BRIDGE_TOKEN) {
  throw new Error(
    'Missing ANTON_BRIDGE_URL or BRIDGE_TOKEN in environment. ' +
    'Copy .env.example → .env and fill in the values.'
  );
}

/**
 * Send a message to ANTON and get a plain-text response.
 *
 * @param {string} message      — The user's text message
 * @param {string} [moduleId]   — Optional module override (e.g. 'sanctions-advisory')
 * @param {string} [language]   — Optional language override (e.g. 'sv')
 * @returns {Promise<{ response: string, module_used: string, tokens_used: number }>}
 */
async function query(message, moduleId, language) {
  const body = { message };
  if (moduleId) body.module_id = moduleId;
  if (language) body.language  = language;

  const response = await fetch(ANTON_BRIDGE_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${BRIDGE_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    throw Object.assign(new Error('Rate limit exceeded'), { status: 429 });
  }

  if (response.status === 403) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(
      new Error(data.error || 'Forbidden — check bridge status and token'),
      { status: 403 }
    );
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(
      new Error(data.error || `ANTON error: HTTP ${response.status}`),
      { status: response.status }
    );
  }

  return response.json();
}

module.exports = { query };
