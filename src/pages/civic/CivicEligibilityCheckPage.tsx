/**
 * CivicEligibilityCheckPage — citizen-facing eligibility checker.
 *
 * Phase B.1 build-out (Civic pillar). Backed by `civic-eligibility.ts` evaluator
 * + `civic_eligibility_rules` (mig 170).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, XCircle, HelpCircle, FileSearch } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface ApplicantContext {
  jurisdiction?: string;
  age?: number;
  residencyMonths?: number;
  income?: number;
  householdSize?: number;
}

interface EligibilityResult {
  ruleId: string;
  ruleCode: string;
  outcome: 'eligible' | 'ineligible' | 'indeterminate' | 'requires_evidence';
  evidence: string;
}

interface EvaluationResponse {
  verdict: EligibilityResult['outcome'];
  summary: { eligible: number; ineligible: number; indeterminate: number; requires_evidence: number; total: number };
  results: EligibilityResult[];
}

export default function CivicEligibilityCheckPage() {
  const [packs, setPacks] = useState<Array<{ id: string; name: string; jurisdiction: string }>>([]);
  const [selectedPack, setSelectedPack] = useState<string>('');
  const [ctx, setCtx] = useState<ApplicantContext>({});
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/civic/process-packs', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { packs?: Array<{ id: string; name: string; jurisdiction: string }> }) => setPacks(data.packs ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load packs'));
  }, []);

  const evaluate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/civic/eligibility/evaluate-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ packId: selectedPack, applicantContext: ctx }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResult(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evaluation failed');
    } finally {
      setLoading(false);
    }
  };

  const verdictIcon = (o: EligibilityResult['outcome']) => {
    if (o === 'eligible')           return <CheckCircle2 size={14} className="text-adv-green" />;
    if (o === 'ineligible')         return <XCircle size={14} className="text-adv-red" />;
    if (o === 'requires_evidence')  return <FileSearch size={14} className="text-adv-gold" />;
    return <HelpCircle size={14} className="text-adv-gray" />;
  };

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/civic" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <FileSearch className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Eligibility check</h1>
            <p className="text-adv-gray text-sm">Run declarative eligibility rules against your situation. Results are deterministic and show evidence per rule.</p>
          </div>
        </div>

        <section className="bg-adv-card rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Process pack</label>
            <select
              value={selectedPack}
              onChange={e => setSelectedPack(e.target.value)}
              className="w-full bg-adv-dark-2 border border-adv-card px-3 py-2 rounded text-sm"
            >
              <option value="">— choose a pack —</option>
              {packs.map(p => <option key={p.id} value={p.id}>{p.jurisdiction} · {p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Jurisdiction</label>
              <input type="text" placeholder="e.g. SE" maxLength={2}
                value={ctx.jurisdiction ?? ''}
                onChange={e => setCtx({ ...ctx, jurisdiction: e.target.value.toUpperCase() })}
                className="w-full bg-adv-dark-2 border border-adv-card px-3 py-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Age</label>
              <input type="number" min={0} max={120}
                value={ctx.age ?? ''}
                onChange={e => setCtx({ ...ctx, age: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full bg-adv-dark-2 border border-adv-card px-3 py-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Residency (months)</label>
              <input type="number" min={0}
                value={ctx.residencyMonths ?? ''}
                onChange={e => setCtx({ ...ctx, residencyMonths: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full bg-adv-dark-2 border border-adv-card px-3 py-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Annual income</label>
              <input type="number" min={0}
                value={ctx.income ?? ''}
                onChange={e => setCtx({ ...ctx, income: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full bg-adv-dark-2 border border-adv-card px-3 py-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Household size</label>
              <input type="number" min={1}
                value={ctx.householdSize ?? ''}
                onChange={e => setCtx({ ...ctx, householdSize: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full bg-adv-dark-2 border border-adv-card px-3 py-2 rounded text-sm" />
            </div>
          </div>

          <button onClick={evaluate} disabled={!selectedPack || loading}
            className="bg-adv-teal hover:bg-adv-teal-dark text-white px-4 py-2 rounded transition disabled:opacity-50">
            {loading ? 'Evaluating…' : 'Check eligibility'}
          </button>
        </section>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        {result && (
          <section className="bg-adv-card rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-adv-gray">Overall verdict:</span>
              {verdictIcon(result.verdict)}
              <span className="font-semibold">{result.verdict}</span>
            </div>
            <div className="text-xs text-adv-gray">
              {result.summary.eligible} eligible · {result.summary.ineligible} ineligible · {result.summary.indeterminate} indeterminate · {result.summary.requires_evidence} need evidence
            </div>
            <ul className="space-y-2">
              {result.results.map(r => (
                <li key={r.ruleId} className="flex items-start gap-2 text-sm border-t border-adv-card pt-2">
                  {verdictIcon(r.outcome)}
                  <div>
                    <code className="text-adv-teal text-xs">{r.ruleCode}</code>
                    <div className="text-adv-gray">{r.evidence}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
