import type { HealthStatus, StreamEvent, ClaudeRunConfig, RagIndexedFolder, RagCollection, DeliberationEvent, RunArtifact, InjectedAtomRow, PersistedAssistantMessageRow, SkillSummary, AtomInjectionStatus, AtomInjectionMode } from './types';
import { safeStorage } from './safe-storage';

export const API_BASE = '/api';

export function getAuthHeader(): Record<string, string> {
  const token = safeStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// SEC-14: CSRF token — fetched once on startup, refreshed on 403
let _csrfToken: string | null = null;

export async function ensureCsrfToken(force = false): Promise<string> {
  if (_csrfToken && !force) return _csrfToken;
  try {
    const res = await fetch(`${API_BASE}/csrf-token`, {
      headers: getAuthHeader(),
    });
    if (res.ok) {
      const { csrfToken } = await res.json();
      _csrfToken = csrfToken as string;
    }
  } catch {
    // Fail silently — server may not require CSRF in solo mode
  }
  return _csrfToken ?? '';
}

function getCsrfHeader(): Record<string, string> {
  return _csrfToken ? { 'X-CSRF-Token': _csrfToken } : {};
}

function handle401(response: Response): void {
  if (response.status === 401) {
    // Clear token and redirect to login
    safeStorage.removeItem('openexpert-token');
    window.location.href = '/login';
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  const isMutating = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  // Attach CSRF token on mutating requests
  if (isMutating && !_csrfToken) await ensureCsrfToken();
  const csrfHeaders = isMutating ? getCsrfHeader() : {};

  const headers = { ...getAuthHeader(), ...csrfHeaders, ...options.headers };
  const res = await fetch(url, { ...options, headers });

  // If CSRF token was rejected, refresh it and retry once
  if (res.status === 403 && isMutating) {
    _csrfToken = null;
    await ensureCsrfToken(true);
    const retryHeaders = { ...getAuthHeader(), ...getCsrfHeader(), ...options.headers };
    const retry = await fetch(url, { ...options, headers: retryHeaders });
    handle401(retry);
    return retry;
  }

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

    // COMPAT-04: prefer ReadableStream; fall back to XHR incremental polling
    // when ReadableStream or getReader() is unavailable (old Safari, some mobile browsers).
    const canStream = typeof ReadableStream !== 'undefined' && res.body?.getReader != null;

    if (canStream) {
      // ── Primary path: ReadableStream ──────────────────────────
      const reader = res.body!.getReader();
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
      } finally {
        reader.releaseLock();
      }

      if (streamSuccess) return;
      if (attempt >= STREAM_RETRY_DELAYS.length) break;
    } else {
      // ── Fallback path: XHR incremental read (COMPAT-04) ──────
      yield* xhrStreamFallback(res.url || `${API_BASE}/claude/message`, config, signal);
      return;
    }
  }

  yield { type: 'error', message: `Stream failed after ${STREAM_RETRY_DELAYS.length + 1} attempts. Please try again.` };
  void lastError;
}

/**
 * COMPAT-04: XHR-based SSE fallback for browsers without ReadableStream.
 * Uses XMLHttpRequest onprogress to read the incrementally growing responseText.
 */
async function* xhrStreamFallback(
  _url: string,
  config: ClaudeRunConfig,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const events: StreamEvent[] = [];
  let resolve: (() => void) | null = null;
  let done = false;
  let error: string | null = null;

  const enqueue = (event: StreamEvent) => {
    events.push(event);
    resolve?.();
    resolve = null;
  };

  const wait = () => new Promise<void>(r => { resolve = r; });

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${API_BASE}/claude/message`, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  const authHeader = getAuthHeader();
  if (authHeader.Authorization) xhr.setRequestHeader('Authorization', authHeader.Authorization);
  if (_csrfToken) xhr.setRequestHeader('X-CSRF-Token', _csrfToken);

  let cursor = 0;
  xhr.onprogress = () => {
    const chunk = xhr.responseText.slice(cursor);
    cursor = xhr.responseText.length;
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') { done = true; resolve?.(); return; }
        try { enqueue(JSON.parse(data) as StreamEvent); } catch { /* skip */ }
      }
    }
  };

  xhr.onload = () => { done = true; resolve?.(); };
  xhr.onerror = () => { error = 'XHR stream error'; done = true; resolve?.(); };

  if (signal) {
    signal.addEventListener('abort', () => { xhr.abort(); done = true; resolve?.(); }, { once: true });
  }

  xhr.send(JSON.stringify(config));

  while (!done || events.length > 0) {
    if (events.length === 0 && !done) await wait();
    while (events.length > 0) yield events.shift()!;
  }

  if (error) yield { type: 'error', message: error };
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

export async function createSession(data: { moduleId: string; title: string; config: unknown; projectId?: string | null }) {
  const res = await fetchWithAuth(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

/** Ask the server for a 5-8 word title from the first exchange — one small
 *  background utility call, never a full module-run turn. Best-effort: null
 *  when the engine is busy or the request fails; the 80-char title stays. */
export async function generateSessionTitle(
  sessionId: string,
  userMessage: string,
  responsePreview: string,
): Promise<string | null> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/sessions/${sessionId}/title/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: userMessage.slice(0, 400), responsePreview: responsePreview.slice(0, 600) }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string | null };
    return data.title ?? null;
  } catch {
    return null;
  }
}

export interface ModuleLensSuggestion {
  moduleId: string;
  label: string;
  reason: string;
  areaId: string;
}

/** Ask the recommender which catalogue module should answer this — the
 *  expert "lens" for an open-chat turn. The caller bounds it with a signal. */
export async function suggestModuleLens(query: string, signal?: AbortSignal): Promise<ModuleLensSuggestion[]> {
  const res = await fetchWithAuth(`${API_BASE}/modules/smart-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query.slice(0, 2000) }),
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{ moduleId?: string; label?: string; moduleName?: string; reason?: string; areaId?: string }>;
  return (Array.isArray(data) ? data : [])
    .filter((m) => typeof m.moduleId === 'string' && m.moduleId.length > 0)
    .map((m) => ({
      moduleId: String(m.moduleId),
      label: String(m.label ?? m.moduleName ?? m.moduleId),
      reason: String(m.reason ?? ''),
      areaId: String(m.areaId ?? ''),
    }));
}

