/**
 * export-provenance.ts — the provenance appendix every exported deliverable
 * carries (Wave 3, 2026-09-16).
 *
 * Before this, a docx/pdf/xlsx handed to a regulator named the module, the
 * model and a session id — all supplied by the browser — and nothing that tied
 * the file to the run that produced it: no output hash, no prompt hash, no
 * source hashes, no note of what was skipped or could not be verified. The
 * data existed (run_artifacts, messages.config_snapshot, audit_log,
 * quality_scores, human_oversight_reviews, session_exports); the export never
 * looked at it.
 *
 * This module looks the facts up server-side for the exported message, renders
 * them as a Markdown appendix the export generators already know how to lay
 * out, and returns the facts so the route can prefer them over client metadata.
 * Everything is best-effort: a missing table or row degrades to a shorter
 * appendix, never to a failed export.
 */
import { createHash } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

export interface ProvenanceSource {
  type: string;
  name: string;
  sha256?: string;
  charCount?: number;
  retrievedAt?: string;
  contentHashed: boolean;
  note?: string;
}

export interface ProvenanceFacts {
  sessionId: string;
  runId: string;
  createdAt: string | null;
  engine: string | null;
  modelRequested: string | null;
  modelServed: string | null;
  thinking: string | null;
  effort: string | null;
  costBasis: string | null;
  moduleId: string | null;
  modulePromptVersion: number | null;
  modulePromptSha256: string | null;
  foundationVersionId: string | null;
  guardrailApplied: boolean | null;
  provenanceContract: boolean | null;
  promptSha256: string | null;
  promptChars: number | null;
  promptTruncated: boolean;
  /** sha256 of the stored assistant message content. */
  outputSha256Stored: string | null;
  /** sha256 of the content actually being exported. */
  outputSha256Exported: string;
  outputMatchesStored: boolean | null;
  sources: ProvenanceSource[];
  layers: Array<{ layer: string; chars: number; sha256: string }>;
  packs: Array<{ name: string; version: string | null; entries: number }>;
  frameworks: string[];
  frameworkArticles: number;
  atomChars: number;
  ragChunks: number;
  webSearch: boolean;
  skippedCount: number;
  skippedTokens: number;
  structuredStatus: string | null;
  structuredError: string | null;
  quality: { score: number; model: string | null; scoredAt: string | null } | null;
  review: { verdict: string; reviewerName: string | null; reviewerRole: string | null; createdAt: string | null; messageId: string | null; boundToRun: boolean } | null;
  exportVersion: number | null;
  exportContentHash: string;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

type Row = Record<string, unknown>;

function parseMaybe<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return v as T;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function iso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && v) return v;
  return null;
}

/**
 * Look up everything the run record knows about the exported message.
 * `messageId` is preferred; without it, the session's latest assistant message.
 */
