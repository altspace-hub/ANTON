/**
 * terminal-cert.ts — per-business terminal authorization certificates.
 *
 * Each business is its OWN certificate authority. The company money
 * wallet (the keyed wallet whose private key the owner holds) signs a
 * tiny certificate that authorizes a terminal's PUBLIC signing key:
 *
 *     cert = { companyPub, companyAddr, terminalPub, label, issuedAt, sig }
 *     sig  = Ed25519_sign(companyPriv, sha256("anton-terminal-cert|v1|"+canonJSON))
 *
 * The terminal (a watch-only POS phone) never sees the company private
 * key — the OWNER's device does the signing, once, at setup. The cert is
 * handed back to the terminal over QR. From then on the terminal's Z-reports
 * are signed by its own per-terminal key (see getTerminalSigner) and carry
 * this cert, so an auditor can prove each daily close came from a terminal
 * THIS company authorized — without any central registry or server.
 *
 * Hand-off (QR, no infrastructure):
 *   1. terminal shows  `anton-terminal:req:<terminalPub>`   (its public key)
 *   2. owner scans it, labels it, signs -> shows `anton-terminal:cert:<b64url(JSON)>`
 *   3. terminal scans the cert and stores it.
 */
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { wallet as sdkWallet } from '@futurechain/sdk';
import { getActiveSigner, getTerminalSigner } from './wallets';
import { getSecure, removeSecure, setSecure } from './secure-store';
import { requireBiometric } from './biometric';

const CERT_KEY = 'fc.terminal.cert';
const REQ_PREFIX  = 'anton-terminal:req:';
const CERT_PREFIX = 'anton-terminal:cert:';

