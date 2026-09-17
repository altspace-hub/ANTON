// ═══════════════════════════════════════════════════════════
// Shared TypeScript interfaces for Anton by openEXPERT
// ═══════════════════════════════════════════════════════════

// ── Models & AI Configuration ──────────────────────────────

export type ModelId =
  // Anthropic Claude — latest first
  | 'claude-fable-5-1'             // 2026-09-07 — Fable 5.1, Mythos-class; adaptive only, xhigh effort
  | 'claude-fable-5'               // 2026-06-10 — top tier above Opus, adaptive only
  | 'claude-opus-5'                // 2026-07-24 — Claude 5 Opus, adaptive only
  | 'claude-sonnet-5'              // 2026-07-24 — Claude 5 Sonnet, adaptive only
  | 'claude-opus-4-8'              // 2026-05-30 — current default
  | 'claude-opus-4-7'              // 2026-04-16 — legacy
  | 'claude-opus-4-6'              // legacy — adaptive + extended thinking
  | 'claude-sonnet-4-6'
  | 'claude-sonnet-4-5-20250929'
  | 'claude-haiku-4-5-20251001'
  // OpenAI
  | 'gpt-5.6-sol'                  // 2026-07-09 — frontier tier
  | 'gpt-5.6-terra'                // 2026-07-09 — balanced
  | 'gpt-5.6-luna'                 // 2026-07-09 — high-volume
  | 'gpt-5.4'
  | 'gpt-4.1'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  // Google Gemini
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'gemini-2.0-flash'
  // Mistral (premier + reasoning)
  | 'mistral-large-latest'
  | 'mistral-medium-latest'
  | 'mistral-small-latest'
  // Magistral (Mistral reasoning)
  | 'magistral-medium-latest'
  | 'magistral-small-latest'
  // Mistral code specialists
  | 'codestral-latest'
  | 'devstral-medium-latest'
  // Ollama (local)
  | `ollama:${string}`
  // OpenAI-compatible custom endpoints (DeepSeek, OpenRouter, Together, Groq,
  // Fireworks, vLLM, LM Studio, llama.cpp). Format: compat:<endpoint_slug>:<model>
  | `compat:${string}:${string}`
  // SDK execution engine — Anthropic models run through the Claude Agent SDK
  // subprocess (this machine's Claude Code login / subscription), not the
  // Messages API. Format: sdk:<anthropic_model_id>
  | `sdk:${string}`
  // ChatGPT-subscription engine — OpenAI models run through the Codex SDK
  // subprocess (this machine's `codex login` / ChatGPT subscription), not the
  // API. Format: codex:<model> or codex:auto for the CLI default.
  | `codex:${string}`
  | (string & {}); // allows additional model IDs without breaking type narrowing

export type ModelProvider = 'anthropic' | 'anthropic_sdk' | 'openai' | 'openai_codex' | 'azure_openai' | 'google' | 'mistral' | 'ollama' | 'openai_compatible';

export type ThinkingLevel = 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate';

export type CreativityLevel = 'strict' | 'balanced' | 'creative';

export type PrecisionLevel = 'strict' | 'precise' | 'balanced' | 'creative' | 'exploratory';

export interface ModelInfo {
  id: ModelId;
  label: string;
  description: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  maxOutput: number;
  recommended?: boolean;
  provider?: ModelProvider;
  contextWindow?: number;
  costTier?: 0 | 1 | 2 | 3; // 0 = local/free, 1 = cheap, 2 = moderate, 3 = expensive
  supportsSeed?: boolean;
  legacy?: boolean; // Older version kept for compatibility
  eolDate?: string; // ISO date when this model will be retired, e.g. '2026-06-01'
  requiresLocal?: boolean; // Requires local installation (Ollama, etc.)
}

// ── Knowledge Sources ──────────────────────────────────────

