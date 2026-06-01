/**
 * z-reports.ts — Skatteverket-shaped daily close.
 *
 * SKVFS 2021:17/18 require a kassaregister to produce a Z-rapport
 * summarising sales / voids / refunds / VAT-by-rate for the window
 * since the previous Z. The Z is the BOOKKEEPING VOUCHER for the
 * day's takings — without it, the merchant cannot reconcile to the
 * bokföringskonsult's general ledger.
 *
 * This module:
 *   1. Collects every kvitto + kreditnota whose createdAt falls
 *      in (previousZ.closedAt, now]. The window is open-ended on
 *      the lower bound to catch a first-ever close.
 *   2. Computes the SEK + VAT roll-ups by rate (6/12/25 %).
 *   3. Hashes the canonical JSON of the report (selfHash).
 *   4. Signs selfHash with the merchant's active wallet (Ed25519
 *      via @futurechain/sdk). Tamper-evident chain back to the
 *      previous Z via prevHash.
 *   5. Persists the signed report under its zNumber.
 *
 * The signing key is the same Ed25519 priv used for FC payments,
 * since the merchant's identity is already bound to that wallet.
 * If/when a separate "merchant identity key" is needed, the
 * signing function can swap.
 */
import { wallet as sdkWallet } from '@futurechain/sdk';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { openDb, STORE_Z_REPORTS, INDEX_ZREPORTS_BY_CLOSED } from './db';
import { consumeZNumber, loadConfig } from './merchant';
import { listReceipts } from './receipts';
import { listRefunds } from './refunds';
import { getActiveSigner, getTerminalSigner } from './wallets';
import {
  getStoredTerminalCert, encodeTerminalCert, decodeTerminalCert, verifyTerminalCert,
} from './terminal-cert';
import type { Receipt, RefundReceipt, ZReport } from './types';

// IDB serialisation — bigint → string at the boundary.
interface IdbZReport extends Omit<ZReport, 'ftcReceivedMicro'> {
  ftcReceivedMicro: string;
}
function serialize(z: ZReport): IdbZReport {
  return { ...z, ftcReceivedMicro: z.ftcReceivedMicro.toString() };
}
function hydrate(z: IdbZReport): ZReport {
  return { ...z, ftcReceivedMicro: BigInt(z.ftcReceivedMicro) };
}

function bytesToHex(b: Uint8Array): string {
  let out = '';
  for (const byte of b) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Deterministic JSON over the Z report's fields (excluding the
 *  selfHash + signature themselves). Sorts keys so the hash is
 *  reproducible across JS engines. Exported for the signing test. */
