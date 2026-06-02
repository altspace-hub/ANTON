/**
 * CopyRow — a labelled, monospaced value with a one-tap copy button and
 * a transient "Copied" flash. Extracted from ReceiveScreen.copyAddress
 * so every long opaque value (txId, addresses, ADR-004 ref) gets the
 * same affordance.
 *
 * Copy path mirrors ReceiveScreen exactly:
 *   1. navigator.clipboard.writeText — the happy path.
 *   2. On failure (older WebViews, insecure context) fall back to
 *      selecting the value text so the user can long-press → Copy.
 * Either way the button flashes "Copied" for 1.8s.
 *
 * Presentation-only — never mutates app state.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  /** Uppercase caption above the value (e.g. "Tx id"). */
  label: string;
  /** The opaque value to display + copy. Rendered monospaced + wrapped. */
  value: string;
}

const FLASH_MS = 1800;

export default function CopyRow({ label, value }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const valueRef = useRef<HTMLDivElement | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), FLASH_MS);
    } catch {
      // Clipboard unavailable (insecure context / older WebView) —
      // select the value text so the user can long-press → Copy.
      try {
        const node = valueRef.current;
        if (node) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      } catch { /* selection API unavailable — nothing more we can do */ }
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider mb-1"
             style={{ color: 'var(--color-text-faint)' }}>
          {label}
        </div>
        <div ref={valueRef} className="mono text-xs break-all select-all"
             style={{ color: 'var(--color-text-body)' }}>
          {value}
        </div>
      </div>
      <button type="button" onClick={() => void copy()}
              className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
              style={{ backgroundColor: 'var(--color-surface-muted)',
                       border: '1px solid var(--color-border)',
                       color: copied ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2"
                  stroke="currentColor" strokeWidth="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {copied ? t('wallet.copied', 'Copied') : t('common.copy', 'Copy')}
      </button>
    </div>
  );
}