export async function updateSessionNote(sessionId: string, note: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
}

export async function fetchSession(sessionId: string) {
  const res = await fetchWithAuth(`${API_BASE}/sessions/${sessionId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/sessions/${sessionId}`, { method: 'DELETE' });
}

// ── File API ───────────────────────────────────────────────

export async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetchWithAuth(`${API_BASE}/files/upload`, {
    method: 'POST',
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
  const res = await fetchWithAuth(`${API_BASE}/folders/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath, label }),
  });
  if (!res.ok) throw new Error('Failed to register folder');
  return res.json();
}

export async function browseFolder(folderPath: string) {
  const res = await fetchWithAuth(`${API_BASE}/folders/browse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetchWithAuth(`${API_BASE}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, content, metadata }),
  });
  if (!res.ok) throw new Error(await res.text());
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
  const res = await fetchWithAuth(`${API_BASE}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetchWithAuth(`${API_BASE}/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
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
  await fetchWithAuth(`${API_BASE}/projects/${projectId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}

export async function deleteProject(projectId: string) {
  await fetchWithAuth(`${API_BASE}/projects/${projectId}`, { method: 'DELETE' });
}

export async function assignSessionToProject(sessionId: string, projectId: string | null) {
  await fetchWithAuth(`${API_BASE}/sessions/${sessionId}/project`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }),
  });
}

// ── Skills API ──────────────────────────────────────────────

export async function fetchSkills() {
  const res = await fetch(`${API_BASE}/skills`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return [];
  return res.json();
}

/** One skill with its prompt body — the list endpoint above omits prompts. */
export async function fetchSkill(id: string): Promise<(SkillSummary & { prompt: string }) | null> {
  const res = await fetch(`${API_BASE}/skills/${encodeURIComponent(id)}`, { headers: { ...getAuthHeader() } });
  if (!res.ok) return null;
  return res.json() as Promise<SkillSummary & { prompt: string }>;
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
  const res = await fetchWithAuth(`${API_BASE}/skills/community`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetchWithAuth(`${API_BASE}/custom-modules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create custom module');
  return res.json();
}

export async function patchCustomModule(id: string, data: Partial<CustomModuleData>): Promise<CustomModuleData> {
  const res = await fetchWithAuth(`${API_BASE}/custom-modules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update custom module');
  return res.json();
}

export async function deleteCustomModule(id: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/custom-modules/${id}`, { method: 'DELETE' });
}

export async function shareModuleWithCommunity(moduleId: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/modules/community`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  await fetchWithAuth(`${API_BASE}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetchWithAuth(`${API_BASE}/rag/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath }),
  });
  if (!res.ok) throw new Error('Failed to index folder');
  return res.json();
}

export async function deleteRagIndex(folderPath: string): Promise<{ success: boolean }> {
  const res = await fetchWithAuth(`${API_BASE}/rag/index`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetchWithAuth(`${API_BASE}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(collection),
  });
  if (!res.ok) throw new Error('Failed to create collection');
  return res.json();
}

export async function deleteRagCollection(collectionId: string): Promise<{ success: boolean }> {
  const res = await fetchWithAuth(`${API_BASE}/collections/${collectionId}`, {
    method: 'DELETE',
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
  const res = await fetchWithAuth(`${API_BASE}/rag/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetchWithAuth(`${API_BASE}/eurlex/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
// ── Rerun (Wave 2.3 recompose + Wave 5 verbatim replay) ──────────────────────

export interface RerunRequest {
  sessionId: string;
  /** Defaults to the latest non-rerun assistant message in the session. */
  messageId?: string;
  /** 'recompose' (default): another model through the live pipeline. 'replay': the stored prompt, verbatim. */
  mode?: import('./types').RerunMode;
  /** Required for recompose; optional for replay (defaults to the model that served the original). */
  newModelId?: string;
  areaId?: string;
}

/** POST /api/rerun — throws with the server's message on a non-2xx. */
export async function rerunMessage(body: RerunRequest): Promise<import('./types').RerunResponse> {
  const res = await fetchWithAuth(`${API_BASE}/rerun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as import('./types').RerunResponse & { error?: string };
  if (!res.ok) throw new Error(String(data.error ?? 'Rerun failed'));
  return data;
}

export async function exportTrustCertificate(sessionId: string): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/export/trust-certificate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error('Failed to generate trust certificate');
  return res.blob();
}

// ── Markets Pillar Export API ─────────────────────────────────

/** Download a market index as a .anton bundle */
export async function exportMarketIndexAnton(indexId: string, author?: string): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/exchange/export-bundle/market-index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ indexId, author }),
  });
  if (!res.ok) throw new Error('Failed to export market index');
  return res.blob();
}

