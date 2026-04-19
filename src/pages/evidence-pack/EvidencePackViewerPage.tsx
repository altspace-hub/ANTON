/**
 * EvidencePackViewerPage — /evidence-packs/:id
 *
 * Phase 1 tabs (per spec §8.3 simplified): Overview · Timeline · Search.
 * Phase 2 adds Compliance · Access Log · Shares. Phase 4 adds Exports tab
 * with format toggles; for now the export buttons live in the header.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck, ChevronLeft, Loader2, AlertCircle, Download, FileText, Lock, Search, Share2, Copy, Check, Trash2, Activity } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface PackDetail {
  pack: {
    id: string; title: string; purpose: string | null;
    scope_type: string; scope_label: string | null;
    status: string; hash_manifest: string | null;
    item_count: number; created_by: string; created_at: string;
    finalised_at: string | null; retention_until: string | null;
    legal_hold: boolean;
    compliance_frameworks: string[] | string;
    notes: string | null;
  };
  items: Array<{
    item_type: string; item_id: string; item_hash: string;
    item_summary: string; item_order: number;
    regulatory_relevance: string[] | string | null;
  }>;
}

type Tab = 'overview' | 'timeline' | 'search' | 'shares' | 'access_log';

interface ShareRow {
  id: string;
  access_token: string;
  recipient_name: string;
  recipient_organisation: string;
  recipient_contact: string | null;
  purpose: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  allow_download: boolean;
  watermark_text: string | null;
  password_required: boolean;
}

interface AccessRow {
  id: string;
  share_id: string | null;
  accessed_at: string;
  accessor_type: string;
  action: string;
  item_accessed: string | null;
  success: boolean;
  error_reason: string | null;
  recipient_name: string | null;
  recipient_organisation: string | null;
}

export default function EvidencePackViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PackDetail | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'anton' | 'pdf' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!id) return;
        const res = await fetchWithAuth(`/api/evidence-pack/${id}`);
        if (!res.ok) throw new Error(`Failed to load pack (${res.status})`);
        const j = await res.json();
        if (!cancelled) setDetail(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function exportPack(format: 'anton' | 'pdf') {
    if (!id) return;
    setExporting(format);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/evidence-pack/${id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = format === 'anton' ? `${id}.anton` : `${id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  }

  if (!detail) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-adv-gray gap-2">
        {error
          ? <><AlertCircle className="h-5 w-5 text-adv-red" /> {error}</>
          : <><Loader2 className="h-5 w-5 animate-spin" /> Loading…</>}
      </div>
    );
  }

  const { pack, items } = detail;
  const frameworks = Array.isArray(pack.compliance_frameworks)
    ? pack.compliance_frameworks
    : JSON.parse(pack.compliance_frameworks || '[]');

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <button
          onClick={() => navigate('/evidence-packs')}
          className="inline-flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal"
        >
          <ChevronLeft className="h-4 w-4" /> All packs
        </button>

        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-adv-teal/10">
              <ShieldCheck className="h-7 w-7 text-adv-teal" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{pack.title}</h1>
              <code className="text-sm text-adv-teal">{pack.id}</code>
              <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                <span className={`px-2 py-0.5 rounded ${pack.status === 'finalised' ? 'bg-adv-green/15 text-adv-green' : 'bg-adv-gray/15 text-adv-gray'}`}>{pack.status}</span>
                <span className="px-2 py-0.5 rounded bg-adv-card">{pack.scope_type}</span>
                {pack.legal_hold && (
                  <span className="px-2 py-0.5 rounded bg-adv-gold/15 text-adv-gold flex items-center gap-1">
                    <Lock className="h-3 w-3" /> legal hold
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void exportPack('anton')}
              disabled={exporting !== null}
              className="px-3 py-2 rounded-lg border border-border text-sm hover:border-adv-teal flex items-center gap-1 disabled:opacity-50"
            >
              {exporting === 'anton' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} .anton
            </button>
            <button
              onClick={() => void exportPack('pdf')}
              disabled={exporting !== null}
              className="px-3 py-2 rounded-lg border border-border text-sm hover:border-adv-teal flex items-center gap-1 disabled:opacity-50"
            >
              {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF
            </button>
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <nav className="flex gap-1 border-b border-border overflow-x-auto">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabButton>
          <TabButton active={tab === 'timeline'} onClick={() => setTab('timeline')}>Timeline ({items.length})</TabButton>
          <TabButton active={tab === 'search'} onClick={() => setTab('search')}>Search</TabButton>
          <TabButton active={tab === 'shares'} onClick={() => setTab('shares')}>Shares</TabButton>
          <TabButton active={tab === 'access_log'} onClick={() => setTab('access_log')}>Access Log</TabButton>
        </nav>

        {tab === 'overview' && <OverviewTab pack={pack} frameworks={frameworks} items={items} />}
        {tab === 'timeline' && <TimelineTab items={items} />}
        {tab === 'search' && <SearchTab items={items} />}
        {tab === 'shares' && <SharesTab packId={pack.id} canShare={pack.status === 'finalised' || pack.status === 'shared'} />}
        {tab === 'access_log' && <AccessLogTab packId={pack.id} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 transition ${active ? 'border-adv-teal text-adv-off-white' : 'border-transparent text-adv-gray hover:text-adv-off-white'}`}
    >{children}</button>
  );
}

function OverviewTab({ pack, frameworks, items }: { pack: PackDetail['pack']; frameworks: string[]; items: PackDetail['items'] }) {
  const itemsByType: Record<string, number> = {};
  for (const i of items) itemsByType[i.item_type] = (itemsByType[i.item_type] ?? 0) + 1;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card title="Pack metadata">
        <KV label="Scope" value={pack.scope_label ?? `${pack.scope_type}`} />
        <KV label="Created by" value={pack.created_by} />
        <KV label="Created at" value={new Date(pack.created_at).toLocaleString()} />
        <KV label="Finalised" value={pack.finalised_at ? new Date(pack.finalised_at).toLocaleString() : 'draft'} />
        <KV label="Retention until" value={pack.retention_until ? new Date(pack.retention_until).toLocaleString() : '—'} />
      </Card>
      <Card title="Frameworks + integrity">
        <KV label="Frameworks" value={frameworks.join(', ')} />
        <KV label="Manifest hash" value={<code className="text-xs break-all">{pack.hash_manifest ?? '—'}</code>} />
        <KV label="Item count" value={String(pack.item_count)} />
      </Card>
      {pack.purpose && (
        <Card title="Purpose" wide>
          <p className="text-sm text-adv-off-white whitespace-pre-wrap">{pack.purpose}</p>
        </Card>
      )}
      <Card title="Items by type" wide>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {Object.entries(itemsByType).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
            <div key={t} className="flex items-center justify-between rounded bg-adv-dark p-2">
              <span className="text-adv-gray">{t}</span>
              <span className="font-medium">{n}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="What signing does and does not prove" wide>
        <p className="text-xs text-adv-gray">
          <strong className="text-adv-off-white">Does prove:</strong> this pack's contents existed in this exact form at finalisation,
          and were finalised by the named user.
          {' '}<strong className="text-adv-off-white">Does NOT prove:</strong> the contents reflect reality outside ANTON.
          The pack proves the platform's internal record; the underlying professional work being documented must be independently assessed.
        </p>
      </Card>
      {pack.notes && (
        <Card title="Notes" wide>
          <p className="text-sm whitespace-pre-wrap">{pack.notes}</p>
        </Card>
      )}
    </div>
  );
}

function TimelineTab({ items }: { items: PackDetail['items'] }) {
  return (
    <ol className="space-y-2">
      {items.map((item) => <ItemRow key={`${item.item_type}-${item.item_id}`} item={item} />)}
    </ol>
  );
}

function SearchTab({ items }: { items: PackDetail['items'] }) {
  const [q, setQ] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const types = useMemo(() => Array.from(new Set(items.map((i) => i.item_type))).sort(), [items]);
  const filtered = items.filter((i) => {
    if (filterType && i.item_type !== filterType) return false;
    if (!q) return true;
    const q1 = q.toLowerCase();
    return i.item_summary.toLowerCase().includes(q1)
      || i.item_id.toLowerCase().includes(q1)
      || i.item_hash.toLowerCase().includes(q1);
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-adv-gray" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search summaries, ids, hashes…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-adv-card text-sm focus:border-adv-teal focus:outline-none"
          />
        </div>
        <select
          value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-border bg-adv-card px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
        >
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="text-xs text-adv-gray">{filtered.length} of {items.length} items</div>
      <ol className="space-y-2">
        {filtered.map((item) => <ItemRow key={`${item.item_type}-${item.item_id}`} item={item} />)}
      </ol>
    </div>
  );
}

function SharesTab({ packId, canShare }: { packId: string; canShare: boolean }) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newShareToken, setNewShareToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetchWithAuth(`/api/evidence-pack/${packId}/shares`);
      if (res.ok) {
        const j = await res.json();
        setShares(j.shares ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [packId]);

  async function revoke(shareId: string) {
    const reason = prompt('Reason for revocation? (optional)') ?? undefined;
    const res = await fetchWithAuth(`/api/evidence-pack/${packId}/shares/${shareId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (res.ok || res.status === 204) await refresh();
  }

  async function copyShareUrl(token: string) {
    const url = `${window.location.origin}/shared/pack/${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4">
      {!canShare && (
        <div className="rounded-lg border border-adv-gold/40 bg-adv-gold/10 p-3 text-sm text-adv-gold">
          Pack must be finalised before it can be shared with regulators.
        </div>
      )}
      {error && <div className="text-sm text-adv-red">{error}</div>}

      {canShare && !showCreate && (
        <button
          onClick={() => { setShowCreate(true); setNewShareToken(null); }}
          className="px-3 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark flex items-center gap-2"
        >
          <Share2 className="h-4 w-4" /> Create regulator share
        </button>
      )}
      {canShare && showCreate && (
        <CreateShareForm
          onCancel={() => setShowCreate(false)}
          onCreate={async (input) => {
            setError(null);
            try {
              const res = await fetchWithAuth(`/api/evidence-pack/${packId}/shares`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
              });
              const j = await res.json();
              if (!res.ok) throw new Error(j.error ?? `Create failed (${res.status})`);
              setNewShareToken(j.accessToken);
              setShowCreate(false);
              await refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
      )}
      {newShareToken && (
        <div className="rounded-lg border border-adv-green/40 bg-adv-green/5 p-3 text-sm">
          <div className="font-medium text-adv-green mb-2">Share created. Send this URL to the recipient (it's the only time it'll be shown in full).</div>
          <code className="block bg-adv-dark p-2 rounded text-xs break-all">
            {window.location.origin}/shared/pack/{newShareToken}
          </code>
        </div>
      )}

      {shares.length === 0 ? (
        <p className="text-sm text-adv-gray">No shares created yet.</p>
      ) : (
        <ul className="space-y-2">
          {shares.map((s) => {
            const expired = new Date(s.expires_at) < new Date();
            const inactive = !!s.revoked_at || expired;
            return (
              <li key={s.id} className={`rounded-lg border border-border bg-adv-card p-3 ${inactive ? 'opacity-60' : ''}`}>
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-medium">{s.recipient_name} — {s.recipient_organisation}</div>
                    <div className="text-xs text-adv-gray mt-0.5">{s.purpose}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {s.password_required && <span className="px-1.5 py-0.5 rounded bg-adv-teal/15 text-adv-teal flex items-center gap-1"><Lock className="h-3 w-3" /> password</span>}
                    {!s.allow_download && <span className="px-1.5 py-0.5 rounded bg-adv-card">view-only</span>}
                    {s.revoked_at && <span className="px-1.5 py-0.5 rounded bg-adv-red/15 text-adv-red">revoked</span>}
                    {expired && !s.revoked_at && <span className="px-1.5 py-0.5 rounded bg-adv-gold/15 text-adv-gold">expired</span>}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs text-adv-gray">
                    Created {new Date(s.created_at).toLocaleDateString()} · expires {new Date(s.expires_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2">
                    {!inactive && (
                      <>
                        <button
                          onClick={() => copyShareUrl(s.access_token)}
                          className="px-2 py-1 rounded text-xs border border-border hover:border-adv-teal text-adv-gray hover:text-adv-teal flex items-center gap-1"
                        >
                          {copied === s.access_token ? <Check className="h-3 w-3 text-adv-green" /> : <Copy className="h-3 w-3" />}
                          {copied === s.access_token ? 'Copied' : 'Copy URL'}
                        </button>
                        <button
                          onClick={() => void revoke(s.id)}
                          className="px-2 py-1 rounded text-xs border border-adv-red/40 text-adv-red hover:bg-adv-red/10 flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Revoke
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CreateShareForm({ onCancel, onCreate }: {
  onCancel: () => void;
  onCreate: (input: { recipientName: string; recipientOrganisation: string; recipientContact?: string; purpose: string; expiresInDays: number; password?: string; allowDownload: boolean; watermarkText?: string }) => Promise<void>;
}) {
  const [recipientName, setRecipientName] = useState('');
  const [recipientOrganisation, setRecipientOrganisation] = useState('');
  const [recipientContact, setRecipientContact] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [password, setPassword] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  const [watermarkText, setWatermarkText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!recipientName.trim() || !recipientOrganisation.trim() || !purpose.trim()) return;
        setSubmitting(true);
        try {
          await onCreate({
            recipientName: recipientName.trim(),
            recipientOrganisation: recipientOrganisation.trim(),
            recipientContact: recipientContact.trim() || undefined,
            purpose: purpose.trim(),
            expiresInDays,
            password: password.trim() || undefined,
            allowDownload,
            watermarkText: watermarkText.trim() || undefined,
          });
        } finally { setSubmitting(false); }
      }}
      className="rounded-lg border border-border bg-adv-card p-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Recipient name" value={recipientName} onChange={setRecipientName} placeholder="Jan Johansson" required />
        <FormField label="Recipient organisation" value={recipientOrganisation} onChange={setRecipientOrganisation} placeholder="Finansinspektionen" required />
      </div>
      <FormField label="Recipient email (optional)" value={recipientContact} onChange={setRecipientContact} type="email" />
      <FormField label="Purpose" value={purpose} onChange={setPurpose} placeholder="On-site inspection, ref FI-2026-0123" required />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Expires in (days)" value={String(expiresInDays)} onChange={(v) => setExpiresInDays(Math.max(1, Math.min(365, Number(v) || 30)))} type="number" />
        <FormField label="Password (optional, ≥8 chars)" value={password} onChange={setPassword} type="password" />
      </div>
      <FormField label="Watermark text (optional)" value={watermarkText} onChange={setWatermarkText} placeholder="CONFIDENTIAL — Finansinspektionen only" />
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} className="accent-adv-teal" />
        Allow .anton bundle download
      </label>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg border border-border text-sm hover:border-adv-gray">Cancel</button>
        <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-50 flex items-center gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Create share
        </button>
      </div>
    </form>
  );
}

function FormField({ label, value, onChange, placeholder, required, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1">{label}{required && <span className="text-adv-red"> *</span>}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
      />
    </label>
  );
}

function AccessLogTab({ packId }: { packId: string }) {
  const [accesses, setAccesses] = useState<AccessRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithAuth(`/api/evidence-pack/${packId}/access-log`);
        if (!res.ok) throw new Error(`Failed to load access log (${res.status})`);
        const j = await res.json();
        setAccesses(j.accesses ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [packId]);

  if (error) return <div className="text-sm text-adv-red">{error}</div>;
  if (!accesses) return <div className="flex items-center gap-2 text-adv-gray text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  if (accesses.length === 0) return (
    <div className="rounded-xl border border-dashed border-border bg-adv-card p-6 text-center">
      <Activity className="h-10 w-10 text-adv-gray mx-auto mb-3" />
      <p className="text-sm text-adv-off-white font-medium">No external access yet</p>
      <p className="text-xs text-adv-gray mt-1">Regulator hits will appear here in real time.</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-adv-gray bg-adv-dark/30">
          <tr>
            <th className="text-left p-3 font-normal">When</th>
            <th className="text-left p-3 font-normal">Recipient</th>
            <th className="text-left p-3 font-normal">Action</th>
            <th className="text-left p-3 font-normal">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {accesses.map((a) => (
            <tr key={a.id} className="border-t border-border/40">
              <td className="p-3 text-xs text-adv-gray">{new Date(a.accessed_at).toLocaleString()}</td>
              <td className="p-3 text-sm">
                {a.recipient_name ? `${a.recipient_name} — ${a.recipient_organisation}` : a.accessor_type}
              </td>
              <td className="p-3 text-xs"><code>{a.action}</code></td>
              <td className="p-3 text-xs">
                {a.success ? <span className="text-adv-green">✓ ok</span> : <span className="text-adv-red">✗ {a.error_reason ?? 'failed'}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemRow({ item }: { item: PackDetail['items'][number] }) {
  const tags = Array.isArray(item.regulatory_relevance)
    ? item.regulatory_relevance
    : item.regulatory_relevance
      ? JSON.parse(item.regulatory_relevance)
      : [];
  return (
    <li className="rounded-lg border border-border bg-adv-card p-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 rounded bg-adv-teal/10 text-adv-teal text-xs">{item.item_type}</span>
            <span className="text-xs text-adv-gray">#{item.item_order + 1}</span>
          </div>
          <div className="text-sm">{item.item_summary}</div>
          <code className="text-xs text-adv-gray">{item.item_id}</code>
        </div>
        <div className="text-xs text-adv-gray text-right">
          <code className="block">{item.item_hash.slice(0, 24)}…</code>
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 justify-end">
              {tags.slice(0, 3).map((t: string) => (
                <span key={t} className="px-1.5 py-0.5 rounded bg-adv-dark text-adv-gray">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
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
      <span className="text-right">{value}</span>
    </div>
  );
}
