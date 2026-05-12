import { useEffect } from 'react';
import { Ico, type IcoName } from './Ico';
import { registerBackHandler } from '../services/back-stack';

const REACTION_EMOJI = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

interface Props {
  open: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy?: () => void;
  /** Show extra actions when this is the user's own message. */
  isMine?: boolean;
}

export default function MessageActionSheet({ open, onClose, onReact, onReply, onCopy, isMine }: Props) {
  useEffect(() => {
    if (!open) return;
    return registerBackHandler(onClose);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(28, 26, 20, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-surface)] rounded-t-3xl pt-3 pb-6 safe-bottom"
      >
        <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-4" />

        {/* Emoji shelf */}
        <div className="px-4 mb-4 flex items-center gap-2 overflow-x-auto">
          {REACTION_EMOJI.map((e) => (
            <button
              key={e}
              onClick={() => { onClose(); onReact(e); }}
              className="w-12 h-12 rounded-full flex items-center justify-center text-2xl bg-[var(--color-surface-alt)] active:bg-[var(--color-surface-muted)]"
              aria-label={`React with ${e}`}
            >
              {e}
            </button>
          ))}
        </div>

        {/* Action rows */}
        <div className="px-4 space-y-1">
          <Row icon="reply" label="Reply" onClick={() => { onClose(); onReply(); }} />
          {onCopy && <Row icon="share" label="Copy" onClick={() => { onClose(); onCopy(); }} />}
          {isMine && <Row icon="trash" label="Delete (coming in R8)" disabled />}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, onClick, disabled }: { icon: IcoName; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-[15px] text-[var(--color-text)] active:bg-[var(--color-surface-muted)] disabled:opacity-40"
    >
      <Ico name={icon} size={20} color="var(--color-text-muted)" />
      <span>{label}</span>
    </button>
  );
}
