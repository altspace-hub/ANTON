import { memo } from 'react';
import { Zap, Brain, Microscope, SearchCode, ListChecks, FlaskConical } from 'lucide-react';
import type { ThinkingLevel, ModelId } from '@/lib/types';
import { providerForModelId, thinkingGranularity, type ThinkingGranularity } from '@/lib/constants';
import HelpTooltip from './HelpTooltip';

// Honest note about how the selected model's provider honours thinking levels
// (mirrors the backend thinking-map granularity). 'full' (Anthropic) needs none.
const GRANULARITY_NOTE: Partial<Record<ThinkingGranularity, string>> = {
  effort3: 'This model maps thinking to three reasoning-effort levels — finer levels merge.',
  threshold: 'On this model, deeper reasoning engages at Investigate and above.',
  binary: 'This model reasons on or off — levels above Think Hard behave similarly.',
  none: "This model doesn't use thinking levels — they won't change its output.",
};

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap,
  Brain,
  Microscope,
  SearchCode,
  ListChecks,
  FlaskConical,
};

const levels: Array<{
  id: ThinkingLevel;
  label: string;
  description: string;
  icon: string;
  iterative?: boolean; // marks levels that use the Iterative Reasoning Engine
}> = [
  { id: 'quick', label: 'Quick', description: 'Fast response, minimal analysis', icon: 'Zap' },
  { id: 'think', label: 'Think', description: 'Standard analysis depth', icon: 'Brain' },
  { id: 'think_hard', label: 'Think Hard', description: 'Deep analysis with careful reasoning', icon: 'Microscope' },
  { id: 'investigate', label: 'Investigate', description: 'Thorough investigation, maximum depth', icon: 'SearchCode' },
  { id: 'plan_first', label: 'Plan First', description: 'Create explicit plan before executing', icon: 'ListChecks' },
  {
    id: 'deep_investigate',
    label: 'Deep',
    description: 'Iterative multi-phase reasoning: Analyse → Reflect → Deepen → Explore → Validate → Synthesise. Highest quality, highest cost.',
    icon: 'FlaskConical',
    iterative: true,
  },
];

interface ThinkingControlsProps {
  value: ThinkingLevel;
  onChange: (value: ThinkingLevel) => void;
  /** Optional selected model — enables an honest note about how it honours levels. */
  model?: ModelId;
}

function ThinkingControls({ value, onChange, model }: ThinkingControlsProps) {
  const granularity = model ? thinkingGranularity(providerForModelId(model)) : 'full';
  const note = granularity !== 'full' ? GRANULARITY_NOTE[granularity] : undefined;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <label className="text-sm font-medium text-adv-off-white">
          How deeply should the model analyze?
        </label>
        <HelpTooltip
          wide
          text={"Controls the model's reasoning depth, time, and cost. Support varies by provider — some models honour every level, others map to a coarser setting.\n\n• Quick — instant, minimal reasoning. Good for simple questions.\n• Think — standard analysis. Suits most compliance tasks.\n• Think Hard — deep reasoning with careful multi-step logic. Uses iterative phases.\n• Investigate — thorough multi-phase investigation. Ideal for gap analysis and legal research.\n• Plan First — the model outlines its approach before writing. Best for complex multi-deliverable work.\n• Deep — 6-phase iterative loop (Analyse → Reflect → Deepen → Explore → Validate → Synthesise). Best possible quality for the most complex regulatory and legal analysis. Significantly higher cost and time."}
        />
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {levels.map((level) => {
          const Icon = iconMap[level.icon];
          const isActive = value === level.id;
          return (
            <button
              key={level.id}
              onClick={() => onChange(level.id)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-all ${
                isActive && level.iterative
                  ? 'border-adv-gold bg-adv-gold/10 text-adv-gold shadow-sm shadow-adv-gold/10'
                  : isActive
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal shadow-sm shadow-adv-teal/10'
                  : level.iterative
                  ? 'border-adv-gold/30 bg-adv-card text-adv-gray hover:border-adv-gold/60 hover:text-adv-gold'
                  : 'border-border bg-adv-card text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
              }`}
              title={level.description}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[11px] font-medium leading-tight">{level.label}</span>
              {level.iterative && (
                <span className="text-[9px] font-semibold uppercase tracking-wider text-adv-gold/80">
                  IRE
                </span>
              )}
            </button>
          );
        })}
      </div>
      {note && (
        <p className="mt-2 rounded-md border border-adv-blue/20 bg-adv-blue/5 px-3 py-2 text-xs text-adv-blue">
          {note}
        </p>
      )}
      {value === 'deep_investigate' && (
        <p className="mt-2 rounded-md border border-adv-gold/20 bg-adv-gold/5 px-3 py-2 text-xs text-adv-gold">
          Deep mode uses the Iterative Reasoning Engine — 6 reasoning phases before synthesising. Expect 3–5× longer processing time and higher token cost. Best for critical regulatory analysis, gap assessments, and high-stakes legal research.
        </p>
      )}
    </div>
  );
}

export default memo(ThinkingControls);
