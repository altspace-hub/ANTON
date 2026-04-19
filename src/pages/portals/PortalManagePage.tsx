/**
 * PortalManagePage — /portals/:id/manage
 *
 * Owner dashboard for a single portal. Tabs: Overview / Pages / Inbox / Export.
 * Destructive actions (delete portal) gated through ConfirmModal.
 */

import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Globe, ChevronLeft, Loader2, AlertCircle, Trash2, Download, Inbox, FileText, Eye } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import ConfirmModal from '@/components/hardware/ConfirmModal';

interface PortalDetail {
  portal: {
    id: string;
    name: string;
    namespace: string;
    display_title: string | null;
    description: string | null;
    category: string;
    status: string;
    public_index: boolean;
    descriptor_hash: string | null;
    capability_summary: { capabilityVerbs?: string[]; tags?: string[] } | null;
    registered_at: string | null;
    last_synced_at: string | null;
    created_at: string;
  };
  pageCount: number;
  inboxPending: number;
}

interface Page { id: string; path: string; title: string | null; html: string; sortOrder: number; visible: boolean; updatedAt: string }
interface Invocation { id: string; capability_id: string; capability_verb: string; aap_endpoint: string; visitor_contact_hash: string | null; input: Record<string, unknown>; output: Record<string, unknown> | null; status: string; received_at: string; response_id: string }

type Tab = 'overview' | 'pages' | 'inbox' | 'export';

