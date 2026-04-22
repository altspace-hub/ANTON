/**
 * PortalVisitorPage — /portals/p/:address
 *
 * Visitor view of any portal. Resolves the address, fetches the page HTML
 * (already rendered server-side via the interpolation engine), shows it in
 * a sandboxed container, and surfaces the capability descriptor so the
 * visitor can invoke or inquire on each declared capability.
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Globe, Loader2, AlertCircle, CloudOff, ChevronLeft, MessageSquare, Send, ExternalLink, ShieldCheck } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Descriptor {
  schemaVersion: string;
  portal: {
    displayTitle: string;
    category: string;
    contactHash: string;
    /** Present when the portal's HTML surface lives externally. AAP
     *  capability endpoints still resolve to ANTON regardless. */
    surface?: { mode: 'managed' | 'external'; url?: string; verifiedAt?: string };
  };
  capabilities: Array<{
    id: string; verb: string; title: string; description: string;
    aapEndpoint: string;
    inputSchema?: { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
    paymentCoupling?: { required?: boolean };
  }>;
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'page'; html: string; title: string | null }
  | { kind: 'not_found'; reason: string }
  | { kind: 'portal_offline'; reason: string }
  | { kind: 'error'; reason: string };

interface NavPage { path: string; title: string | null; sortOrder: number }

