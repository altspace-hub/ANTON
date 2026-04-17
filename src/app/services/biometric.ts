/**
 * biometric.ts — Face ID / Touch ID / Android biometric per spec §5.4 + §8.6.
 *
 * Wraps @capgo/capacitor-native-biometric. Web fallback prompts the user
 * for a confirmation tap (no biometric available, but we still record the
 * intent so the audit trail is consistent with native).
 */

export type BiometricResult = 'confirmed' | 'cancelled' | 'unavailable' | 'failed';

export interface BiometricPromptOptions {
  reason: string;          // user-visible reason ("Approve this checkpoint")
  title?: string;
  subtitle?: string;
  /** Whether to require fresh biometric (defaults true) */
  fresh?: boolean;
}

let availability: 'native' | 'web' | null = null;

async function detect(): Promise<'native' | 'web'> {
  if (availability) return availability;
  try {
    const mod = await import('@capgo/capacitor-native-biometric');
    const status = await mod.NativeBiometric.isAvailable();
    availability = status.isAvailable ? 'native' : 'web';
  } catch {
    availability = 'web';
  }
  return availability;
}

/** Verify the user with biometric (or confirm dialog on web). */
export async function verifyBiometric(opts: BiometricPromptOptions): Promise<BiometricResult> {
  const t = await detect();
  if (t === 'native') {
    try {
      const mod = await import('@capgo/capacitor-native-biometric');
      await mod.NativeBiometric.verifyIdentity({
        reason: opts.reason,
        title: opts.title || 'Confirm with biometric',
        subtitle: opts.subtitle,
        useFallback: true,                  // allow OS passcode as fallback
        maxAttempts: 3,
      });
      return 'confirmed';
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('cancel') || msg.includes('user')) return 'cancelled';
      return 'failed';
    }
  }
  // Web fallback — explicit confirm dialog
  const ok = typeof window !== 'undefined' ? window.confirm(opts.reason + '\n\n(Biometric not available — tap OK to confirm.)') : false;
  return ok ? 'confirmed' : 'cancelled';
}

/** Whether biometric is available (informational, e.g., for settings). */
export async function isBiometricAvailable(): Promise<boolean> {
  return (await detect()) === 'native';
}
