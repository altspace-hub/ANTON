import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Target, Shield, Scale, Calendar, Eye,
  Plus, Trash2, Check, X, Loader2, Save, AlertTriangle,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

// ── Types ──────────────────────────────────────────────────────────────────

interface GoalsProfile {
  user_id: string;
  today_focus: string[];
  this_week_goals: string[];
  this_month_goals: string[];
  this_year_goals: string[];
  this_decade_vision: string;
}

interface DomainStrategy {
  id: string;
  domain: string;
  strategy_type: string;
  strategy_label: string | null;
  parameters: Record<string, unknown>;
  atom_weights: Record<string, number>;
  is_active: number;
}

interface ValuesConstraint {
  id: string;
  name: string;
  description: string | null;
  constraint_type: string;
  scope: string;
  value: string;
  enforcement: string;
  is_active: number;
}

interface ConflictRule {
  id: string;
  conflict_type: string;
  resolution: string;
  custom_logic: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STRATEGY_TYPES = [
  { value: 'growth', label: 'Growth', desc: 'Focus on high-growth opportunities' },
  { value: 'value', label: 'Value', desc: 'Seek undervalued assets' },
  { value: 'income', label: 'Income', desc: 'Prioritise dividend yield and cash flow' },
  { value: 'momentum', label: 'Momentum', desc: 'Follow trending signals' },
  { value: 'contrarian', label: 'Contrarian', desc: 'Go against market consensus' },
  { value: 'balanced', label: 'Balanced', desc: 'Even mix across signal types' },
  { value: 'custom', label: 'Custom', desc: 'Define your own atom weights' },
];

const ATOM_WEIGHT_KEYS = [
  { key: 'signal', label: 'Signals' },
  { key: 'fact', label: 'Facts' },
  { key: 'opinion', label: 'Opinions' },
  { key: 'prediction', label: 'Predictions' },
  { key: 'rumor', label: 'Rumours' },
];

const ESG_PRESETS: Array<{ name: string; constraintType: string; value: string; description: string }> = [
  { name: 'No Fossil Fuels', constraintType: 'exclude_category', value: 'fossil_fuels', description: 'Exclude fossil fuel companies' },
  { name: 'No Weapons', constraintType: 'exclude_category', value: 'weapons', description: 'Exclude weapons manufacturers' },
  { name: 'No Tobacco', constraintType: 'exclude_category', value: 'tobacco', description: 'Exclude tobacco companies' },
  { name: 'No Gambling', constraintType: 'exclude_category', value: 'gambling', description: 'Exclude gambling companies' },
  { name: 'ESG Score > 50', constraintType: 'min_score', value: '50', description: 'Require minimum ESG score of 50' },
  { name: 'Carbon Intensity Cap', constraintType: 'max_metric', value: 'carbon_intensity:100', description: 'Cap carbon intensity at 100 tCO2e/$M' },
];

const CONFLICT_TYPES = [
  { type: 'short_vs_long', label: 'Short-term vs Long-term', desc: 'When a short-term gain conflicts with a long-term goal' },
  { type: 'risk_vs_return', label: 'Risk vs Return', desc: 'When higher returns require violating risk constraints' },
  { type: 'values_vs_profit', label: 'Values vs Profit', desc: 'When a profitable opportunity conflicts with values constraints' },
  { type: 'strategy_vs_signal', label: 'Strategy vs Signal', desc: 'When market signals contradict your chosen strategy' },
];

const RESOLUTION_OPTIONS = [
  { value: 'prefer_long_term', label: 'Prefer long-term goals' },
  { value: 'prefer_short_term', label: 'Prefer short-term goals' },
  { value: 'prefer_values', label: 'Always honour values' },
  { value: 'prefer_profit', label: 'Prefer profit' },
  { value: 'balanced', label: 'Balanced compromise' },
  { value: 'flag_for_review', label: 'Flag for manual review' },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function MarketGoalsProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Goals Profile state
  const [profile, setProfile] = useState<GoalsProfile>({
    user_id: 'default',
    today_focus: [],
    this_week_goals: [],
    this_month_goals: [],
    this_year_goals: [],
    this_decade_vision: '',
  });
  const [todayText, setTodayText] = useState('');
  const [weekText, setWeekText] = useState('');
  const [monthText, setMonthText] = useState('');
  const [yearText, setYearText] = useState('');
  const [decadeText, setDecadeText] = useState('');

  // Domain Strategy state
  const [strategies, setStrategies] = useState<DomainStrategy[]>([]);
  const [newStrategyType, setNewStrategyType] = useState('balanced');
  const [atomWeights, setAtomWeights] = useState<Record<string, number>>({
    signal: 1.0, fact: 1.0, opinion: 0.5, prediction: 0.8, rumor: 0.3,
  });

  // Values Constraints state
  const [constraints, setConstraints] = useState<ValuesConstraint[]>([]);
  const [showAddConstraint, setShowAddConstraint] = useState(false);
  const [newConstraintName, setNewConstraintName] = useState('');
  const [newConstraintType, setNewConstraintType] = useState('exclude_entity');
  const [newConstraintValue, setNewConstraintValue] = useState('');
  const [newConstraintEnforcement, setNewConstraintEnforcement] = useState('hard');

  // Conflict Rules state
  const [conflictRules, setConflictRules] = useState<ConflictRule[]>([]);

  // Pending Conflicts state
  const [pendingConflicts, setPendingConflicts] = useState<any[]>([]);

  // Debounce ref for text saves
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch all data ──────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, strategiesRes, constraintsRes, rulesRes, conflictsRes] = await Promise.all([
        fetchWithAuth('/api/goals-profile'),
        fetchWithAuth('/api/domain-strategies'),
        fetchWithAuth('/api/values-constraints'),
        fetchWithAuth('/api/conflict-rules'),
        fetchWithAuth('/api/pending-conflicts'),
      ]);

