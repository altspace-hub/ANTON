/**
 * CompanyAppetiteSection — Stage 7b: the company-wide Risk Appetite Statement.
 *
 * The position shown here is the deterministic worst-of rollup across every
 * threat path (computeCompanyAppetite). "Write the statement" drafts the
 * board-approvable document from it: every position, count and outside path
 * is rendered by the server from the Atlas; AI writes only the narrative, and
 * any statement that contradicts the rollup is flagged. The draft carries a
 * sign-off block — the system never marks it approved.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Award, Loader2, ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type Position = 'within' | 'boundary' | 'outside' | 'unacceptable';
type Cadence = '' | 'annual' | 'semi-annual' | 'quarterly';
interface Rollup {
  overall_position: Position | null;
  by_domain: Record<string, Position>;
  by_dimension: { operational: Position | null };
  paths_outside_or_unacceptable: number;
  paths_at_boundary: number;
  paths_within: number;
  paths_unscored: number;
}
interface Issue { kind: string; path?: string; score?: number; stated: string | number; atlas: string | number; excerpt: string }
interface DocSummary { id: string; created_at: string; overall_position: Position | null; approver_name: string | null; consistency_issues: Issue[] }
interface DocFull extends DocSummary { markdown: string }
interface JobSummary { status: 'running' | 'done' | 'failed'; meta: { status?: string; docId?: string }; error?: string }

const POLL_MS = 3000;
const LABEL: Record<Position, string> = { within: 'Within appetite', boundary: 'At boundary', outside: 'Outside appetite', unacceptable: 'Unacceptable' };
const TONE: Record<Position, string> = {
  within: 'bg-adv-green/10 text-adv-green', boundary: 'bg-adv-gold/10 text-adv-gold',
  outside: 'bg-adv-red/10 text-adv-red', unacceptable: 'bg-adv-red/20 text-adv-red',
};
const DOMAIN: Record<string, string> = {
  amlcft: 'AML/CFT', sanctions: 'Sanctions', fraud: 'Fraud', abc: 'ABC', market_abuse: 'Market abuse',
  tax_evasion_facilitation: 'Tax evasion', export_controls: 'Export controls', modern_slavery: 'Modern slavery',
};

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function PositionBadge({ position }: { position: Position | null }) {
  if (!position) return <span className="rounded bg-adv-dark px-2 py-0.5 text-xs text-adv-gray">Not yet scored</span>;
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${TONE[position]}`}>{LABEL[position]}</span>;
}

/** `refreshKey` changes whenever the Atlas does (the dashboard passes its last event time), so the rollup follows accepted suggestions. */
export default function CompanyAppetiteSection({ atlasId, refreshKey }: { atlasId: string; refreshKey?: string | null }) {
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [current, setCurrent] = useState<DocFull | null>(null);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [approverName, setApproverName] = useState('');
  const [approverRole, setApproverRole] = useState('');
  const [cadence, setCadence] = useState<Cadence>('');
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const base = `/api/atlas/${atlasId}/company-appetite`;

  const loadRollup = useCallback(async () => {
    setRollup((await readJson<{ rollup: Rollup }>(await fetchWithAuth(base, { headers: getAuthHeader() }))).rollup);
  }, [base]);

  const openDoc = useCallback(async (docId: string) => {
    const { document } = await readJson<{ document: DocFull }>(await fetchWithAuth(`${base}/statements/${docId}`, { headers: getAuthHeader() }));
    setCurrent(document);
  }, [base]);

  const loadDocs = useCallback(async (select?: string) => {
    const { documents } = await readJson<{ documents: DocSummary[] }>(await fetchWithAuth(`${base}/statements`, { headers: getAuthHeader() }));
    setDocs(documents);
    const pick = select ?? documents[0]?.id;
    if (pick) await openDoc(pick);
  }, [base, openDoc]);

  const stopPolling = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };

  const poll = useCallback(async () => {
    try {
      const { job: j } = await readJson<{ job: JobSummary | null }>(await fetchWithAuth(`${base}/statements/job`, { headers: getAuthHeader() }));
      setJob(j);
      if (j?.status === 'running') { timer.current = window.setTimeout(() => { void poll(); }, POLL_MS); return; }
      if (j?.status === 'done') await loadDocs(j.meta.docId);
      if (j?.status === 'failed') setError(j.error || 'The statement could not be written.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [base, loadDocs]);

  useEffect(() => {
    const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
    void loadDocs().catch(fail);
    void poll();
    return stopPolling;
  }, [loadDocs, poll]);

  useEffect(() => {
    void loadRollup().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [loadRollup, refreshKey]);

  async function generate(): Promise<void> {
    setError(null); setNotice(null); stopPolling();
    try {
      const body: Record<string, string> = {};
      if (approverName.trim()) body.approver_name = approverName.trim();
      if (approverRole.trim()) body.approver_role = approverRole.trim();
      if (cadence) body.review_cadence = cadence;
      const { job: j, started } = await readJson<{ job: JobSummary; started: boolean }>(await fetchWithAuth(`${base}/statements`, {
        method: 'POST', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }));
      setJob(j);
      // One run per Atlas at a time: a second click joins the running one, whose details stand.
      if (!started) setNotice('A statement is already being written for this Atlas — this page follows that run; the approver and review details entered here were not used.');
      void loadRollup().catch(() => undefined);
      timer.current = window.setTimeout(() => { void poll(); }, POLL_MS);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function downloadDocx(doc: DocSummary): Promise<void> {
    setDownloading(true); setError(null);
    try {
      const res = await fetchWithAuth(`${base}/statements/${doc.id}/docx`, { headers: getAuthHeader() });
      if (!res.ok) await readJson(res);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] ?? `risk-appetite-${atlasId}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setDownloading(false); }
  }

  const running = job?.status === 'running';
  const domains = rollup ? Object.entries(rollup.by_domain) : [];
  const field = 'rounded border border-border bg-adv-dark px-2 py-1.5 text-sm text-adv-off-white';

  return (
    <section aria-labelledby="company-appetite-heading">
      <h2 id="company-appetite-heading" className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-adv-teal">
        <Award className="h-3.5 w-3.5" /> Company-wide risk appetite (Stage 7b)
      </h2>
      <div className="rounded-lg border border-border bg-adv-card p-4">
        {rollup && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-adv-off-white">Overall position</span>
              <PositionBadge position={rollup.overall_position} />
              <span className="text-xs text-adv-gray">
                {rollup.paths_outside_or_unacceptable} outside · {rollup.paths_at_boundary} at boundary · {rollup.paths_within} within · {rollup.paths_unscored} not scored
              </span>
            </div>
            {(domains.length > 0 || rollup.by_dimension.operational) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {domains.map(([d, pos]) => (
                  <span key={d} className="flex items-center gap-1 text-adv-gray">{DOMAIN[d] ?? d} <PositionBadge position={pos} /></span>
                ))}
                {rollup.by_dimension.operational && (
                  <span className="flex items-center gap-1 text-adv-gray">Operational <PositionBadge position={rollup.by_dimension.operational} /></span>
                )}
              </div>
            )}
            <p className="text-xs text-adv-gray">The worst position of any threat path — one material risk out of control is enough to put the company outside its appetite.</p>
          </div>
        )}

        <p className="mt-3 text-sm text-adv-gray">
          Writes the board-approvable statement from this rollup. Every position, count and outside path comes from the Atlas; AI writes
          the narrative around them, and anything it states differently is flagged. It is a draft until it is signed.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-adv-gray">Approver
            <input value={approverName} onChange={(e) => setApproverName(e.target.value)} maxLength={200} placeholder="e.g. Jane Doe" className={`mt-1 ${field}`} disabled={running} />
          </label>
          <label className="flex flex-col text-xs text-adv-gray">Role
            <input value={approverRole} onChange={(e) => setApproverRole(e.target.value)} maxLength={200} placeholder="Board Chair, Owner…" className={`mt-1 ${field}`} disabled={running} />
          </label>
          <label className="flex flex-col text-xs text-adv-gray">Review
            <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)} className={`mt-1 ${field}`} disabled={running}>
              <option value="">Not set</option>
              <option value="annual">Annual</option>
              <option value="semi-annual">Semi-annual</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </label>
          <button
            onClick={() => void generate()}
            disabled={running}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-60"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {running ? 'Writing…' : docs.length > 0 ? 'Write a new draft' : 'Write the statement'}
          </button>
          {running && <span className="text-sm text-adv-gray" aria-live="polite">{job?.meta.status ?? 'Working'}…</span>}
        </div>
        {error && <p className="mt-3 text-sm text-adv-red" role="alert">{error}</p>}
        {notice && <p className="mt-3 text-sm text-adv-gold" role="status">{notice}</p>}

        {current && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-adv-off-white">Draft of {current.created_at.slice(0, 10)}</span>
              <PositionBadge position={current.overall_position} />
              {current.consistency_issues.length === 0 ? (
                <span className="flex items-center gap-1 rounded bg-adv-green/10 px-2 py-0.5 text-xs text-adv-green" title="Checked: the overall position, path scores and the number of paths outside appetite"><ShieldCheck className="h-3.5 w-3.5" /> No contradiction found</span>
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
                    {i.kind === 'overall_position' ? 'Overall position' : i.kind === 'outside_count' ? 'Paths outside appetite' : i.kind === 'residual_count' ? `Paths at residual ${i.score ?? '?'}` : `${i.path} ${i.kind}`}: the narrative says {String(i.stated)}, the Atlas has {String(i.atlas)}. The Atlas figure stands.
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
