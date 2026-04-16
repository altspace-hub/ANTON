/**
 * BeehiveSessionPage — full session view with deliberation engine.
 *
 * Phase 2 build: round navigation, contribution stream, composer with LLM
 * generation, consensus gauge, private human-injection panel, participant
 * list, governance summary.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Hexagon, ChevronLeft, RefreshCcw, AlertCircle, Brain, Wrench, Eye, MessageSquarePlus, Crown } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';
import HiveParticipantList, { type ParticipantSummary } from '../../components/beehive/HiveParticipantList';
import ConsensusGauge from '../../components/beehive/ConsensusGauge';
import RoundNavigator, { type RoundSummary } from '../../components/beehive/RoundNavigator';
import ContributionStream, { type StreamContribution } from '../../components/beehive/ContributionStream';
import ContributionComposer from '../../components/beehive/ContributionComposer';
import HumanInjectionPanel from '../../components/beehive/HumanInjectionPanel';
import SynthesisPanel from '../../components/beehive/SynthesisPanel';

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
  rounds: RoundSummary[];
  contributions_count: number;
  output: { synthesis_text: string | null; output_type: string } | null;
}

interface ConsensusMeasurement {
  temperature: number;
  rationale: string;
  agreementClusters: string[];
  disagreements: string[];
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
  const [contributions, setContributions] = useState<StreamContribution[]>([]);
  const [identity, setIdentity] = useState<{ contact_hash: string; display_name: string } | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consensus, setConsensus] = useState<ConsensusMeasurement | null>(null);
  const [measuringConsensus, setMeasuringConsensus] = useState(false);

  const loadIdentity = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/beehive/identity', { headers: getAuthHeader() });
      const data = await res.json();
      setIdentity(data.identity ?? null);
    } catch { /* silent */ }
  }, []);

  const loadState = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${id}`, { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setState(data.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  const loadContributions = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${id}/contributions`, { headers: getAuthHeader() });
      const data = await res.json();
      if (res.ok) setContributions(data.contributions ?? []);
    } catch { /* silent */ }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadIdentity(), loadState(), loadContributions()]).finally(() => setLoading(false));
  }, [loadIdentity, loadState, loadContributions]);

  // Auto-refresh state + contributions every 5s while the hive is live so that
  // contributions arriving from peer ANTONs (Phase 4 wire) appear without a
  // manual refresh. Stops once the hive is concluded or archived. Page-hidden
  // tabs skip polling to avoid wasted API calls.
  useEffect(() => {
    if (!state) return;
    if (state.hive.status === 'concluded' || state.hive.status === 'archived') return;
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadState();
      void loadContributions();
    }, 5000);
    return () => clearInterval(intervalId);
  }, [state?.hive.status, loadState, loadContributions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default to "current round" filter when an active round exists
  useEffect(() => {
    if (state && selectedRound === null) {
      const active = state.rounds.find(r => !r.ended_at);
      if (active) setSelectedRound(active.round_number);
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const queenHash = state?.hive.created_by ?? null;
  const isQueen = !!identity && !!queenHash && identity.contact_hash === queenHash;
  const currentRound = state?.rounds.find(r => !r.ended_at)?.round_number ?? 0;

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadState(), loadContributions()]);
    setLoading(false);
  }, [loadState, loadContributions]);

  async function advanceRound() {
    if (!id) return;
    const res = await fetchWithAuth(`/api/beehive/hives/${id}/rounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    await refreshAll();
    if (data.round?.round_number) setSelectedRound(data.round.round_number);
  }

  async function triggerConvergence() {
    if (!id) return;
    const res = await fetchWithAuth(`/api/beehive/hives/${id}/converge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    await refreshAll();
    if (data.round?.round_number) setSelectedRound(data.round.round_number);
  }

  async function measureConsensus() {
    if (!id) return;
    setMeasuringConsensus(true);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${id}/measure-consensus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setConsensus(data.consensus);
      await loadState();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setMeasuringConsensus(false);
    }
  }

  const composerParticipants = useMemo(
    () => (state?.participants ?? []).map(p => ({
      anton_contact_hash: p.anton_contact_hash,
      display_name: p.display_name,
      role: p.role,
      invitation_status: p.invitation_status,
      status: p.status,
    })),
    [state?.participants],
  );

  if (loading && !state) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <BackLink />
        <div className="mt-6 text-center text-sm text-adv-gray">Loading hive…</div>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="mx-auto max-w-6xl p-6">
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
  const isActiveDeliberation = hive.status === 'active' || hive.status === 'converging';
  const canContribute = isActiveDeliberation && currentRound > 0;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
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
              {isQueen && <span className="text-[10px] uppercase tracking-wider font-medium text-adv-gold">You are Queen</span>}
            </div>
            <p className="mt-3 text-sm text-adv-off-white whitespace-pre-wrap">{hive.question}</p>
            {hive.description && (
              <p className="mt-2 text-xs text-adv-gray whitespace-pre-wrap">{hive.description}</p>
            )}
          </div>
          <button
            onClick={() => void refreshAll()}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat label="Round" value={String(hive.current_round)} />
          <div className="rounded-lg border border-border bg-adv-dark px-3 py-2">
            <ConsensusGauge
              value={hive.consensus_temperature}
              threshold={hive.governance.convergence_threshold}
              size="sm"
              onRefresh={isQueen && currentRound > 0 ? measureConsensus : undefined}
              refreshing={measuringConsensus}
              rationale={consensus?.rationale ?? null}
            />
          </div>
          <Stat label="Participants" value={`${participants.filter(p => p.invitation_status === 'joined').length} / ${hive.max_participants}`} />
          <Stat label="Contributions" value={String(state.contributions_count)} />
        </div>
      </div>

      {/* Synthesis (when converging or concluded) — full width above the two-column layout */}
      {(hive.status === 'converging' || hive.status === 'concluded') && (
        <SynthesisPanel
          hiveId={hive.id}
          hiveStatus={hive.status}
          isQueen={isQueen}
          isParticipantNonObserver={
            !!identity && participants.some(p =>
              p.anton_contact_hash === identity.contact_hash &&
              p.invitation_status === 'joined' && p.role !== 'observer'
            )
          }
          onChanged={() => { void refreshAll(); }}
          participantsByHash={Object.fromEntries(participants.map(p => [p.anton_contact_hash, { display_name: p.display_name, role: p.role }]))}
        />
      )}

      {/* Two-column layout: deliberation (left) + sidebar (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT: Deliberation ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Composer (only when active and there's a current round) */}
          {canContribute ? (
            <ContributionComposer
              hiveId={hive.id}
              participants={composerParticipants}
              localContactHash={identity?.contact_hash ?? null}
              isQueen={isQueen}
              onSubmitted={() => { void refreshAll(); }}
            />
          ) : hive.status === 'forming' ? (
            <div className="rounded-xl border border-dashed border-adv-teal/30 bg-adv-teal/5 px-4 py-3 text-xs text-adv-teal">
              Hive is still forming. {isQueen ? 'Open Round 1 below to begin deliberation.' : 'Waiting for the Queen to start.'}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-adv-card/30 px-4 py-3 text-xs text-adv-gray">
              Contributions are closed — hive is {hive.status}.
            </div>
          )}

          {/* Stream */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">
                Contributions {selectedRound !== null && <span className="text-adv-gray font-normal normal-case">(round {selectedRound})</span>}
              </h2>
              {contributions.length > 0 && (
                <span className="text-[11px] text-adv-gray">{contributions.length} total</span>
              )}
            </div>
            <ContributionStream
              contributions={contributions}
              participants={participants}
              selectedRound={selectedRound}
              emptyMessage={hive.status === 'forming' ? 'No contributions yet — Queen needs to open a round first.' : 'No contributions yet.'}
            />
          </section>
        </div>

        {/* ── RIGHT: Sidebar ── */}
        <aside className="space-y-4">
          <RoundNavigator
            rounds={rounds}
            hiveStatus={hive.status}
            isQueen={isQueen}
            selectedRound={selectedRound}
            onSelectRound={setSelectedRound}
            onAdvanceRound={advanceRound}
            onTriggerConvergence={triggerConvergence}
          />

          {hive.governance.allow_human_injection && (
            <HumanInjectionPanel hiveId={hive.id} currentRound={currentRound} />
          )}

          {/* Participants */}
          <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">Participants</h3>
              <span className="text-[11px] text-adv-gray ml-auto">
                <Crown className="inline h-3 w-3 -mt-0.5 mr-0.5 text-adv-gold" />
                Queen: <span className="font-mono">{hive.created_by.slice(-8)}</span>
              </span>
            </div>
            <div className="px-3 py-2">
              <HiveParticipantList participants={participants} emptyMessage="No participants yet." />
            </div>
          </div>

          {/* Governance summary */}
          <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">Governance</h3>
            </div>
            <dl className="px-4 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
              <Setting label="Consensus" value={hive.governance.consensus_mode ?? '—'} />
              <Setting label="Max rounds" value={String(hive.governance.max_rounds ?? '—')} />
              <Setting label="Threshold" value={hive.governance.convergence_threshold != null ? `${(hive.governance.convergence_threshold * 100).toFixed(0)}%` : '—'} />
              <Setting label="Late join" value={hive.governance.allow_late_join ? 'Allowed' : 'Disabled'} />
              <Setting label="Output" value={hive.governance.output_format ?? '—'} />
              <Setting label="Dissent" value={hive.governance.require_dissent_on_disagree ? 'Required' : 'Optional'} />
            </dl>
          </div>
        </aside>
      </div>
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
    <>
      <dt className="text-[10px] uppercase tracking-wider text-adv-gray font-semibold">{label}</dt>
      <dd className="text-adv-off-white text-right">{value}</dd>
    </>
  );
}