export interface KnowledgeSourceConfig {
  modes: {
    claudeKnowledge: {
      enabled: boolean;
      webSearchEnabled: boolean;
      description: string;
    };
    onlineReference: {
      enabled: boolean;
      urls: string[];
      fetchDepth: 'summary' | 'full';
    };
    localFolder: {
      enabled: boolean;
      folderPaths: string[];
      fileFilter?: string[];
      recursive: boolean;
    };
    combinedMode: {
      enabled: boolean;
      priority: 'local_first' | 'claude_first' | 'merged';
      instructions?: string;
    };
  };
  ragMode?: {
    enabled: boolean;
    folderPaths: string[];
    topK: number;
    minScore: number;
  };
  // NEW: Collection-based RAG search (Phase 4)
  ragSearch?: {
    enabled: boolean;
    collections: string[]; // Selected collection IDs
    searchQuery?: string; // Optional custom query (default: user's message)
    topK?: number; // Number of chunks to retrieve (default: 10)
    rerank?: boolean; // Use re-ranking for better precision
    showRelevance?: boolean; // Show relevance scores in UI
  };
}

export interface IndexedFile {
  name: string;
  path: string;
  extension: string;
  sizeBytes: number;
  lastModified: Date;
  wordCount?: number;
  tokenEstimate?: number;
}

export interface FolderIndex {
  folderPath: string;
  files: IndexedFile[];
  totalFiles: number;
  totalWords: number;
  totalTokenEstimate: number;
  extensions: string[];
}

export interface RegisteredFolder {
  id: number;
  path: string;
  label: string;
  fileCount: number;
  lastIndexed: string;
}

export interface RagIndexedFolder {
  folder_path: string;
  document_count: number;
  chunk_count: number;
  last_indexed: string;
  status: 'ready' | 'indexing';
}

export interface RagCollection {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
  documentCount: number;
  chunkCount: number;
}

export interface RagDocument {
  id: string;
  collection_id: string;
  filename: string;
  file_size: number;
  chunk_count: number;
  uploaded_at: string;
}

/**
 * One resolved knowledge source with content provenance (Core Experience
 * Review 2026-06, item 1.6). When the resolver had the actual source text in
 * hand, `sha256`/`charCount` pin that content and `contentHashed` is true.
 * Sources whose content never passes through the resolver (Claude built-in
 * knowledge, the native web_search tool) are listed with
 * `contentHashed: false` — their content cannot be hashed pre-call.
 */
export interface ResolvedSourceDetail {
  /** Source kind: 'builtin' | 'web_search_tool' | 'url' | 'local_file' | 'uploaded_file' | 'rag_chunk' | 'bm25_chunk' | 'summary' */
  type: string;
  name: string;
  url?: string;
  path?: string;
  /** sha256 (hex) of the extracted source content — present only when contentHashed */
  sha256?: string;
  charCount?: number;
  retrievedAt?: string;
  contentHashed: boolean;
  /** Populated when the source was skipped or failed to fetch */
  note?: string;
}

export interface ResolvedKnowledge {
  systemPromptAdditions: string;
  contextDocuments: string;
  tools: Array<{ type: string; name: string }>;
  tokenEstimate: number;
  sourceManifest: string[];
  /** Per-source provenance with content hashes (item 1.6). Optional so legacy literal constructions stay valid. */
  sourceDetails?: ResolvedSourceDetail[];
  /** Sources dropped whole by the context budget (Wave 2 budget fairness). Each has a sourceDetails row whose note starts "skipped — context budget". */
  skippedCount?: number;
  /** Estimated tokens of those dropped sources — what a larger budget would have carried. */
  skippedTokens?: number;
}

// ── Output Formats ─────────────────────────────────────────

export type OutputCategory = 'strategic' | 'analytical' | 'operational' | 'scoring' | 'communication' | 'planning';

export interface OutputFormat {
  id: string;
  label: string;
  icon: string;
  description: string;
  category: OutputCategory;
  promptInstruction: string;
  exportFormats: ('md' | 'docx' | 'xlsx' | 'pdf' | 'pptx')[];
  estimatedLength: string;
  audience: string;
}

// ── Modules ────────────────────────────────────────────────

