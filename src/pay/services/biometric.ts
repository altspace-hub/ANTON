/**
 * biometric.ts — Touch ID / Face ID / Fingerprint gate for sensitive ops.
 *
 * The pay app touches three things a stolen-but-unlocked phone should
 * NOT be able to do without a fresh user-presence check:
 *   1. Display the 24-word recovery phrase (Settings → Recovery phrase).
 *   2. Sign + submit a transaction (ReviewScreen → Pay).
 *   3. Wipe / restore the wallet (Settings → Restore wallet).
 *
 * The bare keystore tier (Android Keystore / iOS Keychain) protects
 * the secrets from a powered-off device or another app. This gate adds
 * a per-action confirmation on top — the secret material is still
 * readable by code running in this app, but only after a fresh
 * biometric prompt approved BY THE USER for THIS ACTION.
 *
 * Outside Capacitor (web preview, vitest, dev shell) the gate is a
 * no-op so unit tests + dev UX keep working. The real device prompt
 * appears only when `Capacitor.isNativePlatform()` is true.
 *
 * Why @capgo/capacitor-native-biometric: maintained, supports iOS
 * Touch/Face ID + Android BiometricPrompt, exposes a richer availability
 * model than @capacitor/biometric, ships with the project (see
 * package.json — already a dependency, not added by this change).
 */
import { Capacitor } from '@capacitor/core';

/** Outcome of a `requireBiometric` call. Always a discriminated union —
 *  callers MUST handle the non-`ok` cases to avoid silently signing
 *  after a cancelled prompt. */
export type BiometricResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'failed'; detail?: string };

/** Prompt content shown by the native biometric dialog. The pay app
 *  always provides at least `reason`, which surfaces as the dialog
 *  subtitle on Android and the LAContext localizedReason on iOS. */
export interface BiometricPrompt {
  /** Short user-visible reason for the prompt. Examples:
   *   - "Show recovery phrase"
   *   - "Send 0.10 FTC to fc_VLak…"
   *   - "Restore wallet from recovery phrase" */
  reason: string;
  /** Optional dialog title. Defaults to "FutureChain Pay". */
  title?: string;
}

/** Gate a sensitive operation behind a fresh biometric prompt.
 *
 *  - On a real device (`Capacitor.isNativePlatform()` true): shows the
 *    OS biometric dialog, returns `{ok:true}` on success and a tagged
 *    failure otherwise.
 *  - In web/dev/test (not native): returns `{ok:true, skipped:true}`
 *    without prompting. Allows running e2e smokes, unit tests, and
 *    the in-browser dev preview without touching a real device.
 *
 *  Callers should treat the result as the authorization signal — if
 *  `ok === false`, do not proceed with the sensitive action and surface
 *  the reason to the user. */
export async function requireBiometric(prompt: BiometricPrompt): Promise<BiometricResult> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: true, skipped: true };
  }

  let mod: typeof import('@capgo/capacitor-native-biometric');
  try {
    mod = await import('@capgo/capacitor-native-biometric');
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'unavailable', detail };
  }
  const { NativeBiometric } = mod;

  let status: Awaited<ReturnType<typeof NativeBiometric.isAvailable>>;
  try {
    // Reflects REAL (strong) biometric availability — an enrolled
    // fingerprint/face. We deliberately do NOT pass useFallback here: the
    // @capgo plugin ignores it on Android (it cannot drive a device-credential
    // prompt — see its AuthActivity), so passing it would only make this
    // report "available" on a no-fingerprint phone and then flash-fail in
    // verifyIdentity. Instead, a no-biometric device returns `unavailable`
    // cleanly here, and the caller (executePayment) falls back to the in-app
    // payment PIN. Devices WITH a fingerprint still use it normally.
    status = await NativeBiometric.isAvailable();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'unavailable', detail };
  }
  if (!status.isAvailable) {
    return { ok: false, reason: 'unavailable', detail: `code=${status.errorCode ?? 'unknown'}` };
  }

  try {
    await NativeBiometric.verifyIdentity({
      reason: prompt.reason,
      title: prompt.title ?? 'FutureChain Pay',
      subtitle: prompt.reason,
      description: 'Use your fingerprint or face to confirm',
      useFallback: true,
      maxAttempts: 3,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel|user/i.test(msg)) return { ok: false, reason: 'cancelled', detail: msg };
    return { ok: false, reason: 'failed', detail: msg };
  }
}

/** Convenience: throws an Error tagged with the BiometricResult reason
 *  when the gate is denied. Use in call sites that just want to bail
 *  out — for instance, executePayment's "before signing" check. */
export async function assertBiometric(prompt: BiometricPrompt): Promise<void> {
  const r = await requireBiometric(prompt);
  if (r.ok) return;
  const err = new Error(`biometric ${r.reason}: ${r.detail ?? ''}`.trim());
  (err as Error & { biometric?: BiometricResult }).biometric = r;
  throw err;
}
