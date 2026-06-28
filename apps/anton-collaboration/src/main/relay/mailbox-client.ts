/**
 * relay/mailbox-client.ts — the store-and-forward mailbox transport for the
 * phone↔agent channel. Mirrors how ANTON Comm peers exchange offline mail:
 *   POST {base}/relay/store   { recipientHash, senderHash, encryptedPayload, messageType }
 *   GET  {base}/relay/collect/:contactHash   → [{ id, sender_hash, encrypted_payload, ... }]
 *
 * The relay sees only ciphertext + the two contact hashes (server/services/
 * relay-service.ts). On a PUBLIC relay (RELAY_PUBLIC=true) requests need an
 * api key + HMAC (server/middleware/relay-auth.ts); both are optional + passed
 * via MailboxAuth so a loopback dev relay needs neither.
 *
 * `Mailbox` is an interface so the relay peer can be unit-tested against an
 * in-memory mailbox with no network.
 */
import { createHmac } from 'node:crypto';

export interface MailboxMessage {
  id: string;
  sender_hash: string;
  encrypted_payload: string;
  message_type: string;
  stored_at?: string;
}

export interface Mailbox {
  store(args: { recipientHash: string; senderHash: string; encryptedPayload: string; messageType?: string }): Promise<void>;
  collect(ownHash: string): Promise<MailboxMessage[]>;
}

export interface MailboxAuth {
  apiKey?: string;
  hmacSecret?: string;
}

const TIMEOUT_MS = 15_000;

/** The real relay-backed mailbox (HTTP). */
export class HttpMailbox implements Mailbox {
  constructor(private readonly base: string, private readonly auth: MailboxAuth = {}) {
    this.base = base.replace(/\/+$/, '');
  }

  private headers(body?: string): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.auth.apiKey) h['x-relay-api-key'] = this.auth.apiKey;
    if (this.auth.hmacSecret && body !== undefined) {
      const timestamp = Date.now().toString();
      h['x-relay-timestamp'] = timestamp;
      h['x-relay-signature'] = createHmac('sha256', this.auth.hmacSecret).update(`${timestamp}.${body}`).digest('hex');
    }
    return h;
  }

  async store(args: { recipientHash: string; senderHash: string; encryptedPayload: string; messageType?: string }): Promise<void> {
    const body = JSON.stringify({ ...args, messageType: args.messageType ?? 'agent' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.base}/relay/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers(body) },
        body,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`relay store failed: HTTP ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async collect(ownHash: string): Promise<MailboxMessage[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.base}/relay/collect/${encodeURIComponent(ownHash)}`, {
        method: 'GET',
        headers: this.headers(),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`relay collect failed: HTTP ${res.status}`);
      const arr = (await res.json()) as MailboxMessage[];
      return Array.isArray(arr) ? arr : [];
    } finally {
      clearTimeout(timer);
    }
  }
}

/** In-memory mailbox for tests — a shared map keyed by recipient hash. */
export class InMemoryMailbox implements Mailbox {
  private queues = new Map<string, MailboxMessage[]>();
  private seq = 0;

  async store(args: { recipientHash: string; senderHash: string; encryptedPayload: string; messageType?: string }): Promise<void> {
    const q = this.queues.get(args.recipientHash) ?? [];
    q.push({
      id: `m_${++this.seq}`,
      sender_hash: args.senderHash,
      encrypted_payload: args.encryptedPayload,
      message_type: args.messageType ?? 'agent',
    });
    this.queues.set(args.recipientHash, q);
  }

  async collect(ownHash: string): Promise<MailboxMessage[]> {
    const q = this.queues.get(ownHash) ?? [];
    this.queues.set(ownHash, []); // mark collected (drain)
    return q;
  }
}