/** Download a market thesis as a .anton bundle */
export async function exportMarketThesisAnton(thesisId: string, author?: string): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/exchange/export-bundle/market-thesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thesisId, author }),
  });
  if (!res.ok) throw new Error('Failed to export market thesis');
  return res.blob();
}

/** Download the market intelligence model as a .anton bundle */
export async function exportMarketIntelligenceModelAnton(author?: string): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/exchange/export-bundle/market-intelligence-model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author }),
  });
  if (!res.ok) throw new Error('Failed to export market intelligence model');
  return res.blob();
}

/** Download a market investigation as a .anton bundle */
export async function exportMarketInvestigationAnton(investigationId: string, author?: string): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/exchange/export-bundle/market-investigation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ investigationId, author }),
  });
  if (!res.ok) throw new Error('Failed to export market investigation');
  return res.blob();
}

/** Download market data source configuration as a .anton bundle */
export async function exportMarketDataSourceConfigAnton(author?: string): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/exchange/export-bundle/market-data-source-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author }),
  });
  if (!res.ok) throw new Error('Failed to export market data source config');
  return res.blob();
}

/** Download market atom collection as a .anton bundle */
export async function exportMarketAtomCollectionAnton(author?: string): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/exchange/export-bundle/market-atom-collection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author }),
  });
  if (!res.ok) throw new Error('Failed to export market atom collection');
  return res.blob();
}

/** Download market strategy pack as a .anton bundle */
export async function exportMarketStrategyPackAnton(author?: string): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/exchange/export-bundle/market-strategy-pack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author }),
  });
  if (!res.ok) throw new Error('Failed to export market strategy pack');
  return res.blob();
}

// ── Markets Pillar Import API ─────────────────────────────────

async function importMarketBundle(endpoint: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetchWithAuth(`${API_BASE}/exchange/import-bundle/${endpoint}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Import failed' }));
    throw new Error(err.error || 'Import failed');
  }
  return res.json();
}

// ── Module fingerprint (Wave 6, track G) ───────────────────────

/** The visible identity of a custom / imported module — GET /api/exchange/modules/:id/fingerprint. */
export interface ModuleFingerprint {
  moduleId: string;
  /** `sha256:<hex>` — the bundle's checksum for an import, else what an export now would carry. */
  checksum: string;
  promptSha256: string;
  configSha256: string;
  guidedInputsSha256: string;
  /** Signer display name (else first 16 hex of the pubkey); null when unsigned or built here. */
  signedBy: string | null;
  signerPubkey: string | null;
  signedAt: string | null;
  source: 'import' | 'local';
  importedAt: string | null;
  acceptedInjectionFindings: number;
}

/**
 * The fingerprint of a custom / imported module. Null when the id is not a
 * custom module (built-ins and dynamic area modules answer 404) or the
 * request fails — callers render nothing in that case.
 */
export async function fetchModuleFingerprint(moduleId: string): Promise<ModuleFingerprint | null> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/exchange/modules/${encodeURIComponent(moduleId)}/fingerprint`);
    if (!res.ok) return null;
    return (await res.json()) as ModuleFingerprint;
  } catch {
    return null;
  }
}

// ── Module bundle validate / import (Wave 6, track G) ─────────

/** One prompt-injection finding from the bundle scan. */
export interface BundleInjectionFinding {
  file: string;
  patternId: string;
  label: string;
  severity: 'high' | 'medium';
  excerpt: string;
  line: number;
}

/** The bundle-side identity, known before anything is installed. */
export interface BundleFingerprint {
  checksum: string | null;
  promptSha256: string;
  guidedInputsSha256: string;
  configSha256: string;
  signed: boolean;
  signatureValid: boolean;
  signerPubkey: string | null;
  signerName: string | null;
  signedAt: string | null;
  signedBy: string | null;
  known: boolean;
}

export interface BundleValidationIssue {
  step: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  details?: string;
}

/** POST /api/exchange/validate — the dispatching validator plus, for modules, the Wave 6 inspection. */
export interface BundleValidationResponse {
  valid: boolean;
  bundle_type?: string;
  validated_depth?: 'full' | 'structural';
  governance?: { effective_date?: string; source_url?: string; validated_by?: string; content_confirmed?: boolean };
  notes?: string[];
  errors: BundleValidationIssue[];
  warnings: BundleValidationIssue[];
  manifest?: {
    meta?: { id: string; name: string; version: string; author: string; description: string; tags: string[]; category: string };
  };
  fingerprint?: BundleFingerprint;
  injectionFindings?: BundleInjectionFinding[];
  embedded?: {
    skills: Array<{ id: string; name: string; version?: string }>;
    personas: Array<{ id: string; name: string }>;
  };
  unresolved?: { skills: string[]; personas: string[] };
}

export interface InstalledBundleDependency {
  bundleId: string;
  installedId: string;
  action: 'reused' | 'installed' | 'namespaced' | 'missing';
  note?: string;
}

/** POST /api/exchange/import — 200 (success or validation failure), 409 (injection findings), 403 (viewer). */
export interface ModuleImportResponse {
  success: boolean;
  moduleId?: string;
  keptOriginalId?: boolean;
  blocked?: 'injection';
  error?: string;
  errors?: string[];
  warnings?: string[];
  fingerprint?: BundleFingerprint;
  injectionFindings?: BundleInjectionFinding[];
  acceptedInjectionFindings?: BundleInjectionFinding[];
  installedSkills?: InstalledBundleDependency[];
  installedPersonas?: InstalledBundleDependency[];
  importWarnings?: string[];
}

