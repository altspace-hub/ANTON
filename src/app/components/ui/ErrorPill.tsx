/**
 * ErrorPill — surfaces data-fetch failures + offers a retry.
 *
 * Replaces 14+ silent `.catch(() => {})` patterns that left users
 * staring at a permanent loading state on 401/403/5xx. Every page
 * that loads remote data should render one of these instead of
 * eating the rejection.
 *
 * Usage:
 *   {error && <ErrorPill message={error} onRetry={() => refetch()} />}
 *
 * The pill is `role="alert"` so screen readers announce it
 * immediately. `aria-live="assertive"` so it interrupts ongoing
 * narration — that's appropriate because by definition the user
 * is now looking at a screen with no data.
 */

import { Btn } from './Btn';
import { Ico } from './Ico';

export interface ErrorPillProps {
  message: string;
  onRetry?: () => void;
  /** Override the retry button label. */
  retryLabel?: string;
  className?: string;
}

export function ErrorPill({
  message,
  onRetry,
  retryLabel = 'Retry',
  className = '',
}: ErrorPillProps): JSX.Element {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-3 rounded-[var(--radius-r2)] px-3.5 py-3 ${className}`}
      style={{
        background: 'var(--color-red-dim)',
        border: '1px solid color-mix(in srgb, var(--color-red) 25%, transparent)',
        color: 'var(--color-red)',
      }}
    >
      <span className="mt-px flex-shrink-0" aria-hidden="true">
        <Ico name="alert" color="var(--color-red)" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-snug">{message}</div>
      </div>
      {onRetry && (
        <Btn variant="ghost" size="sm" onClick={onRetry}>
          {retryLabel}
        </Btn>
      )}
    </div>
  );
}
