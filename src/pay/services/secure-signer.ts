/**
 * secure-signer.ts — JS-side wrapper around the FcSecureSigner native
 * Capacitor plugin.
 *
 * Wave 7 goal: priv key never crosses into the JS heap. Every method
 * here either accepts non-secret arguments (digestHex) and returns a
 * non-secret result (signature), or handles the priv hex in
 * `wrap`/`unwrap` paths that are reserved for migration / backup.
 *
 * The plugin is registered in each MainActivity:
 *   registerPlugin(FcSecureSignerPlugin.class)
 *
 * On non-native platforms (the dev-mode browser preview, vitest) the
 * plugin is unavailable; calls throw a recognisable error so the
 * caller can fall back to the legacy "priv-in-JS" path. The fall-
 * back is acceptable because non-native is dev-only.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface FcSecureSignerPlugin {
  wrap(opts: { alias: string; privHex: string }): Promise<{ ok: boolean }>;
  sign(opts: { alias: string; digestHex: string }): Promise<{ signature: string }>;
  has(opts: { alias: string }): Promise<{ exists: boolean }>;
  clear(opts: { alias: string }): Promise<{ ok: boolean }>;
  unwrap(opts: { alias: string }): Promise<{ privHex: string }>;
}

const Native = registerPlugin<FcSecureSignerPlugin>('FcSecureSigner');

export class SecureSignerUnavailableError extends Error {
  constructor(message = 'FcSecureSigner plugin is not available on this platform.') {
    super(message);
    this.name = 'SecureSignerUnavailableError';
  }
}

export function isSecureSignerAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const byte of b) s += byte.toString(16).padStart(2, '0');
  return s;
}

/**
 * Wrap a 32-byte priv (hex) under the given alias. After this, the
 * priv hex MUST be deleted from any other JS-accessible store; the
 * canonical storage is now the native plugin's Keystore-bound copy.
 *
 * Throws on a non-native platform — the caller is expected to check
 * isSecureSignerAvailable() first and degrade gracefully (dev only).
 */
export async function wrapPriv(alias: string, privHex: string): Promise<void> {
  if (!isSecureSignerAvailable()) throw new SecureSignerUnavailableError();
  await Native.wrap({ alias, privHex });
}

/**
 * Sign a 32-byte digest with the priv at `alias`. Returns the 64-
 * byte Ed25519 signature as bytes. The priv never enters the JS
 * heap.
 *
 * The digest must be the exact 32-byte value the SDK's
 * signingMessageV2Hash produces — i2p eddsa expects a pre-hashed
 * input via the EdDSAEngine.update path.
 */
export async function signWithAlias(
  alias: string,
  digest: Uint8Array,
): Promise<Uint8Array> {
  if (!isSecureSignerAvailable()) throw new SecureSignerUnavailableError();
  if (digest.length !== 32) {
    throw new Error(`signWithAlias: digest must be 32 bytes (got ${digest.length})`);
  }
  const res = await Native.sign({ alias, digestHex: bytesToHex(digest) });
  const sig = hexToBytes(res.signature);
  if (sig.length !== 64) {
    throw new Error(`signWithAlias: plugin returned ${sig.length}-byte signature, expected 64`);
  }
  return sig;
}

export async function hasAlias(alias: string): Promise<boolean> {
  if (!isSecureSignerAvailable()) return false;
  return (await Native.has({ alias })).exists;
}

export async function clearAlias(alias: string): Promise<void> {
  if (!isSecureSignerAvailable()) return;
  await Native.clear({ alias });
}

/**
 * Extract the wrapped priv as hex. Used ONLY for backup-export and
 * the wallet-reset path; signing should always go through
 * signWithAlias so the priv never reaches JS. Throws on non-native.
 */
export async function unwrapPriv(alias: string): Promise<string> {
  if (!isSecureSignerAvailable()) throw new SecureSignerUnavailableError();
  return (await Native.unwrap({ alias })).privHex;
}
