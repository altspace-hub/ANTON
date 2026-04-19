/**
 * RegulatorSharedPackPage — /shared/pack/:token
 *
 * External-auditor view of an evidence pack. Per spec §8.4 + §11.2:
 *   - No ANTON nav chrome; minimal professional layout
 *   - Watermark on every page (from share's watermark_text)
 *   - Password challenge if configured
 *   - Access notice on first view (logged anyway server-side, but be honest)
 *   - Search box, item list, signature verification status, download (if allowed)
 *
 * The X-Pack-Session header threads through every API call after /auth.
 * No token is stored anywhere persistent client-side beyond sessionStorage —
 * close the browser, lose the session, must re-enter password.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertCircle, ShieldCheck, Lock, Download, Search, Info } from 'lucide-react';

interface ItemRow {
  item_type: string;
  item_id: string;
  item_hash: string;
  item_summary: string;
  item_order: number;
  regulatory_relevance: string[] | string | null;
}

interface PackInfo {
  id: string;
  title: string;
  purpose: string | null;
  scope_label: string | null;
  status: string;
  hash_manifest: string | null;
  signature: string | null;
  signer_public_key: string | null;
  finalised_at: string | null;
  compliance_frameworks: string[] | string;
}

interface ShareInfo {
  recipientName: string;
  recipientOrganisation: string;
  expiresAt: string;
  allowDownload: boolean;
  watermarkText: string | null;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'password_required' }
  | { kind: 'error'; reason: string }
  | { kind: 'ok'; pack: PackInfo; items: ItemRow[]; share: ShareInfo };

export default function RegulatorSharedPackPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Session token — kept in sessionStorage so a refresh doesn't re-prompt
  // unless the browser tab is closed.
  const sessKey = `evpack-session-${token}`;
  const [sessionToken, setSessionToken] = useState<string | null>(() => sessionStorage.getItem(sessKey));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/shared-pack/${encodeURIComponent(token)}`, {
          headers: sessionToken ? { 'X-Pack-Session': sessionToken } : {},
        });
        if (cancelled) return;
        if (res.status === 401) {
          const j = await res.json().catch(() => ({}));
          if (j.kind === 'password_required') {
            setState({ kind: 'password_required' });
            return;
          }
        }
        if (res.status === 410) {
          const j = await res.json().catch(() => ({}));
          setState({ kind: 'error', reason: j.error ?? 'Share expired or revoked' });
          return;
        }
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setState({ kind: 'error', reason: j.error ?? `Load failed (${res.status})` });
          return;
        }
        const j = await res.json();
        setState({ kind: 'ok', pack: j.pack, items: j.items ?? [], share: j.share });
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', reason: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [token, sessionToken]);

  async function submitPassword(password: string) {
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/shared-pack/${encodeURIComponent(token)}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: 'password_required' });
        // Show a transient error inline; password page handles its own state.
        return j.error ?? 'Wrong password';
      }
      sessionStorage.setItem(sessKey, j.sessionToken);
      setSessionToken(j.sessionToken);
      // The useEffect above will re-fetch with the new session token.
      return null;
    } catch (e) {
      setState({ kind: 'password_required' });
      return e instanceof Error ? e.message : String(e);
    }
  }

  async function downloadBundle() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/shared-pack/${encodeURIComponent(token)}/download`, {
        headers: sessionToken ? { 'X-Pack-Session': sessionToken } : {},
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (state.kind === 'ok' ? state.pack.id : 'evidence-pack') + '.anton';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  if (state.kind === 'loading') return <Centered><Loader2 className="h-5 w-5 animate-spin" /> Loading evidence pack…</Centered>;
  if (state.kind === 'error') return <Centered><AlertCircle className="h-5 w-5 text-red-600" /> {state.reason}</Centered>;
  if (state.kind === 'password_required') return <PasswordPrompt onSubmit={submitPassword} />;

  const { pack, items, share } = state;
  const filtered = search.trim()
    ? items.filter((i) => {
        const q = search.toLowerCase();
        return i.item_summary.toLowerCase().includes(q) || i.item_id.toLowerCase().includes(q) || i.item_hash.toLowerCase().includes(q);
      })
    : items;
  const sigStatus = pack.signature && pack.signer_public_key
    ? { tone: 'ok' as const, label: 'Signed (verify offline with the bundled verifier.html)' }
    : { tone: 'warn' as const, label: 'Pack is not signed' };
  const frameworks = Array.isArray(pack.compliance_frameworks)
    ? pack.compliance_frameworks
    : JSON.parse(pack.compliance_frameworks || '[]');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {share.watermarkText && (
        <div
          aria-hidden
          className="fixed inset-0 pointer-events-none flex items-center justify-center select-none"
          style={{ zIndex: 1 }}
        >
          <div
            className="text-slate-300/40 font-bold uppercase tracking-widest"
            style={{ fontSize: '6rem', transform: 'rotate(-30deg)', whiteSpace: 'nowrap' }}
          >{share.watermarkText}</div>
        </div>
      )}

      <main className="relative z-10 max-w-4xl mx-auto p-6 md:p-10 space-y-6">
        <header className="border-b border-slate-200 pb-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-700 font-medium">
            <ShieldCheck className="h-4 w-4" /> Evidence Pack — Read-only
          </div>
          <h1 className="text-2xl font-semibold mt-1">{pack.title}</h1>
          {pack.purpose && <p className="text-sm text-slate-600 mt-1">{pack.purpose}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>Pack <code className="bg-slate-100 px-1.5 py-0.5 rounded">{pack.id}</code></span>
            <span>Recipient: <strong className="text-slate-800">{share.recipientName}</strong> ({share.recipientOrganisation})</span>
            <span>Expires: {new Date(share.expiresAt).toLocaleDateString()}</span>
          </div>
        </header>

        <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
          sigStatus.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
        }`}>
          <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">{sigStatus.label}</div>
            <div className="text-xs mt-1 break-all">
              Manifest hash: <code>{pack.hash_manifest ?? '—'}</code>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 flex items-start gap-2">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Access notice:</strong> this access is logged in the chain-of-custody log as required under EU AI Act Article 12.
            Your organisation, the timestamp, and the action you take are recorded.
          </div>
        </div>

        <section>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search summaries, ids, hashes…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>
            {share.allowDownload && (
              <button
                onClick={downloadBundle}
                disabled={downloading}
                className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download .anton
              </button>
            )}
          </div>
          <div className="text-xs text-slate-600 mb-3">{filtered.length} of {items.length} items · frameworks: {frameworks.join(', ')}</div>
          <ol className="space-y-2">
            {filtered.map((item) => {
              const tags = Array.isArray(item.regulatory_relevance)
                ? item.regulatory_relevance
                : item.regulatory_relevance ? JSON.parse(item.regulatory_relevance as string) : [];
              return (
                <li key={`${item.item_type}-${item.item_id}`} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs">{item.item_type}</span>
                        <span className="text-xs text-slate-500">#{item.item_order + 1}</span>
                      </div>
                      <div className="text-sm">{item.item_summary}</div>
                      <code className="text-xs text-slate-500">{item.item_id}</code>
                    </div>
                    <div className="text-xs text-slate-500 text-right">
                      <code className="block">{item.item_hash.slice(0, 24)}…</code>
                      {tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 justify-end">
                          {tags.slice(0, 3).map((t: string) => <span key={t} className="px-1.5 py-0.5 rounded bg-slate-100">{t}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
          <strong className="text-slate-700">What this pack proves:</strong> the contents existed in this exact form at finalisation, signed by the named ANTON instance.
          {' '}<strong className="text-slate-700">What it does not prove:</strong> the contents reflect reality outside ANTON. The underlying professional work documented here must be independently assessed.
        </footer>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-700 gap-2">{children}</div>;
}

function PasswordPrompt({ onSubmit }: { onSubmit: (password: string) => Promise<string | null> }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!password) return;
          setBusy(true); setErr(null);
          const failure = await onSubmit(password);
          setBusy(false);
          if (failure) setErr(failure);
        }}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
      >
        <div className="flex items-center gap-2 text-emerald-700">
          <Lock className="h-5 w-5" />
          <h1 className="text-base font-medium">Password required</h1>
        </div>
        <p className="text-sm text-slate-600">This evidence pack is password-protected. Enter the password your contact provided.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="Password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
        />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm hover:bg-emerald-800 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Open pack
        </button>
      </form>
    </div>
  );
}
