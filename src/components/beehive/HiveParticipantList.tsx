/**
 * HiveParticipantList — compact participant cards.
 *
 * Shows each participant's role, disclosure level, contribution count,
 * and presence status. Used inline in the hive detail panel.
 */

import { Crown, User, Search, Eye, Circle, MoonStar } from 'lucide-react';

export type HiveRole = 'queen' | 'worker' | 'scout' | 'observer';
export type ParticipantInvitationStatus = 'invited' | 'joined' | 'declined' | 'left';
export type ParticipantStatus = 'active' | 'idle' | 'left';
export type DisclosureLevel = 'reasoning_only' | 'atoms_tagged' | 'atoms_domain' | 'full_context';

export interface ParticipantSummary {
  anton_contact_hash: string;
  display_name: string;
  role: HiveRole;
  invitation_status: ParticipantInvitationStatus;
  status: ParticipantStatus;
  contribution_count: number;
  disclosure_policy?: { level?: DisclosureLevel };
  joined_at?: string | null;
  last_active_at?: string | null;
}

const ROLE_META: Record<HiveRole, { label: string; icon: React.ReactNode; color: string }> = {
  queen:    { label: 'Queen',    icon: <Crown className="h-3.5 w-3.5" />,  color: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  worker:   { label: 'Worker',   icon: <User className="h-3.5 w-3.5" />,   color: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  scout:    { label: 'Scout',    icon: <Search className="h-3.5 w-3.5" />, color: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  observer: { label: 'Observer', icon: <Eye className="h-3.5 w-3.5" />,    color: 'text-adv-gray border-border bg-adv-dark' },
};

const DISCLOSURE_LABELS: Record<DisclosureLevel, string> = {
  reasoning_only: 'Reasoning only',
  atoms_tagged: 'Tagged atoms',
  atoms_domain: 'Domain atoms',
  full_context: 'Full context',
};

function statusDot(invitationStatus: ParticipantInvitationStatus, status: ParticipantStatus) {
  if (invitationStatus === 'invited') return { color: 'text-adv-gold', label: 'Invited', icon: <Circle className="h-2 w-2 fill-current" /> };
  if (invitationStatus === 'declined') return { color: 'text-adv-gray/60', label: 'Declined', icon: <Circle className="h-2 w-2 fill-current" /> };
  if (status === 'left' || invitationStatus === 'left') return { color: 'text-adv-gray/60', label: 'Left', icon: <Circle className="h-2 w-2 fill-current" /> };
  if (status === 'idle') return { color: 'text-adv-gray', label: 'Idle', icon: <MoonStar className="h-2.5 w-2.5" /> };
  return { color: 'text-adv-green', label: 'Active', icon: <Circle className="h-2 w-2 fill-current" /> };
}

interface HiveParticipantListProps {
  participants: ParticipantSummary[];
  emptyMessage?: string;
}

export default function HiveParticipantList({ participants, emptyMessage = 'No participants yet.' }: HiveParticipantListProps) {
  if (participants.length === 0) {
    return <p className="text-xs text-adv-gray italic">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-2">
      {participants.map((p) => {
        const role = ROLE_META[p.role];
        const dot = statusDot(p.invitation_status, p.status);
        const disclosureLabel = p.disclosure_policy?.level ? DISCLOSURE_LABELS[p.disclosure_policy.level] : null;
        return (
          <li
            key={p.anton_contact_hash}
            className="flex items-center gap-3 rounded-lg border border-border bg-adv-dark px-3 py-2"
          >
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${role.color}`}>
              {role.icon}
              {role.label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-adv-off-white">{p.display_name}</span>
                <span className={`inline-flex items-center gap-1 text-[10px] ${dot.color}`}>
                  {dot.icon}
                  {dot.label}
                </span>
              </div>
              <div className="font-mono text-[10px] text-adv-gray truncate">{p.anton_contact_hash}</div>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              {disclosureLabel && (
                <span className="text-[10px] text-adv-gray">{disclosureLabel}</span>
              )}
              <span className="text-[10px] text-adv-gray">{p.contribution_count} contrib.</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
