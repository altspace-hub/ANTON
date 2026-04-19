import { useEffect, useState } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Severity affects the confirm button colour. */
  severity?: 'normal' | 'warning' | 'destructive';
  /** When true, requires the user to type a confirmation string before confirm enables. */
  requireTypedConfirmation?: string;
  /** When true, requires the user to enter a free-text reason ≥10 chars. */
  requireReason?: boolean;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void | Promise<void>;
  onCancel: () => void;
}

const SEVERITY_BTN: Record<NonNullable<Props['severity']>, string> = {
  normal: 'bg-adv-teal text-adv-dark hover:bg-adv-teal-dark',
  warning: 'bg-amber-500 text-adv-dark hover:bg-amber-600',
  destructive: 'bg-red-500 text-white hover:bg-red-600',
};

/**
 * Replacement for window.confirm() across Hardware pages. Matches the
 * design system, supports keyboard navigation (Esc to cancel, Cmd/Ctrl+Enter
 * to confirm), and can require typed confirmation or a free-text reason
 * for destructive actions.
 */
export default function ConfirmModal({
  open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  severity = 'normal', requireTypedConfirmation, requireReason = false,
  reasonPlaceholder, onConfirm, onCancel,
}: Props) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setTyped(''); setReason(''); setBusy(false); return; }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        const t = e.target as HTMLElement;
        if (t?.tagName !== 'TEXTAREA') doConfirm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open]);

  if (!open) return null;

  const typeMatchesConfirmation = !requireTypedConfirmation || typed === requireTypedConfirmation;
  const reasonOk = !requireReason || reason.trim().length >= 10;
  const canConfirm = typeMatchesConfirmation && reasonOk && !busy;

  const doConfirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm(requireReason ? reason.trim() : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-description"
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-adv-dark-2 border border-adv-gray/20 rounded max-w-md w-full"
      >
        <header className="border-b border-adv-gray/20 p-3 flex items-start justify-between">
          <div className="flex items-start gap-2">
            {severity !== 'normal' && (
              <AlertTriangle className={`w-5 h-5 mt-0.5 ${severity === 'destructive' ? 'text-red-400' : 'text-amber-400'}`} />
            )}
            <div>
              <h2 id="confirm-modal-title" className="text-sm font-semibold">{title}</h2>
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="p-1 rounded hover:bg-adv-card focus:outline-none focus:ring-2 focus:ring-adv-teal"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-3 space-y-3">
          <p id="confirm-modal-description" className="text-sm text-adv-gray whitespace-pre-wrap">{description}</p>

          {requireTypedConfirmation && (
            <div>
              <label className="block text-xs text-adv-gray mb-1">
                Type <code className="px-1 py-0.5 bg-adv-card border border-adv-gray/30 rounded">{requireTypedConfirmation}</code> to confirm
              </label>
              <input
                value={typed}
                onChange={e => setTyped(e.target.value)}
                autoFocus
                aria-label={`Type ${requireTypedConfirmation} to confirm`}
                className="w-full bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-adv-teal"
              />
            </div>
          )}

          {requireReason && (
            <div>
              <label htmlFor="confirm-modal-reason" className="block text-xs text-adv-gray mb-1">Reason (≥10 characters)</label>
              <textarea
                id="confirm-modal-reason"
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder={reasonPlaceholder ?? 'Explain why you are taking this action — kept in the audit trail.'}
                className="w-full bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-adv-teal"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm rounded border border-adv-gray/30 hover:border-adv-teal/40 focus:outline-none focus:ring-2 focus:ring-adv-teal"
            >
              {cancelLabel}
            </button>
            <button
              onClick={doConfirm}
              disabled={!canConfirm}
              className={`px-3 py-1.5 text-sm rounded font-medium disabled:opacity-50 flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-adv-teal ${SEVERITY_BTN[severity]}`}
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
