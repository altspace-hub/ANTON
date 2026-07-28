// ── Transform Panel — Output Transformation System UI (spec §8) ──────────
//
// Renders alongside (below) the existing export buttons on the module
// output page. Fetches applicable renderers for the current session,
// groups them by category, and runs them on click with inline preview +
// download actions.
//
// Empty state per spec §8.3: if no non-package category has applicable
// renderers, we render nothing (the built-in exports cover the rest).

import { useEffect, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';
import {
  ChevronDown, ChevronRight, Loader2, Eye, Download, CheckCircle2, AlertCircle,
  BarChart3, Users, Package, Shield, Gavel,
} from 'lucide-react';

// SVG sanitization profile — keep visual primitives, strip script + event
// handlers + foreignObject (which can carry HTML). This protects against
// any future renderer that emits unescaped user content.
const SVG_PURIFY_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ['script', 'foreignObject'],
  FORBID_ATTR: ['onload', 'onclick', 'onmouseover', 'onerror', 'onfocus'],
};

type Category = 'visualize' | 'adapt_audience' | 'package' | 'regulatory' | 'review';

interface Renderer {
  id: string;
  label: string;
  description: string;
  category: Category;
  output: { file_type: string; mime_type: string; filename_template: string };
  status: 'stable' | 'beta' | 'experimental' | 'disabled';
}

interface RunResult {
  artifact_id: number;
  file_path: string;
  preview_path?: string;
  file_type: string;
  mime_type: string;
  metadata?: Record<string, unknown>;
  duration_ms: number;
  error?: string;
  file_size_bytes?: number;
}

interface ArtifactRow {
  id: number;
  renderer_id: string;
  file_path: string;
  file_type: string;
  mime_type: string;
  file_size_bytes: number | null;
  metadata: unknown;
  created_at: string;
}

const CATEGORY_ORDER: Category[] = ['visualize', 'adapt_audience', 'package', 'regulatory', 'review'];

/**
 * Registry renderers whose output ExportBar already offers via the legacy /api/export
 * path. Listing them here too would show two buttons for the same file. Every OTHER
 * 'package' renderer must still be listed — see the filter below.
 */
const EXPORTBAR_DUPLICATES = new Set([
  'export-md', 'export-docx', 'export-xlsx', 'export-pdf', 'export-pptx',
]);
const CATEGORY_META: Record<Category, { label: string; icon: typeof BarChart3; blurb: string }> = {
  visualize:       { label: 'Visualize',          icon: BarChart3, blurb: 'Turn this output into a diagram you can preview and download. Instant — no AI call.' },
  adapt_audience:  { label: 'Adapt for audience', icon: Users,     blurb: 'Re-write the output for a different reader. Each one runs a fresh AI pass.' },
  package:         { label: 'Package',            icon: Package,   blurb: 'Download the output as a file.' },
  review:          { label: 'Review',             icon: Shield,    blurb: 'Run a fresh, critical second pass over the output. Each one runs a new AI review.' },
  regulatory:      { label: 'Regulatory',         icon: Gavel,     blurb: 'Regulatory-specific checks over the output.' },
};

/** Plain-language "what you get when you press it" for one renderer. */
function outcomeText(r: Renderer): string {
  const fileLabel: Record<string, string> = {
    md: 'a Markdown document', pdf: 'a PDF', docx: 'a Word document',
    xlsx: 'an Excel workbook', pptx: 'a slide deck', svg: 'an SVG image',
    mmd: 'a diagram', html: 'a standalone HTML file',
    tex: 'a LaTeX source file (you compile it)',
  };
  const out = fileLabel[r.output.file_type] ?? `a .${r.output.file_type} file`;
  if (r.category === 'review' || r.category === 'adapt_audience') {
    return `Press to run a fresh AI pass — produces ${out} to preview & download. Uses API credit.`;
  }
  if (r.category === 'visualize') {
    return `Press to build ${out} from this output. Instant, no AI call.`;
  }
  return `Press to download ${out}.`;
}

