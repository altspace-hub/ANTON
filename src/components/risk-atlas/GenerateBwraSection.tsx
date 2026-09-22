/**
 * GenerateBwraSection — write the business-wide risk assessment from this Atlas.
 *
 * The score tables come straight from the Atlas (rendered by the server); the
 * model writes only the narrative, and every stated score is checked against
 * the Atlas. A run takes minutes and is a server-side job: leaving and coming
 * back re-attaches to it, and a second click does not start a second run.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Loader2, ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

interface ConsistencyIssue { kind: 'residual' | 'inherent' | 'outside_count'; path?: string; stated: number; atlas: number; excerpt: string }
interface DocSummary { id: string; created_at: string; paths_total: number; model_served: string | null; consistency_issues: ConsistencyIssue[] }
interface DocFull extends DocSummary { markdown: string }
interface JobSummary { status: 'running' | 'done' | 'failed'; startedAt: string; meta: { status?: string; docId?: string }; error?: string }

const POLL_MS = 3000;

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export default function GenerateBwraSection({ atlasId }: { atlasId: string }) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [current, setCurrent] = useState<DocFull | null>(null);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const timer = useRef<number | null>(null);

  const openDoc = useCallback(async (docId: string) => {
    const { document } = await readJson<{ document: DocFull }>(await fetchWithAuth(`/api/atlas/${atlasId}/bwra/${docId}`, { headers: getAuthHeader() }));
    setCurrent(document);
  }, [atlasId]);

  const loadDocs = useCallback(async (select?: string) => {
    const { documents } = await readJson<{ documents: DocSummary[] }>(await fetchWithAuth(`/api/atlas/${atlasId}/bwra`, { headers: getAuthHeader() }));
    setDocs(documents);
    const pick = select ?? documents[0]?.id;
    if (pick) await openDoc(pick);
  }, [atlasId, openDoc]);

  const stopPolling = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };

  const poll = useCallback(async () => {
    try {
      const { job: j } = await readJson<{ job: JobSummary | null }>(await fetchWithAuth(`/api/atlas/${atlasId}/bwra/job`, { headers: getAuthHeader() }));
      setJob(j);
      if (j?.status === 'running') { timer.current = window.setTimeout(() => { void poll(); }, POLL_MS); return; }
      if (j?.status === 'done') await loadDocs(j.meta.docId);
      if (j?.status === 'failed') setError(j.error || 'The assessment could not be written.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [atlasId, loadDocs]);

  useEffect(() => {
    void loadDocs().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    void poll();
    return stopPolling;
  }, [loadDocs, poll]);

  async function generate(): Promise<void> {
    setError(null); stopPolling();
    try {
      const { job: j } = await readJson<{ job: JobSummary }>(await fetchWithAuth(`/api/atlas/${atlasId}/bwra`, { method: 'POST', headers: getAuthHeader() }));
      setJob(j);
      timer.current = window.setTimeout(() => { void poll(); }, POLL_MS);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function downloadDocx(doc: DocSummary): Promise<void> {
    setDownloading(true); setError(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/bwra/${doc.id}/docx`, { headers: getAuthHeader() });
      if (!res.ok) await readJson(res);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] ?? `bwra-${atlasId}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setDownloading(false); }
  }

  const running = job?.status === 'running';

  return (
    <section aria-labelledby="bwra-heading">
      <h2 id="bwra-heading" className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-adv-teal">
        <FileText className="h-3.5 w-3.5" /> Business-wide risk assessment (AMLR Art. 10)
      </h2>
      <div className="rounded-lg border border-border bg-adv-card p-4">
        <p className="text-sm text-adv-gray">
          Writes the BWRA from this Atlas. The score tables come straight from the Atlas; AI writes the narrative around them,
          and every score it states is checked against the Atlas. A draft takes a few minutes.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void generate()}
            disabled={running}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-60"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {running ? 'Writing…' : docs.length > 0 ? 'Write a new draft' : 'Generate BWRA'}
          </button>
          {running && <span className="text-sm text-adv-gray" aria-live="polite">{job?.meta.status ?? 'Working'}…</span>}
        </div>
        {error && <p className="mt-3 text-sm text-adv-red" role="alert">{error}</p>}

        {current && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-adv-off-white">Draft of {current.created_at.slice(0, 10)}</span>
              <span className="text-adv-gray">· {current.paths_total} threat paths</span>
              {current.consistency_issues.length === 0 ? (
                <span className="flex items-center gap-1 rounded bg-adv-green/10 px-2 py-0.5 text-xs text-adv-green"><ShieldCheck className="h-3.5 w-3.5" /> Narrative matches the Atlas</span>
              ) : (
                <span className="flex items-center gap-1 rounded bg-adv-gold/10 px-2 py-0.5 text-xs text-adv-gold"><AlertTriangle className="h-3.5 w-3.5" /> {current.consistency_issues.length} statement(s) differ from the Atlas</span>
              )}
              <button
                onClick={() => void downloadDocx(current)}
                disabled={downloading}
                className="ml-auto rounded border border-adv-teal px-3 py-1 text-xs font-medium text-adv-teal hover:bg-adv-teal/10 disabled:opacity-60"
              >
                {downloading ? 'Downloading…' : 'Download .docx'}
              </button>
            </div>
            {current.consistency_issues.length > 0 && (
              <ul className="rounded border border-adv-gold/30 bg-adv-gold/5 p-3 text-xs text-adv-gold">
                {current.consistency_issues.map((i, n) => (
                  <li key={n}>
                    {i.kind === 'outside_count' ? 'Paths outside appetite' : `${i.path} ${i.kind}`}: the narrative says {i.stated}, the Atlas has {i.atlas}. The Atlas figure stands.
                  </li>
                ))}
              </ul>
            )}
            <div className="prose-output max-h-[32rem] overflow-y-auto rounded border border-border bg-adv-dark p-4 text-sm text-adv-off-white">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.markdown}</ReactMarkdown>
            </div>
            {docs.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-adv-gray">
                Earlier drafts:
                {docs.filter((d) => d.id !== current.id).map((d) => (
                  <button key={d.id} onClick={() => void openDoc(d.id)} className="rounded border border-border px-2 py-0.5 hover:border-adv-teal hover:text-adv-off-white">
                    {d.created_at.slice(0, 16).replace('T', ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