export function canonicalize(z: Omit<ZReport, 'selfHash' | 'signature'>): string {
  const obj: Record<string, unknown> = { ...z };
  // bigint not JSON-serialisable; project to string.
  obj.ftcReceivedMicro = z.ftcReceivedMicro.toString();
  // Sort keys alphabetically.
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

/** Most recent Z. null when the merchant has never closed a day. */
export async function lastZReport(): Promise<ZReport | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_Z_REPORTS, 'readonly');
    const req = tx.objectStore(STORE_Z_REPORTS).index(INDEX_ZREPORTS_BY_CLOSED)
      .openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      resolve(cursor ? hydrate(cursor.value as IdbZReport) : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listZReports(limit = 50): Promise<ZReport[]> {
  const db = await openDb();
  const rows = await new Promise<IdbZReport[]>((resolve, reject) => {
    const tx = db.transaction(STORE_Z_REPORTS, 'readonly');
    const req = tx.objectStore(STORE_Z_REPORTS).index(INDEX_ZREPORTS_BY_CLOSED)
      .openCursor(null, 'prev');
    const out: IdbZReport[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && out.length < limit) { out.push(cursor.value as IdbZReport); cursor.continue(); }
      else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
  return rows.map(hydrate);
}

/**
 * Produce a Z-rapport for the window (lastZ.closedAt, now]. Signs
 * with the active wallet's Ed25519 key. Throws if no wallet
 * configured (the report MUST carry a signature for SKVFS purposes).
 */
export async function closeDay(now = Date.now()): Promise<ZReport> {
  const config = await loadConfig();
  if (!config) throw new Error('closeDay: merchant not configured');
  // Wave 7 — sign via the native plugin path so the priv never
  // enters JS heap. getActiveSigner handles transparent migration
  // from the legacy priv-in-secure-store layout.
  // A keyed money wallet signs with its own key (unchanged). A WATCH-ONLY
  // money wallet (central company address, no priv on this device) has no
  // money signer, so we fall back to this device's per-terminal key. The
  // signer's pubkey is embedded in the report below so it self-verifies
  // regardless of which key signed.
  const moneySigner = await getActiveSigner();
  const signer = moneySigner ?? (await getTerminalSigner());
  const signerPubHex = bytesToHex(signer.publicKey);
  // If the per-terminal key signed, attach this terminal's authorization
  // cert — but ONLY if it still binds to the CURRENT terminal key. A
  // regenerated key (reinstall / Keystore reset) would otherwise embed a
  // stale cert for the OLD key and trip verifyZReport's binding check as a
  // false tamper alarm; in that case fall back to an uncerted (still
  // self-verifiable) close.
  let signerCert: string | undefined;
  if (!moneySigner) {
    const cert = await getStoredTerminalCert();
    if (cert && cert.terminalPub.toLowerCase() === signerPubHex.toLowerCase()) {
      signerCert = encodeTerminalCert(cert);
    }
  }

  const prev = await lastZReport();
  const openedAt = prev ? prev.closedAt : 0;
  const closedAt = now;

  // Pull every receipt + refund in the window. We use a large limit
  // because a busy bar can issue 200+ kvittos in a single evening.
  const [allReceipts, allRefunds] = await Promise.all([
    listReceipts(2000),
    listRefunds(2000),
  ]);
  const receipts = allReceipts.filter(r => r.createdAt > openedAt && r.createdAt <= closedAt);
  const refunds = allRefunds.filter(r => r.createdAt > openedAt && r.createdAt <= closedAt);

  // Roll-ups.
  const live = receipts.filter(r => r.status !== 'voided');
  const voids = receipts.filter(r => r.status === 'voided');

  let salesGrossSek = 0;
  let salesNetSek = 0;
  let vatSek6 = 0;
  let vatSek12 = 0;
  let vatSek25 = 0;
  let ftcReceivedMicro = 0n;
  for (const r of live) {
    salesGrossSek += r.amountSek;
    salesNetSek += r.amountSek - r.vatSek;
    ftcReceivedMicro += r.amountMicroFtc;
    for (const v of r.vatBreakdown) {
      if (v.rate === 6) vatSek6 += v.vatSek;
      else if (v.rate === 12) vatSek12 += v.vatSek;
      else if (v.rate === 25) vatSek25 += v.vatSek;
    }
  }
  const voidsGrossSek = voids.reduce((s, v) => s + v.amountSek, 0);
  const refundsGrossSek = refunds
    .filter(r => r.status !== 'voided')
    .reduce((s, r) => s + r.amountSek, 0);

  const fromKvittoNumber = receipts.length > 0
    ? Math.min(...receipts.map(r => r.kvittoNumber)) : 0;
  const toKvittoNumber = receipts.length > 0
    ? Math.max(...receipts.map(r => r.kvittoNumber)) : 0;
  const fromKreditNumber = refunds.length > 0
    ? Math.min(...refunds.map(r => r.kreditNumber)) : 0;
  const toKreditNumber = refunds.length > 0
    ? Math.max(...refunds.map(r => r.kreditNumber)) : 0;

  const zNumber = await consumeZNumber(config);
  const prevHash = prev?.selfHash ?? null;

  const base: Omit<ZReport, 'selfHash' | 'signature'> = {
    zNumber,
    openedAt,
    closedAt,
    fromKvittoNumber,
    toKvittoNumber,
    fromKreditNumber,
    toKreditNumber,
    salesGrossSek,
    salesNetSek,
    vatSek6,
    vatSek12,
    vatSek25,
    voidsCount: voids.length,
    voidsGrossSek,
    refundsCount: refunds.length,
    refundsGrossSek,
    tipsSek: 0, // hooked to the tip-pool table when that lands
    ftcReceivedMicro,
    prevHash,
    // Embed the signing key so the report is SELF-VERIFYING (keyed money
    // wallet pubkey, or the per-terminal key for a watch-only wallet).
    signerPublicKeyHex: bytesToHex(signer.publicKey),
    // Authorization cert (when terminal-signed + registered) — see above.
    ...(signerCert ? { signerCert } : {}),
  };

  // Hash + sign.
  const canon = canonicalize(base);
  const selfHashBytes = sha256(new TextEncoder().encode(canon));
  const selfHash = bytesToHex(selfHashBytes);
  // Wave 7 — sign in native via signer.sign() rather than directly
  // touching wallet.privateKey. Byte-for-byte identical Ed25519
  // signature; just doesn't transit JS heap.
  const sig = await signer.sign(selfHashBytes);
  const signature = bytesToHex(sig);

  const signed: ZReport = { ...base, selfHash, signature };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_Z_REPORTS, 'readwrite');
    tx.objectStore(STORE_Z_REPORTS).put(serialize(signed));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return signed;
}

/** Verify a Z's self-hash + Ed25519 signature. Prefers the report's
 *  embedded `signerPublicKeyHex` (self-describing — required for
 *  watch-only / per-terminal-signed reports); falls back to a
 *  caller-supplied key for legacy reports without one. Used by the
 *  auditor + by re-import on a new device. */
export function verifyZReport(z: ZReport, publicKeyHex?: string, expectedCompanyAddr?: string): boolean {
  try {
    const { selfHash, signature, ...rest } = z;
    const canon = canonicalize(rest);
    const expectedHash = bytesToHex(sha256(new TextEncoder().encode(canon)));
    if (expectedHash !== selfHash) return false;
    const pubHex = z.signerPublicKeyHex ?? publicKeyHex;
    if (!pubHex) return false;   // no key to verify against
    const sigBytes = new Uint8Array(signature.match(/../g)!.map(b => Number.parseInt(b, 16)));
    const pubBytes = new Uint8Array(pubHex.match(/../g)!.map(b => Number.parseInt(b, 16)));
    const hashBytes = new Uint8Array(selfHash.match(/../g)!.map(b => Number.parseInt(b, 16)));
    if (!ed25519.verify(sigBytes, hashBytes, pubBytes)) return false;
    // If the report carries a terminal authorization cert, it must bind to
    // the signing key and be validly signed by the issuing company key.
    if (z.signerCert) {
      const cert = decodeTerminalCert(z.signerCert);
      if (!cert) return false;
      if (!z.signerPublicKeyHex
          || cert.terminalPub.toLowerCase() !== z.signerPublicKeyHex.toLowerCase()) return false;
      if (!verifyTerminalCert(cert)) return false;
      // Auditor anchor: when the expected company is supplied, the cert must
      // be from THAT company — otherwise a self-signed attacker cert would
      // pass. (verifyTerminalCert already binds companyAddr to companyPub.)
      if (expectedCompanyAddr && cert.companyAddr !== expectedCompanyAddr) return false;
    }
    return true;
  } catch {
    return false;
  }
}
