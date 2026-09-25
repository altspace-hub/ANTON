/**
 * PERF-01: Streaming hot-path store.
 *
 * Separated from useSessionStore so that components subscribing only to
 * streaming state (OutputPanel, ThinkingIndicator, etc.) re-render at ~10Hz
 * during streaming WITHOUT triggering re-renders in unrelated components
 * (ModelSelector, KnowledgeSourcePanel, ConfigPanel, etc.).
 */

import { create } from 'zustand';
import type { StreamEvent, Message, ContextUsed, WebSourceRecord } from '@/lib/types';

// ── Flush buffer (PERF-05) ────────────────────────────────────
let _textBuf = '';
let _thinkBuf = '';
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_MS = 100;

// ── Types ─────────────────────────────────────────────────────

interface StreamState {
  isStreaming: boolean;
  isAssemblingContext: boolean;
  lastSourcesUsed: string[];
  /** Wave 2: what the last answer's prompt actually held (documents, project, lens, layers). */
  lastContextUsed: ContextUsed | null;
  /** Wave 2: the pages the SDK engine searched for or fetched during the last run,
   *  in the order the tool events arrived. Reset when a run starts. */
  lastWebSources: WebSourceRecord[];
  streamingText: string;
  streamingThinking: string;
  abortController: AbortController | null;

  lastInputTokens: number;
  lastOutputTokens: number;
  lastCost: number;
  lastCachedTokens: number;
  lastCacheCreationTokens: number;

  // IRE (Iterative Reasoning Engine) state
  ireChainId: string | null;
  ireCurrentPhase: number;
  ireTotalPhases: number;
  ireCurrentPhaseName: string;

  // Compaction state
  compactionOccurred: boolean;
  compactionMessage: string;

  /** Notices the server sent for this run (one per code). */
  streamNotices: Array<{ code: string; message: string }>;

  // Actions
  startStreaming: () => AbortController;
  stopStreaming: () => void;
  resetStreamOutput: () => void;
  setLastSourcesUsed: (sources: string[]) => void;
  handleStreamEvent: (
    event: StreamEvent,
    sessionId: string | null,
    onMessageReady: (message: Message) => void,
  ) => void;
}

// ── Store ─────────────────────────────────────────────────────

