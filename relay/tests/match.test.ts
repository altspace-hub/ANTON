import { describe, it, expect, beforeEach } from 'vitest';
import {
  MatchTable,
  RELAY_ERROR_CODE,
  ROLE,
  HARD_CEILING_SESSIONS_PER_INSTANCE,
  type Action,
  type MatchTableLimits,
} from '../src/match.js';
import { TYPE, decodeFrame, decodeRelayErrorPayload } from '../src/frame.js';
import type { ParsedHelloInstance, ParsedHelloPhone, ParsedDialInstance } from '../src/hello.js';
import { bytesToHex } from '../src/primitives.js';

// â”€â”€ Fixture builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeInstanceHello(idByte = 0xAA): ParsedHelloInstance {
  const instance_id = new Uint8Array(16).fill(idByte);
  return {
    instance_id,
    instance_static_pk: new Uint8Array(32),
    instance_ed_pk: new Uint8Array(32),
    binding_sig: new Uint8Array(64),
    relay_url: 'wss://r1.openexpert.org',
    timestamp: 0,
    proof_sig: new Uint8Array(64),
    caps: 0,
  };
}

function makePhoneHello(idByte = 0xAA, ephemByte = 0xCD): ParsedHelloPhone {
  return {
    instance_id: new Uint8Array(16).fill(idByte),
    phone_ephem_pk: new Uint8Array(32).fill(ephemByte),
    noise_init_msg: new TextEncoder().encode('mock-noise-init'),
  };
}

function makeDialInstance(targetByte = 0xBB, ephemByte = 0xCD): ParsedDialInstance {
  return {
    target_instance_id: new Uint8Array(16).fill(targetByte),
    initiator_ephem_pk: new Uint8Array(32).fill(ephemByte),
    noise_init_msg: new TextEncoder().encode('mock-dial-noise-init'),
  };
}

// Convenience: pull a typed action out of the list.
function findSend(actions: Action[], connId: string): Action | undefined {
  return actions.find(a => a.kind === 'send' && a.connId === connId);
}
function findClose(actions: Action[], connId: string): Action | undefined {
  return actions.find(a => a.kind === 'close' && a.connId === connId);
}
function decodeFrameType(action: Action): number | null {
  if (action.kind !== 'send') return null;
  return decodeFrame(action.frame).type;
}
function decodeErrorCode(action: Action): number | null {
  if (action.kind !== 'send') return null;
  const f = decodeFrame(action.frame);
  if (f.type !== TYPE.ERROR) return null;
  return decodeRelayErrorPayload(f.payload).code;
}

