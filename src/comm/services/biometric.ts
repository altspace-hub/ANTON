/**
 * biometric.ts — Touch ID / Face ID / Fingerprint gate for sensitive ops.
 *
 * Ported from src/pay/services/biometric.ts. The Comm app's wallet tab
 * touches the same three sensitive paths as the pay/business apps:
 *   1. Show recovery phrase.
 *   2. Restore wallet from a user-supplied mnemonic.
 *   3. Wipe the wallet.
 *
 * Outside Capacitor (web preview, vitest, dev shell) the gate is a
 * no-op so unit tests + dev UX keep working unchanged.
 */
import { Capacitor } from '@capacitor/core';

export type BiometricResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'failed'; detail?: string };

export interface BiometricPrompt {
  reason: string;
  title?: string;
}

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
    // Reflects REAL (strong) biometric availability only. We do NOT pass
    // useFallback: the @capgo plugin ignores it on Android and cannot drive a
    // device-credential (PIN) prompt, so passing it would only flash-fail in
    // verifyIdentity on a no-fingerprint phone. A no-biometric device returns
    // `unavailable` here and the caller falls back to its own gate.
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
      title: prompt.title ?? 'FutureChain Comm',
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

export async function assertBiometric(prompt: BiometricPrompt): Promise<void> {
  const r = await requireBiometric(prompt);
  if (r.ok) return;
  const err = new Error(`biometric ${r.reason}: ${r.detail ?? ''}`.trim());
  (err as Error & { biometric?: BiometricResult }).biometric = r;
  throw err;
}
