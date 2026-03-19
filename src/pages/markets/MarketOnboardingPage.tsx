import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, TrendingUp, Target, Landmark, Shield, Scale,
  ChevronLeft, ChevronRight, Rocket, Loader2, Check, Pencil,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

type Timeline = 'short' | 'medium' | 'standard' | 'long';
type RiskTolerance = 'conservative' | 'moderate' | 'aggressive' | 'very_aggressive';

interface ValueChip {
  label: string;
  constraintType: string;
  value: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TIMELINE_OPTIONS: Array<{ key: Timeline; label: string; sub: string; icon: typeof Zap }> = [
  { key: 'short', label: 'Short-Term (3 years)', sub: 'Active trading, higher risk tolerance', icon: Zap },
  { key: 'medium', label: 'Medium (5 years)', sub: 'Balanced growth and income', icon: TrendingUp },
  { key: 'standard', label: 'Standard (10 years)', sub: 'Long-term wealth building', icon: Target },
  { key: 'long', label: 'Long-Term (20+ years)', sub: 'Retirement, generational wealth', icon: Landmark },
];

const VALUE_CHIPS: ValueChip[] = [
  { label: 'No Fossil Fuels', constraintType: 'exclude_sector', value: 'fossil_fuels' },
  { label: 'No Weapons', constraintType: 'exclude_theme', value: 'weapons' },
  { label: 'No Tobacco', constraintType: 'exclude_sector', value: 'tobacco' },
  { label: 'No Gambling', constraintType: 'exclude_sector', value: 'gambling' },
  { label: 'No Alcohol', constraintType: 'exclude_sector', value: 'alcohol' },
  { label: 'No Animal Testing', constraintType: 'exclude_theme', value: 'animal_testing' },
  { label: 'Prefer Green Tech', constraintType: 'prefer_sector', value: 'green_tech' },
  { label: 'Prefer Healthcare', constraintType: 'prefer_sector', value: 'healthcare' },
];

const RISK_OPTIONS: Array<{ key: RiskTolerance; label: string; desc: string; icon: typeof Shield }> = [
  { key: 'conservative', label: 'Conservative', desc: "I prefer safety over growth. Losing 10% would keep me up at night.", icon: Shield },
  { key: 'moderate', label: 'Moderate', desc: "I can handle some ups and downs for better long-term returns.", icon: Scale },
  { key: 'aggressive', label: 'Aggressive', desc: "I'm comfortable with 30%+ drops if it means higher returns.", icon: TrendingUp },
  { key: 'very_aggressive', label: 'Very Aggressive', desc: 'Maximum growth. I can stomach any volatility.', icon: Zap },
];

const STRATEGY_MAP: Record<RiskTolerance, { type: string; label: string; weights: Record<string, number> }> = {
  conservative: { type: 'conservative', label: 'Capital preservation with steady income', weights: { fact: 1.5, signal: 0.5, prediction: 0.5, event: 1.0 } },
  moderate: { type: 'balanced', label: 'Balanced growth with managed risk', weights: { fact: 1.0, signal: 1.0, prediction: 1.0, event: 1.0 } },
  aggressive: { type: 'growth', label: 'Growth-focused with higher volatility tolerance', weights: { fact: 0.8, signal: 1.5, prediction: 1.5, event: 1.2 } },
  very_aggressive: { type: 'momentum', label: 'Maximum growth, momentum-driven', weights: { fact: 0.5, signal: 2.0, prediction: 1.5, event: 1.0 } },
};

const STEP_LABELS = ['Timeline', 'Values', 'Risk', 'Goals', 'Review'];

// ── Component ──────────────────────────────────────────────────────────────

export default function MarketOnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 0: Timeline
  const [timeline, setTimeline] = useState<Timeline | null>(null);

  // Step 1: Values
  const [selectedValues, setSelectedValues] = useState<Set<number>>(new Set());

  // Step 2: Risk
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance | null>(null);

  // Step 3: Goals
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [yearGoals, setYearGoals] = useState('');
  const [decadeVision, setDecadeVision] = useState('');

  // ── Navigation ──

