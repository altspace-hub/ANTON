/**
 * RpcEndpointScreen — Comm App: switch the FutureChain RPC endpoint.
 *
 * Mirror of src/pay/pages/settings/RpcEndpointScreen.tsx — same UX,
 * same secure-store key (`fc.rpc.endpoint`). Used to point Comm at a
 * local FC node (e.g. http://127.0.0.1:8546 via `adb reverse`).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_ENDPOINT, getEndpoint, setEndpoint } from '../../services/fc-rpc';

interface Props { onBack: () => void; }

export default function RpcEndpointScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<string>(DEFAULT_ENDPOINT);
  const [draft, setDraft] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    void (async () => {
      const url = await getEndpoint();
      setCurrent(url);
      setDraft(url);
    })();
  }, []);

  async function save() {
    setError(null); setBusy(true);
    try {
      await setEndpoint(draft.trim() === DEFAULT_ENDPOINT ? null : draft);
      setCurrent(draft.trim() || DEFAULT_ENDPOINT);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetDefault() {
    setError(null); setBusy(true);
    try {
      await setEndpoint(null);
      setCurrent(DEFAULT_ENDPOINT);
      setDraft(DEFAULT_ENDPOINT);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const dirty = draft.trim() !== current.trim();
  const usingDefault = current === DEFAULT_ENDPOINT;

  return (
    <section className="flex flex-col h-full safe-bottom">
      <div className="flex items-center gap-2 px-3 pt-4 pb-3">
        <button type="button" onClick={onBack} className="p-2 rounded-lg"
                aria-label={t('common.back')}
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          {t('rpc.title', 'RPC endpoint')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <p className="text-sm mb-4 text-[var(--color-text-muted)]">
          {t('rpc.help',
            'Which FutureChain node this app talks to for balance, UTXOs, submitting signed transactions, and inbound polling. Default is the public Bahnhof hub.')}
        </p>

        <div className="rounded-xl p-4 mb-3 bg-[var(--color-surface)] border border-[var(--color-border)]">
          <div className="text-xs uppercase tracking-wider mb-1.5 text-[var(--color-text-faint)]">
            {t('rpc.current', 'Current')}
          </div>
          <div className="font-mono text-sm break-all text-[var(--color-text)]">{current}</div>
          <div className="text-xs mt-2"
               style={{ color: usingDefault ? 'var(--color-text-muted)' : 'var(--color-accent)' }}>
            {usingDefault ? t('rpc.usingDefault', 'Using default')
                          : t('rpc.usingCustom', 'Using custom endpoint')}
          </div>
        </div>

        <div className="rounded-xl p-4 mb-3 bg-[var(--color-surface)] border border-[var(--color-border)]">
          <label htmlFor="rpc-url"
                 className="text-xs uppercase tracking-wider mb-1.5 block text-[var(--color-text-faint)]">
            {t('rpc.url', 'New endpoint URL')}
          </label>
          <input id="rpc-url" type="url" inputMode="url"
                 autoCapitalize="none" autoCorrect="off" spellCheck={false}
                 value={draft} onChange={(e) => setDraft(e.target.value)}
                 placeholder="https://…"
                 className="w-full bg-transparent text-sm font-mono outline-none text-[var(--color-text)]" />
          <p className="text-xs mt-2 text-[var(--color-text-muted)]">
            {t('rpc.urlHint',
              'For a phone-tethered local node, use http://127.0.0.1:8546 with adb reverse.')}
          </p>
        </div>

        {error && <p className="text-xs mb-3" style={{ color: '#C0392B' }}>{error}</p>}
        {savedFlash && <p className="text-xs mb-3 text-[var(--color-accent)]">{t('common.saved', 'Saved')}</p>}

        <div className="flex gap-2 mt-2">
          <button type="button" onClick={resetDefault} disabled={busy || usingDefault}
                  className="flex-1 py-3.5 rounded-xl text-sm font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]"
                  style={{ opacity: (busy || usingDefault) ? 0.6 : 1 }}>
            {t('rpc.resetDefault', 'Reset to default')}
          </button>
          <button type="button" onClick={save} disabled={busy || !dirty}
                  className="flex-1 py-3.5 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                  style={{ opacity: (busy || !dirty) ? 0.6 : 1 }}>
            {busy ? t('common.working', 'Working…') : t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </section>
  );
}
