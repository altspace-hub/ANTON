/**
 * PortalManagePage — /portals/:id/manage
 *
 * Owner dashboard for a single portal. Tabs: Overview / Pages / Inbox / Export.
 * Destructive actions (delete portal) gated through ConfirmModal.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Globe, ChevronLeft, Loader2, AlertCircle, Trash2, Download, FileText, Eye, Image, Upload, Pencil, X, Share2, Copy, Check, RefreshCw } from 'lucide-react';
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
    surface_mode: 'managed' | 'external';
    external_primary_url: string | null;
    external_url_verified_at: string | null;
    descriptor_hash: string | null;
    capability_summary: { capabilityVerbs?: string[]; tags?: string[] } | null;
    registered_at: string | null;
    last_synced_at: string | null;
    created_at: string;
    /** Relay submission state lives in metadata (stamped by finalize +
     *  refreshed by GET /portals/:id/relay-status). */
    metadata: {
      relayStatus?: 'pending' | 'in_review' | 'approved' | 'rejected' | 'withdrawn';
      relaySubmissionId?: string;
      relaySubmittedAt?: string;
      relayReviewedAt?: string | null;
      relayRejectionReason?: string | null;
      relayLastSyncedAt?: string;
      relayError?: string;
    } | null;
  };
  pageCount: number;
  inboxPending: number;
}

interface Page { id: string; path: string; title: string | null; html: string; sortOrder: number; visible: boolean; updatedAt: string }
interface Invocation { id: string; capability_id: string; capability_verb: string; aap_endpoint: string; visitor_contact_hash: string | null; input: Record<string, unknown>; output: Record<string, unknown> | null; status: string; received_at: string; response_id: string }
interface Asset { id: string; path: string; mimeType: string; byteSize: number; contentHash: string; updatedAt: string }
interface CapabilityStat {
  capability_id: string; capability_verb: string;
  total: number; pending: number; acknowledged: number;
  responded: number; rejected: number;
  last_received_at: string | null;
}
interface CapabilityEdit {
  id: string; verb: string; customVerbName?: string;
  title: string; description: string; aapEndpoint: string;
  tags?: string[]; paymentCoupling?: { required?: boolean };
}

const VERBS = ['contact','inquire','request','order','pay','book','subscribe','join','query','publish','delegate','authenticate','custom'] as const;

type Tab = 'overview' | 'pages' | 'assets' | 'capabilities' | 'inbox' | 'export';

