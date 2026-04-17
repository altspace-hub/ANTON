// ThreatPathCard — causal-chain card view of one threat path.
// Inline scoring + control rollup + appetite picker. The spec's
// "centrepiece visual" — a board-readable summary of one path's full
// chain in a single card.

import { useState } from 'react';
import { GitBranch, ShieldOff, Shield, Gauge, Calculator, ScrollText, AlertCircle, Loader2, Check } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type AppetitePosition = 'within' | 'boundary' | 'outside' | 'unacceptable';
type ControlStrength = 'strong' | 'adequate' | 'weak';
type ControlType = 'prevent' | 'detect' | 'respond';

interface ExposureRow { id: string; name: string; category: string | null }
interface VulnRow { id: string; vuln_code: string; name: string; severity: number }
interface ControlRow { id: string; control_code: string; name: string; type: ControlType; strength: ControlStrength }
interface InherentRow { exposure_score: number; threat_score: number; vulnerability_score: number; inherent_score: number; rationale: string | null }
interface ResidualRow { residual_score: number; control_quality_rollup: string; calculated_at: string }
interface AppetiteRow { id: string; appetite_position: AppetitePosition; required_action: string | null; target_date: string | null; budget_eur: string | number | null; approved_by: string | null }

export interface ThreatPathFull {
  path: { id: string; atlas_id: string; path_code: string; name: string; description: string | null; fcp_domain: string | null };
  exposures: ExposureRow[];
  vulnerabilities: VulnRow[];
  inherent: InherentRow | null;
  controls: ControlRow[];
  residual: ResidualRow | null;
  appetite: AppetiteRow | null;
}

