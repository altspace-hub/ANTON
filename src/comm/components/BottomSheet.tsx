/**
 * BottomSheet — shared chrome for every Comm App sheet.
 *
 * Before P6-1 every sheet (ScheduleSheet, WassupAudienceSheet,
 * WassupExpirySheet, DisappearingTimerSheet, EmojiPickerSheet, etc.)
 * repeated the same five primitives:
 *   1. Full-screen translucent backdrop, dismiss on backdrop click.
 *   2. Slide-up panel pinned to the bottom.
 *   3. Drag handle (a 40×4 pill at the top).
 *   4. Optional title with an icon next to it.
 *   5. registerBackHandler() so Android hardware back closes the sheet.
 *
 * This component owns those five concerns. Consumers focus on their
 * content (`children`). Variants stay possible via the `maxHeight`
 * prop for sheets that need a scrollable body.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Ico, type IcoName } from './Ico';
import { registerBackHandler } from '../services/back-stack';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Sheet title shown next to the optional icon. Omitted = no header. */
  title?: string;
  /** Optional icon shown to the left of the title. */
  icon?: IcoName;
  /** Optional aria-label for the dialog. Defaults to title when present. */
  ariaLabel?: string;
  /** Max-height (CSS) for the panel. Default 78dvh — leaves room for the
   *  status bar + a peek of the page behind. Use 85dvh for picker
   *  sheets with long scrollable lists. */
  maxHeight?: string;
  children: ReactNode;
}

export default function BottomSheet({
  open, onClose, title, icon, ariaLabel, maxHeight = '78dvh', children,
}: Props) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    // Android hardware back + browser/desktop Esc both close the sheet.
    // Esc is a no-op on mobile devices that don't have a physical
    // keyboard, but doesn't cost anything — and it lets a tester
    // driving the app via adb keyevent or a connected BT keyboard
    // dismiss without tapping the backdrop.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const unsub = registerBackHandler(onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      unsub();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title ?? t('common.sheet', 'Sheet')}
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(28, 26, 20, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-surface)] rounded-t-3xl pt-3 pb-6 safe-bottom flex flex-col"
        style={{ maxHeight }}
      >
        <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-3 flex-shrink-0" />
        {title && (
          <div className="px-5 pb-2 flex-shrink-0">
            <h2 className="text-base font-semibold text-[var(--color-text)] flex items-center gap-2">
              {icon && <Ico name={icon} size={18} color="var(--color-accent)" />}
              {title}
            </h2>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
