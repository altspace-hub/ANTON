/**
 * PathfinderActionsPage — smart-action register across all searches.
 *
 * Shows the actions the AI has surfaced from past searches: what was
 * suggested, what was executed, what was dismissed. Users can re-execute
 * a suggested action or batch-dismiss noise.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Compass, Phone, Map, Globe, UserPlus, Building2, ListTodo, Landmark, ShoppingCart, BookmarkPlus, Layers, Bot } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface SmartAction {
  id: string;
  search_id: string;
  user_id: string;
  generated_at: string;
  action_type: string;
  label: string;
  description: string | null;
  priority: 'high' | 'medium' | 'low';
  data: Record<string, unknown>;
  status: 'suggested' | 'executed' | 'dismissed' | 'queued';
  executed_at: string | null;
  result_ref: string | null;
}

const TYPE_META: Record<string, { icon: React.ReactNode }> = {
  call:          { icon: <Phone size={14} /> },
  directions:    { icon: <Map size={14} /> },
  website:       { icon: <Globe size={14} /> },
  save_contact:  { icon: <UserPlus size={14} /> },
  save_org:      { icon: <Building2 size={14} /> },
  create_task:   { icon: <ListTodo size={14} /> },
  start_civic:   { icon: <Landmark size={14} /> },
  start_procure: { icon: <ShoppingCart size={14} /> },
  save_knowledge: { icon: <BookmarkPlus size={14} /> },
  open_module:   { icon: <Layers size={14} /> },
  task_agent:    { icon: <Bot size={14} /> },
};

const PRIORITY_META: Record<SmartAction['priority'], { classes: string }> = {
  high:   { classes: 'text-adv-red border-adv-red/40 bg-adv-red/10' },
  medium: { classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  low:    { classes: 'text-adv-gray border-border bg-adv-dark' },
};

const STATUS_META: Record<SmartAction['status'], { classes: string; label: string }> = {
  suggested: { classes: 'text-adv-teal',  label: 'suggested' },
  executed:  { classes: 'text-adv-green', label: 'executed' },
  dismissed: { classes: 'text-adv-gray',  label: 'dismissed' },
  queued:    { classes: 'text-adv-gold',  label: 'queued' },
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function PathfinderActionsPage() {
  const [actions, setActions] = useState<SmartAction[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/pathfinder/actions', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { actions?: SmartAction[] }) => setActions(data.actions ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load actions'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = actions
    .filter(a => !filterStatus || a.status === filterStatus)
    .filter(a => !filterType || a.action_type === filterType);

  const types = Array.from(new Set(actions.map(a => a.action_type))).sort();

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/pathfinder" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <Compass className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Smart actions</h1>
            <p className="text-adv-gray text-sm">Actionable items extracted from past Pathfinder searches.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All statuses</option>
            <option value="suggested">Suggested</option>
            <option value="executed">Executed</option>
            <option value="dismissed">Dismissed</option>
            <option value="queued">Queued</option>
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading actions…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
            <Compass className="mx-auto mb-2 text-adv-gray/40" size={32} />
            No smart actions yet. Run a Pathfinder search to generate some.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(a => {
              const tm = TYPE_META[a.action_type] ?? { icon: <Layers size={14} /> };
              const pm = PRIORITY_META[a.priority];
              const sm = STATUS_META[a.status];
              return (
                <li key={a.id} className="bg-adv-card rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <div className="text-adv-teal mt-1">{tm.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${pm.classes}`}>{a.priority}</span>
                        <span className={`text-xs font-medium ${sm.classes}`}>{sm.label}</span>
                        <code className="text-xs text-adv-teal">{a.action_type}</code>
                      </div>
                      <div className="font-medium text-sm">{a.label}</div>
                      {a.description && <p className="text-xs text-adv-gray mt-1">{a.description}</p>}
                      <div className="text-xs text-adv-gray mt-1">{timeAgo(a.generated_at)}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
