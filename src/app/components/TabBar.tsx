/**
 * TabBar — bottom navigation, Evolution design.
 *
 * Single visual language (no Pro/Standard fork — May 3 IRE):
 *   • Active tab: text + icon use --color-text (full strength)
 *   • Inactive: --color-text-muted
 *   • No top-indicator bar (was a desktop-tab metaphor on mobile)
 *   • Safe-area-inset-bottom respected so the bar clears the gesture
 *     handle on edge-to-edge phones
 *   • Standard mode keeps slightly larger icons/labels for daily-life users
 */

import { Ico, type IcoName } from './ui/Ico';
import { usePersonalization } from './ui/PersonalizationContext';

interface Tab {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

interface Props {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const ICON_MAP: Record<string, IcoName> = {
  home: 'home',
  chat: 'message',
  message: 'message',
  schedule: 'calendar',
  tasks: 'checkSquare',
  approvals: 'shieldCheck',
  shieldCheck: 'shieldCheck',
  capture: 'camera',
  camera: 'camera',
  search: 'search',
  ask: 'sparkles',
  sparkles: 'sparkles',
  voice: 'mic',
  mic: 'mic',
  radar: 'radar',
  markets: 'barChart',
  wallet: 'wallet',
  more: 'more',
  you: 'user',
  profile: 'user',
  settings: 'settings',
  shield: 'shield',
};

export default function TabBar({ tabs, activeTab, onTabChange }: Props) {
  const { mode } = usePersonalization();
  const isStandard = mode === 'standard';

  return (
    <nav
      className="flex flex-shrink-0"
      style={{
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border-soft)',
        paddingTop: isStandard ? 6 : 4,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0) + 8px)',
      }}
    >
      {tabs.map(tab => {
        const active = tab.id === activeTab;
        const iconName = ICON_MAP[tab.icon] || ICON_MAP[tab.id] || 'more';
        const colour = active
          ? 'var(--color-text)'
          : 'var(--color-text-muted)';

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            className="relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors active:opacity-70"
            style={{ padding: '6px 0', minHeight: 48 }}
          >
            <span className="relative inline-flex">
              <Ico name={iconName} color={colour} size={isStandard ? 24 : 22} />
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className="absolute inline-flex items-center justify-center rounded-full font-bold text-white"
                  style={{
                    background: 'var(--color-red)',
                    border: '1.5px solid var(--color-surface)',
                    top: -4,
                    right: -8,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    fontSize: 9,
                    lineHeight: 1,
                  }}
                >
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </span>
            <span
              style={{
                color: colour,
                fontSize: isStandard ? 11 : 10,
                fontWeight: active ? 600 : 500,
                letterSpacing: '-0.05px',
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
