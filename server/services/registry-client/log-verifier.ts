/**
 * log-verifier.ts — RFC 6962 Merkle tree verification + STH signature check.
 *
 * Three primitives per Registry Protocol §7:
 *   1. verifyStsSignature — verify a Signed Tree Head was signed by the
 *      operator's identity key (from trust store).
 *   2. verifyInclusion — verify a leaf is included in the tree at a given size,
 *      given its audit path.
 *   3. verifyConsistency — verify that tree at size B is an append-only
 *      extension of tree at size A.
 *
 * Hashing per RFC 6962:
 *   leaf:     SHA-256(0x00 || leaf_bytes)
 *   internal: SHA-256(0x01 || left || right)
 *
 * Domain separators (0x00 / 0x01) prevent second-preimage attacks where a
 * leaf could be presented as an internal node.
 */

import { createHash } from 'crypto';

import { canonicalize, canonicalizeBytes } from '../registry-protocol/canonical-json.js';
import { verifyCanonical } from '../../lib/portal-crypto.js';
import type { ConsistencyProof, InclusionProof, SignedSthEnvelope } from './types.js';
import type { TrustStore } from './trust-store.js';

// ── Hashing ─────────────────────────────────────────────────────────────────

const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);

function sha256(...parts: Buffer[]): Buffer {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  // The generic-narrowing change in recent @types/node makes digest() return
  // Buffer<ArrayBufferLike> while Buffer.from(...) returns Buffer<ArrayBuffer>;
  // the two are not assignment-compatible. Cast at the crypto boundary so the
  // rest of the file can stay simply-typed `Buffer`.
  return h.digest() as Buffer;
}

/** Compute the leaf hash of a log entry per RFC 6962. */
export function leafHash(canonicalLogEntryBytes: Uint8Array): string {
  return sha256(LEAF_PREFIX, Buffer.from(canonicalLogEntryBytes)).toString('hex');
}

/** Compute the leaf hash from the log entry object (canonicalises first). */
export function leafHashFromEntry(logEntry: unknown): string {
  return leafHash(canonicalizeBytes(logEntry));
}

function nodeHash(left: Buffer, right: Buffer): Buffer {
  return sha256(NODE_PREFIX, left, right);
}

// ── STH signature verification ─────────────────────────────────────────────

export function verifyStsSignature(envelope: SignedSthEnvelope, trustStore: TrustStore): boolean {
  const op = trustStore.forOperatorId(envelope.sth.registryOperator);
  if (!op) return false;
  if (op.publicKeyHex.startsWith('__PENDING_')) return false; // placeholder key — refuse
  return verifyCanonical(envelope.sth, envelope.signature, op.publicKeyHex);
}

// ── Inclusion proof verification (RFC 6962 §2.1.1) ─────────────────────────

/**
 * Verify that `leafHashHex` at index `leafIndex` (0-based) is a member of the
 * tree of size `treeSize` whose root is `expectedRootHex`.
 *
 * Algorithm: walk up the tree, combining the current hash with each audit-path
 * step, choosing left/right based on the leaf's position bits.
 */
export function verifyInclusion(
  proof: InclusionProof,
  leafIndex: number,
  expectedRootHex: string,
): boolean {
  if (leafIndex < 0 || leafIndex >= proof.treeSize) return false;
  if (proof.treeSize === 0) return false;

  // RFC 6962 §2.1.1 algorithm — see also CT log monitor reference impls.
  let fn = leafIndex;
  let sn = proof.treeSize - 1;
  // Widen to plain `Buffer` so reassigns from nodeHash() don't fight the
  // Buffer<ArrayBuffer> narrowing that Buffer.from() introduces under the
  // current @types/node generics.
  let r: Buffer = Buffer.from(proof.leafHash, 'hex');

  for (const step of proof.auditPath) {
    if (sn === 0) return false;
    const stepBuf = Buffer.from(step, 'hex');
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(stepBuf, r);
      while (fn % 2 === 0) {
        fn = Math.floor(fn / 2);
        sn = Math.floor(sn / 2);
      }
    } else {
      r = nodeHash(r, stepBuf);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }

  if (sn !== 0) return false;
  return r.toString('hex') === expectedRootHex;
}