export interface ModuleDefinition {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  color: string;
  defaults: {
    thinking: ThinkingLevel;
    creativity: CreativityLevel;
    outputFormats: string[];
    knowledgeSources: Partial<KnowledgeSourceConfig['modes']>;
    transparencyLevel?: 0 | 1 | 2;
  };
}

// ── Sessions ───────────────────────────────────────────────

export interface Session {
  id: string;
  // DB returns snake_case column names directly from SQLite
  module_id: string;
  title: string;
  summary?: string;
  note?: string;
  project_id?: string | null;
  config: string | SessionConfig;
  created_at: string;
  updated_at: string;
  // Aggregated from messages table
  total_tokens?: number;
  message_count?: number;
  // Preview of last assistant message (first 120 chars)
  last_message_preview?: string;
}

export interface SessionConfig {
  model: ModelId;
  thinking: ThinkingLevel;
  creativity: CreativityLevel;
  outputFormats: string[];
  knowledgeSources: KnowledgeSourceConfig;
  systemPrompt: string;
  moduleInputs: Record<string, unknown>;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  thinkingContent?: string;
  contentBlocks?: ContentBlock[];
  tokenCount?: number;
  cost?: number;
  createdAt: string;
  configSnapshot?: Record<string, unknown> | null;
  /** Wave 2.3: set when this assistant message is a "Rerun with…" of another message */
  rerunOf?: string | null;
}

export interface ContentBlock {
  type: 'thinking' | 'text' | 'web_search' | 'web_search_result';
  content: string;
  metadata?: Record<string, unknown>;
}

// ── Rerun (Wave 2.3 recompose + Wave 5 verbatim replay) ──────────────────────

export type RerunMode = 'replay' | 'recompose';

/** One side of a rerun comparison (mirrors POST /api/rerun `original` / `rerun`). */
export interface RerunSide {
  messageId: string;
  content: string;
  thinking?: string | null;
  modelId: string | null;
  cost: number | null;
  outputTokens: number | null;
  createdAt?: string;
  rerunOf?: string | null;
}

export interface RerunSourceDriftEntry {
  name: string;
  type: string;
  changed: boolean;
  status: 'unchanged' | 'changed' | 'added' | 'removed' | 'unhashed';
}

/** POST /api/rerun response — both modes share the shape; replay never has drift. */
export interface RerunResponse {
  mode: RerunMode;
  originalMessageId: string;
  rerunMessageId: string;
  original: RerunSide;
  rerun: RerunSide;
  /** The model asked for, the model that answered, and whether that matches the original run. */
  model: { requested: string; served: string; equalsOriginal: boolean };
  /** Replay sends the stored prompt byte-for-byte (equalsOriginal is always true there). */
  prompt: { sha256: string | null; originalSha256?: string | null; equalsOriginal: boolean };
  output: { sha256: string; originalSha256: string; equalsOriginal: boolean; chars: number; originalChars: number };
  usage?: { inputTokens: number; outputTokens: number };
  /** Replay only: why identical inputs can still produce a different output. */
  note?: string;
  sourceDriftAvailable: boolean;
  sourceDrift: RerunSourceDriftEntry[];
  sourceDriftDetected: boolean;
  warning?: string;
}

export interface RevelationStep {
  id: string;
  chainId: string;
  sessionId: string | null;
  phaseIndex: number;       // 0=analyse, 1=reflect, 2=deepen, 3=synthesise, 4-5=tool passes
  phaseName: string;
  thinkingContent: string;
  outputContent: string;
  confidenceScore: number | null;
  revisionNeeded: boolean | null;
  nextAction: string | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  createdAt: string;
}

export interface RevelationChain {
  id: string;
  sessionId: string | null;
  messageId: string | null;
  thinkingLevel: ThinkingLevel;
  phaseCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  synthesisQualityScore: number | null;
  createdAt: string;
  steps: RevelationStep[];
}

// ── Streaming ──────────────────────────────────────────────

