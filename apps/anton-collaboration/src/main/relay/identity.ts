/**
 * relay/identity.ts — the agent's relay identity: its contact hash (the address
 * the phone pairs with) + its X25519 channel keypair, both derived from the
 * SAME Ed25519 agreement identity the standalone already persists. One key, one
 * identity — the agent's agreement-signing key IS its relay address.
 *
 * deriveContactHash matches src/comm/services/identity.ts byte-for-byte, so the
 * ANTON-XXXX-XXXX-XXXX-XXXX an agent prints is a normal ANTON contact hash.
 */
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes } from '@noble/hashes/utils';
import type { StorageBackend } from '../storage.js';
import { xKeypairFromEdPriv, type X25519Keypair } from './crypto.js';

const AGREEMENT_KEY = 'identity.agreement.v1';
const UNAMBIGUOUS_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** ANTON-XXXX-XXXX-XXXX-XXXX from a raw 32-byte Ed25519 pubkey (hex). */
export function deriveContactHash(publicKeyHex: string): string {
  const hash = sha256(hexToBytes(publicKeyHex));
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let seg = '';
    for (let c = 0; c < 4; c++) seg += UNAMBIGUOUS_CHARSET[hash[s * 4 + c] % UNAMBIGUOUS_CHARSET.length];
    segments.push(seg);
  }
  return `ANTON-${segments.join('-')}`;
}

export function isValidContactHash(s: string): boolean {
  return /^ANTON-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(s);
}

export interface RelayIdentity {
  /** Raw 32-byte Ed25519 pubkey (hex) — the channel's verify key. */
  edPubHex: string;
  /** ANTON-XXXX-XXXX-XXXX-XXXX — the agent's relay address. */
  contactHash: string;
  /** X25519 channel keypair (derived from the Ed25519 key). */
  x: X25519Keypair;
}

export function relayIdentityFrom(edPrivHex: string, edPubHex: string): RelayIdentity {
  return {
    edPubHex,
    contactHash: deriveContactHash(edPubHex),
    x: xKeypairFromEdPriv(edPrivHex, edPubHex),
  };
}

/** Load the relay identity from the persisted agreement key. AgreementIdentity
 *  must have created it first (it does on .pubkey() at boot). */
export async function loadRelayIdentity(storage: StorageBackend): Promise<RelayIdentity> {
  const raw = await storage.get(AGREEMENT_KEY);
  if (!raw) throw new Error('agreement identity not initialised — call AgreementIdentity.pubkey() first');
  const parsed = JSON.parse(raw) as { privHex: string; pubHex: string };
  if (!parsed.privHex || !parsed.pubHex) throw new Error('agreement identity malformed');
  return relayIdentityFrom(parsed.privHex, parsed.pubHex);
}