export async function buildProvenanceFacts(
  db: DatabaseAdapter,
  input: { sessionId: string; messageId?: string | null; exportedContent: string; exportVersion?: number | null; exportContentHash?: string | null },
): Promise<ProvenanceFacts | null> {
  const { sessionId, exportedContent } = input;
  let message: Row | undefined;
  try {
    if (input.messageId) {
      message = await db.get(
        `SELECT id, model_id, created_at, content, config_snapshot FROM messages WHERE id = ? AND session_id = ? AND role = 'assistant'`,
        input.messageId, sessionId,
      ) as Row | undefined;
    }
    if (!message) {
      message = await db.get(
        `SELECT id, model_id, created_at, content, config_snapshot FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1`,
        sessionId,
      ) as Row | undefined;
    }
  } catch { message = undefined; }
  if (!message) return null;

  const runId = String(message.id);
  const snapshot = parseMaybe<Row>(message.config_snapshot, {});
  const contextUsed = parseMaybe<Row>(snapshot.contextUsed, {});

  let artifact: Row | undefined;
  try {
    artifact = await db.get(
      `SELECT prompt_sha256, prompt_chars, truncated, layer_summary, source_manifest FROM run_artifacts WHERE message_id = ? AND session_id = ?`,
      runId, sessionId,
    ) as Row | undefined;
  } catch { artifact = undefined; }

  let quality: ProvenanceFacts['quality'] = null;
  try {
    const q = await db.get(
      `SELECT overall_score, model_used, created_at FROM quality_scores WHERE session_id = ? AND origin = 'run' ORDER BY created_at DESC LIMIT 1`,
      sessionId,
    ) as Row | undefined;
    const score = num(q?.overall_score);
    if (q && score !== null) quality = { score, model: str(q.model_used), scoredAt: iso(q.created_at) };
  } catch { quality = null; }

  let review: ProvenanceFacts['review'] = null;
  try {
    const r = await db.get(
      `SELECT * FROM human_oversight_reviews WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`,
      sessionId,
    ) as Row | undefined;
    if (r && str(r.verdict)) {
      const boundMessageId = str(r.message_id);
      review = {
        verdict: String(r.verdict),
        reviewerName: str(r.reviewer_name),
        reviewerRole: str(r.reviewer_role),
        createdAt: iso(r.created_at),
        messageId: boundMessageId,
        boundToRun: boundMessageId === runId,
      };
    }
  } catch { review = null; }

  let structuredStatus: string | null = null;
  let structuredError: string | null = null;
  try {
    const s = await db.get(`SELECT * FROM sessions WHERE id = ?`, sessionId) as Row | undefined;
    structuredStatus = str(s?.structured_status);
    structuredError = str(s?.structured_error);
  } catch { /* leave null */ }

  const outputSha256Exported = sha256Hex(exportedContent);
  const storedContent = str(message.content);
  const outputSha256Stored = storedContent ? sha256Hex(storedContent) : null;

  const sources = parseMaybe<ProvenanceSource[]>(artifact?.source_manifest, []);
  const layers = parseMaybe<Array<{ layer: string; chars: number; sha256: string }>>(artifact?.layer_summary, []);
  const packs = parseMaybe<ProvenanceFacts['packs']>(contextUsed.packs, []);
  const frameworks = parseMaybe<string[]>(contextUsed.frameworks, []);

  return {
    sessionId,
    runId,
    createdAt: iso(message.created_at),
    engine: str(snapshot.engine) ?? str(contextUsed.engine),
    modelRequested: str(snapshot.model) ?? str(message.model_id),
    modelServed: str(snapshot.modelServed) ?? str(contextUsed.modelServed),
    thinking: str(snapshot.thinking) ?? str(contextUsed.thinking),
    effort: str(snapshot.effort) ?? str(contextUsed.effort),
    costBasis: str(snapshot.costBasis),
    moduleId: str((contextUsed.lens as Row | undefined)?.moduleId) ?? null,
    modulePromptVersion: num(snapshot.modulePromptVersion),
    modulePromptSha256: str(snapshot.modulePromptSha256),
    foundationVersionId: str(snapshot.foundationVersionId),
    guardrailApplied: bool(snapshot.guardrailApplied),
    provenanceContract: bool(snapshot.provenanceContract),
    promptSha256: str(artifact?.prompt_sha256),
    promptChars: num(artifact?.prompt_chars),
    promptTruncated: artifact?.truncated === true || artifact?.truncated === 1,
    outputSha256Stored,
    outputSha256Exported,
    outputMatchesStored: outputSha256Stored ? outputSha256Stored === outputSha256Exported : null,
    sources: Array.isArray(sources) ? sources : [],
    layers: Array.isArray(layers) ? layers : [],
    packs: Array.isArray(packs) ? packs : [],
    frameworks: Array.isArray(frameworks) ? frameworks : [],
    frameworkArticles: num(contextUsed.frameworkArticles) ?? 0,
    atomChars: num(contextUsed.atomChars) ?? 0,
    ragChunks: num(contextUsed.ragChunks) ?? 0,
    webSearch: contextUsed.webSearch === true,
    skippedCount: num(contextUsed.skippedCount) ?? 0,
    skippedTokens: num(contextUsed.skippedTokens) ?? 0,
    structuredStatus,
    structuredError,
    quality,
    review,
    exportVersion: input.exportVersion ?? null,
    exportContentHash: input.exportContentHash ?? outputSha256Exported.slice(0, 16),
  };
}

