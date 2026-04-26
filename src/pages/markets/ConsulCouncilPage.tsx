/**
 * ConsulCouncilPage — drives a council deliberation across consul personas.
 *
 * Backend: /api/markets/consul
 * Each deliberation persists as a revelation_chain (reuses IRE persistence).
 *
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §E.4.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Users, Loader2, Send } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface Member {
  id: string;
  name: string;
  promptFile: string;
}

interface Contribution {
  consulId: string;
  consulName: string;
  contribution: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

interface DeliberationResult {
  chainId: string;
  contributions: Contribution[];
  synthesis: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
}

export default function ConsulCouncilPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [context, setContext] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeliberationResult | null>(null);

  useEffect(() => {
    fetch('/api/markets/consul/members', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { members: Member[] }) => {
        setMembers(data.members);
        setSelected(new Set(data.members.map(m => m.id)));
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load council members'));
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    if (next.size === 0) return;
    setSelected(next);
  };

  const deliberate = async () => {
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      const r = await fetch('/api/markets/consul/deliberate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ subject, context, consulIds: [...selected] }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResult(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deliberation failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/markets" className="text-adv-gray hover:text-adv-teal" aria-label="Back">
            <ChevronLeft size={20} />
          </Link>
          <Users className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Consul Council</h1>
            <p className="text-adv-gray text-sm">
              Multi-persona deliberation. Each deliberation persists as an IRE revelation chain
              (see <Link to="/audit-trail" className="text-adv-teal hover:underline">Audit Trail</Link>).
            </p>
          </div>
        </div>

        {/* Council selection */}
        <section className="bg-adv-card rounded-lg p-4 mb-4">
          <div className="text-sm font-medium mb-2">Council members</div>
          <div className="flex flex-wrap gap-2">
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                aria-pressed={selected.has(m.id)}
                className={`px-3 py-1 rounded text-sm transition ${
                  selected.has(m.id) ? 'bg-adv-teal/20 text-adv-teal' : 'bg-adv-dark-2 text-adv-gray'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </section>

        {/* Inputs */}
        <section className="bg-adv-card rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. ANTON-AI-Index Q3 thesis review"
              className="w-full bg-adv-dark-2 border border-adv-card px-3 py-2 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Context</label>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Paste atoms, why-chain summary, market data — anything the council should consider."
              rows={6}
              className="w-full bg-adv-dark-2 border border-adv-card px-3 py-2 rounded text-sm font-mono"
            />
          </div>
          <button
            onClick={deliberate}
            disabled={running || !subject || !context || selected.size === 0}
            className="inline-flex items-center gap-2 bg-adv-teal hover:bg-adv-teal-dark text-white px-4 py-2 rounded transition disabled:opacity-50"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {running ? 'Deliberating…' : 'Convene council'}
          </button>
        </section>

        {error && (
          <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>
        )}

        {/* Result */}
        {result && (
          <section className="space-y-4">
            <div className="bg-adv-card rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">Synthesis</h2>
                <Link
                  to={`/audit-trail?q=${result.chainId.slice(0, 8)}`}
                  className="text-xs text-adv-teal hover:underline"
                >
                  Trail: {result.chainId.slice(0, 12)}…
                </Link>
              </div>
              <div className="prose prose-invert max-w-none text-sm whitespace-pre-wrap">
                {result.synthesis}
              </div>
              <div className="mt-3 text-xs text-adv-gray">
                {result.totalInputTokens.toLocaleString()} in / {result.totalOutputTokens.toLocaleString()} out tokens · {(result.totalDurationMs / 1000).toFixed(1)}s
              </div>
            </div>

            <details className="bg-adv-card rounded-lg p-4">
              <summary className="cursor-pointer font-medium">
                Individual contributions ({result.contributions.length})
              </summary>
              <div className="mt-3 space-y-3">
                {result.contributions.map(c => (
                  <div key={c.consulId} className="border-t border-adv-card pt-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded bg-adv-teal/20 text-adv-teal text-xs">
                        {c.consulName}
                      </span>
                      <span className="text-xs text-adv-gray">
                        {c.outputTokens.toLocaleString()} out · {(c.durationMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <div className="text-sm text-adv-off-white whitespace-pre-wrap">
                      {c.contribution}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
