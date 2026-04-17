/**
 * BottomSheet — reusable Material 3 / iOS UISheetPresentationController
 * style sheet per spec §9.3. Used for module input forms, confirmation
 * flows, share menus, settings sub-pages, voice transcription preview.
 *
 * Features:
 *   • Backdrop tap dismisses (with optional dismissible=false to require
 *     an explicit action).
 *   • ESC key dismisses on web.
 *   • Body scroll lock while open.
 *   • Slide-up animation via the .animate-slideUp class (app.css).
 *   • Rounded top corners + drag handle.
 */

import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Whether tapping the backdrop or pressing ESC dismisses (default true) */
  dismissible?: boolean;
  /** Restrict the sheet's max height (defaults to 88dvh) */
  maxHeight?: string;
  /** Optional footer with primary actions */
  footer?: ReactNode;
  children: ReactNode;
  /** ARIA label for the sheet (falls back to "Sheet") */
  ariaLabel?: string;
}

export default function BottomSheet({ open, onClose, title, dismissible = true, maxHeight = '88dvh', footer, children, ariaLabel }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissible) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : (ariaLabel ?? 'Sheet')}>
      <button
        type="button"
        onClick={() => dismissible && onClose()}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Close"
      />
      <div
        className="relative flex w-full max-w-2xl flex-col rounded-t-2xl border-t border-border bg-adv-dark-2 pb-[env(safe-area-inset-bottom)] shadow-2xl animate-slideUp"
        style={{ maxHeight }}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-adv-gray/40 mt-2 mb-2" />
        {title && (
          <div className="px-4 pb-1 pt-1">
            {typeof title === 'string'
              ? <h2 className="text-sm font-semibold text-adv-off-white">{title}</h2>
              : title}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>
        {footer && (
          <div className="border-t border-border px-3 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
