import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart2, ChevronRight } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

const STEPS = ['Type', 'Philosophy', 'Universe', 'Weighting', 'Review'];

const INDEX_TYPES = [
  { value: 'geographic', label: 'Geographic', desc: 'Focus on a specific region or country' },
  { value: 'sector', label: 'Sector', desc: 'Focus on a specific industry sector' },
  { value: 'philosophy', label: 'Philosophy', desc: 'Based on an investment philosophy (value, growth, etc.)' },
  { value: 'custom', label: 'Custom', desc: 'Define your own selection criteria' },
];

const PHILOSOPHIES = [
  'value', 'growth', 'momentum', 'contrarian', 'dividend', 'quality', 'esg', 'small_cap', 'macro_shield',
];

const WEIGHTING_METHODS = [
  { value: 'equal', label: 'Equal Weight', desc: 'Same allocation to each holding' },
  { value: 'market_cap', label: 'Market Cap', desc: 'Weighted by market capitalization' },
  { value: 'conviction', label: 'Conviction', desc: 'Weighted by ANTON thesis confidence' },
  { value: 'risk_parity', label: 'Risk Parity', desc: 'Weighted for equal risk contribution' },
];

export default function MarketIndexCreatePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [indexType, setIndexType] = useState('custom');
  const [philosophy, setPhilosophy] = useState('');
  const [symbols, setSymbols] = useState('');
  const [weighting, setWeighting] = useState('equal');
  const [maxHoldings, setMaxHoldings] = useState(20);
  const [rebalance, setRebalance] = useState('monthly');
  const [benchmark, setBenchmark] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const universe = symbols.split(',').map(s => s.trim()).filter(Boolean);
      const res = await fetchWithAuth('/api/markets/indexes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, description, indexType, philosophy: philosophy || undefined,
          universe, maxHoldings, rebalanceFrequency: rebalance,
          weightingMethod: weighting, benchmarkSymbol: benchmark || undefined,
        }),
      });
      if (res.ok) {
        const { id } = await res.json() as { id: string };
        navigate(`/markets/indexes/${id}`);
      }
    } catch (err) {
      console.error('[IndexCreate] Error:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/markets/indexes')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
            <BarChart2 className="h-6 w-6 text-adv-teal" />
            Create Index
          </h1>
          <p className="text-sm text-adv-gray">Guided index builder wizard</p>
        </div>
      </div>

      <MarketDisclaimer compact />

      {/* Steps */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button onClick={() => setStep(i)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${step === i ? 'bg-adv-teal text-adv-dark' : step > i ? 'bg-adv-green/20 text-adv-green' : 'bg-adv-card text-adv-gray'}`}>
              {s}
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-adv-gray" />}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-adv-card bg-adv-card p-6 space-y-4">
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-adv-off-white">Index Type</h2>
            <div className="grid grid-cols-2 gap-3">
              {INDEX_TYPES.map((t) => (
                <button key={t.value} onClick={() => { setIndexType(t.value); setStep(1); }}
                  className={`rounded-lg border p-4 text-left transition-colors ${indexType === t.value ? 'border-adv-teal bg-adv-teal/5' : 'border-adv-dark hover:border-adv-teal/30'}`}>
                  <div className="text-sm font-semibold text-adv-off-white">{t.label}</div>
                  <div className="text-xs text-adv-gray mt-1">{t.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-adv-off-white">Philosophy & Name</h2>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Index name"
              className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Investment philosophy description"
              rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
            <div className="flex flex-wrap gap-2">
              {PHILOSOPHIES.map((p) => (
                <button key={p} onClick={() => setPhilosophy(p)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${philosophy === p ? 'bg-adv-teal text-adv-dark' : 'bg-adv-dark text-adv-gray hover:text-adv-off-white'}`}>
                  {p.replace('_', ' ')}
                </button>
              ))}
            </div>
            <button onClick={() => setStep(2)} disabled={!name.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark disabled:opacity-50">Next</button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-adv-off-white">Universe</h2>
            <textarea value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="Eligible symbols (comma-separated): AAPL, MSFT, GOOGL..."
              rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
            <div className="flex gap-4">
              <div>
                <label className="block text-xs text-adv-gray mb-1">Max Holdings</label>
                <input type="number" value={maxHoldings} onChange={(e) => setMaxHoldings(parseInt(e.target.value, 10))} min={5} max={100}
                  className="w-24 rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white" />
              </div>
              <div>
                <label className="block text-xs text-adv-gray mb-1">Benchmark</label>
                <input type="text" value={benchmark} onChange={(e) => setBenchmark(e.target.value)} placeholder="SPY"
                  className="w-24 rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white" />
              </div>
            </div>
            <button onClick={() => setStep(3)} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark">Next</button>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-adv-off-white">Weighting & Rebalance</h2>
            <div className="grid grid-cols-2 gap-3">
              {WEIGHTING_METHODS.map((w) => (
                <button key={w.value} onClick={() => setWeighting(w.value)}
                  className={`rounded-lg border p-3 text-left transition-colors ${weighting === w.value ? 'border-adv-teal bg-adv-teal/5' : 'border-adv-dark hover:border-adv-teal/30'}`}>
                  <div className="text-sm font-semibold text-adv-off-white">{w.label}</div>
                  <div className="text-xs text-adv-gray mt-1">{w.desc}</div>
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Rebalance Frequency</label>
              <select value={rebalance} onChange={(e) => setRebalance(e.target.value)} className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <button onClick={() => setStep(4)} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark">Review</button>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-lg font-semibold text-adv-off-white">Review & Create</h2>
            <div className="space-y-2 text-sm">
              <div><span className="text-adv-gray">Name:</span> <span className="text-adv-off-white">{name}</span></div>
              <div><span className="text-adv-gray">Type:</span> <span className="text-adv-off-white capitalize">{indexType}</span></div>
              {philosophy && <div><span className="text-adv-gray">Philosophy:</span> <span className="text-adv-off-white capitalize">{philosophy}</span></div>}
              <div><span className="text-adv-gray">Weighting:</span> <span className="text-adv-off-white capitalize">{weighting.replace('_', ' ')}</span></div>
              <div><span className="text-adv-gray">Rebalance:</span> <span className="text-adv-off-white capitalize">{rebalance}</span></div>
              <div><span className="text-adv-gray">Max Holdings:</span> <span className="text-adv-off-white">{maxHoldings}</span></div>
            </div>
            <button onClick={handleCreate} disabled={creating || !name.trim()}
              className="rounded-lg bg-adv-teal px-6 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Index'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