async function readJsonBody<T>(res: Response): Promise<T | { error: string }> {
  try {
    return (await res.json()) as T;
  } catch {
    return { error: `Request failed (HTTP ${res.status})` };
  }
}

/** Validate a .anton file without installing it. Throws with the server's message on a non-2xx. */
export async function validateAntonBundle(file: File): Promise<BundleValidationResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetchWithAuth(`${API_BASE}/exchange/validate`, { method: 'POST', body: formData });
  const body = await readJsonBody<BundleValidationResponse>(res);
  if (!res.ok) {
    const message = 'error' in body && typeof body.error === 'string' ? body.error : `Validation failed (HTTP ${res.status})`;
    throw new Error(res.status === 403 ? `You do not have permission to import bundles (${message}).` : message);
  }
  return body as BundleValidationResponse;
}

/**
 * Install a module bundle. Returns `{ status, body }` rather than throwing on
 * 409 so the caller can show the injection findings and re-submit with
 * `acceptInjectionFindings`. Throws on 401/403/5xx.
 */
export async function importAntonModule(
  file: File,
  options: { acceptInjectionFindings?: boolean; keepId?: boolean } = {},
): Promise<{ status: number; body: ModuleImportResponse }> {
  const formData = new FormData();
  formData.append('file', file);
  if (options.keepId) formData.append('keepId', 'true');
  if (options.acceptInjectionFindings) formData.append('acceptInjectionFindings', 'true');
  const res = await fetchWithAuth(`${API_BASE}/exchange/import`, { method: 'POST', body: formData });
  const body = await readJsonBody<ModuleImportResponse>(res);
  if (res.ok || res.status === 409) {
    return { status: res.status, body: body as ModuleImportResponse };
  }
  const message = 'error' in body && typeof body.error === 'string' ? body.error : `Import failed (HTTP ${res.status})`;
  throw new Error(res.status === 403 ? `You do not have permission to import modules (${message}).` : message);
}

export function importMarketIndexAnton(file: File) { return importMarketBundle('market-index', file); }
export function importMarketThesisAnton(file: File) { return importMarketBundle('market-thesis', file); }
export function importMarketAtomCollectionAnton(file: File) { return importMarketBundle('market-atom-collection', file); }
export function importMarketStrategyPackAnton(file: File) { return importMarketBundle('market-strategy-pack', file); }
export function importMarketInvestigationAnton(file: File) { return importMarketBundle('market-investigation', file); }
export function importMarketDataSourceConfigAnton(file: File) { return importMarketBundle('market-data-source-config', file); }
export function importMarketIntelligenceModelAnton(file: File) { return importMarketBundle('market-intelligence-model', file); }

// ── Specialized Agents API ────────────────────────────────────

export interface AgentProfileData {
  id: string;
  name: string;
  slug: string;
  role_description: string;
  avatar: string;
  greeting_message: string | null;
  status: string;
  system_prompt: string;
  default_model: string | null;
  default_thinking: string;
  max_tokens: number;
  routing_keywords: string | string[];
  routing_priority: number;
  escalation_policy: string;
  max_conversation_turns: number;
  auto_response_enabled: boolean;
  total_conversations: number;
  total_messages_handled: number;
  created_at: string;
  updated_at: string;
}

export interface AgentStats {
  totalConversations: number;
  recentConversations: number;
  totalEscalations: number;
  avgSatisfaction: number | null;
}

export interface AgentConversationSummary {
  id: string;
  agent_id: string;
  source: string;
  source_ref: string | null;
  requester_hash: string | null;
  requester_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AgentMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  thinking: string | null;
  created_at: string;
}

export interface AgentConnector {
  id: string;
  name: string;
  connector_type: string;
  description: string | null;
  is_active: boolean;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
}

export async function fetchAgent(id: string): Promise<{ agent: AgentProfileData; stats: AgentStats } | null> {
  const res = await fetchWithAuth(`${API_BASE}/agents/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}

export async function updateAgentProfile(id: string, updates: Record<string, unknown>): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/agents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update agent');
}

export async function setAgentStatus(id: string, action: 'activate' | 'pause'): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/agents/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to ${action} agent`);
}

export async function fetchAgentConversations(agentId: string, limit = 20): Promise<AgentConversationSummary[]> {
  const res = await fetchWithAuth(`${API_BASE}/agents/${encodeURIComponent(agentId)}/conversations?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json() as { conversations?: AgentConversationSummary[] };
  return data.conversations ?? [];
}

export async function fetchAgentConversation(conversationId: string): Promise<{
  conversation: AgentConversationSummary;
  messages: AgentMessage[];
} | null> {
  const res = await fetchWithAuth(`${API_BASE}/agents/conversations/${encodeURIComponent(conversationId)}`);
  if (!res.ok) return null;
  return res.json();
}

export async function queryAgent(agentId: string, message: string, conversationId?: string): Promise<{
  response: string;
  thinking?: string;
  conversationId: string;
  escalated: boolean;
}> {
  const res = await fetchWithAuth(`${API_BASE}/agents/${encodeURIComponent(agentId)}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversationId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Query failed' })) as { error?: unknown };
    throw new Error(typeof err.error === 'string' ? err.error : 'Query failed');
  }
  return res.json();
}

export async function fetchAgentConnectors(agentId: string): Promise<AgentConnector[]> {
  const res = await fetchWithAuth(`${API_BASE}/agents/${encodeURIComponent(agentId)}/connectors`);
  if (!res.ok) return [];
  const data = await res.json() as { connectors?: AgentConnector[] };
  return data.connectors ?? [];
}

