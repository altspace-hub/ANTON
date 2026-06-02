/**
 * PrimaryButton — the accent CTA.
 *
 * Bottom-of-page primary affordance: full width, comfortable tap target, top
 * margin auto so it pins to the end of a flex container. Pass
 * marginTopAuto={false} to drop that if used mid-page.
 *
 * Ported verbatim from src/pay/components/PrimaryButton.tsx (#79 wallet parity).
 */
import type { CSSProperties, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  marginTopAuto?: boolean;
  style?: CSSProperties;
}

export default function PrimaryButton({
  children, onClick, disabled, marginTopAuto = true, style,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full py-4 rounded-xl font-bold text-base text-center transition-opacity active:opacity-80"
      style={{
        backgroundColor: 'var(--color-accent)',
        color: 'var(--color-accent-fg)',
        opacity: disabled ? 0.5 : 1,
        marginTop: marginTopAuto ? 'auto' : undefined,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
