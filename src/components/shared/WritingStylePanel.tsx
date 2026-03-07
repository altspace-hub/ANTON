import { useState } from 'react';
import { ChevronDown, ChevronRight, Users, BrainCog } from 'lucide-react';
import type { CreativityLevel } from '@/lib/types';
import { EXPERT_ROLES, type PersonaCategory } from '@/lib/expert-roles';
import CreativitySlider from './CreativitySlider';

interface WritingStylePanelProps {
  creativity: CreativityLevel;
  onCreativityChange: (value: CreativityLevel) => void;
  selectedPersonas: string[];
  onSelectedPersonasChange: (personas: string[]) => void;
  multiPerspective: boolean;
  onMultiPerspectiveChange: (enabled: boolean) => void;
  metaCognitiveEnabled: boolean;
  onMetaCognitiveChange: (enabled: boolean) => void;
}

const CHIP_BASE = 'rounded-lg border px-2.5 py-1 text-xs transition-colors cursor-pointer';
const CHIP_ACTIVE = 'border-adv-teal bg-adv-teal-dim text-adv-teal';
const CHIP_INACTIVE = 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white';

const CATEGORY_LABELS: Record<PersonaCategory, string> = {
  domain: 'Domain Experts',
  named: 'Named Characters',
  audience: 'Write For',
  analytical: 'Analytical Style',
};

export default function WritingStylePanel({
  creativity,
  onCreativityChange,
  selectedPersonas,
  onSelectedPersonasChange,
  multiPerspective,
  onMultiPerspectiveChange,
  metaCognitiveEnabled,
  onMetaCognitiveChange,
}: WritingStylePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [personaExpanded, setPersonaExpanded] = useState(false);

  function togglePersona(id: string) {
    if (selectedPersonas.includes(id)) {
      // Allow deselecting any persona (even if it's the last one — allow empty selection)
      onSelectedPersonasChange(selectedPersonas.filter((p) => p !== id));
    } else {
      if (selectedPersonas.length >= 3) return; // max 3 personas
      onSelectedPersonasChange([...selectedPersonas, id]);
    }
  }

  const activeDescriptions = EXPERT_ROLES
    .filter((r) => selectedPersonas.includes(r.id))
    .map((r) => r.description);

  // Group personas by category
  const grouped = (Object.keys(CATEGORY_LABELS) as PersonaCategory[]).map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    roles: EXPERT_ROLES.filter((r) => r.category === cat),
  })).filter((g) => g.roles.length > 0);

  return (
    <div className="space-y-3">
      {/* Creativity Slider */}
      <CreativitySlider value={creativity} onChange={onCreativityChange} />

      {/* Expert Persona Multi-Select — collapsible, grouped by category */}
      <div className="rounded-xl border border-border bg-adv-card">
        <button
          type="button"
          onClick={() => setPersonaExpanded(!personaExpanded)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-adv-teal" />
            <span className="text-sm font-medium text-adv-off-white">
              Persona{selectedPersonas.length > 1 ? 's' : ''}
            </span>
            {selectedPersonas.length > 0 && (
              <span className="rounded-full bg-adv-teal px-2 py-0.5 text-xs font-medium text-adv-dark">
                {selectedPersonas.length}/3
              </span>
            )}
          </div>
          {personaExpanded
            ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray" />
            : <ChevronRight className="h-3.5 w-3.5 text-adv-gray" />}
        </button>

        {personaExpanded && (
          <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
            {(() => { const atMax = selectedPersonas.length >= 3; return grouped.map(({ category, label, roles }) => (
              <div key={category}>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-gray">
                  {label}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {roles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => togglePersona(role.id)}
                      title={role.description}
                      className={`${CHIP_BASE} ${
                        selectedPersonas.includes(role.id)
                          ? CHIP_ACTIVE
                          : atMax
                          ? 'border-border bg-adv-dark text-adv-gray opacity-40 cursor-not-allowed'
                          : CHIP_INACTIVE
                      }`}
                    >
                      {role.label}
                    </button>
                  ))}
                </div>
              </div>
            )); })()}
            {activeDescriptions.length > 0 && (
              <p className="text-[11px] text-adv-gray border-t border-border pt-2">
                {activeDescriptions.join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Advanced reasoning toggles */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Reasoning options
      </button>

      {expanded && (
        <div className="space-y-3 rounded-lg border border-border bg-adv-dark-2 p-3">
          {/* Multi-perspective toggle */}
          <label className="flex cursor-pointer items-start gap-3">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={multiPerspective}
                onChange={(e) => onMultiPerspectiveChange(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-adv-dark transition-colors peer-checked:bg-adv-teal" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-adv-gray-med transition-transform peer-checked:translate-x-4 peer-checked:bg-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-sm text-adv-off-white">
                <Users className="h-3.5 w-3.5 text-adv-teal" />
                Multi-perspective analysis
              </div>
              <p className="mt-0.5 text-[11px] text-adv-gray">
                Claude analyses from multiple expert viewpoints (legal, compliance, business, regulatory) then synthesises.
              </p>
            </div>
          </label>

          {/* Meta-cognitive reasoning toggle */}
          <label className="flex cursor-pointer items-start gap-3">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={metaCognitiveEnabled}
                onChange={(e) => onMetaCognitiveChange(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-adv-dark transition-colors peer-checked:bg-adv-teal" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-adv-gray-med transition-transform peer-checked:translate-x-4 peer-checked:bg-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-sm text-adv-off-white">
                <BrainCog className="h-3.5 w-3.5 text-adv-gold" />
                Meta-cognitive reasoning
              </div>
              <p className="mt-0.5 text-[11px] text-adv-gray">
                Structured decomposition with confidence scoring. Claude verifies logic and flags low-confidence areas.
              </p>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