export type StreamEvent =
  | { type: 'stream_start'; messageId: string }
  | { type: 'context_assembly_start' }
  | { type: 'context_assembly_complete'; tokenEstimate: number }
  | { type: 'thinking_delta'; content: string }
  | { type: 'text_delta'; content: string }
  | { type: 'web_search_start'; query: string }
  | { type: 'web_search_result'; url: string; title: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; thinkingTokens: number; cacheCreationTokens: number; cacheReadTokens: number; modelServed?: string }
  | { type: 'error'; message: string }
  | { type: 'stream_end'; contentBlocks: ContentBlock[]; sourceManifest?: string[] }
  | { type: 'phase_start'; phaseIndex: number; phaseName: string; totalPhases: number }
  | { type: 'phase_end'; phaseIndex: number; phaseName: string; durationMs: number; confidenceScore: number | null }
  | { type: 'revelation_chain_id'; chainId: string }
  | { type: 'compaction'; message: string }
  | { type: 'context_used'; context: ContextUsed }
  | { type: 'source_fetched'; source: WebSourceRecord };

/**
 * Wave 2 (2026-09-08): what one answer was built from — sent as a frame before
 * the model call and kept on the assistant message's config snapshot, so the
 * "How ANTON Thought" panel can say which documents, project, lens and
 * knowledge layers were actually in the prompt rather than what was toggled.
 */
export interface ContextUsed {
  model: string;
  thinking: string;
  /** Wave 0: the resolved engine (anthropic_sdk, anthropic, mistral, …). */
  engine?: string;
  /** Wave 0: the effort word the ladder resolved for this level on this model. */
  effort?: string | null;
  /** Wave 0: the model id the engine reported it served (known after the run). */
  modelServed?: string | null;
  /** Wave 1: the id the assistant message will be persisted under (null when
   *  the run has no session), so the live answer and its run artifact agree. */
  assistantMessageId?: string | null;
  /** Wave 2: the knowledge packs that had a claim on this run, with the
   *  number of entries each contributed. */
  packs?: Array<{ name: string; version: string | null; entries: number }>;
  packEntries?: number;
  /** Wave 2: framework files whose articles were injected, and how many. */
  frameworks?: string[];
  frameworkArticles?: number;
  frameworkChars?: number;
  /** The module answering (open chat lens or the module page). */
  lens: { moduleId: string; areaId: string | null } | null;
  project: { id: string; name: string } | null;
  /** Documents in the prompt: this turn's uploads and the project's files. */
  documents: Array<{ name: string; chars: number; source: 'upload' | 'project' | 'url' | 'folder'; skipped?: boolean; note?: string }>;
  /** Wave 2: sources the resolver skipped for budget, and the tokens they would have cost. */
  skippedCount?: number;
  skippedTokens?: number;
  /** The resolver's source manifest (built-in knowledge, URLs, folders, RAG). */
  knowledgeSources: string[];
  ragChunks: number;
  /** Characters of grounded regulatory pack text injected (0 = none). */
  packGroundingChars: number;
  /** Characters of institutional-memory atoms injected (0 = none). */
  atomChars: number;
  /** Wave 4: the memory gate's verdict for this run and the atoms that went in. */
  atoms?: {
    applied: boolean;
    reason: string;
    ids: string[];
    count: number;
    mode: AtomInjectionMode;
    moduleAtoms: number;
    ratings: number;
    thresholds: { moduleAtoms: number; ratings: number };
  };
  /** Wave 4: characters of the other memory layers (0 = none). */
  projectContextChars?: number;
  goalsValuesChars?: number;
  resumeContextChars?: number;
  orgContext: boolean;
  goalsValues: boolean;
  resumeContext: boolean;
  webSearch: boolean;
}

export type AtomInjectionMode = 'auto' | 'on' | 'off';

/** Mirror of server/services/atom-injection-gate.ts AtomInjectionStatus (GET /api/intelligence/atom-injection). */
export interface AtomInjectionStatus {
  mode: AtomInjectionMode;
  ready: boolean;
  applies: boolean;
  moduleAtoms: number;
  ratings: number;
  thresholds: { moduleAtoms: number; ratings: number };
  reason: string;
}