// â”€â”€ Happy-path: instance first, then phone â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MatchTable â€” happy path', () => {
  it('matches a phone that arrives after the instance', () => {
    const t = new MatchTable();
    const instActions = t.registerInstance('inst-1', makeInstanceHello());
    expect(instActions).toEqual([]);  // no actions until phone arrives
    expect(t.instanceCount()).toBe(1);

    const phoneActions = t.registerPhoneRequest('phone-1', makePhoneHello());
    // Should produce ACK_INSTANCE â†’ instance and ACK_PHONE â†’ phone
    expect(phoneActions).toHaveLength(2);

    const ackInstance = findSend(phoneActions, 'inst-1');
    const ackPhone = findSend(phoneActions, 'phone-1');
    expect(ackInstance).toBeDefined();
    expect(ackPhone).toBeDefined();
    expect(decodeFrameType(ackInstance!)).toBe(TYPE.ACK_INSTANCE);
    expect(decodeFrameType(ackPhone!)).toBe(TYPE.ACK_PHONE);
    expect(t.sessionCount()).toBe(1);
  });

  it('matches a phone that arrived BEFORE the instance', () => {
    const t = new MatchTable();
    const phoneActions = t.registerPhoneRequest('phone-1', makePhoneHello());
    expect(phoneActions).toEqual([]);  // queued, not matched
    expect(t.pendingPhoneCount()).toBe(1);
    expect(t.sessionCount()).toBe(0);

    const instActions = t.registerInstance('inst-1', makeInstanceHello());
    expect(t.sessionCount()).toBe(1);
    expect(t.pendingPhoneCount()).toBe(0);
    expect(findSend(instActions, 'inst-1')).toBeDefined();
    expect(findSend(instActions, 'phone-1')).toBeDefined();
  });

  it('forwards an ENVELOPE from phone to instance with from_role=PHONE', () => {
    const t = new MatchTable();
    t.registerInstance('inst-1', makeInstanceHello());
    const phoneActions = t.registerPhoneRequest('phone-1', makePhoneHello());
    // Pull session_id out of the ACK_PHONE frame.
    const ackPhone = findSend(phoneActions, 'phone-1')!;
    const sessionIdBytes = decodeFrame(ackPhone.kind === 'send' ? ackPhone.frame : new Uint8Array()).payload;

    const inner = new TextEncoder().encode('encrypted-payload-bytes');
    const fwd = t.forwardEnvelope('phone-1', sessionIdBytes, inner);

    expect(fwd).toHaveLength(1);
    expect(fwd[0]!.kind).toBe('send');
    if (fwd[0]!.kind !== 'send') throw new Error('unreachable');
    expect(fwd[0]!.connId).toBe('inst-1');
    const f = decodeFrame(fwd[0]!.frame);
    expect(f.type).toBe(TYPE.ENVELOPE);
    // Payload layout: 16 (session_id) + 1 (from_role) + inner
    expect(f.payload.length).toBe(16 + 1 + inner.length);
    expect(f.payload[16]).toBe(ROLE.PHONE);
    expect(new TextDecoder().decode(f.payload.subarray(17))).toBe('encrypted-payload-bytes');
  });

  it('forwards an ENVELOPE from instance to phone with from_role=INSTANCE', () => {
    const t = new MatchTable();
    t.registerInstance('inst-1', makeInstanceHello());
    const phoneActions = t.registerPhoneRequest('phone-1', makePhoneHello());
    const ackPhone = findSend(phoneActions, 'phone-1')!;
    const sessionIdBytes = decodeFrame(ackPhone.kind === 'send' ? ackPhone.frame : new Uint8Array()).payload;

    const fwd = t.forwardEnvelope('inst-1', sessionIdBytes, new TextEncoder().encode('reply'));
    if (fwd[0]!.kind !== 'send') throw new Error('unreachable');
    expect(fwd[0]!.connId).toBe('phone-1');
    const f = decodeFrame(fwd[0]!.frame);
    expect(f.payload[16]).toBe(ROLE.INSTANCE);
  });

  it('returns PEER_GONE when forwarding to a session that no longer exists', () => {
    const t = new MatchTable();
    const sessionIdBytes = new Uint8Array(16);
    const fwd = t.forwardEnvelope('phone-1', sessionIdBytes, new Uint8Array());
    expect(fwd).toHaveLength(1);
    expect(decodeErrorCode(fwd[0]!)).toBe(RELAY_ERROR_CODE.PEER_GONE);
  });
});

// â”€â”€ Â§3.9 â€” instance displacement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MatchTable â€” instance displacement', () => {
  it('a second HELLO_INSTANCE for the same id displaces the first', () => {
    const t = new MatchTable();
    t.registerInstance('inst-1', makeInstanceHello());
    expect(t.instanceCount()).toBe(1);

    const actions = t.registerInstance('inst-1b', makeInstanceHello());
    // Old instance gets INSTANCE_REPLACED + close
    const errToOld = findSend(actions, 'inst-1');
    expect(errToOld).toBeDefined();
    expect(decodeErrorCode(errToOld!)).toBe(RELAY_ERROR_CODE.INSTANCE_REPLACED);
    expect(findClose(actions, 'inst-1')).toBeDefined();
    expect(t.instanceCount()).toBe(1);  // still one (the new one)
  });

  it('displacement tears down all sessions and notifies their phones with PEER_GONE', () => {
    const t = new MatchTable();
    t.registerInstance('inst-1', makeInstanceHello());
    t.registerPhoneRequest('phone-1', makePhoneHello());
    t.registerPhoneRequest('phone-2', makePhoneHello());
    expect(t.sessionCount()).toBe(2);

    const actions = t.registerInstance('inst-1b', makeInstanceHello());
    expect(t.sessionCount()).toBe(0);
    // Both phones get PEER_GONE
    const phone1Err = findSend(actions, 'phone-1');
    const phone2Err = findSend(actions, 'phone-2');
    expect(decodeErrorCode(phone1Err!)).toBe(RELAY_ERROR_CODE.PEER_GONE);
    expect(decodeErrorCode(phone2Err!)).toBe(RELAY_ERROR_CODE.PEER_GONE);
    expect(findClose(actions, 'phone-1')).toBeDefined();
    expect(findClose(actions, 'phone-2')).toBeDefined();
  });

  it('phones do NOT displace phones â€” concurrent phones get distinct sessions', () => {
    const t = new MatchTable();
    t.registerInstance('inst-1', makeInstanceHello());
    t.registerPhoneRequest('phone-A', makePhoneHello(0xAA, 0x01));
    t.registerPhoneRequest('phone-B', makePhoneHello(0xAA, 0x02));
    expect(t.sessionCount()).toBe(2);
  });
});

