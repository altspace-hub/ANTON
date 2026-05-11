import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContactRegistry,
  COMM_ERROR_CODE,
  DEFAULT_COMM_LIMITS,
  type CommRegistryLimits,
  parseSendComm,
  parseAckDelivery,
} from '../src/comm-registry.js';
import { TYPE, decodeFrame, decodeRelayErrorPayload, encodeFrame } from '../src/frame.js';

// ── Test fixtures ───────────────────────────────────────────────────────

function bytes(byte: number, len = 16): Uint8Array {
  return new Uint8Array(len).fill(byte);
}

function mockNow(start: number): () => number {
  let t = start;
  const fn = () => t;
  (fn as unknown as { advance: (s: number) => void }).advance = (s: number) => { t += s; };
  return fn;
}

// ── registerComm ────────────────────────────────────────────────────────

describe('ContactRegistry — registration', () => {
  let reg: ContactRegistry;

  beforeEach(() => {
    reg = new ContactRegistry();
  });

  it('emits ACK_COMM with a session_id and pending_count=0 for first registration', () => {
    const actions = reg.registerComm('conn-1', bytes(0xAA));
    expect(actions.length).toBe(1);
    expect(actions[0]!.kind).toBe('send');
    const frame = decodeFrame((actions[0] as { frame: Uint8Array }).frame);
    expect(frame.type).toBe(TYPE.ACK_COMM);
    // ACK_COMM payload: 16-byte session_id + 2-byte pending_count + 4-byte mailbox_ttl
    expect(frame.payload.length).toBe(22);
    const pending = (frame.payload[16]! << 8) | frame.payload[17]!;
    expect(pending).toBe(0);
  });

  it('tracks routing_id → conn so isOnline() reports true', () => {
    reg.registerComm('conn-1', bytes(0xAA));
    expect(reg.isOnline('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    expect(reg.sessionCount()).toBe(1);
  });

  it('displaces the older session with INSTANCE_REPLACED when same routing_id re-registers', () => {
    reg.registerComm('conn-1', bytes(0xAA));
    const actions = reg.registerComm('conn-2', bytes(0xAA));
    // First action: ERROR (INSTANCE_REPLACED) to conn-1
    const errAction = actions.find(a => a.kind === 'send' && a.connId === 'conn-1') as
      | { kind: 'send'; frame: Uint8Array } | undefined;
    expect(errAction).toBeDefined();
    const errFrame = decodeFrame(errAction!.frame);
    expect(errFrame.type).toBe(TYPE.ERROR);
    const err = decodeRelayErrorPayload(errFrame.payload);
    expect(err.code).toBe(COMM_ERROR_CODE.INSTANCE_REPLACED);
    // Second action: close conn-1
    expect(actions.find(a => a.kind === 'close' && a.connId === 'conn-1')).toBeDefined();
    // Then ACK_COMM to conn-2
    expect(actions.find(a => a.kind === 'send' && a.connId === 'conn-2')).toBeDefined();
    expect(reg.sessionCount()).toBe(1);
  });
});

// ── routeSend online ────────────────────────────────────────────────────

describe('ContactRegistry — online routing', () => {
  let reg: ContactRegistry;

  beforeEach(() => { reg = new ContactRegistry(); });

  function getSessionId(actions: ReturnType<ContactRegistry['registerComm']>): Uint8Array {
    const ackAction = actions.find(a => a.kind === 'send') as { kind: 'send'; frame: Uint8Array };
    const ackFrame = decodeFrame(ackAction.frame);
    return ackFrame.payload.slice(0, 16);
  }

  it('forwards DELIVER_COMM to the target when both peers are registered', () => {
    const aliceActs = reg.registerComm('alice-conn', bytes(0xAA));
    const aliceSession = getSessionId(aliceActs);
    reg.registerComm('bob-conn', bytes(0xBB));

    const ciphertext = new TextEncoder().encode('ciphertext-bytes');
    const messageId = bytes(0x11);

    const out = reg.routeSend('alice-conn', aliceSession, bytes(0xBB), messageId, ciphertext);
    expect(out.length).toBe(1);
    expect(out[0]!.kind).toBe('send');
    expect((out[0] as { connId: string }).connId).toBe('bob-conn');

    const delivered = decodeFrame((out[0] as { frame: Uint8Array }).frame);
    expect(delivered.type).toBe(TYPE.DELIVER_COMM);
    // from_routing_id = Alice's routing_id (relay-stamped, NOT what client sent)
    expect(Array.from(delivered.payload.slice(0, 16))).toEqual(Array.from(bytes(0xAA)));
    // message_id echoed
    expect(Array.from(delivered.payload.slice(16, 32))).toEqual(Array.from(messageId));
    // ciphertext at byte 36
    expect(new TextDecoder().decode(delivered.payload.slice(36))).toBe('ciphertext-bytes');
  });

  it('rejects SEND_COMM from an unregistered sender with PEER_GONE', () => {
    const out = reg.routeSend('ghost-conn', bytes(0x00), bytes(0xBB), bytes(0x11), new Uint8Array(0));
    expect(out.length).toBe(1);
    const frame = decodeFrame((out[0] as { frame: Uint8Array }).frame);
    expect(frame.type).toBe(TYPE.ERROR);
    const err = decodeRelayErrorPayload(frame.payload);
    expect(err.code).toBe(COMM_ERROR_CODE.PEER_GONE);
  });

  it('rejects SEND_COMM with mismatched session_id', () => {
    reg.registerComm('alice-conn', bytes(0xAA));
    const wrong = bytes(0xFF);
    const out = reg.routeSend('alice-conn', wrong, bytes(0xBB), bytes(0x11), new Uint8Array(0));
    const frame = decodeFrame((out[0] as { frame: Uint8Array }).frame);
    expect(frame.type).toBe(TYPE.ERROR);
    const err = decodeRelayErrorPayload(frame.payload);
    expect(err.code).toBe(COMM_ERROR_CODE.PEER_GONE);
  });
});

// ── Mailbox + offline routing ───────────────────────────────────────────

describe('ContactRegistry — mailbox', () => {
  let reg: ContactRegistry;
  let now: ReturnType<typeof mockNow>;

  beforeEach(() => {
    now = mockNow(1_000_000);
    reg = new ContactRegistry(DEFAULT_COMM_LIMITS, now);
  });

  function getSessionId(actions: ReturnType<ContactRegistry['registerComm']>): Uint8Array {
    const ackAction = actions.find(a => a.kind === 'send') as { kind: 'send'; frame: Uint8Array };
    const ackFrame = decodeFrame(ackAction.frame);
    return ackFrame.payload.slice(0, 16);
  }

  it('queues a SEND_COMM when target is offline; emits no actions', () => {
    const aliceActs = reg.registerComm('alice-conn', bytes(0xAA));
    const aliceSession = getSessionId(aliceActs);
    const out = reg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x11), new TextEncoder().encode('hi'));
    expect(out).toEqual([]);
    expect(reg.mailboxSize('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe(1);
  });

  it('drains the mailbox to a Comm when it registers', () => {
    // Alice sends 3 to offline Bob
    const aliceActs = reg.registerComm('alice-conn', bytes(0xAA));
    const aliceSession = getSessionId(aliceActs);
    for (let i = 0; i < 3; i++) {
      reg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x10 + i), new TextEncoder().encode(`msg-${i}`));
    }
    expect(reg.mailboxSize('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe(3);

    // Bob registers — drain
    const bobActs = reg.registerComm('bob-conn', bytes(0xBB));
    // First action is ACK_COMM with pending_count=3
    const ack = decodeFrame((bobActs[0] as { frame: Uint8Array }).frame);
    expect(ack.type).toBe(TYPE.ACK_COMM);
    expect((ack.payload[16]! << 8) | ack.payload[17]!).toBe(3);
    // Next three are DELIVER_COMM
    expect(bobActs.length).toBe(4);
    for (let i = 1; i <= 3; i++) {
      const f = decodeFrame((bobActs[i] as { frame: Uint8Array }).frame);
      expect(f.type).toBe(TYPE.DELIVER_COMM);
    }
    // Mailbox emptied
    expect(reg.mailboxSize('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe(0);
  });

  it('rejects with MAILBOX_FULL when recipient mailbox at capacity', () => {
    const tightLimits: CommRegistryLimits = { ...DEFAULT_COMM_LIMITS, mailboxCapacity: 2, sendsPerMinutePerSender: 100 };
    const tightReg = new ContactRegistry(tightLimits, now);
    const aliceActs = tightReg.registerComm('alice-conn', bytes(0xAA));
    const aliceSession = getSessionId(aliceActs);
    // Fill mailbox
    tightReg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x10), new Uint8Array(1));
    tightReg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x11), new Uint8Array(1));
    // Third should fail
    const out = tightReg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x12), new Uint8Array(1));
    expect(out.length).toBe(1);
    const frame = decodeFrame((out[0] as { frame: Uint8Array }).frame);
    expect(frame.type).toBe(TYPE.ERROR);
    const err = decodeRelayErrorPayload(frame.payload);
    expect(err.code).toBe(COMM_ERROR_CODE.MAILBOX_FULL);
  });

  it('evicts TTL-expired mailbox entries on reap', () => {
    const shortTtl: CommRegistryLimits = { ...DEFAULT_COMM_LIMITS, mailboxTtlSecs: 60 };
    const ttlReg = new ContactRegistry(shortTtl, now);
    const aliceActs = ttlReg.registerComm('alice-conn', bytes(0xAA));
    const aliceSession = getSessionId(aliceActs);
    ttlReg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x10), new Uint8Array(1));
    expect(ttlReg.mailboxSize('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe(1);

    // Advance time past TTL
    (now as unknown as { advance: (s: number) => void }).advance(61);
    ttlReg.reapStaleMailbox();
    expect(ttlReg.mailboxSize('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe(0);
  });
});

