/**
 * useSessionStore — unified session store (PERF-01 refactored).
 *
 * Internally delegates to three focused stores:
 *  - useStreamStore    — streaming hot-path (re-renders at 10Hz during output)
 *  - useConfigStore    — user config settings (rarely changes)
 *  - session metadata  — sessionId, moduleId, messages (kept inline)
 *
 * This file preserves the exact same public API so all existing imports
 * continue to work without modification. Over time, components can migrate
 * to importing directly from the focused stores to minimise re-renders.
 *
 * @example
 *  // Existing usage — still works
 *  const { isStreaming, model, sessionId } = useSessionStore();
 *
 *  // Optimised — only re-renders when streaming state changes
 *  const { isStreaming } = useStreamStore();
 */

import { create } from 'zustand';
import type { Message, StreamEvent, ModelId, ThinkingLevel, CreativityLevel, PrecisionLevel, KnowledgeSourceConfig } from '@/lib/types';
import { getStoredDefaultModel, getStoredDefaultThinking, getStoredDefaultCreativity } from '@/stores/useSettingsStore';
import { useStreamStore } from './useStreamStore';
import { useConfigStore } from './useConfigStore';

// StructureReference interface used by other modules
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

// ── Session metadata (kept inline — low churn) ───────────────
interface SessionMetaState {
  sessionId: string | null;
  moduleId: string | null;
  areaId: string | null;
  guidedInputFields: GuidedInputField[];
  messages: Message[];

  setSessionId: (sessionId: string) => void;
  setModule: (moduleId: string) => void;
  setAreaId: (areaId: string) => void;
  setGuidedInputFields: (fields: GuidedInputField[]) => void;
  restoreSession: (sessionId: string, messages: Message[]) => void;
  truncateMessagesAt: (messageId: string) => void;
  addMessage: (message: Message) => void;
  clearSession: () => void;
}

// ── Combined interface for backward compatibility ─────────────
interface SessionState extends SessionMetaState {
  // Config (delegated to useConfigStore)
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
  deliberationEnabled: boolean;
  knowledgeSources: KnowledgeSourceConfig;
  moduleInputs: Record<string, unknown>;
  uploadedFileIds: string[];
  transparencyLevel: 0 | 1 | 2;
  writingTone: 'formal' | 'professional' | 'casual' | 'conversational';
  emojiEnabled: boolean;
  nativeReasoningEnabled: boolean;
  iterativeReasoningEnabled: boolean;
  audience: string;
  channel: string;
  outputLanguage: string;
  seed: number | undefined;
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
  setDeliberationEnabled: (enabled: boolean) => void;
  setKnowledgeSources: (config: KnowledgeSourceConfig) => void;
  setModuleInputs: (inputs: Record<string, unknown>) => void;
  setUploadedFileIds: (ids: string[]) => void;
  setTransparencyLevel: (level: 0 | 1 | 2) => void;
  setWritingTone: (tone: 'formal' | 'professional' | 'casual' | 'conversational') => void;
  setEmojiEnabled: (enabled: boolean) => void;
  setNativeReasoningEnabled: (enabled: boolean) => void;
  setIterativeReasoningEnabled: (enabled: boolean) => void;
  setAudience: (v: string) => void;
  setChannel: (v: string) => void;
  setOutputLanguage: (v: string) => void;
  setSeed: (seed: number | undefined) => void;

  // Stream (delegated to useStreamStore)
  isStreaming: boolean;
  isAssemblingContext: boolean;
  lastSourcesUsed: string[];
  streamingText: string;
  streamingThinking: string;
  abortController: AbortController | null;
  lastInputTokens: number;
  lastOutputTokens: number;
  lastCost: number;
  lastCachedTokens: number;
  lastCacheCreationTokens: number;
  startStreaming: () => AbortController;
  stopStreaming: () => void;
  handleStreamEvent: (event: StreamEvent) => void;
}

// ── Session metadata store ─────────────────────────────────────
const useSessionMetaStore = create<SessionMetaState>((set) => ({
  sessionId: null,
  moduleId: null,
  areaId: null,
  guidedInputFields: [],
  messages: [],

  setSessionId: (sessionId) => set({ sessionId }),
  setModule: (moduleId) => set({ moduleId }),
  setAreaId: (areaId) => set({ areaId }),
  setGuidedInputFields: (fields) => set({ guidedInputFields: fields }),
  restoreSession: (sessionId, messages) => set({ sessionId, messages }),
  truncateMessagesAt: (messageId) =>
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return state;
      return { messages: state.messages.slice(0, idx) };
    }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearSession: () =>
    set({ sessionId: null, messages: [], guidedInputFields: [] }),
}));

// ── Combined hook (backward compatible) ───────────────────────
/**
 * Returns the unified session state, combining metadata + config + stream state.
 * For performance-sensitive components, use useStreamStore() or useConfigStore()
 * directly to avoid re-renders from unrelated state changes.
 */