export interface TerminalCert {
  v: 1;
  /** Hex Ed25519 public key of the company money wallet (the CA root). */
  companyPub: string;
  /** The company's fc_ receiving address (display + cross-check). */
  companyAddr: string;
  /** Hex Ed25519 public key of the terminal this cert authorizes. */
  terminalPub: string;
  /** Human label for the till, e.g. "Till 3 — main bar". */
  label: string;
  /** Epoch ms the owner issued the cert. */
  issuedAt: number;
  /** Hex Ed25519 signature by the company key over the canonical form. */
  sig: string;
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Deterministic digest over the cert's fields (sans signature). Sorted
 *  keys + JSON keeps it delimiter-safe (labels may contain anything).
 *  Exported for the signing test. */
export function certDigest(c: Omit<TerminalCert, 'sig'>): Uint8Array {
  const obj: Record<string, unknown> = { ...c };
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  return sha256(new TextEncoder().encode('anton-terminal-cert|v1|' + JSON.stringify(sorted)));
}

/** This device's terminal public key (hex). Shown as the request QR. */
export async function getTerminalPubHex(): Promise<string> {
  const signer = await getTerminalSigner();
  return bytesToHex(signer.publicKey);
}

/**
 * OWNER side: sign a cert authorizing `terminalPubHex` with the active
 * KEYED money wallet. Throws if the active wallet is watch-only (no key
 * to sign with) — the owner must be on the company wallet.
 */
export async function issueTerminalCert(terminalPubHex: string, label: string): Promise<TerminalCert> {
  if (!/^[0-9a-fA-F]{64}$/.test(terminalPubHex.trim())) {
    throw new Error('Not a valid terminal key.');
  }
  // Signing a till authorization is a one-time governance action — prompt
  // for biometric when the device has it, but don't BLOCK devices without it
  // (a POS tablet may lack a sensor); only an explicit cancel/fail stops it.
  // Consistent with closeDay's un-gated money-key signing.
  const bio = await requireBiometric({ reason: 'Authorize this terminal for your company' });
  if (!bio.ok && bio.reason !== 'unavailable') {
    throw new Error('Authorization not confirmed.');
  }
  const signer = await getActiveSigner();
  if (!signer) {
    throw new Error('Switch to the company wallet (the one with the key) to authorize a terminal.');
  }
  const unsigned: Omit<TerminalCert, 'sig'> = {
    v: 1,
    companyPub: bytesToHex(signer.publicKey),
    companyAddr: signer.address,
    terminalPub: terminalPubHex.trim().toLowerCase(),
    label: (label.trim() || 'Terminal').slice(0, 40),  // keep the cert QR scannable
    issuedAt: Date.now(),
  };
  const sig = bytesToHex(await signer.sign(certDigest(unsigned)));
  return { ...unsigned, sig };
}

/**
 * Verify a cert's Ed25519 signature against its embedded company key, AND
 * that `companyAddr` is the address that DERIVES from `companyPub` — so the
 * displayed "authorized by <addr>" can never be a free-text spoof (an
 * attacker can only ever name their OWN derived address). Whether that
 * company is YOURS is a separate, caller-side anchor (see storeTerminalCert
 * + verifyZReport's expectedCompanyAddr).
 */
export function verifyTerminalCert(cert: TerminalCert): boolean {
  try {
    if (cert.v !== 1) return false;
    if (!/^[0-9a-f]{64}$/i.test(cert.companyPub)
        || !/^[0-9a-f]{64}$/i.test(cert.terminalPub)
        || !/^[0-9a-f]{128}$/i.test(cert.sig)) return false;
    if (sdkWallet.addressFromPublicKey(hexToBytes(cert.companyPub)) !== cert.companyAddr) return false;
    const { sig, ...unsigned } = cert;
    return ed25519.verify(hexToBytes(sig), certDigest(unsigned), hexToBytes(cert.companyPub));
  } catch {
    return false;
  }
}

/**
 * TERMINAL side: store a received cert. Validates it is for THIS terminal,
 * that its signature + address binding check out, AND — when the device is
 * already configured for a company (a watch-only company address) — that
 * the cert is from THAT company. So a foreign or mismatched cert can't be
 * saved.
 */
export async function storeTerminalCert(cert: TerminalCert, expectedCompanyAddr?: string): Promise<void> {
  const mine = await getTerminalPubHex();
  if (cert.terminalPub.toLowerCase() !== mine.toLowerCase()) {
    throw new Error('That authorization is for a different terminal.');
  }
  if (!verifyTerminalCert(cert)) {
    throw new Error('That authorization signature is invalid.');
  }
  if (expectedCompanyAddr && cert.companyAddr !== expectedCompanyAddr) {
    throw new Error('That authorization is from a different company than this terminal is set up for.');
  }
  await setSecure(CERT_KEY, JSON.stringify(cert));
}

/** The cert stored on this terminal, or null if not yet authorized. */
export async function getStoredTerminalCert(): Promise<TerminalCert | null> {
  const raw = await getSecure(CERT_KEY);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as TerminalCert;
    return verifyTerminalCert(c) ? c : null;
  } catch {
    return null;
  }
}

export async function clearTerminalCert(): Promise<void> {
  await removeSecure(CERT_KEY);
}

// ── QR encode / decode ───────────────────────────────────────────────

export function encodeTerminalRequest(terminalPubHex: string): string {
  return REQ_PREFIX + terminalPubHex.toLowerCase();
}

/** Decode a scanned/pasted terminal request → the terminal pubkey hex. */
export function decodeTerminalRequest(raw: string): string | null {
  const s = raw.trim();
  const body = s.startsWith(REQ_PREFIX) ? s.slice(REQ_PREFIX.length) : s;
  return /^[0-9a-fA-F]{64}$/.test(body) ? body.toLowerCase() : null;
}

export function encodeTerminalCert(cert: TerminalCert): string {
  return CERT_PREFIX + toB64Url(new TextEncoder().encode(JSON.stringify(cert)));
}

/** Decode a scanned/pasted authorization → a TerminalCert (or null). */
export function decodeTerminalCert(raw: string): TerminalCert | null {
  const s = raw.trim();
  try {
    const body = s.startsWith(CERT_PREFIX) ? s.slice(CERT_PREFIX.length) : s;
    const json = body.startsWith('{') ? body : new TextDecoder().decode(fromB64Url(body));
    const c = JSON.parse(json) as TerminalCert;
    if (c.v !== 1 || !c.companyPub || !c.terminalPub || !c.sig) return null;
    return c;
  } catch {
    return null;
  }
}

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
