/**
 * ContributionStream — chronological feed of hive contributions.
 *
 * Each contribution shows: contributor, type badge, content, supporting
 * atoms (collapsible), confidence, references. Grouped by round when no
 * round filter is active.
 */

import { useState } from 'react';
import { Crown, User, Search, FileText, MessageSquareWarning, GitBranch, GitCompare, GitMerge, HelpCircle, RotateCcw, AlertOctagon, Hammer, ClipboardCheck, ChevronDown, ChevronRight } from 'lucide-react';

interface ParticipantInfo {
  anton_contact_hash: string;
  display_name: string;
  role: 'queen' | 'worker' | 'scout' | 'observer';
}

export interface StreamContribution {
  id: string;
  round: number;
  contributor_hash: string;
  type: 'position' | 'evidence' | 'challenge' | 'synthesis' | 'question' | 'revision' | 'dissent' | 'build' | 'review_note';
  content: string;
  supporting_atoms: Array<{ atom_type: string; content: string; confidence: number; domain?: string; redacted: boolean }>;
  references_contributions: string[];
  confidence: number;
  created_at: string;
}

interface ContributionStreamProps {
  contributions: StreamContribution[];
  participants: ParticipantInfo[];
  selectedRound: number | null;
  emptyMessage?: string;
}

const TYPE_META: Record<StreamContribution['type'], { label: string; icon: React.ReactNode; classes: string }> = {
  position:    { label: 'Position',    icon: <FileText className="h-3 w-3" />,            classes: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  evidence:    { label: 'Evidence',    icon: <ClipboardCheck className="h-3 w-3" />,      classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  challenge:   { label: 'Challenge',   icon: <GitCompare className="h-3 w-3" />,          classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  synthesis:   { label: 'Synthesis',   icon: <GitMerge className="h-3 w-3" />,            classes: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  question:    { label: 'Question',    icon: <HelpCircle className="h-3 w-3" />,          classes: 'text-adv-gray border-border bg-adv-dark' },
  revision:    { label: 'Revision',    icon: <RotateCcw className="h-3 w-3" />,           classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  dissent:     { label: 'Dissent',     icon: <AlertOctagon className="h-3 w-3" />,        classes: 'text-adv-red border-adv-red/40 bg-adv-red/10' },
  build:       { label: 'Build',       icon: <Hammer className="h-3 w-3" />,              classes: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  review_note: { label: 'Review',      icon: <MessageSquareWarning className="h-3 w-3" />, classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
};

const ROLE_ICON: Record<ParticipantInfo['role'], React.ReactNode> = {
  queen:    <Crown className="h-3 w-3 text-adv-gold" />,
  worker:   <User className="h-3 w-3 text-adv-teal" />,
  scout:    <Search className="h-3 w-3 text-adv-blue" />,
  observer: <User className="h-3 w-3 text-adv-gray" />,
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function ContributionCard({ c, participants }: { c: StreamContribution; participants: ParticipantInfo[] }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[c.type];
  const participant = participants.find(p => p.anton_contact_hash === c.contributor_hash);
  const displayName = participant?.display_name ?? c.contributor_hash.slice(-12);
  const roleIcon = participant ? ROLE_ICON[participant.role] : <User className="h-3 w-3 text-adv-gray" />;

  return (
    <article
      className={`rounded-lg border bg-adv-card px-3 py-2.5 ${c.type === 'dissent' ? 'border-adv-red/30' : 'border-border'}`}
    >
      <header className="flex items-center gap-2 flex-wrap">
        {roleIcon}
        <span className="text-xs font-medium text-adv-off-white">{displayName}</span>
        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${meta.classes}`}>
          {meta.icon}
          {meta.label}
        </span>
        <span className="text-[10px] text-adv-gray">conf {(c.confidence * 100).toFixed(0)}%</span>
        <span className="text-[10px] text-adv-gray ml-auto">{relativeTime(c.created_at)} ago</span>
      </header>
      <p className="mt-2 text-xs text-adv-off-white whitespace-pre-wrap leading-relaxed">{c.content}</p>

      {(c.supporting_atoms.length > 0 || c.references_contributions.length > 0) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[11px] text-adv-gray hover:text-adv-teal inline-flex items-center gap-1"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {c.supporting_atoms.length > 0 && `${c.supporting_atoms.length} atom${c.supporting_atoms.length === 1 ? '' : 's'}`}
          {c.supporting_atoms.length > 0 && c.references_contributions.length > 0 && ' · '}
          {c.references_contributions.length > 0 && `${c.references_contributions.length} ref${c.references_contributions.length === 1 ? '' : 's'}`}
        </button>
      )}

      {expanded && c.supporting_atoms.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {c.supporting_atoms.map((a, i) => (
            <li key={i} className="rounded border border-border bg-adv-dark px-2 py-1.5 text-[11px] text-adv-gray">
              <div className="flex items-center gap-1.5 text-[10px] text-adv-gray/80 mb-0.5">
                <span className="rounded bg-adv-dark-2 px-1 py-0.5 font-medium text-adv-off-white">{a.atom_type}</span>
                {a.domain && <span>· {a.domain}</span>}
                <span>· conf {(a.confidence * 100).toFixed(0)}%</span>
                {a.redacted && <span className="text-adv-gold">· redacted</span>}
              </div>
              <p className="text-adv-off-white whitespace-pre-wrap">{a.content}</p>
            </li>
          ))}
        </ul>
      )}
      {expanded && c.references_contributions.length > 0 && (
        <div className="mt-2 text-[10px] text-adv-gray">
          References: {c.references_contributions.map(r => r.slice(-12)).join(', ')}
        </div>
      )}

      <div className="mt-1.5 font-mono text-[9px] text-adv-gray/60 truncate">{c.id}</div>
    </article>
  );
}

export default function ContributionStream({ contributions, participants, selectedRound, emptyMessage = 'No contributions yet.' }: ContributionStreamProps) {
  if (contributions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-adv-card/30 px-4 py-8 text-center text-xs text-adv-gray italic">
        {emptyMessage}
      </div>
    );
  }

  if (selectedRound !== null) {
    const filtered = contributions.filter(c => c.round === selectedRound);
    if (filtered.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border bg-adv-card/30 px-4 py-8 text-center text-xs text-adv-gray italic">
          No contributions in round {selectedRound} yet.
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {filtered.map(c => <ContributionCard key={c.id} c={c} participants={participants} />)}
      </div>
    );
  }

  // Group by round when no filter
  const groups = new Map<number, StreamContribution[]>();
  for (const c of contributions) {
    if (!groups.has(c.round)) groups.set(c.round, []);
    groups.get(c.round)!.push(c);
  }
  const sortedRounds = Array.from(groups.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      {sortedRounds.map(round => (
        <section key={round}>
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-adv-teal font-semibold">Round {round}</div>
          <div className="space-y-2">
            {(groups.get(round) ?? []).map(c => <ContributionCard key={c.id} c={c} participants={participants} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
