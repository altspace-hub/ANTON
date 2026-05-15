import { useTranslation } from 'react-i18next';
import { Ico, type IcoName } from './Ico';

export type TabId = 'chat' | 'wassup' | 'events' | 'portals' | 'wallet';

type Tab = { id: TabId; icon: IcoName };

const TABS: Tab[] = [
  { id: 'chat',    icon: 'message'  },
  { id: 'wassup',  icon: 'sparkles' },
  { id: 'events',  icon: 'calendar' },
  { id: 'portals', icon: 'grid'     },
  { id: 'wallet',  icon: 'wallet'   },
];

interface Props {
  active: TabId;
  onChange: (id: TabId) => void;
}

export default function TabBar({ active, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <nav
      className="border-t border-[var(--color-border-soft)] bg-[var(--color-surface)] safe-bottom"
      role="tablist"
      aria-label="Primary"
    >
      <div className="flex justify-around items-stretch h-16">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => onChange(tab.id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors"
              style={{
                color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
              }}
            >
              <Ico name={tab.icon} size={isActive ? 24 : 22} />
              <span>{t(`tabs.${tab.id}`)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
