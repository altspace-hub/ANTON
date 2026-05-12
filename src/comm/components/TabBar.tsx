import { Ico, type IcoName } from './Ico';

export type TabId = 'chat' | 'events' | 'portals' | 'wallet';

type Tab = { id: TabId; label: string; icon: IcoName };

const TABS: Tab[] = [
  { id: 'chat',    label: 'Chat',    icon: 'message'  },
  { id: 'events',  label: 'Events',  icon: 'calendar' },
  { id: 'portals', label: 'Portals', icon: 'grid'     },
  { id: 'wallet',  label: 'Wallet',  icon: 'wallet'   },
];

interface Props {
  active: TabId;
  onChange: (id: TabId) => void;
}

export default function TabBar({ active, onChange }: Props) {
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
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
