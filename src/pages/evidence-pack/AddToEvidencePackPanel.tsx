/**
 * AddToEvidencePackPanel — "Add this session / gap assessment to an evidence
 * pack", embedded where the work happens (the output toolbar's Evidence chip,
 * the gap wizard's results step) rather than only on the Audit pages.
 *
 * Flow: pick one of the user's draft packs or create one (title prefilled
 * from the subject), decide whether prompts and evidence texts travel
 * verbatim (off by default — they can carry client documents; their hashes
 * travel regardless), then add the scope and run the collector. The result
 * links to the pack, where it is finalised and signed.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileArchive, Loader2, CheckCircle2, ExternalLink, AlertCircle } from 'lucide-react';
import {
  listEvidencePacks, createEvidencePack, addScopeToEvidencePack, collectEvidencePack, fetchSession,
  type EvidencePackScope, type EvidencePackSummary, type EvidencePackCollectResult,
} from '@/lib/api';

interface AddToEvidencePackPanelProps {
  /** The scope to add. */
  scope: EvidencePackScope;
  /** Title for a new pack. A session scope upgrades it to the session's own title once loaded. */
  defaultTitle: string;
  /** Noun for the copy: "session", "gap assessment". */
  subjectLabel: string;
}

function withIncludePrompts(scope: EvidencePackScope, include: boolean): EvidencePackScope {
  switch (scope.type) {
    case 'session': return { type: 'session', sessionId: scope.sessionId, includePrompts: include };
    case 'project': return { type: 'project', projectId: scope.projectId, includePrompts: include };
    case 'gap_assessment': return { type: 'gap_assessment', assessmentId: scope.assessmentId, includePrompts: include };
    case 'engagement': return { type: 'engagement', engagementId: scope.engagementId, includePrompts: include };
    default: return scope;
  }
}