export default function PortalManagePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [detail, setDetail] = useState<PortalDetail | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [inbox, setInbox] = useState<Invocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      try {
        const res = await fetchWithAuth(`/api/portals/${id}`);
        if (!res.ok) throw new Error(`Failed to load portal (${res.status})`);
        const json = await res.json();
        if (!cancelled) setDetail(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!id || tab !== 'pages') return;
    void (async () => {
      const res = await fetchWithAuth(`/api/portals/${id}/pages`);
      if (res.ok) {
        const j = await res.json();
        setPages(j.pages ?? []);
      }
    })();
  }, [id, tab]);

  useEffect(() => {
    if (!id || tab !== 'inbox') return;
    void (async () => {
      const res = await fetchWithAuth(`/api/portals/${id}/inbox`);
      if (res.ok) {
        const j = await res.json();
        setInbox(j.invocations ?? []);
      }
    })();
  }, [id, tab]);

  async function downloadBundle(asTemplate: boolean) {
    if (!id) return;
    const url = `/api/portals/${id}/bundle${asTemplate ? '?template=1' : ''}`;
    const res = await fetchWithAuth(url);
    if (!res.ok) { setError(`Bundle download failed (${res.status})`); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `portal-${detail?.portal.name}.${detail?.portal.namespace}.anton`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function performDelete() {
    if (!id) return;
    const res = await fetchWithAuth(`/api/portals/${id}`, { method: 'DELETE' });
    if (res.ok) navigate('/portals'); else setError(`Delete failed (${res.status})`);
  }

  if (loading) return <CenterMsg><Loader2 className="h-5 w-5 animate-spin" /> Loading portal…</CenterMsg>;
  if (error && !detail) return <CenterMsg><AlertCircle className="h-5 w-5 text-adv-red" /> {error}</CenterMsg>;
  if (!detail) return null;
  const { portal, pageCount, inboxPending } = detail;
  const portalAddress = `${portal.name}.${portal.namespace}.portal`;

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Link to="/portals" className="inline-flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal mb-4">
          <ChevronLeft className="h-4 w-4" /> All portals
        </Link>

        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-adv-teal/10"><Globe className="h-7 w-7 text-adv-teal" /></div>
            <div>
              <h1 className="text-xl font-semibold">{portal.display_title ?? portal.name}</h1>
              <code className="text-sm text-adv-teal">{portalAddress}</code>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded ${portal.status === 'active' ? 'bg-adv-green/15 text-adv-green' : 'bg-adv-gray/15 text-adv-gray'}`}>{portal.status}</span>
                <span className="px-2 py-0.5 rounded bg-adv-card">{portal.category}</span>
                {portal.public_index && <span className="px-2 py-0.5 rounded bg-adv-teal/10 text-adv-teal">discoverable</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/portals/p/${encodeURIComponent(portalAddress)}`}
              className="px-3 py-2 rounded-lg border border-border text-sm hover:border-adv-teal flex items-center gap-1"
            ><Eye className="h-4 w-4" /> Visit</Link>
            <button
              onClick={() => setDeleteOpen(true)}
              className="px-3 py-2 rounded-lg border border-adv-red/40 text-adv-red text-sm hover:bg-adv-red/10 flex items-center gap-1"
            ><Trash2 className="h-4 w-4" /> Delete</button>
          </div>
        </header>

        <nav className="flex gap-1 mb-4 border-b border-border">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabButton>
          <TabButton active={tab === 'pages'} onClick={() => setTab('pages')}>Pages ({pageCount})</TabButton>
          <TabButton active={tab === 'inbox'} onClick={() => setTab('inbox')}>Inbox ({inboxPending} pending)</TabButton>
          <TabButton active={tab === 'export'} onClick={() => setTab('export')}>Export</TabButton>
        </nav>

        {error && <div className="mb-4 flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm"><AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0 mt-0.5" />{error}</div>}

        {tab === 'overview' && <OverviewTab portal={portal} pageCount={pageCount} inboxPending={inboxPending} />}
        {tab === 'pages' && <PagesTab pages={pages} />}
        {tab === 'inbox' && <InboxTab invocations={inbox} />}
        {tab === 'export' && <ExportTab onDownload={downloadBundle} />}
      </div>

      <ConfirmModal
        open={deleteOpen}
        title="Delete portal?"
        description={`This permanently deletes "${portalAddress}", all its pages, assets, structured data, and inbox. This cannot be undone.`}
        confirmLabel="Delete portal"
        severity="destructive"
        requireTypedConfirmation={portal.name}
        onConfirm={async () => { await performDelete(); }}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

function OverviewTab({ portal, pageCount, inboxPending }: { portal: PortalDetail['portal']; pageCount: number; inboxPending: number }) {
  const verbs = portal.capability_summary?.capabilityVerbs ?? [];
  const tags = portal.capability_summary?.tags ?? [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card title="Identity">
        <KV label="Name" value={<code className="text-adv-teal">{portal.name}</code>} />
        <KV label="Namespace" value={portal.namespace} />
        <KV label="Category" value={portal.category} />
        <KV label="Public index" value={portal.public_index ? 'yes' : 'no'} />
      </Card>
      <Card title="Activity">
        <KV label="Pages" value={String(pageCount)} />
        <KV label="Inbox pending" value={String(inboxPending)} />
        <KV label="Created" value={new Date(portal.created_at).toLocaleDateString()} />
        <KV label="Last sync" value={portal.last_synced_at ? new Date(portal.last_synced_at).toLocaleString() : '—'} />
      </Card>
      <Card title="Capability summary">
        {verbs.length === 0 ? <p className="text-sm text-adv-gray">No capabilities published yet.</p> : (
          <div className="flex flex-wrap gap-1">
            {verbs.map(v => <span key={v} className="px-2 py-0.5 rounded bg-adv-teal/10 text-adv-teal text-xs">{v}</span>)}
          </div>
        )}
      </Card>
      <Card title="Discovery tags">
        {tags.length === 0 ? <p className="text-sm text-adv-gray">No tags.</p> : (
          <div className="flex flex-wrap gap-1">
            {tags.map(t => <span key={t} className="px-2 py-0.5 rounded bg-adv-card text-adv-gray text-xs">{t}</span>)}
          </div>
        )}
      </Card>
      <Card title="Descriptor binding" wide>
        <KV label="Hash" value={<code className="text-xs break-all">{portal.descriptor_hash ?? '—'}</code>} />
      </Card>
    </div>
  );
}

function PagesTab({ pages }: { pages: Page[] }) {
  if (pages.length === 0) return (
    <div className="rounded-xl border border-dashed border-border bg-adv-card p-10 text-center">
      <FileText className="h-10 w-10 text-adv-gray mx-auto mb-3" />
      <p className="text-sm text-adv-off-white font-medium">No pages yet</p>
      <p className="text-xs text-adv-gray mt-1 max-w-md mx-auto">
        Pages are seeded from your template during the walkthrough. Re-run the walkthrough or import a portal bundle to populate this surface.
      </p>
    </div>
  );
  return (
    <div className="space-y-2">
      {pages.map((p) => (
        <div key={p.id} className="rounded-lg border border-border bg-adv-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="font-medium">{p.title ?? p.path}</div>
              <code className="text-xs text-adv-teal">{p.path}</code>
            </div>
            <div className="text-xs text-adv-gray">{p.visible ? 'visible' : 'hidden'} · order {p.sortOrder}</div>
          </div>
          <details className="mt-2">
            <summary className="text-xs text-adv-gray cursor-pointer hover:text-adv-off-white">View HTML ({p.html.length} chars)</summary>
            <pre className="mt-2 text-xs bg-adv-dark p-2 rounded overflow-x-auto whitespace-pre-wrap">{p.html}</pre>
          </details>
        </div>
      ))}
    </div>
  );
}

function InboxTab({ invocations }: { invocations: Invocation[] }) {
  if (invocations.length === 0) return <div className="text-sm text-adv-gray">Inbox is empty. Visitor capability calls will appear here.</div>;
  return (
    <div className="space-y-2">
      {invocations.map((inv) => (
        <div key={inv.id} className="rounded-lg border border-border bg-adv-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="font-medium">{inv.capability_verb} · {inv.capability_id}</div>
              <code className="text-xs text-adv-teal">{inv.response_id}</code>
            </div>
            <div className="text-xs text-adv-gray">
              <StatusBadge status={inv.status} /> · {new Date(inv.received_at).toLocaleString()}
            </div>
          </div>
          <details className="mt-2">
            <summary className="text-xs text-adv-gray cursor-pointer hover:text-adv-off-white">Input + output</summary>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-adv-gray mb-1">Input</div>
                <pre className="bg-adv-dark p-2 rounded overflow-x-auto whitespace-pre-wrap">{JSON.stringify(inv.input, null, 2)}</pre>
              </div>
              <div>
                <div className="text-adv-gray mb-1">Output</div>
                <pre className="bg-adv-dark p-2 rounded overflow-x-auto whitespace-pre-wrap">{JSON.stringify(inv.output, null, 2)}</pre>
              </div>
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}

function ExportTab({ onDownload }: { onDownload: (asTemplate: boolean) => void }) {
  return (
    <div className="space-y-3 max-w-xl">
      <p className="text-sm text-adv-gray">Export this portal as a portable .anton bundle. The bundle includes the manifest, the signed capability descriptor, all pages, all assets, and the walkthrough transcript.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button onClick={() => onDownload(false)} className="rounded-lg border border-border bg-adv-card p-4 text-left hover:border-adv-teal transition">
          <div className="flex items-center gap-2 font-medium"><Download className="h-4 w-4 text-adv-teal" /> Full bundle</div>
          <div className="text-xs text-adv-gray mt-1">Includes identity. Use this for backup or migrating to another instance.</div>
        </button>
        <button onClick={() => onDownload(true)} className="rounded-lg border border-border bg-adv-card p-4 text-left hover:border-adv-teal transition">
          <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-adv-teal" /> Template (redacted)</div>
          <div className="text-xs text-adv-gray mt-1">Strips identity-bearing fields. Share this with others to clone the portal shape.</div>
        </button>
      </div>
    </div>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 transition ${active ? 'border-adv-teal text-adv-off-white' : 'border-transparent text-adv-gray hover:text-adv-off-white'}`}
    >{children}</button>
  );
}

function Card({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-border bg-adv-card p-4 ${wide ? 'md:col-span-2' : ''}`}>
      <div className="text-xs uppercase tracking-wide text-adv-gray mb-3">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-adv-gray">{label}</span>
      <span>{value}</span>
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
  return <span className={`px-1.5 py-0.5 rounded text-xs ${cls}`}>{status}</span>;
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-sm text-adv-gray gap-2">{children}</div>;
}