// ── Rate limiting ───────────────────────────────────────────────────────

describe('ContactRegistry — rate limit', () => {
  let now: ReturnType<typeof mockNow>;

  beforeEach(() => { now = mockNow(1_000_000); });

  function getSessionId(actions: ReturnType<ContactRegistry['registerComm']>): Uint8Array {
    const ackAction = actions.find(a => a.kind === 'send') as { kind: 'send'; frame: Uint8Array };
    const ackFrame = decodeFrame(ackAction.frame);
    return ackFrame.payload.slice(0, 16);
  }

  it('rejects with RATE_LIMITED past the per-minute budget', () => {
    const tight: CommRegistryLimits = { ...DEFAULT_COMM_LIMITS, sendsPerMinutePerSender: 2 };
    const reg = new ContactRegistry(tight, now);
    const aliceActs = reg.registerComm('alice-conn', bytes(0xAA));
    const aliceSession = getSessionId(aliceActs);
    reg.registerComm('bob-conn', bytes(0xBB));

    // 2 sends allowed
    expect(reg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x10), new Uint8Array(1)).length).toBe(1);
    expect(reg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x11), new Uint8Array(1)).length).toBe(1);
    // 3rd rejected
    const out = reg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x12), new Uint8Array(1));
    const frame = decodeFrame((out[0] as { frame: Uint8Array }).frame);
    const err = decodeRelayErrorPayload(frame.payload);
    expect(err.code).toBe(COMM_ERROR_CODE.RATE_LIMITED);
  });

  it('releases budget after the 60s window slides forward', () => {
    const tight: CommRegistryLimits = { ...DEFAULT_COMM_LIMITS, sendsPerMinutePerSender: 1 };
    const reg = new ContactRegistry(tight, now);
    const aliceActs = reg.registerComm('alice-conn', bytes(0xAA));
    const aliceSession = getSessionId(aliceActs);
    reg.registerComm('bob-conn', bytes(0xBB));

    reg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x10), new Uint8Array(1));
    const blocked = reg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x11), new Uint8Array(1));
    const blockedFrame = decodeFrame((blocked[0] as { frame: Uint8Array }).frame);
    expect(decodeRelayErrorPayload(blockedFrame.payload).code).toBe(COMM_ERROR_CODE.RATE_LIMITED);

    // Slide past the 60s window
    (now as unknown as { advance: (s: number) => void }).advance(61);
    const ok = reg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x12), new Uint8Array(1));
    expect(ok.length).toBe(1);
    const okFrame = decodeFrame((ok[0] as { frame: Uint8Array }).frame);
    expect(okFrame.type).toBe(TYPE.DELIVER_COMM);
  });
});