export default function PortalVisitorPage() {
  const { address: rawAddress } = useParams<{ address: string }>();
  const address = rawAddress ? decodeURIComponent(rawAddress) : '';
  const [page, setPage] = useState<FetchState>({ kind: 'loading' });
  const [descriptor, setDescriptor] = useState<Descriptor | null>(null);
  const [activeCap, setActiveCap] = useState<Descriptor['capabilities'][number] | null>(null);
  const [navPages, setNavPages] = useState<NavPage[]>([]);
  const [activePath, setActivePath] = useState('/');

  // Load nav pages + descriptor once per address.
  useEffect(() => {
    let cancelled = false;
    if (!address) return;
    void (async () => {
      const res = await fetchWithAuth(`/api/portals/visit/${encodeURIComponent(address)}/pages`);
      if (res.ok) {
        const j = await res.json() as { pages: NavPage[] };
        if (!cancelled) setNavPages(j.pages ?? []);
      }
    })();
    void (async () => {
      const res = await fetchWithAuth(`/api/portals/visit/${encodeURIComponent(address)}/capabilities`);
      if (res.ok) {
        const j = await res.json();
        if (!cancelled) setDescriptor(j.descriptor);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  // Re-fetch the page whenever activePath (or address) changes.
  useEffect(() => {
    let cancelled = false;
    if (!address) return;
    setPage({ kind: 'loading' });
    void (async () => {
      try {
        const res = await fetchWithAuth(`/api/portals/visit/${encodeURIComponent(address)}/page?path=${encodeURIComponent(activePath)}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && json.kind === 'page') setPage({ kind: 'page', html: json.html, title: json.title });
        else if (res.status === 404) setPage({ kind: 'not_found', reason: json.reason ?? 'Page not found' });
        else if (res.status === 503) setPage({ kind: 'portal_offline', reason: json.reason ?? 'Portal offline' });
        else setPage({ kind: 'error', reason: json.error ?? `${res.status}` });
      } catch (e) {
        if (!cancelled) setPage({ kind: 'error', reason: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [address, activePath]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      {/* Address bar */}
      <div className="border-b border-border bg-adv-card px-4 py-2 flex items-center gap-3 sticky top-0 z-10">
        <Link to="/portals" className="text-sm text-adv-gray hover:text-adv-teal flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Portals
        </Link>
        <Globe className="h-4 w-4 text-adv-teal" />
        <code className="text-sm text-adv-teal flex-1">{address}</code>
        {descriptor && (
          <span className="text-xs text-adv-gray">{descriptor.portal.displayTitle}</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0">
        {/* Page content */}
        <main className="p-6 md:p-8 max-w-3xl mx-auto w-full">
          {/* Page nav — only render if there's more than one visible page. */}
          {navPages.length > 1 && (
            <nav
              className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-adv-card p-1.5"
              aria-label="Portal page navigation"
            >
              {navPages.map((p) => (
                <button
                  key={p.path}
                  onClick={() => setActivePath(p.path)}
                  className={`px-3 py-1.5 rounded-md text-sm transition ${
                    p.path === activePath
                      ? 'bg-adv-teal text-adv-dark font-medium'
                      : 'text-adv-gray hover:text-adv-off-white hover:bg-white/5'
                  }`}
                  aria-current={p.path === activePath ? 'page' : undefined}
                >
                  {p.title ?? p.path}
                </button>
              ))}
            </nav>
          )}
          {page.kind === 'loading' && (
            <div className="flex items-center gap-2 text-adv-gray text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          )}
          {page.kind === 'portal_offline' && (
            <OfflineCard address={address} reason={page.reason} />
          )}
          {page.kind === 'not_found' && (
            <div className="rounded-xl border border-adv-red/40 bg-adv-red/10 p-6 text-sm flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-adv-red flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Portal or page not found</div>
                <div className="text-adv-gray mt-1">{page.reason}</div>
              </div>
            </div>
          )}
          {page.kind === 'error' && (
            <div className="rounded-xl border border-adv-red/40 bg-adv-red/10 p-6 text-sm flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-adv-red flex-shrink-0 mt-0.5" />
              <div>{page.reason}</div>
            </div>
          )}
          {descriptor?.portal.surface?.mode === 'external' && descriptor.portal.surface.url && (
            // External surface: the owner points ANTON at their self-hosted
            // site. AAP capability endpoints continue to resolve to this
            // ANTON instance (see the capabilities rail on the right), so
            // the Ed25519 trust chain + transparency log are unchanged.
            <div className="rounded-xl border border-adv-teal/40 bg-adv-card p-6 space-y-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-5 w-5 text-adv-teal flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium">This portal's site lives externally.</div>
                  <div className="text-adv-gray mt-1">
                    Capabilities (order, pay, book, inquire, …) still invoke
                    through ANTON and are signed by the portal's Ed25519 key.
                  </div>
                </div>
              </div>
              <a
                href={descriptor.portal.surface.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-adv-teal text-adv-dark rounded text-sm font-medium"
              >
                <ExternalLink className="h-4 w-4" /> Open site
              </a>
              <div className="text-xs text-adv-gray break-all">
                {descriptor.portal.surface.url}
              </div>
            </div>
          )}
          {descriptor?.portal.surface?.mode !== 'external' && page.kind === 'page' && (
            // Sandbox the owner-authored HTML in an iframe. The visitor of
            // portal X is NOT the owner of portal X — owner HTML can contain
            // arbitrary <script> that would otherwise execute in the
            // visitor's authenticated session. `sandbox` with no `allow-*`
            // disables scripts, forms, popups, navigation, plugins, and
            // same-origin access. `srcdoc` keeps the served HTML inline.
            // We give the iframe the same prose-output styling via a
            // wrapper + base style injection so visitor pages look right.
            <iframe
              title={page.title ?? 'Portal page'}
              sandbox=""
              srcDoc={wrapForSandbox(page.html, page.title)}
              className="w-full min-h-[60vh] rounded-xl border border-border bg-adv-card"
            />
          )}
        </main>

        {/* Capabilities side panel */}
        <aside className="border-l border-border bg-adv-card p-4 lg:min-h-screen">
          <div className="text-xs uppercase tracking-wide text-adv-gray mb-3">Capabilities</div>
          {!descriptor ? (
            <div className="text-sm text-adv-gray">No descriptor available for this portal.</div>
          ) : descriptor.capabilities.length === 0 ? (
            <div className="text-sm text-adv-gray">This portal exposes no capabilities.</div>
          ) : (
            <ul className="space-y-2">
              {descriptor.capabilities.map((cap) => (
                <li key={cap.id}>
                  <button
                    onClick={() => setActiveCap(cap)}
                    className="w-full text-left rounded-lg border border-border bg-adv-dark p-3 hover:border-adv-teal transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-adv-teal/10 text-adv-teal text-xs">{cap.verb}</span>
                      <span className="font-medium text-sm">{cap.title}</span>
                    </div>
                    <p className="text-xs text-adv-gray mt-1">{cap.description}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {activeCap && (
        <CapabilityDialog
          address={address}
          capability={activeCap}
          onClose={() => setActiveCap(null)}
        />
      )}
    </div>
  );
}

// ── Sandbox HTML wrapper ────────────────────────────────────────────────────
// We can't inherit the parent app's CSS into the sandboxed iframe (no
// same-origin), so we inline a minimal style block that mirrors the
// `.prose-output` look from src/index.css for the common HTML elements
// portals will produce.

function wrapForSandbox(html: string, title: string | null): string {
  const escapedTitle = (title ?? 'Portal page').replace(/[<>"&]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c] ?? c));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapedTitle}</title>
  <style>
    :root { color-scheme: dark; }
    html, body { margin: 0; padding: 1.25rem; background: #152238; color: #E0E0E0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.6; }
    h1 { font-size: 1.5rem; font-weight: 700; margin: 0 0 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #1f2a44; }
    h2 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.6rem; }
    h3 { font-size: 1.1rem; font-weight: 600; margin: 1.25rem 0 0.5rem; }
    p { margin: 0.5rem 0; }
    a { color: #2DD4A8; text-decoration: underline; }
    ul, ol { margin: 0.5rem 0; padding-left: 1.25rem; }
    li { margin: 0.25rem 0; }
    code { background: #0F1B2D; padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-size: 0.9em; }
    img { max-width: 100%; height: auto; }
    blockquote { margin: 0.75rem 0; padding-left: 0.75rem; border-left: 3px solid #2DD4A8; color: #B0B0B0; }
  </style>
</head>
<body>${html}</body>
</html>`;
}

// ── Offline card per Spec C.1 ───────────────────────────────────────────────

function OfflineCard({ address, reason }: { address: string; reason: string }) {
  return (
    <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
      <CloudOff className="h-10 w-10 text-adv-gray mx-auto mb-3" />
      <div className="font-medium">Portal currently offline</div>
      <code className="block text-xs text-adv-teal mt-1">{address}</code>
      <p className="text-sm text-adv-gray mt-3">{reason}</p>
      <p className="text-xs text-adv-gray mt-2">Try again later.</p>
    </div>
  );
}

// ── Capability invoke dialog ────────────────────────────────────────────────

function CapabilityDialog({
  address, capability, onClose,
}: {
  address: string;
  capability: Descriptor['capabilities'][number];
  onClose: () => void;
}) {
  const [input, setInput] = useState<Record<string, unknown>>({});
  const [response, setResponse] = useState<{ ok: boolean; body: unknown } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const props = capability.inputSchema?.properties ?? {};
  const required = new Set(capability.inputSchema?.required ?? []);

  // Esc-to-close. Focus the first input on mount for keyboard users.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function invoke() {
    setBusy(true); setError(null); setResponse(null);
    try {
      const res = await fetchWithAuth(`/api/portals/visit/${encodeURIComponent(address)}/capabilities/${capability.id}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const body = await res.json().catch(() => null);
      setResponse({ ok: res.ok, body });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const titleId = `capability-dialog-title-${capability.id}`;
  const descId = `capability-dialog-desc-${capability.id}`;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl rounded-xl border border-border bg-adv-card p-5 max-h-[90vh] overflow-y-auto">
        <header className="flex items-baseline justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-adv-teal/10 text-adv-teal text-xs">{capability.verb}</span>
              <h2 id={titleId} className="font-semibold">{capability.title}</h2>
            </div>
            <p id={descId} className="text-xs text-adv-gray mt-1">{capability.description}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close capability dialog"
            className="text-adv-gray hover:text-adv-off-white text-xl leading-none px-2"
          >×</button>
        </header>

        <div className="space-y-3">
          {Object.entries(props).length === 0 ? (
            <p className="text-sm text-adv-gray">No input fields declared. Submit to invoke.</p>
          ) : (
            Object.entries(props).map(([key, spec]) => (
              <label key={key} className="block">
                <span className="block text-xs font-medium mb-1">
                  {key} {required.has(key) && <span className="text-adv-red">*</span>}
                </span>
                {spec.type === 'string' && (
                  <input
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
                    placeholder={spec.description}
                    value={(input[key] as string) ?? ''}
                    onChange={(e) => setInput({ ...input, [key]: e.target.value })}
                  />
                )}
                {(spec.type === 'number' || spec.type === 'integer') && (
                  <input
                    type="number"
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
                    value={(input[key] as number | undefined) ?? ''}
                    onChange={(e) => setInput({ ...input, [key]: Number(e.target.value) })}
                  />
                )}
                {(spec.type === 'object' || spec.type === 'array' || !spec.type) && (
                  <textarea
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm font-mono focus:border-adv-teal focus:outline-none h-20"
                    placeholder='JSON: e.g. {"items":[{"name":"x"}]}'
                    onChange={(e) => {
                      try { setInput({ ...input, [key]: JSON.parse(e.target.value) }); } catch { /* keep raw */ }
                    }}
                  />
                )}
              </label>
            ))
          )}
        </div>

        {error && <div className="mt-3 text-sm text-adv-red">{error}</div>}
        {response && (
          <div className="mt-4 rounded-lg border border-border bg-adv-dark p-3">
            <div className="text-xs text-adv-gray mb-1">{response.ok ? 'Response' : 'Error'}</div>
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(response.body, null, 2)}</pre>
          </div>
        )}

        <footer className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm text-adv-gray hover:text-adv-off-white px-3 py-2">Cancel</button>
          <button
            onClick={invoke}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition disabled:opacity-50 flex items-center gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Invoke
          </button>
        </footer>
      </div>
    </div>
  );
}
