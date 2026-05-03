/**
 * BottomSheet — reusable Material 3 / iOS UISheetPresentationController
 * style sheet per spec §9.3. Used for module input forms, confirmation
 * flows, share menus, settings sub-pages, voice transcription preview.
 *
 * Features:
 *   • Backdrop tap dismisses (with optional dismissible=false to require
 *     an explicit action).
 *   • ESC key + Android hardware back button dismiss when dismissible.
 *   • Body scroll lock while open.
 *   • Slide-up animation via the .animate-slideUp class (app.css).
 *   • Rounded top corners + drag handle.
 *   • Light Evolution theme (was: legacy adv-* dark classes, May 2026 IRE).
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { registerBackHandler } from '../services/back-stack';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Whether tapping the backdrop, ESC, or Android back dismisses (default true) */
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
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissible) onClose();
    }
    window.addEventListener('keydown', onKey);

    // Register with the Android back-stack so hardware back closes the sheet
    // before triggering page navigation. Only matters when dismissible.
    const unregister = dismissible ? registerBackHandler(onClose) : null;

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      unregister?.();
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : (ariaLabel ?? 'Sheet')}
    >
      <button
        type="button"
        onClick={() => dismissible && onClose()}
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(26, 27, 46, 0.55)' }}
        aria-label="Close"
      />
      <div
        className="animate-slideUp relative flex w-full max-w-2xl flex-col rounded-t-[20px] pb-[env(safe-area-inset-bottom)] shadow-2xl"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-soft)',
          borderBottom: 'none',
          maxHeight,
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pb-2 pt-2.5">
          <div
            className="h-1 w-10 rounded-full"
            style={{ background: 'var(--color-border)' }}
          />
        </div>
        {title && (
          <div className="px-4 pb-2 pt-1">
            {typeof title === 'string' ? (
              <h2
                className="text-[15px] font-bold"
                style={{ color: 'var(--color-text)', letterSpacing: '-0.2px' }}
              >
                {title}
              </h2>
            ) : title}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>
        {footer && (
          <div
            className="px-4 py-3"
            style={{ borderTop: '1px solid var(--color-border-soft)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
