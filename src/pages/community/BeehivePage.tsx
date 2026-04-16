/**
 * BeehivePage — dashboard for ANTON-to-ANTON multi-party reasoning sessions.
 *
 * Phase 1: list + create + navigate. Round/contribution UI lands in Phase 2.
 *
 * In v1 (local-only) hives only exist on this ANTON. The Queen identity is
 * read from /api/beehive/identity (which queries community_identity). If the
 * local identity has not been activated, the user is prompted to do so first.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Hexagon, Plus, RefreshCcw, ChevronRight, Brain, Wrench, Eye, MessageSquarePlus, AlertCircle, Trash2 } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';
import HiveCreator from '../../components/beehive/HiveCreator';

// ── Types ────────────────────────────────────────────────────────────

type HiveType = 'deliberation' | 'build' | 'review' | 'brainstorm';
type HiveStatus = 'forming' | 'active' | 'converging' | 'concluded' | 'archived';

interface Hive {
  id: string;
  name: string;
  question: string;
  description: string | null;
  type: HiveType;
  status: HiveStatus;
  governance: { consensus_mode?: string; max_rounds?: number; convergence_threshold?: number };
  created_by: string;
  max_participants: number;
  current_round: number;
  consensus_temperature: number;
  created_at: string;
  concluded_at: string | null;
}

interface LocalIdentity {
  contact_hash: string;
  display_name: string;
}

const TYPE_META: Record<HiveType, { label: string; icon: React.ReactNode }> = {
  deliberation: { label: 'Deliberation', icon: <Brain className="h-3.5 w-3.5" /> },
  build:        { label: 'Build',        icon: <Wrench className="h-3.5 w-3.5" /> },
  review:       { label: 'Review',       icon: <Eye className="h-3.5 w-3.5" /> },
  brainstorm:   { label: 'Brainstorm',   icon: <MessageSquarePlus className="h-3.5 w-3.5" /> },
};

const STATUS_META: Record<HiveStatus, { label: string; classes: string }> = {
  forming:    { label: 'Forming',    classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  active:     { label: 'Active',     classes: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  converging: { label: 'Converging', classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  concluded:  { label: 'Concluded',  classes: 'text-adv-green border-adv-green/40 bg-adv-green/10' },
  archived:   { label: 'Archived',   classes: 'text-adv-gray border-border bg-adv-dark' },
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

// ── Card ─────────────────────────────────────────────────────────────

function HiveCard({ hive, isQueen, onArchived }: { hive: Hive; isQueen: boolean; onArchived: () => void }) {
  const navigate = useNavigate();
  const typeMeta = TYPE_META[hive.type];
  const statusMeta = STATUS_META[hive.status];
  const [archiving, setArchiving] = useState(false);

  async function handleArchive(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm(`Archive "${hive.name}"? This cannot be undone.`)) return;
    setArchiving(true);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${hive.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onArchived();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div
      className="group rounded-xl border border-border bg-adv-card hover:border-adv-teal/40 transition-colors cursor-pointer"
      onClick={() => navigate(`/community/beehive/${hive.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/community/beehive/${hive.id}`);
        }
      }}
      role="link"
      tabIndex={0}
    >
      <div className="px-4 py-3 flex items-start gap-3">
        <Hexagon className="h-5 w-5 text-adv-teal shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-adv-off-white truncate">{hive.name}</span>
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${statusMeta.classes}`}>
              {statusMeta.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-adv-gray">
              {typeMeta.icon}
              {typeMeta.label}
            </span>
            {isQueen && (
              <span className="text-[10px] text-adv-gold uppercase tracking-wider font-medium">Yours</span>
            )}
          </div>
          <p className="mt-1 text-xs text-adv-gray line-clamp-2">{hive.question}</p>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-adv-gray/80 flex-wrap">
            <span>Round {hive.current_round}</span>
            <span>·</span>
            <span>Consensus {(hive.consensus_temperature * 100).toFixed(0)}%</span>
            <span>·</span>
            <span>Cap {hive.max_participants}</span>
            <span>·</span>
            <span>Created {relativeTime(hive.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isQueen && hive.status !== 'archived' && (
            <button
              onClick={handleArchive}
              disabled={archiving}
              title="Archive hive"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded p-1.5 text-adv-gray hover:text-adv-red hover:bg-adv-red/10 transition-all disabled:opacity-50"
              aria-label={`Archive ${hive.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronRight className="h-4 w-4 text-adv-gray group-hover:text-adv-teal transition-colors" />
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function BeehivePage() {
  const [hives, setHives] = useState<Hive[]>([]);
  const [identity, setIdentity] = useState<LocalIdentity | null>(null);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreator, setShowCreator] = useState(false);

  const loadIdentity = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/beehive/identity', { headers: getAuthHeader() });
      const data = await res.json();
      setIdentity(data.identity ?? null);
    } catch {
      setIdentity(null);
    } finally {
      setIdentityChecked(true);
    }
  }, []);

  const loadHives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/beehive/hives?status=forming,active,converging,concluded', { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setHives(data.hives ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIdentity();
    void loadHives();
  }, [loadIdentity, loadHives]);

  const grouped = {
    active:    hives.filter(h => h.status === 'active' || h.status === 'converging'),
    forming:   hives.filter(h => h.status === 'forming'),
    concluded: hives.filter(h => h.status === 'concluded'),
  };

  const queenHash = identity?.contact_hash ?? null;
  const queenName = identity?.display_name ?? null;
  const canCreate = !!queenHash && !!queenName;

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <Hexagon className="h-7 w-7 text-adv-teal" />
            <h1 className="text-2xl font-semibold text-adv-off-white">Beehive</h1>
          </div>
          <p className="mt-1 text-sm text-adv-gray max-w-2xl">
            Multi-party reasoning sessions. Multiple ANTONs deliberate together over time, each
            bringing its own knowledge and perspective. The output is something no single ANTON
            could produce alone.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadHives()}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreator(true)}
            disabled={!canCreate}
            title={canCreate ? 'Create a new Beehive' : 'Activate community identity first'}
            className="rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            Create Hive
          </button>
        </div>
      </div>

      {/* Identity prompt */}
      {identityChecked && !identity && (
        <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/10 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-adv-gold shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-adv-gold font-medium">Activate your ANTON identity to use Beehive</p>
            <p className="mt-1 text-xs text-adv-gold/80">
              Beehive sessions need a Queen identity. Activate your contact hash on the Identity page first.
            </p>
            <Link to="/community/identity" className="mt-2 inline-block text-xs text-adv-teal hover:underline">
              Go to My Identity →
            </Link>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Sections */}
      {loading && hives.length === 0 ? (
        <div className="text-center py-12 text-sm text-adv-gray">Loading hives…</div>
      ) : hives.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-adv-card/50 p-10 text-center">
          <Hexagon className="h-10 w-10 text-adv-teal/40 mx-auto" />
          <p className="mt-3 text-sm text-adv-off-white font-medium">No hives yet</p>
          <p className="mt-1 text-xs text-adv-gray max-w-md mx-auto">
            Start your first multi-party reasoning session. Frame a question, invite other ANTONs,
            and let the group deliberate.
          </p>
          {canCreate && (
            <button
              onClick={() => setShowCreator(true)}
              className="mt-4 rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Create your first Hive
            </button>
          )}
        </div>
      ) : (
        <>
          {grouped.active.length > 0 && (
            <Section title="Active" hint="In progress">
              {grouped.active.map(h => (
                <HiveCard key={h.id} hive={h} isQueen={!!queenHash && queenHash === h.created_by} onArchived={loadHives} />
              ))}
            </Section>
          )}
          {grouped.forming.length > 0 && (
            <Section title="Forming" hint="Awaiting participants">
              {grouped.forming.map(h => (
                <HiveCard key={h.id} hive={h} isQueen={!!queenHash && queenHash === h.created_by} onArchived={loadHives} />
              ))}
            </Section>
          )}
          {grouped.concluded.length > 0 && (
            <Section title="Concluded" hint="Output produced">
              {grouped.concluded.map(h => (
                <HiveCard key={h.id} hive={h} isQueen={!!queenHash && queenHash === h.created_by} onArchived={loadHives} />
              ))}
            </Section>
          )}
        </>
      )}

      {/* Creator modal */}
      {showCreator && queenHash && queenName && (
        <HiveCreator
          queenContactHash={queenHash}
          queenDisplayName={queenName}
          onClose={() => setShowCreator(false)}
          onCreated={(id) => { setShowCreator(false); void loadHives(); }}
        />
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">{title}</h2>
        <span className="text-[11px] text-adv-gray">{hint}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