/**
 * Wave 2 (2026-09-16): one page the SDK engine's WebSearch / WebFetch tool
 * touched during a web-grounded run, recorded from the tool events as they
 * happen. A search keeps its query and the hits the tool returned; a fetch
 * keeps the URL plus a sha256 and length of the text the tool handed the
 * model. Page bodies never enter the record — the hash is what lets the run
 * artifact prove later what the answer was grounded on.
 */
export interface WebSourceRecord {
  kind: 'web_search' | 'web_fetch';
  /** web_search: the query the model issued. */
  query?: string;
  /** web_fetch: the URL fetched (the tool's reported URL, else the one requested). */
  url?: string;
  /** web_fetch: the title an earlier search in the same run gave this URL, when known. */
  title?: string;
  /** web_search: the URLs the search returned, bounded (first 20). */
  resultUrls?: string[];
  /** web_search: the same hits with their titles, in the tool's order. */
  results?: Array<{ url: string; title: string }>;
  /** web_fetch: sha256 hex of the text the tool returned to the model (absent on error). */
  sha256?: string;
  /** web_fetch: length of that text in characters. */
  charCount?: number;
  /** ISO timestamp — the SDK's envelope timestamp when it carries one. */
  retrievedAt: string;
  isError?: boolean;
}

// ── Claude API Request ─────────────────────────────────────

export interface ClaudeRunConfig {
  model: ModelId;
  thinking: ThinkingLevel;
  creativity: CreativityLevel;
  precision?: PrecisionLevel;
  moduleId?: string;
  areaId?: string;
  transparencyLevel?: 0 | 1 | 2;
  systemPrompt: string;
  outputInstruction?: string;
  plainTextMode?: boolean;
  multiAgentEnabled?: boolean;
  multiAgentTeam?: 'compliance' | 'strategic' | 'quality';
  multiAgentStyle?: 'parallel' | 'debate' | 'consensus';
  userMessage: string;
  history: Message[];
  outputFormats: string[];
  knowledgeSources: KnowledgeSourceConfig;
  moduleInputs?: Record<string, unknown>;
  selectedPersonas?: string[];
  selectedSkills?: string[];
  multiPerspective?: boolean;
  metaCognitiveEnabled?: boolean;
  structureReference?: {
    mode: 'none' | 'upload' | 'describe';
    description: string;
    fileName?: string;
    fileId?: string;
  };
  referenceOutput?: string;
  writingTone?: 'formal' | 'professional' | 'casual' | 'conversational';
  emojiEnabled?: boolean;
  nativeReasoningEnabled?: boolean;
  audience?: string;
  channel?: string;
  outputLanguage?: string;
  sessionId?: string;
  uploadedFileIds?: string[];
  seed?: number;
  iterativeReasoningEnabled?: boolean;
  atomInjectionEnabled?: boolean;
  atomCollectionEnabled?: boolean;
  compactionEnabled?: boolean;
}

// ── Multi-Model Deliberation ────────────────────────────────

export type DeliberationAgreementLevel = 'unanimous' | 'majority' | 'split';
export type DeliberationConfidence = 'high' | 'medium' | 'low';

export interface DeliberationPanelist {
  model: string;
  role: string;
  description: string;
}

export interface DeliberationOpinion extends DeliberationPanelist {
  response: string;
  executionMs: number;
}

export interface DeliberationMeta {
  agreementLevel: DeliberationAgreementLevel;
  agreementScore: number;
  disagreements: Array<{ topic: string; positions: Record<string, string> }>;
  redFlags: string[];
  confidence: DeliberationConfidence;
  opinions: DeliberationOpinion[];
}

export type DeliberationEvent =
  | { type: 'deliberation_start'; panelists: DeliberationPanelist[] }
  | { type: 'model_start'; model: string; role: string }
  | { type: 'model_complete'; model: string; role: string; description: string; executionMs: number; responsePreview: string }
  | { type: 'text_delta'; content: string }
  | { type: 'deliberation_complete' } & DeliberationMeta
  | { type: 'error'; message: string };