export async function createAgentConnector(agentId: string, connector: {
  name: string;
  connectorType: string;
  description?: string;
  config: Record<string, unknown>;
  authConfig?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const res = await fetchWithAuth(`${API_BASE}/agents/${encodeURIComponent(agentId)}/connectors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connector),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to add connector' })) as { error?: unknown };
    throw new Error(typeof err.error === 'string' ? err.error : 'Failed to add connector');
  }
  return res.json();
}

export async function deleteAgentConnector(agentId: string, connectorId: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/agents/${encodeURIComponent(agentId)}/connectors/${encodeURIComponent(connectorId)}`, {
    method: 'DELETE',
  });
}

export async function testAgentConnector(agentId: string, connectorId: string, options?: {
  action?: string;
  params?: Record<string, unknown>;
}): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const res = await fetchWithAuth(`${API_BASE}/agents/${encodeURIComponent(agentId)}/connectors/${encodeURIComponent(connectorId)}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Test failed' })) as { error?: unknown };
    return { success: false, error: typeof err.error === 'string' ? err.error : 'Test failed' };
  }
  return res.json();
}

// ── Remote (network) agents — peers' public agent directories ──

export interface RemoteAgentInfo {
  slug: string;
  name: string;
  role: string;
  keywords: string[];
  endpoint: string;
  peerHash: string;
  peerName: string;
}

export async function discoverRemoteAgents(): Promise<RemoteAgentInfo[]> {
  const res = await fetchWithAuth(`${API_BASE}/agents/remote/discover`);
  if (!res.ok) return [];
  const data = await res.json() as { agents?: RemoteAgentInfo[] };
  return data.agents ?? [];
}

export async function queryRemoteAgent(params: {
  query: string;
  endpoint?: string;
  agentSlug?: string;
  conversationId?: string;
}): Promise<{
  response: string;
  agentName: string;
  agentRole: string;
  peerName?: string;
  conversationId: string;
} | null> {
  const res = await fetchWithAuth(`${API_BASE}/agents/remote/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Remote query failed' })) as { error?: unknown };
    throw new Error(typeof err.error === 'string' ? err.error : 'Remote query failed');
  }
  const data = await res.json() as { result?: { response: string; agentName: string; agentRole: string; peerName?: string; conversationId: string } | null };
  return data.result ?? null;
}

// ── Markets Pillar RCI API ────────────────────────────────────

/** Run the full Reason → Compute → Interpret pipeline */
export async function runMarketRCI(question: string, context?: string) {
  const res = await fetchWithAuth(`${API_BASE}/markets/rci`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context }),
  });
  if (!res.ok) throw new Error('RCI pipeline failed');
  return res.json();
}

/** Get template suggestions for a question (REASON phase only) */
export async function suggestMarketTemplates(question: string) {
  const res = await fetchWithAuth(`${API_BASE}/markets/rci/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error('Template suggestion failed');
  return res.json();
}

// ── Provenance (Wave 1 — the explainability contract) ────────

/**
 * The persisted run record for one assistant message. Returns null on 404
 * (older runs predate run_artifacts, or the fire-and-forget writer had not
 * landed yet); throws on any other failure so the panel can say so.
 */
export async function fetchRunArtifact(sessionId: string, messageId: string): Promise<RunArtifact | null> {
  const res = await fetchWithAuth(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/artifacts`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof data.error === 'string' ? data.error : `Run record request failed (HTTP ${res.status})`);
  }
  const row = (await res.json()) as RunArtifact & { layer_summary: unknown; source_manifest: unknown };
  return {
    ...row,
    truncated: !!row.truncated,
    layer_summary: Array.isArray(row.layer_summary) ? (row.layer_summary as RunArtifact['layer_summary']) : [],
    source_manifest: Array.isArray(row.source_manifest) ? (row.source_manifest as RunArtifact['source_manifest']) : [],
  };
}

/**
 * The atoms injected into a session with their retrieval scores (same route
 * InjectedAtomsPanel reads). With a messageId only the atoms that went into
 * that answer come back (Wave 4).
 */
export async function fetchInjectedAtoms(sessionId: string, messageId?: string | null): Promise<InjectedAtomRow[]> {
  const qs = messageId ? `?messageId=${encodeURIComponent(messageId)}` : '';
  const res = await fetchWithAuth(`${API_BASE}/embeddings/feedback/${encodeURIComponent(sessionId)}${qs}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { injectedAtoms?: InjectedAtomRow[] };
  return Array.isArray(data.injectedAtoms) ? data.injectedAtoms : [];
}

/** Rate one injected atom (retrieval_feedback.was_relevant) — the thumbs in InjectedAtomsPanel. */
export async function rateInjectedAtom(sessionId: string, atomId: string, wasRelevant: boolean): Promise<boolean> {
  const res = await fetchWithAuth(`${API_BASE}/embeddings/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ atomId, sessionId, wasRelevant }),
  });
  return res.ok;
}

/** Wave 4: the memory-injection gate (mode, counts vs thresholds, whether it applies, reason). */
export async function fetchAtomInjectionStatus(): Promise<AtomInjectionStatus> {
  const res = await fetchWithAuth(`${API_BASE}/intelligence/atom-injection`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof data.error === 'string' ? data.error : `Memory gate request failed (HTTP ${res.status})`);
  }
  return (await res.json()) as AtomInjectionStatus;
}

