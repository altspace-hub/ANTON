/**
 * ActivityFeed — chronological event log for a mission.
 */

interface ActivityEntry {
  id: number;
  timestamp: string;
  activity_type: string;
  description: string | null;
  task_id: string | null;
  tokens_consumed: number;
}

const TYPE_COLOR: Record<string, string> = {
  mission_created: 'text-adv-gray',
  mission_started: 'text-adv-teal',
  mission_paused: 'text-adv-gold',
  mission_resumed: 'text-adv-teal',
  mission_completed: 'text-adv-green',
  mission_aborted: 'text-adv-red',
  task_started: 'text-adv-blue',
  task_completed: 'text-adv-green',
  task_failed: 'text-adv-red',
  task_retried: 'text-adv-gold',
  checkpoint_reached: 'text-adv-gold',
  checkpoint_approved: 'text-adv-green',
  checkpoint_rejected: 'text-adv-red',
  budget_warning: 'text-adv-gold',
  budget_exceeded: 'text-adv-red',
  plan_decomposed: 'text-adv-teal',
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

export default function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-[11px] text-adv-gray italic">No activity yet.</p>;
  }
  return (
    <ul className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
      {entries.map(e => (
        <li key={e.id} className="flex items-start gap-2 text-[11px]">
          <span className="text-adv-gray/60 shrink-0 w-10">{relativeTime(e.timestamp)}</span>
          <span className={`shrink-0 w-32 truncate ${TYPE_COLOR[e.activity_type] ?? 'text-adv-gray'}`}>
            {e.activity_type.replace(/_/g, ' ')}
          </span>
          <span className="text-adv-off-white flex-1 min-w-0">
            {e.description || '—'}
            {e.tokens_consumed > 0 && (
              <span className="ml-1 text-adv-gray/60">({e.tokens_consumed.toLocaleString()} tok)</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