// ── Health ──────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'error';
  apiKeyConfigured: boolean;
  database: boolean;
  version: string;
}

// ── Skills ─────────────────────────────────────────────────

/**
 * One entry of GET /api/skills — a built-in or a server/skills/ disk pack — as
 * the list endpoint returns it: without the prompt body (GET /api/skills/:id
 * carries it). Mirrors `Skill` in server/services/skills-manager.ts.
 */
export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  tags: string[];
  applicableAreas?: string[];
  source?: 'builtin' | 'disk';
}

// ── Knowledge Library ──────────────────────────────────────

export interface KnowledgeLibraryEntry {
  id: string;
  label: string;
  path: string;
  category: 'regulation' | 'case_law' | 'client' | 'other';
  recursive: boolean;
  file_filter: string[] | null;
  description: string;
  indexed_at: string | null;
  file_count: number;
  word_count: number;
  created_at: string;
}

// ── Provenance (Wave 1 — the explainability contract) ──────
// Shapes verified against server/routes/claude.ts (GET
// /sessions/:sessionId/messages/:messageId/artifacts, ~L2246),
// server/services/run-artifact-writer.ts (LayerSummaryEntry) and
// server/routes/embeddings.ts (GET /embeddings/feedback/:sessionId, ~L352).

/** One entry of run_artifacts.layer_summary — name, size and pin of a prompt layer. */
export interface RunArtifactLayer {
  layer: string;
  chars: number;
  sha256: string;
}

/**
 * One entry of run_artifacts.source_manifest. The resolver writes
 * ResolvedSourceDetail rows; the name-only fallback writes
 * `{ type: 'summary', name, contentHashed: false }` — so every field but
 * type/name is optional here.
 */
export interface RunArtifactSource {
  type: string;
  name: string;
  path?: string;
  url?: string;
  sha256?: string;
  charCount?: number;
  retrievedAt?: string;
  contentHashed?: boolean;
  note?: string;
}

/** The persisted run record for one assistant message (run_artifacts row). */
export interface RunArtifact {
  id: string;
  message_id: string;
  session_id: string | null;
  /** The system prompt as sent — capped at 2 MB in storage (see `truncated`). */
  composed_prompt: string;
  /** sha256 of the FULL prompt, even when the stored text is truncated. */
  prompt_sha256: string;
  prompt_chars: number;
  truncated: boolean;
  layer_summary: RunArtifactLayer[];
  source_manifest: RunArtifactSource[];
  created_at: string;
}

/** One injected institutional-memory atom with its retrieval score (retrieval_feedback ⋈ knowledge_atoms). */
export interface InjectedAtomRow {
  atom_id: string;
  retrieval_method: string;
  retrieval_score: number;
  injected_at: string;
  was_relevant: number | null;
  /** Wave 4: the answer this atom went into (null for rows written before migration 275). */
  message_id?: string | null;
  content: string;
  atom_type: string;
  category: string;
  confidence: number;
}

/** The message row as GET /api/sessions/:id returns it (only the fields provenance reads). */
export interface PersistedAssistantMessageRow {
  id: string;
  role: 'user' | 'assistant';
  token_count: number | null;
  config_snapshot: Record<string, unknown> | null;
  created_at: string;
}

/** One layer of a previewed prompt (POST /api/claude/preview-prompt → layers[]). */
export interface PromptPreviewLayer {
  key: string;
  chars: number;
  cacheable: boolean;
}

/** What POST /api/claude/preview-prompt returns (layers / staticChars / dynamicChars are the 2026-09-16 additions). */
export interface PromptPreviewResult {
  prompt: string;
  estimatedTokens: number;
  knowledgeTokenEstimate: number;
  sourceManifest: string[];
  model: string;
  layers?: PromptPreviewLayer[];
  staticChars?: number;
  dynamicChars?: number;
}
