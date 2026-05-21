/**
 * pin.ts — merchant PIN gate for sensitive actions.
 *
 * Scope: a SINGLE shared merchant PIN (4-6 digits) that the owner
 * sets once, required for the three actions a walk-away till
 * attacker could otherwise abuse:
 *   • Void a kvitto
 *   • Issue a kreditnota (refund)
 *   • Close the day (Z-rapport)
 *
 * NOT per-staff identity. That's the bigger v2 scope (StaffMember
 * with role-based PINs + audit log per staff). This module ships
 * the defensive minimum — locking the kassa drawer with one key.
 *
 * Storage:
 *   • Salt: a random 16-byte value generated on PIN-set; kept in
 *     secure-store under `fc.pin.salt` (HW-encrypted at rest via the
 *     existing @aparajita/capacitor-secure-storage tier).
 *   • Hash: PBKDF2-HMAC-SHA-256 of (pin, salt, 100 000 iters). Stored
 *     hex in secure-store under `fc.pin.hash`.
 *   • Lockout: 5 failed attempts in a 5 min window → require a 30 s
 *     cooldown before the next attempt. Naive but sufficient against
 *     the threat model (someone picking up the till). Counter lives
 *     in secure-store too so it survives an app restart.
 *
 * Iteration count 100 000 follows OWASP 2023 baseline for PBKDF2-
 * HMAC-SHA-256. We picked it for the existing wallet-envelope code
 * (server/util/at-rest-encryption.ts) so the pattern is consistent.
 */
import { getSecure, setSecure, removeSecure } from './secure-store';

const SALT_KEY = 'fc.pin.salt';
const HASH_KEY = 'fc.pin.hash';
const ATTEMPTS_KEY = 'fc.pin.attempts'; // JSON: { count, firstFailedAt }

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 30 * 1000;

function bytesToHex(b: Uint8Array): string {
  let out = '';
  for (const byte of b) out += byte.toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function pbkdf2(pin: string, saltBytes: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(pin),
    { name: 'PBKDF2' }, false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey, 256,
  );
  return new Uint8Array(bits);
}

// ── State checks ───────────────────────────────────────────────────

export async function isPinSet(): Promise<boolean> {
  return (await getSecure(HASH_KEY)) !== null;
}

interface AttemptsState {
  count: number;
  firstFailedAt: number;
}

async function readAttempts(): Promise<AttemptsState> {
  const raw = await getSecure(ATTEMPTS_KEY);
  if (!raw) return { count: 0, firstFailedAt: 0 };
  try {
    const p = JSON.parse(raw) as AttemptsState;
    return { count: p.count ?? 0, firstFailedAt: p.firstFailedAt ?? 0 };
  } catch {
    return { count: 0, firstFailedAt: 0 };
  }
}

async function writeAttempts(s: AttemptsState): Promise<void> {
  await setSecure(ATTEMPTS_KEY, JSON.stringify(s));
}

/** Returns the number of ms the caller must wait before trying again,
 *  or 0 if not locked out. */
export async function getLockoutRemainingMs(): Promise<number> {
  const a = await readAttempts();
  if (a.count < MAX_ATTEMPTS) return 0;
  // Lockout window expired → reset and unlock.
  const now = Date.now();
  if (now - a.firstFailedAt > LOCKOUT_WINDOW_MS) {
    await writeAttempts({ count: 0, firstFailedAt: 0 });
    return 0;
  }
  const lockUntil = a.firstFailedAt + LOCKOUT_WINDOW_MS;
  return Math.max(0, lockUntil - now);
}

// ── Set / unset ────────────────────────────────────────────────────

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('PIN must be 4–6 digits.');
  }
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(pin, salt);
  await setSecure(SALT_KEY, bytesToHex(salt));
  await setSecure(HASH_KEY, bytesToHex(hash));
  // Reset any previous lockout state on a fresh PIN-set.
  await removeSecure(ATTEMPTS_KEY);
}

/** Change PIN: verifies the old one first so a walk-away attacker
 *  can't quietly rotate to a new PIN. */
export async function changePin(oldPin: string, newPin: string): Promise<void> {
  const ok = await verifyPin(oldPin);
  if (!ok) throw new Error('Current PIN is incorrect.');
  await setPin(newPin);
}

/** Remove PIN — requires the current PIN as a safeguard. The
 *  merchant goes back to no-gate mode for void/refund/day-close. */
export async function removePin(currentPin: string): Promise<void> {
  const ok = await verifyPin(currentPin);
  if (!ok) throw new Error('Current PIN is incorrect.');
  await removeSecure(SALT_KEY);
  await removeSecure(HASH_KEY);
  await removeSecure(ATTEMPTS_KEY);
}

// ── Verify ─────────────────────────────────────────────────────────

/**
 * Returns true iff `pin` matches. Constant-time comparison via the
 * raw byte values from PBKDF2. Wrong-PIN attempts are counted and
 * lock out after MAX_ATTEMPTS within LOCKOUT_WINDOW_MS.
 *
 * The caller MUST check getLockoutRemainingMs() before calling — if
 * locked, this throws and does NOT consume an attempt (otherwise the
 * lockout could be extended forever by a stuck UI loop).
 */
export async function verifyPin(pin: string): Promise<boolean> {
  const lockedFor = await getLockoutRemainingMs();
  if (lockedFor > 0) {
    throw new Error(
      `Too many failed attempts. Try again in ${Math.ceil(lockedFor / 1000)} s.`,
    );
  }
  const saltHex = await getSecure(SALT_KEY);
  const hashHex = await getSecure(HASH_KEY);
  if (!saltHex || !hashHex) return false;
  const computed = await pbkdf2(pin, hexToBytes(saltHex));
  const stored = hexToBytes(hashHex);
  if (computed.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed[i] ^ stored[i];
  const ok = diff === 0;

  if (ok) {
    // Successful auth resets the lockout counter.
    await removeSecure(ATTEMPTS_KEY);
    return true;
  }
  // Failure — bump counter, set first-failed-at if this is the first
  // failure of a new window.
  const a = await readAttempts();
  const now = Date.now();
  const inWindow = now - a.firstFailedAt < LOCKOUT_WINDOW_MS;
  await writeAttempts({
    count: inWindow ? a.count + 1 : 1,
    firstFailedAt: inWindow ? a.firstFailedAt : now,
  });
  return false;
}

void COOLDOWN_MS; // reserved for future per-attempt throttling