/** Wave 4: set the memory-injection mode; returns the fresh gate status. */
export async function setAtomInjectionMode(mode: AtomInjectionMode): Promise<AtomInjectionStatus> {
  const res = await fetchWithAuth(`${API_BASE}/intelligence/atom-injection/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof data.error === 'string' ? data.error : `Memory gate update failed (HTTP ${res.status})`);
  }
  return (await res.json()) as AtomInjectionStatus;
}

/**
 * Wave 4b: the three memory & governance settings behind one Settings entry
 * (GET/POST /api/settings/memory-governance). Mirror of
 * server/routes/settings.ts MemoryGovernanceState.
 */
export interface MemoryGovernance {
  /** The memory-injection gate, read fresh. */
  atomInjection: AtomInjectionStatus;
  /** Unsigned exports of the three EU AI Act gated modules are refused. Default off. */
  oversightBlocksExport: boolean;
  /** Structured extraction after every run (effective value). */
  structuredExtractionAuto: boolean;
  /** What applies when nothing is persisted: off on a subscription (sdk:) default model, on otherwise. */
  structuredExtractionAutoDefault: boolean;
}

/** Any subset of the three settings; only the keys present are written. */
export interface MemoryGovernancePatch {
  atomInjectionMode?: AtomInjectionMode;
  oversightBlocksExport?: boolean;
  structuredExtractionAuto?: boolean;
}

async function memoryGovernanceJson(res: Response, action: string): Promise<MemoryGovernance> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof data.error === 'string' ? data.error : `${action} failed (HTTP ${res.status})`);
  }
  return (await res.json()) as MemoryGovernance;
}

export async function fetchMemoryGovernance(): Promise<MemoryGovernance> {
  const res = await fetchWithAuth(`${API_BASE}/settings/memory-governance`);
  return memoryGovernanceJson(res, 'Memory & governance request');
}

/** Writes the keys present in `patch`; returns the state afterwards. */
export async function updateMemoryGovernance(patch: MemoryGovernancePatch): Promise<MemoryGovernance> {
  const res = await fetchWithAuth(`${API_BASE}/settings/memory-governance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return memoryGovernanceJson(res, 'Memory & governance update');
}

/**
 * Wave 5: the subscription engine's per-day run cap (GET/POST
 * /api/settings/engine-guards). Mirror of server/routes/engine-guards.ts
 * EngineGuardsState.
 */
export interface EngineGuards {
  /** null = unlimited. */
  sdkDailyRunCap: number | null;
  /** Subscription runs started today (audit-log seed + runs since). */
  sdkRunsToday: number;
}

async function engineGuardsJson(res: Response, action: string): Promise<EngineGuards> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof data.error === 'string' ? data.error : `${action} failed (HTTP ${res.status})`);
  }
  return (await res.json()) as EngineGuards;
}

export async function fetchEngineGuards(): Promise<EngineGuards> {
  const res = await fetchWithAuth(`${API_BASE}/settings/engine-guards`);
  return engineGuardsJson(res, 'Engine guards request');
}

