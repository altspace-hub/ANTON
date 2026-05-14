/**
 * GenerateScreen — onboarding step 2 (wallet keypair creation).
 *
 * Same flow as the original Expo generate.tsx: detects an existing
 * wallet on mount, otherwise lets the merchant create one. The
 * private key is stored via secure-store (Android Keystore on
 * native; AES-GCM-wrapped IDB on web fallback).
 */
import { useEffect, useState } from 'react';
import PrimaryButton from '../../components/PrimaryButton';
import { createAndStoreWallet, hasWallet, loadWallet } from '../../services/wallet';

type State = 'idle' | 'creating' | 'done' | 'existing' | 'error';

export default function GenerateScreen({ onContinue }: { onContinue: () => void }) {
  const [state, setState] = useState<State>('idle');
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (await hasWallet()) {
        const w = await loadWallet();
        if (w) {
          setAddress(w.address);
          setState('existing');
        }
      }
    })();
  }, []);

  async function generate() {
    setState('creating');
    setError(null);
    try {
      const w = await createAndStoreWallet();
      setAddress(w.address);
      setState('done');
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  }

  return (
    <div className="flex flex-col h-full p-6 safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--color-text)' }}>Wallet</h2>

      {state === 'idle' && (
        <>
          <p className="text-[15px] leading-snug mb-5" style={{ color: 'var(--color-text-muted)' }}>
            We&apos;ll generate a secp256k1 keypair on this device. The
            private key never leaves your phone — it&apos;s stored in the
            device&apos;s secure keychain (iOS Keychain / Android Keystore).
          </p>
          <PrimaryButton onClick={generate}>Generate wallet</PrimaryButton>
        </>
      )}

      {state === 'creating' && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Spinner />
          <p className="text-[15px]" style={{ color: 'var(--color-text-muted)' }}>Generating…</p>
        </div>
      )}

      {(state === 'done' || state === 'existing') && address && (
        <>
          {state === 'existing' && (
            <p className="text-sm mb-4" style={{ color: 'var(--color-warning)' }}>
              A wallet already exists on this device.
            </p>
          )}
          <div className="uppercase tracking-wider text-xs mb-1.5"
               style={{ color: 'var(--color-text-faint)' }}>
            Your merchant address
          </div>
          <div className="p-4 rounded-lg mb-4 mono text-sm leading-snug break-all"
               style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-accent)' }}>
            {address}
          </div>
          <p className="text-[15px] leading-snug mb-5" style={{ color: 'var(--color-text-muted)' }}>
            This is what customers scan to pay you. It&apos;s public —
            you can share it freely.
          </p>
          <PrimaryButton onClick={onContinue}>Continue</PrimaryButton>
        </>
      )}

      {state === 'error' && (
        <>
          <p className="text-[15px] mb-4" style={{ color: 'var(--color-error)' }}>
            {error ?? 'Unknown error'}
          </p>
          <PrimaryButton onClick={() => setState('idle')}>Try again</PrimaryButton>
        </>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="w-10 h-10 rounded-full animate-spin"
      style={{
        border: '3px solid var(--color-surface)',
        borderTopColor: 'var(--color-accent)',
      }}
    />
  );
}
