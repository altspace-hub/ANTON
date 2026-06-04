import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ico, type IcoName } from './Ico';
import { registerBackHandler } from '../services/back-stack';
import EmojiPickerSheet from './EmojiPickerSheet';

const REACTION_EMOJI = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

interface Props {
  open: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy?: () => void;
  /** R8 — forward to a different contact */
  onForward?: () => void;
  /** R8 — edit (own text only) */
  onEdit?: () => void;
  /** R8 — delete-for-everyone (own message) */
  onDelete?: () => void;
  /** Show extra actions when this is the user's own message. */
  isMine?: boolean;
}

export default function MessageActionSheet({ open, onClose, onReact, onReply, onCopy, onForward, onEdit, onDelete, isMine }: Props) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);

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

        {/* P3-5 — quick row + open-picker affordance */}
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
          <button
            onClick={() => setPickerOpen(true)}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-[var(--color-surface-alt)] active:bg-[var(--color-surface-muted)]"
            aria-label={t('msgAction.moreEmojis', 'More emojis')}
          >
            <Ico name="plus" size={20} color="var(--color-text-muted)" />
          </button>
        </div>

        {/* Action rows */}
        <div className="px-4 space-y-1">
          <Row icon="reply" label={t('msgAction.reply', 'Reply')} onClick={() => { onClose(); onReply(); }} />
          {onForward && <Row icon="share" label={t('msgAction.forward', 'Forward')} onClick={() => { onClose(); onForward(); }} />}
          {onCopy && <Row icon="share" label={t('msgAction.copy', 'Copy')} onClick={() => { onClose(); onCopy(); }} />}
          {isMine && onEdit && <Row icon="reply" label={t('msgAction.edit', 'Edit')} onClick={() => { onClose(); onEdit(); }} />}
          {isMine && onDelete && <Row icon="trash" label={t('msgAction.deleteForEveryone', 'Delete for everyone')} onClick={() => { onClose(); onDelete(); }} destructive />}
        </div>
      </div>

      <EmojiPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(emoji) => {
          setPickerOpen(false);
          onClose();
          onReact(emoji);
        }}
      />
    </div>
  );
}

function Row({ icon, label, onClick, disabled, destructive }: { icon: IcoName; label: string; onClick?: () => void; disabled?: boolean; destructive?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-[15px] active:bg-[var(--color-surface-muted)] disabled:opacity-40"
      style={{ color: destructive ? 'var(--color-red)' : 'var(--color-text)' }}
    >
      <Ico name={icon} size={20} color={destructive ? 'var(--color-red)' : 'var(--color-text-muted)'} />
      <span>{label}</span>
    </button>
  );
}
