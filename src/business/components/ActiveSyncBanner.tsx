/**
 * ActiveSyncBanner — "Listening for payment 0:42…  [Cancel]" UI for
 * the active-sync periods (Sync button, Receive screen auto-arm,
 * Business QR auto-arm). Mirrors the Stripe Terminal pattern: live
 * elapsed timer + always-present Cancel.
 *
 * Pure presentational — owns no polling logic of its own. The
 * parent passes the current ActiveSyncSnapshot and the cancel
 * callback; this component just renders.
 */
import { useTranslation } from 'react-i18next';
import type { ActiveSyncSnapshot } from '../services/active-sync';
import { formatElapsed } from '../services/active-sync';

interface Props {
  snapshot: ActiveSyncSnapshot | null;
  onCancel: () => void;
}

export default function ActiveSyncBanner({ snapshot, onCancel }: Props) {
  const { t } = useTranslation();
  if (!snapshot) return null;
  const pct = Math.min(100, (snapshot.elapsedMs / snapshot.budgetMs) * 100);
  return (
    <div className="rounded-xl p-3 flex items-center gap-3"
         style={{ backgroundColor: 'var(--color-accent-soft, rgba(45,212,168,0.12))',
                  border: '1px solid var(--color-accent-dim, rgba(45,212,168,0.32))' }}>
      <span className="relative flex items-center justify-center w-7 h-7 shrink-0">
        <span className="absolute inset-0 rounded-full animate-ping"
              style={{ backgroundColor: 'var(--color-accent)', opacity: 0.25 }} />
        <span className="relative w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: 'var(--color-accent)' }} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {t('sync.listening', 'Listening for payment')} · {formatElapsed(snapshot.elapsedMs)}
        </div>
        <div className="mt-1 h-0.5 rounded-full overflow-hidden"
             style={{ backgroundColor: 'var(--color-border)' }}>
          <div className="h-full" style={{ width: `${pct}%`, backgroundColor: 'var(--color-accent)' }} />
        </div>
      </div>
      <button type="button" onClick={onCancel}
              className="text-xs font-semibold px-2 py-1 rounded"
              style={{ color: 'var(--color-text-muted)' }}>
        {t('common.cancel', 'Cancel')}
      </button>
    </div>
  );
}