export default function AddToEvidencePackPanel({ scope, defaultTitle, subjectLabel }: AddToEvidencePackPanelProps) {
  const [packs, setPacks] = useState<EvidencePackSummary[] | null>(null);
  const [target, setTarget] = useState<'new' | string>('new');
  const [title, setTitle] = useState(defaultTitle);
  const [titleTouched, setTitleTouched] = useState(false);
  const [includePrompts, setIncludePrompts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvidencePackCollectResult | null>(null);

  const supportsPrompts = scope.type !== 'mission' && scope.type !== 'task';
  const scopeKey = JSON.stringify(scope);

  // The user's draft packs — the ones this scope can still be added to.
  useEffect(() => {
    let cancelled = false;
    listEvidencePacks('draft')
      .then((rows) => { if (!cancelled) setPacks(rows); })
      .catch(() => { if (!cancelled) setPacks([]); });
    return () => { cancelled = true; };
  }, [result]);

  // A session scope prefers the session's own title for a new pack.
  useEffect(() => {
    if (scope.type !== 'session' || titleTouched) return;
    let cancelled = false;
    fetchSession(scope.sessionId)
      .then((session: { title?: unknown } | null) => {
        if (cancelled || !session || typeof session.title !== 'string' || !session.title.trim()) return;
        setTitle(`Evidence — ${session.title.trim()}`);
      })
      .catch(() => { /* keep the default title */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  async function addAndCollect() {
    setBusy(true); setError(null); setResult(null);
    try {
      const scoped = supportsPrompts ? withIncludePrompts(scope, includePrompts) : scope;
      let packId: string;
      if (target === 'new') {
        const created = await createEvidencePack({ title: title.trim() || defaultTitle, scope: scoped });
        packId = created.id;
      } else {
        packId = target;
        await addScopeToEvidencePack(packId, scoped);
      }
      const collected = await collectEvidencePack(packId);
      setResult(collected);
      setTarget(packId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const draftPacks = packs ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <FileArchive className="h-4 w-4 text-adv-teal" />
        <span className="text-xs font-medium text-adv-off-white">Add this {subjectLabel} to an evidence pack</span>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-adv-gray">
        A pack collects the record of this {subjectLabel} — the model and engine that ran, the composed prompt
        (as a hash unless included), the knowledge sources with their hashes, the audit rows, quality scores,
        reviewer verdicts and exports — and hashes every item into a manifest you can finalise, sign with this
        instance&apos;s key and hand to a regulator.
      </p>

      {/* Target: a draft pack or a new one */}
      <div className="mb-3 space-y-1.5">
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-off-white">
          <input
            type="radio"
            name="evidence-pack-target"
            checked={target === 'new'}
            onChange={() => setTarget('new')}
            disabled={busy}
            className="mt-0.5 accent-[#2DD4A8]"
          />
          <span className="flex-1">
            <span className="font-medium">New pack</span>
            {target === 'new' && (
              <input
                type="text"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
                disabled={busy}
                placeholder="Pack title"
                aria-label="Evidence pack title"
                className="mt-1.5 w-full rounded-lg border border-border bg-adv-card px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none"
              />
            )}
          </span>
        </label>
        {packs === null && (
          <p className="flex items-center gap-1.5 text-[11px] text-adv-gray"><Loader2 className="h-3 w-3 animate-spin" /> Loading your draft packs…</p>
        )}
        {draftPacks.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-off-white">
            <input
              type="radio"
              name="evidence-pack-target"
              checked={target === p.id}
              onChange={() => setTarget(p.id)}
              disabled={busy}
              className="mt-0.5 accent-[#2DD4A8]"
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{p.title}</span>
              <span className="ml-1.5 text-[11px] text-adv-gray">{p.id} · {p.item_count} item{p.item_count === 1 ? '' : 's'} · draft</span>
              {p.scope_label && <span className="mt-0.5 block truncate text-[11px] text-adv-gray">{p.scope_label}</span>}
            </span>
          </label>
        ))}
      </div>

      {supportsPrompts && (
        <label className="mb-3 flex cursor-pointer items-start gap-2 text-xs text-adv-gray">
          <input
            type="checkbox"
            checked={includePrompts}
            onChange={(e) => setIncludePrompts(e.target.checked)}
            disabled={busy}
            className="mt-0.5 h-3.5 w-3.5 accent-[#2DD4A8]"
          />
          <span>
            Include composed prompts and evidence texts verbatim. They can carry client documents, so this is off by
            default — only their SHA-256 travels, which still verifies against the text held on this instance.
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={addAndCollect}
          disabled={busy || (target === 'new' && !title.trim())}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileArchive className="h-3.5 w-3.5" />}
          {busy ? 'Collecting…' : target === 'new' ? 'Create pack and collect' : 'Add to pack and collect'}
        </button>
        <Link to="/evidence-packs" className="flex items-center gap-1 text-[11px] text-adv-gray hover:text-adv-teal">
          All packs <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-adv-red"><AlertCircle className="h-3.5 w-3.5" /> {error}</p>
      )}

      {result && (
        <div className="mt-3 rounded-lg border border-adv-teal/30 bg-adv-teal/10 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-adv-teal">
            <CheckCircle2 className="h-3.5 w-3.5" /> Collected {result.itemCount} item{result.itemCount === 1 ? '' : 's'} into {result.packId}
          </p>
          <p className="mt-1 text-adv-gray">
            {Object.entries(result.itemsByType).map(([type, n]) => `${n} ${type}`).join(' · ')}
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-adv-gray">manifest {result.manifestHash}</p>
          <Link
            to={`/evidence-packs/${encodeURIComponent(result.packId)}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-adv-teal/40 bg-adv-dark px-3 py-1.5 font-medium text-adv-teal hover:bg-adv-teal/20"
          >
            Open pack <ExternalLink className="h-3 w-3" />
          </Link>
          <span className="ml-2 text-[11px] text-adv-gray">Still a draft — finalise it there to sign the manifest.</span>
        </div>
      )}
    </div>
  );
}
