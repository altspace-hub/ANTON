import { useState } from 'react';
import { createIdentity } from '../services/identity';
import Logo from '../components/Logo';

type Step = 'welcome' | 'name' | 'creating';

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setError('Please enter a name');
      return;
    }
    if (trimmed.length > 64) {
      setError('Name is too long');
      return;
    }
    setError(null);
    setStep('creating');
    try {
      await createIdentity(trimmed, navigator.language?.slice(0, 2) || 'en');
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create identity');
      setStep('name');
    }
  }

  if (step === 'welcome') {
    return (
      <div className="flex flex-col min-h-dvh px-6 py-12 safe-top safe-bottom">
        <div className="flex-1 flex flex-col items-center justify-center">
          <Logo size={80} rounded="lg" className="mb-6" />
          <h1 className="text-3xl font-semibold text-[var(--color-text)] text-center">
            ANTON
          </h1>
          <p className="mt-2 text-base text-[var(--color-text-muted)] text-center">
            Chat, plan and share with the people you trust.
          </p>
          <p className="mt-8 text-sm text-[var(--color-text-faint)] text-center max-w-xs leading-relaxed">
            End-to-end encrypted. No phone number required.
            Your identity stays on this device.
          </p>
        </div>
        <button
          onClick={() => setStep('name')}
          className="w-full py-4 rounded-2xl text-base font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          Get started
        </button>
      </div>
    );
  }

  if (step === 'name' || step === 'creating') {
    return (
      <div className="flex flex-col min-h-dvh px-6 py-12 safe-top safe-bottom">
        <button
          onClick={() => setStep('welcome')}
          className="self-start text-sm text-[var(--color-text-muted)]"
          disabled={step === 'creating'}
        >
          ← Back
        </button>
        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            What should we call you?
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            This is what your friends will see. You can change it later.
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder="Your name"
            autoFocus
            maxLength={64}
            disabled={step === 'creating'}
            className="mt-8 w-full px-4 py-3 rounded-xl border bg-[var(--color-surface)] text-base text-[var(--color-text)] placeholder-[var(--color-text-faint)] focus:outline-none focus:ring-2 transition"
            style={{
              borderColor: error ? 'var(--color-red)' : 'var(--color-border)',
              outlineColor: 'var(--color-accent)',
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
          />
          {error && (
            <p className="mt-2 text-xs text-[var(--color-red)]">{error}</p>
          )}
        </div>
        <button
          onClick={() => void handleCreate()}
          disabled={step === 'creating' || name.trim().length === 0}
          className="w-full py-4 rounded-2xl text-base font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          {step === 'creating' ? 'Creating identity…' : 'Create my identity'}
        </button>
      </div>
    );
  }

  return null;
}
