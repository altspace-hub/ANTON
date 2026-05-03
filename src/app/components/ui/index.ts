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

export { PageHeader }            from './PageHeader';
export type { PageHeaderProps }  from './PageHeader';

export { MonogramTile, MODULE_GLYPH, getModuleGlyph, hasModuleGlyph } from './MonogramTile';
export type { MonogramTileProps, MonogramTone } from './MonogramTile';

export { PriorityCard }          from './PriorityCard';
export type { PriorityCardProps, PriorityTone } from './PriorityCard';

export { StatTriplet }           from './StatTriplet';
export type { StatTripletProps, Stat, StatTone } from './StatTriplet';

export { Spinner }               from './Spinner';
export type { SpinnerProps, SpinnerSize, SpinnerTone } from './Spinner';

export { ErrorPill }             from './ErrorPill';
export type { ErrorPillProps }   from './ErrorPill';

export { SheetTitle }            from './SheetTitle';
export type { SheetTitleProps }  from './SheetTitle';

export { QuickActionTile }       from './QuickActionTile';
export type { QuickActionTileProps } from './QuickActionTile';

export {
  PersonalizationProvider,
  usePersonalization,
} from './PersonalizationContext';