  const canNext = (): boolean => {
    switch (step) {
      case 0: return timeline !== null;
      case 1: return true; // values are optional
      case 2: return riskTolerance !== null;
      case 3: return true; // goals are optional
      case 4: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < 4 && canNext()) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const toggleValue = (idx: number) => {
    setSelectedValues(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ── Submit ──

  const handleSubmit = async () => {
    if (!timeline || !riskTolerance) return;
    setSubmitting(true);
    setError(null);

    try {
      // 1. Save goals profile
      await fetchWithAuth('/api/goals-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          this_year_goals: yearGoals ? [yearGoals] : [],
          this_decade_vision: decadeVision,
          risk_tolerance: riskTolerance,
          investment_timeline: timeline,
          monthly_investment: monthlyAmount ? parseFloat(monthlyAmount) : 0,
          onboarding_completed: true,
        }),
      });

      // 2. Save values constraints
      const valuesArr = Array.from(selectedValues).map(idx => VALUE_CHIPS[idx]);
      for (const v of valuesArr) {
        await fetchWithAuth('/api/values-constraints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: v.label,
            constraintType: v.constraintType,
            value: v.value,
            enforcement: 'hard',
            scope: 'finance',
          }),
        });
      }

      // 3. Save strategy based on risk tolerance
      const strategy = STRATEGY_MAP[riskTolerance];
      await fetchWithAuth('/api/domain-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'finance',
          strategyType: strategy.type,
          strategyLabel: strategy.label,
          atomWeights: strategy.weights,
        }),
      });

      navigate('/markets');
    } catch (err) {
      console.error('[MarketOnboarding] Submit error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Renderers per step ──

  const renderTimeline = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-adv-off-white">Investment Timeline</h2>
      <p className="text-sm text-adv-gray">How long do you plan to invest? This shapes your risk profile and strategy.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {TIMELINE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = timeline === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setTimeline(opt.key)}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 p-6 text-center transition-all ${
                selected
                  ? 'border-adv-teal bg-adv-teal/10'
                  : 'border-adv-card bg-adv-card hover:border-adv-teal/40'
              }`}
            >
              <Icon className={`h-8 w-8 ${selected ? 'text-adv-teal' : 'text-adv-gray'}`} />
              <div>
                <div className={`text-base font-semibold ${selected ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                  {opt.label}
                </div>
                <div className="text-xs text-adv-gray mt-1">{opt.sub}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderValues = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-adv-off-white">Values & Exclusions</h2>
      <p className="text-sm text-adv-gray">Select any sectors or themes you want to exclude or prefer. These are optional.</p>
      <div className="flex flex-wrap gap-3 mt-4">
        {VALUE_CHIPS.map((chip, idx) => {
          const selected = selectedValues.has(idx);
          return (
            <button
              key={chip.value}
              onClick={() => toggleValue(idx)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                selected
                  ? 'bg-adv-teal text-adv-dark'
                  : 'bg-adv-card text-adv-gray border border-adv-card hover:border-adv-teal/40 hover:text-adv-off-white'
              }`}
            >
              {selected && <Check className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderRisk = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-adv-off-white">Risk Tolerance</h2>
      <p className="text-sm text-adv-gray">How much volatility can you handle?</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {RISK_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = riskTolerance === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setRiskTolerance(opt.key)}
              className={`flex items-start gap-4 rounded-xl border-2 p-5 text-left transition-all ${
                selected
                  ? 'border-adv-teal bg-adv-teal/10'
                  : 'border-adv-card bg-adv-card hover:border-adv-teal/40'
              }`}
            >
              <Icon className={`h-6 w-6 mt-0.5 shrink-0 ${selected ? 'text-adv-teal' : 'text-adv-gray'}`} />
              <div>
                <div className={`text-base font-semibold ${selected ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                  {opt.label}
                </div>
                <div className="text-sm text-adv-gray mt-1">{opt.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderGoals = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-adv-off-white">Your Goals</h2>
      <p className="text-sm text-adv-gray">Tell us about your investment plans. All fields are optional.</p>

      <div>
        <label className="block text-xs font-medium text-adv-teal mb-1">Monthly investment amount</label>
        <div className="relative max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-adv-gray">$</span>
          <input
            type="number"
            min="0"
            value={monthlyAmount}
            onChange={(e) => setMonthlyAmount(e.target.value)}
            placeholder="500"
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 pl-7 pr-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-adv-teal mb-1">What are your goals for this year?</label>
        <textarea
          value={yearGoals}
          onChange={(e) => setYearGoals(e.target.value)}
          rows={3}
          placeholder="e.g., Build emergency fund, start investing in index funds"
          className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-adv-teal mb-1">Your long-term vision</label>
        <textarea
          value={decadeVision}
          onChange={(e) => setDecadeVision(e.target.value)}
          rows={3}
          placeholder="e.g., Financial independence by 2035, retire early"
          className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal resize-none"
        />
      </div>
    </div>
  );

  const renderReview = () => {
    const timelineLabel = TIMELINE_OPTIONS.find(t => t.key === timeline)?.label || 'Not set';
    const riskLabel = RISK_OPTIONS.find(r => r.key === riskTolerance)?.label || 'Not set';
    const valuesLabels = Array.from(selectedValues).map(idx => VALUE_CHIPS[idx].label);

    return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-adv-off-white">Review & Launch</h2>
        <p className="text-sm text-adv-gray">Review your choices before launching Markets Intelligence.</p>

        {/* Timeline */}
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-adv-teal uppercase tracking-wider">Timeline</span>
            <button onClick={() => setStep(0)} className="text-xs text-adv-gray hover:text-adv-teal transition-colors flex items-center gap-1">
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
          <p className="text-sm text-adv-off-white">{timelineLabel}</p>
        </div>

        {/* Values */}
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-adv-teal uppercase tracking-wider">Values & Exclusions</span>
            <button onClick={() => setStep(1)} className="text-xs text-adv-gray hover:text-adv-teal transition-colors flex items-center gap-1">
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
          {valuesLabels.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-1">
              {valuesLabels.map(l => (
                <span key={l} className="rounded-full bg-adv-teal/15 text-adv-teal px-3 py-1 text-xs">{l}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-adv-gray">No exclusions selected</p>
          )}
        </div>

        {/* Risk */}
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-adv-teal uppercase tracking-wider">Risk Tolerance</span>
            <button onClick={() => setStep(2)} className="text-xs text-adv-gray hover:text-adv-teal transition-colors flex items-center gap-1">
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
          <p className="text-sm text-adv-off-white">{riskLabel}</p>
          {riskTolerance && (
            <p className="text-xs text-adv-gray mt-1">
              Strategy: {STRATEGY_MAP[riskTolerance].label}
            </p>
          )}
        </div>

        {/* Goals */}
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-adv-teal uppercase tracking-wider">Goals</span>
            <button onClick={() => setStep(3)} className="text-xs text-adv-gray hover:text-adv-teal transition-colors flex items-center gap-1">
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
          <div className="space-y-1 text-sm">
            {monthlyAmount && <p className="text-adv-off-white">Monthly: ${monthlyAmount}</p>}
            {yearGoals && <p className="text-adv-off-white">This year: {yearGoals}</p>}
            {decadeVision && <p className="text-adv-off-white">Vision: {decadeVision}</p>}
            {!monthlyAmount && !yearGoals && !decadeVision && (
              <p className="text-adv-gray">No goals specified</p>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-adv-red/10 border border-adv-red/30 p-3 text-sm text-adv-red">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || !timeline || !riskTolerance}
          className="w-full flex items-center justify-center gap-3 rounded-xl bg-adv-teal px-6 py-4 text-base font-bold text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Rocket className="h-5 w-5" />
              Launch Markets Intelligence
            </>
          )}
        </button>
      </div>
    );
  };

  const stepRenderers = [renderTimeline, renderValues, renderRisk, renderGoals, renderReview];

  return (
    <div className="min-h-screen p-6 flex flex-col">
      {/* Step progress indicator */}
      <div className="flex items-center justify-center gap-3 mb-8">
        {STEP_LABELS.map((label, idx) => (
          <div key={label} className="flex items-center gap-3">
            <button
              onClick={() => {
                // Allow jumping to completed steps
                if (idx <= step) setStep(idx);
              }}
              className={`flex items-center gap-2 transition-colors ${
                idx <= step ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  idx === step
                    ? 'bg-adv-teal text-adv-dark'
                    : idx < step
                      ? 'bg-adv-teal/20 text-adv-teal border border-adv-teal/40'
                      : 'bg-adv-card text-adv-gray'
                }`}
              >
                {idx < step ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:inline ${
                idx === step ? 'text-adv-teal' : idx < step ? 'text-adv-off-white' : 'text-adv-gray'
              }`}>
                {label}
              </span>
            </button>
            {idx < STEP_LABELS.length - 1 && (
              <div className={`h-px w-6 sm:w-10 ${idx < step ? 'bg-adv-teal/40' : 'bg-adv-card'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 max-w-2xl mx-auto w-full">
        {stepRenderers[step]()}
      </div>

      {/* Back / Next buttons */}
      <div className="max-w-2xl mx-auto w-full flex items-center justify-between mt-8 pt-4 border-t border-adv-card">
        <button
          onClick={handleBack}
          disabled={step === 0}
          className="flex items-center gap-2 rounded-lg border border-adv-card px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white hover:border-adv-teal/40 transition-colors disabled:opacity-30 disabled:cursor-default"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        {step < 4 && (
          <button
            onClick={handleNext}
            disabled={!canNext()}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
