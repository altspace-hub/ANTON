/**
 * HiveCreator — modal for creating a new BEEHIVE session.
 *
 * In v1 (local-only) the Queen identity is taken from /api/community/status.
 * If community has not been activated, the user is prompted to set it up first.
 */

import { useState, useEffect, useRef } from 'react';
import { X, Hexagon, Users, Brain, Wrench, Eye, MessageSquarePlus } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type HiveType = 'deliberation' | 'build' | 'review' | 'brainstorm';
type ConsensusMode = 'unanimous' | 'supermajority' | 'majority' | 'queen_decides' | 'no_consensus';

interface HiveCreatorProps {
  queenContactHash: string;
  queenDisplayName: string;
  onClose: () => void;
  onCreated: (hiveId: string) => void;
}

const HIVE_TYPE_OPTIONS: Array<{ id: HiveType; label: string; description: string; icon: React.ReactNode }> = [
  { id: 'deliberation', label: 'Deliberation', description: 'Reach a reasoned group conclusion on a question.', icon: <Brain className="h-4 w-4" /> },
  { id: 'build',        label: 'Build',        description: 'Collaboratively produce an artifact (report, code, policy).', icon: <Wrench className="h-4 w-4" /> },
  { id: 'review',       label: 'Review',       description: 'Multi-ANTON review of an existing artifact.', icon: <Eye className="h-4 w-4" /> },
  { id: 'brainstorm',   label: 'Brainstorm',   description: 'Open-ended exploration; no convergence required.', icon: <MessageSquarePlus className="h-4 w-4" /> },
];

const CONSENSUS_MODES: Array<{ id: ConsensusMode; label: string; hint: string }> = [
  { id: 'unanimous',     label: 'Unanimous',     hint: 'All must approve' },
  { id: 'supermajority', label: 'Supermajority', hint: '2/3+ must approve' },
  { id: 'majority',      label: 'Majority',      hint: '51%+ must approve' },
  { id: 'queen_decides', label: 'Queen Decides', hint: 'Others advise; Queen decides' },
  { id: 'no_consensus',  label: 'No Consensus',  hint: 'Brainstorm — preserve all' },
];

export default function HiveCreator({ queenContactHash, queenDisplayName, onClose, onCreated }: HiveCreatorProps) {
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<HiveType>('deliberation');
  const [consensusMode, setConsensusMode] = useState<ConsensusMode>('majority');
  const [maxRounds, setMaxRounds] = useState(5);
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [allowLateJoin, setAllowLateJoin] = useState(true);
  const [allowHumanInjection, setAllowHumanInjection] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  // a11y: focus the first input on mount, restore focus on unmount, close on Escape.
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    nameInputRef.current?.focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      const prev = previouslyFocused.current;
      if (prev instanceof HTMLElement) prev.focus();
    };
    // submitting deliberately excluded — we only need close-on-escape behavior to track latest
    // submitting via the closure check above; rebinding listeners on every keystroke would churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !question.trim()) {
      setError('Name and question are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/beehive/hives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          name: name.trim(),
          question: question.trim(),
          description: description.trim() || undefined,
          type,
          governance: {
            consensus_mode: consensusMode,
            max_rounds: maxRounds,
            allow_late_join: allowLateJoin,
            allow_human_injection: allowHumanInjection,
          },
          max_participants: maxParticipants,
          queen_contact_hash: queenContactHash,
          queen_display_name: queenDisplayName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Server returned ${res.status}`);
      onCreated(data.hive.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hive-creator-title"
        className="w-full max-w-2xl rounded-2xl border border-border bg-adv-card shadow-2xl my-8"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <Hexagon className="h-5 w-5 text-adv-teal" />
            <div>
              <h2 id="hive-creator-title" className="text-lg font-semibold text-adv-off-white">Create a Beehive</h2>
              <p className="text-xs text-adv-gray mt-0.5">A persistent multi-party reasoning session</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-adv-gray hover:text-adv-off-white transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AMLR Gap Assessment — Bank X"
              maxLength={200}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-adv-teal/40"
            />
          </div>

          {/* Question */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Question / Objective
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What is the group deliberating about?"
              rows={3}
              maxLength={4000}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-adv-teal/40"
            />
          </div>

          {/* Optional description */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Description <span className="text-adv-gray/60 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Background, scope, constraints…"
              rows={2}
              maxLength={8000}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-adv-teal/40"
            />
          </div>

          {/* Type */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {HIVE_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setType(opt.id)}
                  className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                    type === opt.id
                      ? 'border-adv-teal bg-adv-teal/10'
                      : 'border-border bg-adv-dark hover:border-adv-gray'
                  }`}
                >
                  <span className={type === opt.id ? 'text-adv-teal mt-0.5' : 'text-adv-gray mt-0.5'}>
                    {opt.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-adv-off-white">{opt.label}</div>
                    <div className="text-[11px] text-adv-gray leading-snug">{opt.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Governance */}
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
                Consensus Mode
              </label>
              <select
                value={consensusMode}
                onChange={(e) => setConsensusMode(e.target.value as ConsensusMode)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-adv-teal/40"
              >
                {CONSENSUS_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
                  Max rounds
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxRounds}
                  onChange={(e) => setMaxRounds(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-adv-teal/40"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
                  Max participants
                </label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(Math.max(2, Math.min(50, Number(e.target.value) || 2)))}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-adv-teal/40"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-adv-off-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowLateJoin}
                  onChange={(e) => setAllowLateJoin(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal"
                />
                Allow late join
              </label>
              <label className="flex items-center gap-2 text-sm text-adv-off-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowHumanInjection}
                  onChange={(e) => setAllowHumanInjection(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal"
                />
                Allow human guidance between rounds
              </label>
            </div>
          </div>

          {/* Queen identity (read-only) */}
          <div className="rounded-lg border border-adv-teal/20 bg-adv-teal/5 px-3 py-2.5 flex items-center gap-2">
            <Users className="h-4 w-4 text-adv-teal shrink-0" />
            <div className="min-w-0 text-xs">
              <div className="text-adv-teal font-medium">You'll join as Queen</div>
              <div className="text-adv-gray truncate font-mono">{queenContactHash}</div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-xs text-adv-red">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border -mx-6 px-6">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-adv-gray hover:text-adv-off-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !question.trim()}
              className="rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating…' : 'Create Hive'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
