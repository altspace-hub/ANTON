/**
 * GrowOpportunityPage — Detail view for a single pipeline opportunity.
 * Route: /grow/opportunities/:id
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, Trash2, Save, Target, DollarSign, Percent, Calendar, Sparkles } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

interface Opportunity {
  id: string;
  title: string;
  description: string | null;
  organisation_id: string | null;
  stage_id: string | null;
  value: number;
  probability: number;
  expected_close_date: string | null;
  next_action: string | null;
  created_at: string;
  updated_at: string;
}

export default function GrowOpportunityPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Editable fields
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [probability, setProbability] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [expectedClose, setExpectedClose] = useState('');

  useEffect(() => {
    fetch(`/api/grow/opportunities/${id}`, { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setOpp(data);
          setTitle(data.title || '');
          setValue(String(data.value || 0));
          setProbability(String(data.probability || 50));
          setNextAction(data.next_action || '');
          setExpectedClose(data.expected_close_date || '');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      await fetchWithAuth(`/api/grow/opportunities/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          value: parseFloat(value) || 0,
          probability: parseInt(probability) || 50,
          nextAction: nextAction.trim() || undefined,
          expectedCloseDate: expectedClose || undefined,
        }),
      });
      navigate('/grow/pipeline');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!id || !confirm('Delete this opportunity?')) return;
    await fetchWithAuth(`/api/grow/opportunities/${id}`, { method: 'DELETE' });
    navigate('/grow/pipeline');
  }

  async function handleAiAdvice() {
    if (!opp) return;
    setAiLoading(true);
    setAiAdvice(null);
    try {
      const context = `Opportunity: ${opp.title}\nValue: $${opp.value}\nProbability: ${opp.probability}%\nStage: ${opp.stage_id || 'unknown'}\nNext action: ${opp.next_action || 'none'}\nExpected close: ${opp.expected_close_date || 'not set'}\n\nProvide strategic advice for this deal: risks, recommended next steps, and how to increase win probability.`;
      const res = await fetchWithAuth('/api/grow/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptType: 'pipeline', context }),
      });
      if (res.ok) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let text = '';
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value, { stream: true }).split('\n')) {
              if (line.startsWith('data: ')) {
                try { const e = JSON.parse(line.slice(6)); if (e.delta?.text) text += e.delta.text; } catch {}
              }
            }
            setAiAdvice(text);
          }
        }
      }
    } finally { setAiLoading(false); }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-adv-gray" /></div>
    );
  }

  if (!opp) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-adv-gray">Opportunity not found.</p>
        <button onClick={() => navigate('/grow/pipeline')} className="mt-4 text-sm text-adv-teal hover:text-adv-teal-dark">Back to Pipeline</button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-adv-dark">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/grow/pipeline')} className="text-adv-gray hover:text-adv-off-white transition">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-lg font-semibold text-adv-off-white">{opp.title}</h1>
            <p className="text-xs text-adv-gray">Opportunity Detail</p>
          </div>
          <button onClick={handleDelete} className="p-2 text-adv-gray hover:text-adv-red transition" title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 max-w-3xl mx-auto w-full space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-adv-card p-4 text-center">
            <DollarSign className="mx-auto mb-1 h-5 w-5 text-adv-green" />
            <div className="text-lg font-bold text-adv-off-white">${Number(opp.value).toLocaleString()}</div>
            <div className="text-xs text-adv-gray">Value</div>
          </div>
          <div className="rounded-xl border border-border bg-adv-card p-4 text-center">
            <Percent className="mx-auto mb-1 h-5 w-5 text-adv-teal" />
            <div className="text-lg font-bold text-adv-off-white">{opp.probability}%</div>
            <div className="text-xs text-adv-gray">Probability</div>
          </div>
          <div className="rounded-xl border border-border bg-adv-card p-4 text-center">
            <Target className="mx-auto mb-1 h-5 w-5 text-adv-gold" />
            <div className="text-lg font-bold text-adv-off-white">${Math.round(Number(opp.value) * Number(opp.probability) / 100).toLocaleString()}</div>
            <div className="text-xs text-adv-gray">Weighted</div>
          </div>
        </div>

        {/* Edit form */}
        <div className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs text-adv-gray">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-adv-gray">Value ($)</label>
              <input type="number" value={value} onChange={e => setValue(e.target.value)} className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-adv-gray">Probability (%)</label>
              <input type="number" min="0" max="100" value={probability} onChange={e => setProbability(e.target.value)} className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-adv-gray">Expected Close Date</label>
            <input type="date" value={expectedClose} onChange={e => setExpectedClose(e.target.value)} className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-adv-gray">Next Action</label>
            <input value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="What's the next step?" className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition">
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleAiAdvice} disabled={aiLoading} className="flex items-center gap-2 rounded-lg border border-adv-teal/30 px-4 py-2 text-sm text-adv-teal hover:bg-adv-teal/10 disabled:opacity-50 transition">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {aiLoading ? 'Analyzing...' : 'AI Deal Advice'}
            </button>
          </div>
        </div>

        {/* AI Advice */}
        {aiAdvice && (
          <div className="rounded-lg border border-adv-teal/30 bg-adv-dark p-4">
            <h3 className="text-xs font-semibold uppercase text-adv-teal mb-2">AI Deal Advice</h3>
            <div className="text-sm text-adv-off-white whitespace-pre-wrap leading-relaxed">{aiAdvice}</div>
          </div>
        )}
      </div>
    </div>
  );
}
