/**
 * ProvenancePanel — Wave 1, the explainability contract.
 *
 * One panel per answer that shows what actually went into it: the engine
 * and model that ran, every source and every prompt layer with its hash, the
 * memory atoms injected, the caveats the model wrote about itself, and — on
 * demand — the exact system prompt as sent (from run_artifacts, not a live
 * recomposition).
 *
 * Depth follows the message's transparency level (0 / 1 / 2) as a DEFAULT,
 * never as a ceiling: every section can be opened at any level.
 *
 * Data precedence: the persisted config snapshot of the displayed message
 * wins; the live "context used" frame fills in during and right after a run;
 * the page's current config is the last fallback (older runs without a
 * snapshot). A live run's message id is minted in the browser at stream_end,
 * so the run record is looked up through the session's last persisted
 * assistant row when the local id misses.
 */
import { Fragment, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Layers, ChevronDown, ChevronRight, Copy, Check, Download, Loader2, Cpu, BookOpen,
  Atom, AlertTriangle, ClipboardList, RefreshCw, X, Info,
} from 'lucide-react';
import { fetchRunArtifact, fetchInjectedAtoms, fetchLatestAssistantMessageRow, fetchPromptPreview } from '@/lib/api';
import { buildOutputInstruction } from '@/lib/output-format-definitions';
import { useStreamStore } from '@/stores/useStreamStore';
import { useSessionMetaStore } from '@/stores/useSessionStore';
import { MODULES } from '@/lib/constants';
import type { ContextUsed, RunArtifact, InjectedAtomRow, PersistedAssistantMessageRow, PromptPreviewResult } from '@/lib/types';
import {
  layerLabel, atomArmFromLayerKey, engineLabel, costLabel, normalizeCostBasis, shortHash,
  normalizeTransparencyLevel, parseCaveatSections, defaultExpansion, summaryLine,
  groupManifestByType, packsLine, frameworkLine, splitDocuments, liveWebSourceRow,
  type ProvenanceSectionId,
} from '@/lib/provenance';

// ── Props ────────────────────────────────────────────────────

/** The page's current configuration — the last fallback when a message has no snapshot. */
export interface ProvenanceLiveConfig {
  model: string;
  thinking: string;
  creativity: string;
  transparencyLevel?: 0 | 1 | 2;
  writingTone?: string;
  audience?: string;
  channel?: string;
  outputLanguage?: string;
  selectedPersonas?: string[];
  selectedSkills?: string[];
  metaCognitiveEnabled?: boolean;
  multiPerspective?: boolean;
  structureReference?: { mode: string; description: string; fileName?: string };
}

interface ProvenancePanelProps {
  sessionId?: string;
  /** The displayed assistant output (the model's own caveats are parsed from it). */
  outputContent: string;
  isStreaming: boolean;
  /** Per-message config snapshot of the displayed message (null after a live run until reload). */
  configSnapshot: Record<string, unknown> | null;
  /** The live "context used" frame (documents, lens, project, layers) — the snapshot wins after reload. */
  contextUsed: ContextUsed | null;
  /** Name-only source manifest from the last stream — fallback when no run record exists. */
  sourceNames?: string[];
  live: ProvenanceLiveConfig;
}

interface Row { label: string; value: string; color?: string; title?: string }

type ArtifactStatus = 'idle' | 'loading' | 'ready' | 'none' | 'error';

/** Module load time — a message created after this in the browser is the live run's. */
const PANEL_LOADED_AT = Date.now();
const PROMPT_FIRST_SLICE = 100_000;

