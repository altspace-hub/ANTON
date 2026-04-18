/**
 * Web UX v2 primitives — barrel export.
 * Use these for new run-page shells, sidebar, top-bar, right-rail,
 * overlays. Existing screens keep their current components.
 */

export { Btn }                        from './Btn';
export type { BtnProps, BtnVariant, BtnSize } from './Btn';

export { Pill }                       from './Pill';
export type { PillProps, PillTone }   from './Pill';

export { Section }                    from './Section';
export type { SectionProps }          from './Section';

export { Dot }                        from './Dot';
export type { DotProps, DotTone }     from './Dot';

export { Kbd, KbdSequence }           from './Kbd';
export type { KbdProps, KbdSequenceProps } from './Kbd';
