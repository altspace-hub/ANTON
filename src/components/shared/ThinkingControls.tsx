import { Zap, Brain, Microscope, SearchCode, ListChecks } from 'lucide-react';
import type { ThinkingLevel } from '@/lib/types';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap,
  Brain,
  Microscope,
  SearchCode,
  ListChecks,
};

const levels: Array<{
  id: ThinkingLevel;
  label: string;
  description: string;
  icon: string;
}> = [
  { id: 'quick', label: 'Quick', description: 'Fast response, minimal analysis', icon: 'Zap' },
  { id: 'think', label: 'Think', description: 'Standard analysis depth', icon: 'Brain' },
  { id: 'think_hard', label: 'Think Hard', description: 'Deep analysis with careful reasoning', icon: 'Microscope' },
  { id: 'investigate', label: 'Investigate', description: 'Thorough investigation, maximum depth', icon: 'SearchCode' },
  { id: 'plan_first', label: 'Plan First', description: 'Create explicit plan before executing', icon: 'ListChecks' },
];

interface ThinkingControlsProps {
  value: ThinkingLevel;
  onChange: (value: ThinkingLevel) => void;
}

export default function ThinkingControls({ value, onChange }: ThinkingControlsProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-adv-off-white">
        How deeply should Claude analyze?
      </label>
      <div className="grid grid-cols-5 gap-1.5">
        {levels.map((level) => {
          const Icon = iconMap[level.icon];
          const isActive = value === level.id;
          return (
            <button
              key={level.id}
              onClick={() => onChange(level.id)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-all ${
                isActive
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal shadow-sm shadow-adv-teal/10'
                  : 'border-border bg-adv-card text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
              }`}
              title={level.description}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[11px] font-medium leading-tight">{level.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
