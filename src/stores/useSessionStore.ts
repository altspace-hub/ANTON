import { create } from 'zustand';
import type { Message, StreamEvent, ModelId, ThinkingLevel, CreativityLevel, PrecisionLevel, KnowledgeSourceConfig } from '@/lib/types';
import { getStoredDefaultModel, getStoredDefaultThinking, getStoredDefaultCreativity } from '@/stores/useSettingsStore';

export interface StructureReference {
  mode: 'none' | 'upload' | 'describe';
  description: string;
  fileName?: string;
  fileId?: string;
}

export interface GuidedInputField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'multi-select' | 'chips' | 'boolean' | 'file' | 'number';
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
}

interface SessionState {
  // Current session
  sessionId: string | null;
  moduleId: string | null;
  areaId: string | null;
  guidedInputFields: GuidedInputField[];
  messages: Message[];

  // Config
  model: ModelId;
  thinking: ThinkingLevel;
  creativity: CreativityLevel;
  precision: PrecisionLevel;
  selectedPersonas: string[];
  selectedSkills: string[];
  multiPerspective: boolean;
  metaCognitiveEnabled: boolean;
  structureReference: StructureReference;
  referenceOutput: string;
  systemPrompt: string;
  selectedOutputFormats: string[];
  plainTextMode: boolean;
  multiAgentEnabled: boolean;
  multiAgentTeam: 'compliance' | 'strategic' | 'quality';
  multiAgentStyle: 'parallel' | 'debate' | 'consensus';
  knowledgeSources: KnowledgeSourceConfig;
  moduleInputs: Record<string, unknown>;
  uploadedFileIds: string[];
  transparencyLevel: 0 | 1 | 2;
  writingTone: 'formal' | 'professional' | 'casual' | 'conversational';
  emojiEnabled: boolean;
  nativeReasoningEnabled: boolean;
  audience: string;
  channel: string;
  outputLanguage: string;
  seed: number | undefined;

  // Streaming state
  isStreaming: boolean;
  streamingText: string;
  streamingThinking: string;
  abortController: AbortController | null;

  // Usage
  lastInputTokens: number;
  lastOutputTokens: number;
  lastCost: number;
  lastCachedTokens: number;
  lastCacheCreationTokens: number;

  // Actions
  setSessionId: (sessionId: string) => void;
  setModule: (moduleId: string) => void;
  setModel: (model: ModelId) => void;
  setThinking: (thinking: ThinkingLevel) => void;
  setCreativity: (creativity: CreativityLevel) => void;
  setPrecision: (precision: PrecisionLevel) => void;
  setSelectedPersonas: (personas: string[]) => void;
  setSelectedSkills: (skills: string[]) => void;
  setMultiPerspective: (enabled: boolean) => void;
  setMetaCognitiveEnabled: (enabled: boolean) => void;
  setStructureReference: (ref: StructureReference) => void;
  setReferenceOutput: (v: string) => void;
  setSystemPrompt: (prompt: string) => void;
  setSelectedOutputFormats: (formats: string[]) => void;
  setPlainTextMode: (enabled: boolean) => void;
  setMultiAgentEnabled: (enabled: boolean) => void;
  setMultiAgentTeam: (team: 'compliance' | 'strategic' | 'quality') => void;
  setMultiAgentStyle: (style: 'parallel' | 'debate' | 'consensus') => void;
  setKnowledgeSources: (config: KnowledgeSourceConfig) => void;
  setModuleInputs: (inputs: Record<string, unknown>) => void;
  setUploadedFileIds: (ids: string[]) => void;
  setAreaId: (areaId: string) => void;
  setGuidedInputFields: (fields: GuidedInputField[]) => void;
  setTransparencyLevel: (level: 0 | 1 | 2) => void;
  setWritingTone: (tone: 'formal' | 'professional' | 'casual' | 'conversational') => void;
  setEmojiEnabled: (enabled: boolean) => void;
  setNativeReasoningEnabled: (enabled: boolean) => void;
  setAudience: (v: string) => void;
  setChannel: (v: string) => void;
  setOutputLanguage: (v: string) => void;
  setSeed: (seed: number | undefined) => void;
  restoreSession: (sessionId: string, messages: Message[]) => void;
  truncateMessagesAt: (messageId: string) => void;
  addMessage: (message: Message) => void;
  handleStreamEvent: (event: StreamEvent) => void;
  startStreaming: () => AbortController;
  stopStreaming: () => void;
  clearSession: () => void;
}