export function useSessionStore(): SessionState {
  const meta = useSessionMetaStore();
  const config = useConfigStore();
  const stream = useStreamStore();

  return {
    // Meta
    sessionId: meta.sessionId,
    moduleId: meta.moduleId,
    areaId: meta.areaId,
    guidedInputFields: meta.guidedInputFields,
    messages: meta.messages,
    setSessionId: meta.setSessionId,
    setModule: meta.setModule,
    setAreaId: meta.setAreaId,
    setGuidedInputFields: meta.setGuidedInputFields,
    restoreSession: meta.restoreSession,
    truncateMessagesAt: meta.truncateMessagesAt,
    addMessage: meta.addMessage,
    clearSession: () => {
      meta.clearSession();
      config.resetConfig();
      stream.resetStreamOutput();
    },

    // Config
    model: config.model,
    thinking: config.thinking,
    creativity: config.creativity,
    precision: config.precision,
    selectedPersonas: config.selectedPersonas,
    selectedSkills: config.selectedSkills,
    multiPerspective: config.multiPerspective,
    metaCognitiveEnabled: config.metaCognitiveEnabled,
    structureReference: config.structureReference,
    referenceOutput: config.referenceOutput,
    systemPrompt: config.systemPrompt,
    selectedOutputFormats: config.selectedOutputFormats,
    plainTextMode: config.plainTextMode,
    multiAgentEnabled: config.multiAgentEnabled,
    multiAgentTeam: config.multiAgentTeam,
    multiAgentStyle: config.multiAgentStyle,
    deliberationEnabled: config.deliberationEnabled,
    knowledgeSources: config.knowledgeSources,
    moduleInputs: config.moduleInputs,
    uploadedFileIds: config.uploadedFileIds,
    transparencyLevel: config.transparencyLevel,
    writingTone: config.writingTone,
    emojiEnabled: config.emojiEnabled,
    nativeReasoningEnabled: config.nativeReasoningEnabled,
    iterativeReasoningEnabled: config.iterativeReasoningEnabled,
    audience: config.audience,
    channel: config.channel,
    outputLanguage: config.outputLanguage,
    seed: config.seed,
    setModel: config.setModel,
    setThinking: config.setThinking,
    setCreativity: config.setCreativity,
    setPrecision: config.setPrecision,
    setSelectedPersonas: config.setSelectedPersonas,
    setSelectedSkills: config.setSelectedSkills,
    setMultiPerspective: config.setMultiPerspective,
    setMetaCognitiveEnabled: config.setMetaCognitiveEnabled,
    setStructureReference: config.setStructureReference,
    setReferenceOutput: config.setReferenceOutput,
    setSystemPrompt: config.setSystemPrompt,
    setSelectedOutputFormats: config.setSelectedOutputFormats,
    setPlainTextMode: config.setPlainTextMode,
    setMultiAgentEnabled: config.setMultiAgentEnabled,
    setMultiAgentTeam: config.setMultiAgentTeam,
    setMultiAgentStyle: config.setMultiAgentStyle,
    setDeliberationEnabled: config.setDeliberationEnabled,
    setKnowledgeSources: config.setKnowledgeSources,
    setModuleInputs: config.setModuleInputs,
    setUploadedFileIds: config.setUploadedFileIds,
    setTransparencyLevel: config.setTransparencyLevel,
    setWritingTone: config.setWritingTone,
    setEmojiEnabled: config.setEmojiEnabled,
    setNativeReasoningEnabled: config.setNativeReasoningEnabled,
    setIterativeReasoningEnabled: config.setIterativeReasoningEnabled,
    setAudience: config.setAudience,
    setChannel: config.setChannel,
    setOutputLanguage: config.setOutputLanguage,
    setSeed: config.setSeed,

    // Stream
    isStreaming: stream.isStreaming,
    isAssemblingContext: stream.isAssemblingContext,
    lastSourcesUsed: stream.lastSourcesUsed,
    streamingText: stream.streamingText,
    streamingThinking: stream.streamingThinking,
    abortController: stream.abortController,
    lastInputTokens: stream.lastInputTokens,
    lastOutputTokens: stream.lastOutputTokens,
    lastCost: stream.lastCost,
    lastCachedTokens: stream.lastCachedTokens,
    lastCacheCreationTokens: stream.lastCacheCreationTokens,
    startStreaming: stream.startStreaming,
    stopStreaming: stream.stopStreaming,
    handleStreamEvent: (event) =>
      stream.handleStreamEvent(event, meta.sessionId, meta.addMessage),
  };
}

// Also export the underlying focused stores for direct use
export { useStreamStore } from './useStreamStore';
export { useConfigStore } from './useConfigStore';
export { useSessionMetaStore };