const APPETITE_META: Record<AppetitePosition, { label: string; classes: string }> = {
  within:       { label: 'Within',       classes: 'text-adv-green border-adv-green/40 bg-adv-green/10' },
  boundary:     { label: 'Boundary',     classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  outside:      { label: 'Outside',      classes: 'text-adv-red border-adv-red/40 bg-adv-red/10' },
  unacceptable: { label: 'Unacceptable', classes: 'text-adv-red border-adv-red bg-adv-red/20' },
};

const STRENGTH_DOT: Record<ControlStrength | 'absent', string> = {
  strong: 'bg-adv-green',
  adequate: 'bg-adv-gold',
  weak: 'bg-adv-red',
  absent: 'bg-adv-gray',
};

interface Props {
  full: ThreatPathFull;
  onChanged: () => void;
}

export default function ThreatPathCard({ full, onChanged }: Props) {
  const { path, exposures, vulnerabilities, inherent, controls, residual, appetite } = full;
  const [showScoreForm, setShowScoreForm] = useState(false);
  const [showAppetiteForm, setShowAppetiteForm] = useState(false);

  const calculatedAppetite: AppetitePosition | null = residual ? bucketAppetite(residual.residual_score) : null;
  const declaredAppetite = appetite?.appetite_position ?? null;
  const drift = calculatedAppetite && declaredAppetite && calculatedAppetite !== declaredAppetite;

  return (
    <div className="rounded-xl border border-border bg-adv-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <GitBranch className="h-4 w-4 text-adv-teal shrink-0" />
            <span className="text-sm font-semibold text-adv-off-white">{path.path_code} — {path.name}</span>
            {path.fcp_domain && (
              <span className="text-[10px] uppercase tracking-wider rounded border border-adv-blue/40 bg-adv-blue/10 text-adv-blue px-1.5 py-0.5">
                {path.fcp_domain}
              </span>
            )}
          </div>
          {path.description && (
            <p className="mt-1 text-[11px] text-adv-gray">{path.description}</p>
          )}
        </div>
      </div>

      {/* The chain — exposures → vulnerabilities → inherent → controls → residual → appetite */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-[11px]">
        <ChainCell label="Exposures" icon={GitBranch} count={exposures.length}>
          {exposures.length === 0
            ? <span className="text-adv-gray italic">none linked</span>
            : <ul className="space-y-0.5">{exposures.slice(0, 4).map(e => <li key={e.id} className="truncate text-adv-off-white">{e.name}</li>)}{exposures.length > 4 && <li className="text-adv-gray">+{exposures.length - 4}</li>}</ul>}
        </ChainCell>
        <ChainCell label="Vulnerabilities" icon={ShieldOff} count={vulnerabilities.length}>
          {vulnerabilities.length === 0
            ? <span className="text-adv-gray italic">none linked</span>
            : <ul className="space-y-0.5">{vulnerabilities.slice(0, 4).map(v => <li key={v.id} className="truncate text-adv-off-white">{v.vuln_code} ({v.severity})</li>)}{vulnerabilities.length > 4 && <li className="text-adv-gray">+{vulnerabilities.length - 4}</li>}</ul>}
        </ChainCell>
        <ChainCell label="Inherent" icon={Gauge}>
          {inherent ? (
            <div>
              <div className="text-base font-semibold text-adv-off-white">{inherent.inherent_score}/5</div>
              <div className="text-[10px] text-adv-gray">E={inherent.exposure_score} T={inherent.threat_score} V={inherent.vulnerability_score}</div>
            </div>
          ) : <span className="text-adv-gray italic">not scored</span>}
        </ChainCell>
        <ChainCell label="Controls" icon={Shield} count={controls.length}>
          {controls.length === 0
            ? <span className="text-adv-gray italic">none linked</span>
            : <ul className="space-y-0.5">{controls.slice(0, 4).map(c => (
                <li key={c.id} className="truncate text-adv-off-white inline-flex items-center gap-1">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${STRENGTH_DOT[c.strength]}`} />
                  {c.control_code}
                </li>
              ))}{controls.length > 4 && <li className="text-adv-gray">+{controls.length - 4}</li>}</ul>}
        </ChainCell>
        <ChainCell label="Residual" icon={Calculator}>
          {residual ? (
            <div>
              <div className="text-base font-semibold text-adv-off-white">{residual.residual_score}/5</div>
              <div className="text-[10px] text-adv-gray">rollup: {residual.control_quality_rollup}</div>
            </div>
          ) : <span className="text-adv-gray italic">awaiting controls</span>}
        </ChainCell>
        <ChainCell label="Appetite" icon={ScrollText}>
          {residual ? (
            <div className="space-y-1">
              {calculatedAppetite && (
                <div className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${APPETITE_META[calculatedAppetite].classes}`}>
                  calc: {APPETITE_META[calculatedAppetite].label}
                </div>
              )}
              {declaredAppetite && (
                <div className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${APPETITE_META[declaredAppetite].classes}`}>
                  decl: {APPETITE_META[declaredAppetite].label}
                  {appetite?.approved_by && <Check className="h-2.5 w-2.5" />}
                </div>
              )}
              {drift && (
                <div className="text-[10px] text-adv-gold">⚠ drift</div>
              )}
            </div>
          ) : <span className="text-adv-gray italic">—</span>}
        </ChainCell>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
        <button
          onClick={() => setShowScoreForm(s => !s)}
          className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white"
        >
          {inherent ? 'Re-score inherent' : 'Score inherent'}
        </button>
        <button
          onClick={() => setShowAppetiteForm(s => !s)}
          disabled={!residual}
          className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white disabled:opacity-40 disabled:cursor-not-allowed"
          title={!residual ? 'Score inherent first to enable appetite' : ''}
        >
          {appetite ? 'Update appetite' : 'Set appetite'}
        </button>
      </div>

      {showScoreForm && (
        <ScoreInherentForm
          atlasId={path.atlas_id}
          threatPathId={path.id}
          current={inherent}
          onSaved={() => { setShowScoreForm(false); onChanged(); }}
          onCancel={() => setShowScoreForm(false)}
        />
      )}

      {showAppetiteForm && residual && (
        <AppetiteForm
          atlasId={path.atlas_id}
          threatPathId={path.id}
          current={appetite}
          calculated={calculatedAppetite}
          onSaved={() => { setShowAppetiteForm(false); onChanged(); }}
          onCancel={() => setShowAppetiteForm(false)}
        />
      )}
    </div>
  );
}

function bucketAppetite(residual: number): AppetitePosition {
  if (residual <= 2) return 'within';
  if (residual === 3) return 'boundary';
  if (residual === 4) return 'outside';
  return 'unacceptable';
}

function ChainCell({ label, icon: Icon, count, children }: { label: string; icon: typeof GitBranch; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-adv-dark p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-adv-gray mb-1">
        <Icon className="h-3 w-3" />
        {label}
        {count !== undefined && <span className="ml-auto text-adv-gray/70">({count})</span>}
      </div>
      {children}
    </div>
  );
}

function ScoreInherentForm({ atlasId, threatPathId, current, onSaved, onCancel }: {
  atlasId: string; threatPathId: string;
  current: InherentRow | null;
  onSaved: () => void; onCancel: () => void;
}) {
  const [exposure, setExposure] = useState<number>(current?.exposure_score ?? 3);
  const [threat, setThreat] = useState<number>(current?.threat_score ?? 3);
  const [vuln, setVuln] = useState<number>(current?.vulnerability_score ?? 3);
  const [rationale, setRationale] = useState<string>(current?.rationale ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inherent = Math.max(exposure, threat, vuln);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/threat-paths/${threatPathId}/score-inherent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ exposure, threat, vulnerability: vuln, rationale: rationale.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded border border-adv-teal/30 bg-adv-teal/5 p-3 space-y-2">
      <div className="text-[11px] font-medium text-adv-teal">Score inherent risk (calculator owns the inherent number)</div>
      {error && <div className="text-[11px] text-adv-red flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</div>}
      <div className="grid grid-cols-3 gap-2">
        <ScoreSlider label="Exposure" value={exposure} onChange={setExposure} />
        <ScoreSlider label="Threat" value={threat} onChange={setThreat} />
        <ScoreSlider label="Vulnerability" value={vuln} onChange={setVuln} />
      </div>
      <div className="text-[11px] text-adv-off-white">Inherent (max): <span className="font-semibold text-adv-gold">{inherent}/5</span></div>
      <textarea
        value={rationale}
        onChange={e => setRationale(e.target.value)}
        placeholder="Rationale (anchor each sub-score)"
        rows={2}
        maxLength={4000}
        className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-[11px] text-adv-off-white"
      />
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white">Cancel</button>
        <button onClick={() => void submit()} disabled={submitting} className="rounded bg-adv-teal px-2 py-1 text-[11px] font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1 disabled:opacity-50">
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Save
        </button>
      </div>
    </div>
  );
}

function ScoreSlider({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-[10px] text-adv-gray">
      {label}
      <input
        type="range" min={1} max={5} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-adv-teal"
      />
      <div className="text-center text-[11px] text-adv-off-white">{value}/5</div>
    </label>
  );
}

function AppetiteForm({ atlasId, threatPathId, current, calculated, onSaved, onCancel }: {
  atlasId: string; threatPathId: string;
  current: AppetiteRow | null;
  calculated: AppetitePosition | null;
  onSaved: () => void; onCancel: () => void;
}) {
  const [position, setPosition] = useState<AppetitePosition>(current?.appetite_position ?? calculated ?? 'within');
  const [action, setAction] = useState(current?.required_action ?? '');
  const [target, setTarget] = useState(current?.target_date ?? '');
  const [budget, setBudget] = useState<string>(current?.budget_eur != null ? String(current.budget_eur) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/appetite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          threat_path_id: threatPathId,
          appetite_position: position,
          required_action: action.trim() || undefined,
          target_date: target.trim() || null,
          budget_eur: budget.trim() ? Number(budget) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded border border-adv-gold/30 bg-adv-gold/5 p-3 space-y-2">
      <div className="text-[11px] font-medium text-adv-gold">Set appetite</div>
      {calculated && current?.appetite_position && current.appetite_position !== calculated && (
        <div className="text-[10px] text-adv-gold/80 italic">Calculator suggests {calculated}; your declared position is {current.appetite_position}.</div>
      )}
      {error && <div className="text-[11px] text-adv-red flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</div>}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-adv-gray">
          Appetite position
          <select value={position} onChange={e => setPosition(e.target.value as AppetitePosition)}
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white">
            <option value="within">Within</option>
            <option value="boundary">Boundary</option>
            <option value="outside">Outside</option>
            <option value="unacceptable">Unacceptable</option>
          </select>
        </label>
        <label className="text-[10px] text-adv-gray">
          Target date
          <input type="date" value={target} onChange={e => setTarget(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white" />
        </label>
      </div>
      <textarea value={action} onChange={e => setAction(e.target.value)} placeholder="Required action (verb-led, specific)"
        rows={2} maxLength={2000}
        className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-[11px] text-adv-off-white" />
      <label className="block text-[10px] text-adv-gray">
        Budget (EUR, optional)
        <input type="number" min={0} value={budget} onChange={e => setBudget(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white" />
      </label>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white">Cancel</button>
        <button onClick={() => void submit()} disabled={submitting}
          className="rounded bg-adv-gold px-2 py-1 text-[11px] font-medium text-adv-dark hover:bg-adv-gold/80 disabled:opacity-50 inline-flex items-center gap-1">
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Save
        </button>
      </div>
    </div>
  );
}
