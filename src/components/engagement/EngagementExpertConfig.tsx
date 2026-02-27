/**
 * EngagementExpertConfig.tsx
 * Phase 4: Expert & Mode Configuration
 * Configure thinking depth, expert personas, and review lenses before resource collection.
 */

import { useState } from 'react';
import {
  Brain, Users, Eye, ChevronRight, CheckCircle, Loader2, Info,
  Zap, Lightbulb, Search, Microscope, BarChart2
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import type { EngagementData } from '@/pages/EngagementWorkspacePage';

interface Props {
  engagement: EngagementData;
  onUpdate: (updates: Partial<EngagementData>) => void;
  onNext: () => void;
  onReload: () => void;
}

type ThinkingLevel = 'quick' | 'think' | 'think_hard' | 'investigate';

interface ThinkingOption {
  id: ThinkingLevel;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  model: string;
  badge?: string;
}

const THINKING_OPTIONS: ThinkingOption[] = [
  {
    id: 'quick',
    label: 'Quick',
    description: 'Fast responses using Claude Haiku. Best for simple reviews and quick checks.',
    icon: Zap,
    model: 'Haiku',
  },
  {
    id: 'think',
    label: 'Think',
    description: 'Standard deep reasoning with Opus. Good for most engagement types.',
    icon: Lightbulb,
    model: 'Opus 4.6',
    badge: 'Default',
  },
  {
    id: 'think_hard',
    label: 'Think Hard',
    description: 'Extended reasoning mode. Best for complex regulatory analysis.',
    icon: Brain,
    model: 'Opus 4.6',
  },
  {
    id: 'investigate',
    label: 'Investigate',
    description: 'Maximum reasoning depth. Use for high-stakes deliverables and difficult gap analyses.',
    icon: Microscope,
    model: 'Opus 4.6',
    badge: 'Recommended',
  },
];

const EXPERT_PERSONAS = [
  { id: 'aml_specialist',       label: 'AML Specialist',           color: 'bg-adv-teal/10 text-adv-teal border-adv-teal/30' },
  { id: 'sanctions_expert',     label: 'Sanctions Expert',         color: 'bg-adv-blue/10 text-adv-blue border-adv-blue/30' },
  { id: 'regulatory_counsel',   label: 'Regulatory Counsel',       color: 'bg-adv-gold/10 text-adv-gold border-adv-gold/30' },
  { id: 'risk_manager',         label: 'Risk Manager',             color: 'bg-adv-green/10 text-adv-green border-adv-green/30' },
  { id: 'compliance_officer',   label: 'Compliance Officer',       color: 'bg-adv-teal/10 text-adv-teal border-adv-teal/30' },
  { id: 'data_analyst',         label: 'Data Analyst',             color: 'bg-adv-blue/10 text-adv-blue border-adv-blue/30' },
  { id: 'technology_architect', label: 'Technology Architect',     color: 'bg-adv-gray/10 text-adv-gray border-adv-gray/30' },
  { id: 'governance_advisor',   label: 'Governance Advisor',       color: 'bg-adv-gold/10 text-adv-gold border-adv-gold/30' },
  { id: 'fcp_lead',             label: 'FCP Lead',                 color: 'bg-adv-teal/10 text-adv-teal border-adv-teal/30' },
  { id: 'business_analyst',     label: 'Business Analyst',         color: 'bg-adv-green/10 text-adv-green border-adv-green/30' },
];

const REVIEW_LENSES = [
  { id: 'regulatory_accuracy',   label: 'Regulatory Accuracy',   description: 'Does it meet the legal and regulatory standard?' },
  { id: 'commercial_pragmatism', label: 'Commercial Pragmatism', description: 'Is it implementable and proportionate?' },
  { id: 'technical_feasibility', label: 'Technical Feasibility', description: 'Can systems and data support this?' },
  { id: 'governance_structure',  label: 'Governance Structure',  description: 'Are roles, escalation, and oversight clear?' },
  { id: 'risk_proportionality',  label: 'Risk Proportionality',  description: 'Are controls proportionate to actual risk?' },
  { id: 'client_maturity',       label: 'Client Maturity',       description: 'Does the recommendation match client capability?' },
];

export default function EngagementExpertConfig({ engagement, onUpdate, onNext, onReload }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Parse existing values
  const parseJson = (val: string | undefined, fallback: unknown) => {
    try { return JSON.parse(val || '') ?? fallback; } catch { return fallback; }
  };

  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(
    (engagement.thinking_level as ThinkingLevel) || 'investigate'
  );
  const [expertPanel, setExpertPanel] = useState<string[]>(
    parseJson(engagement.expert_panel, [])
  );
  const [reviewLenses, setReviewLenses] = useState<string[]>(
    parseJson(((engagement as unknown) as Record<string, unknown>).review_modes as string, ['regulatory_accuracy', 'commercial_pragmatism'])
  );

  function toggleExpert(id: string) {
    setExpertPanel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setSaved(false);
  }

  function toggleLens(id: string) {
    setReviewLenses(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/engagements/${engagement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          thinking_level: thinkingLevel,
          expert_panel: expertPanel,
          review_modes: reviewLenses,
        }),
      });
      onUpdate({ thinking_level: thinkingLevel, expert_panel: JSON.stringify(expertPanel) });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function saveAndNext() {
    await save();
    onNext();
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Phase 4</p>
        <h2 className="text-xl font-bold text-adv-white">Expert & Mode Configuration</h2>
        <p className="mt-1 text-sm text-adv-gray">
          Configure how ANTON will approach this engagement — the depth of reasoning, which expert perspectives to apply, and what lenses to review outputs through.
        </p>
      </div>

      {/* Thinking level */}
      <div className="bg-adv-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-adv-teal" />
          <h3 className="text-sm font-semibold text-adv-off-white">Reasoning Depth</h3>
          <span className="ml-auto text-xs text-adv-gray-med flex items-center gap-1">
            <Info className="h-3 w-3" />
            Controls Claude model &amp; thinking budget
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {THINKING_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const isSelected = thinkingLevel === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => { setThinkingLevel(opt.id); setSaved(false); }}
                className={`relative flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-adv-teal bg-adv-teal-dim'
                    : 'border-border hover:border-adv-teal/40 hover:bg-adv-dark-2/40'
                }`}
              >
                {opt.badge && (
                  <span className="absolute top-2 right-2 text-[9px] bg-adv-teal/20 text-adv-teal border border-adv-teal/30 rounded px-1.5 py-0.5">
                    {opt.badge}
                  </span>
                )}
                <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${isSelected ? 'text-adv-teal' : 'text-adv-gray-med'}`} />
                <div>
                  <p className={`text-sm font-medium ${isSelected ? 'text-adv-teal' : 'text-adv-off-white'}`}>{opt.label}</p>
                  <p className="text-[11px] text-adv-gray mt-0.5 leading-snug">{opt.description}</p>
                  <p className="text-[10px] text-adv-gray-med mt-1">Model: {opt.model}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Expert panel */}
      <div className="bg-adv-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-adv-teal" />
          <h3 className="text-sm font-semibold text-adv-off-white">Expert Panel</h3>
          <span className="text-xs text-adv-gray-med ml-1">— which expert hats should ANTON wear?</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXPERT_PERSONAS.map(ep => {
            const isSelected = expertPanel.includes(ep.id);
            return (
              <button
                key={ep.id}
                onClick={() => toggleExpert(ep.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                  isSelected ? ep.color : 'text-adv-gray-med border-border hover:border-adv-teal/40 hover:text-adv-off-white'
                }`}
              >
                {isSelected && <span className="mr-1">✓</span>}
                {ep.label}
              </button>
            );
          })}
        </div>
        {expertPanel.length === 0 && (
          <p className="text-xs text-adv-gray-med italic">No experts selected — ANTON will apply general compliance expertise.</p>
        )}
      </div>

      {/* Review lenses */}
      <div className="bg-adv-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-adv-teal" />
          <h3 className="text-sm font-semibold text-adv-off-white">Review Lenses</h3>
          <span className="text-xs text-adv-gray-med ml-1">— which dimensions should outputs be evaluated against?</span>
        </div>
        <div className="space-y-2">
          {REVIEW_LENSES.map(lens => {
            const isSelected = reviewLenses.includes(lens.id);
            return (
              <button
                key={lens.id}
                onClick={() => toggleLens(lens.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left transition-all ${
                  isSelected ? 'border-adv-teal bg-adv-teal-dim' : 'border-border hover:border-adv-teal/30'
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-adv-teal border-adv-teal' : 'border-adv-gray-med'}`}>
                  {isSelected && <CheckCircle className="h-3 w-3 text-adv-dark" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isSelected ? 'text-adv-teal' : 'text-adv-off-white'}`}>{lens.label}</p>
                  <p className="text-xs text-adv-gray">{lens.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary + Save */}
      <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-adv-teal" />
          <p className="text-sm font-medium text-adv-teal">Configuration Summary</p>
        </div>
        <div className="text-xs text-adv-gray space-y-1">
          <p>Reasoning: <span className="text-adv-off-white">{THINKING_OPTIONS.find(o => o.id === thinkingLevel)?.label}</span> — {THINKING_OPTIONS.find(o => o.id === thinkingLevel)?.model}</p>
          <p>Expert panel: <span className="text-adv-off-white">{expertPanel.length > 0 ? expertPanel.map(id => EXPERT_PERSONAS.find(e => e.id === id)?.label).join(', ') : 'General compliance'}</span></p>
          <p>Review lenses: <span className="text-adv-off-white">{reviewLenses.length > 0 ? reviewLenses.map(id => REVIEW_LENSES.find(l => l.id === id)?.label).join(', ') : 'None selected'}</span></p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 justify-end pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-adv-gray hover:text-adv-off-white hover:border-adv-teal/40 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle className="h-3.5 w-3.5 text-adv-green" /> : null}
          {saved ? 'Saved' : 'Save'}
        </button>
        <button
          onClick={saveAndNext}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
        >
          Continue to Resources
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
