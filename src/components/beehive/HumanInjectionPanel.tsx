/**
 * HumanInjectionPanel — private guidance to your own ANTON.
 *
 * Content is stored locally only — never broadcast to the hive. Used by the
 * deliberation prompt builder when generating YOUR contributions.
 */

import { useState, useEffect, useCallback } from 'react';
import { Lock, Send, AlertCircle, Clock } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

interface Injection {
  id: number;
  content: string;
  applied_to_round: number | null;
  injected_at: string;
}

interface HumanInjectionPanelProps {
  hiveId: string;
  currentRound: number;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function HumanInjectionPanel({ hiveId, currentRound }: HumanInjectionPanelProps) {
  const [injections, setInjections] = useState<Injection[]>([]);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${hiveId}/injections`, { headers: getAuthHeader() });
      const data = await res.json();
      if (res.ok) setInjections(data.injections ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [hiveId]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${hiveId}/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          content: content.trim(),
          apply_to_round: currentRound > 0 ? currentRound : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setContent('');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/5 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-adv-gold/20 flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 text-adv-gold" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-gold">Private guidance</h3>
        <span className="text-[10px] text-adv-gold/70 ml-auto">Not shared with hive</span>
      </div>

      <div className="px-4 py-3 space-y-3">
        <p className="text-[11px] text-adv-gray leading-snug">
          Anything you type here only steers <em>your</em> ANTON's contributions. The hive never
          sees this guidance — it's stored locally and injected into your own contribution prompts.
        </p>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder='e.g. "Push hard on the regulatory citations — the others are being too lenient on Article 8."'
          rows={3}
          maxLength={8000}
          className="w-full rounded-lg border border-adv-gold/30 bg-adv-dark px-3 py-2 text-xs text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-gold focus:outline-none"
        />

        {error && (
          <div className="rounded border border-adv-red/30 bg-adv-red/10 px-2 py-1.5 text-[11px] text-adv-red flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            onClick={submit}
            disabled={submitting || !content.trim()}
            className="rounded-lg bg-adv-gold px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-gold/80 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {submitting ? 'Saving…' : `Apply to round ${currentRound > 0 ? currentRound : '—'}`}
          </button>
        </div>

        {injections.length > 0 && (
          <div className="pt-2 border-t border-adv-gold/20 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-adv-gold/70 font-semibold">
              {injections.length} guidance entr{injections.length === 1 ? 'y' : 'ies'} this hive
            </div>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {injections.slice().reverse().map(inj => (
                <li key={inj.id} className="rounded border border-adv-gold/20 bg-adv-dark/50 px-2 py-1.5 text-[11px]">
                  <div className="flex items-center gap-2 text-[10px] text-adv-gray">
                    <Clock className="h-2.5 w-2.5" />
                    <span>{relativeTime(inj.injected_at)}</span>
                    {inj.applied_to_round && <span>· round {inj.applied_to_round}</span>}
                  </div>
                  <p className="mt-0.5 text-adv-off-white whitespace-pre-wrap">{inj.content}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading && injections.length === 0 && (
          <p className="text-[11px] text-adv-gray italic">Loading…</p>
        )}
      </div>
    </div>
  );
}
