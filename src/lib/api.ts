import type { HealthStatus, StreamEvent, ClaudeRunConfig, RagIndexedFolder, RagCollection, DeliberationEvent } from './types';
import { safeStorage } from './safe-storage';

const API_BASE = '/api';

export function getAuthHeader(): Record<string, string> {
  const token = safeStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handle401(response: Response): void {
  if (response.status === 401) {
    // Clear token and redirect to login
    safeStorage.removeItem('openexpert-token');
    window.location.href = '/login';
  }
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = { ...getAuthHeader(), ...options.headers };
  const res = await fetch(url, { ...options, headers });
  handle401(res);
  return res;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetchWithAuth(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchModels() {
  const res = await fetchWithAuth(`${API_BASE}/claude/models`);
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

// STREAM-06: SSE retry with exponential backoff (1s, 2s, 4s) on network drops
const STREAM_RETRY_DELAYS = [1000, 2000, 4000];

export async function* streamMessage(
  config: ClaudeRunConfig,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= STREAM_RETRY_DELAYS.length; attempt++) {
    // Don't retry if the caller aborted
    if (signal?.aborted) return;

    // Delay before retrying (skip on first attempt)
    if (attempt > 0) {
      const delay = STREAM_RETRY_DELAYS[attempt - 1];
      yield { type: 'error', message: `Connection dropped — retrying in ${delay / 1000}s (attempt ${attempt + 1})…` };
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      if (signal?.aborted) return;
    }

    let res: Response;
    try {
      res = await fetchWithAuth(`${API_BASE}/claude/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        signal,
      });
    } catch (fetchErr) {
      lastError = fetchErr;
      // Network error (offline, ECONNRESET) — retry
      if (attempt < STREAM_RETRY_DELAYS.length) continue;
      yield { type: 'error', message: 'Network error — unable to connect to server.' };
      return;
    }

    if (!res.ok) {
      const error = await res.text();
      // 429 / 503 → retry; other errors → fail immediately
      if ((res.status === 429 || res.status === 503) && attempt < STREAM_RETRY_DELAYS.length) {
        lastError = error;
        continue;
      }
      yield { type: 'error', message: error };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: 'error', message: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let streamSuccess = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { streamSuccess = true; break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') { streamSuccess = true; return; }
            try {
              yield JSON.parse(data) as StreamEvent;
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (streamErr) {
      lastError = streamErr;
      // Stream read error — will retry in next loop iteration
    } finally {
      reader.releaseLock();
    }

    if (streamSuccess) return;
    // If we reach here, the stream was cut mid-way — retry
    if (attempt >= STREAM_RETRY_DELAYS.length) break;
  }

  yield { type: 'error', message: `Stream failed after ${STREAM_RETRY_DELAYS.length + 1} attempts. Please try again.` };
  void lastError; // referenced to satisfy TS 'unused variable' check
}

// ── Prompt Preview API ────────────────────────────────────

export async function fetchPromptPreview(config: Record<string, unknown>): Promise<{
  prompt: string;
  estimatedTokens: number;
  knowledgeTokenEstimate: number;
  sourceManifest: string[];
  model: string;
}> {
  const res = await fetchWithAuth(`${API_BASE}/claude/preview-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to fetch prompt preview');
  return res.json();
}

// ── Session API ────────────────────────────────────────────

export async function fetchSessions(moduleId?: string, options?: {
  search?: string;
  hasOutput?: boolean;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (moduleId) params.set('moduleId', moduleId);
  if (options?.search) params.set('search', options.search);
  if (options?.hasOutput) params.set('hasOutput', 'true');
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const qs = params.toString();
  const res = await fetchWithAuth(`${API_BASE}/sessions${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function createSession(data: { moduleId: string; title: string; config: unknown }) {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export async function updateSessionNote(sessionId: string, note: string): Promise<void> {
  await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
}

export async function fetchSession(sessionId: string) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return null;
  return res.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${API_BASE}/sessions/${sessionId}`, { method: 'DELETE', headers: { ...getAuthHeader() } });
}

// ── File API ───────────────────────────────────────────────

export async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/files/upload`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload file');
  return res.json();
}

// ── Folder API ─────────────────────────────────────────────

export async function fetchRegisteredFolders() {
  const res = await fetch(`${API_BASE}/folders/registered`, { headers: { ...getAuthHeader() } });
  if (!res.ok) throw new Error('Failed to fetch folders');
  return res.json();
}

export async function registerFolder(folderPath: string, label: string) {
  const res = await fetch(`${API_BASE}/folders/register`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath, label }),
  });
  if (!res.ok) throw new Error('Failed to register folder');
  return res.json();
}

export async function browseFolder(folderPath: string) {
  const res = await fetch(`${API_BASE}/folders/browse`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath }),
  });
  if (!res.ok) throw new Error('Failed to browse folder');
  return res.json();
}

// ── Areas & Module API ──────────────────────────────────────

export async function fetchAreas() {
  const res = await fetch(`${API_BASE}/areas`, { headers: { ...getAuthHeader() } });
  if (!res.ok) throw new Error('Failed to fetch areas');
  return res.json();
}

export async function fetchModuleConfig(moduleId: string) {
  const res = await fetch(`${API_BASE}/modules/${moduleId}`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchModulePrompt(moduleId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/modules/${moduleId}/prompt`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return '';
  const data = await res.json() as { prompt?: string };
  return data.prompt || '';
}

// ── Export API ──────────────────────────────────────────────

export async function exportDocument(format: string, content: string, metadata?: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/export`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, content, metadata }),
  });
  if (!res.ok) throw new Error('Failed to export');
  const blob = await res.blob();
  return blob;
}

export async function fetchSessionStats(): Promise<{
  totalSessions: number;
  totalMessages: number;
  totalOutputTokens: number;
  topModules: Array<{ moduleId: string; count: number }>;
  thisWeekSessions: number;
  thisMonthSessions: number;
  recentSessions: Array<{ id: string; title: string; module_id: string; created_at: string; tokens: number }>;
}> {
  const res = await fetch(`${API_BASE}/sessions/stats`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return {
    totalSessions: 0,
    totalMessages: 0,
    totalOutputTokens: 0,
    topModules: [],
    thisWeekSessions: 0,
    thisMonthSessions: 0,
    recentSessions: [],
  };
  return res.json();
}

// ── Review API ──────────────────────────────────────────────

export async function fetchReviewModes() {
  const res = await fetch(`${API_BASE}/reviews/modes`, { headers: { ...getAuthHeader() } });
  if (!res.ok) throw new Error('Failed to fetch review modes');
  return res.json();
}

export async function* streamReview(
  modeId: string,
  content: string,
  model: string,
  sessionId?: string,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  yield* streamMessage(
    { model: model as import('./types').ModelId, thinking: 'think_hard', creativity: 'strict', systemPrompt: '', userMessage: content, history: [], outputFormats: [], knowledgeSources: { modes: { claudeKnowledge: { enabled: false, webSearchEnabled: false, description: '' }, onlineReference: { enabled: false, urls: [], fetchDepth: 'full' }, localFolder: { enabled: false, folderPaths: [], recursive: false }, combinedMode: { enabled: false, priority: 'merged' } } } } as never,
    signal
  );
  void modeId; void sessionId; // handled server-side via /api/reviews endpoint
}

export async function* streamReviewDirect(
  modeId: string,
  content: string,
  model: string,
  sessionId?: string,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${API_BASE}/reviews`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ modeId, content, model, sessionId }),
    signal,
  });
  if (!res.ok) { yield { type: 'error', message: await res.text() }; return; }
  const reader = res.body?.getReader();
  if (!reader) { yield { type: 'error', message: 'No response body' }; return; }
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try { yield JSON.parse(data) as StreamEvent; } catch { /* skip */ }
        }
      }
    }
  } finally { reader.releaseLock(); }
}