/** Turn a raw upstream error (often raw Anthropic JSON) into one clean line. */
function friendlyError(raw: string): string {
  const low = raw.toLowerCase();
  if (low.includes('credit balance is too low')) {
    return 'Out of Anthropic API credits — top up in the Anthropic console (Plans & Billing), then try again.';
  }
  if (low.includes('rate_limit') || low.includes('rate limit')) {
    return 'The AI API is rate-limiting requests — wait a moment and try again.';
  }
  if (low.includes('overloaded')) {
    return 'The AI API is temporarily overloaded — try again shortly.';
  }
  const m = raw.match(/"message"\s*:\s*"([^"]+)"/);
  if (m) return m[1];
  return raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
}

export default function TransformPanel({ sessionId }: { sessionId: string | null | undefined }) {
  const [renderers, setRenderers] = useState<Renderer[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<Category>>(new Set());
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, RunResult>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<{ status: string | null; contentType: string | null }>({ status: null, contentType: null });

  const load = useCallback(async () => {
    if (!sessionId) { setLoading(false); return; }
    setError(null);
    try {
      const [appRes, artRes] = await Promise.all([
        fetchWithAuth(`/api/renderers/applicable?session_id=${encodeURIComponent(sessionId)}`, { headers: getAuthHeader() }),
        fetchWithAuth(`/api/sessions/${encodeURIComponent(sessionId)}/artifacts`, { headers: getAuthHeader() }),
      ]);
      if (appRes.ok) {
        const d = await appRes.json() as { renderers?: Renderer[]; structured_status?: string | null; content_type?: string | null };
        setRenderers(d.renderers ?? []);
        setExtraction({ status: d.structured_status ?? null, contentType: d.content_type ?? null });
      }
      if (artRes.ok) {
        const d = await artRes.json() as { artifacts?: ArtifactRow[] };
        setArtifacts(d.artifacts ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  // When renderers arrive, auto-expand the first non-empty non-package
  // category (spec §8.2). Package stays collapsed by default because the
  // built-in export buttons above already cover it.
  useEffect(() => {
    if (renderers.length === 0) return;
    const grouped = groupByCategory(renderers);
    const firstNonPackage = CATEGORY_ORDER.find(c => c !== 'package' && grouped[c]?.length);
    if (firstNonPackage && expanded.size === 0) {
      setExpanded(new Set([firstNonPackage]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderers]);

  async function runRenderer(r: Renderer): Promise<void> {
    if (!sessionId) return;
    setRunning(r.id); setError(null);
    try {
      const res = await fetchWithAuth('/api/renderers/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ session_id: sessionId, renderer_id: r.id }),
      });
      const data = await res.json() as RunResult & { error?: string };
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setResults(m => { const nm = new Map(m); nm.set(r.id, data); return nm; });
      await load();
    } catch (e) {
      setError(`${r.label}: ${friendlyError(e instanceof Error ? e.message : String(e))}`);
    } finally {
      setRunning(null);
    }
  }

  if (!sessionId || loading) return null;

  const grouped = groupByCategory(renderers);
  // Panel visibility: the built-in export buttons already cover "package",
  // so we only show the panel when there is at least one applicable
  // renderer in a non-package category.
  const nonPackageCount = CATEGORY_ORDER.filter(c => c !== 'package')
    .reduce((acc, c) => acc + (grouped[c]?.length ?? 0), 0);
  if (nonPackageCount === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-adv-card/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">Transform</h3>
        <span className="text-[10px] text-adv-gray">{nonPackageCount} available</span>
      </div>

      {error && (
        <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[11px] text-adv-red flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {!extraction.contentType && (
        <div className="rounded border border-adv-blue/20 bg-adv-blue/5 px-3 py-2 text-[10px] text-adv-gray">
          Diagram and board-deck transforms appear once the structured analysis of this
          output is ready
          {extraction.status ? ` — status: ${extraction.status}` : ' — not started yet'}.
          {extraction.status === 'failed' || extraction.status === 'error'
            ? ' It failed; re-running the module will retry it.'
            : ' It runs automatically just after a module finishes.'}
        </div>
      )}

      {CATEGORY_ORDER.map(cat => {
        // The five export-* renderers produce the same artefacts ExportBar already offers
        // through /api/export, so listing them here would give every format two buttons.
        // But skipping the WHOLE 'package' category hid everything else in it — the
        // standalone-html renderer has had no entry point anywhere in the product since it
        // shipped, and a new one would inherit the same fate. Suppress the duplicates, not
        // the category.
        const items = (grouped[cat] ?? []).filter(
          r => cat !== 'package' || !EXPORTBAR_DUPLICATES.has(r.id),
        );
        if (items.length === 0) return null;
        const Icon = CATEGORY_META[cat].icon;
        const isOpen = expanded.has(cat);
        return (
          <div key={cat} className="rounded-lg border border-border">
            <button
              onClick={() => setExpanded(s => { const n = new Set(s); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; })}
              className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-adv-dark/40"
            >
              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray" /> : <ChevronRight className="h-3.5 w-3.5 text-adv-gray" />}
              <Icon className="h-3.5 w-3.5 text-adv-teal" />
              <span className="text-xs font-medium text-adv-off-white">{CATEGORY_META[cat].label}</span>
              <span className="text-[10px] text-adv-gray/70">({items.length})</span>
            </button>
            {isOpen && (
              <div className="border-t border-border p-2 space-y-2">
                <p className="text-[10px] text-adv-gray/80">{CATEGORY_META[cat].blurb}</p>
                <div className="flex flex-wrap gap-2">
                  {items.map(r => (
                    <RendererButton
                      key={r.id}
                      renderer={r}
                      sessionId={sessionId}
                      busy={running === r.id}
                      result={results.get(r.id)}
                      existingArtifact={artifacts.find(a => a.renderer_id === r.id)}
                      onRun={() => void runRenderer(r)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RendererButton({ renderer, sessionId, busy, result, existingArtifact, onRun }: {
  renderer: Renderer;
  sessionId: string;
  busy: boolean;
  result?: RunResult;
  existingArtifact?: ArtifactRow;
  onRun: () => void;
}) {
  const done = !!result || !!existingArtifact;
  const artifactId = result?.artifact_id ?? existingArtifact?.id;
  const fileType = result?.file_type ?? existingArtifact?.file_type ?? renderer.output.file_type;
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="rounded border border-border bg-adv-dark/50 p-2 flex flex-col gap-1 w-64">
      <button
        onClick={onRun}
        disabled={busy}
        className={`rounded px-2.5 py-1.5 text-[11px] font-medium inline-flex items-center gap-1.5 disabled:opacity-60 ${
          done
            ? 'border border-adv-green/40 text-adv-green hover:bg-adv-green/10'
            : 'bg-adv-teal text-adv-dark hover:bg-adv-teal-dark'
        }`}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : done ? <CheckCircle2 className="h-3 w-3" /> : null}
        {renderer.label}
        {renderer.status !== 'stable' && (
          <span className="ml-1 text-[9px] uppercase tracking-wider text-adv-gold">{renderer.status}</span>
        )}
      </button>
      <p className="text-[10px] text-adv-gray leading-snug">{renderer.description}</p>
      <p className="text-[9px] text-adv-gray/60 leading-snug">{outcomeText(renderer)}</p>
      {done && artifactId && (
        <div className="flex items-center gap-1 pt-1">
          {supportsInlinePreview(fileType) && (
            <button
              onClick={() => setShowPreview(s => !s)}
              className="text-[10px] text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1"
            >
              <Eye className="h-3 w-3" /> {showPreview ? 'Hide' : 'Preview'}
            </button>
          )}
          <a
            href={`/api/renderers/artifacts/${artifactId}`}
            className="text-[10px] text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1 ml-auto"
          >
            <Download className="h-3 w-3" /> .{fileType}
          </a>
        </div>
      )}
      {showPreview && artifactId && (
        <ArtifactPreview
          artifactId={artifactId}
          fileType={fileType}
          mermaidSyntax={(result?.metadata?.mermaid_syntax as string | undefined) ?? null}
          sessionId={sessionId}
        />
      )}
    </div>
  );
}

function ArtifactPreview({ artifactId, fileType, mermaidSyntax }: { artifactId: number; fileType: string; mermaidSyntax: string | null; sessionId: string }) {
  const [content, setContent] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (mermaidSyntax) { setContent(mermaidSyntax); return; }
    if (!supportsInlinePreview(fileType)) return;
    void (async () => {
      try {
        const r = await fetchWithAuth(`/api/renderers/artifacts/${artifactId}`, { headers: getAuthHeader() });
        if (!r.ok) return;
        const t = await r.text();
        if (!cancelled) setContent(t);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [artifactId, fileType, mermaidSyntax]);

  if (fileType === 'mmd') {
    return <MermaidPreview source={content ?? mermaidSyntax ?? ''} artifactId={artifactId} />;
  }
  if (fileType === 'svg') {
    if (!content) return <div className="text-[10px] text-adv-gray italic pt-1">Loading preview…</div>;
    const safe = DOMPurify.sanitize(content, SVG_PURIFY_CONFIG);
    return (
      <div className="rounded border border-border bg-white p-2 max-h-96 overflow-auto mt-1" dangerouslySetInnerHTML={{ __html: safe }} />
    );
  }
  if (fileType === 'md') {
    if (!content) return <div className="text-[10px] text-adv-gray italic pt-1">Loading preview…</div>;
    return (
      <pre className="rounded border border-border bg-adv-dark p-2 text-[10px] text-adv-off-white whitespace-pre-wrap max-h-96 overflow-auto mt-1 leading-snug">
        {content}
      </pre>
    );
  }
  return null;
}

/**
 * Render Mermaid source inline via dynamic mermaid.js import. We import
 * on first render so the library isn't shipped in the main bundle.
 */
function MermaidPreview({ source, artifactId }: { source: string; artifactId: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        // strict: disables HTML labels + click handlers → no XSS via user-
        // controlled step labels or embedded directives.
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'default' });
        // Defense-in-depth: strip Mermaid directive blocks (%%{init:...}%%)
        // from the source before rendering — they're configuration, not
        // content, and can override securityLevel at render time.
        const safeSource = source.replace(/%%\{[^}]*\}%%/g, '');
        const { svg } = await mermaid.render(`mermaid-${artifactId}`, safeSource);
        if (!cancelled) setSvg(svg);
      } catch (err) {
        if (!cancelled) setRenderError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [source, artifactId]);

  if (renderError) {
    return <div className="text-[10px] text-adv-red italic pt-1">Preview failed: {renderError}</div>;
  }
  if (!svg) return <div className="text-[10px] text-adv-gray italic pt-1">Rendering diagram…</div>;
  const safe = DOMPurify.sanitize(svg, SVG_PURIFY_CONFIG);
  return <div className="rounded border border-border bg-white p-2 max-h-96 overflow-auto mt-1" dangerouslySetInnerHTML={{ __html: safe }} />;
}

function supportsInlinePreview(fileType: string): boolean {
  return fileType === 'mmd' || fileType === 'svg' || fileType === 'md' || fileType === 'html';
}

function groupByCategory(items: Renderer[]): Record<Category, Renderer[]> {
  const out: Record<Category, Renderer[]> = {
    visualize: [], adapt_audience: [], package: [], review: [], regulatory: [],
  };
  for (const r of items) out[r.category]?.push(r);
  return out;
}
