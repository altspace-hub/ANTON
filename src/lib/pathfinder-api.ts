/**
 * Pathfinder Client API — SSE streaming + REST helpers
 */
import { fetchWithAuth, API_BASE } from './api';

// ── Types ──────────────────────────────────────────────────────────────────

export type SearchDepth = 'quick' | 'thorough' | 'deep';
export type SearchMode = 'knowledge' | 'shopping' | 'travel' | 'food' | 'fix' | 'news' | 'local';

export interface PathfinderModelResult {
  modelId: string;
  role: string;
  status: 'complete' | 'error';
  durationMs: number;
  response: string;
  responsePreview?: string;
  sourceCount: number;
  error?: string;
}

export type SourceType = 'web' | 'local' | 'knowledge_pack' | 'institutional_memory';

export interface PathfinderWebSource {
  url: string;
  title: string;
  snippet: string;
  modelId: string;
  sourceType?: SourceType;
  qualityScore?: number;
  relevanceScore?: number;
  consensusScore?: number;
}

export type PathfinderEvent =
  | { type: 'search_start'; searchId: string; depth: SearchDepth }
  | { type: 'pre_search_reasoning'; reasoning: string }
  | { type: 'model_start'; modelId: string; role: string }
  | { type: 'model_complete'; modelId: string; role: string; status: string; durationMs: number; responsePreview: string; sourceCount: number; error?: string; confidenceScore?: number }
  | { type: 'synthesis_start' }
  | { type: 'text_delta'; content: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'search_complete'; searchId: string; webSources: PathfinderWebSource[]; localSources?: PathfinderWebSource[]; enrichedQuery?: string; modelResults: PathfinderModelResult[]; inputTokens: number; outputTokens: number; costUsd: number; durationMs: number; followUpSuggestions: string[] }
  | { type: 'followup_start'; searchId: string }
  | { type: 'followup_complete'; followUpId: string }
  | { type: 'error'; message: string };

export interface PathfinderSearchConfig {
  query: string;
  depth: SearchDepth;
  searchMode?: SearchMode;
  threadId?: string | null;
  documentIds?: string[];
  activeAreaId?: string;
  activeModuleId?: string;
  userLocation?: string;
}

export interface PathfinderThread {
  id: string;
  title: string;
  pinned: number;
  search_count: number;
  created_at: string;
  updated_at: string;
}

export interface PathfinderDocument {
  id: string;
  filename: string;
  file_size: number;
  word_count: number;
  token_estimate: number;
  thread_id: string | null;
  created_at: string;
}

export interface PathfinderSuggestion {
  id: string;
  query: string;
  context: string;
}

// ── SSE Streaming ──────────────────────────────────────────────────────────

export async function* streamPathfinderSearch(
  config: PathfinderSearchConfig,
  signal?: AbortSignal,
): AsyncGenerator<PathfinderEvent> {
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/search`, {
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
          try { yield JSON.parse(data) as PathfinderEvent; } catch { /* skip malformed */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamPathfinderFollowUp(
  searchId: string,
  question: string,
  signal?: AbortSignal,
): AsyncGenerator<PathfinderEvent> {
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/followup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchId, question }),
    signal,
  });

  if (!res.ok) {
    yield { type: 'error', message: await res.text() };
    return;
  }

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
          try { yield JSON.parse(data) as PathfinderEvent; } catch { /* skip malformed */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── REST Helpers ───────────────────────────────────────────────────────────

export async function fetchSearchHistory(limit = 50, offset = 0) {
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/searches?limit=${limit}&offset=${offset}`);
  return res.json() as Promise<{ searches: Array<Record<string, unknown>>; total: number }>;
}

export async function fetchSearchById(id: string) {
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/searches/${id}`);
  return res.json();
}

export async function deleteSearch(id: string) {
  return fetchWithAuth(`${API_BASE}/pathfinder/searches/${id}`, { method: 'DELETE' });
}

export async function fetchAvailableModels() {
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/available-models`);
  return res.json() as Promise<{ models: Array<{ modelId: string; provider: string; role: string; available: boolean }> }>;
}

// Threads
export async function fetchThreads() {
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/threads`);
  return res.json() as Promise<{ threads: PathfinderThread[] }>;
}

export async function createThread(title = 'New Thread') {
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return res.json() as Promise<{ id: string; title: string }>;
}

export async function updateThread(id: string, updates: { title?: string; pinned?: boolean }) {
  return fetchWithAuth(`${API_BASE}/pathfinder/threads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function deleteThread(id: string) {
  return fetchWithAuth(`${API_BASE}/pathfinder/threads/${id}`, { method: 'DELETE' });
}

// Documents
export async function fetchDocuments(threadId?: string) {
  const qs = threadId ? `?threadId=${threadId}` : '';
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/documents${qs}`);
  return res.json() as Promise<{ documents: PathfinderDocument[] }>;
}

export async function uploadPathfinderDocument(file: File, threadId?: string) {
  const fd = new FormData();
  fd.append('file', file);
  if (threadId) fd.append('threadId', threadId);
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/documents`, { method: 'POST', body: fd });
  return res.json() as Promise<{ id: string; filename: string; wordCount: number; tokenEstimate: number }>;
}

export async function deleteDocument(id: string) {
  return fetchWithAuth(`${API_BASE}/pathfinder/documents/${id}`, { method: 'DELETE' });
}

// Pipe to module
export async function pipeSearchToModule(searchId: string, moduleId?: string, areaId?: string) {
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/searches/${searchId}/to-module`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId, areaId }),
  });
  return res.json() as Promise<{ contextText: string; query: string }>;
}

// Smart Action Bar — extract actions from synthesis
export interface SmartAction {
  type: 'call' | 'directions' | 'website' | 'save_contact' | 'save_org' | 'create_task' | 'start_civic' | 'start_procure' | 'save_knowledge' | 'open_module' | 'task_agent';
  label: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  data: Record<string, string>;
}

export async function getSmartActions(
  synthesis: string,
  searchMode: string,
  query: string,
): Promise<SmartAction[]> {
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/actions/smart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ synthesis, searchMode, query }),
  });
  const data = await res.json() as { actions: SmartAction[] };
  return data.actions || [];
}

// Suggestions
export async function fetchSuggestions() {
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/suggestions`);
  return res.json() as Promise<{ suggestions: PathfinderSuggestion[] }>;
}

export async function dismissSuggestion(id: string) {
  return fetchWithAuth(`${API_BASE}/pathfinder/suggestions/${id}/dismiss`, { method: 'POST' });
}

export async function refreshSuggestions() {
  const res = await fetchWithAuth(`${API_BASE}/pathfinder/suggestions/refresh`, { method: 'POST' });
  return res.json() as Promise<{ suggestions: PathfinderSuggestion[] }>;
}
