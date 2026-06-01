/**
 * terminal-cert-verify.test.ts — the relay must accept a terminal cert
 * signed exactly the way the ANTON Business app signs it
 * (src/business/services/terminal-cert.ts certDigest), and reject tampered
 * or wrongly-signed ones. Cross-implementation: app signs with
 * @noble/curves, relay verifies with @noble/ed25519 — both RFC 8032.
 */
import { describe, it, expect } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { verifyTerminalCertSig } from '../src/registry/verify.js';

ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed25519.etc.concatBytes(...m));

function hex(b: Uint8Array): string { let s = ''; for (const x of b) s += x.toString(16).padStart(2, '0'); return s; }

/** Mirror of the app's certDigest (sorted-keys JSON + domain tag + sha256). */
function certDigest(unsigned: Record<string, unknown>): Uint8Array {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(unsigned).sort()) sorted[k] = unsigned[k];
  return sha256(new TextEncoder().encode('anton-terminal-cert|v1|' + JSON.stringify(sorted)));
}

describe('relay verifyTerminalCertSig', () => {
  it('accepts a cert signed the way the app signs it; rejects tampering', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const companyPub = hex(ed25519.getPublicKey(priv));
    const unsigned = {
      v: 1, companyPub, companyAddr: 'fc_Company11111111111111111111111',
      terminalPub: 'aa'.repeat(32), label: 'Till 1 — main bar', issuedAt: 1_700_000_000_000,
    };
    const sig = hex(ed25519.sign(certDigest(unsigned), priv));
    const cert = { ...unsigned, sig };

    expect(await verifyTerminalCertSig(cert)).toBe(true);
    expect(await verifyTerminalCertSig({ ...cert, label: 'Hacked' })).toBe(false);
    expect(await verifyTerminalCertSig({ ...cert, terminalPub: 'bb'.repeat(32) })).toBe(false);
    expect(await verifyTerminalCertSig({ ...cert, sig: 'ab'.repeat(64) })).toBe(false);
    expect(await verifyTerminalCertSig({ ...cert, companyPub: hex(ed25519.getPublicKey(ed25519.utils.randomPrivateKey())) })).toBe(false);
  });
});
