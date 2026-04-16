/**
 * ContributionComposer — submit a contribution to the active round.
 *
 * Supports:
 * - direct typing (manual contribution)
 * - LLM-drafting via "Generate" button (Phase 2 v1 local-mode flow: user
 *   types/edits as themselves OR has the LLM draft as another participant)
 *
 * In v1 local mode, the Queen may submit on behalf of any joined participant;
 * non-Queens can only submit as themselves. The selector reflects this.
 */

import { useState, useMemo } from 'react';
import { Sparkles, Send, Crown, User, Search, AlertCircle, X } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type ContributionType = 'position' | 'evidence' | 'challenge' | 'synthesis' | 'question' | 'revision' | 'dissent' | 'build' | 'review_note';

interface ParticipantOption {
  anton_contact_hash: string;
  display_name: string;
  role: 'queen' | 'worker' | 'scout' | 'observer';
  invitation_status: string;
  status: string;
}

interface ContributionComposerProps {
  hiveId: string;
  participants: ParticipantOption[];
  localContactHash: string | null;
  isQueen: boolean;
  onSubmitted: () => void;
}

const TYPE_OPTIONS: Array<{ id: ContributionType; label: string; hint: string }> = [
  { id: 'position',    label: 'Position',    hint: 'State an initial position' },
  { id: 'evidence',    label: 'Evidence',    hint: 'Bring data to support a claim' },
  { id: 'challenge',   label: 'Challenge',   hint: 'Push back on another contribution' },
  { id: 'synthesis',   label: 'Synthesis',   hint: 'Pull positions together' },
  { id: 'question',    label: 'Question',    hint: 'Ask the group to clarify' },
  { id: 'revision',    label: 'Revision',    hint: 'Update your earlier position' },
  { id: 'dissent',     label: 'Dissent',     hint: 'Formally disagree (preserved)' },
  { id: 'build',       label: 'Build',       hint: 'Contribute an artifact section' },
  { id: 'review_note', label: 'Review note', hint: 'Structured review feedback' },
];

const ROLE_ICON: Record<string, React.ReactNode> = {
  queen:    <Crown className="h-3 w-3 text-adv-gold" />,
  worker:   <User className="h-3 w-3 text-adv-teal" />,
  scout:    <Search className="h-3 w-3 text-adv-blue" />,
  observer: <User className="h-3 w-3 text-adv-gray" />,
};

export default function ContributionComposer({ hiveId, participants, localContactHash, isQueen, onSubmitted }: ContributionComposerProps) {
  const validParticipants = useMemo(
    () => participants.filter(p => p.invitation_status === 'joined' && p.status !== 'left' && p.role !== 'observer'),
    [participants],
  );
  const selfOption = validParticipants.find(p => p.anton_contact_hash === localContactHash);
  const selectableParticipants = isQueen ? validParticipants : (selfOption ? [selfOption] : []);

  const [asHash, setAsHash] = useState<string>(selfOption?.anton_contact_hash ?? selectableParticipants[0]?.anton_contact_hash ?? '');
  const [type, setType] = useState<ContributionType>('position');
  const [content, setContent] = useState('');
  const [confidence, setConfidence] = useState(0.7);
  const [hint, setHint] = useState('');
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asParticipant = selectableParticipants.find(p => p.anton_contact_hash === asHash);

  if (selectableParticipants.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-adv-card/30 px-4 py-3 text-xs text-adv-gray italic">
        You need to be a joined non-observer participant to contribute.
      </div>
    );
  }

  async function generate() {
    if (!asParticipant) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${hiveId}/contributions/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          as_contact_hash: asParticipant.anton_contact_hash,
          as_display_name: asParticipant.display_name,
          type,
          hint: hint.trim() || undefined,
          supporting_atoms: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setContent(data.draft.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function submit() {
    if (!asParticipant || !content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${hiveId}/contributions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          contributor_hash: asParticipant.anton_contact_hash,
          type,
          content: content.trim(),
          confidence,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setContent('');
      setHint('');
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const typeOption = TYPE_OPTIONS.find(t => t.id === type)!;

  return (
    <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">Contribute</h3>
        {isQueen && selectableParticipants.length > 1 && (
          <span className="text-[10px] text-adv-gold">Queen mode: submit as any participant</span>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Speaker + type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-adv-gray mb-1">Speak as</label>
            <select
              value={asHash}
              onChange={(e) => setAsHash(e.target.value)}
              disabled={selectableParticipants.length === 1}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none disabled:opacity-70"
            >
              {selectableParticipants.map(p => (
                <option key={p.anton_contact_hash} value={p.anton_contact_hash}>
                  {p.display_name} ({p.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-adv-gray mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ContributionType)}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              {TYPE_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <p className="mt-0.5 text-[10px] text-adv-gray">{typeOption.hint}</p>
          </div>
        </div>

        {/* Hint for generation */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-adv-gray mb-1">
            Generation hint <span className="text-adv-gray/60 font-normal normal-case">(optional — for AI draft)</span>
          </label>
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder='e.g. "argue against position #2"'
            maxLength={500}
            className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-teal focus:outline-none"
          />
        </div>

        {/* Content */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[10px] uppercase tracking-wider text-adv-gray">Content</label>
            <span className="text-[10px] text-adv-gray">{content.length} chars</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your contribution, or click Generate to have the LLM draft as the selected participant…"
            rows={6}
            maxLength={20000}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-teal focus:outline-none font-mono leading-relaxed"
          />
        </div>

        {/* Confidence */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[10px] uppercase tracking-wider text-adv-gray">Confidence</label>
            <span className="text-[10px] text-adv-off-white">{(confidence * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="w-full accent-adv-teal"
          />
        </div>

        {error && (
          <div className="rounded border border-adv-red/30 bg-adv-red/10 px-2 py-1.5 text-[11px] text-adv-red flex items-start gap-1.5">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-adv-red/70 hover:text-adv-red"><X className="h-3 w-3" /></button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={generate}
            disabled={generating || submitting || !asParticipant}
            className="rounded-lg border border-adv-teal/40 px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/10 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles className={`h-3.5 w-3.5 ${generating ? 'animate-pulse' : ''}`} />
            {generating ? 'Drafting…' : `Generate as ${asParticipant?.display_name ?? '—'}`}
          </button>
          <button
            onClick={submit}
            disabled={submitting || generating || !content.trim()}
            className="rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" />
            {submitting ? 'Submitting…' : 'Submit contribution'}
          </button>
        </div>
      </div>
    </div>
  );
}
