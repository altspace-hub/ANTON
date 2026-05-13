/**
 * wallet/ — secp256k1 wallet primitives matching FutureChain core.
 *
 * Status: STUB. Real implementation lands in sprint 1 task 2.
 * Address derivation MUST match wallet.rs in the FutureChain repo
 * byte-for-byte. Until that file is vendored into docs/futurechain/,
 * we can't write a real implementation.
 */
import { NotImplementedError } from '../index.js';

export interface Wallet {
  /** secp256k1 private key, 32 bytes. Should be zeroed after every use. */
  readonly privateKey: Uint8Array;
  /** Compressed public key, 33 bytes. */
  readonly publicKey: Uint8Array;
  /** FutureChain address, fc_... format. */
  readonly address: string;
}

/** Generate a fresh wallet. Uses crypto.getRandomValues() under the hood. */
export function create(): Wallet {
  throw new NotImplementedError('wallet.create()', 'parent-repo: wallet.rs not yet vendored');
}

/** Reconstruct a wallet from a 12 or 24 word BIP-39 mnemonic. */
export function fromMnemonic(_mnemonic: string): Wallet {
  throw new NotImplementedError('wallet.fromMnemonic()', 'parent-repo: wallet.rs not yet vendored');
}

/** Sign a 32-byte hash with the wallet's private key. Zeroes the key
 *  buffer after signing. Returns a 64-byte (r,s) compact signature. */
export function sign(_wallet: Wallet, _messageHash: Uint8Array): Uint8Array {
  throw new NotImplementedError('wallet.sign()');
}

/** Verify a signature against a public key. */
export function verify(_signature: Uint8Array, _messageHash: Uint8Array, _publicKey: Uint8Array): boolean {
  throw new NotImplementedError('wallet.verify()');
}
