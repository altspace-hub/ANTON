export type TabId = 'chat' | 'events' | 'portals' | 'wallet';

type Tab = { id: TabId; label: string };

const TABS: Tab[] = [
  { id: 'chat',    label: 'Chat'    },
  { id: 'events',  label: 'Events'  },
  { id: 'portals', label: 'Portals' },
  { id: 'wallet',  label: 'Wallet'  },
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
      <div className="flex justify-around items-stretch h-14">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => onChange(tab.id)}
              className="flex-1 flex items-center justify-center text-sm font-medium transition-colors"
              style={{
                color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