const defaultKnowledgeSources: KnowledgeSourceConfig = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [], fetchDepth: 'full' },
    localFolder: { enabled: false, folderPaths: [], fileFilter: undefined, recursive: true },
    combinedMode: { enabled: false, priority: 'merged', instructions: '' },
  },
};

// ── Streaming throttle buffer ─────────────────────────────────
// Accumulates text/thinking deltas and flushes to state at most every 100ms.
// This reduces React re-renders from ~40/sec to ~10/sec during streaming.
let _textBuf = '';
let _thinkBuf = '';
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_MS = 100;

function _scheduleFlush(set: (fn: (state: SessionState) => Partial<SessionState>) => void) {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    if (_textBuf || _thinkBuf) {
      const tb = _textBuf;
      const thb = _thinkBuf;
      _textBuf = '';
      _thinkBuf = '';
      set((state) => ({
        streamingText: state.streamingText + tb,
        streamingThinking: state.streamingThinking + thb,
      }));
    }
  }, FLUSH_MS);
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: null,
  moduleId: null,
  areaId: null,
  guidedInputFields: [],
  messages: [],

  model: getStoredDefaultModel(),
  thinking: getStoredDefaultThinking(),
  creativity: getStoredDefaultCreativity(),
  precision: 'balanced' as PrecisionLevel,
  selectedPersonas: [],
  selectedSkills: [],
  multiPerspective: false,
  metaCognitiveEnabled: false,
  structureReference: { mode: 'none', description: '' },
  referenceOutput: '',
  systemPrompt: '',
  selectedOutputFormats: [],
  plainTextMode: false,
  multiAgentEnabled: false,
  multiAgentTeam: 'compliance',
  multiAgentStyle: 'parallel',
  knowledgeSources: defaultKnowledgeSources,
  moduleInputs: {},
  uploadedFileIds: [],
  transparencyLevel: 0,
  writingTone: 'professional' as 'formal' | 'professional' | 'casual' | 'conversational',
  emojiEnabled: false,
  nativeReasoningEnabled: false,
  audience: '',
  channel: '',
  outputLanguage: 'en',
  seed: undefined,

  isStreaming: false,
  streamingText: '',
  streamingThinking: '',
  abortController: null,

  lastInputTokens: 0,
  lastOutputTokens: 0,
  lastCost: 0,
  lastCachedTokens: 0,
  lastCacheCreationTokens: 0,

  setSessionId: (sessionId) => set({ sessionId }),
  setModule: (moduleId) => set({ moduleId }),
  setModel: (model) => set({ model }),
  setThinking: (thinking) => set({ thinking }),
  setCreativity: (creativity) => set({ creativity }),
  setPrecision: (precision) => set({ precision }),
  setSelectedPersonas: (personas) => set({ selectedPersonas: personas }),
  setSelectedSkills: (skills) => set({ selectedSkills: skills }),
  setMultiPerspective: (enabled) => set({ multiPerspective: enabled }),
  setMetaCognitiveEnabled: (enabled) => set({ metaCognitiveEnabled: enabled }),
  setStructureReference: (ref) => set({ structureReference: ref }),
  setReferenceOutput: (v) => set({ referenceOutput: v }),
  setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
  setSelectedOutputFormats: (formats) => set({ selectedOutputFormats: formats }),
  setPlainTextMode: (enabled) => set({ plainTextMode: enabled }),
  setMultiAgentEnabled: (enabled) => set({ multiAgentEnabled: enabled }),
  setMultiAgentTeam: (team) => set({ multiAgentTeam: team }),
  setMultiAgentStyle: (style) => set({ multiAgentStyle: style }),
  setKnowledgeSources: (config) => set({ knowledgeSources: config }),
  setModuleInputs: (inputs) => set({ moduleInputs: inputs }),
  setUploadedFileIds: (ids) => set({ uploadedFileIds: ids }),
  setAreaId: (areaId) => set({ areaId }),
  setGuidedInputFields: (fields) => set({ guidedInputFields: fields }),
  setTransparencyLevel: (level) => set({ transparencyLevel: level }),
  setWritingTone: (tone) => set({ writingTone: tone }),
  setEmojiEnabled: (enabled) => set({ emojiEnabled: enabled }),
  setNativeReasoningEnabled: (enabled) => set({ nativeReasoningEnabled: enabled }),
  setAudience: (v) => set({ audience: v }),
  setChannel: (v) => set({ channel: v }),
  setOutputLanguage: (v) => set({ outputLanguage: v }),
  setSeed: (seed) => set({ seed }),

  restoreSession: (sessionId, messages) => set({ sessionId, messages }),
  truncateMessagesAt: (messageId) =>
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return state;
      return { messages: state.messages.slice(0, idx) };
    }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

  handleStreamEvent: (event) => {
    switch (event.type) {
      case 'thinking_delta':
        _thinkBuf += event.content;
        _scheduleFlush(set);
        break;
      case 'text_delta':
        _textBuf += event.content;
        _scheduleFlush(set);
        break;
      case 'usage':
        set({
          lastInputTokens: event.inputTokens,
          lastOutputTokens: event.outputTokens,
          lastCachedTokens: event.cacheReadTokens || 0,
          lastCacheCreationTokens: event.cacheCreationTokens || 0,
        });
        break;
      case 'error':
        // Flush any remaining buffered text before stopping
        if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
        if (_textBuf || _thinkBuf) {
          const tb = _textBuf; const thb = _thinkBuf;
          _textBuf = ''; _thinkBuf = '';
          set((state) => ({
            streamingText: state.streamingText + tb,
            streamingThinking: state.streamingThinking + thb,
            isStreaming: false,
          }));
        } else {
          set({ isStreaming: false });
        }
        break;
      case 'stream_end': {
        // Flush pending buffers immediately
        if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
        const state = get();
        const fullText = state.streamingText + _textBuf;
        const fullThinking = state.streamingThinking + _thinkBuf;
        _textBuf = '';
        _thinkBuf = '';
        const message: Message = {
          id: crypto.randomUUID(),
          sessionId: state.sessionId || '',
          role: 'assistant',
          content: fullText,
          thinkingContent: fullThinking || undefined,
          contentBlocks: event.contentBlocks,
          tokenCount: state.lastOutputTokens,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          messages: [...s.messages, message],
          isStreaming: false,
          streamingText: '',
          streamingThinking: '',
          abortController: null,
        }));
        break;
      }
    }
  },

  startStreaming: () => {
    const controller = new AbortController();
    set({ isStreaming: true, streamingText: '', streamingThinking: '', abortController: controller });
    return controller;
  },

  stopStreaming: () => {
    const { abortController } = get();
    abortController?.abort();
    set({ isStreaming: false, abortController: null });
  },

  clearSession: () =>
    set({
      sessionId: null,
      messages: [],
      streamingText: '',
      streamingThinking: '',
      isStreaming: false,
      lastInputTokens: 0,
      lastOutputTokens: 0,
      lastCost: 0,
      lastCachedTokens: 0,
      lastCacheCreationTokens: 0,
      selectedPersonas: [],
      selectedSkills: [],
      multiPerspective: false,
      metaCognitiveEnabled: false,
      structureReference: { mode: 'none', description: '' },
      referenceOutput: '',
      uploadedFileIds: [],
      guidedInputFields: [],
      transparencyLevel: 0,
      precision: 'balanced' as PrecisionLevel,
      writingTone: 'professional' as 'formal' | 'professional' | 'casual' | 'conversational',
      emojiEnabled: false,
      nativeReasoningEnabled: false,
      audience: '',
      channel: '',
      outputLanguage: 'en',
      seed: undefined,
    }),
}));
