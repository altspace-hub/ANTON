/**
 * BeehiveSessionPage — single-hive detail view.
 *
 * Phase 1 stub: shows hive metadata, governance, and full participant list.
 * Phase 2 will add the contribution stream, round navigator, consensus gauge,
 * and human-injection panel here.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Hexagon, ChevronLeft, RefreshCcw, AlertCircle, Brain, Wrench, Eye, MessageSquarePlus, Construction, Crown } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';
import HiveParticipantList, { type ParticipantSummary } from '../../components/beehive/HiveParticipantList';

type HiveType = 'deliberation' | 'build' | 'review' | 'brainstorm';
type HiveStatus = 'forming' | 'active' | 'converging' | 'concluded' | 'archived';

interface Hive {
  id: string;
  name: string;
  question: string;
  description: string | null;
  type: HiveType;
  status: HiveStatus;
  governance: {
    consensus_mode?: string;
    max_rounds?: number;
    convergence_threshold?: number;
    round_timeout_minutes?: number;
    min_contributions_per_round?: number;
    allow_human_injection?: boolean;
    allow_late_join?: boolean;
    require_dissent_on_disagree?: boolean;
    output_format?: string;
  };
  created_by: string;
  max_participants: number;
  current_round: number;
  consensus_temperature: number;
  created_at: string;
  concluded_at: string | null;
}

interface HiveState {
  hive: Hive;
  participants: ParticipantSummary[];
  rounds: Array<{ round_number: number; phase: string; consensus_temperature: number | null; contribution_count: number }>;
  contributions_count: number;
  output: { synthesis_text: string | null; output_type: string } | null;
}

const TYPE_META: Record<HiveType, { label: string; icon: React.ReactNode }> = {
  deliberation: { label: 'Deliberation', icon: <Brain className="h-4 w-4" /> },
  build:        { label: 'Build',        icon: <Wrench className="h-4 w-4" /> },
  review:       { label: 'Review',       icon: <Eye className="h-4 w-4" /> },
  brainstorm:   { label: 'Brainstorm',   icon: <MessageSquarePlus className="h-4 w-4" /> },
};

const STATUS_META: Record<HiveStatus, { label: string; classes: string }> = {
  forming:    { label: 'Forming',    classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  active:     { label: 'Active',     classes: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  converging: { label: 'Converging', classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  concluded:  { label: 'Concluded',  classes: 'text-adv-green border-adv-green/40 bg-adv-green/10' },
  archived:   { label: 'Archived',   classes: 'text-adv-gray border-border bg-adv-dark' },
};

export default function BeehiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<HiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${id}`, { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setState(data.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !state) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <BackLink />
        <div className="mt-6 text-center text-sm text-adv-gray">Loading hive…</div>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <BackLink />
        <div className="mt-6 rounded-xl border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error || 'Hive not found'}
        </div>
      </div>
    );
  }

  const { hive, participants, rounds } = state;
  const typeMeta = TYPE_META[hive.type];
  const statusMeta = STATUS_META[hive.status];

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <BackLink />

      {/* Header */}
      <div className="rounded-xl border border-border bg-adv-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Hexagon className="h-6 w-6 text-adv-teal shrink-0" />
              <h1 className="text-xl font-semibold text-adv-off-white">{hive.name}</h1>
              <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${statusMeta.classes}`}>
                {statusMeta.label}
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] font-medium text-adv-gray">
                {typeMeta.icon}
                {typeMeta.label}
              </span>
            </div>
            <p className="mt-3 text-sm text-adv-off-white whitespace-pre-wrap">{hive.question}</p>
            {hive.description && (
              <p className="mt-2 text-xs text-adv-gray whitespace-pre-wrap">{hive.description}</p>
            )}
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat label="Round" value={String(hive.current_round)} />
          <Stat label="Consensus" value={`${(hive.consensus_temperature * 100).toFixed(0)}%`} />
          <Stat label="Participants" value={`${participants.filter(p => p.invitation_status === 'joined').length} / ${hive.max_participants}`} />
          <Stat label="Contributions" value={String(state.contributions_count)} />
        </div>
      </div>

      {/* Governance */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-teal">Governance</h2>
        <div className="rounded-xl border border-border bg-adv-card p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <Setting label="Consensus mode" value={hive.governance.consensus_mode ?? '—'} />
          <Setting label="Max rounds" value={String(hive.governance.max_rounds ?? '—')} />
          <Setting label="Convergence threshold" value={hive.governance.convergence_threshold != null ? `${(hive.governance.convergence_threshold * 100).toFixed(0)}%` : '—'} />
          <Setting label="Round timeout" value={hive.governance.round_timeout_minutes ? `${hive.governance.round_timeout_minutes} min` : '—'} />
          <Setting label="Late join" value={hive.governance.allow_late_join ? 'Allowed' : 'Disabled'} />
          <Setting label="Human injection" value={hive.governance.allow_human_injection ? 'Allowed' : 'Disabled'} />
          <Setting label="Dissent required" value={hive.governance.require_dissent_on_disagree ? 'Yes' : 'No'} />
          <Setting label="Output format" value={hive.governance.output_format ?? '—'} />
        </div>
      </section>

      {/* Participants */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">Participants</h2>
          <span className="text-[11px] text-adv-gray">
            <Crown className="inline h-3 w-3 -mt-0.5 mr-1 text-adv-gold" />
            Queen: <span className="font-mono text-adv-gray">{hive.created_by}</span>
          </span>
        </div>
        <HiveParticipantList participants={participants} emptyMessage="No participants yet — invitations will appear here." />
      </section>

      {/* Rounds (will be populated in Phase 2) */}
      {rounds.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-teal">Rounds</h2>
          <ul className="space-y-1.5">
            {rounds.map(r => (
              <li key={r.round_number} className="rounded-lg border border-border bg-adv-card px-3 py-2 text-xs flex items-center justify-between">
                <div>
                  <span className="text-adv-off-white font-medium">Round {r.round_number}</span>
                  <span className="ml-2 text-adv-gray">· {r.phase}</span>
                </div>
                <div className="text-adv-gray">
                  {r.contribution_count} contributions · consensus {r.consensus_temperature != null ? `${(r.consensus_temperature * 100).toFixed(0)}%` : '—'}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Phase 2 placeholder */}
      <section className="rounded-xl border border-dashed border-adv-teal/30 bg-adv-teal/5 p-5">
        <div className="flex items-start gap-3">
          <Construction className="h-5 w-5 text-adv-teal shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-adv-teal">Deliberation engine — coming in Phase 2</h3>
            <p className="mt-1 text-xs text-adv-gray leading-relaxed">
              Phase 1 (this build) implements the foundation: data model, lifecycle, participants,
              and disclosure policies. Phase 2 adds the deliberation engine — round management,
              contribution generation, knowledge atom disclosure with redaction, consensus
              measurement, and the live contribution stream.
            </p>
            <p className="mt-2 text-xs text-adv-gray">
              Phase 3: convergence + synthesis + <code className="text-adv-teal">.anton</code> bundle
              export. Phase 4: AAP wire-up so multiple ANTON instances can join the same hive.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/community/beehive"
      className="inline-flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      Back to Beehive
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-adv-dark px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-adv-gray font-semibold">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-adv-off-white">{value}</div>
    </div>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-adv-gray font-semibold">{label}</div>
      <div className="mt-0.5 text-adv-off-white">{value}</div>
    </div>
  );
}
