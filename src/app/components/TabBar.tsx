/**
 * TabBar — bottom navigation, Evolution design.
 *
 * Two visual variants driven by `mode`:
 *   • pro      — text-coloured active state, thin top indicator bar,
 *                tighter spacing (matches design/screens-auth.jsx
 *                BottomTabs).
 *   • standard — accent-coloured active state, bigger icons + labels,
 *                more breathing room (matches design/screens-standard.jsx
 *                SBottomTabs). Hits the looser-density rules of the
 *                Standard mode spec.
 */

import { Ico, type IcoName } from './ui/Ico';
import { usePersonalization } from './ui/PersonalizationContext';

interface Tab {
  id: string;
  label: string;
  icon: string;            // legacy string key (kept for App.tsx compat)
  badge?: number;
}

interface Props {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

/**
 * Map the legacy tab.icon string keys to Ico names. Keeps App.tsx's
 * existing tab definitions working without touching them. Anything
 * unknown falls back to the `more` (3-dot) icon.
 */
const ICON_MAP: Record<string, IcoName> = {
  home: 'home',
  chat: 'message',
  message: 'message',
  schedule: 'inbox',         // schedule → inbox-style icon
  tasks: 'inbox',            // tasks → same
  approvals: 'inbox',        // approvals always renders the inbox icon
  capture: 'camera',
  search: 'search',
  ask: 'sparkles',
  voice: 'mic',
  radar: 'radar',
  markets: 'arrowUp',
  wallet: 'qr',
  more: 'more',
  you: 'shield',
  profile: 'shield',
  settings: 'shield',
};

export default function TabBar({ tabs, activeTab, onTabChange }: Props) {
  const { mode } = usePersonalization();
  const isStandard = mode === 'standard';

  return (
    <nav
      className="safe-bottom flex flex-shrink-0 border-t border-[var(--color-border-soft)] bg-[var(--color-surface)]"
      style={{
        padding: isStandard ? '8px 6px 14px' : '6px 4px 10px',
      }}
    >
      {tabs.map(tab => {
        const active = tab.id === activeTab;
        const iconName = ICON_MAP[tab.icon] || ICON_MAP[tab.id] || 'more';
        const colour = active
          ? (isStandard ? 'var(--color-accent)' : 'var(--color-text)')
          : 'var(--color-text-muted)';

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
            style={{ padding: '6px 0', minHeight: 44 }}
          >
            {/* Pro mode top indicator bar */}
            {!isStandard && active && (
              <span
                aria-hidden
                className="absolute top-0 h-[2px] w-7 rounded-sm"
                style={{ background: 'var(--color-text)' }}
              />
            )}

            <span className="relative inline-flex">
              <Ico name={iconName} color={colour} size={isStandard ? 26 : 22} />
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className="absolute inline-flex items-center justify-center rounded-full font-bold text-white"
                  style={{
                    background: 'var(--color-red)',
                    border: '1.5px solid var(--color-surface)',
                    top: isStandard ? -4 : -3,
                    right: isStandard ? -10 : -8,
                    minWidth: isStandard ? 20 : 16,
                    height: isStandard ? 20 : 16,
                    padding: '0 4px',
                    fontSize: isStandard ? 11 : 9,
                  }}
                >
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </span>

            <span
              className={active ? 'font-semibold' : 'font-medium'}
              style={{
                color: colour,
                fontSize: isStandard ? 12 : 10,
                letterSpacing: '-0.1px',
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
