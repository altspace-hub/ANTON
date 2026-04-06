/**
 * public-relay-client.ts — Client for connecting to a public/remote relay server
 *
 * When PUBLIC_RELAY_URL is configured, ANTONs use this client to:
 * 1. Store encrypted messages on the relay when direct P2P delivery fails
 * 2. Collect messages from the relay that were stored for us
 *
 * Security:
 * - API key sent in x-relay-api-key header
 * - Optional HMAC signing of request bodies
 * - All payloads are E2E encrypted — relay sees only ciphertext
 *
 * Disabled by default. Enable by setting PUBLIC_RELAY_URL in .env.
 */

import { signRelayRequest } from '../middleware/relay-auth.js';

const PUBLIC_RELAY_URL = process.env.PUBLIC_RELAY_URL?.replace(/\/+$/, '') ?? '';
const RELAY_API_KEY = process.env.PUBLIC_RELAY_API_KEY ?? '';
const RELAY_HMAC_SECRET = process.env.PUBLIC_RELAY_HMAC_SECRET ?? '';

export function isPublicRelayConfigured(): boolean {
  return PUBLIC_RELAY_URL.length > 0;
}

export function getPublicRelayUrl(): string {
  return PUBLIC_RELAY_URL;
}

/**
 * Store an encrypted message on the public relay for an offline recipient.
 */
export async function storeOnPublicRelay(params: {
  recipientHash: string;
  senderHash: string;
  encryptedPayload: string;
  messageType?: string;
  ttlDays?: number;
}): Promise<{ id: string } | null> {
  if (!PUBLIC_RELAY_URL) return null;

  const body = JSON.stringify({
    recipientHash: params.recipientHash,
    senderHash: params.senderHash,
    encryptedPayload: params.encryptedPayload,
    messageType: params.messageType ?? 'mail',
    ttlDays: params.ttlDays ?? 30,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (RELAY_API_KEY) headers['x-relay-api-key'] = RELAY_API_KEY;
  if (RELAY_HMAC_SECRET) {
    const hmacHeaders = signRelayRequest(body, RELAY_HMAC_SECRET);
    Object.assign(headers, hmacHeaders);
  }

  try {
    const res = await fetch(`${PUBLIC_RELAY_URL}/api/relay/store`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error(`[public-relay] Store failed: HTTP ${res.status} ${err}`);
      return null;
    }

    const data = await res.json() as { id: string };
    console.log(`[public-relay] Message stored on relay: ${data.id} for ${params.recipientHash}`);
    return data;
  } catch (err) {
    console.error('[public-relay] Store failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Collect pending messages from the public relay addressed to us.
 */
export async function collectFromPublicRelay(myContactHash: string): Promise<Array<{
  id: string;
  sender_hash: string;
  encrypted_payload: string;
  message_type: string;
  stored_at: string;
}>> {
  if (!PUBLIC_RELAY_URL) return [];

  const headers: Record<string, string> = {};
  if (RELAY_API_KEY) headers['x-relay-api-key'] = RELAY_API_KEY;

  try {
    const res = await fetch(
      `${PUBLIC_RELAY_URL}/api/relay/collect/${encodeURIComponent(myContactHash)}`,
      { headers, signal: AbortSignal.timeout(15_000) }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const messages = Array.isArray(data) ? data : data.messages ?? [];

    if (messages.length > 0) {
      console.log(`[public-relay] Collected ${messages.length} messages from relay`);
    }

    return messages;
  } catch (err) {
    console.error('[public-relay] Collection failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
