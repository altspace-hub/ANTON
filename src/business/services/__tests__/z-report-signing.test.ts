/**
 * z-report-signing.test.ts — the self-describing Z-report signature.
 *
 * Locks the behaviour added for WATCH-ONLY money wallets: a Z-report
 * embeds the public key that signed it (`signerPublicKeyHex`), so it
 * verifies WITHOUT the caller knowing the key up front — which is what
 * lets a per-terminal key sign the daily close when the money wallet is
 * a watch-only central company address. Legacy reports (no embedded key)
 * still verify against an externally-supplied key.
 */
import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { verifyZReport, canonicalize } from '../z-reports';
import { certDigest, encodeTerminalCert, type TerminalCert } from '../terminal-cert';
import { wallet as sdkWallet } from '@futurechain/sdk';
import type { ZReport } from '../types';

function hex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

/** A company-key-signed cert authorizing `terminalPub`. */
function mkCert(companyPriv: Uint8Array, terminalPub: string): TerminalCert {
  const pub = ed25519.getPublicKey(companyPriv);
  const unsigned: Omit<TerminalCert, 'sig'> = {
    v: 1, companyPub: hex(pub), companyAddr: sdkWallet.addressFromPublicKey(pub),
    terminalPub, label: 'Till 1', issuedAt: 1_700_000_000_000,
  };
  return { ...unsigned, sig: hex(ed25519.sign(certDigest(unsigned), companyPriv)) };
}

/** Build a genuinely-signed Z. When `embed` is true the signer pubkey is
 *  baked into the report (new self-describing form); when false it's a
 *  legacy report that must be verified with an external key. Pass `priv`
 *  to control the signing key (so an embedded cert can authorize it). */
function signedZ(embed: boolean, over: Partial<ZReport> = {},
                priv: Uint8Array = ed25519.utils.randomPrivateKey()): { z: ZReport; pubHex: string } {
  const pubHex = hex(ed25519.getPublicKey(priv));
  const base: Omit<ZReport, 'selfHash' | 'signature'> = {
    zNumber: 1, openedAt: 0, closedAt: 1000,
    fromKvittoNumber: 0, toKvittoNumber: -1,
    fromKreditNumber: 0, toKreditNumber: -1,
    salesGrossSek: 0, salesNetSek: 0,
    vatSek6: 0, vatSek12: 0, vatSek25: 0,
    voidsCount: 0, voidsGrossSek: 0,
    refundsCount: 0, refundsGrossSek: 0,
    tipsSek: 0, ftcReceivedMicro: 0n, prevHash: null,
    ...(embed ? { signerPublicKeyHex: pubHex } : {}),
    ...over,
  };
  const selfHashBytes = sha256(new TextEncoder().encode(canonicalize(base)));
  const signature = hex(ed25519.sign(selfHashBytes, priv));
  return { z: { ...base, selfHash: hex(selfHashBytes), signature }, pubHex };
}

describe('verifyZReport — self-describing (watch-only / per-terminal key)', () => {
  it('verifies against the EMBEDDED signer pubkey, no external key needed', () => {
    const { z } = signedZ(true);
    expect(z.signerPublicKeyHex).toBeTruthy();
    expect(verifyZReport(z)).toBe(true);             // no key passed → uses embedded
  });

  it('rejects a tampered field (self-hash mismatch)', () => {
    const { z } = signedZ(true);
    expect(verifyZReport({ ...z, salesGrossSek: 999 })).toBe(false);
  });

  it('rejects when the embedded key does not match the signature', () => {
    const { z } = signedZ(true);
    const otherPub = hex(ed25519.getPublicKey(ed25519.utils.randomPrivateKey()));
    // Swapping the embedded key changes the self-hash → caught there, and
    // even forcing the hash through would fail the Ed25519 check.
    expect(verifyZReport({ ...z, signerPublicKeyHex: otherPub })).toBe(false);
  });

  it('legacy report (no embedded key) still verifies against a supplied key', () => {
    const { z, pubHex } = signedZ(false);
    expect(z.signerPublicKeyHex).toBeUndefined();
    expect(verifyZReport(z, pubHex)).toBe(true);
    expect(verifyZReport(z)).toBe(false);            // no key anywhere → cannot verify
  });

  it('accepts a terminal-signed Z carrying a binding authorization cert', () => {
    const companyPriv = ed25519.utils.randomPrivateKey();
    const terminalPriv = ed25519.utils.randomPrivateKey();
    const terminalPub = hex(ed25519.getPublicKey(terminalPriv));
    const cert = encodeTerminalCert(mkCert(companyPriv, terminalPub));
    const { z } = signedZ(true, { signerCert: cert }, terminalPriv);
    expect(verifyZReport(z)).toBe(true);
  });

  it('rejects a Z whose cert authorizes a DIFFERENT terminal', () => {
    const companyPriv = ed25519.utils.randomPrivateKey();
    const terminalPriv = ed25519.utils.randomPrivateKey();
    const terminalPub = hex(ed25519.getPublicKey(terminalPriv));
    // cert authorizes someone else → binding check fails
    const wrongCert = encodeTerminalCert(mkCert(companyPriv, 'ee'.repeat(32)));
    const { z } = signedZ(true, { signerCert: wrongCert }, terminalPriv);
    void terminalPub;
    expect(verifyZReport(z)).toBe(false);
  });

  it('enforces the auditor company anchor when supplied', () => {
    const companyPriv = ed25519.utils.randomPrivateKey();
    const terminalPriv = ed25519.utils.randomPrivateKey();
    const terminalPub = hex(ed25519.getPublicKey(terminalPriv));
    const cert = encodeTerminalCert(mkCert(companyPriv, terminalPub));
    const { z } = signedZ(true, { signerCert: cert }, terminalPriv);
    const realAddr = sdkWallet.addressFromPublicKey(ed25519.getPublicKey(companyPriv));
    expect(verifyZReport(z, undefined, realAddr)).toBe(true);           // right company → ok
    expect(verifyZReport(z, undefined, 'fc_SomeOtherCompany')).toBe(false); // wrong company → rejected
  });
});
