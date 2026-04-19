/**
 * PortalsLandingPage — /portals
 *
 * Hub for the Portals area. Sub-nav (Build new / Discovery / Inbox) lives in
 * the global Sidebar (rendered conditionally when path matches /portals).
 * This page focuses on the user's own portals + quick stats + a CTA.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Plus, Loader2, AlertCircle, Search, Inbox, ShieldAlert } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface PortalRow {
  id: string;
  name: string;
  namespace: string;
  display_title: string | null;
  category: string;
  status: string;
  public_index: boolean;
  registered_at: string | null;
  last_synced_at: string | null;
  created_at: string;
}

interface InboxSummary {
  total: number;
}

interface TrustStatus {
  registryUrl: string | null;
  futurechainPlaceholder: boolean;
}

export default function PortalsLandingPage() {
  const [portals, setPortals] = useState<PortalRow[]>([]);
  const [inboxPending, setInboxPending] = useState(0);
  const [trustStatus, setTrustStatus] = useState<TrustStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [portalsRes, inboxRes, trustRes] = await Promise.all([
          fetchWithAuth('/api/portals'),
          fetchWithAuth('/api/portals/inbox?status=pending&limit=1'),
          fetchWithAuth('/api/portals/trust-bundle/status'),
        ]);
        if (!portalsRes.ok) throw new Error(`Failed to load portals (${portalsRes.status})`);
        const portalsJson = await portalsRes.json();
        const inboxJson: InboxSummary = inboxRes.ok ? await inboxRes.json() : { total: 0 };
        const trustJson: TrustStatus = trustRes.ok ? await trustRes.json() : { registryUrl: null, futurechainPlaceholder: true };
        if (cancelled) return;
        setPortals(portalsJson.portals ?? []);
        setInboxPending(inboxJson.total ?? 0);
        setTrustStatus(trustJson);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-adv-teal/10">
              <Globe className="h-7 w-7 text-adv-teal" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Portals</h1>
              <p className="text-sm text-adv-gray mt-1 max-w-2xl">
                Conversationally-built ANTON-only web spaces. Each portal is both a human-facing site
                and a machine-readable AAP endpoint. Use the left rail to build, discover, or process inbox.
              </p>
            </div>
          </div>
          <Link
            to="/portals/build"
            className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Build a new portal
          </Link>
        </header>

        {/* Trust-bundle warning: when the FutureChain operator key is still a
            placeholder, registry submissions are best-effort and the
            transparency log can't be verified. */}
        {trustStatus?.futurechainPlaceholder && (
          <div className="rounded-xl border border-adv-gold/40 bg-adv-gold/5 p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-adv-gold flex-shrink-0 mt-0.5" aria-hidden />
            <div className="text-sm">
              <div className="font-medium text-adv-gold">Registry operator key not installed</div>
              <p className="text-adv-gray mt-1">
                The bundled trust store still ships the FutureChain placeholder. Portals you build are
                fully usable locally, and other ANTONs that have your portal address can still verify
                your portal's signed descriptor — but registry transparency-log proofs cannot be
                verified until the real operator key is installed. Set
                {' '}<code className="text-adv-off-white">PORTAL_REGISTRY_URL</code> + ship the trust
                bundle update to enable end-to-end registry checks.
              </p>
            </div>
          </div>
        )}

        {/* Quick stats / CTAs */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard label="Your portals" value={portals.length} icon={<Globe className="h-5 w-5 text-adv-teal" />} to="/portals" />
          <StatCard label="Build new" value="Templates ready" icon={<Plus className="h-5 w-5 text-adv-teal" />} to="/portals/build" />
          <StatCard label="Inbox" value={`${inboxPending} pending`} icon={<Inbox className="h-5 w-5 text-adv-teal" />} to="/portals/inbox" highlight={inboxPending > 0} />
        </section>

        {/* Owner's portals */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-adv-gray">Your portals</h2>
            <Link to="/portals/discovery" className="text-xs text-adv-teal hover:underline flex items-center gap-1">
              <Search className="h-3 w-3" /> Discover others
            </Link>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-adv-gray text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm">
              <AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0 mt-0.5" />{error}
            </div>
          ) : portals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-adv-card p-10 text-center">
              <Globe className="h-10 w-10 text-adv-gray mx-auto mb-3" />
              <p className="text-adv-off-white text-sm font-medium">No portals yet</p>
              <p className="text-xs text-adv-gray mt-1 max-w-md mx-auto">
                Pick a template from the gallery and let the walkthrough guide you through 8 phases.
                Most portals take under 10 minutes.
              </p>
              <Link
                to="/portals/build"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium px-4 py-2 hover:bg-adv-teal-dark transition"
              >
                <Plus className="h-4 w-4" /> Build your first portal
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {portals.map((p) => (
                <Link
                  key={p.id}
                  to={`/portals/${p.id}/manage`}
                  className="rounded-xl border border-border bg-adv-card p-4 hover:border-adv-teal transition"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <div className="font-medium">{p.display_title ?? p.name}</div>
                    <StatusBadge status={p.status} />
                  </div>
                  <code className="text-xs text-adv-teal">{p.name}.{p.namespace}.portal</code>
                  <div className="mt-3 flex items-center gap-3 text-xs text-adv-gray">
                    <span className="px-2 py-0.5 rounded bg-adv-dark">{p.category}</span>
                    {p.public_index && <span className="text-adv-teal">discoverable</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, to, highlight }: { label: string; value: string | number; icon: React.ReactNode; to: string; highlight?: boolean }) {
  return (
    <Link
      to={to}
      className={`rounded-xl border bg-adv-card p-4 hover:border-adv-teal transition flex items-start gap-3 ${highlight ? 'border-adv-gold/40' : 'border-border'}`}
    >
      <div className="p-2 rounded-lg bg-adv-teal/10">{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-wide text-adv-gray">{label}</div>
        <div className={`text-lg font-semibold ${highlight ? 'text-adv-gold' : 'text-adv-off-white'}`}>{value}</div>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active' ? 'bg-adv-green/15 text-adv-green' :
    status === 'draft' ? 'bg-adv-gray/15 text-adv-gray' :
    status === 'suspended' ? 'bg-adv-red/15 text-adv-red' :
    status === 'revoked' ? 'bg-adv-red/15 text-adv-red' :
    'bg-adv-gray/15 text-adv-gray';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{status}</span>;
}
