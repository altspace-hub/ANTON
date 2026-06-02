/**
 * payment-pin.ts — in-app numeric PIN that authorizes a payment when no strong
 * biometric is available on the device.
 *
 * The device biometric gate (services/biometric.ts) requires an enrolled
 * fingerprint/face and the @capgo plugin cannot fall back to the OS PIN/pattern
 * on Android. So the send flow uses this app-level PIN as the fallback factor —
 * a user-presence check that works on any device.
 *
 * Security model (mirrors wallet-passphrase.ts at a smaller scale): the PIN is
 * NEVER stored — only a PBKDF2-HMAC-SHA256 hash with a per-PIN random salt. The
 * {salt, hash} envelope goes through secure-store (OS Keystore AES-GCM on a real
 * device). A 4–8 digit PIN is a user-presence gate, not a defence against an
 * attacker who already has the unlocked phone + can read the Keystore.
 *
 * Ported verbatim from src/pay/services/payment-pin.ts (#79 wallet parity).
 */
import { getSecure, removeSecure, setSecure } from './secure-store';

const PIN_KEY = 'fc.payment.pin.v1';
const KDF_ITERATIONS = 210_000; // OWASP 2023 PBKDF2-SHA256 floor
const SALT_BYTES = 16;
const HASH_BITS = 256;

/** Minimum / maximum digits accepted. UI enforces the same. */
export const PIN_MIN_LEN = 4;
export const PIN_MAX_LEN = 8;

interface PinEnvelope {
  v: 1;
  salt: string; // base64
  hash: string; // base64
  iters: number;
}

const enc = new TextEncoder();

function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(pin: string, salt: Uint8Array, iters: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as ArrayBuffer, iterations: iters, hash: 'SHA-256' },
    keyMaterial, HASH_BITS,
  );
  return new Uint8Array(bits);
}

/** Constant-time-ish compare of two base64 strings of equal expected length. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True once a payment PIN has been set on this device. */
export async function hasPaymentPin(): Promise<boolean> {
  try {
    return (await getSecure(PIN_KEY)) != null;
  } catch {
    return false;
  }
}

/** Basic shape check shared by the UI before we bother hashing. */
export function isValidPinShape(pin: string): boolean {
  return /^[0-9]+$/.test(pin) && pin.length >= PIN_MIN_LEN && pin.length <= PIN_MAX_LEN;
}

/** Set (or replace) the payment PIN. Throws on a malformed PIN. */
export async function setPaymentPin(pin: string): Promise<void> {
  if (!isValidPinShape(pin)) {
    throw new Error(`payment PIN must be ${PIN_MIN_LEN}-${PIN_MAX_LEN} digits`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(pin, salt, KDF_ITERATIONS);
  const env: PinEnvelope = {
    v: 1, salt: bytesToB64(salt), hash: bytesToB64(hash), iters: KDF_ITERATIONS,
  };
  await setSecure(PIN_KEY, JSON.stringify(env));
}

/** Verify an entered PIN against the stored hash. False if none set. */
export async function verifyPaymentPin(pin: string): Promise<boolean> {
  let raw: string | null;
  try {
    raw = await getSecure(PIN_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  let env: PinEnvelope;
  try {
    env = JSON.parse(raw) as PinEnvelope;
  } catch {
    return false;
  }
  if (!env || env.v !== 1 || typeof env.salt !== 'string' || typeof env.hash !== 'string') {
    return false;
  }
  const candidate = await derive(pin, b64ToBytes(env.salt), env.iters || KDF_ITERATIONS);
  return timingSafeEqual(bytesToB64(candidate), env.hash);
}

/** Remove the payment PIN (Settings → turn off). */
export async function removePaymentPin(): Promise<void> {
  await removeSecure(PIN_KEY);
}
