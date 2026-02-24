// ═══════════════════════════════════════════════════════════
// Shared TypeScript interfaces for Anton by openEXPERT
// ═══════════════════════════════════════════════════════════

// ── Models & AI Configuration ──────────────────────────────

export type ModelId =
  | 'claude-opus-4-6'
  | 'claude-sonnet-4-6'
  | 'claude-sonnet-4-5-20250929'
  | 'claude-haiku-4-5-20251001'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gemini-2.0-flash'
  | 'mistral-large-latest'
  | `ollama:${string}`    // local Ollama models, e.g. 'ollama:llama3.2', 'ollama:mistral'
  | (string & {}); // allows additional model IDs without breaking type narrowing

export type ModelProvider = 'anthropic' | 'openai' | 'google' | 'mistral' | 'ollama';

export type ThinkingLevel = 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first';

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

export interface ResolvedKnowledge {
  systemPromptAdditions: string;
  contextDocuments: string;
  tools: Array<{ type: string; name: string }>;
  tokenEstimate: number;
  sourceManifest: string[];
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
}

export interface ContentBlock {
  type: 'thinking' | 'text' | 'web_search' | 'web_search_result';
  content: string;
  metadata?: Record<string, unknown>;
}

// ── Streaming ──────────────────────────────────────────────

export type StreamEvent =
  | { type: 'stream_start'; messageId: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'text_delta'; content: string }
  | { type: 'web_search_start'; query: string }
  | { type: 'web_search_result'; url: string; title: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; thinkingTokens: number; cacheCreationTokens: number; cacheReadTokens: number }
  | { type: 'error'; message: string }
  | { type: 'stream_end'; contentBlocks: ContentBlock[] };

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
}

// ── Health ──────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'error';
  apiKeyConfigured: boolean;
  database: boolean;
  version: string;
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