// ── Disconnect cleanup ──────────────────────────────────────────────────

describe('ContactRegistry — disconnect', () => {
  it('removes the session and forgets isOnline()', () => {
    const reg = new ContactRegistry();
    reg.registerComm('alice-conn', bytes(0xAA));
    expect(reg.isOnline('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    reg.handleDisconnect('alice-conn');
    expect(reg.isOnline('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(reg.sessionCount()).toBe(0);
  });

  it('keeps the mailbox after the recipient disconnects (offline path)', () => {
    const reg = new ContactRegistry();
    const aliceActs = reg.registerComm('alice-conn', bytes(0xAA));
    const aliceSession = decodeFrame((aliceActs[0] as { frame: Uint8Array }).frame).payload.slice(0, 16);
    reg.registerComm('bob-conn', bytes(0xBB));
    reg.handleDisconnect('bob-conn');
    // Alice sends — Bob is now offline, message goes to mailbox
    reg.routeSend('alice-conn', aliceSession, bytes(0xBB), bytes(0x10), new TextEncoder().encode('hi'));
    expect(reg.mailboxSize('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe(1);
  });

  it('is a no-op for an unknown connId', () => {
    const reg = new ContactRegistry();
    expect(() => reg.handleDisconnect('never-existed')).not.toThrow();
    expect(reg.sessionCount()).toBe(0);
  });
});

// ── Wire-format parsers ────────────────────────────────────────────────

describe('parseSendComm', () => {
  it('parses a well-formed payload', () => {
    const session = bytes(0x11);
    const target = bytes(0xBB);
    const msgId = bytes(0x33);
    const ct = new TextEncoder().encode('ciphertext');
    const payload = new Uint8Array(16 + 16 + 16 + ct.length);
    payload.set(session, 0);
    payload.set(target, 16);
    payload.set(msgId, 32);
    payload.set(ct, 48);
    const parsed = parseSendComm(payload);
    expect(Array.from(parsed.session_id)).toEqual(Array.from(session));
    expect(Array.from(parsed.target_routing_id)).toEqual(Array.from(target));
    expect(Array.from(parsed.message_id)).toEqual(Array.from(msgId));
    expect(new TextDecoder().decode(parsed.ciphertext)).toBe('ciphertext');
  });

  it('throws on a short payload', () => {
    expect(() => parseSendComm(new Uint8Array(40))).toThrow();
  });
});

describe('parseAckDelivery', () => {
  it('parses a 17-byte payload', () => {
    const msgId = bytes(0x33);
    const payload = new Uint8Array(17);
    payload.set(msgId, 0);
    payload[16] = 0x02; // 'read'
    const parsed = parseAckDelivery(payload);
    expect(Array.from(parsed.message_id)).toEqual(Array.from(msgId));
    expect(parsed.kind).toBe(0x02);
  });

  it('throws on wrong length', () => {
    expect(() => parseAckDelivery(new Uint8Array(16))).toThrow();
    expect(() => parseAckDelivery(new Uint8Array(18))).toThrow();
  });
});

// ── Unused-import shim (so the linter doesn't complain about encodeFrame) ──
void encodeFrame;
