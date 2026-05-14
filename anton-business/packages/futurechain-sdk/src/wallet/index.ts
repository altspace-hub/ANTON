/**
 * wallet/ — secp256k1 wallet primitives matching FutureChain core.
 *
 * Status: PARTIAL. `addressFromPublicKey()` is a documented PLACEHOLDER
 * — see the inline note. Real implementation must match wallet.rs in
 * the FutureChain Rust repo byte-for-byte, which isn't yet vendored.
 *
 * The rest (key generation, mnemonic, sign/verify) is still stubbed and
 * lands once wallet.rs is available.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { NotImplementedError } from '../index.js';

export interface Wallet {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly address: string;
}

/** Derive a FutureChain address from a secp256k1 public key.
 *
 *  PLACEHOLDER FORMAT: `fc_` + lowercase hex of the last 20 bytes of
 *  Keccak-256 over the uncompressed public key (excluding the 0x04
 *  prefix byte). This matches the Ethereum convention and is the most
 *  likely format given FutureChain's documented choice of secp256k1
 *  keys + Keccak-256 for PACS.008 hashing — but until `wallet.rs` is
 *  vendored into docs/futurechain/ we can't confirm. The function will
 *  be replaced once we have the canonical reference.
 *
 *  Accepts compressed (33 bytes, leading 0x02/0x03) or uncompressed
 *  (65 bytes, leading 0x04) inputs. */
export function addressFromPublicKey(pubkey: Uint8Array): string {
  let xy: Uint8Array;
  if (pubkey.length === 65 && pubkey[0] === 0x04) {
    xy = pubkey.slice(1);
  } else if (pubkey.length === 33 && (pubkey[0] === 0x02 || pubkey[0] === 0x03)) {
    const point = secp256k1.Point.fromHex(pubkey);
    xy = point.toRawBytes(false).slice(1);
  } else {
    throw new Error(`addressFromPublicKey: unexpected key length ${pubkey.length}`);
  }
  const hash = keccak_256(xy);
  const last20 = hash.slice(hash.length - 20);
  let hex = '';
  for (const b of last20) hex += b.toString(16).padStart(2, '0');
  return 'fc_' + hex;
}

/** Generate a fresh wallet. Uses crypto.getRandomValues() under the hood. */
export function create(): Wallet {
  throw new NotImplementedError('wallet.create()', 'parent-repo: wallet.rs not yet vendored');
}

/** Reconstruct a wallet from a 12 or 24 word BIP-39 mnemonic. */
export function fromMnemonic(_mnemonic: string): Wallet {
  throw new NotImplementedError('wallet.fromMnemonic()', 'parent-repo: wallet.rs not yet vendored');
}

/** Sign a 32-byte hash with the wallet's private key. */
export function sign(_wallet: Wallet, _messageHash: Uint8Array): Uint8Array {
  throw new NotImplementedError('wallet.sign()');
}

/** Verify a signature against a public key. */
export function verify(_signature: Uint8Array, _messageHash: Uint8Array, _publicKey: Uint8Array): boolean {
  throw new NotImplementedError('wallet.verify()');
}
