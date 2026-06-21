/**
 * agreement-crypto.ts — Ed25519 sign/verify for the signed-agreement tier,
 * byte-compatible with the Comm/Pay/Business identity scheme (so a signature
 * the standalone buyer produces verifies on the seller's ANTON and vice versa).
 *
 * Scheme — copied from src/comm/services/identity.ts:
 *   - sign  = ed25519 over `new TextEncoder().encode(message)` (UTF-8 bytes)
 *   - verify = ed25519 over the same UTF-8 bytes
 *   - keys + signatures are lower-hex
 *   - the sha512Sync hook is installed so signAsync/verifyAsync work in Node
 *
 * The MESSAGE strings are the domain-tagged binding strings from
 * agreement-core (proposalSigningString / responseSigningString /
 * withdrawSigningString), NOT the bare hash — identical to Comm.
 */
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import {
  computeProposalHash, proposalSigningString, computeResponseDigest, responseSigningString,
  type AgreementProposePayload, type AgreementRespondPayload,
} from './agreement-core.js';

// Install the sha512 hook (same as Comm identity.ts). Lets signAsync/verifyAsync
// run without a WebCrypto subtle dependency.
ed25519.etc.sha512Sync = (...m: Uint8Array[]): Uint8Array => sha512(ed25519.etc.concatBytes(...m));

export interface AgreementKeypair {
  /** 32-byte Ed25519 seed, lower-hex. Treat as secret. */
  privHex: string;
  /** 32-byte Ed25519 public key, lower-hex. The proposerPubkey/acceptorPubkey. */
  pubHex: string;
}

/** Generate a fresh Ed25519 keypair for signing agreements. */
export async function generateAgreementKeypair(): Promise<AgreementKeypair> {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  return { privHex: bytesToHex(priv), pubHex: bytesToHex(pub) };
}

/** Derive the public key from a private seed (hex in, hex out). */
export async function publicKeyOf(privHex: string): Promise<string> {
  return bytesToHex(await ed25519.getPublicKeyAsync(hexToBytes(privHex)));
}

/** Ed25519-sign a message string (UTF-8). Returns the signature hex. */
export async function signMessage(message: string, privHex: string): Promise<string> {
  const sig = await ed25519.signAsync(new TextEncoder().encode(message), hexToBytes(privHex));
  return bytesToHex(sig);
}

/** Verify an Ed25519 signature over a message string. Never throws. */
export async function verifyMessage(message: string, signatureHex: string, publicKeyHex: string): Promise<boolean> {
  try {
    return await ed25519.verifyAsync(
      hexToBytes(signatureHex), new TextEncoder().encode(message), hexToBytes(publicKeyHex),
    );
  } catch {
    return false;
  }
}

// ── Agreement-specific signing helpers ──────────────────────────────────────

/** Sign a proposalHash (the domain-tagged proposal signing string). */
export function signProposal(proposalHash: string, privHex: string): Promise<string> {
  return signMessage(proposalSigningString(proposalHash), privHex);
}

/** Sign a response digest (the domain-tagged response signing string). */
export function signResponse(responseDigest: string, privHex: string): Promise<string> {
  return signMessage(responseSigningString(responseDigest), privHex);
}

/** Recompute + verify a proposal payload's hash binding and proposer signature.
 *  Pure — no I/O. True only if the payload is internally consistent + signed. */
export async function verifyProposalPayload(p: AgreementProposePayload): Promise<boolean> {
  if (!p.proposalHash || !p.proposerPubkey || !p.proposerSig) return false;
  const recomputed = computeProposalHash({
    agreementId: p.agreementId,
    seq: p.seq,
    decision: p.decision,
    terms: p.terms,
    amountMicroFtc: p.amountMicroFtc,
    counterpartyAddress: p.counterpartyAddress,
    createdAt: p.createdAt,
    ...(p.parentProposalHash !== undefined ? { parentProposalHash: p.parentProposalHash } : {}),
    ...(p.sellerRole !== undefined ? { sellerRole: p.sellerRole } : {}),
  });
  if (recomputed !== p.proposalHash) return false;
  return verifyMessage(proposalSigningString(p.proposalHash), p.proposerSig, p.proposerPubkey);
}

/** Verify a respond payload's signature over the canonical response digest
 *  (binds verb + nonce + — for a counter — the counter content to the head). */
export async function verifyResponseSignature(p: AgreementRespondPayload): Promise<boolean> {
  if (!p.responderPubkey || !p.responderSig || !p.nonce) return false;
  const digest = computeResponseDigest({
    agreementId: p.agreementId,
    proposalHash: p.proposalHash,
    verb: p.verb,
    seq: p.seq,
    ...(p.counterDecision !== undefined ? { counterDecision: p.counterDecision } : {}),
    ...(p.counterTerms !== undefined ? { counterTerms: p.counterTerms } : {}),
    ...(p.counterAmountMicroFtc !== undefined ? { counterAmountMicroFtc: p.counterAmountMicroFtc } : {}),
    responderPubkey: p.responderPubkey,
    nonce: p.nonce,
  });
  return verifyMessage(responseSigningString(digest), p.responderSig, p.responderPubkey);
}
