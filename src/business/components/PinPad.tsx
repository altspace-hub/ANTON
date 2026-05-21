/**
 * PinPad — numeric PIN-entry modal.
 *
 * Two modes:
 *   • set    — first-time set (enter PIN twice, must match)
 *   • verify — gate before void / refund / day-close
 *
 * Keeps the entered PIN in component state only; never logs it,
 * never persists outside the verify call. Auto-clears on unmount.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLockoutRemainingMs, setPin, verifyPin } from '../services/pin';

interface BaseProps {
  open: boolean;
  title: string;
  /** Closer — onCancel always fires before unmount so the parent can
   *  null its state. */
  onCancel: () => void;
}

interface VerifyProps extends BaseProps {
  mode: 'verify';
  /** Fires with `true` exactly once on a correct PIN. The caller is
   *  expected to close the modal in its onConfirm callback. */
  onConfirm: () => void | Promise<void>;
}

interface SetProps extends BaseProps {
  mode: 'set';
  onConfirm: () => void | Promise<void>;
}

type Props = VerifyProps | SetProps;

const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export default function PinPad(props: Props) {
  const { t } = useTranslation();
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [stage, setStage] = useState<'first' | 'second'>('first');
  const [error, setError] = useState<string | null>(null);
  const [lockMs, setLockMs] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setFirst(''); setSecond(''); setStage('first');
    setError(null); setBusy(false);
    void getLockoutRemainingMs().then(setLockMs);
  }, [props.open]);

  if (!props.open) return null;

  const current = stage === 'first' ? first : second;
  function press(ch: string) {
    if (busy) return;
    setError(null);
    if (ch === '⌫') {
      stage === 'first' ? setFirst(s => s.slice(0, -1)) : setSecond(s => s.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(ch)) return;
    if (current.length >= 6) return;
    stage === 'first' ? setFirst(s => s + ch) : setSecond(s => s + ch);
  }

  async function submit() {
    if (busy) return;
    if (props.mode === 'set') {
      if (stage === 'first') {
        if (first.length < 4) {
          setError(t('pin.tooShort', 'PIN must be 4–6 digits.'));
          return;
        }
        setStage('second');
        return;
      }
      if (first !== second) {
        setError(t('pin.mismatch', "PINs don't match. Try again."));
        setSecond('');
        setStage('first');
        setFirst('');
        return;
      }
      setBusy(true);
      try {
        await setPin(first);
        await props.onConfirm();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
      }
      return;
    }
    // verify mode
    setBusy(true);
    try {
      const ok = await verifyPin(first);
      if (ok) { await props.onConfirm(); return; }
      setError(t('pin.wrong', 'Wrong PIN.'));
      setFirst('');
      const lockNow = await getLockoutRemainingMs();
      setLockMs(lockNow);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const promptLabel = props.mode === 'set'
    ? (stage === 'first' ? t('pin.choose', 'Choose a PIN (4–6 digits)') : t('pin.confirm', 'Confirm PIN'))
    : t('pin.enter', 'Enter merchant PIN');

  const filled = current.padEnd(6, '·').slice(0, Math.max(4, current.length || 4));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
         style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md rounded-t-2xl p-5 safe-bottom"
           style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
            {props.title}
          </h3>
          <button type="button" onClick={props.onCancel}
                  className="text-sm font-semibold px-2 py-1"
                  style={{ color: 'var(--color-text-muted)' }}>
            {t('common.cancel', 'Cancel')}
          </button>
        </div>

        <p className="text-sm text-center mb-2"
           style={{ color: 'var(--color-text-muted)' }}>
          {promptLabel}
        </p>

        <div className="flex justify-center gap-2 mb-3">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: i < current.length
                            ? 'var(--color-accent)' : 'var(--color-border)' }} />
          ))}
        </div>

        {lockMs > 0 && (
          <p className="text-xs text-center mb-2" style={{ color: '#C0392B' }}>
            {t('pin.locked', { sec: Math.ceil(lockMs / 1000),
              defaultValue: 'Locked for {{sec}} s after too many attempts.' })}
          </p>
        )}
        {error && (
          <p className="text-xs text-center mb-2" style={{ color: '#C0392B' }}>{error}</p>
        )}

        <div className="grid grid-cols-3 gap-2 mb-3">
          {DIGITS.map((ch, i) => (
            <button key={i} type="button" disabled={!ch || busy}
                    onClick={() => press(ch)}
                    className="py-4 rounded-xl text-xl font-bold"
                    style={{ backgroundColor: ch ? 'var(--color-surface)' : 'transparent',
                             border: ch ? '1px solid var(--color-border)' : 'none',
                             color: 'var(--color-text)',
                             visibility: ch ? 'visible' : 'hidden' }}>
              {ch}
            </button>
          ))}
        </div>

        <button type="button" onClick={submit}
                disabled={busy || lockMs > 0 || current.length < 4}
                className="w-full py-3.5 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--color-accent)',
                         color: 'var(--color-accent-fg)',
                         opacity: (busy || lockMs > 0 || current.length < 4) ? 0.5 : 1 }}>
          {busy ? t('common.working', 'Working…')
            : props.mode === 'set' && stage === 'first' ? t('common.next', 'Next')
            : props.mode === 'set' ? t('pin.savePin', 'Save PIN')
            : t('pin.unlock', 'Unlock')}
        </button>
      </div>
    </div>
  );
}

void DIGITS; // shut up an unused-binding linter in some configs