export const useStreamStore = create<StreamState>((set, get) => ({
  isStreaming: false,
  isAssemblingContext: false,
  lastSourcesUsed: [],
  lastContextUsed: null,
  lastWebSources: [],
  streamingText: '',
  streamingThinking: '',
  abortController: null,

  lastInputTokens: 0,
  lastOutputTokens: 0,
  lastCost: 0,
  lastCachedTokens: 0,
  lastCacheCreationTokens: 0,

  ireChainId: null,
  ireCurrentPhase: 0,
  ireTotalPhases: 0,
  ireCurrentPhaseName: '',

  compactionOccurred: false,
  compactionMessage: '',
  streamNotices: [],

  startStreaming: () => {
    const controller = new AbortController();
    _textBuf = '';
    _thinkBuf = '';
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    set({
      isStreaming: true,
      streamingText: '',
      streamingThinking: '',
      abortController: controller,
      ireChainId: null,
      ireCurrentPhase: 0,
      ireTotalPhases: 0,
      ireCurrentPhaseName: '',
      compactionOccurred: false,
      compactionMessage: '',
      streamNotices: [],
      lastWebSources: [],
      // Reset accumulated tokens at start of each stream
      lastInputTokens: 0,
      lastOutputTokens: 0,
      lastCachedTokens: 0,
      lastCacheCreationTokens: 0,
    });
    return controller;
  },

  stopStreaming: () => {
    get().abortController?.abort();
    set({ isStreaming: false, isAssemblingContext: false, abortController: null });
  },

  resetStreamOutput: () => {
    _textBuf = '';
    _thinkBuf = '';
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    // The notices belong to the run they came with; another module or session must not show them.
    set({ streamingText: '', streamingThinking: '', ireChainId: null, ireCurrentPhase: 0, ireTotalPhases: 0, ireCurrentPhaseName: '', streamNotices: [] });
  },

  setLastSourcesUsed: (sources) => set({ lastSourcesUsed: sources }),

  handleStreamEvent: (event, sessionId, onMessageReady) => {
    const scheduleFlush = () => {
      if (_flushTimer) return;
      _flushTimer = setTimeout(() => {
        _flushTimer = null;
        if (_textBuf || _thinkBuf) {
          const tb = _textBuf; const thb = _thinkBuf;
          _textBuf = ''; _thinkBuf = '';
          set((s) => ({
            streamingText: s.streamingText + tb,
            streamingThinking: s.streamingThinking + thb,
          }));
        }
      }, FLUSH_MS);
    };

    switch (event.type) {
      case 'stream_start':
        // A run emits one of these before any source; a stale list from the
        // previous run must not sit under the new answer.
        set({ lastWebSources: [] });
        break;
      case 'source_fetched':
        set((s) => ({ lastWebSources: [...s.lastWebSources, event.source] }));
        break;
      case 'context_assembly_start':
        set({ isAssemblingContext: true });
        break;
      case 'context_assembly_complete':
        set({ isAssemblingContext: false });
        break;
      case 'context_used':
        set({ lastContextUsed: event.context });
        break;
      case 'thinking_delta':
        _thinkBuf += event.content;
        scheduleFlush();
        break;
      case 'text_delta':
        _textBuf += event.content;
        scheduleFlush();
        break;
      case 'usage':
        // Accumulate tokens across IRE phases (instead of replacing)
        set((s) => ({
          lastInputTokens: s.lastInputTokens + (event.inputTokens || 0),
          lastOutputTokens: s.lastOutputTokens + (event.outputTokens || 0),
          lastCachedTokens: s.lastCachedTokens + (event.cacheReadTokens || 0),
          lastCacheCreationTokens: s.lastCacheCreationTokens + (event.cacheCreationTokens || 0),
          // Wave 0: the engine names the model it served only at the end of the
          // run; merge it into the live "context used" frame so the trail shows
          // it without a reload.
          ...(event.modelServed && s.lastContextUsed
            ? { lastContextUsed: { ...s.lastContextUsed, modelServed: event.modelServed } }
            : {}),
        }));
        break;

      // IRE phase tracking events
      case 'revelation_chain_id':
        set({ ireChainId: event.chainId });
        break;
      case 'phase_start':
        set({
          ireCurrentPhase: event.phaseIndex,
          ireTotalPhases: event.totalPhases,
          ireCurrentPhaseName: event.phaseName,
        });
        break;
      case 'phase_end':
        // No state change needed — phase_start of next phase will update
        break;

      case 'compaction':
        set({ compactionOccurred: true, compactionMessage: event.message });
        break;

      case 'notice':
        set((s) => ({
          streamNotices: s.streamNotices.some((n) => n.code === event.code)
            ? s.streamNotices
            : [...s.streamNotices, { code: event.code, message: event.message }],
        }));
        break;

      case 'error':
        if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
        if (_textBuf || _thinkBuf) {
          const tb = _textBuf; const thb = _thinkBuf;
          _textBuf = ''; _thinkBuf = '';
          set((s) => ({
            streamingText: s.streamingText + tb,
            streamingThinking: s.streamingThinking + thb,
            isStreaming: false,
            isAssemblingContext: false,
          }));
        } else {
          set({ isStreaming: false, isAssemblingContext: false });
        }
        break;
      case 'stream_end': {
        if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
        const state = get();
        const fullText = state.streamingText + _textBuf;
        const fullThinking = state.streamingThinking + _thinkBuf;
        _textBuf = ''; _thinkBuf = '';
        const message: Message = {
          // Wave 1: use the id the server persists the row under (sent in the
          // context frame) so the run artifact resolves without a reload.
          id: state.lastContextUsed?.assistantMessageId || crypto.randomUUID(),
          sessionId: sessionId || '',
          role: 'assistant',
          content: fullText,
          thinkingContent: fullThinking || undefined,
          contentBlocks: event.contentBlocks,
          tokenCount: state.lastOutputTokens,
          createdAt: new Date().toISOString(),
        };
        set({
          isStreaming: false,
          isAssemblingContext: false,
          lastSourcesUsed: event.sourceManifest ?? state.lastSourcesUsed,
          streamingText: '',
          streamingThinking: '',
          abortController: null,
        });
        onMessageReady(message);
        break;
      }
    }
  },
}));
