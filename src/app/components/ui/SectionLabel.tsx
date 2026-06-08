/**
 * SectionLabel — uppercase mono label, used above lists / cards.
 * 11 px, weight 600, tracking 0.8 px, colour textMuted.
 *
 * When `htmlFor` is set, renders as a real `<label>` so the click /
 * focus association is announced by screen readers and tapping the
 * label moves focus to the input. Use this for every form field.
 */

import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react';

type DivProps = HTMLAttributes<HTMLDivElement> & { htmlFor?: undefined };
type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & { htmlFor: string };

export type SectionLabelProps = (DivProps | LabelProps) & { children?: ReactNode };

export function SectionLabel(props: SectionLabelProps): JSX.Element {
  const { children, className = '', style, ...rest } = props;
  const cls = `font-mono text-[0.6875rem] font-semibold uppercase text-[var(--color-text-muted)] ${className}`;
  const sty = { letterSpacing: '0.8px' as const, ...style };
  if ('htmlFor' in rest && rest.htmlFor) {
    const labelRest = rest as LabelHTMLAttributes<HTMLLabelElement>;
    return (
      <label {...labelRest} className={cls} style={sty}>
        {children}
      </label>
    );
  }
  const divRest = rest as HTMLAttributes<HTMLDivElement>;
  return (
    <div {...divRest} className={cls} style={sty}>
      {children}
    </div>
  );
}