function isRecent(iso: string | undefined, ms: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t < ms;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function strArr(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-GB');
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : iso;
}

// ── Component ────────────────────────────────────────────────

export default function ProvenancePanel(props: ProvenancePanelProps) {
  const { sessionId, outputContent, isStreaming, configSnapshot, contextUsed, sourceNames, live } = props;

  // The displayed answer is always the session's last assistant message.
  const messages = useSessionMetaStore((s) => s.messages);
  const lastAssistant = useMemo(() => [...messages].reverse().find((m) => m.role === 'assistant'), [messages]);

  // Live token counters (accumulated per run; only trusted for the live run — see isLiveRun).
  const lastInputTokens = useStreamStore((s) => s.lastInputTokens);
  const lastOutputTokens = useStreamStore((s) => s.lastOutputTokens);
  const lastCachedTokens = useStreamStore((s) => s.lastCachedTokens);
  const lastCacheCreationTokens = useStreamStore((s) => s.lastCacheCreationTokens);
  // Wave 2: pages the model searched for / fetched itself on the SDK engine ('source_fetched' events).
  const lastWebSources = useStreamStore((s) => s.lastWebSources);

  // Raw fetch state; what the panel shows is derived below (artifact / artifactStatus).
  const [artifactFetchStatus, setArtifactFetchStatus] = useState<ArtifactStatus>('idle');
  const [artifactRow, setArtifactRow] = useState<RunArtifact | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [resolvedRow, setResolvedRow] = useState<PersistedAssistantMessageRow | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [showWholePrompt, setShowWholePrompt] = useState(false);

  // ── Snapshot precedence ──
  const snap: Record<string, unknown> = configSnapshot ?? resolvedRow?.config_snapshot ?? {};
  const level = normalizeTransparencyLevel(snap.transparencyLevel ?? live.transparencyLevel);
  const snapContext = (snap.contextUsed && typeof snap.contextUsed === 'object' ? snap.contextUsed : null) as ContextUsed | null;
  // During a run the live frame is the truth; afterwards the snapshot (persisted) wins.
  const ctx: ContextUsed | null = isStreaming ? (contextUsed ?? snapContext) : (snapContext ?? contextUsed);
  const frameMessageId = ctx?.assistantMessageId ?? null;

  const messageKey = lastAssistant?.id ?? 'none';
  const [open, setOpen] = useState<Record<ProvenanceSectionId, boolean>>(() => defaultExpansion(level));
  const toggle = (id: ProvenanceSectionId) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  // A new answer (or a level change for it) resets the defaults — adjusted during render, the way
  // React recommends for state that follows a prop. The user can still open anything afterwards.
  const openFor = `${messageKey}:${level}`;
  const [openKey, setOpenKey] = useState(openFor);
  if (openKey !== openFor) {
    setOpenKey(openFor);
    setOpen(defaultExpansion(level));
    setShowWholePrompt(false);
  }

  // ── Run record (artifact) resolution ──
  const artifactReqRef = useRef(0);
  // A run record only exists for a persisted, finished answer.
  const artifactWanted = !!sessionId && !isStreaming;
  useEffect(() => {
    if (!artifactWanted || !sessionId) return;
    // Two guards: the token ref beats a newer request; the flag beats this effect's own cleanup.
    let cancelled = false;
    const reqId = ++artifactReqRef.current;
    const alive = () => !cancelled && artifactReqRef.current === reqId;
    const localId = lastAssistant?.id;
    const createdAt = lastAssistant?.createdAt;
    // Wave 1: the context frame names the id the assistant row is persisted under, and the
    // stream store now mints the local message with it — so both usually agree. Try each once.
    const candidateIds = [...new Set([localId, frameMessageId].filter((id): id is string => !!id))];

    const attempt = async (n: number): Promise<void> => {
      if (!alive()) return;
      if (n === 0) {
        // A fresh lookup for this answer: forget the previous answer's row and error.
        setResolvedRow(null);
        setArtifactError(null);
      }
      setArtifactFetchStatus('loading');
      try {
        let art: RunArtifact | null = null;
        for (const id of candidateIds) {
          art = await fetchRunArtifact(sessionId, id);
          if (art || !alive()) break;
        }
        if (!alive()) return;
        if (!art) {
          // Safety net for runs whose frame carried no id: the server row has its own.
          const row = await fetchLatestAssistantMessageRow(sessionId);
          if (!alive()) return;
          if (row) setResolvedRow(row);
          if (row && !candidateIds.includes(row.id)) art = await fetchRunArtifact(sessionId, row.id);
        }
        if (!alive()) return;
        if (art) {
          setArtifactRow(art);
          setArtifactError(null);
          setArtifactFetchStatus('ready');
          return;
        }
        // The writer is fire-and-forget after stream_end: give a just-finished run a moment.
        if (n < 2 && isRecent(createdAt, 60_000)) {
          await new Promise<void>((r) => setTimeout(r, 1500));
          return attempt(n + 1);
        }
        setArtifactRow(null);
        setArtifactFetchStatus('none');
      } catch (err) {
        if (!alive()) return;
        setArtifactRow(null);
        setArtifactError(err instanceof Error ? err.message : 'Run record could not be loaded');
        setArtifactFetchStatus('error');
      }
    };
    void attempt(0);
    return () => { cancelled = true; };
  }, [artifactWanted, sessionId, lastAssistant?.id, lastAssistant?.createdAt, frameMessageId]);
  // What the panel shows: idle while streaming or without a session; a record only once it is ready.
  const artifactStatus: ArtifactStatus = artifactWanted ? artifactFetchStatus : 'idle';
  const artifact: RunArtifact | null = artifactWanted && artifactFetchStatus === 'ready' ? artifactRow : null;

  // ── Memory atoms — loaded when the section is open; keyed so a new session/answer starts empty ──
  const atomsKey = `${sessionId ?? ''}:${messageKey}`;
  const [atomsState, setAtomsState] = useState<{ key: string; rows: InjectedAtomRow[] | null; loading: boolean }>({ key: '', rows: null, loading: false });
  const atoms = atomsState.key === atomsKey ? atomsState.rows : null;
  const atomsLoading = atomsState.key === atomsKey && atomsState.loading;
  useEffect(() => {
    if (!open.memory || !sessionId || atoms !== null || atomsLoading) return;
    let cancelled = false;
    const key = atomsKey;
    const load = async () => {
      setAtomsState({ key, rows: null, loading: true });
      const rows = await fetchInjectedAtoms(sessionId).catch((): InjectedAtomRow[] => []);
      if (!cancelled) setAtomsState({ key, rows, loading: false });
    };
    void load();
    return () => { cancelled = true; };
  }, [open.memory, sessionId, atoms, atomsLoading, atomsKey]);

  // ── Derived facts ──
  const engine = str(snap.engine) ?? ctx?.engine;
  const modelRequested = str(snap.model) ?? ctx?.model ?? live.model;
  const modelServed = str(snap.modelServed) ?? (ctx?.modelServed ?? undefined);
  const effort = str(snap.effort) ?? (ctx?.effort ?? undefined);
  const thinking = str(snap.thinking) ?? ctx?.thinking ?? live.thinking;
  const creativity = str(snap.creativity) ?? live.creativity;
  const costBasis = normalizeCostBasis(snap.costBasis);
  const engineCostUsd = num(snap.engineCostUsd);
  const tone = str(snap.writingTone) ?? live.writingTone;
  const audience = str(snap.audience) ?? live.audience;
  const channel = str(snap.channel) ?? live.channel;
  const lang = str(snap.outputLanguage) ?? live.outputLanguage;
  const personas = strArr(snap.selectedPersonas) ?? live.selectedPersonas;
  const skills = strArr(snap.selectedSkills) ?? live.selectedSkills;
  const mergedSkills = strArr(snap.mergedSkills);
  const meta = typeof snap.metaCognitiveEnabled === 'boolean' ? snap.metaCognitiveEnabled : live.metaCognitiveEnabled;
  const multi = typeof snap.multiPerspective === 'boolean' ? snap.multiPerspective : live.multiPerspective;
  const structRef = (snap.structureReference && typeof snap.structureReference === 'object'
    ? snap.structureReference : live.structureReference) as ProvenanceLiveConfig['structureReference'];

  // Live counters belong to this answer only when it was produced in this page session.
  const isLiveRun = isStreaming || (
    !!lastAssistant?.createdAt
    && Date.parse(lastAssistant.createdAt) >= PANEL_LOADED_AT
    && lastOutputTokens > 0
    && lastAssistant.tokenCount === lastOutputTokens
  );
  const storedOutputTokens = lastAssistant?.tokenCount ?? resolvedRow?.token_count ?? null;

  const caveats = useMemo(() => parseCaveatSections(outputContent), [outputContent]);
  const atomArm = useMemo(
    () => artifact?.layer_summary.map((l) => atomArmFromLayerKey(l.layer)).find((a): a is string => a !== null) ?? null,
    [artifact],
  );
  const layerRows = useMemo(
    () => (artifact?.layer_summary ?? []).filter((l) => atomArmFromLayerKey(l.layer) === null),
    [artifact],
  );

  // ── Engine rows (the old "How ANTON Thought" config rows live here) ──
  const engineRows: Row[] = [];
  engineRows.push({ label: 'Engine', value: engineLabel(engine), color: 'text-adv-gray' });
  engineRows.push({ label: 'Model requested', value: modelRequested, color: 'text-adv-blue' });
  if (modelServed && modelServed !== modelRequested) engineRows.push({ label: 'Model served', value: modelServed, color: 'text-adv-blue' });
  engineRows.push({ label: 'Thinking', value: thinking, color: 'text-adv-teal' });
  if (effort) engineRows.push({ label: 'Effort', value: effort, color: 'text-adv-teal' });
  engineRows.push({ label: 'Creativity', value: creativity, color: 'text-adv-teal' });
  if (isLiveRun) {
    if (isStreaming && lastInputTokens === 0 && lastOutputTokens === 0) {
      engineRows.push({ label: 'Tokens', value: 'Counting — reported by the engine as it runs', color: 'text-adv-gray' });
    } else {
      engineRows.push({ label: 'Tokens in / out', value: `${fmtInt(lastInputTokens)} / ${fmtInt(lastOutputTokens)}`, color: 'text-adv-off-white' });
      if (lastCachedTokens > 0 || lastCacheCreationTokens > 0) {
        engineRows.push({ label: 'Cache read / written', value: `${fmtInt(lastCachedTokens)} / ${fmtInt(lastCacheCreationTokens)}`, color: 'text-adv-gray' });
      }
    }
  } else if (storedOutputTokens !== null) {
    engineRows.push({ label: 'Output tokens (stored)', value: fmtInt(storedOutputTokens), color: 'text-adv-off-white', title: 'Only the output count is stored per message; input and cache counts are live-run figures.' });
  }
  engineRows.push({
    label: 'Cost',
    value: isStreaming && !costBasis ? 'Recorded when the run completes' : costLabel(costBasis, engineCostUsd),
    color: 'text-adv-gray',
  });
  if (artifact) {
    engineRows.push({
      label: 'Prompt pin',
      value: `sha256 ${shortHash(artifact.prompt_sha256)} · ${fmtInt(artifact.prompt_chars)} chars${artifact.truncated ? ' · stored text truncated (hash covers the full prompt)' : ''}`,
      color: 'text-adv-gray',
      title: artifact.prompt_sha256,
    });
  }
  if (str(snap.userTurnSha256)) {
    engineRows.push({ label: 'User turn pin', value: `sha256 ${shortHash(str(snap.userTurnSha256))}`, color: 'text-adv-gray', title: str(snap.userTurnSha256) });
  }
  if (num(snap.modulePromptVersion) !== null || str(snap.modulePromptSha256)) {
    const v = num(snap.modulePromptVersion);
    engineRows.push({
      label: 'Module prompt',
      value: `${v !== null ? `v${v}` : 'version not recorded'}${str(snap.modulePromptSha256) ? ` · ${shortHash(str(snap.modulePromptSha256))}` : ''}`,
      color: 'text-adv-gray',
      title: [str(snap.modulePromptVersionId), str(snap.modulePromptSha256)].filter(Boolean).join(' · ') || undefined,
    });
  }
  if (str(snap.foundationVersionId)) engineRows.push({ label: 'Foundation', value: str(snap.foundationVersionId) ?? '', color: 'text-adv-gray' });
  if (snap.guardrailApplied === true) engineRows.push({ label: 'Guardrail applied', value: 'Yes', color: 'text-adv-teal' });
  if (snap.provenanceContract === true) engineRows.push({ label: 'Provenance contract', value: 'Required in the answer', color: 'text-adv-teal' });
  engineRows.push({ label: 'Transparency', value: `Level ${level}`, color: 'text-adv-gray' });
  if (tone) engineRows.push({ label: 'Tone', value: tone, color: 'text-adv-gray' });
  if (audience) engineRows.push({ label: 'Audience', value: audience, color: 'text-adv-gray' });
  if (channel) engineRows.push({ label: 'Channel', value: channel, color: 'text-adv-gray' });
  if (lang && lang !== 'en') engineRows.push({ label: 'Language', value: lang, color: 'text-adv-gray' });
  if (personas && personas.length > 0) engineRows.push({ label: 'Personas', value: personas.join(', '), color: 'text-adv-gold' });
  if (skills && skills.length > 0) engineRows.push({ label: 'Skills selected', value: skills.join(', '), color: 'text-adv-gold' });
  if (mergedSkills && mergedSkills.length > 0) {
    const auto = mergedSkills.filter((s) => !(skills ?? []).includes(s));
    engineRows.push({
      label: 'Skills injected',
      value: `${mergedSkills.join(', ')}${auto.length > 0 ? ` (auto-attached: ${auto.join(', ')})` : ''}`,
      color: 'text-adv-gold',
    });
  }
  if (multi) engineRows.push({ label: 'Multi-Perspective', value: 'Enabled', color: 'text-adv-teal' });
  if (meta) engineRows.push({ label: 'Meta-Cognitive', value: 'Enabled', color: 'text-adv-teal' });
  if (structRef && structRef.mode && structRef.mode !== 'none') {
    engineRows.push({ label: 'Structure Ref', value: structRef.mode + (structRef.fileName ? ` · ${structRef.fileName}` : ''), color: 'text-adv-gray' });
  }
  if (ctx?.goalsValues) engineRows.push({ label: 'Goals & values', value: 'Applied', color: 'text-adv-gray' });
  if (ctx?.orgContext) engineRows.push({ label: 'Organisation context', value: 'Applied', color: 'text-adv-gray' });
  if (ctx?.resumeContext) engineRows.push({ label: 'Resumed', value: 'Earlier session context carried', color: 'text-adv-gray' });

  // ── Source rows (the old context rows) ──
  const sourceRows: Row[] = [];
  if (ctx) {
    if (ctx.lens) {
      const mod = MODULES.find((m) => m.id === ctx.lens?.moduleId);
      sourceRows.push({ label: 'Answering as', value: mod?.label ?? ctx.lens.moduleId, color: 'text-adv-teal' });
    }
    if (ctx.project) sourceRows.push({ label: 'Project', value: ctx.project.name, color: 'text-adv-teal' });
    const { used, skipped } = splitDocuments(ctx.documents ?? []);
    if (used.length > 0) {
      sourceRows.push({
        label: 'Documents',
        value: `${used.map((d) => d.name).join(', ')}${skipped.length > 0 ? ` (+${skipped.length} skipped)` : ''}`,
        color: 'text-adv-off-white',
      });
    } else if (skipped.length > 0) {
      sourceRows.push({ label: 'Documents', value: `none in the prompt — ${skipped.length} skipped`, color: 'text-adv-gold' });
    }
    if ((ctx.skippedCount ?? 0) > 0 || skipped.length > 0) {
      const n = ctx.skippedCount ?? skipped.length;
      sourceRows.push({
        label: 'Skipped for budget',
        value: `${n} source${n === 1 ? '' : 's'}${(ctx.skippedTokens ?? 0) > 0 ? ` · ~${fmtInt(ctx.skippedTokens ?? 0)} tokens not sent` : ''}`,
        color: 'text-adv-gold',
      });
    }
    const otherSources = (ctx.knowledgeSources ?? []).filter((s) => !/\(uploaded\)$/.test(s));
    if (otherSources.length > 0) sourceRows.push({ label: 'Knowledge', value: otherSources.join(', '), color: 'text-adv-gray' });
    if (ctx.ragChunks > 0) sourceRows.push({ label: 'Retrieved', value: `${ctx.ragChunks} passage${ctx.ragChunks === 1 ? '' : 's'}`, color: 'text-adv-gray' });
    if (ctx.packs && ctx.packs.length > 0) {
      sourceRows.push({ label: 'Knowledge packs', value: packsLine(ctx.packs), color: 'text-adv-teal' });
    } else if ((ctx.packEntries ?? 0) > 0) {
      sourceRows.push({ label: 'Knowledge packs', value: `${ctx.packEntries} entr${ctx.packEntries === 1 ? 'y' : 'ies'} grounded`, color: 'text-adv-teal' });
    }
    if ((ctx.frameworks && ctx.frameworks.length > 0) || (ctx.frameworkArticles ?? 0) > 0) {
      sourceRows.push({
        label: 'Framework text',
        value: frameworkLine({ frameworks: ctx.frameworks ?? [], articles: ctx.frameworkArticles ?? 0, chars: ctx.frameworkChars ?? 0 }),
        color: 'text-adv-teal',
      });
    }
    if (ctx.packGroundingChars > 0) sourceRows.push({ label: 'Regulatory text', value: `~${fmtInt(Math.round(ctx.packGroundingChars / 4))} tokens grounded`, color: 'text-adv-gray' });
    if (ctx.atomChars > 0) sourceRows.push({ label: 'Memory', value: `~${fmtInt(Math.round(ctx.atomChars / 4))} tokens of institutional memory`, color: 'text-adv-gray' });
    if (ctx.webSearch) sourceRows.push({ label: 'Web search', value: 'Available to the model', color: 'text-adv-teal' });
  }
  if (sourceRows.length === 0 && !artifact && (sourceNames?.length ?? 0) === 0) {
    sourceRows.push({ label: 'Context', value: 'Your message and the conversation only', color: 'text-adv-gray' });
  }

  // Plain derivations (a few dozen rows at most) — cheaper than memo bookkeeping.
  const skippedDocs = splitDocuments(ctx?.documents ?? []).skipped;
  const manifest = artifact?.source_manifest ?? [];
  const manifestGroups = groupManifestByType(manifest);
  // The live web rows stand in until the run record (which carries the same pages, hashed) is loaded.
  const liveWebRows = isLiveRun && !artifact ? lastWebSources.map(liveWebSourceRow) : [];
  const sourceCount = artifact
    ? manifest.length
    : ((sourceNames?.length ?? (ctx ? ctx.knowledgeSources.length + ctx.documents.length : 0)) + liveWebRows.length) || (sourceNames || ctx ? 0 : null);
  const layerCount = artifact ? artifact.layer_summary.length : null;

  // ── Exact prompt actions ──
  const handleCopyPrompt = useCallback(async () => {
    if (!artifact) return;
    await navigator.clipboard.writeText(artifact.composed_prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }, [artifact]);

  const handleDownloadPrompt = useCallback(() => {
    if (!artifact) return;
    const blob = new Blob([artifact.composed_prompt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-${artifact.prompt_sha256.slice(0, 12)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [artifact]);

  const recordLine = (() => {
    if (isStreaming) return { tone: 'text-adv-teal', text: 'Live run — reading the live frame; the run record is pinned when the answer completes.' };
    if (!sessionId) return { tone: 'text-adv-gray', text: 'No session — nothing is persisted for this answer.' };
    if (artifactStatus === 'loading') return { tone: 'text-adv-gray', text: 'Loading the run record…' };
    if (artifactStatus === 'none') return { tone: 'text-adv-gray', text: 'No run record stored for this answer (older run) — showing what the message snapshot holds.' };
    if (artifactStatus === 'error') return { tone: 'text-adv-red', text: `Run record could not be loaded${artifactError ? ` — ${artifactError}` : ''}. Showing the snapshot instead.` };
    if (artifactStatus === 'ready' && artifact) return { tone: 'text-adv-gray', text: `Run record pinned ${fmtDate(artifact.created_at)}.` };
    return null;
  })();

  return (
    <div>
      {/* Header + summary line (every level) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-adv-teal" />
        <span className="text-xs font-medium text-adv-off-white">Provenance</span>
        <span className="text-[11px] text-adv-gray">
          {summaryLine({ engine, sourceCount, layerCount })} · Transparency level {level}
        </span>
        {artifactStatus === 'loading' && <Loader2 className="h-3 w-3 animate-spin text-adv-gray" />}
      </div>
      {recordLine && <p className={`mb-3 text-[11px] ${recordLine.tone}`}>{recordLine.text}</p>}

      <div className="space-y-2">
        {/* ── Engine ── */}
        <Section id="engine" title="Engine" icon={Cpu} open={open.engine} onToggle={toggle}>
          <RowList rows={engineRows} />
        </Section>

        {/* ── Sources ── */}
        <Section id="sources" title="Sources" icon={BookOpen} count={sourceCount ?? undefined} open={open.sources} onToggle={toggle}>
          {sourceRows.length > 0 && <RowList rows={sourceRows} />}
          {skippedDocs.length > 0 && (
            <div className="mt-2 rounded-md border border-adv-gold/30 bg-adv-dark px-3 py-2">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-adv-gold">Skipped — not in the prompt</p>
              <ul className="space-y-0.5 text-[11px]">
                {skippedDocs.map((d, i) => (
                  <li key={`${d.source}-${d.name}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="truncate text-adv-off-white" title={d.name}>{d.name}</span>
                    <span className="text-[10px] text-adv-gray">({d.sourceLabel})</span>
                    <span className={`text-[10px] ${d.budget ? 'text-adv-gold' : 'text-adv-red'}`}>{d.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {liveWebRows.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded-md bg-adv-dark">
              <p className="px-3 pt-2 text-[10px] uppercase tracking-wider text-adv-teal">
                Web sources the model used in this run{isStreaming ? ' (live)' : ' (until the run record loads)'}
              </p>
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-adv-gray">
                    <th className="px-3 py-1.5 font-medium">Kind</th>
                    <th className="px-3 py-1.5 font-medium">URL / query</th>
                    <th className="px-3 py-1.5 font-medium">Title</th>
                    <th className="px-3 py-1.5 font-medium text-right">Chars</th>
                    <th className="px-3 py-1.5 font-medium">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {liveWebRows.map((w, i) => (
                    <tr key={`${w.kind}-${w.primary}-${i}`} className="border-t border-border/60 align-top">
                      <td className="px-3 py-1.5 text-adv-gray">{w.kindLabel}</td>
                      <td className="max-w-[260px] truncate px-3 py-1.5 text-adv-off-white" title={w.primary}>{w.primary}</td>
                      <td className="max-w-[200px] truncate px-3 py-1.5 text-adv-gray" title={w.title ?? undefined}>{w.title ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right text-adv-gray">{w.charCount !== null ? fmtInt(w.charCount) : '—'}</td>
                      <td className="px-3 py-1.5 font-mono text-adv-gray" title={w.sha256 ?? undefined}>
                        {w.isError ? <span className="font-sans italic text-adv-red">tool reported an error</span> : shortHash(w.sha256)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {artifact ? (
            manifest.length > 0 ? (
              <div className="mt-2 overflow-x-auto rounded-md bg-adv-dark">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-adv-gray">
                      <th className="px-3 py-1.5 font-medium">Name</th>
                      <th className="px-3 py-1.5 font-medium text-right">Chars</th>
                      <th className="px-3 py-1.5 font-medium">Retrieved</th>
                      <th className="px-3 py-1.5 font-medium">Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manifestGroups.map((g) => (
                      <Fragment key={g.type}>
                        <tr className="border-t border-border bg-adv-dark-2">
                          <td colSpan={4} className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-adv-teal" title={g.type}>
                            {g.label} <span className="text-adv-gray">({g.count})</span>
                          </td>
                        </tr>
                        {g.entries.map((s, i) => (
                          <tr key={`${g.type}-${s.name}-${i}`} className="border-t border-border/60 align-top">
                            <td className="max-w-[300px] px-3 py-1.5 text-adv-off-white" title={s.url ?? s.path ?? s.name}>
                              <span className="block truncate">{s.name}</span>
                              {s.note && s.contentHashed !== false && <span className="block text-[10px] text-adv-gray">{s.note}</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right text-adv-gray">{typeof s.charCount === 'number' ? fmtInt(s.charCount) : '—'}</td>
                            <td className="px-3 py-1.5 text-adv-gray">{fmtDate(s.retrievedAt)}</td>
                            <td className="px-3 py-1.5 font-mono text-adv-gray" title={s.sha256}>
                              {s.contentHashed === false
                                ? <span className="font-sans italic">{s.note ? s.note : 'not verifiable (model-side)'}</span>
                                : shortHash(s.sha256)}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-adv-gray">The run record lists no external sources — the answer drew on the conversation and the model's own knowledge.</p>
            )
          ) : (sourceNames && sourceNames.length > 0) ? (
            <div className="mt-2 rounded-md bg-adv-dark px-3 py-2">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-adv-gray">Sources reported by the run (names only — no hashes without a run record)</p>
              <ul className="space-y-0.5 text-[11px] text-adv-off-white">
                {sourceNames.map((n) => <li key={n} className="truncate" title={n}>· {n}</li>)}
              </ul>
            </div>
          ) : null}
        </Section>

        {/* ── Layers ── */}
        <Section id="layers" title="Layers" icon={Layers} count={layerCount ?? undefined} open={open.layers} onToggle={toggle}>
          {artifact ? (
            layerRows.length > 0 ? (
              <div className="overflow-x-auto rounded-md bg-adv-dark">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-adv-gray">
                      <th className="px-3 py-1.5 font-medium">Layer</th>
                      <th className="px-3 py-1.5 font-medium text-right">Chars</th>
                      <th className="px-3 py-1.5 font-medium">sha256</th>
                    </tr>
                  </thead>
                  <tbody>
                    {layerRows.map((l) => (
                      <tr key={l.layer} className="border-t border-border/60">
                        <td className="px-3 py-1.5 text-adv-off-white" title={l.layer}>{layerLabel(l.layer)}</td>
                        <td className="px-3 py-1.5 text-right text-adv-gray">{fmtInt(l.chars)}</td>
                        <td className="px-3 py-1.5 font-mono text-adv-gray" title={l.sha256}>{shortHash(l.sha256)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[11px] text-adv-gray">The run record carries no per-layer index.</p>
            )
          ) : (
            <p className="text-[11px] text-adv-gray">
              {isStreaming ? 'Layer hashes are pinned when the answer completes.' : 'Per-layer hashes need a run record — none is stored for this answer.'}
            </p>
          )}
        </Section>

        {/* ── Memory ── */}
        <Section id="memory" title="Memory" icon={Atom} count={atoms?.length} open={open.memory} onToggle={toggle}>
          {atomArm && (
            <p className="mb-2 text-[11px] text-adv-gray">
              A/B arm: <span className="font-medium text-adv-off-white">{atomArm}</span>
              {atomArm === 'holdout' ? ' — the memory layer was withheld for this run (effectiveness experiment).' : ''}
            </p>
          )}
          {ctx && ctx.atomChars > 0 && (
            <p className="mb-2 text-[11px] text-adv-gray">~{fmtInt(Math.round(ctx.atomChars / 4))} tokens of institutional memory were in the prompt.</p>
          )}
          {!sessionId ? (
            <p className="text-[11px] text-adv-gray">No session — atoms are only recorded for persisted runs.</p>
          ) : atomsLoading ? (
            <div className="flex items-center gap-2 text-[11px] text-adv-gray"><Loader2 className="h-3 w-3 animate-spin" /> Loading injected atoms…</div>
          ) : atoms && atoms.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-adv-gray">Atoms injected in this session, by retrieval score</p>
              {atoms.map((a) => (
                <div key={a.atom_id} className="rounded-md bg-adv-dark px-3 py-2">
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-adv-off-white" title={a.content}>{a.content}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-adv-gray">
                    <span className="rounded-full border border-border px-1.5 py-0.5">{a.retrieval_method || 'hybrid'}</span>
                    <span>score {Number.isFinite(a.retrieval_score) ? a.retrieval_score.toFixed(2) : '—'}</span>
                    {a.category && <span>{a.category}</span>}
                    {a.atom_type && <span>{a.atom_type}</span>}
                    {Number.isFinite(a.confidence) && <span>{Math.round(a.confidence * 100)}% conf</span>}
                    {a.was_relevant !== null && <span className={a.was_relevant === 1 ? 'text-adv-green' : 'text-adv-red'}>{a.was_relevant === 1 ? 'rated relevant' : 'rated not relevant'}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-adv-gray">No institutional-memory atoms were injected in this session.</p>
          )}
        </Section>

        {/* ── The model's own caveats ── */}
        <Section id="caveats" title="The model's own caveats" icon={AlertTriangle} count={caveats.length} open={open.caveats} onToggle={toggle}>
          {caveats.length > 0 ? (
            <div className="space-y-2">
              {caveats.map((c, i) => (
                <div key={`${c.heading}-${i}`} className="rounded-xl border border-adv-teal/20 bg-adv-teal/5 p-3">
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-adv-teal">{c.heading}</p>
                  {c.body ? (
                    <div className="prose-output max-w-none text-xs text-adv-off-white/90">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.body}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-[11px] italic text-adv-gray">(heading present, nothing written under it)</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-adv-gray">
              {isStreaming
                ? 'Caveats appear here once the answer states its sources, assumptions and what was not checked.'
                : 'The answer contains no "Sources, assumptions and what was not checked" section (or a similar one). Raise the transparency level to require it.'}
            </p>
          )}
        </Section>

        {/* ── Exact prompt ── */}
        <Section id="prompt" title="Exact prompt as sent" icon={ClipboardList} open={open.prompt} onToggle={toggle}>
          {artifact ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-adv-gray">
                  {fmtInt(artifact.prompt_chars)} chars · ~{fmtInt(Math.ceil(artifact.prompt_chars / 4))} tokens · sha256 <span className="font-mono" title={artifact.prompt_sha256}>{shortHash(artifact.prompt_sha256)}</span>
                  {artifact.truncated && <span className="ml-1 text-adv-gold">· stored text truncated at 2 MB (the hash covers the full prompt)</span>}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyPrompt}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-adv-gray transition-colors hover:border-adv-teal hover:text-adv-teal"
                  >
                    {promptCopied ? <Check className="h-3 w-3 text-adv-green" /> : <Copy className="h-3 w-3" />}
                    {promptCopied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={handleDownloadPrompt}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-adv-gray transition-colors hover:border-adv-teal hover:text-adv-teal"
                  >
                    <Download className="h-3 w-3" />
                    Download .txt
                  </button>
                </div>
              </div>
              <pre className="max-h-[60vh] overflow-auto rounded-lg bg-adv-dark p-3 font-mono text-xs leading-relaxed text-adv-gray whitespace-pre-wrap">
                {showWholePrompt || artifact.composed_prompt.length <= PROMPT_FIRST_SLICE
                  ? artifact.composed_prompt
                  : artifact.composed_prompt.slice(0, PROMPT_FIRST_SLICE)}
              </pre>
              {!showWholePrompt && artifact.composed_prompt.length > PROMPT_FIRST_SLICE && (
                <button
                  onClick={() => setShowWholePrompt(true)}
                  className="mt-2 text-[11px] text-adv-teal hover:underline"
                >
                  Show the remaining {fmtInt(artifact.composed_prompt.length - PROMPT_FIRST_SLICE)} characters
                </button>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-adv-gray">
              {isStreaming
                ? 'The prompt is pinned when the answer completes.'
                : artifactStatus === 'loading'
                ? 'Loading the run record…'
                : 'No run record stored for this answer (older run) — the exact prompt was not kept. Use "What will be sent" before a run to see the prompt that a new run would carry.'}
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}

// ── Building blocks ──────────────────────────────────────────

function Section({
  id, title, icon: Icon, count, open, onToggle, children,
}: {
  id: ProvenanceSectionId;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  open: boolean;
  onToggle: (id: ProvenanceSectionId) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-adv-dark-2">
      <button
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray" /> : <ChevronRight className="h-3.5 w-3.5 text-adv-gray" />}
        <Icon className="h-3.5 w-3.5 text-adv-teal" />
        <span className="text-xs font-medium text-adv-off-white">{title}</span>
        {typeof count === 'number' && (
          <span className="rounded-full bg-adv-teal/20 px-1.5 py-0.5 text-[10px] font-medium text-adv-teal">{count}</span>
        )}
      </button>
      {open && <div className="border-t border-border px-3 py-2.5">{children}</div>}
    </div>
  );
}

function RowList({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-1.5">
      {rows.map(({ label, value, color, title }) => (
        <div key={label} className="flex items-center justify-between gap-3 rounded-md bg-adv-dark px-3 py-2">
          <span className="shrink-0 text-[11px] text-adv-gray" title={title}>{label}</span>
          <span className={`max-w-[65%] truncate text-right text-[11px] font-medium ${color ?? 'text-adv-gray'}`} title={title ?? value}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Pre-run preview: "What will be sent" ─────────────────────

/** Everything the page would send on Run that shapes the prompt (mirrors useClaude's streamMessage body). */
export interface PromptPreviewConfig {
  model: string;
  thinking: string;
  creativity: string;
  precision?: string;
  moduleId?: string;
  areaId?: string;
  systemPrompt: string;
  selectedOutputFormats: string[];
  plainTextMode?: boolean;
  selectedPersonas?: string[];
  selectedSkills?: string[];
  multiPerspective?: boolean;
  metaCognitiveEnabled?: boolean;
  structureReference?: { mode: string; description: string; fileName?: string; fileId?: string };
  referenceOutput?: string;
  transparencyLevel?: 0 | 1 | 2;
  writingTone?: string;
  emojiEnabled?: boolean;
  nativeReasoningEnabled?: boolean;
  atomInjectionEnabled?: boolean;
  audience?: string;
  channel?: string;
  outputLanguage?: string;
  knowledgeSources?: Record<string, unknown>;
  uploadedFileIds?: string[];
  sessionId?: string | null;
  /** The message about to be sent — lets the composer size the user turn exactly as a run would. */
  userMessage?: string;
  /** Open chat's expert lens — the run sends the lens module and an empty prompt override. */
  lens?: { moduleId: string; areaId: string | null } | null;
}

/** The POST body for /api/claude/preview-prompt — same field rules as the real run. */
export function buildPromptPreviewBody(cfg: PromptPreviewConfig): Record<string, unknown> {
  const lens = cfg.lens ?? null;
  return {
    model: cfg.model,
    thinking: cfg.thinking,
    creativity: cfg.creativity,
    precision: cfg.precision,
    moduleId: lens ? lens.moduleId : (cfg.moduleId || undefined),
    areaId: lens ? (lens.areaId || undefined) : (cfg.areaId || undefined),
    // An empty override lets the composer load the lens module's own prompt (as the run does).
    systemPrompt: lens ? '' : cfg.systemPrompt,
    outputInstruction: buildOutputInstruction(cfg.selectedOutputFormats) || undefined,
    outputFormats: cfg.selectedOutputFormats,
    plainTextMode: cfg.plainTextMode,
    selectedPersonas: cfg.selectedPersonas,
    selectedSkills: cfg.selectedSkills,
    multiPerspective: cfg.multiPerspective,
    metaCognitiveEnabled: cfg.metaCognitiveEnabled,
    structureReference: cfg.structureReference,
    referenceOutput: cfg.referenceOutput || undefined,
    transparencyLevel: cfg.transparencyLevel,
    writingTone: cfg.writingTone,
    emojiEnabled: cfg.emojiEnabled,
    nativeReasoningEnabled: cfg.nativeReasoningEnabled,
    atomInjectionEnabled: cfg.atomInjectionEnabled,
    audience: cfg.audience || undefined,
    channel: cfg.channel || undefined,
    outputLanguage: cfg.outputLanguage || undefined,
    knowledgeSources: cfg.knowledgeSources,
    uploadedFileIds: (cfg.uploadedFileIds ?? []).filter((id) => id),
    sessionId: cfg.sessionId || undefined,
    userMessage: cfg.userMessage?.trim() || undefined,
  };
}

export function PromptPreviewChip({ config, disabled, className }: { config: PromptPreviewConfig; disabled?: boolean; className?: string }) {
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PromptPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchPromptPreview(buildPromptPreviewBody(config));
      setResult(r);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Failed to compose the prompt preview');
    } finally {
      setLoading(false);
    }
  }, [config]);

  const openPreview = () => {
    if (disabled) return;
    setOpenModal(true);
    void load();
  };

  useEffect(() => {
    if (!openModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenModal(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openModal]);

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        disabled={disabled}
        title={disabled ? 'Available once the current run finishes' : 'See the exact system prompt a run would carry right now'}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
          disabled
            ? 'border-border bg-adv-dark text-adv-gray opacity-50 cursor-not-allowed'
            : 'border-border bg-adv-dark text-adv-gray hover:border-adv-teal/50 hover:text-adv-off-white'
        } ${className ?? ''}`}
      >
        <ClipboardList className="h-3.5 w-3.5" />
        What will be sent
      </button>

      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="What will be sent"
          onClick={() => setOpenModal(false)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-adv-dark shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-adv-card px-4 py-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-adv-teal" />
                <span className="text-sm font-semibold text-adv-off-white">What will be sent</span>
                {result && (
                  <span className="rounded-full bg-adv-teal/10 px-2 py-0.5 text-[11px] font-medium text-adv-teal">
                    ~{fmtInt(result.estimatedTokens)} tokens
                    {result.knowledgeTokenEstimate > 0 ? ` · ~${fmtInt(result.knowledgeTokenEstimate)} from knowledge` : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {result && (
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-adv-gray transition-colors hover:border-adv-teal hover:text-adv-teal"
                  >
                    {copied ? <Check className="h-3 w-3 text-adv-green" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
                <button
                  onClick={() => void load()}
                  disabled={loading}
                  className="flex items-center gap-1 rounded-md border border-adv-teal/30 bg-adv-teal/10 px-2.5 py-1 text-[11px] font-medium text-adv-teal transition-colors hover:bg-adv-teal/20 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh
                </button>
                <button
                  onClick={() => setOpenModal(false)}
                  aria-label="Close preview"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-adv-gray transition-colors hover:bg-adv-dark hover:text-adv-off-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex items-start gap-2 border-b border-border px-4 py-2 text-[11px] text-adv-gray">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                The system prompt composed from your current configuration — the same layers a run would carry. Your message and the conversation are added on top at run time.
                {result?.model ? ` Model: ${result.model}.` : ''}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {loading && !result ? (
                <div className="flex items-center gap-2 text-xs text-adv-gray"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Composing the prompt…</div>
              ) : error ? (
                <p className="text-xs text-adv-red">{error}</p>
              ) : result ? (
                <>
                  {result.layers && result.layers.length > 0 && (
                    <div className="mb-3 overflow-x-auto rounded-md bg-adv-card">
                      <p className="px-3 pt-2 text-[10px] uppercase tracking-wider text-adv-gray">
                        Layers that would be sent
                        {typeof result.staticChars === 'number' && typeof result.dynamicChars === 'number'
                          ? ` · static ${fmtInt(result.staticChars)} chars · dynamic ${fmtInt(result.dynamicChars)} chars`
                          : ''}
                      </p>
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-adv-gray">
                            <th className="px-3 py-1.5 font-medium">Layer</th>
                            <th className="px-3 py-1.5 font-medium text-right">Chars</th>
                            <th className="px-3 py-1.5 font-medium">Cache</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.layers.map((l) => (
                            <tr key={l.key} className="border-t border-border/60">
                              <td className="px-3 py-1.5 text-adv-off-white" title={l.key}>{layerLabel(l.key)}</td>
                              <td className="px-3 py-1.5 text-right text-adv-gray">{fmtInt(l.chars)}</td>
                              <td className="px-3 py-1.5 text-adv-gray">{l.cacheable ? 'static (cacheable)' : 'per-run'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {result.sourceManifest.length > 0 && (
                    <div className="mb-3 rounded-md bg-adv-card px-3 py-2">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-adv-gray">Sources that would be included</p>
                      <ul className="space-y-0.5 text-[11px] text-adv-off-white">
                        {result.sourceManifest.map((s) => <li key={s} className="truncate" title={s}>· {s}</li>)}
                      </ul>
                    </div>
                  )}
                  <pre className="rounded-lg bg-adv-card p-3 font-mono text-xs leading-relaxed text-adv-gray whitespace-pre-wrap">{result.prompt}</pre>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
