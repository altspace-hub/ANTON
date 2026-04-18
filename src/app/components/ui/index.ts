/**
 * Evolution design-system primitives.
 * Import with: `import { Btn, Pill, Card, Ico } from '../components/ui';`
 */

export { Btn }                   from './Btn';
export type { BtnProps, BtnVariant, BtnSize } from './Btn';

export { Card }                  from './Card';
export type { CardProps }        from './Card';

export { Pill }                  from './Pill';
export type { PillProps, PillTone } from './Pill';

export { StatusDot }             from './StatusDot';
export type { StatusDotProps, DotTone } from './StatusDot';

export { SectionLabel }          from './SectionLabel';
export type { SectionLabelProps } from './SectionLabel';

export { Avatar }                from './Avatar';
export type { AvatarProps }      from './Avatar';

export { Ico }                   from './Ico';
export type { IcoProps, IcoName } from './Ico';

export {
  PersonalizationProvider,
  usePersonalization,
} from './PersonalizationContext';
