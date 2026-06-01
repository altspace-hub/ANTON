/**
 * relay-terminals.test.ts — the dashboard NEVER trusts the relay.
 *
 * fetchCompanyTerminals re-verifies every cert client-side: a tampered
 * cert, a cert signed by a foreign key, a spoofed-address cert, and a cert
 * for a different company are all filtered out — only fully-valid certs for
 * the asked company survive.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { wallet as sdkWallet } from '@futurechain/sdk';
import { certDigest, type TerminalCert } from '../terminal-cert';
import { fetchCompanyTerminals, publishTerminalCert } from '../relay-terminals';

function hex(b: Uint8Array): string { let s = ''; for (const x of b) s += x.toString(16).padStart(2, '0'); return s; }

function signCert(companyPriv: Uint8Array, over: Partial<TerminalCert> = {}): TerminalCert {
  const pub = ed25519.getPublicKey(companyPriv);
  const unsigned: Omit<TerminalCert, 'sig'> = {
    v: 1, companyPub: hex(pub), companyAddr: sdkWallet.addressFromPublicKey(pub),
    terminalPub: 'aa'.repeat(32), label: 'Till', issuedAt: 1_700_000_000_000, ...over,
  };
  return { ...unsigned, sig: hex(ed25519.sign(certDigest(unsigned), companyPriv)) };
}

function mockFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => JSON.stringify(body) }));
}

afterEach(() => { vi.restoreAllMocks(); });

describe('relay-terminals — client never trusts the relay', () => {
  it('keeps only valid certs for the asked company', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const companyAddr = sdkWallet.addressFromPublicKey(ed25519.getPublicKey(priv));
    const otherPriv = ed25519.utils.randomPrivateKey();

    const good1 = signCert(priv, { terminalPub: 'aa'.repeat(32), companyAddr });
    const good2 = signCert(priv, { terminalPub: 'bb'.repeat(32), companyAddr });
    const tampered = { ...good1, terminalPub: 'cc'.repeat(32) };               // sig no longer matches
    const foreign = signCert(otherPriv, { terminalPub: 'dd'.repeat(32) });      // valid, but different company
    const spoof = signCert(otherPriv, { terminalPub: 'ee'.repeat(32), companyAddr }); // claims our addr, signed by other key

    globalThis.fetch = mockFetch({ terminals: [good1, good2, tampered, foreign, spoof] }) as unknown as typeof fetch;
    const res = await fetchCompanyTerminals(companyAddr);
    expect(res.map((c) => c.terminalPub).sort()).toEqual(['aa'.repeat(32), 'bb'.repeat(32)]);
  });

  it('returns [] on a relay error and never throws', async () => {
    globalThis.fetch = mockFetch({ error: 'boom' }, false) as unknown as typeof fetch;
    const addr = sdkWallet.addressFromPublicKey(ed25519.getPublicKey(ed25519.utils.randomPrivateKey()));
    expect(await fetchCompanyTerminals(addr)).toEqual([]);
  });

  it('publishTerminalCert posts and reports success', async () => {
    const f = mockFetch({ ok: true });
    globalThis.fetch = f as unknown as typeof fetch;
    expect(await publishTerminalCert(signCert(ed25519.utils.randomPrivateKey()))).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
