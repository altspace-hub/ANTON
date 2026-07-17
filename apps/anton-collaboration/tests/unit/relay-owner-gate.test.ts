import { describe, it, expect, vi } from 'vitest';
import { InMemoryStorageBackend } from '../../src/main/storage.js';
import { OwnerRegistry, loadOrMintPairingSecret, ownerGate } from '../../src/main/relay/owner-gate.js';
import type { InboundContext, RelayWire } from '../../src/main/relay/peer.js';

const PHONE = 'ANTON-AAAA-BBBB-CCCC-DDDD';
const STRANGER = 'ANTON-EEEE-FFFF-GGGG-HHHH';

function ctx(wire: RelayWire, fromHash: string) {
  const replies: RelayWire[] = [];
  const c: InboundContext = {
    wire,
    fromHash,
    fromEdPub: 'ab'.repeat(32),
    reply: async (w) => { replies.push(w); },
  };
  return { c, replies };
}

describe('loadOrMintPairingSecret', () => {
  it('mints a 32-hex secret once and returns the same one afterwards', async () => {
    const storage = new InMemoryStorageBackend();
    const first = await loadOrMintPairingSecret(storage);
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    const second = await loadOrMintPairingSecret(storage);
    expect(second).toBe(first);
  });
});

describe('ownerGate', () => {
  async function setup() {
    const storage = new InMemoryStorageBackend();
    const owners = new OwnerRegistry(storage);
    const secret = await loadOrMintPairingSecret(storage);
    const inner = vi.fn(async (_c: InboundContext) => undefined);
    const gate = ownerGate(owners, () => secret, inner);
    return { storage, owners, secret, inner, gate };
  }

  it('pair.claim with the right secret records the owner and replies pair.ok', async () => {
    const { owners, secret, gate, storage } = await setup();
    const { c, replies } = ctx({ kind: 'pair.claim', secret, id: 'r1' }, PHONE);
    await gate(c);
    expect(replies).toEqual([{ kind: 'pair.ok', owner: true, id: 'r1' }]);
    expect(await owners.isOwner(PHONE)).toBe(true);
    // Durable: a fresh registry over the same storage still knows the owner.
    expect(await new OwnerRegistry(storage).isOwner(PHONE)).toBe(true);
  });

  it('pair.claim with a wrong secret is rejected and records nothing', async () => {
    const { owners, gate } = await setup();
    const { c, replies } = ctx({ kind: 'pair.claim', secret: 'f'.repeat(32), id: 'r1' }, STRANGER);
    await gate(c);
    expect(replies[0]?.kind).toBe('pair.rejected');
    expect(await owners.isOwner(STRANGER)).toBe(false);
  });

  it('task wires from a non-owner get pair.required and never reach the inner router', async () => {
    const { gate, inner } = await setup();
    const { c, replies } = ctx({ kind: 'task.list', id: 'q1' }, STRANGER);
    await gate(c);
    expect(inner).not.toHaveBeenCalled();
    expect(replies).toEqual([{ kind: 'pair.required', error: expect.stringContaining('not paired'), id: 'q1' }]);
  });

  it('wallet + ping wires from a non-owner are refused the same way', async () => {
    const { gate, inner } = await setup();
    for (const kind of ['wallet.status', 'ping']) {
      const { c, replies } = ctx({ kind, id: 'q' }, STRANGER);
      await gate(c);
      expect(replies[0]?.kind).toBe('pair.required');
    }
    expect(inner).not.toHaveBeenCalled();
  });

  it('unknown wire kinds from a stranger are dropped silently (no reply oracle)', async () => {
    const { gate, inner } = await setup();
    const { c, replies } = ctx({ kind: 'discover.sellers', id: 'q1' }, STRANGER);
    await gate(c);
    expect(replies).toEqual([]);
    expect(inner).not.toHaveBeenCalled();
  });

  it('after a successful claim, wires flow to the inner router', async () => {
    const { gate, inner, secret } = await setup();
    await gate(ctx({ kind: 'pair.claim', secret }, PHONE).c);
    const { c } = ctx({ kind: 'task.post', text: 'buy shoes', id: 'q2' }, PHONE);
    await gate(c);
    expect(inner).toHaveBeenCalledOnce();
    expect(inner.mock.calls[0][0].wire.kind).toBe('task.post');
  });

  it('re-claiming is idempotent and multiple phones can pair', async () => {
    const { gate, owners, secret } = await setup();
    await gate(ctx({ kind: 'pair.claim', secret }, PHONE).c);
    await gate(ctx({ kind: 'pair.claim', secret }, PHONE).c);
    await gate(ctx({ kind: 'pair.claim', secret }, STRANGER).c);
    expect((await owners.list()).map((o) => o.hash).sort()).toEqual([PHONE, STRANGER].sort());
  });
});
