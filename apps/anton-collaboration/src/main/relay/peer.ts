/**
 * relay/peer.ts — the agent standalone as a Comm-style relay peer.
 *
 * Holds the agent's relay identity, a durable store of paired phones, and a
 * poll loop over the relay mailbox: collect → resolve the sender's pubkey
 * (from a known contact, or from the first message's cleartext senderPub,
 * verified against the claimed hash) → E2E-decrypt → parse the wire → route →
 * reply. The wire router is pluggable so P2 can add the task-inbox verbs while
 * P1 proves the channel with ping/hello.
 *
 * Phones pair by SCANNING the agent's pubkey (QR) — the contact hash alone
 * can't encrypt to us, so the QR carries the raw Ed25519 pubkey; the phone
 * derives our hash from it. That mirrors Comm's "QR has the pubkey" path.
 */
import type { StorageBackend } from '../storage.js';
import type { RelayIdentity } from './identity.js';
import { deriveContactHash } from './identity.js';
import { sealForPeer, openFromPeer, type EncryptedEnvelope } from './crypto.js';
import type { Mailbox } from './mailbox-client.js';

export interface RelayWire {
  kind: string;
  [k: string]: unknown;
}

export interface InboundContext {
  wire: RelayWire;
  fromHash: string;
  fromEdPub: string;
  /** Send a wire back to this sender (sealed + stored). */
  reply: (wire: RelayWire) => Promise<void>;
}

/** Handle one decrypted inbound wire. Return nothing — use ctx.reply to answer. */
export type WireRouter = (ctx: InboundContext) => Promise<void>;

interface RelayContact {
  hash: string;
  edPubHex: string;
  name?: string;
  /** true once we've received a message from them (proof they hold our pubkey). */
  confirmed: boolean;
  addedAt: number;
}

const CONTACTS_KEY = 'relay.contacts.v1';

export class RelayPeer {
  private contacts = new Map<string, RelayContact>();
  private loaded = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  constructor(
    private readonly identity: RelayIdentity,
    private readonly mailbox: Mailbox,
    private readonly storage: StorageBackend,
    private router: WireRouter,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Swap the wire router (P2 wires the task-inbox handler here). */
  setRouter(router: WireRouter): void { this.router = router; }

  get contactHash(): string { return this.identity.contactHash; }
  get edPubHex(): string { return this.identity.edPubHex; }

  // ── Contact store ──────────────────────────────────────────────────────
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await this.storage.get(CONTACTS_KEY);
      if (raw) {
        const rows = JSON.parse(raw) as RelayContact[];
        for (const r of rows) if (r && r.hash) this.contacts.set(r.hash, r);
      }
    } catch { /* fresh */ }
    this.loaded = true;
  }

  private async persistContacts(): Promise<void> {
    await this.storage.set(CONTACTS_KEY, JSON.stringify([...this.contacts.values()]));
  }

  async listContacts(): Promise<RelayContact[]> {
    await this.ensureLoaded();
    return [...this.contacts.values()];
  }

  /** Record / update a paired phone. */
  private async upsertContact(hash: string, edPubHex: string, confirmed: boolean): Promise<void> {
    const existing = this.contacts.get(hash);
    this.contacts.set(hash, {
      hash,
      edPubHex,
      confirmed: confirmed || existing?.confirmed || false,
      addedAt: existing?.addedAt ?? this.now(),
      ...(existing?.name ? { name: existing.name } : {}),
    });
    await this.persistContacts();
  }

  // ── Send ───────────────────────────────────────────────────────────────
  /** Seal a wire for a peer + store it to their mailbox. Attaches our pubkey
   *  in cleartext until they've confirmed (so a phone that only has our hash
   *  could still open it — though normally it has our pubkey from the QR). */
  async sendWire(toHash: string, toEdPub: string, wire: RelayWire): Promise<void> {
    await this.ensureLoaded();
    const env: EncryptedEnvelope = sealForPeer(
      JSON.stringify(wire), this.identity.x, toEdPub, this.identity.contactHash, toHash,
    );
    if (!this.contacts.get(toHash)?.confirmed) env.senderPub = this.identity.edPubHex;
    await this.mailbox.store({
      recipientHash: toHash,
      senderHash: this.identity.contactHash,
      encryptedPayload: JSON.stringify(env),
      messageType: 'agent',
    });
  }

  // ── Poll ───────────────────────────────────────────────────────────────
  /** Collect + process one batch. Returns the number of wires handled. */
  async pollOnce(): Promise<number> {
    await this.ensureLoaded();
    const msgs = await this.mailbox.collect(this.identity.contactHash);
    let handled = 0;
    for (const msg of msgs) {
      try {
        const env = JSON.parse(msg.encrypted_payload) as EncryptedEnvelope;
        const fromHash = msg.sender_hash;
        // Resolve the sender's Ed25519 pubkey.
        let fromEdPub = this.contacts.get(fromHash)?.edPubHex;
        if (!fromEdPub) {
          // First contact: trust the cleartext senderPub ONLY if it binds to the
          // claimed hash (deriveContactHash(pub) === sender_hash). Forged pubkeys
          // can't match — this is what makes a first message trustworthy.
          if (env.senderPub && deriveContactHash(env.senderPub) === fromHash) {
            fromEdPub = env.senderPub;
          } else {
            continue; // can't decrypt an unknown sender with no valid senderPub
          }
        }
        const plaintext = openFromPeer(env, this.identity.x, fromEdPub, fromHash, this.identity.contactHash);
        const wire = JSON.parse(plaintext) as RelayWire;
        // Receiving a valid message confirms the contact (they hold our pubkey).
        await this.upsertContact(fromHash, fromEdPub, true);
        await this.router({
          wire, fromHash, fromEdPub,
          reply: (w) => this.sendWire(fromHash, fromEdPub!, w),
        });
        handled++;
      } catch {
        // bad envelope / wrong key / replay — drop it, keep polling.
      }
    }
    return handled;
  }

  start(intervalMs = 4000): void {
    if (this.timer) return;
    const tick = () => {
      if (this.polling) return;
      this.polling = true;
      void this.pollOnce().catch(() => { /* network blip — next tick retries */ }).finally(() => { this.polling = false; });
    };
    this.timer = setInterval(tick, intervalMs);
    if (typeof this.timer === 'object' && this.timer && 'unref' in this.timer) (this.timer as { unref: () => void }).unref();
    tick(); // poll immediately
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

/** The P1 default router — proves the channel: ping→pong, hello/contact_request
 *  acknowledged (the contact is already stored by pollOnce). P2 replaces this
 *  with the task-inbox router. */
export function defaultRouter(): WireRouter {
  return async ({ wire, reply }) => {
    if (wire.kind === 'ping') {
      await reply({ kind: 'pong', ts: Date.now(), echo: typeof wire.text === 'string' ? wire.text : undefined });
    } else if (wire.kind === 'hello' || wire.kind === 'contact_request') {
      await reply({ kind: 'welcome', ts: Date.now() });
    }
    // unknown kinds are ignored in P1
  };
}
