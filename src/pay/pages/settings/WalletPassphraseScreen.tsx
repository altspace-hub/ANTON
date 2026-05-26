/**
 * WalletPassphraseScreen — Settings → Wallet passphrase.
 *
 * Spec: docs/PAY_WALLET_PASSPHRASE_SPEC.md §3.4.
 *
 * Three flows depending on state:
 *   • passphrase not set    → "Add passphrase" (enter twice + confirm)
 *   • passphrase set        → "Change passphrase" + "Remove passphrase"
 *   • all flows gated by    → biometric (defence-in-depth on the
 *                              passphrase rotation itself)
 *
 * Recovery hint is always shown: forgotten passphrase = wipe + restore
 * from 24-word backup. That's the only recovery path; this screen does
 * not pretend otherwise.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import { requireBiometric } from '../../services/biometric';
import {
  activeWalletHasPassphrase, changePassphraseForActiveWallet,
  enablePassphraseForActiveWallet, removePassphraseFromActiveWallet,
} from '../../services/wallets';
import {
  BadPassphraseError, NoPassphraseError,
} from '../../services/wallet-passphrase';

type Mode = 'add' | 'change' | 'remove' | 'loading';

const MIN_LEN = 12;

export default function WalletPassphraseScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [hasIt, setHasIt] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>('loading');
  const [oldP, setOldP] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const has = await activeWalletHasPassphrase();
      setHasIt(has);
      setMode(has ? 'change' : 'add');
    })();
  }, []);

  function clear() {
    setOldP(''); setP1(''); setP2(''); setErr(null); setDone(null);
  }

  async function gate(reason: string): Promise<boolean> {
    const r = await requireBiometric({ reason });
    return r.ok || r.reason === 'unavailable';
  }

  async function handleAdd() {
    setErr(null); setDone(null);
    if (p1.length < MIN_LEN) {
      setErr(t('passphrase.tooShort',
        'Use at least {{n}} characters.', { n: MIN_LEN }));
      return;
    }
    if (p1 !== p2) {
      setErr(t('passphrase.mismatch', 'The two entries do not match.'));
      return;
    }
    setBusy(true);
    try {
      if (!(await gate(t('passphrase.gateAdd',
            'Confirm to set a wallet passphrase')))) {
        return;
      }
      await enablePassphraseForActiveWallet(p1);
      setHasIt(true);
      setMode('change');
      clear();
      setDone(t('passphrase.addedOk', 'Passphrase set. ' +
        'Every send + showing your recovery phrase will ask for it.'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleChange() {
    setErr(null); setDone(null);
    if (!oldP) {
      setErr(t('passphrase.needCurrent', 'Enter your current passphrase.'));
      return;
    }
    if (p1.length < MIN_LEN) {
      setErr(t('passphrase.tooShort',
        'Use at least {{n}} characters.', { n: MIN_LEN }));
      return;
    }
    if (p1 !== p2) {
      setErr(t('passphrase.mismatch', 'The two entries do not match.'));
      return;
    }
    setBusy(true);
    try {
      if (!(await gate(t('passphrase.gateChange',
            'Confirm to change your wallet passphrase')))) {
        return;
      }
      await changePassphraseForActiveWallet(oldP, p1);
      clear();
      setDone(t('passphrase.changedOk', 'Passphrase changed.'));
    } catch (e) {
      if (e instanceof BadPassphraseError) {
        setErr(t('passphrase.wrongCurrent',
          'Your current passphrase is wrong.'));
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setErr(null); setDone(null);
    if (!oldP) {
      setErr(t('passphrase.needCurrent', 'Enter your current passphrase.'));
      return;
    }
    setBusy(true);
    try {
      if (!(await gate(t('passphrase.gateRemove',
            'Confirm to remove the wallet passphrase')))) {
        return;
      }
      await removePassphraseFromActiveWallet(oldP);
      setHasIt(false);
      setMode('add');
      clear();
      setDone(t('passphrase.removedOk',
        'Passphrase removed. Only biometric protects sending now.'));
    } catch (e) {
      if (e instanceof BadPassphraseError) {
        setErr(t('passphrase.wrongCurrent',
          'Your current passphrase is wrong.'));
      } else if (e instanceof NoPassphraseError) {
        setHasIt(false);
        setMode('add');
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  if (hasIt === null || mode === 'loading') {
    return (
      <div className="flex items-center justify-center h-full"
           style={{ backgroundColor: 'var(--color-bg)',
                    color: 'var(--color-text-muted)' }}>
        {t('common.loading', 'Loading…')}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back', 'Back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('settings.passphrase', 'Wallet passphrase')}
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t('passphrase.intro',
            'An optional second factor on top of biometric. When set, ' +
            'every send and every reveal of your 24-word backup will ' +
            'ask for it. Lose it and only your 24-word backup can ' +
            'restore the wallet.')}
        </p>

        {/* Toggle add ↔ change ↔ remove tabs (only when one is set) */}
        {hasIt ? (
          <div className="flex gap-2 mb-4">
            <button type="button" onClick={() => { setMode('change'); clear(); }}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={mode === 'change'
                      ? { backgroundColor: 'var(--color-accent)',
                          color: 'var(--color-accent-fg)' }
                      : { backgroundColor: 'var(--color-surface-muted)',
                          color: 'var(--color-text-muted)' }}>
              {t('passphrase.change', 'Change')}
            </button>
            <button type="button" onClick={() => { setMode('remove'); clear(); }}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={mode === 'remove'
                      ? { backgroundColor: 'var(--color-accent)',
                          color: 'var(--color-accent-fg)' }
                      : { backgroundColor: 'var(--color-surface-muted)',
                          color: 'var(--color-text-muted)' }}>
              {t('passphrase.remove', 'Remove')}
            </button>
          </div>
        ) : null}

        {/* Fields */}
        <div className="flex flex-col gap-3">
          {(mode === 'change' || mode === 'remove') ? (
            <Field
              label={t('passphrase.current', 'Current passphrase')}
              value={oldP}
              onChange={setOldP}
              disabled={busy}
            />
          ) : null}
          {(mode === 'add' || mode === 'change') ? (
            <>
              <Field
                label={mode === 'add'
                  ? t('passphrase.new', 'New passphrase')
                  : t('passphrase.newReplacement', 'New passphrase')}
                value={p1}
                onChange={setP1}
                disabled={busy}
              />
              <Field
                label={t('passphrase.confirm', 'Confirm new passphrase')}
                value={p2}
                onChange={setP2}
                disabled={busy}
              />
            </>
          ) : null}
        </div>

        {err ? (
          <p className="text-sm mt-3" style={{ color: 'var(--color-error)' }}>
            {err}
          </p>
        ) : null}
        {done ? (
          <p className="text-sm mt-3" style={{ color: 'var(--color-accent)' }}>
            {done}
          </p>
        ) : null}

        <div className="mt-6">
          {mode === 'add' ? (
            <PrimaryButton onClick={() => void handleAdd()}
                           disabled={busy || !p1 || !p2}
                           marginTopAuto={false}>
              {busy
                ? t('common.working', 'Working…')
                : t('passphrase.add', 'Add passphrase')}
            </PrimaryButton>
          ) : null}
          {mode === 'change' ? (
            <PrimaryButton onClick={() => void handleChange()}
                           disabled={busy || !oldP || !p1 || !p2}
                           marginTopAuto={false}>
              {busy
                ? t('common.working', 'Working…')
                : t('passphrase.changeBtn', 'Change passphrase')}
            </PrimaryButton>
          ) : null}
          {mode === 'remove' ? (
            <PrimaryButton onClick={() => void handleRemove()}
                           disabled={busy || !oldP}
                           marginTopAuto={false}>
              {busy
                ? t('common.working', 'Working…')
                : t('passphrase.removeBtn', 'Remove passphrase')}
            </PrimaryButton>
          ) : null}
        </div>

        <div className="text-xs mt-6 p-3 rounded-lg"
             style={{ backgroundColor: 'var(--color-surface-muted)',
                      color: 'var(--color-text-muted)' }}>
          {t('passphrase.recoveryHint',
            'If you forget the passphrase, the only recovery is to ' +
            'wipe this device and restore from your 24-word backup. ' +
            'A restored wallet starts with no passphrase set.')}
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider"
            style={{ color: 'var(--color-text-faint)' }}>
        {label}
      </span>
      <input
        type="password"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg px-3 py-2.5 text-base"
        style={{
          backgroundColor: 'var(--color-surface-muted)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
        }}
      />
    </label>
  );
}
