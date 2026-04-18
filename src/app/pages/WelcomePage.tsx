/**
 * WelcomePage — first-time setup (Evolution design).
 *
 * Light theme, warm linen + accent. Generates the user's local identity
 * (Ed25519 keypair via WebCrypto when available, falls back to a server-
 * issued session token via /register-simple) and saves a display name +
 * preferred language. After this they go to the Join (pair) flow.
 */

import { useState, useEffect } from 'react';
import { generateKeypair, saveIdentity, getIdentity } from '../services/identity';
import { register, registerSimple, getLanguages, saveSessionToken } from '../services/api';
import { Btn, Pill, SectionLabel, Ico } from '../components/ui';

interface Props { onComplete: () => void; }

const hasCryptoSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

export default function WelcomePage({ onComplete }: Props): JSX.Element {
  const [name, setName]             = useState('');
  const [language, setLanguage]     = useState('en');
  const [languages, setLanguages]   = useState<Record<string, string>>({ en: 'English' });
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (getIdentity()) { onComplete(); return; }
    getLanguages().then(setLanguages).catch(() => {});
  }, [onComplete]);

  async function handleStart() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      let registered = false;
      if (hasCryptoSubtle) {
        try {
          const { publicKeyHex, privateKeyHex } = await generateKeypair();
          const result = await register(publicKeyHex, name.trim(), language);
          saveIdentity({ publicKeyHex, privateKeyHex, contactHash: result.contactHash, displayName: name.trim(), preferredLanguage: language });
          registered = true;
        } catch { /* fall through to register-simple */ }
      }
      if (!registered) {
        const result = await registerSimple(name.trim(), language);
        saveSessionToken(result.sessionToken);
        saveIdentity({ publicKeyHex: '', privateKeyHex: '', contactHash: result.contactHash, displayName: name.trim(), preferredLanguage: language });
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="safe-top safe-bottom flex min-h-dvh flex-col items-center justify-center px-6"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="w-full max-w-sm space-y-9">
        {/* Logo + identity */}
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-[var(--radius-r3)]"
            style={{
              background: 'var(--color-accent-soft)',
              border: '1px solid var(--color-accent-dim)',
            }}
          >
            <span
              style={{ color: 'var(--color-accent)', fontSize: 34, fontWeight: 800, letterSpacing: '-0.5px' }}
            >
              A
            </span>
          </div>
          <h1
            className="text-[var(--color-text)]"
            style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px' }}
          >
            ANTON
          </h1>
          <div
            className="mt-1 font-mono uppercase"
            style={{ color: 'var(--color-accent)', fontSize: 11, fontWeight: 700, letterSpacing: '1px' }}
          >
            Companion
          </div>
          <p className="mt-3 max-w-[260px] text-[13px] leading-relaxed text-[var(--color-text-muted)]">
            Connect to your organisation's ANTON instance. Identity stays on this device.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <SectionLabel className="mb-2">Your name</SectionLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
              className="w-full rounded-[var(--radius-r2)] px-4 py-3.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>
          <div>
            <SectionLabel className="mb-2">Language</SectionLabel>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-[var(--radius-r2)] px-4 py-3.5 text-sm text-[var(--color-text)] focus:outline-none"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              {Object.entries(languages).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          {error && (
            <div
              className="rounded-[var(--radius-r2)] px-3 py-2 text-xs"
              style={{
                background: 'var(--color-red-dim)',
                color: 'var(--color-red)',
                border: '1px solid var(--color-red-dim)',
              }}
            >
              {error}
            </div>
          )}

          <Btn
            variant="primary"
            block
            disabled={loading || !name.trim()}
            onClick={() => void handleStart()}
            icon={loading
              ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : undefined}
          >
            {loading ? 'Setting up…' : 'Get started'}
          </Btn>
        </div>

        {/* Trust footer */}
        <div className="flex items-center justify-center gap-2">
          <Ico name="shieldCheck" color="var(--color-text-muted)" size={14} />
          <Pill tone="neutral" mono style={{ fontSize: 10 }}>LOCAL ONLY · NO ACCOUNT</Pill>
        </div>
        <p className="text-center text-[11px] leading-relaxed text-[var(--color-text-faint)]">
          Your keypair is generated on this device. No email or password.
        </p>
      </div>
    </div>
  );
}
