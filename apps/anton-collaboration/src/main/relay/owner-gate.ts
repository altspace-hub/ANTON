/**
 * relay/owner-gate.ts — owner authorization for the phone↔agent relay channel.
 *
 * 2026-07-17 hardening. Before this, ANY sender who held the agent's Ed25519
 * pubkey could seal wires to it, and peer.ts's first-contact binding would
 * happily route them: the task inbox (the owner's private asks) and the
 * read-only wallet view were open to every commerce counterparty, because the
 * registry hands out the pubkey by design. Sender AUTHENTICATION (the hash
 * binds to the pubkey) is not AUTHORIZATION (this sender is the owner's phone).
 *
 * The gate: the boot-printed pair code now carries a persistent random secret
 * (`antonagent:pair?pub=…&relay=…&s=<secret>`). A phone proves it saw the
 * operator's terminal/QR by sending `pair.claim { secret }` as its first wire;
 * a constant-time match records its contact hash in a durable owner registry
 * (multiple phones allowed — re-claiming is idempotent). Every task.* /
 * wallet.* / ping wire from a non-owner is answered with `pair.required` (when
 * it carries a correlation id) and never reaches the inner router. Unknown wire
 * kinds from non-owners are dropped silently — no reply oracle.
 *
 * Escape hatch for fixtures/tests: wire the inner router directly (the
 * standalone does this under ANTON_COLLAB_PHONE_OPEN=true).
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { StorageBackend } from '../storage.js';
import type { WireRouter, RelayWire } from './peer.js';

const OWNERS_KEY = 'relay.owners.v1';
const PAIR_SECRET_KEY = 'relay.pairsecret.v1';

interface OwnerRow {
  hash: string;
  addedAt: number;
}

export class OwnerRegistry {
  private owners = new Map<string, OwnerRow>();
  private loaded = false;

  constructor(
    private readonly storage: StorageBackend,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await this.storage.get(OWNERS_KEY);
      if (raw) {
        const rows = JSON.parse(raw) as OwnerRow[];
        for (const r of rows) if (r && r.hash) this.owners.set(r.hash, r);
      }
    } catch { /* fresh store */ }
    this.loaded = true;
  }

  async isOwner(hash: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.owners.has(hash);
  }

  async addOwner(hash: string): Promise<void> {
    await this.ensureLoaded();
    if (this.owners.has(hash)) return;
    this.owners.set(hash, { hash, addedAt: this.now() });
    await this.storage.set(OWNERS_KEY, JSON.stringify([...this.owners.values()]));
  }

  async list(): Promise<OwnerRow[]> {
    await this.ensureLoaded();
    return [...this.owners.values()];
  }
}

/** Load the persistent pairing secret, minting it on first boot. 32 hex chars
 *  (128 bits) — carried in the pair QR/code as `&s=`, never sent by the agent. */
export async function loadOrMintPairingSecret(storage: StorageBackend): Promise<string> {
  const existing = await storage.get(PAIR_SECRET_KEY);
  if (existing && /^[0-9a-f]{32,}$/.test(existing)) return existing;
  const secret = randomBytes(16).toString('hex');
  await storage.set(PAIR_SECRET_KEY, secret);
  return secret;
}

function secretsMatch(expected: string, presented: unknown): boolean {
  if (typeof presented !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(presented, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Wire namespaces the gate answers `pair.required` for (request-style wires a
 *  paired phone sends — everything else from a stranger is dropped silently). */
function isPhoneNamespace(kind: string): boolean {
  return kind === 'ping' || kind.startsWith('task.') || kind.startsWith('wallet.');
}

export function ownerGate(
  owners: OwnerRegistry,
  getSecret: () => string,
  inner: WireRouter,
): WireRouter {
  return async (ctx) => {
    const { wire, fromHash, reply } = ctx;
    const id = typeof wire.id === 'string' ? wire.id : undefined;
    const respond = (w: RelayWire) => reply(id ? { ...w, id } : w);

    if (wire.kind === 'pair.claim') {
      if (secretsMatch(getSecret(), wire.secret)) {
        await owners.addOwner(fromHash);
        return respond({ kind: 'pair.ok', owner: true });
      }
      return respond({ kind: 'pair.rejected', error: 'pairing secret mismatch — re-scan the pairing code from the agent terminal' });
    }

    if (await owners.isOwner(fromHash)) {
      return inner(ctx);
    }

    if (typeof wire.kind === 'string' && isPhoneNamespace(wire.kind) && id) {
      return respond({ kind: 'pair.required', error: 'This phone is not paired to the agent — re-scan the pairing code (it now includes a pairing secret)' });
    }
    // Unknown wire from a stranger: drop silently.
  };
}