// â”€â”€ Â§3.10 â€” concurrent-session limit per instance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MatchTable â€” per-instance session limits (Â§3.10)', () => {
  it('rejects a phone with RATE_LIMITED when the cap is reached', () => {
    const limits: MatchTableLimits = { maxSessionsPerInstance: 2, pendingPhoneTimeoutSec: 30 };
    const t = new MatchTable(limits);
    t.registerInstance('inst-1', makeInstanceHello());
    t.registerPhoneRequest('phone-1', makePhoneHello());
    t.registerPhoneRequest('phone-2', makePhoneHello());
    expect(t.sessionCount()).toBe(2);

    const actions = t.registerPhoneRequest('phone-3', makePhoneHello());
    // Should NOT have created a 3rd session
    expect(t.sessionCount()).toBe(2);
    const err = findSend(actions, 'phone-3');
    expect(decodeErrorCode(err!)).toBe(RELAY_ERROR_CODE.RATE_LIMITED);
    expect(findClose(actions, 'phone-3')).toBeDefined();
  });

  it('allows new phones once existing sessions free up slots', () => {
    const limits: MatchTableLimits = { maxSessionsPerInstance: 1, pendingPhoneTimeoutSec: 30 };
    const t = new MatchTable(limits);
    t.registerInstance('inst-1', makeInstanceHello());
    t.registerPhoneRequest('phone-1', makePhoneHello());
    expect(t.sessionCount()).toBe(1);

    // Phone-1 disconnects; slot frees up.
    t.handleDisconnect('phone-1');
    expect(t.sessionCount()).toBe(0);

    const actions = t.registerPhoneRequest('phone-2', makePhoneHello());
    expect(t.sessionCount()).toBe(1);
    expect(findSend(actions, 'phone-2')).toBeDefined();
  });

  it('throws if maxSessionsPerInstance exceeds the hard ceiling', () => {
    expect(() => new MatchTable({
      maxSessionsPerInstance: HARD_CEILING_SESSIONS_PER_INSTANCE + 1,
      pendingPhoneTimeoutSec: 30,
    })).toThrow();
  });
});

// â”€â”€ Â§3.9 â€” disconnect handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MatchTable â€” disconnect handling', () => {
  it('phone disconnect notifies its instance with PEER_GONE', () => {
    const t = new MatchTable();
    t.registerInstance('inst-1', makeInstanceHello());
    t.registerPhoneRequest('phone-1', makePhoneHello());
    t.registerPhoneRequest('phone-2', makePhoneHello());

    const actions = t.handleDisconnect('phone-1');
    expect(t.sessionCount()).toBe(1);
    const err = findSend(actions, 'inst-1');
    expect(decodeErrorCode(err!)).toBe(RELAY_ERROR_CODE.PEER_GONE);
  });

  it('instance disconnect notifies all its phones with PEER_GONE', () => {
    const t = new MatchTable();
    t.registerInstance('inst-1', makeInstanceHello());
    t.registerPhoneRequest('phone-1', makePhoneHello());
    t.registerPhoneRequest('phone-2', makePhoneHello());

    const actions = t.handleDisconnect('inst-1');
    expect(t.sessionCount()).toBe(0);
    expect(t.instanceCount()).toBe(0);
    expect(decodeErrorCode(findSend(actions, 'phone-1')!)).toBe(RELAY_ERROR_CODE.PEER_GONE);
    expect(decodeErrorCode(findSend(actions, 'phone-2')!)).toBe(RELAY_ERROR_CODE.PEER_GONE);
  });

  it('pending-phone disconnect just removes from queue without side-effects', () => {
    const t = new MatchTable();
    t.registerPhoneRequest('phone-1', makePhoneHello());
    expect(t.pendingPhoneCount()).toBe(1);

    const actions = t.handleDisconnect('phone-1');
    expect(actions).toEqual([]);
    expect(t.pendingPhoneCount()).toBe(0);
  });

  it('disconnect of unknown connection is a no-op', () => {
    const t = new MatchTable();
    expect(t.handleDisconnect('unknown')).toEqual([]);
  });
});

