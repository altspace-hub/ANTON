/**
 * WelcomePage — First-time setup.
 * Centered, max-width container, ANTON premium design.
 */

import { useState, useEffect } from 'react';
import { generateKeypair, saveIdentity, getIdentity } from '../services/identity';
import { register, registerSimple, getLanguages, saveSessionToken } from '../services/api';

interface Props { onComplete: () => void; }

const hasCryptoSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

export default function WelcomePage({ onComplete }: Props) {
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en');
  const [languages, setLanguages] = useState<Record<string, string>>({ en: 'English' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        } catch {}
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
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 bg-adv-dark safe-top safe-bottom">
      <div className="w-full max-w-sm space-y-10">
        {/* Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-adv-teal/20 to-adv-teal/5 border border-adv-teal/20 shadow-lg shadow-adv-teal/5">
            <span className="text-4xl font-black text-adv-teal">A</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-adv-off-white">ANTON</h1>
          <p className="mt-1 text-sm font-medium text-adv-teal">Companion</p>
          <p className="mt-3 text-sm text-adv-gray">Connect to your organisation's AI assistant</p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-adv-gray">Your Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
              className="w-full rounded-lg border border-border bg-adv-card px-4 py-3.5 text-sm text-adv-off-white placeholder-adv-gray/50 transition-colors focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal/30"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-adv-gray">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-card px-4 py-3.5 text-sm text-adv-off-white transition-colors focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal/30"
            >
              {Object.entries(languages).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          {error && (
            <div className="rounded-lg border border-adv-red/30 bg-adv-red/5 px-4 py-2.5 text-xs text-adv-red">{error}</div>
          )}
          <button
            onClick={handleStart}
            disabled={loading || !name.trim()}
            className="w-full rounded-lg bg-adv-teal py-3.5 text-sm font-semibold text-adv-dark transition-all hover:bg-adv-teal-dark active:scale-[0.98] disabled:opacity-40"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-adv-dark border-t-transparent" />
                Setting up...
              </span>
            ) : 'Get Started'}
          </button>
        </div>

        <p className="text-center text-[11px] text-adv-gray/50 leading-relaxed">
          Your identity is generated locally on this device.<br />No account or email required.
        </p>
      </div>
    </div>
  );
}
