/**
 * terminal-cert.test.ts — per-business terminal authorization certs.
 *
 * Locks the certificate-authority crypto: a company key signs a cert for
 * a terminal key; anyone can verify it against the embedded company key;
 * tampering or a foreign signer is rejected; encode/decode round-trips.
 */
import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { wallet as sdkWallet } from '@futurechain/sdk';
import {
  verifyTerminalCert, certDigest,
  encodeTerminalCert, decodeTerminalCert,
  encodeTerminalRequest, decodeTerminalRequest,
  type TerminalCert,
} from '../terminal-cert';

function hex(b: Uint8Array): string {
  let s = ''; for (const x of b) s += x.toString(16).padStart(2, '0'); return s;
}

function signCert(companyPriv: Uint8Array, over: Partial<TerminalCert> = {}): TerminalCert {
  const pub = ed25519.getPublicKey(companyPriv);
  const unsigned: Omit<TerminalCert, 'sig'> = {
    v: 1,
    companyPub: hex(pub),
    companyAddr: sdkWallet.addressFromPublicKey(pub),  // must derive from companyPub
    terminalPub: 'aa'.repeat(32),
    label: 'Till 1 — main bar',
    issuedAt: 1_700_000_000_000,
    ...over,
  };
  const sig = hex(ed25519.sign(certDigest(unsigned), companyPriv));
  return { ...unsigned, sig };
}

describe('terminal authorization certs', () => {
  const companyPriv = ed25519.utils.randomPrivateKey();

  it('a company-signed cert verifies against its embedded company key', () => {
    expect(verifyTerminalCert(signCert(companyPriv))).toBe(true);
  });

  it('rejects a tampered field (label / terminalPub / issuedAt)', () => {
    const c = signCert(companyPriv);
    expect(verifyTerminalCert({ ...c, label: 'Hacked' })).toBe(false);
    expect(verifyTerminalCert({ ...c, terminalPub: 'bb'.repeat(32) })).toBe(false);
    expect(verifyTerminalCert({ ...c, issuedAt: c.issuedAt + 1 })).toBe(false);
  });

  it('rejects a cert whose companyPub does not match the signer', () => {
    const c = signCert(companyPriv);
    const otherPub = hex(ed25519.getPublicKey(ed25519.utils.randomPrivateKey()));
    expect(verifyTerminalCert({ ...c, companyPub: otherPub })).toBe(false);
  });

  it('rejects a spoofed companyAddr not derived from companyPub', () => {
    // The attack: sign with your OWN key but write a victim company address.
    const c = signCert(companyPriv);
    expect(verifyTerminalCert({ ...c, companyAddr: 'fc_VictimCompanyAddressSpoofed1234567' })).toBe(false);
  });

  it('encode/decode round-trips the cert', () => {
    const c = signCert(companyPriv);
    const enc = encodeTerminalCert(c);
    expect(enc.startsWith('anton-terminal:cert:')).toBe(true);
    const back = decodeTerminalCert(enc);
    expect(back).not.toBeNull();
    expect(verifyTerminalCert(back!)).toBe(true);
    expect(back!.terminalPub).toBe(c.terminalPub);
  });

  it('encode/decode round-trips the terminal request (pubkey)', () => {
    const pub = 'cd'.repeat(32);
    const enc = encodeTerminalRequest(pub);
    expect(enc).toBe('anton-terminal:req:' + pub);
    expect(decodeTerminalRequest(enc)).toBe(pub);
    expect(decodeTerminalRequest(pub)).toBe(pub);          // bare hex also accepted
    expect(decodeTerminalRequest('not-a-key')).toBeNull();
  });
});
