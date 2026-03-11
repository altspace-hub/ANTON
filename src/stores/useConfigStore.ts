/**
 * PERF-01: Session configuration store.
 *
 * Contains all user-configurable options for a module session:
 * model, thinking level, creativity, knowledge sources, output formats, etc.
 * These change infrequently (only when user adjusts settings), so separating
 * them prevents config-panel re-renders during streaming.
 */

import { create } from 'zustand';
import type { ModelId, ThinkingLevel, CreativityLevel, PrecisionLevel, KnowledgeSourceConfig } from '@/lib/types';
import { getStoredDefaultModel, getStoredDefaultThinking, getStoredDefaultCreativity } from '@/stores/useSettingsStore';
import type { StructureReference } from './useSessionStore';

const defaultKnowledgeSources: KnowledgeSourceConfig = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [], fetchDepth: 'full' },
    localFolder: { enabled: false, folderPaths: [], fileFilter: undefined, recursive: true },
    combinedMode: { enabled: false, priority: 'merged', instructions: '' },
  },
};

interface ConfigState {
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
  atomInjectionEnabled: boolean;
  atomCollectionEnabled: boolean;
  audience: string;
  channel: string;
  outputLanguage: string;
  seed: number | undefined;

  // Setters
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
  setAtomInjectionEnabled: (enabled: boolean) => void;
  setAtomCollectionEnabled: (enabled: boolean) => void;
  setAudience: (v: string) => void;
  setChannel: (v: string) => void;
  setOutputLanguage: (v: string) => void;
  setSeed: (seed: number | undefined) => void;
  resetConfig: () => void;
}

const configDefaults = {
  model: getStoredDefaultModel(),
  thinking: getStoredDefaultThinking(),
  creativity: getStoredDefaultCreativity(),
  precision: 'balanced' as PrecisionLevel,
  selectedPersonas: [] as string[],
  selectedSkills: [] as string[],
  multiPerspective: false,
  metaCognitiveEnabled: false,
  structureReference: { mode: 'none' as const, description: '' },
  referenceOutput: '',
  systemPrompt: '',
  selectedOutputFormats: [] as string[],
  plainTextMode: false,
  multiAgentEnabled: false,
  multiAgentTeam: 'compliance' as 'compliance' | 'strategic' | 'quality',
  multiAgentStyle: 'parallel' as 'parallel' | 'debate' | 'consensus',
  deliberationEnabled: false,
  knowledgeSources: defaultKnowledgeSources,
  moduleInputs: {} as Record<string, unknown>,
  uploadedFileIds: [] as string[],
  transparencyLevel: 0 as 0 | 1 | 2,
  writingTone: 'professional' as 'formal' | 'professional' | 'casual' | 'conversational',
  emojiEnabled: false,
  nativeReasoningEnabled: false,
  iterativeReasoningEnabled: false,
  atomInjectionEnabled: true,
  atomCollectionEnabled: true,
  audience: '',
  channel: '',
  outputLanguage: 'en',
  seed: undefined as number | undefined,
};

export const useConfigStore = create<ConfigState>((set) => ({
  ...configDefaults,

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
  setDeliberationEnabled: (enabled) => set({ deliberationEnabled: enabled }),
  setKnowledgeSources: (config) => set({ knowledgeSources: config }),
  setModuleInputs: (inputs) => set({ moduleInputs: inputs }),
  setUploadedFileIds: (ids) => set({ uploadedFileIds: ids }),
  setTransparencyLevel: (level) => set({ transparencyLevel: level }),
  setWritingTone: (tone) => set({ writingTone: tone }),
  setEmojiEnabled: (enabled) => set({ emojiEnabled: enabled }),
  setNativeReasoningEnabled: (enabled) => set({ nativeReasoningEnabled: enabled }),
  setIterativeReasoningEnabled: (enabled) => set({ iterativeReasoningEnabled: enabled }),
  setAtomInjectionEnabled: (enabled) => set({ atomInjectionEnabled: enabled }),
  setAtomCollectionEnabled: (enabled) => set({ atomCollectionEnabled: enabled }),
  setAudience: (v) => set({ audience: v }),
  setChannel: (v) => set({ channel: v }),
  setOutputLanguage: (v) => set({ outputLanguage: v }),
  setSeed: (seed) => set({ seed }),
  resetConfig: () => set({ ...configDefaults }),
}));