// ── Consistency proof verification (RFC 6962 §2.1.2) ───────────────────────

/**
 * Verify that the tree at `secondSize` is a consistent extension of the tree
 * at `firstSize`. Both root hashes are needed (typically obtained from STHs).
 */
export function verifyConsistency(
  proof: ConsistencyProof,
  firstRootHex: string,
  secondRootHex: string,
): boolean {
  const { firstSize, secondSize, proofPath } = proof;
  if (firstSize === 0) return proofPath.length === 0;
  if (firstSize === secondSize) {
    return proofPath.length === 0 && firstRootHex === secondRootHex;
  }
  if (firstSize > secondSize) return false;

  let node = firstSize - 1;
  let lastNode = secondSize - 1;
  while (node % 2 === 1) {
    node = Math.floor(node / 2);
    lastNode = Math.floor(lastNode / 2);
  }

  const path = proofPath.map((h) => Buffer.from(h, 'hex'));
  let pIdx = 0;

  let oldRoot: Buffer;
  let newRoot: Buffer;
  if (node > 0) {
    if (pIdx >= path.length) return false;
    oldRoot = path[pIdx];
    newRoot = path[pIdx];
    pIdx++;
  } else {
    oldRoot = Buffer.from(firstRootHex, 'hex');
    newRoot = Buffer.from(firstRootHex, 'hex');
  }

  while (node > 0) {
    if (pIdx >= path.length) return false;
    const sibling = path[pIdx++];
    if (node % 2 === 1) {
      oldRoot = nodeHash(sibling, oldRoot);
      newRoot = nodeHash(sibling, newRoot);
    } else if (node < lastNode) {
      newRoot = nodeHash(newRoot, sibling);
    }
    node = Math.floor(node / 2);
    lastNode = Math.floor(lastNode / 2);
  }

  while (lastNode > 0) {
    if (pIdx >= path.length) return false;
    newRoot = nodeHash(newRoot, path[pIdx++]);
    lastNode = Math.floor(lastNode / 2);
  }

  if (pIdx !== path.length) return false;
  return (
    oldRoot.toString('hex') === firstRootHex &&
    newRoot.toString('hex') === secondRootHex
  );
}

// ── Convenience: build a tiny in-memory tree for testing ───────────────────

/**
 * Compute the Merkle root of `leafHashes` (each as hex). Used by the smoke
 * test to construct synthetic proofs for the verifier.
 */
export function computeRoot(leafHashesHex: string[]): string {
  if (leafHashesHex.length === 0) {
    return sha256(Buffer.alloc(0)).toString('hex');
  }
  // Plain `Buffer[]` annotations here — see comment in verifyInclusion about
  // why we deliberately widen away from Buffer.from's ArrayBuffer narrowing.
  let level: Buffer[] = leafHashesHex.map((h) => Buffer.from(h, 'hex'));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(nodeHash(level[i], level[i + 1]));
      } else {
        // Odd leftover: per RFC 6962, do NOT duplicate; promote unchanged.
        next.push(level[i]);
      }
    }
    level = next;
  }
  return level[0].toString('hex');
}

/** Build an inclusion-proof audit path for `leafIndex` against `leafHashes`. */
export function buildAuditPath(leafHashesHex: string[], leafIndex: number): string[] {
  const path: string[] = [];
  let level: Buffer[] = leafHashesHex.map((h) => Buffer.from(h, 'hex'));
  let idx = leafIndex;
  while (level.length > 1) {
    const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (sibling < level.length) path.push(level[sibling].toString('hex'));
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(nodeHash(level[i], level[i + 1]));
      } else {
        next.push(level[i]);
      }
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return path;
}

/** SHA-256 hex over canonical JSON of any value. Used for descriptor hashes. */
export function sha256OfCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}