// â”€â”€ Â§6.6.1 â€” pending-phone timeout (NO_MATCH) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MatchTable â€” pending-phone timeout', () => {
  it('reaps stale pending phones with NO_MATCH after the window', () => {
    let now = 1000;
    const t = new MatchTable(undefined, () => now);
    t.registerPhoneRequest('phone-1', makePhoneHello());
    expect(t.pendingPhoneCount()).toBe(1);

    // Advance time past the 30s window
    now = 1031;
    const actions = t.reapStalePending();
    expect(t.pendingPhoneCount()).toBe(0);
    const err = findSend(actions, 'phone-1');
    expect(decodeErrorCode(err!)).toBe(RELAY_ERROR_CODE.NO_MATCH);
    expect(findClose(actions, 'phone-1')).toBeDefined();
  });

  it('does not reap pending phones still within the window', () => {
    let now = 1000;
    const t = new MatchTable(undefined, () => now);
    t.registerPhoneRequest('phone-1', makePhoneHello());

    now = 1015;  // 15s in, still within 30s default
    const actions = t.reapStalePending();
    expect(actions).toEqual([]);
    expect(t.pendingPhoneCount()).toBe(1);
  });

  it('reap is idempotent â€” calling twice on the same state produces the same actions', () => {
    let now = 1000;
    const t = new MatchTable(undefined, () => now);
    t.registerPhoneRequest('phone-1', makePhoneHello());
    now = 1031;
    const a1 = t.reapStalePending();
    expect(a1.length).toBeGreaterThan(0);
    const a2 = t.reapStalePending();
    expect(a2).toEqual([]);   // already reaped
  });
});

// â”€â”€ Multi-instance isolation (T6 cross-tenant test) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MatchTable â€” cross-instance isolation', () => {
  it('phones for instance A never match instance B', () => {
    const t = new MatchTable();
    t.registerInstance('inst-A', makeInstanceHello(0xAA));
    const actions = t.registerPhoneRequest('phone-X', makePhoneHello(0xBB)); // wants instance BB
    expect(actions).toEqual([]);   // no match
    expect(t.sessionCount()).toBe(0);
    expect(t.pendingPhoneCount()).toBe(1);
  });

  it('an ENVELOPE from a phone in session-A cannot be forwarded into session-B', () => {
    const t = new MatchTable();
    t.registerInstance('inst-A', makeInstanceHello(0xAA));
    t.registerInstance('inst-B', makeInstanceHello(0xBB));
    t.registerPhoneRequest('phone-A', makePhoneHello(0xAA));
    t.registerPhoneRequest('phone-B', makePhoneHello(0xBB));

    // Find session-B's session_id
    const ackB = t.registerPhoneRequest('phone-B2', makePhoneHello(0xBB));
    const ackPhoneB = findSend(ackB, 'phone-B2');
    const sessionIdB = decodeFrame(ackPhoneB!.kind === 'send' ? ackPhoneB!.frame : new Uint8Array()).payload;

    // phone-A tries to forward into session-B's session_id
    const fwd = t.forwardEnvelope('phone-A', sessionIdB, new Uint8Array(8));
    expect(decodeErrorCode(fwd[0]!)).toBe(RELAY_ERROR_CODE.PEER_GONE);
  });
});