      if (profileRes.ok) {
        const p = await profileRes.json() as GoalsProfile;
        setProfile(p);
        setTodayText((p.today_focus || []).join('\n'));
        setWeekText((p.this_week_goals || []).join('\n'));
        setMonthText((p.this_month_goals || []).join('\n'));
        setYearText((p.this_year_goals || []).join('\n'));
        setDecadeText(p.this_decade_vision || '');
      }

      if (strategiesRes.ok) {
        const s = await strategiesRes.json() as DomainStrategy[];
        setStrategies(s);
        const active = s.find(st => st.is_active);
        if (active) {
          setNewStrategyType(active.strategy_type);
          if (active.atom_weights && Object.keys(active.atom_weights).length > 0) {
            setAtomWeights(prev => ({ ...prev, ...active.atom_weights }));
          }
        }
      }

      if (constraintsRes.ok) {
        setConstraints(await constraintsRes.json() as ValuesConstraint[]);
      }

      if (rulesRes.ok) {
        setConflictRules(await rulesRes.json() as ConflictRule[]);
      }

      if (conflictsRes.ok) {
        const conflicts = await conflictsRes.json();
        setPendingConflicts(Array.isArray(conflicts) ? conflicts : []);
      }
    } catch (err) {
      console.error('[GoalsProfile] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Save Goals (debounced) ──────────────────────────────────────────────

  const saveGoals = useCallback(async (field: string, value: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const body: Record<string, unknown> = {};
        if (field === 'this_decade_vision') {
          body[field] = value;
        } else {
          body[field] = value.split('\n').map(l => l.trim()).filter(Boolean);
        }
        await fetchWithAuth('/api/goals-profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error('[GoalsProfile] Save error:', err);
      } finally {
        setSaving(false);
      }
    }, 800);
  }, []);

  // ── Save Strategy ───────────────────────────────────────────────────────

  const handleSaveStrategy = async () => {
    setSaving(true);
    try {
      await fetchWithAuth('/api/domain-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'finance',
          strategyType: newStrategyType,
          strategyLabel: STRATEGY_TYPES.find(s => s.value === newStrategyType)?.label || newStrategyType,
          atomWeights,
        }),
      });
      const res = await fetchWithAuth('/api/domain-strategies');
      if (res.ok) setStrategies(await res.json() as DomainStrategy[]);
    } catch (err) {
      console.error('[GoalsProfile] Strategy save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Add Constraint ──────────────────────────────────────────────────────

  const handleAddConstraint = async () => {
    if (!newConstraintName.trim() || !newConstraintValue.trim()) return;
    try {
      await fetchWithAuth('/api/values-constraints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newConstraintName.trim(),
          constraintType: newConstraintType,
          value: newConstraintValue.trim(),
          enforcement: newConstraintEnforcement,
          scope: 'finance',
        }),
      });
      setShowAddConstraint(false);
      setNewConstraintName('');
      setNewConstraintValue('');
      const res = await fetchWithAuth('/api/values-constraints');
      if (res.ok) setConstraints(await res.json() as ValuesConstraint[]);
    } catch (err) {
      console.error('[GoalsProfile] Constraint add error:', err);
    }
  };

  const handleAddPreset = async (preset: typeof ESG_PRESETS[number]) => {
    try {
      await fetchWithAuth('/api/values-constraints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: preset.name,
          description: preset.description,
          constraintType: preset.constraintType,
          value: preset.value,
          enforcement: 'hard',
          scope: 'finance',
        }),
      });
      const res = await fetchWithAuth('/api/values-constraints');
      if (res.ok) setConstraints(await res.json() as ValuesConstraint[]);
    } catch (err) {
      console.error('[GoalsProfile] Preset add error:', err);
    }
  };

  const handleDeleteConstraint = async (id: string) => {
    try {
      await fetchWithAuth(`/api/values-constraints/${id}`, { method: 'DELETE' });
      setConstraints(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('[GoalsProfile] Constraint delete error:', err);
    }
  };

  // ── Update Conflict Rule ────────────────────────────────────────────────

  const handleUpdateConflictRule = async (ruleId: string, resolution: string) => {
    try {
      await fetchWithAuth(`/api/conflict-rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });
      setConflictRules(prev => prev.map(r => r.id === ruleId ? { ...r, resolution } : r));
    } catch (err) {
      console.error('[GoalsProfile] Conflict rule update error:', err);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-adv-teal animate-spin" />
        <span className="ml-2 text-adv-gray text-sm">Loading goals profile...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/markets')}
            className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <Target className="h-6 w-6 text-adv-teal" />
              Goals & Values Profile
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">
              Define your time horizons, investment strategy, and values constraints — injected into every market decision
            </p>
          </div>
        </div>
        {saving && (
          <div className="flex items-center gap-2 text-xs text-adv-teal">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving...
          </div>
        )}
      </div>

      <MarketDisclaimer compact />

      {/* Pending Conflicts */}
      {pendingConflicts.length > 0 && (
        <div className="rounded-xl border border-adv-gold/30 bg-adv-card p-5">
          <h2 className="text-lg font-semibold text-adv-gold flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5" /> Pending Conflicts ({pendingConflicts.length})
          </h2>
          <div className="space-y-3">
            {pendingConflicts.map(c => (
              <div key={c.id} className="rounded-lg border border-adv-dark bg-adv-dark-2 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-adv-gray">{c.trigger_type} — {new Date(c.created_at).toLocaleString()}</span>
                  <span className="text-xs text-adv-gold">{c.conflicts_detected} conflict(s)</span>
                </div>
                {c.resolution && <p className="text-sm text-adv-off-white mb-3">{c.resolution}</p>}
                <div className="flex gap-2">
                  <button onClick={async () => {
                    await fetchWithAuth(`/api/temporal-log/${c.id}/resolve`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accepted' }) });
                    setPendingConflicts(prev => prev.filter(p => p.id !== c.id));
                  }} className="rounded px-3 py-1 text-xs bg-adv-green/20 text-adv-green hover:bg-adv-green/30">Accept</button>
                  <button onClick={async () => {
                    await fetchWithAuth(`/api/temporal-log/${c.id}/resolve`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dismissed' }) });
                    setPendingConflicts(prev => prev.filter(p => p.id !== c.id));
                  }} className="rounded px-3 py-1 text-xs bg-adv-gray/20 text-adv-gray hover:bg-adv-gray/30">Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 1: Time Horizons */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="h-5 w-5 text-adv-blue" />
          <h2 className="text-lg font-semibold text-adv-off-white">Time Horizons</h2>
        </div>
        <p className="text-xs text-adv-gray">
          Set goals for each time horizon. Every market decision will be evaluated against these. One goal per line.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-adv-teal mb-1">Today's Focus</label>
            <textarea
              value={todayText}
              onChange={(e) => { setTodayText(e.target.value); saveGoals('today_focus', e.target.value); }}
              rows={3}
              placeholder="What matters most today? (one per line)"
              className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-adv-teal mb-1">This Week's Goals</label>
            <textarea
              value={weekText}
              onChange={(e) => { setWeekText(e.target.value); saveGoals('this_week_goals', e.target.value); }}
              rows={3}
              placeholder="Key objectives for this week (one per line)"
              className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-adv-gold mb-1">This Month's Goals</label>
            <textarea
              value={monthText}
              onChange={(e) => { setMonthText(e.target.value); saveGoals('this_month_goals', e.target.value); }}
              rows={3}
              placeholder="What should be achieved this month? (one per line)"
              className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-adv-gold mb-1">This Year's Goals</label>
            <textarea
              value={yearText}
              onChange={(e) => { setYearText(e.target.value); saveGoals('this_year_goals', e.target.value); }}
              rows={3}
              placeholder="Annual targets and milestones (one per line)"
              className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal resize-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-purple-400 mb-1">This Decade's Vision</label>
          <textarea
            value={decadeText}
            onChange={(e) => { setDecadeText(e.target.value); saveGoals('this_decade_vision', e.target.value); }}
            rows={3}
            placeholder="Where do you want to be in 10 years? What kind of portfolio? What financial freedom looks like?"
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal resize-none"
          />
        </div>
      </div>

      {/* Section 2: Investment Strategy */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Eye className="h-5 w-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-adv-off-white">Investment Strategy</h2>
        </div>
        <p className="text-xs text-adv-gray">
          Select a strategy type and adjust how different market atom types are weighted in your analysis.
        </p>

        <div>
          <label className="block text-xs font-medium text-adv-gray mb-1">Strategy Type</label>
          <select
            value={newStrategyType}
            onChange={(e) => setNewStrategyType(e.target.value)}
            className="w-full max-w-md rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
          >
            {STRATEGY_TYPES.map((s) => (
              <option key={s.value} value={s.value}>{s.label} -- {s.desc}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-adv-gray mb-2">Atom Weight Sliders</label>
          <p className="text-xs text-adv-gray mb-3">
            Control how strongly each atom type influences decisions. 0 = ignore, 1 = normal, 2 = double weight.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {ATOM_WEIGHT_KEYS.map((aw) => (
              <div key={aw.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-adv-off-white">{aw.label}</span>
                  <span className="text-xs text-adv-teal font-mono">{(atomWeights[aw.key] ?? 1.0).toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={atomWeights[aw.key] ?? 1.0}
                  onChange={(e) => setAtomWeights(prev => ({ ...prev, [aw.key]: parseFloat(e.target.value) }))}
                  className="w-full accent-adv-teal"
                />
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSaveStrategy}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          Save Strategy
        </button>

        {strategies.length > 0 && (
          <div className="mt-3 pt-3 border-t border-adv-dark">
            <p className="text-xs text-adv-gray mb-2">Saved strategies:</p>
            <div className="flex flex-wrap gap-2">
              {strategies.map((s) => (
                <span
                  key={s.id}
                  className={`rounded-full px-3 py-1 text-xs ${
                    s.is_active
                      ? 'bg-adv-teal/15 text-adv-teal border border-adv-teal/30'
                      : 'bg-adv-dark text-adv-gray border border-adv-dark'
                  }`}
                >
                  {s.strategy_label || s.strategy_type} ({s.domain})
                  {s.is_active ? ' (active)' : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Values Constraints */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-adv-green" />
            <h2 className="text-lg font-semibold text-adv-off-white">Values Constraints</h2>
          </div>
          <button
            onClick={() => setShowAddConstraint(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Constraint
          </button>
        </div>
        <p className="text-xs text-adv-gray">
          Define what you will not invest in. Hard constraints are never violated; soft constraints generate warnings.
        </p>

        {/* ESG Preset Buttons */}
        <div>
          <p className="text-xs font-medium text-adv-gray mb-2">Quick presets (ESG):</p>
          <div className="flex flex-wrap gap-2">
            {ESG_PRESETS.map((preset) => {
              const alreadyAdded = constraints.some(c => c.name === preset.name);
              return (
                <button
                  key={preset.name}
                  onClick={() => !alreadyAdded && handleAddPreset(preset)}
                  disabled={alreadyAdded}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    alreadyAdded
                      ? 'bg-adv-green/10 text-adv-green border border-adv-green/30 cursor-default'
                      : 'bg-adv-dark border border-adv-dark text-adv-gray hover:text-adv-teal hover:border-adv-teal'
                  }`}
                >
                  {alreadyAdded && <Check className="h-3 w-3 inline mr-1" />}
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Add Constraint Form */}
        {showAddConstraint && (
          <div className="rounded-lg border border-adv-teal/30 bg-adv-dark-2 p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-adv-gray mb-1">Name</label>
                <input
                  type="text"
                  value={newConstraintName}
                  onChange={(e) => setNewConstraintName(e.target.value)}
                  placeholder="e.g. No Coal Mining"
                  className="w-full rounded-lg border border-adv-dark bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-adv-gray mb-1">Type</label>
                <select
                  value={newConstraintType}
                  onChange={(e) => setNewConstraintType(e.target.value)}
                  className="w-full rounded-lg border border-adv-dark bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
                >
                  <option value="exclude_entity">Exclude Entity</option>
                  <option value="exclude_category">Exclude Category</option>
                  <option value="exclude_sector">Exclude Sector</option>
                  <option value="min_score">Minimum Score</option>
                  <option value="max_metric">Maximum Metric</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-adv-gray mb-1">Value</label>
                <input
                  type="text"
                  value={newConstraintValue}
                  onChange={(e) => setNewConstraintValue(e.target.value)}
                  placeholder="Entity name, category, or threshold"
                  className="w-full rounded-lg border border-adv-dark bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-adv-gray mb-1">Enforcement</label>
                <select
                  value={newConstraintEnforcement}
                  onChange={(e) => setNewConstraintEnforcement(e.target.value)}
                  className="w-full rounded-lg border border-adv-dark bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
                >
                  <option value="hard">Hard (never violate)</option>
                  <option value="soft">Soft (warn only)</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddConstraint}
                disabled={!newConstraintName.trim() || !newConstraintValue.trim()}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Add
              </button>
              <button
                onClick={() => setShowAddConstraint(false)}
                className="flex items-center gap-2 rounded-lg border border-adv-dark px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Constraints List */}
        {constraints.length === 0 ? (
          <p className="text-sm text-adv-gray py-4 text-center">No values constraints defined yet. Add presets above or create custom constraints.</p>
        ) : (
          <div className="space-y-2">
            {constraints.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-adv-dark bg-adv-dark-2 px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <Shield className={`h-4 w-4 ${c.enforcement === 'hard' ? 'text-adv-red' : 'text-adv-gold'}`} />
                  <div>
                    <span className="text-sm text-adv-off-white">{c.name}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-adv-gray">{c.constraint_type.replace('_', ' ')}</span>
                      <span className="text-xs text-adv-gray">|</span>
                      <span className="text-xs text-adv-gray">{c.value}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        c.enforcement === 'hard' ? 'bg-adv-red/10 text-adv-red' : 'bg-adv-gold/10 text-adv-gold'
                      }`}>
                        {c.enforcement}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteConstraint(c.id)}
                  className="rounded-lg border border-adv-dark px-2 py-1.5 text-xs text-adv-gray hover:text-adv-red hover:border-adv-red transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 4: Conflict Resolution */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Scale className="h-5 w-5 text-adv-gold" />
          <h2 className="text-lg font-semibold text-adv-off-white">Conflict Resolution</h2>
        </div>
        <p className="text-xs text-adv-gray">
          When goals, values, or strategy conflict with each other, how should the system resolve it?
        </p>

        <div className="space-y-4">
          {CONFLICT_TYPES.map((ct) => {
            const rule = conflictRules.find(r => r.conflict_type === ct.type);
            const currentResolution = rule?.resolution || 'flag_for_review';

            return (
              <div key={ct.type} className="rounded-lg border border-adv-dark bg-adv-dark-2 p-4">
                <div className="mb-2">
                  <h3 className="text-sm font-medium text-adv-off-white">{ct.label}</h3>
                  <p className="text-xs text-adv-gray">{ct.desc}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {RESOLUTION_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs cursor-pointer transition-colors ${
                        currentResolution === opt.value
                          ? 'bg-adv-teal/15 text-adv-teal border border-adv-teal/30'
                          : 'bg-adv-dark text-adv-gray border border-adv-dark hover:border-adv-teal/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`conflict-${ct.type}`}
                        value={opt.value}
                        checked={currentResolution === opt.value}
                        onChange={() => rule && handleUpdateConflictRule(rule.id, opt.value)}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