const ENGINE_LABELS: Record<string, string> = {
  anthropic_sdk: 'Claude subscription',
  anthropic: 'Anthropic API',
  openai_codex: 'Codex subscription',
  openai: 'OpenAI API',
  azure_openai: 'Azure OpenAI',
  google: 'Google Gemini',
  mistral: 'Mistral API',
  ollama: 'Ollama (local)',
  openai_compatible: 'OpenAI-compatible endpoint',
};

const SOURCE_LABELS: Record<string, string> = {
  uploaded_file: 'Uploaded document',
  local_file: 'Folder file',
  url: 'Online reference',
  rag_chunk: 'Knowledge-base passage',
  bm25_chunk: 'Knowledge-base passage',
  knowledge_pack_entity: 'Knowledge pack entry',
  framework_article: 'Framework article',
  web_fetch: 'Web page fetched by the model',
  web_search: 'Web search by the model',
  web_search_tool: 'Web search (API tool)',
  builtin: 'Model built-in knowledge',
  summary: 'Source',
};

const short = (h: string | null | undefined, n = 12): string => (h ? `${h.slice(0, n)}…` : '—');
// Backslashes first, then pipes (CodeQL js/incomplete-sanitization): escaping
// only `|` turns `\|` in a source name into `\\|`, which splits the cell.
const cell = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** The Markdown appendix appended to every export. */
export function renderProvenanceAppendix(f: ProvenanceFacts): string {
  const rows: Array<[string, string]> = [];
  rows.push(['Run', `${f.runId}${f.createdAt ? ` · ${f.createdAt}` : ''}`]);
  const engineBits = [
    f.engine ? (ENGINE_LABELS[f.engine] ?? f.engine) : null,
    f.thinking ? `thinking ${f.thinking}` : null,
    f.effort ? `effort ${f.effort}` : null,
    f.costBasis === 'plan' ? 'plan usage' : f.costBasis === 'unknown' ? 'unknown pricing' : null,
  ].filter(Boolean);
  if (engineBits.length) rows.push(['Engine', engineBits.join(' · ')]);
  const modelBits = [
    f.modelRequested ? `requested ${f.modelRequested}` : null,
    f.modelServed && f.modelServed !== f.modelRequested?.replace(/^(sdk|codex):/, '') ? `served ${f.modelServed}` : null,
  ].filter(Boolean);
  if (modelBits.length) rows.push(['Model', modelBits.join(' · ')]);
  const moduleBits = [
    f.moduleId,
    f.modulePromptVersion !== null ? `prompt v${f.modulePromptVersion}${f.modulePromptSha256 ? ` (${short(f.modulePromptSha256)})` : ''}` : null,
    f.guardrailApplied ? 'compliance guardrail applied' : null,
    f.provenanceContract ? 'provenance contract applied' : null,
  ].filter(Boolean);
  if (moduleBits.length) rows.push(['Module', moduleBits.join(' · ')]);
  if (f.promptSha256) rows.push(['Prompt', `sha256 ${short(f.promptSha256, 16)} · ${(f.promptChars ?? 0).toLocaleString('en-GB')} chars${f.promptTruncated ? ' · stored copy truncated' : ''}`]);
  rows.push(['Output', `sha256 ${short(f.outputSha256Exported, 16)}${
    f.outputMatchesStored === true ? ' · matches the stored answer'
    : f.outputMatchesStored === false ? ' · differs from the stored answer (edited or reformatted after the run)'
    : ''}`]);
  const knowledgeBits = [
    f.packs.length ? `${f.packs.length} knowledge pack${f.packs.length === 1 ? '' : 's'} (${f.packs.map((p) => `${p.name}${p.version ? ` v${p.version}` : ''} · ${p.entries}`).join('; ')})` : null,
    f.frameworks.length ? `${f.frameworks.length} framework${f.frameworks.length === 1 ? '' : 's'} · ${f.frameworkArticles} article${f.frameworkArticles === 1 ? '' : 's'}` : null,
    f.atomChars > 0 ? `institutional memory ~${Math.round(f.atomChars / 4).toLocaleString('en-GB')} tokens` : null,
    f.ragChunks > 0 ? `${f.ragChunks} knowledge-base passage${f.ragChunks === 1 ? '' : 's'}` : null,
    f.webSearch ? 'web search available to the model' : null,
  ].filter(Boolean);
  if (knowledgeBits.length) rows.push(['Knowledge', knowledgeBits.join(' · ')]);
  if (f.skippedCount > 0) rows.push(['Budget', `${f.skippedCount} source${f.skippedCount === 1 ? '' : 's'} skipped for context budget (~${f.skippedTokens.toLocaleString('en-GB')} tokens not sent)`]);
  if (f.quality) rows.push(['Quality score', `${f.quality.score}/10${f.quality.model ? ` (scored by ${f.quality.model})` : ''}`]);
  if (f.structuredStatus) rows.push(['Structured payload', f.structuredStatus === 'failed' && f.structuredError ? `failed — ${f.structuredError}` : f.structuredStatus]);
  rows.push(['Human sign-off', f.review
    ? `${f.review.verdict}${f.review.reviewerName ? ` by ${f.review.reviewerName}` : ''}${f.review.reviewerRole ? ` (${f.review.reviewerRole})` : ''}${f.review.createdAt ? ` on ${f.review.createdAt.slice(0, 10)}` : ''}${f.review.boundToRun ? ' · bound to this run' : f.review.messageId ? ' · bound to a different run of this session' : ' · not bound to a specific run'}`
    : 'none recorded']);
  if (f.exportVersion !== null) rows.push(['Export', `v${f.exportVersion} · content hash ${f.exportContentHash}`]);

  const lines: string[] = ['', '---', '', '## Provenance', '', '| Field | Value |', '|---|---|'];
  for (const [k, v] of rows) lines.push(`| ${cell(k)} | ${cell(v)} |`);

  const hashed = f.sources.filter((s) => s.contentHashed && s.sha256);
  const unverified = f.sources.filter((s) => !s.contentHashed || !s.sha256);
  if (hashed.length) {
    lines.push('', '### Sources', '', '| # | Type | Source | Chars | Retrieved | sha256 |', '|---|---|---|---|---|---|');
    hashed.forEach((s, i) => {
      lines.push(`| ${i + 1} | ${cell(SOURCE_LABELS[s.type] ?? s.type)} | ${cell(s.name)} | ${s.charCount ? s.charCount.toLocaleString('en-GB') : '—'} | ${s.retrievedAt ? s.retrievedAt.slice(0, 10) : '—'} | ${short(s.sha256, 16)} |`);
    });
  }
  lines.push('', '### Not verified', '');
  if (unverified.length === 0) {
    lines.push('Every source listed above is pinned by hash; nothing in this deliverable rests on unverified material beyond the model\'s own training.');
  } else {
    for (const s of unverified) {
      const reason = s.note ?? (s.type === 'builtin' ? 'no source text to hash' : s.type === 'web_search_tool' ? 'results not visible to ANTON' : 'not verifiable');
      lines.push(`- ${cell(SOURCE_LABELS[s.type] ?? s.type)}: ${cell(s.name)} — ${cell(reason)}`);
    }
  }
  lines.push('', '_The prompt hash, the layer hashes and every source hash above can be checked against the run record and, when this session is placed in an evidence pack, with the pack\'s offline verifier. Anything marked "not verified" was available to the model but cannot be pinned._', '');
  return lines.join('\n');
}

/** Convenience: facts + appendix in one call; null when the session has no assistant message. */
export async function buildProvenanceAppendix(
  db: DatabaseAdapter,
  input: Parameters<typeof buildProvenanceFacts>[1],
): Promise<{ facts: ProvenanceFacts; markdown: string } | null> {
  const facts = await buildProvenanceFacts(db, input);
  if (!facts) return null;
  return { facts, markdown: renderProvenanceAppendix(facts) };
}
