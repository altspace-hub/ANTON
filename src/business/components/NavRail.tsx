/**
 * NavRail — persistent left navigation for the tablet layout.
 *
 * Shown only on tablet (see useViewport). The phone build keeps its
 * full-screen stack and never renders this. Six destinations:
 * Home, Sell, Receipts, Statistics, Inventory, Settings.
 *
 * The rail is purely presentational — App.tsx owns navigation state
 * and passes the active section + an onNavigate callback.
 */
import { useTranslation } from 'react-i18next';
import Logo from './Logo';

export type NavSection =
  | 'home' | 'sell' | 'receipts' | 'statistics' | 'inventory' | 'settings';

interface Props {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
}

interface RailItem {
  id: NavSection;
  labelKey: string;
  labelFallback: string;
  icon: React.ReactNode;
}

/** 22px stroked icons — same visual weight as the rest of the app. */
const ICONS: Record<NavSection, React.ReactNode> = {
  home: (
    <path d="M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5"
          stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" />
  ),
  sell: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2"
            stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9h18M8 14h5" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" />
    </>
  ),
  receipts: (
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6"
          stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" />
  ),
  statistics: (
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"
          stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" />
  ),
  inventory: (
    <>
      <path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7"
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 11v10" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
            stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export default function NavRail({ active, onNavigate }: Props) {
  const { t } = useTranslation();

  const items: RailItem[] = [
    { id: 'home',       labelKey: 'nav.home',       labelFallback: 'Home',       icon: ICONS.home },
    { id: 'sell',       labelKey: 'nav.sell',       labelFallback: 'Sell',       icon: ICONS.sell },
    { id: 'receipts',   labelKey: 'nav.receipts',   labelFallback: 'Receipts',   icon: ICONS.receipts },
    { id: 'statistics', labelKey: 'nav.statistics', labelFallback: 'Statistics', icon: ICONS.statistics },
    { id: 'inventory',  labelKey: 'nav.inventory',  labelFallback: 'Inventory',  icon: ICONS.inventory },
    { id: 'settings',   labelKey: 'nav.settings',   labelFallback: 'Settings',   icon: ICONS.settings },
  ];

  return (
    <nav className="flex flex-col safe-top safe-bottom safe-left shrink-0"
         style={{
           width: 188,
           backgroundColor: 'var(--color-surface)',
           borderRight: '1px solid var(--color-border)',
         }}>
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 pt-2 pb-5">
        <Logo size={32} rounded="md" />
        <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
          ANTON
        </span>
      </div>

      {/* Destinations */}
      <div className="flex flex-col gap-1 px-3">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button key={item.id} type="button"
                    onClick={() => onNavigate(item.id)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                    style={{
                      backgroundColor: isActive ? 'var(--color-accent)' : 'transparent',
                      color: isActive ? 'var(--color-accent-fg)' : 'var(--color-text-body)',
                    }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                   style={{ flexShrink: 0 }}>
                {item.icon}
              </svg>
              <span className="text-sm font-semibold">
                {t(item.labelKey, item.labelFallback)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto px-4 pb-2 text-[10px]"
           style={{ color: 'var(--color-text-faint)' }}>
        {t('home.version', 'ANTON Business')}
      </div>
    </nav>
  );
}