// â”€â”€ A4 Â§3.11 â€” instance dialing a peer instance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MatchTable â€” DIAL_INSTANCE (instance-to-instance)', () => {
  it('rejects DIAL_INSTANCE from a connection that has not completed HELLO_INSTANCE first', () => {
    const t = new MatchTable();
    const actions = t.registerInstanceDial('rogue-conn', makeDialInstance(0xBB));
    const err = findSend(actions, 'rogue-conn');
    expect(err).toBeDefined();
    expect(decodeErrorCode(err!)).toBe(RELAY_ERROR_CODE.BAD_HELLO);
    expect(findClose(actions, 'rogue-conn')).toBeDefined();
    expect(t.sessionCount()).toBe(0);
  });

  it('matches when target instance is already registered', () => {
    const t = new MatchTable();
    t.registerInstance('inst-A', makeInstanceHello(0xAA));
    t.registerInstance('inst-B', makeInstanceHello(0xBB));

    const actions = t.registerInstanceDial('inst-A', makeDialInstance(0xBB));
    expect(t.sessionCount()).toBe(1);

    const ackToB = findSend(actions, 'inst-B');
    expect(ackToB).toBeDefined();
    expect(decodeFrameType(ackToB!)).toBe(TYPE.ACK_INSTANCE);

    const ackToA = findSend(actions, 'inst-A');
    expect(ackToA).toBeDefined();
    expect(decodeFrameType(ackToA!)).toBe(TYPE.ACK_PHONE);
  });

  it('queues DIAL_INSTANCE when target is not yet registered, then matches on arrival', () => {
    const t = new MatchTable();
    t.registerInstance('inst-A', makeInstanceHello(0xAA));

    const dialActions = t.registerInstanceDial('inst-A', makeDialInstance(0xBB));
    expect(dialActions).toEqual([]);
    expect(t.pendingPhoneCount()).toBe(1);

    const bActions = t.registerInstance('inst-B', makeInstanceHello(0xBB));
    expect(t.sessionCount()).toBe(1);
    expect(findSend(bActions, 'inst-B')).toBeDefined();
    expect(findSend(bActions, 'inst-A')).toBeDefined();
  });

  it('forwards ENVELOPE from initiator to responder with from_role=PHONE', () => {
    const t = new MatchTable();
    t.registerInstance('inst-A', makeInstanceHello(0xAA));
    t.registerInstance('inst-B', makeInstanceHello(0xBB));
    const actions = t.registerInstanceDial('inst-A', makeDialInstance(0xBB));
    const ackToA = findSend(actions, 'inst-A')!;
    const sessionIdBytes = decodeFrame(ackToA.kind === 'send' ? ackToA.frame : new Uint8Array()).payload;

    const fwd = t.forwardEnvelope('inst-A', sessionIdBytes, new TextEncoder().encode('init-to-resp'));
    if (fwd[0]!.kind !== 'send') throw new Error('unreachable');
    expect(fwd[0]!.connId).toBe('inst-B');
    expect(decodeFrame(fwd[0]!.frame).payload[16]).toBe(ROLE.PHONE);
  });

  it('forwards ENVELOPE from responder to initiator with from_role=INSTANCE', () => {
    const t = new MatchTable();
    t.registerInstance('inst-A', makeInstanceHello(0xAA));
    t.registerInstance('inst-B', makeInstanceHello(0xBB));
    const actions = t.registerInstanceDial('inst-A', makeDialInstance(0xBB));
    const ackToA = findSend(actions, 'inst-A')!;
    const sessionIdBytes = decodeFrame(ackToA.kind === 'send' ? ackToA.frame : new Uint8Array()).payload;

    const fwd = t.forwardEnvelope('inst-B', sessionIdBytes, new TextEncoder().encode('reply'));
    if (fwd[0]!.kind !== 'send') throw new Error('unreachable');
    expect(fwd[0]!.connId).toBe('inst-A');
    expect(decodeFrame(fwd[0]!.frame).payload[16]).toBe(ROLE.INSTANCE);
  });

  it('disconnect of the dialing instance tears down its dial and notifies responder', () => {
    const t = new MatchTable();
    t.registerInstance('inst-A', makeInstanceHello(0xAA));
    t.registerInstance('inst-B', makeInstanceHello(0xBB));
    t.registerInstanceDial('inst-A', makeDialInstance(0xBB));
    expect(t.sessionCount()).toBe(1);

    const actions = t.handleDisconnect('inst-A');
    expect(t.sessionCount()).toBe(0);
    const errToB = findSend(actions, 'inst-B');
    expect(errToB).toBeDefined();
    expect(decodeErrorCode(errToB!)).toBe(RELAY_ERROR_CODE.PEER_GONE);
  });

  it('one instance can simultaneously accept phones AND dial peers', () => {
    const t = new MatchTable();
    t.registerInstance('inst-A', makeInstanceHello(0xAA));
    t.registerInstance('inst-B', makeInstanceHello(0xBB));

    t.registerPhoneRequest('phone-1', makePhoneHello(0xAA));
    t.registerInstanceDial('inst-A', makeDialInstance(0xBB));

    expect(t.sessionCount()).toBe(2);
    expect(t.sessionsFor('bb'.repeat(16))).toBe(1);
  });
});

// Marker so the appended block is uniquely anchored: A4_TESTS_END
