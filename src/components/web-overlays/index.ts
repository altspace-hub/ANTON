/**
 * Web UX v2 overlays — barrel export.
 * ⌘K command palette, notifications dropdown, keyboard shortcuts modal.
 * Wire with a single `useWebOverlays()` hook (⌘K / Bell-click / ?).
 */

export { CommandPalette }            from './CommandPalette';
export type { CommandPaletteProps, CommandItem } from './CommandPalette';

export { NotifPanel }                from './NotifPanel';
export type { NotifPanelProps, NotifItem } from './NotifPanel';

export { ShortcutsOverlay }          from './ShortcutsOverlay';
export type { ShortcutsOverlayProps, ShortcutGroup, ShortcutRow } from './ShortcutsOverlay';
