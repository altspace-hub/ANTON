/**
 * ForwardSheet — bottom-sheet contact picker for R8 Forward action.
 *
 * Lists the user's contacts (excluding the current chat peer and any
 * keyless contacts that can't receive encrypted messages). Tap a row to
 * forward; the parent then dispatches sendForward and closes the sheet.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ico } from './Ico';
import { registerBackHandler } from '../services/back-stack';
import { listContacts, type Contact } from '../services/contacts';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Hide this contact from the list (usually the current chat peer). */
  excludeContactHash?: string;
  onPick: (contactHash: string) => void;
}

export default function ForwardSheet({ open, onClose, excludeContactHash, onPick }: Props) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    void listContacts().then((rows) => { setContacts(rows); setLoaded(true); });
    return registerBackHandler(onClose);
  }, [open, onClose]);

  if (!open) return null;

  const candidates = contacts.filter(
    (c) => c.contactHash !== excludeContactHash && !!c.publicKeyHex,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('forward.title', 'Forward to')}
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(28, 26, 20, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-surface)] rounded-t-3xl pt-3 pb-6 safe-bottom max-h-[70vh] flex flex-col"
      >
        <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-3" />
        <div className="px-5 pb-2">
          <h2 className="text-base font-semibold text-[var(--color-text)]">{t('forward.title', 'Forward to')}</h2>
        </div>

        {!loaded ? (
          <p className="px-5 py-4 text-sm text-[var(--color-text-faint)]">{t('common.loading', 'Loading…')}</p>
        ) : candidates.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[var(--color-text-faint)]">
            {t('forward.noContacts', 'No other contacts with a known key. Add a contact and exchange QR codes first.')}
          </p>
        ) : (
          <ul className="overflow-y-auto px-2">
            {candidates.map((c) => (
              <li key={c.contactHash}>
                <button
                  onClick={() => { onClose(); onPick(c.contactHash); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left active:bg-[var(--color-surface-muted)]"
                >
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                    style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
                  >
                    {c.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] text-[var(--color-text)] truncate">{c.displayName}</span>
                    <span className="block text-[11px] font-mono text-[var(--color-text-faint)] truncate">{c.contactHash}</span>
                  </span>
                  <Ico name="chevronRight" size={18} color="var(--color-text-muted)" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