// ── Project API ─────────────────────────────────────────────

export async function fetchProjects() {
  const res = await fetch(`${API_BASE}/projects`, { headers: { ...getAuthHeader() } });
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function createProject(data: { name: string; description?: string }) {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create project');
  return res.json();
}

export async function fetchProject(projectId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return null;
  return res.json();
}

export async function updateProject(projectId: string, data: { name?: string; description?: string; status?: string }) {
  await fetch(`${API_BASE}/projects/${projectId}`, {
    method: 'PATCH', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}

export async function deleteProject(projectId: string) {
  await fetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE', headers: { ...getAuthHeader() } });
}

export async function assignSessionToProject(sessionId: string, projectId: string | null) {
  await fetch(`${API_BASE}/sessions/${sessionId}/project`, {
    method: 'PATCH', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }),
  });
}

// ── Skills API ──────────────────────────────────────────────

export async function fetchSkills() {
  const res = await fetch(`${API_BASE}/skills`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchCommunitySkills() {
  const res = await fetch(`${API_BASE}/skills/community`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return [];
  return res.json();
}

export async function submitCommunitySkill(data: {
  name: string;
  description: string;
  category: string;
  promptInstruction: string;
  tags?: string;
}) {
  const res = await fetch(`${API_BASE}/skills/community`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to submit community skill');
  return res.json();
}

// ── Custom Modules API ───────────────────────────────────────

export interface CustomModuleData {
  id: string;
  name: string;
  short_name: string;
  description: string;
  icon: string;
  area: string;
  system_prompt: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function fetchCustomModules(): Promise<CustomModuleData[]> {
  const res = await fetch(`${API_BASE}/custom-modules`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchCustomModule(id: string): Promise<CustomModuleData | null> {
  const res = await fetch(`${API_BASE}/custom-modules/${id}`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return null;
  return res.json();
}

export async function createCustomModule(data: Partial<CustomModuleData>): Promise<CustomModuleData> {
  const res = await fetch(`${API_BASE}/custom-modules`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create custom module');
  return res.json();
}

export async function patchCustomModule(id: string, data: Partial<CustomModuleData>): Promise<CustomModuleData> {
  const res = await fetch(`${API_BASE}/custom-modules/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update custom module');
  return res.json();
}

export async function deleteCustomModule(id: string): Promise<void> {
  await fetch(`${API_BASE}/custom-modules/${id}`, { method: 'DELETE', headers: { ...getAuthHeader() } });
}

export async function shareModuleWithCommunity(moduleId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/modules/community`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId }),
  });
  if (!res.ok) throw new Error('Failed to share module');
}

export async function fetchCommunityModules(): Promise<CustomModuleData[]> {
  const res = await fetch(`${API_BASE}/modules/community`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return [];
  return res.json();
}

// ── Profile API ─────────────────────────────────────────────

export async function fetchProfile(): Promise<Record<string, string | null>> {
  const res = await fetch(`${API_BASE}/profile`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return {};
  return res.json();
}

export async function saveProfile(profile: Record<string, string>): Promise<void> {
  await fetch(`${API_BASE}/profile`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
}

// ── RAG API ──────────────────────────────────────────────────

export async function fetchRagFolders(): Promise<RagIndexedFolder[]> {
  const res = await fetch(`${API_BASE}/rag/folders`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return [];
  return res.json();
}

export async function indexRagFolder(folderPath: string): Promise<{ success: boolean; documents: number; chunks: number }> {
  const res = await fetch(`${API_BASE}/rag/index`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath }),
  });
  if (!res.ok) throw new Error('Failed to index folder');
  return res.json();
}

export async function deleteRagIndex(folderPath: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/rag/index`, {
    method: 'DELETE',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath }),
  });
  if (!res.ok) throw new Error('Failed to delete index');
  return res.json();
}

// ── RAG Collections API ──────────────────────────────────────

export async function fetchRagCollections(): Promise<RagCollection[]> {
  const res = await fetch(`${API_BASE}/collections`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.collections || [];
}

export async function createRagCollection(collection: {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  color: string;
}): Promise<{ collectionId: string }> {
  const res = await fetch(`${API_BASE}/collections`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(collection),
  });
  if (!res.ok) throw new Error('Failed to create collection');
  return res.json();
}

export async function deleteRagCollection(collectionId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/collections/${collectionId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error('Failed to delete collection');
  return res.json();
}

export async function searchRagChunks(
  query: string,
  folderPaths: string[],
  topK?: number,
  minScore?: number
): Promise<Array<{ text: string; score: number; source: string; chunk_index: number }>> {
  const res = await fetch(`${API_BASE}/rag/search`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, folderPaths, topK, minScore }),
  });
  if (!res.ok) return [];
  return res.json();
}

// ── Quality Feedback API ─────────────────────────────────────

export async function submitOutputFeedback(params: {
  sessionId?: string;
  qualityScoreId?: string;
  moduleId: string;
  areaId?: string;
  rating: number;
  comment?: string;
}): Promise<{ id: string; newBaseline?: number }> {
  const res = await fetchWithAuth(`${API_BASE}/quality/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to submit feedback');
  return res.json();
}

export async function getModuleFeedbackStats(moduleId: string): Promise<{
  count: number;
  avgRating: number;
  distribution: Record<string, number>;
  recentComments: { rating: number; comment: string; created_at: string }[];
}> {
  const res = await fetchWithAuth(`${API_BASE}/quality/feedback/stats/${encodeURIComponent(moduleId)}`);
  if (!res.ok) throw new Error('Failed to fetch feedback stats');
  return res.json();
}

export interface SessionQualityScore {
  id: string;
  moduleId: string;
  overall: number;
  completeness: number;
  accuracy: number;
  structure: number;
  actionability: number;
  citations: number;
  isRegression: boolean;
  scoredAt: string;
  reasoning?: { strengths?: string[]; weaknesses?: string[]; improvementSuggestion?: string } | null;
}

export async function getSessionQualityScore(sessionId: string): Promise<SessionQualityScore | null> {
  const res = await fetchWithAuth(`${API_BASE}/quality/by-session/${encodeURIComponent(sessionId)}`);
  if (!res.ok) return null;
  return res.json();
}

// ── EUR-Lex API ──────────────────────────────────────────────

export async function fetchEurLexList(): Promise<Array<{
  shorthand: string; title: string; celexNumber: string; url: string;
}>> {
  const res = await fetch(`${API_BASE}/eurlex/list`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return [];
  return res.json();
}

export async function lookupEurLex(q: string): Promise<Array<{
  shorthand: string; title: string; celexNumber: string; url: string;
}>> {
  const res = await fetch(`${API_BASE}/eurlex/lookup?q=${encodeURIComponent(q)}`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchEurLexText(celexNumber: string): Promise<{ text: string; url: string; chars: number }> {
  const res = await fetch(`${API_BASE}/eurlex/fetch`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ celexNumber }),
  });
  if (!res.ok) throw new Error('EUR-Lex fetch failed');
  return res.json();
}

// ── Skill Packs API (Wave 2.2) ────────────────────────────────

export interface SkillPack {
  id: string;
  name: string;
  description: string;
  target_role: string;
  target_industry: string;
  modules: string[];
  workflow_template: unknown | null;
  persona_configs: unknown | null;
  skills_attached: unknown | null;
  quality_baselines: unknown | null;
  getting_started: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
}

export async function getSkillPacks(): Promise<SkillPack[]> {
  const res = await fetchWithAuth(`${API_BASE}/skill-packs`);
  if (!res.ok) return [];
  return res.json();
}

export async function getSkillPack(id: string): Promise<SkillPack | null> {
  const res = await fetchWithAuth(`${API_BASE}/skill-packs/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}

export async function createSkillPack(pack: Partial<SkillPack>): Promise<SkillPack> {
  const res = await fetchWithAuth(`${API_BASE}/skill-packs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pack),
  });
  if (!res.ok) throw new Error('Failed to create skill pack');
  return res.json();
}

/** Download a compliance ruleset as a .anton file */
export async function exportComplianceRulesetAnton(options: { name?: string; description?: string; categories?: string[] } = {}): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/exchange/export-bundle/compliance-ruleset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error('Failed to export compliance ruleset');
  return res.blob();
}

/** Download quality baselines as a .anton file */
export async function exportQualityBaselineAnton(options: { name?: string; description?: string; moduleIds?: string[] } = {}): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/exchange/export-bundle/quality-baseline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error('Failed to export quality baselines');
  return res.blob();
}

/** Download a review panel as a .anton file */
export async function exportReviewPanelAnton(params: {
  name: string;
  description?: string;
  reviewers: Array<{ id: string; name: string; icon?: string; prompt: string; focusAreas?: string[] }>;
}): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/exchange/export-bundle/review-panel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to export review panel');
  return res.blob();
}

// ── Multi-Model Deliberation ─────────────────────────────────

export interface DeliberationConfig {
  moduleId?: string;
  areaId?: string;
  systemPrompt?: string;
  outputInstruction?: string;
  creativity?: string;
  thinking?: string;
  transparencyLevel?: number;
  writingTone?: string;
  userMessage: string;
  knowledgeSources?: unknown;
  uploadedFileIds?: string[];
  sessionId?: string;
}

export async function* streamDeliberation(
  config: DeliberationConfig,
  signal?: AbortSignal
): AsyncGenerator<DeliberationEvent> {
  const res = await fetchWithAuth(`${API_BASE}/claude/deliberate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    signal,
  });

  if (!res.ok) {
    const error = await res.text();
    yield { type: 'error', message: error };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: 'error', message: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            yield JSON.parse(data) as DeliberationEvent;
          } catch { /* skip malformed */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Download a Trust Certificate PDF for the given session */
export async function exportTrustCertificate(sessionId: string): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/export/trust-certificate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error('Failed to generate trust certificate');
  return res.blob();
}