export default function PortalManagePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [detail, setDetail] = useState<PortalDetail | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityEdit[]>([]);
  const [inbox, setInbox] = useState<Invocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [stats, setStats] = useState<CapabilityStat[]>([]);

  async function refreshStats() {
    if (!id) return;
    const res = await fetchWithAuth(`/api/portals/${id}/stats`);
    if (res.ok) {
      const j = await res.json() as { stats: CapabilityStat[] };
      setStats(j.stats ?? []);
    }
  }

  async function refreshCapabilities() {
    if (!id) return;
    const res = await fetchWithAuth(`/api/portals/${id}/capabilities`);
    if (res.ok) {
      const j = await res.json() as { capabilities: CapabilityEdit[] };
      setCapabilities(j.capabilities ?? []);
    }
  }

  async function refreshDetail() {
    if (!id) return;
    const res = await fetchWithAuth(`/api/portals/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  async function saveCapabilities(next: CapabilityEdit[]): Promise<void> {
    if (!id) return;
    const res = await fetchWithAuth(`/api/portals/${id}/capabilities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capabilities: next }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `Save failed (${res.status})`);
    }
    await Promise.all([refreshCapabilities(), refreshDetail()]);
  }

  async function patchPortal(patch: {
    display_title?: string;
    description?: string;
    public_index?: boolean;
    surface_mode?: 'managed' | 'external';
    external_primary_url?: string | null;
  }): Promise<void> {
    if (!id) return;
    const res = await fetchWithAuth(`/api/portals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok && res.status !== 204) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `Update failed (${res.status})`);
    }
    await refreshDetail();
  }

  async function refreshPages() {
    if (!id) return;
    const res = await fetchWithAuth(`/api/portals/${id}/pages`);
    if (res.ok) {
      const j = await res.json();
      setPages(j.pages ?? []);
    }
  }

  async function refreshAssets() {
    if (!id) return;
    const res = await fetchWithAuth(`/api/portals/${id}/assets`);
    if (res.ok) {
      const j = await res.json();
      setAssets(j.assets ?? []);
    }
  }

  async function savePage(p: Page): Promise<void> {
    if (!id) return;
    const res = await fetchWithAuth(`/api/portals/${id}/pages`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: p.path, title: p.title ?? '', html: p.html,
        sortOrder: p.sortOrder, visible: p.visible,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `Save failed (${res.status})`);
    }
    await refreshPages();
  }

  async function uploadAsset(file: File, path: string): Promise<void> {
    if (!id) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('path', path);
    const res = await fetchWithAuth(`/api/portals/${id}/assets`, { method: 'POST', body: fd });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `Upload failed (${res.status})`);
    }
    await refreshAssets();
  }

  async function deleteAsset(path: string): Promise<void> {
    if (!id) return;
    const res = await fetchWithAuth(`/api/portals/${id}/assets?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `Delete failed (${res.status})`);
    }
    await refreshAssets();
  }

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
    void refreshPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tab]);

  useEffect(() => {
    if (!id || tab !== 'assets') return;
    void refreshAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tab]);

  useEffect(() => {
    if (!id || tab !== 'capabilities') return;
    void refreshCapabilities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tab]);

  // Stats live on the Overview tab — load once when the user lands there.
  useEffect(() => {
    if (!id || tab !== 'overview') return;
    void refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <button
              onClick={() => setShareOpen(true)}
              className="px-3 py-2 rounded-lg border border-border text-sm hover:border-adv-teal flex items-center gap-1"
            ><Share2 className="h-4 w-4" /> Share</button>
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

        <nav className="flex gap-1 mb-4 border-b border-border overflow-x-auto">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabButton>
          <TabButton active={tab === 'pages'} onClick={() => setTab('pages')}>Pages ({pageCount})</TabButton>
          <TabButton active={tab === 'assets'} onClick={() => setTab('assets')}>Assets ({assets.length})</TabButton>
          <TabButton active={tab === 'capabilities'} onClick={() => setTab('capabilities')}>Capabilities</TabButton>
          <TabButton active={tab === 'inbox'} onClick={() => setTab('inbox')}>Inbox ({inboxPending} pending)</TabButton>
          <TabButton active={tab === 'export'} onClick={() => setTab('export')}>Export</TabButton>
        </nav>

        {error && <div className="mb-4 flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm"><AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0 mt-0.5" />{error}</div>}

        {tab === 'overview' && (
          <OverviewTab
            portal={portal} pageCount={pageCount} inboxPending={inboxPending}
            stats={stats}
            onRelayRefreshed={refreshDetail}
            onTogglePublicIndex={async (v) => {
              try { await patchPortal({ public_index: v }); }
              catch (e) { setError(e instanceof Error ? e.message : String(e)); }
            }}
            onSurfaceSave={async (mode, url) => {
              try {
                await patchPortal({
                  surface_mode: mode,
                  external_primary_url: mode === 'external' ? url : null,
                });
                await refreshDetail();
              } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
            }}
          />
        )}
        {tab === 'pages' && <PagesTab pages={pages} onEdit={(p) => setEditingPage(p)} />}
        {tab === 'assets' && <AssetsTab assets={assets} onUpload={uploadAsset} onDelete={deleteAsset} onError={setError} />}
        {tab === 'capabilities' && (
          <CapabilitiesTab
            capabilities={capabilities}
            onSave={async (next) => {
              try { await saveCapabilities(next); }
              catch (e) { setError(e instanceof Error ? e.message : String(e)); throw e; }
            }}
          />
        )}
        {tab === 'inbox' && <InboxTab invocations={inbox} />}
        {tab === 'export' && <ExportTab onDownload={downloadBundle} />}

        {editingPage && (
          <EditPageModal
            page={editingPage}
            onClose={() => setEditingPage(null)}
            onSave={async (p) => { await savePage(p); setEditingPage(null); }}
          />
        )}
      </div>

      {shareOpen && (
        <ShareModal
          portalAddress={portalAddress}
          visitUrl={`${window.location.origin}/portals/p/${encodeURIComponent(portalAddress)}`}
          onClose={() => setShareOpen(false)}
        />
      )}

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

function OverviewTab({
  portal, pageCount, inboxPending, stats, onTogglePublicIndex, onSurfaceSave, onRelayRefreshed,
}: {
  portal: PortalDetail['portal'];
  pageCount: number;
  inboxPending: number;
  stats: CapabilityStat[];
  onTogglePublicIndex: (v: boolean) => void | Promise<void>;
  onSurfaceSave: (mode: 'managed' | 'external', url: string | null) => void | Promise<void>;
  onRelayRefreshed: () => void | Promise<void>;
}) {
  const verbs = portal.capability_summary?.capabilityVerbs ?? [];
  const tags = portal.capability_summary?.tags ?? [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card title="Identity">
        <KV label="Name" value={<code className="text-adv-teal">{portal.name}</code>} />
        <KV label="Namespace" value={portal.namespace} />
        <KV label="Category" value={portal.category} />
        <div className="flex items-center justify-between gap-2 text-sm pt-1">
          <span className="text-adv-gray">Public index</span>
          <label className="flex items-center gap-2 cursor-pointer" title="Toggle whether this portal appears in registry/LAN search">
            <input
              type="checkbox"
              checked={portal.public_index}
              onChange={(e) => { void onTogglePublicIndex(e.target.checked); }}
              className="accent-adv-teal"
            />
            <span className="text-xs">{portal.public_index ? 'discoverable' : 'private'}</span>
          </label>
        </div>
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
      <Card title="Network publication" wide>
        <RelayStatusPanel portal={portal} onRefreshed={onRelayRefreshed} />
      </Card>
      <Card title="Site surface" wide>
        <SurfaceEditor portal={portal} onSave={onSurfaceSave} />
      </Card>
      <Card title="Capability activity" wide>
        {stats.length === 0 ? (
          <p className="text-sm text-adv-gray">No invocations yet. Visitors haven't called any capability.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-adv-gray text-left">
                  <th className="pb-2 pr-3 font-normal">Capability</th>
                  <th className="pb-2 px-2 font-normal text-right">Total</th>
                  <th className="pb-2 px-2 font-normal text-right">Pending</th>
                  <th className="pb-2 px-2 font-normal text-right">Responded</th>
                  <th className="pb-2 px-2 font-normal text-right">Rejected</th>
                  <th className="pb-2 pl-2 font-normal">Last call</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.capability_id} className="border-t border-border/40">
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-adv-teal/10 text-adv-teal text-xs">{s.capability_verb}</span>
                        <code className="text-xs">{s.capability_id}</code>
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right">{s.total}</td>
                    <td className={`py-1.5 px-2 text-right ${s.pending > 0 ? 'text-adv-gold' : 'text-adv-gray'}`}>{s.pending}</td>
                    <td className="py-1.5 px-2 text-right text-adv-green">{s.responded}</td>
                    <td className={`py-1.5 px-2 text-right ${s.rejected > 0 ? 'text-adv-red' : 'text-adv-gray'}`}>{s.rejected}</td>
                    <td className="py-1.5 pl-2 text-xs text-adv-gray">
                      {s.last_received_at ? new Date(s.last_received_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Relay submission status (Network publication card) ──────────────────────
// Renders metadata.relayStatus + relaySubmissionId honestly. The refresh
// button hits GET /portals/:id/relay-status which polls the relay and
// persists the result back into metadata; we then ask the parent to
// re-fetch the portal so the card reflects the synced state.

type RelayStatusKey = 'pending' | 'in_review' | 'approved' | 'rejected' | 'withdrawn';

const RELAY_STATUS_META: Record<RelayStatusKey, { label: string; cls: string; copy: string }> = {
  pending: {
    label: 'pending review',
    cls: 'bg-adv-gold/15 text-adv-gold',
    copy: 'Submitted to the relay registry. The registry operator reviews your KYC details before the portal becomes discoverable network-wide — this is a human step, so there is no fixed turnaround.',
  },
  in_review: {
    label: 'in review',
    cls: 'bg-adv-gold/15 text-adv-gold',
    copy: 'The registry operator is reviewing your submission right now.',
  },
  approved: {
    label: 'approved',
    cls: 'bg-adv-green/15 text-adv-green',
    copy: 'Approved — this portal is discoverable by every ANTON and Comm App via the relay registry.',
  },
  rejected: {
    label: 'rejected',
    cls: 'bg-adv-red/15 text-adv-red',
    copy: 'The registry operator rejected this submission. The portal remains fully usable on this machine and your LAN.',
  },
  withdrawn: {
    label: 'withdrawn',
    cls: 'bg-adv-gray/15 text-adv-gray',
    copy: 'This submission was withdrawn. The portal remains local + LAN only.',
  },
};

function RelayStatusPanel({
  portal, onRefreshed,
}: {
  portal: PortalDetail['portal'];
  onRefreshed: () => void | Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const meta = portal.metadata ?? {};

  async function refresh() {
    setRefreshing(true);
    setSyncNote(null);
    try {
      const res = await fetchWithAuth(`/api/portals/${portal.id}/relay-status`);
      const j = await res.json().catch(() => ({})) as { syncOk?: boolean; syncError?: string };
      if (!res.ok) {
        setSyncNote(`Refresh failed (${res.status})`);
      } else if (j.syncOk === false) {
        setSyncNote(`Relay unreachable (${j.syncError ?? 'sync_failed'}) — showing the last known state.`);
      }
      await onRefreshed();
    } catch (e) {
      setSyncNote(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  if (!meta.relaySubmissionId) {
    return (
      <div className="space-y-2 text-sm">
        <span className="px-2 py-0.5 rounded text-xs bg-adv-gray/15 text-adv-gray">local + LAN only</span>
        <p className="text-xs text-adv-gray">
          This portal was not submitted to the relay registry, so it's only visible on this
          machine and your local network.
          {meta.relayError && meta.relayError !== 'kyc_fields_missing' && (
            <> The submission attempt at publish time failed: <code className="text-adv-red">{meta.relayError}</code>.</>
          )}
        </p>
      </div>
    );
  }

  const statusMeta = RELAY_STATUS_META[meta.relayStatus ?? 'pending'];
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={`px-2 py-0.5 rounded text-xs ${statusMeta.cls}`}>{statusMeta.label}</span>
        <button
          onClick={() => { void refresh(); }}
          disabled={refreshing}
          className="px-2 py-1 rounded border border-border text-xs text-adv-gray hover:text-adv-teal hover:border-adv-teal transition disabled:opacity-50 flex items-center gap-1.5"
          aria-label="Refresh relay submission status"
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>
      <p className="text-xs text-adv-gray">{statusMeta.copy}</p>
      {meta.relayStatus === 'rejected' && meta.relayRejectionReason && (
        <p className="text-xs text-adv-red">Reason: {meta.relayRejectionReason}</p>
      )}
      <KV label="Submission id" value={<code className="text-xs break-all">{meta.relaySubmissionId}</code>} />
      {meta.relaySubmittedAt && <KV label="Submitted" value={new Date(meta.relaySubmittedAt).toLocaleString()} />}
      {meta.relayLastSyncedAt && <KV label="Last refreshed" value={new Date(meta.relayLastSyncedAt).toLocaleString()} />}
      {syncNote && <p className="text-xs text-adv-gold">{syncNote}</p>}
    </div>
  );
}

function PagesTab({ pages, onEdit }: { pages: Page[]; onEdit: (p: Page) => void }) {
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
            <div className="flex items-center gap-3">
              <span className="text-xs text-adv-gray">{p.visible ? 'visible' : 'hidden'} · order {p.sortOrder}</span>
              <button
                onClick={() => onEdit(p)}
                className="px-2 py-1 rounded text-xs border border-border hover:border-adv-teal text-adv-gray hover:text-adv-teal transition flex items-center gap-1"
                aria-label={`Edit page ${p.path}`}
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            </div>
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

function AssetsTab({
  assets, onUpload, onDelete, onError,
}: {
  assets: Asset[];
  onUpload: (file: File, path: string) => Promise<void>;
  onDelete: (path: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingPath, setPendingPath] = useState('');

  async function handleFile(file: File) {
    onError(null);
    // Default the path to the filename — owner can override before clicking upload.
    if (!pendingPath) setPendingPath(file.name);
    setUploading(true);
    try {
      await onUpload(file, pendingPath || file.name);
      setPendingPath('');
      if (fileInput.current) fileInput.current.value = '';
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-border bg-adv-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium mb-2">
          <Upload className="h-4 w-4 text-adv-teal" /> Upload an asset
        </div>
        <p className="text-xs text-adv-gray mb-3">
          Reference uploaded assets from page HTML via <code className="text-adv-teal">{'{{asset:logo.png}}'}</code>.
          Max 25 MB. Common types: png, jpg, svg, webp, woff2, pdf.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={pendingPath}
            onChange={(e) => setPendingPath(e.target.value)}
            placeholder="logo.png"
            className="flex-1 min-w-[180px] rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
            aria-label="Asset path (e.g. logo.png)"
          />
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="px-3 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition disabled:opacity-50 flex items-center gap-2"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Choose file'}
          </button>
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-adv-card p-8 text-center">
          <Image className="h-10 w-10 text-adv-gray mx-auto mb-3" />
          <p className="text-sm text-adv-off-white font-medium">No assets uploaded yet</p>
          <p className="text-xs text-adv-gray mt-1">Logos, illustrations, fonts — anything page HTML references.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-adv-card overflow-hidden">
          {assets.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <code className="text-adv-teal text-xs">{a.path}</code>
                <div className="text-xs text-adv-gray mt-0.5">
                  {a.mimeType} · {formatBytes(a.byteSize)}
                </div>
              </div>
              <button
                onClick={() => { void onDelete(a.path).catch((e) => onError(String(e))); }}
                className="px-2 py-1 rounded text-xs border border-adv-red/40 text-adv-red hover:bg-adv-red/10 transition flex items-center gap-1"
                aria-label={`Delete asset ${a.path}`}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditPageModal({
  page, onClose, onSave,
}: { page: Page; onClose: () => void; onSave: (p: Page) => Promise<void> }) {
  const [draft, setDraft] = useState<Page>(page);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true); setErr(null);
    try { await onSave(draft); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-adv-card mt-8 mb-8">
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <div>
            <h2 className="text-base font-medium">Edit page</h2>
            <code className="text-xs text-adv-teal">{draft.path}</code>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5" aria-label="Close edit modal">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-4 space-y-3">
          {err && (
            <div className="flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-2 text-xs">
              <AlertCircle className="h-3.5 w-3.5 text-adv-red flex-shrink-0 mt-0.5" /> {err}
            </div>
          )}
          <label className="block">
            <span className="block text-xs font-medium mb-1">Title</span>
            <input
              type="text"
              value={draft.title ?? ''}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium mb-1">Sort order</span>
              <input
                type="number" min={0}
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={draft.visible}
                onChange={(e) => setDraft({ ...draft, visible: e.target.checked })}
                className="accent-adv-teal"
              />
              <span className="text-sm">Visible to visitors</span>
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-medium mb-1">HTML</span>
            <textarea
              value={draft.html}
              onChange={(e) => setDraft({ ...draft, html: e.target.value })}
              className="w-full h-72 rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs font-mono focus:border-adv-teal focus:outline-none"
            />
            <span className="block text-xs text-adv-gray mt-1">
              Interpolation: <code>{'{{title}}'}</code>, <code>{'{{portal.displayTitle}}'}</code>, <code>{'{{asset:logo.png}}'}</code>, <code>{'{{#each kind}}…{{/each}}'}</code>
            </span>
          </label>
        </div>
        <footer className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-3 py-2 rounded-lg border border-border text-sm hover:border-adv-gray">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </button>
        </footer>
      </div>
    </div>
  );
}

function CapabilitiesTab({
  capabilities, onSave,
}: {
  capabilities: CapabilityEdit[];
  onSave: (next: CapabilityEdit[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CapabilityEdit[]>(capabilities);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Sync local draft when fetched capabilities change.
  useEffect(() => { setDraft(capabilities); }, [capabilities]);

  function update(i: number, patch: Partial<CapabilityEdit>) {
    const next = [...draft];
    next[i] = { ...next[i], ...patch };
    setDraft(next);
  }
  function remove(i: number) {
    if (draft.length === 1) return;
    setDraft(draft.filter((_, idx) => idx !== i));
  }
  function add() {
    setDraft([...draft, {
      id: `cap-${draft.length + 1}`, verb: 'contact',
      title: 'New capability', description: '', aapEndpoint: 'messages',
    }]);
  }
  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch { /* error already surfaced by caller */ }
    finally { setSaving(false); }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(capabilities);

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-adv-card border border-border p-3 text-xs text-adv-gray">
        Editing capabilities re-signs the portal's descriptor and invalidates the visitor cache.
        Changes apply immediately on save — visitors get the new descriptor on their next request.
      </div>

      {draft.map((c, i) => (
        <div key={i} className="rounded-lg border border-border bg-adv-card p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input
              className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm sm:col-span-3 focus:border-adv-teal focus:outline-none"
              value={c.id}
              onChange={(e) => update(i, { id: e.target.value })}
              placeholder="id (slug)"
              aria-label="Capability id"
            />
            <select
              className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm sm:col-span-3 focus:border-adv-teal focus:outline-none"
              value={c.verb}
              onChange={(e) => update(i, { verb: e.target.value })}
              aria-label="Capability verb"
            >
              {VERBS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <input
              className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm sm:col-span-4 focus:border-adv-teal focus:outline-none"
              value={c.title}
              onChange={(e) => update(i, { title: e.target.value })}
              placeholder="title (visible to visitors)"
              aria-label="Capability title"
            />
            <input
              className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm sm:col-span-2 focus:border-adv-teal focus:outline-none"
              value={c.aapEndpoint}
              onChange={(e) => update(i, { aapEndpoint: e.target.value })}
              placeholder="aap_endpoint"
              aria-label="AAP endpoint"
            />
          </div>
          {c.verb === 'custom' && (
            <input
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
              value={c.customVerbName ?? ''}
              onChange={(e) => update(i, { customVerbName: e.target.value })}
              placeholder="custom verb name (e.g. 'lend-tool')"
              aria-label="Custom verb name"
            />
          )}
          <textarea
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
            rows={2}
            value={c.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="description (one or two sentences)"
            aria-label="Capability description"
          />
          <input
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
            value={(c.tags ?? []).join(', ')}
            onChange={(e) => update(i, { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
            placeholder="tags (comma-separated)"
            aria-label="Capability tags"
          />
          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-adv-gray">
              <input
                type="checkbox"
                checked={c.paymentCoupling?.required === true}
                onChange={(e) => update(i, { paymentCoupling: e.target.checked ? { required: true } : undefined })}
                className="accent-adv-teal"
              />
              Payment required
            </label>
            <button
              onClick={() => remove(i)}
              disabled={draft.length === 1}
              className="text-adv-red hover:underline disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed"
              aria-label={`Remove capability ${c.id}`}
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-2 pt-2">
        <button
          onClick={add}
          className="text-sm text-adv-teal hover:underline"
        >+ Add capability</button>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-adv-green" aria-live="polite">Saved · descriptor re-signed</span>}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save & re-sign
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareModal({
  portalAddress, visitUrl, onClose,
}: { portalAddress: string; visitUrl: string; onClose: () => void }) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Lazy-load qrcode lib so we don't pay its weight on the initial bundle.
  // Encode the portal address (the canonical identifier) — anyone scanning
  // can paste it into their ANTON's anton-portal Pathfinder mode.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('qrcode');
        const svg = await mod.default.toString(portalAddress, {
          type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 240,
          color: { dark: '#0D7D6C', light: '#ffffff' },
        });
        if (!cancelled) setQrSvg(svg);
      } catch { /* QR generation failed — show address only */ }
    })();
    return () => { cancelled = true; };
  }, [portalAddress]);

  async function copyText(text: string, setter: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch { /* clipboard blocked */ }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-border bg-adv-card">
        <header className="flex items-center justify-between gap-2 p-4 border-b border-border">
          <h2 className="text-base font-medium flex items-center gap-2">
            <Share2 className="h-4 w-4 text-adv-teal" /> Share this portal
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5" aria-label="Close share modal">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-4 space-y-4">
          {qrSvg ? (
            <div
              className="rounded-lg bg-white p-3 mx-auto"
              style={{ width: 'fit-content' }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              aria-label="QR code for portal address"
            />
          ) : (
            <div className="rounded-lg bg-adv-dark p-6 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-adv-gray mx-auto" />
            </div>
          )}
          <div>
            <div className="text-xs text-adv-gray mb-1">Portal address</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-adv-dark px-3 py-2 text-sm text-adv-teal">{portalAddress}</code>
              <button
                onClick={() => copyText(portalAddress, setCopiedAddr)}
                className="px-2 py-2 rounded border border-border hover:border-adv-teal text-adv-gray hover:text-adv-teal"
                aria-label="Copy portal address"
              >
                {copiedAddr ? <Check className="h-4 w-4 text-adv-green" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs text-adv-gray mb-1">Visit URL (this instance)</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-adv-dark px-3 py-2 text-xs">{visitUrl}</code>
              <button
                onClick={() => copyText(visitUrl, setCopiedUrl)}
                className="px-2 py-2 rounded border border-border hover:border-adv-teal text-adv-gray hover:text-adv-teal"
                aria-label="Copy visit URL"
              >
                {copiedUrl ? <Check className="h-4 w-4 text-adv-green" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-adv-gray">
            Other ANTONs that know your portal address can resolve it via mDNS on your LAN, or via the registry once published.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
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

function SurfaceEditor({
  portal, onSave,
}: {
  portal: PortalDetail['portal'];
  onSave: (mode: 'managed' | 'external', url: string | null) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<'managed' | 'external'>(portal.surface_mode);
  const [url, setUrl] = useState<string>(portal.external_primary_url ?? '');
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const dirty = mode !== portal.surface_mode || url !== (portal.external_primary_url ?? '');

  async function handleSave(): Promise<void> {
    if (!dirty || saving) return;
    if (mode === 'external' && !url.trim()) return;
    setSaving(true);
    try { await onSave(mode, mode === 'external' ? url.trim() : null); }
    finally { setSaving(false); }
  }

  async function handleReVerify(): Promise<void> {
    if (verifying) return;
    setVerifying(true);
    setVerifyMsg(null);
    try {
      const res = await fetchWithAuth(`/api/portals/${portal.id}/verify-external-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const j = await res.json().catch(() => ({}));
      if (j.ok) {
        setVerifyMsg(`Reachable (HTTP ${j.status}) at ${new Date(j.verifiedAt).toLocaleString()}`);
      } else {
        setVerifyMsg(j.reason ?? `Unreachable${j.status ? ` (HTTP ${j.status})` : ''}`);
      }
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-adv-gray">
        Pick whether ANTON hosts this portal's HTML (managed) or points at a site
        you host yourself (external). Either way, every capability invocation
        still travels through ANTON and is signed by the portal's Ed25519 key —
        the trust chain does not change.
      </p>
      <div className="flex gap-2">
        <label className={`flex-1 cursor-pointer rounded-lg border p-3 ${mode === 'managed' ? 'border-adv-teal bg-adv-teal/5' : 'border-border'}`}>
          <input type="radio" name="surface" value="managed"
            checked={mode === 'managed'} onChange={() => setMode('managed')}
            className="sr-only" />
          <div className="font-medium">Managed</div>
          <div className="text-xs text-adv-gray">ANTON hosts the HTML pages.</div>
        </label>
        <label className={`flex-1 cursor-pointer rounded-lg border p-3 ${mode === 'external' ? 'border-adv-teal bg-adv-teal/5' : 'border-border'}`}>
          <input type="radio" name="surface" value="external"
            checked={mode === 'external'} onChange={() => setMode('external')}
            className="sr-only" />
          <div className="font-medium">External</div>
          <div className="text-xs text-adv-gray">Point at a site you host.</div>
        </label>
      </div>
      {mode === 'external' && (
        <div>
          <label className="text-xs text-adv-gray">Primary URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-site.example"
            className="mt-1 w-full bg-adv-dark border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-adv-teal"
          />
          {portal.surface_mode === 'external' && !dirty && (
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <div className="text-adv-gray">
                {portal.external_url_verified_at
                  ? <>Last reachable ✓ {new Date(portal.external_url_verified_at).toLocaleString()}</>
                  : <>Not verified — the site has not responded to a recent check.</>}
              </div>
              <button
                onClick={() => { void handleReVerify(); }}
                disabled={verifying}
                className="px-2 py-1 rounded border border-border text-adv-off-white hover:bg-white/5 disabled:opacity-50"
              >{verifying ? 'Checking…' : 'Re-check'}</button>
            </div>
          )}
          {verifyMsg && (
            <div className="mt-2 text-xs text-adv-gray">{verifyMsg}</div>
          )}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => { void handleSave(); }}
          disabled={!dirty || saving || (mode === 'external' && !url.trim())}
          className="px-3 py-1.5 rounded bg-adv-teal text-adv-dark text-sm font-medium disabled:opacity-50"
        >{saving ? 'Saving…' : 'Save surface'}</button>
      </div>
    </div>
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
