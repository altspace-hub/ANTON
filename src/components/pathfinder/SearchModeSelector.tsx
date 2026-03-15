/**
 * SearchModeSelector — 7 intent mode toggle buttons for Pathfinder
 * Knowledge (default), Shopping, Travel, Food, Fix, News, Local
 */
import { BookOpen, ShoppingBag, Plane, UtensilsCrossed, Wrench, Newspaper, Navigation } from 'lucide-react';

export type SearchMode = 'knowledge' | 'shopping' | 'travel' | 'food' | 'fix' | 'news' | 'local';

interface ModeConfig {
  id: SearchMode;
  label: string;
  icon: typeof BookOpen;
  hint: string;
}

const MODES: ModeConfig[] = [
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen, hint: 'Sources ranked by authority and credibility' },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBag, hint: 'Prices compared. No sponsored results. Ever.' },
  { id: 'travel', label: 'Travel', icon: Plane, hint: 'Routes, costs, and bookings' },
  { id: 'food', label: 'Food', icon: UtensilsCrossed, hint: 'Recipes ranked by reliability' },
  { id: 'fix', label: 'Fix', icon: Wrench, hint: 'Step-by-step solutions, verified and current' },
  { id: 'news', label: 'News', icon: Newspaper, hint: 'Most recent first. Bias shown. Opinion clearly labelled.' },
  { id: 'local', label: 'Local', icon: Navigation, hint: 'Nearest first. Open now highlighted.' },
];

interface SearchModeSelectorProps {
  value: SearchMode;
  onChange: (mode: SearchMode) => void;
  compact?: boolean;
  disabled?: boolean;
}

export default function SearchModeSelector({ value, onChange, compact = false, disabled = false }: SearchModeSelectorProps) {
  const activeMode = MODES.find(m => m.id === value) || MODES[0];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 flex-wrap">
        {MODES.map(mode => {
          const Icon = mode.icon;
          const isActive = value === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => onChange(mode.id)}
              disabled={disabled}
              title={mode.hint}
              className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all disabled:opacity-40 ${
                isActive
                  ? 'bg-adv-teal text-adv-dark shadow-sm'
                  : 'text-adv-gray hover:text-adv-off-white hover:bg-adv-card border border-transparent hover:border-border'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {!compact && <span>{mode.label}</span>}
            </button>
          );
        })}
      </div>
      {/* Contextual hint below buttons */}
      {!compact && (
        <p className="text-[10px] text-adv-gray/60 pl-1">
          {activeMode.hint}
        </p>
      )}
    </div>
  );
}
