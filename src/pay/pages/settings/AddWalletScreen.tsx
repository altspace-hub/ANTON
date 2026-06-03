/**
 * AddWalletScreen — small intermediate landing reached from the
 * Wallets list "+ New wallet" button. The user picks a label, taps
 * Create, and is routed into the existing BackupShow → BackupVerify
 * flow. The new wallet exists in the registry from Create onward but
 * its `backedUp` flag is only flipped after BackupVerify completes,
 * the same as a fresh-install wallet.
 *
 * "Import from phrase" is the sibling path — it doesn't need the
 * backup gate because the user already has the phrase.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createWallet, importWalletFromMnemonic } from '../../services/wallets';

interface Props {
  onBack: () => void;
  onCreated: () => void;
  onImported: () => void;
}

export default function AddWalletScreen({ onBack, onCreated, onImported }: Props) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'create' | 'import' | 'agent'>('create');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doCreate() {
    setError(null); setBusy(true);
    try {
      // #88 — an agent wallet has its own keypair (so it can send) but transacts
      // under the "ANTON <addr6>" identity with the owner as the UBO.
      await createWallet(label || (mode === 'agent' ? 'Agent wallet' : ''), mode === 'agent' ? 'agent' : 'own');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function doImport() {
    setError(null); setBusy(true);
    try {
      const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount !== 24) {
        setError(t('addWallet.need24', 'Recovery phrase must be 24 words.'));
        setBusy(false); return;
      }
      await importWalletFromMnemonic(phrase, label);
      onImported();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('mnemonic')
        ? t('restore.invalidMnemonic', 'That isn\'t a valid BIP-39 phrase.')
        : msg);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('addWallet.title', 'New wallet')}
          </h2>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1.5 mb-4 p-1 rounded-xl"
             style={{ backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)' }}>
          {([
            ['create', t('addWallet.createTab', 'Create')],
            ['import', t('addWallet.importTab', 'Import')],
            ['agent', t('addWallet.agentTab', 'Agent')],
          ] as const).map(([m, lbl]) => (
            <button key={m} type="button" onClick={() => setMode(m)}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={{ backgroundColor: mode === m ? 'var(--color-accent)' : 'transparent',
                             color: mode === m ? 'var(--color-accent-fg)' : 'var(--color-text)' }}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Label */}
        <div className="rounded-xl p-4 mb-3"
             style={{ backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)' }}>
          <label htmlFor="add-label"
                 className="text-xs uppercase tracking-wider mb-1.5 block"
                 style={{ color: 'var(--color-text-faint)' }}>
            {t('addWallet.label', 'Label')}
          </label>
          <input id="add-label" type="text" value={label}
                 onChange={(e) => setLabel(e.target.value)}
                 placeholder={t('addWallet.labelPlaceholder', 'e.g. Savings')}
                 className="w-full bg-transparent text-base font-semibold outline-none"
                 style={{ color: 'var(--color-text)' }} />
        </div>

        {mode === 'import' && (
          <div className="rounded-xl p-4 mb-3"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <label htmlFor="add-phrase"
                   className="text-xs uppercase tracking-wider mb-1.5 block"
                   style={{ color: 'var(--color-text-faint)' }}>
              {t('addWallet.phrase', '24-word recovery phrase')}
            </label>
            <textarea id="add-phrase" value={phrase} rows={4}
                      onChange={(e) => setPhrase(e.target.value)}
                      placeholder="word1 word2 word3 …"
                      className="w-full bg-transparent text-sm outline-none font-mono"
                      style={{ color: 'var(--color-text)' }} />
          </div>
        )}

        {error && (
          <p className="text-xs mb-3" style={{ color: 'var(--color-danger, #C0392B)' }}>
            {error}
          </p>
        )}

        <div className="mt-auto pt-4">
          {mode === 'create' && (
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
              {t('addWallet.createHint',
                'A 24-word recovery phrase will be shown next. Back it up before sending FTC to the new address.')}
            </p>
          )}
          {mode === 'agent' && (
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
              {t('addWallet.agentHint',
                'An agent wallet has its own keypair so an ANTON agent can transact, but it pays under an "ANTON …" identity with you disclosed as the owner (UBO). Use it to keep tabs on what the agent is doing.')}
            </p>
          )}
          <button type="button" disabled={busy}
                  onClick={mode === 'import' ? doImport : doCreate}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-accent)',
                           color: 'var(--color-accent-fg)',
                           opacity: busy ? 0.7 : 1 }}>
            {busy
              ? t('common.working', 'Working…')
              : mode === 'import'
                ? t('addWallet.importBtn', 'Import wallet')
                : mode === 'agent'
                  ? t('addWallet.agentBtn', 'Create agent wallet')
                  : t('addWallet.createBtn', 'Create wallet')}
          </button>
        </div>
      </div>
    </div>
  );
}
