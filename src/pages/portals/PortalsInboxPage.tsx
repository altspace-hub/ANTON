/**
 * PortalsInboxPage — /portals/inbox
 *
 * Cross-portal capability invocation inbox. Surfaces every capability_invoke
 * across all the user's portals, sorted newest-first, filterable by status.
 * Click a row → drill into that portal's manage page (Inbox tab).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Loader2, AlertCircle, MessageSquare, Globe } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

type Status = 'all' | 'pending' | 'acknowledged' | 'responded' | 'rejected';

interface Invocation {
  id: string;
  portal_id: string;
  portal_name: string;
  portal_namespace: string;
  portal_title: string | null;
  capability_id: string;
  capability_verb: string;
  aap_endpoint: string;
  visitor_contact_hash: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  response_id: string;
  status: string;
  received_at: string;
  acknowledged_at: string | null;
  responded_at: string | null;
}

export default function PortalsInboxPage() {
  const [filter, setFilter] = useState<Status>('pending');
  const [items, setItems] = useState<Invocation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({ limit: '200' });
        if (filter !== 'all') params.set('status', filter);
        const res = await fetchWithAuth(`/api/portals/inbox?${params}`);
        if (!res.ok) throw new Error(`Failed to load inbox (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        setItems(json.invocations ?? []);
        setTotal(json.total ?? 0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-adv-teal/10"><Inbox className="h-7 w-7 text-adv-teal" aria-hidden /></div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">Inbox</h1>
            <p className="text-sm text-adv-gray mt-1">
              Capability invocations from visitors across all your portals. Pending items are waiting for your response.
            </p>
          </div>
          <span className="text-xs text-adv-gray">{total} total</span>
        </header>

        {/* Status filter */}
        <div className="flex flex-wrap gap-2">
          {(['pending', 'acknowledged', 'responded', 'rejected', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${filter === s ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card border border-border text-adv-gray hover:text-adv-off-white'}`}
            >{s}</button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-adv-gray"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-adv-card p-10 text-center">
            <MessageSquare className="h-10 w-10 text-adv-gray mx-auto mb-3" />
            <p className="text-sm text-adv-off-white font-medium">
              {filter === 'pending' ? 'No pending invocations' : `No ${filter} invocations`}
            </p>
            <p className="text-xs text-adv-gray mt-1 max-w-md mx-auto">
              When a visitor invokes a capability on one of your portals, it lands here for you to action.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((inv) => {
              const portalAddress = `${inv.portal_name}.${inv.portal_namespace}.portal`;
              return (
                <li key={inv.id}>
                  <Link
                    to={`/portals/${inv.portal_id}/manage`}
                    className="block rounded-lg border border-border bg-adv-card p-3 hover:border-adv-teal transition"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-adv-teal/10 text-adv-teal text-xs">{inv.capability_verb}</span>
                        <span className="font-medium text-sm">{inv.capability_id}</span>
                        <code className="text-xs text-adv-gray">{inv.response_id}</code>
                      </div>
                      <StatusBadge status={inv.status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-adv-gray">
                      <Globe className="h-3 w-3" />
                      <code className="text-adv-teal">{portalAddress}</code>
                      {inv.portal_title && <span>· {inv.portal_title}</span>}
                      <span className="ml-auto">{new Date(inv.received_at).toLocaleString()}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'pending' ? 'bg-adv-gold/15 text-adv-gold' :
    status === 'acknowledged' ? 'bg-adv-blue/15 text-adv-blue' :
    status === 'responded' ? 'bg-adv-green/15 text-adv-green' :
    status === 'rejected' ? 'bg-adv-red/15 text-adv-red' :
    'bg-adv-gray/15 text-adv-gray';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{status}</span>;
}
