/**
 * TabBar — Bottom navigation for the companion app.
 * Tabs adapt based on org type.
 */

interface Tab {
  id: string;
  label: string;
  icon: string;
}

interface Props {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const TAB_ICONS: Record<string, string> = {
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  schedule: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  tasks: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M21 21l-4.35-4.35',
  radar: 'M5.636 18.364A9 9 0 1 0 18.364 5.636 9 9 0 0 0 5.636 18.364z M12 12h.01',
  markets: 'M23 6l-9.5 9.5-5-5L1 18',
  docs: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
};

export default function TabBar({ tabs, activeTab, onTabChange }: Props) {
  return (
    <nav className="border-t border-border bg-adv-dark-2 safe-bottom">
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-1">
        {tabs.map(tab => {
          const active = tab.id === activeTab;
          const iconPath = TAB_ICONS[tab.icon] || TAB_ICONS.more;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors ${
                active ? 'text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.5' : '1.5'} strokeLinecap="round" strokeLinejoin="round">
                {iconPath.split(' M').map((segment, i) => (
                  <path key={i} d={i === 0 ? segment : `M${segment}`} />
                ))}
              </svg>
              <span className={`text-[10px] ${active ? 'font-semibold' : 'font-normal'}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
