import { List, Columns3, CalendarDays, CalendarRange, CalendarClock } from 'lucide-react';
import type { ViewType } from './types';

const VIEWS: Array<{ id: ViewType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'list', label: 'List', icon: List },
  { id: 'kanban', label: 'Kanban', icon: Columns3 },
  { id: 'week', label: 'Week', icon: CalendarDays },
  { id: 'month', label: 'Month', icon: CalendarRange },
  { id: 'year', label: 'Year', icon: CalendarClock },
];

interface ViewSwitcherProps {
  active: ViewType;
  onChange: (view: ViewType) => void;
}

export default function ViewSwitcher({ active, onChange }: ViewSwitcherProps) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-adv-dark p-1">
      {VIEWS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            active === id
              ? 'bg-adv-teal text-adv-dark'
              : 'text-adv-gray hover:text-adv-off-white'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
