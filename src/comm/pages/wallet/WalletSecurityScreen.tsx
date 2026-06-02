/**
 * WalletSecurityScreen — wallet → Security (#79 Phase 3).
 *
 * Two factors that gate sending (on top of biometric):
 *   • Payment PIN — a biometric-less fallback (set / change / remove).
 *   • Wallet passphrase — an opt-in knowledge second factor (add / change /
 *     remove). When set, every send + recovery-phrase reveal asks for it; the
 *     only recovery is the 24-word backup.
 *
 * The passphrase block is ported from Pay's WalletPassphraseScreen.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import PinPromptModal from '../../components/PinPromptModal';
import { requireBiometric } from '../../services/biometric';
import {
  activeWalletHasPassphrase, changePassphraseForActiveWallet,
  enablePassphraseForActiveWallet, removePassphraseFromActiveWallet,
} from '../../services/wallets';
import { BadPassphraseError, NoPassphraseError } from '../../services/wallet-passphrase';
import { hasPaymentPin, setPaymentPin, removePaymentPin } from '../../services/payment-pin';

type Mode = 'add' | 'change' | 'remove' | 'loading';
const MIN_LEN = 12;

export default function WalletSecurityScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [hasIt, setHasIt] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>('loading');
  const [oldP, setOldP] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // PIN block
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinResolver, setPinResolver] = useState<((p: string | null) => void) | null>(null);
  const [pinMsg, setPinMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const has = await activeWalletHasPassphrase();
      setHasIt(has);
      setMode(has ? 'change' : 'add');
      setPinSet(await hasPaymentPin());
    })();
  }, []);

  function clear() { setOldP(''); setP1(''); setP2(''); setErr(null); setDone(null); }

  async function gate(reason: string): Promise<boolean> {
    const r = await requireBiometric({ reason });
    return r.ok || r.reason === 'unavailable';
  }

  // ── PIN ──
  function openPin(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      setPinResolver(() => (val: string | null) => { setPinOpen(false); setPinResolver(null); resolve(val); });
      setPinOpen(true);
    });
  }
  async function handleSetPin() {
    setPinMsg(null);
    const pin = await openPin();
    if (pin == null) return;
    try { await setPaymentPin(pin); setPinSet(true); setPinMsg(t('paymentPin.setOk', 'Payment PIN set.')); }
    catch (e) { setPinMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function handleRemovePin() {
    setPinMsg(null);
    if (!(await gate(t('paymentPin.gateRemove', 'Confirm to remove the payment PIN')))) return;
    await removePaymentPin();
    setPinSet(false);
    setPinMsg(t('paymentPin.removedOk', 'Payment PIN removed.'));
  }

  // ── Passphrase ──
  async function handleAdd() {
    setErr(null); setDone(null);
    if (p1.length < MIN_LEN) { setErr(t('passphrase.tooShort', 'Use at least {{n}} characters.', { n: MIN_LEN })); return; }
    if (p1 !== p2) { setErr(t('passphrase.mismatch', 'The two entries do not match.')); return; }
    setBusy(true);
    try {
      if (!(await gate(t('passphrase.gateAdd', 'Confirm to set a wallet passphrase')))) return;
      await enablePassphraseForActiveWallet(p1);
      setHasIt(true); setMode('change'); clear();
      setDone(t('passphrase.addedOk', 'Passphrase set. Every send + showing your recovery phrase will ask for it.'));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function handleChange() {
    setErr(null); setDone(null);
    if (!oldP) { setErr(t('passphrase.needCurrent', 'Enter your current passphrase.')); return; }
    if (p1.length < MIN_LEN) { setErr(t('passphrase.tooShort', 'Use at least {{n}} characters.', { n: MIN_LEN })); return; }
    if (p1 !== p2) { setErr(t('passphrase.mismatch', 'The two entries do not match.')); return; }
    setBusy(true);
    try {
      if (!(await gate(t('passphrase.gateChange', 'Confirm to change your wallet passphrase')))) return;
      await changePassphraseForActiveWallet(oldP, p1);
      clear(); setDone(t('passphrase.changedOk', 'Passphrase changed.'));
    } catch (e) {
      if (e instanceof BadPassphraseError) setErr(t('passphrase.wrongCurrent', 'Your current passphrase is wrong.'));
      else setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }
  async function handleRemove() {
    setErr(null); setDone(null);
    if (!oldP) { setErr(t('passphrase.needCurrent', 'Enter your current passphrase.')); return; }
    setBusy(true);
    try {
      if (!(await gate(t('passphrase.gateRemove', 'Confirm to remove the wallet passphrase')))) return;
      await removePassphraseFromActiveWallet(oldP);
      setHasIt(false); setMode('add'); clear();
      setDone(t('passphrase.removedOk', 'Passphrase removed. Only biometric protects sending now.'));
    } catch (e) {
      if (e instanceof BadPassphraseError) setErr(t('passphrase.wrongCurrent', 'Your current passphrase is wrong.'));
      else if (e instanceof NoPassphraseError) { setHasIt(false); setMode('add'); }
      else setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  if (hasIt === null || mode === 'loading') {
    return (
      <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
        {t('common.loading', 'Loading…')}
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex items-center gap-2 px-3 pt-4 pb-3">
        <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label={t('common.back', 'Back')}
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-[var(--color-text)]">{t('wallet.security', 'Security')}</h2>
      </div>

      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* ── Payment PIN ── */}
        <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h3 className="font-bold text-[var(--color-text)]">{t('paymentPin.sectionTitle', 'Payment PIN')}</h3>
          <p className="text-xs mt-1 text-[var(--color-text-muted)]">
            {t('paymentPin.sectionHelp', 'A 4–8 digit code that approves payments when no fingerprint is available.')}
          </p>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => void handleSetPin()}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
              {pinSet ? t('paymentPin.change', 'Change PIN') : t('paymentPin.set', 'Set PIN')}
            </button>
            {pinSet ? (
              <button type="button" onClick={() => void handleRemovePin()}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                      style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                {t('paymentPin.removeBtn', 'Remove PIN')}
              </button>
            ) : null}
          </div>
          {pinMsg ? <p className="text-xs mt-2 text-[var(--color-accent)]">{pinMsg}</p> : null}
        </div>

        {/* ── Wallet passphrase ── */}
        <h3 className="font-bold text-[var(--color-text)] mb-1">{t('settings.passphrase', 'Wallet passphrase')}</h3>
        <p className="text-sm mb-4 text-[var(--color-text-muted)]">
          {t('passphrase.intro', 'An optional second factor on top of biometric. When set, every send and every reveal of your 24-word backup will ask for it. Lose it and only your 24-word backup can restore the wallet.')}
        </p>

        {hasIt ? (
          <div className="flex gap-2 mb-4">
            <button type="button" onClick={() => { setMode('change'); clear(); }}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={mode === 'change'
                      ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
                      : { backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}>
              {t('passphrase.change', 'Change')}
            </button>
            <button type="button" onClick={() => { setMode('remove'); clear(); }}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={mode === 'remove'
                      ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
                      : { backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}>
              {t('passphrase.remove', 'Remove')}
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {(mode === 'change' || mode === 'remove') ? (
            <Field label={t('passphrase.current', 'Current passphrase')} value={oldP} onChange={setOldP} disabled={busy} />
          ) : null}
          {(mode === 'add' || mode === 'change') ? (
            <>
              <Field label={t('passphrase.new', 'New passphrase')} value={p1} onChange={setP1} disabled={busy} />
              <Field label={t('passphrase.confirm', 'Confirm new passphrase')} value={p2} onChange={setP2} disabled={busy} />
            </>
          ) : null}
        </div>

        {err ? <p className="text-sm mt-3 text-[var(--color-error)]">{err}</p> : null}
        {done ? <p className="text-sm mt-3 text-[var(--color-accent)]">{done}</p> : null}

        <div className="mt-6">
          {mode === 'add' ? (
            <PrimaryButton onClick={() => void handleAdd()} disabled={busy || !p1 || !p2} marginTopAuto={false}>
              {busy ? t('common.working', 'Working…') : t('passphrase.add', 'Add passphrase')}
            </PrimaryButton>
          ) : null}
          {mode === 'change' ? (
            <PrimaryButton onClick={() => void handleChange()} disabled={busy || !oldP || !p1 || !p2} marginTopAuto={false}>
              {busy ? t('common.working', 'Working…') : t('passphrase.changeBtn', 'Change passphrase')}
            </PrimaryButton>
          ) : null}
          {mode === 'remove' ? (
            <PrimaryButton onClick={() => void handleRemove()} disabled={busy || !oldP} marginTopAuto={false}>
              {busy ? t('common.working', 'Working…') : t('passphrase.removeBtn', 'Remove passphrase')}
            </PrimaryButton>
          ) : null}
        </div>

        <div className="text-xs mt-6 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}>
          {t('passphrase.recoveryHint', 'If you forget the passphrase, the only recovery is to wipe this device and restore from your 24-word backup. A restored wallet starts with no passphrase set.')}
        </div>
      </div>
    </div>
    {pinOpen && pinResolver ? (
      <PinPromptModal mode="create" attemptFailures={0}
        reason={t('paymentPin.createReason', 'Choose a PIN to approve payments on this device — no fingerprint is available here.')}
        onSubmit={(p) => pinResolver(p)} onCancel={() => pinResolver(null)} />
    ) : null}
    </>
  );
}

function Field({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">{label}</span>
      <input type="password" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
             inputMode="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
             className="rounded-lg px-3 py-2.5 text-base"
             style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }} />
    </label>
  );
}