/** Sets the cap (an integer of at least 1) or removes it (null); returns the state afterwards. */
export async function updateEngineGuards(patch: { sdkDailyRunCap: number | null }): Promise<EngineGuards> {
  const res = await fetchWithAuth(`${API_BASE}/settings/engine-guards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return engineGuardsJson(res, 'Engine guards update');
}

// ── Module access (Wave 6 track F) — which modules a team-mode role may run ──
// Mirrors server/services/module-access.ts. Rules target viewer | analyst only;
// an admin is never restricted. No matching rule = allowed (default open).

export type ModuleAccessRuleRole = 'viewer' | 'analyst';
export type ModuleAccessEffect = 'allow' | 'deny';
export type ModuleAccessScope = 'module' | 'area' | 'all';

export interface ModuleAccessRule {
  id: string;
  role: string;
  moduleId: string | null;
  areaId: string | null;
  effect: ModuleAccessEffect;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface NewModuleAccessRule {
  role: ModuleAccessRuleRole;
  moduleId?: string | null;
  areaId?: string | null;
  /** Required when neither moduleId nor areaId is given: the rule covers every module. */
  wildcard?: boolean;
  effect: ModuleAccessEffect;
  note?: string | null;
}

export interface ModuleAccessVerdict {
  allowed: boolean;
  rule: { id: string; effect: ModuleAccessEffect; scope: ModuleAccessScope } | null;
  reason: string;
  moduleId: string | null;
  areaId: string | null;
  role: string | null;
  teamMode: boolean;
}

/** How many of the catalogue's modules each restricted role may run. */
export interface ModuleAccessPreview {
  total: number;
  roles: Record<string, { allowed: number; total: number }>;
}

async function jsonOrThrow<T>(res: Response, action: string): Promise<T> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof data.error === 'string' ? data.error : `${action} failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchModuleAccessRules(): Promise<ModuleAccessRule[]> {
  const res = await fetchWithAuth(`${API_BASE}/module-access/rules`);
  const data = await jsonOrThrow<{ rules: ModuleAccessRule[] }>(res, 'Module access rules request');
  return Array.isArray(data.rules) ? data.rules : [];
}

export async function addModuleAccessRule(rule: NewModuleAccessRule): Promise<ModuleAccessRule> {
  const res = await fetchWithAuth(`${API_BASE}/module-access/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  const data = await jsonOrThrow<{ rule: ModuleAccessRule }>(res, 'Module access rule add');
  return data.rule;
}

export async function removeModuleAccessRule(id: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/module-access/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await jsonOrThrow<{ ok: boolean }>(res, 'Module access rule remove');
}

/** The caller's own verdict for a module; areaId is optional (the server resolves it). */
export async function checkModuleAccess(moduleId: string | null, areaId?: string | null): Promise<ModuleAccessVerdict> {
  const params = new URLSearchParams();
  if (moduleId) params.set('moduleId', moduleId);
  if (areaId) params.set('areaId', areaId);
  const qs = params.toString();
  const res = await fetchWithAuth(`${API_BASE}/module-access/check${qs ? `?${qs}` : ''}`);
  return jsonOrThrow<ModuleAccessVerdict>(res, 'Module access check');
}

export async function fetchModuleAccessPreview(): Promise<ModuleAccessPreview> {
  const res = await fetchWithAuth(`${API_BASE}/module-access/preview`);
  return jsonOrThrow<ModuleAccessPreview>(res, 'Module access preview');
}

/**
 * The last assistant message row as the server persisted it. Needed because
 * a live run's message id is minted client-side at stream_end (the server's
 * `assistantMessageId` never reaches the browser), so run_artifacts can only
 * be looked up by the id the session endpoint reports.
 */
export async function fetchLatestAssistantMessageRow(sessionId: string): Promise<PersistedAssistantMessageRow | null> {
  const session = (await fetchSession(sessionId)) as { messages?: unknown } | null;
  if (!session || !Array.isArray(session.messages)) return null;
  const rows = session.messages as Array<Record<string, unknown>>;
  for (let i = rows.length - 1; i >= 0; i--) {
    const m = rows[i];
    if (m.role !== 'assistant' || typeof m.id !== 'string') continue;
    return {
      id: m.id,
      role: 'assistant',
      token_count: typeof m.token_count === 'number' ? m.token_count : null,
      config_snapshot: m.config_snapshot && typeof m.config_snapshot === 'object'
        ? (m.config_snapshot as Record<string, unknown>)
        : null,
      created_at: typeof m.created_at === 'string' ? m.created_at : '',
    };
  }
  return null;
}

// ── Evidence Pack API (Wave 3 — the pack walks the real surface) ─────────

/** A pack scope with one root row. Mirrors the server's scope union (routes/evidence-pack.ts). */
export type EvidencePackScope =
  | { type: 'session'; sessionId: string; includePrompts?: boolean }
  | { type: 'project'; projectId: string; includePrompts?: boolean }
  | { type: 'mission'; missionId: string }
  | { type: 'gap_assessment'; assessmentId: string; includePrompts?: boolean }
  | { type: 'engagement'; engagementId: string; includePrompts?: boolean }
  | { type: 'task'; taskId: string };

export interface EvidencePackSummary {
  id: string;
  title: string;
  purpose: string | null;
  scope_type: string;
  scope_label: string | null;
  status: string;
  hash_manifest: string | null;
  item_count: number;
  created_by: string;
  created_at: string;
  finalised_at: string | null;
  retention_until: string | null;
  legal_hold: boolean;
  compliance_frameworks: string[] | string;
}

export interface EvidencePackCollectResult {
  packId: string;
  manifestHash: string;
  itemCount: number;
  itemsByType: Record<string, number>;
}

async function evidencePackJson<T>(res: Response, what: string): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `${what} failed (HTTP ${res.status})`);
  }
  return data as T;
}

/** The current user's packs (admins see everyone's), newest first, optionally by status. */
export async function listEvidencePacks(status?: 'draft' | 'finalised' | 'shared' | 'archived'): Promise<EvidencePackSummary[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const res = await fetchWithAuth(`${API_BASE}/evidence-pack?${params}`);
  const data = await evidencePackJson<{ packs?: EvidencePackSummary[] }>(res, 'Loading evidence packs');
  return Array.isArray(data.packs) ? data.packs : [];
}

/** Create a draft pack. Nothing is collected until collectEvidencePack runs. */
export async function createEvidencePack(input: {
  title: string;
  scope: EvidencePackScope;
  purpose?: string;
  complianceFrameworks?: string[];
  retentionDays?: number;
  notes?: string;
}): Promise<{ id: string }> {
  const res = await fetchWithAuth(`${API_BASE}/evidence-pack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await evidencePackJson<{ pack: { id: string } }>(res, 'Creating the evidence pack');
  return { id: data.pack.id };
}

/** Add a session / assessment / engagement / task to a draft pack's scope (the pack becomes a custom list). */
export async function addScopeToEvidencePack(packId: string, scope: EvidencePackScope): Promise<{ added: boolean }> {
  const res = await fetchWithAuth(`${API_BASE}/evidence-pack/${encodeURIComponent(packId)}/scope/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope }),
  });
  const data = await evidencePackJson<{ added: boolean }>(res, 'Adding to the evidence pack');
  return { added: !!data.added };
}

/** Run (or re-run) the collector on a draft pack and assemble its manifest. */
export async function collectEvidencePack(packId: string): Promise<EvidencePackCollectResult> {
  const res = await fetchWithAuth(`${API_BASE}/evidence-pack/${encodeURIComponent(packId)}/collect`, { method: 'POST' });
  const data = await evidencePackJson<{ manifestHash: string; itemCount: number; itemsByType: Record<string, number> }>(res, 'Collecting evidence');
  return {
    packId,
    manifestHash: data.manifestHash,
    itemCount: data.itemCount,
    itemsByType: data.itemsByType ?? {},
  };
}

// ── Run record v2 (Wave 5) — the records of agentic runs, by parent, and their tool calls ──

export type RunRecordParentKind = 'message' | 'gap_batch' | 'task_step' | 'engagement_step';

export interface RunRecordUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** One run_artifacts row as GET /api/run-artifacts returns it (prompt and transcript on request). */
export interface RunRecordSummary {
  id: string;
  message_id: string | null;
  session_id: string | null;
  parent_kind: RunRecordParentKind;
  parent_id: string | null;
  engine: string | null;
  engine_version: string | null;
  model_requested: string | null;
  model_served: string | null;
  request_params: Record<string, unknown> | null;
  prompt_sha256: string;
  prompt_chars: number;
  truncated: boolean;
  user_message_sha256: string | null;
  history_sha256: string | null;
  output_sha256: string | null;
  thinking_sha256: string | null;
  usage: RunRecordUsage | null;
  cost_usd: number | null;
  cost_basis: 'usd' | 'plan_usage' | 'unknown' | 'free' | null;
  status: 'completed' | 'interrupted' | 'failed';
  rerun_of: string | null;
  rerun_mode: string | null;
  layer_summary: unknown[];
  source_manifest: unknown[];
  created_at: string;
  finished_at: string | null;
  transcript_turns: number;
  tool_call_count: number;
  /** Present with includePrompt. */
  composed_prompt?: string;
  /** Present with includeTranscript (always from fetchRunRecord). */
  transcript?: string[];
}

/** One run_tool_calls row; output_text only with `full`. */
export interface RunToolCallRow {
  id: string;
  seq: number;
  tool_name: string;
  input: Record<string, unknown> | null;
  output_sha256: string | null;
  /** Length of the FULL output (the stored text is capped at 40,000 characters). */
  output_chars: number;
  stored_chars: number;
  is_error: boolean;
  duration_ms: number | null;
  created_at: string;
  output_preview: string;
  output_preview_truncated: boolean;
  output_text?: string;
}

async function runRecordJson<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof data.error === 'string' ? data.error : `${what} failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<T>;
}

/**
 * The run records of a parent. For gap_batch / task_step the id may be the
 * assessment / task id alone — every batch / step under it comes back, in
 * creation order.
 */
export async function fetchRunRecordsByParent(
  kind: RunRecordParentKind,
  parentId: string,
  opts?: { includePrompt?: boolean; includeTranscript?: boolean },
): Promise<RunRecordSummary[]> {
  const q = new URLSearchParams();
  if (opts?.includePrompt) q.set('includePrompt', '1');
  if (opts?.includeTranscript) q.set('includeTranscript', '1');
  const qs = q.toString();
  const res = await fetchWithAuth(
    `${API_BASE}/run-artifacts/by-parent/${encodeURIComponent(kind)}/${encodeURIComponent(parentId)}${qs ? `?${qs}` : ''}`,
  );
  const rows = await runRecordJson<RunRecordSummary[]>(res, 'Loading run records');
  return Array.isArray(rows) ? rows : [];
}

/** One run record with its transcript (null when it does not exist). */
export async function fetchRunRecord(
  runId: string,
  opts?: { includePrompt?: boolean },
): Promise<RunRecordSummary | null> {
  const res = await fetchWithAuth(
    `${API_BASE}/run-artifacts/${encodeURIComponent(runId)}${opts?.includePrompt ? '?includePrompt=1' : ''}`,
  );
  if (res.status === 404) return null;
  return runRecordJson<RunRecordSummary>(res, 'Loading the run record');
}

/** The tool calls of a run, in call order; `full` returns the stored output text. */
export async function fetchRunToolCalls(runId: string, opts?: { full?: boolean }): Promise<RunToolCallRow[]> {
  const res = await fetchWithAuth(
    `${API_BASE}/run-artifacts/${encodeURIComponent(runId)}/tool-calls${opts?.full ? '?full=1' : ''}`,
  );
  const rows = await runRecordJson<RunToolCallRow[]>(res, 'Loading tool calls');
  return Array.isArray(rows) ? rows : [];
}

// ── Per-user module defaults (Wave 6 track H) ──────────────────────────────
// What this person ran a module with last time, and what their profile already
// answers for its guided form. Both calls are best-effort: a module page must
// open and a run must complete whether or not the server has anything to say.

export interface ModuleDefaults {
  outputFormats: string[];
  thinking: string | null;
  creativity: string | null;
  guidedInputs: Record<string, unknown>;
  usedCount: number;
}

export interface ModuleDefaultsResponse {
  /** null before the first recorded run of this module */
  defaults: ModuleDefaults | null;
  /** guided-field id → value the profile / org context supplies */
  prefill: Record<string, string | string[]>;
  /** the jurisdiction pack the profile's jurisdiction maps to */
  jurisdictionSkill: { id: string; name: string } | null;
}

/** Last-used settings + profile prefill for a module; null on any failure. */
export async function fetchModuleDefaults(moduleId: string): Promise<ModuleDefaultsResponse | null> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/user-module-defaults/${encodeURIComponent(moduleId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<ModuleDefaultsResponse>;
    return {
      defaults: data.defaults ?? null,
      prefill: data.prefill && typeof data.prefill === 'object' ? data.prefill : {},
      jurisdictionSkill: data.jurisdictionSkill ?? null,
    };
  } catch {
    return null;
  }
}

export interface ModuleUseRecord {
  outputFormats: string[];
  thinking: string;
  creativity: string;
  guidedInputs: Record<string, unknown>;
}

/** Fire-and-forget: remember what a module was just run with. Never throws. */
export async function recordModuleUse(moduleId: string, use: ModuleUseRecord): Promise<void> {
  try {
    await fetchWithAuth(`${API_BASE}/user-module-defaults/${encodeURIComponent(moduleId)}/used`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(use),
    });
  } catch {
    // best-effort — the run already happened
  }
}
