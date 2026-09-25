import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { MODULES, MODULE_KNOWLEDGE_CATEGORIES } from '@/lib/constants';
import { RIGHTS_ADVICE_AREAS as RIGHTS_DISCLAIMER_AREAS } from '@/lib/advice-boundary-areas';
import type { KnowledgeSourceConfig, KnowledgeLibraryEntry } from '@/lib/types';
import { useSessionStore } from '@/stores/useSessionStore';
import { useStreamStore } from '@/stores/useStreamStore';
import { useClaude } from '@/hooks/useClaude';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useExport } from '@/hooks/useExport';
import { useSkillCatalog, readRecommendedSkills } from '@/hooks/useSkills';
import { getRecommendedExportFormats } from '@/lib/output-format-definitions';
import ThinkingControls from '@/components/shared/ThinkingControls';
import WritingStylePanel from '@/components/shared/WritingStylePanel';
import MultiAgentPanel from '@/components/shared/MultiAgentPanel';
import DeliberationPanel from '@/components/shared/DeliberationPanel';
import SessionTogglesPanel from '@/components/shared/SessionTogglesPanel';
import { PrecisionSelector } from '@/components/shared/PrecisionSelector';
import ModelSelector from '@/components/shared/ModelSelector';
import ModelRecommendationBadge from '@/components/shared/ModelRecommendationBadge';
import PromptEditor from '@/components/shared/PromptEditor';
import KnowledgeSourcePanel from '@/components/shared/KnowledgeSourcePanel';
import OutputFormatSelector from '@/components/shared/OutputFormatSelector';
import GapAnalysisWalkthrough from '@/components/shared/GapAnalysisWalkthrough';
import AtlasMigrationBanner from '@/components/risk-atlas/AtlasMigrationBanner';
import CommunicationsPanel from '@/components/shared/CommunicationsPanel';
import StructureReference from '@/components/shared/StructureReference';
import ReferenceOutputPanel from '@/components/shared/ReferenceOutputPanel';
import FileUploader from '@/components/shared/FileUploader';
import ConversationThread from '@/components/shared/ConversationThread';
import { ResumePanel } from '@/components/shared/ResumePanel';
import StatusIndicator from '@/components/shared/StatusIndicator';
import RevelationTrailPanel, { IREPhaseProgress } from '@/components/shared/RevelationTrailPanel';
import ExportBar from '@/components/shared/ExportBar';
import TransformPanel from '@/components/shared/TransformPanel';
import HumanOversightGate, { OVERSIGHT_GATED_MODULES } from '@/components/shared/HumanOversightGate';
import ContextBudgetBar from '@/components/shared/ContextBudgetBar';
import OutputToolbar from '@/components/shared/OutputToolbar';
import { PromptPreviewChip } from '@/components/shared/ProvenancePanel';
import InjectedAtomsPanel from '@/components/shared/InjectedAtomsPanel';
import SkillAttacher from '@/components/platform/SkillAttacher';
import { SeedControl } from '@/components/shared/SeedControl';
import GapAnalysis from '@/components/modules/GapAnalysis';
import DocumentCreation from '@/components/modules/DocumentCreation';
import SanctionsAdvisory from '@/components/modules/SanctionsAdvisory';
import RegulatoryMonitor from '@/components/modules/RegulatoryMonitor';
import TrainingContent from '@/components/modules/TrainingContent';
import DataManagement from '@/components/modules/DataManagement';
import RiskAssessment from '@/components/modules/RiskAssessment';
import InvestigationSupport from '@/components/modules/InvestigationSupport';
import EngagementProposal from '@/components/modules/EngagementProposal';
import EngagementExecution from '@/components/modules/EngagementExecution';
import ManagementPresentation from '@/components/modules/ManagementPresentation';
import ModelValidation from '@/components/modules/ModelValidation';
import { Play, Square, Send, ChevronDown, ChevronRight, Coins, ShieldCheck, Check, X, Mic, MicOff, Layers, Wrench, Sparkles } from 'lucide-react';
import SmartModelBanner from '@/components/shared/SmartModelBanner';
import { MODELS } from '@/lib/constants';
import { fetchModulePrompt, fetchModuleConfig, fetchSession, fetchCustomModule, fetchModuleDefaults } from '@/lib/api';
import { useConfigStore } from '@/stores/useConfigStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDemoStore } from '@/stores/useDemoStore';
import { demoRestricted } from '@/lib/demo-config';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import type { Message, ThinkingLevel, CreativityLevel } from '@/lib/types';
import DynamicModule from '@/components/modules/DynamicModule';
import { findMissingRequiredInputs, type GuidedInputFieldLike } from '@/lib/guided-input-validation';
import { isErrorMessage } from '@/lib/run-error';
import { taskPlaceholder } from '@/lib/task-placeholder';

const moduleComponents: Record<string, React.ComponentType<{ onInputChange: (inputs: Record<string, unknown>) => void }>> = {
  'gap-analysis': GapAnalysis,
  'document-creation': DocumentCreation,
  'sanctions-advisory': SanctionsAdvisory,
  'regulatory-monitor': RegulatoryMonitor,
  'training-content': TrainingContent,
  'data-management': DataManagement,
  'risk-assessment': RiskAssessment,
  'investigation-support': InvestigationSupport,
  'engagement-proposal': EngagementProposal,
  'engagement-execution': EngagementExecution,
  'management-presentation': ManagementPresentation,
  'model-validation': ModelValidation,
};

// Module prompts are now loaded from server/prompts/*.md via the API.
// The server's PromptComposer handles all prompt assembly — no inline prompts needed here.

// Wave 6 track H: the levels a stored default may carry (the server re-validates too).
const THINKING_LEVEL_IDS: readonly ThinkingLevel[] = ['quick', 'think', 'think_hard', 'investigate', 'plan_first', 'deep_investigate'];
const CREATIVITY_LEVEL_IDS: readonly CreativityLevel[] = ['strict', 'balanced', 'creative'];
const isThinkingLevel = (v: unknown): v is ThinkingLevel => typeof v === 'string' && (THINKING_LEVEL_IDS as readonly string[]).includes(v);
const isCreativityLevel = (v: unknown): v is CreativityLevel => typeof v === 'string' && (CREATIVITY_LEVEL_IDS as readonly string[]).includes(v);
/** A guided value nobody has filled yet — the only kind a profile prefill may replace. */
const isEmptyGuidedValue = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

// GOV-06: Non-editable compliance guardrail appended to all FCP module prompts.
const FCP_COMPLIANCE_GUARDRAIL = `**IMPORTANT LIMITATION — NON-NEGOTIABLE**
You do NOT make compliance decisions, give legal advice, or replace professional judgment.
You provide analysis, structured information, and decision support to human experts who retain full professional responsibility for all compliance and legal conclusions.
Every output must include appropriate caveats where decisions depend on facts or legal interpretation not visible in this analysis.`;

export default function ModulePage() {
  const { t, i18n } = useTranslation();
  const { moduleId } = useParams<{ moduleId: string }>();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');
  const module = MODULES.find((m) => m.id === moduleId);
  const isCustomModule = moduleId?.startsWith('custom-') ?? false;
  const [customModuleLabel, setCustomModuleLabel] = useState<string | null>(null);
  // null = not yet checked (or not applicable), true = exists via API, false = not found
  const [isDynamicModule, setIsDynamicModule] = useState<boolean | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dynamicCfg, setDynamicCfg] = useState<Record<string, any> | null>(null);

  const {
    sessionId,
    thinking, creativity, precision, model, systemPrompt, selectedOutputFormats, knowledgeSources, moduleInputs,
    selectedPersonas, selectedSkills, multiPerspective, metaCognitiveEnabled, structureReference,
    referenceOutput,
    guidedInputFields, transparencyLevel, writingTone, emojiEnabled, nativeReasoningEnabled, atomInjectionEnabled, atomCollectionEnabled,
    lastCachedTokens, lastCacheCreationTokens, seed,
    setModule, setThinking, setCreativity, setPrecision, setModel, setSystemPrompt,
    setSelectedOutputFormats, setKnowledgeSources, setModuleInputs, clearSession,
    setSelectedPersonas, setSelectedSkills, setMultiPerspective, setMetaCognitiveEnabled, setStructureReference,
    setReferenceOutput,
    areaId, uploadedFileIds, setUploadedFileIds, setAreaId, setGuidedInputFields, setTransparencyLevel,
    setWritingTone, setEmojiEnabled, setNativeReasoningEnabled, setAtomInjectionEnabled, setAtomCollectionEnabled, restoreSession,
    truncateMessagesAt,
    audience, channel, outputLanguage,
    setAudience, setChannel, setOutputLanguage, setSeed,
    deliberationEnabled, setDeliberationEnabled,
    setPlainTextMode, setMultiAgentEnabled,
    plainTextMode,
    isAssemblingContext, lastSourcesUsed, lastContextUsed,
  } = useSessionStore();

  const { runMessage, stopStreaming, isStreaming, streamingText, streamingThinking, messages, lastInputTokens, lastOutputTokens, ireChainId, ireCurrentPhase, ireTotalPhases, ireCurrentPhaseName } = useClaude();
  const { files, upload, remove } = useFileUpload();
  const { doExport, isExporting } = useExport();
  const { isListening, transcript, startListening, stopListening, isSupported: isSpeechSupported } = useSpeechRecognition();
  // Public demo (DEMO_MODE=true): a visitor reaches only the Work routes
  // (server/middleware/demo-mode.ts WORK_ROUTES). What would call anything else
  // — deliberation, the Risk Atlas, the Trades / PE-VC templates, local folders,
  // prompt versions — is not offered to them. Admins keep everything.
  const demoLimited = demoRestricted(useDemoStore((s) => s.config), useAuthStore((s) => s.user?.role));
  const deliberationOn = deliberationEnabled && !demoLimited;

  // Per-message config snapshot for "How ANTON Thought" accuracy on old sessions
  const lastAssistantConfigSnapshot = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    return last?.configSnapshot ?? null;
  }, [messages]);

  const [userInput, setUserInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSources, setShowSources] = useState(false); // ATTR-05
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [bannerDismissedAtLength, setBannerDismissedAtLength] = useState(0);
  const [showReframePicker, setShowReframePicker] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<'draft' | 'reviewed' | 'approved'>('draft');
  const [reviewedBy, setReviewedBy] = useState<string | null>(null);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [reviewUpdating, setReviewUpdating] = useState(false);
  const [suggestedSkillsDismissed, setSuggestedSkillsDismissed] = useState(false);
  // Skills this module's module.json recommends (`recommendedSkills`), read from
  // the config the server serves. Only ids the skill catalogue actually has are
  // offered — the banner never attaches an id the resolver would drop.
  const [moduleRecommendedSkills, setModuleRecommendedSkills] = useState<string[]>([]);
  const { skills: skillCatalog } = useSkillCatalog();
  const suggestedSkills = useMemo(
    () => moduleRecommendedSkills.filter((id) => skillCatalog.some((s) => s.id === id)),
    [moduleRecommendedSkills, skillCatalog],
  );
  const [suggestedLibraryEntries, setSuggestedLibraryEntries] = useState<KnowledgeLibraryEntry[]>([]);
  const [activePacks, setActivePacks] = useState<Array<{ display_name: string; entity_count: number; relationship_count: number }>>([]);
  const [myWayActive, setMyWayActive] = useState(false);
  // Showcase example ("Try an example" chip) — exampleInput fills the task box,
  // exampleValues (keyed by guided-input id) pre-fills the guided form.
  const [moduleExample, setModuleExample] = useState<{ input: string; values?: Record<string, unknown> } | null>(null);
  const [exampleUsed, setExampleUsed] = useState(false);
  // Wave 6 track H: the profile drives the defaults. `lastSettingsApplied`
  // shows the one-line note once the user's last-used formats / thinking /
  // creativity for this module replaced the catalogue defaults; it clears the
  // moment they change any of the three. `jurisdictionPack` is the pack the
  // profile's jurisdiction attached by itself — removable, and once removed
  // never re-added in the same session (the dismissed ref).
  const [lastSettingsApplied, setLastSettingsApplied] = useState(false);
  const [jurisdictionPack, setJurisdictionPack] = useState<{ id: string; name: string } | null>(null);
  const userTouchedConfigRef = useRef(false);
  const jurisdictionPackDismissedRef = useRef(false);
  const markConfigTouched = () => {
    userTouchedConfigRef.current = true;
    setLastSettingsApplied(false);
  };
  const [learnOffered, setLearnOffered] = useState(false);
  const [learnSaving, setLearnSaving] = useState(false);
  const [learnDone, setLearnDone] = useState(false);

  // ── Wave 0 track C: required guided inputs are enforced, not decorated ──
  // `required: true` used to draw a teal asterisk and nothing else, so a run
  // could reach the model with no entity type and no jurisdiction and the
  // model would invent the frame it was never given. The decision of what
  // counts as "missing" is type-aware and lives in one testable place
  // (src/lib/guided-input-validation.ts): `false` on a toggle and `0` on a
  // number are answers, and a field whose type the renderer cannot draw is
  // never enforced — it cannot be filled, so blocking on it would only make
  // the module unrunnable.
  const [runBlockedOnInputs, setRunBlockedOnInputs] = useState(false);
  const warnedUnanswerableRef = useRef<Set<string>>(new Set());
  const noteUnanswerableField = useCallback((field: GuidedInputFieldLike) => {
    if (!(typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV)) return;
    const key = `${moduleId ?? ''}:${field.id}:${field.type}`;
    if (warnedUnanswerableRef.current.has(key)) return;
    warnedUnanswerableRef.current.add(key);
    console.warn(
      `[ModulePage] guided input "${field.id}" is required but type "${field.type}" has no renderer (or no options) — not enforced.`,
    );
  }, [moduleId]);
  const missingRequiredInputs = useMemo(
    () => findMissingRequiredInputs(guidedInputFields, moduleInputs, noteUnanswerableField),
    [guidedInputFields, moduleInputs, noteUnanswerableField],
  );

  // Sync completed upload IDs into session store so Claude receives the files.
  // Also depends on uploadedFileIds.length so this re-runs after clearSession() resets
  // the store to [] — ensuring files are re-synced even when the user navigates away
  // and back to the same module (which calls clearSession again).
  // Fetch active knowledge packs once for the context indicator
  useEffect(() => {
    fetch('/api/knowledge-packs', { headers: { Authorization: `Bearer ${localStorage.getItem('openexpert-token')}` } })
      .then((r) => r.ok ? r.json() : { packs: [] })
      .then((d) => setActivePacks((d.packs || []).filter((p: { status: string }) => p.status === 'active')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const completedIds = files.filter((f) => f.status === 'done').map((f) => f.id);
    setUploadedFileIds(completedIds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, uploadedFileIds.length, setUploadedFileIds]);

  // Auto-save output version when streaming completes + offer learning loop for Trades modules
  const prevIsStreamingRef = useRef<boolean>(false);
  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;
    if (wasStreaming && !isStreaming) {
      const lastMsg = [...messages].reverse().find((m) => m.role === 'assistant');
      // A failed run is not saved as an output version.
      const content = isErrorMessage(lastMsg) ? undefined : lastMsg?.content;
      const entityId = sessionId || moduleId;
      if (content && entityId) {
        fetch(`/api/versions/output/${entityId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            label: `Run at ${new Date().toLocaleTimeString()}`,
          }),
        }).catch(() => {}); // fire-and-forget, don't block UI
      }
      // Feature C: offer learning loop for Trades modules with a process type
      // (its template routes are outside a demo visitor's routes)
      if (content && dynamicCfg?.myWayProcessType && !demoLimited) {
        setLearnOffered(true);
        setLearnDone(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  // Append speech transcript to user input when voice input completes
  useEffect(() => {
    if (transcript) {
      setUserInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  const getAuthHeader = (): Record<string, string> => {
    const token = localStorage.getItem('openexpert-token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // ITEM 4: Skill suggestion banner
  useEffect(() => {
    if (!moduleId) return;
    setModuleRecommendedSkills([]); // the module-load effects below refill it from the served config
    const dismissed = localStorage.getItem(`dismissed-skills-${moduleId}`);
    if (dismissed) { setSuggestedSkillsDismissed(true); return; }
    setSuggestedSkillsDismissed(false);
  }, [moduleId]);

  // ITEM 13: Knowledge library suggestions
  useEffect(() => {
    if (!moduleId) return;
    // The suggestion turns on Local Folders, which a demo visitor does not have.
    if (demoLimited) { setSuggestedLibraryEntries([]); return; }
    const dismissed = localStorage.getItem(`dismissed-lib-suggest-${moduleId}`);
    if (dismissed) return;
    let cancelled = false;
    fetch('/api/knowledge-library', { credentials: 'include', headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then((entries: KnowledgeLibraryEntry[]) => {
        const categories = MODULE_KNOWLEDGE_CATEGORIES[moduleId] ?? [];
        const matches = entries.filter(e => categories.includes(e.category));
        if (matches.length > 0 && !cancelled) setSuggestedLibraryEntries(matches);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, demoLimited]);

  // ITEM 11: Prefill from URL param
  useEffect(() => {
    // NO decodeURIComponent here. URLSearchParams.get() has already decoded the value,
    // so decoding again is a second pass over text that is no longer encoded — and any
    // literal '%' in it then throws URIError and takes the page down.
    //
    // "we lose 30% of the day to formatting" is an entirely ordinary sentence, and it
    // was enough: encode -> '30%25' -> get() -> '30%' -> decodeURIComponent('30%') ->
    // URIError: URI malformed. Latent while prefills were short hand-made strings;
    // reachable the moment Discovery started passing a user's own words through.
    const prefill = searchParams.get('prefill');
    if (prefill) {
      setUserInput(prefill);
    }
  }, [searchParams]);

  // Prefill from Pathfinder ("Use in..." / open_module smart action) —
  // reads the sessionStorage handoff once and clears it.
  useEffect(() => {
    if (searchParams.get('from') !== 'pathfinder') return;
    const piped = sessionStorage.getItem('pathfinder-pipe-text');
    if (!piped) return;
    sessionStorage.removeItem('pathfinder-pipe-text');
    setUserInput(piped);
  }, [searchParams]);

  // Load custom module config from API when moduleId starts with "custom-"
  useEffect(() => {
    if (!isCustomModule || !moduleId) return;
    fetchCustomModule(moduleId).then((cm) => {
      if (!cm) return;
      setCustomModuleLabel(cm.name);
      clearSession();
      setModule(moduleId);
      const cfg = cm.config as Record<string, unknown>;
      if (cfg.thinking) setThinking(cfg.thinking as Parameters<typeof setThinking>[0]);
      if (cfg.creativity) setCreativity(cfg.creativity as Parameters<typeof setCreativity>[0]);
      if (Array.isArray(cfg.outputFormats)) setSelectedOutputFormats(cfg.outputFormats as string[]);
      if (Array.isArray(cfg.personas)) setSelectedPersonas(cfg.personas as string[]);
      if (Array.isArray(cfg.skills)) setSelectedSkills(cfg.skills as string[]);
      if (Array.isArray(cfg.guidedInputs)) setGuidedInputFields(cfg.guidedInputs as Parameters<typeof setGuidedInputFields>[0]);

      // Phase B: auto-load default knowledge library corpora
      const defaultKnowledgeLibraryIds = cfg.defaultKnowledgeLibraryIds as string[] | undefined;
      if (defaultKnowledgeLibraryIds && defaultKnowledgeLibraryIds.length > 0) {
        fetch('/api/knowledge-library')
          .then(r => r.ok ? r.json() : [])
          .then((libraryEntries: Array<{ id: string; path: string; recursive: boolean }>) => {
            const matchedPaths = libraryEntries
              .filter(e => defaultKnowledgeLibraryIds.includes(e.id))
              .map(e => e.path);
            if (matchedPaths.length > 0) {
              setKnowledgeSources({
                ...knowledgeSources,
                modes: {
                  ...knowledgeSources.modes,
                  localFolder: {
                    ...knowledgeSources.modes.localFolder,
                    enabled: true,
                    folderPaths: matchedPaths,
                    recursive: true,
                  },
                },
              });
            }
          })
          .catch(() => {});
      }

      // Phase C: inject reference output into system prompt
      const refOutput = cfg.referenceOutput as string | undefined;
      const basePrompt = cm.system_prompt || '';
      if (refOutput?.trim()) {
        setSystemPrompt(basePrompt + `\n\n## REFERENCE OUTPUT EXAMPLE\nMatch the structure, depth, and formatting of this example:\n<reference>\n${refOutput.trim()}\n</reference>`);
      } else {
        setSystemPrompt(basePrompt);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, isCustomModule]);

  // For modules NOT in the hardcoded MODULES list (e.g. Trades area modules discovered
  // dynamically from server/areas/), check the API to confirm existence and load config.
  useEffect(() => {
    if (!moduleId || module || isCustomModule) {
      setIsDynamicModule(null);
      setDynamicCfg(null);
      return;
    }
    setIsDynamicModule(null);
    fetchModuleConfig(moduleId)
      .then((cfg) => {
        if (cfg) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setDynamicCfg(cfg as Record<string, any>);
          setIsDynamicModule(true);
        } else {
          setIsDynamicModule(false);
        }
      })
      .catch(() => setIsDynamicModule(false));
  }, [moduleId, module, isCustomModule]);

  // Feature B: Check "My Way" setup status for Trades and PE/VC modules
  useEffect(() => {
    if (!dynamicCfg?.myWayProcessType || demoLimited) { setMyWayActive(false); return; }
    const isICMemo = dynamicCfg.myWayProcessType === 'ic-memo';
    const statusEndpoint = isICMemo ? '/api/pe-vc/setup-status' : '/api/trades/setup-status';
    fetch(statusEndpoint, { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then((data: { hasIdentity?: boolean } | null) => setMyWayActive(!!data?.hasIdentity))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicCfg, demoLimited]);

  // Initialize module — runs when moduleId or sessionParam changes
  useEffect(() => {
    if ((!module && isDynamicModule !== true) || !moduleId) return;

    clearSession();
    useStreamStore.getState().resetStreamOutput(); // Clear stale IRE trail from previous module
    setModule(moduleId);
    setSystemPrompt('');
    setSelectedPersonas(['general-assistant']);
    setModuleExample(null);
    setExampleUsed(false);
    setRunBlockedOnInputs(false);

    // Always fetch module prompt + config (needed for guided inputs, areaId, transparency)
    fetchModulePrompt(moduleId).then((prompt) => {
      if (prompt) setSystemPrompt(prompt);
    });

    if (sessionParam) {
      // ── Session Resume ────────────────────────────────────
      fetchModuleConfig(moduleId).then((cfg) => {
        if (!cfg) return;
        if (cfg.areaId) setAreaId(cfg.areaId);
        if (cfg.guidedInputs) setGuidedInputFields(cfg.guidedInputs);
        setModuleRecommendedSkills(readRecommendedSkills(cfg));
      });
      // Restore saved config + conversation history from the DB.
      fetchSession(sessionParam).then((data) => {
        if (!data) return;
        const cfg = typeof data.config === 'string'
          ? (JSON.parse(data.config) as Record<string, unknown>)
          : (data.config as Record<string, unknown> ?? {});

        if (cfg.model) setModel(cfg.model as Parameters<typeof setModel>[0]);
        if (cfg.thinking) setThinking(cfg.thinking as Parameters<typeof setThinking>[0]);
        if (cfg.creativity) setCreativity(cfg.creativity as Parameters<typeof setCreativity>[0]);
        if (Array.isArray(cfg.selectedOutputFormats)) setSelectedOutputFormats(cfg.selectedOutputFormats as string[]);
        // Full config restoration from saved session
        if (Array.isArray(cfg.selectedPersonas) && (cfg.selectedPersonas as string[]).length)
          setSelectedPersonas(cfg.selectedPersonas as string[]);
        if (Array.isArray(cfg.selectedSkills)) setSelectedSkills(cfg.selectedSkills as string[]);
        // The guided answers the session was run with. clearSession() above
        // emptied them, and every follow-up turn re-sends them, so without
        // this a resumed session silently dropped its own frame — and would
        // now also look, to the required-input gate, like nothing was filled.
        if (cfg.moduleInputs && typeof cfg.moduleInputs === 'object' && !Array.isArray(cfg.moduleInputs)) {
          setModuleInputs(cfg.moduleInputs as Record<string, unknown>);
        }
        if (cfg.transparencyLevel !== undefined) setTransparencyLevel(cfg.transparencyLevel as 0 | 1 | 2);
        if (cfg.writingTone) setWritingTone(cfg.writingTone as 'formal' | 'professional' | 'casual' | 'conversational');
        if (cfg.emojiEnabled !== undefined) setEmojiEnabled(cfg.emojiEnabled as boolean);
        if (cfg.nativeReasoningEnabled !== undefined) setNativeReasoningEnabled(cfg.nativeReasoningEnabled as boolean);
        if (cfg.metaCognitiveEnabled !== undefined) setMetaCognitiveEnabled(cfg.metaCognitiveEnabled as boolean);
        if (cfg.multiPerspective !== undefined) setMultiPerspective(cfg.multiPerspective as boolean);
        if (cfg.knowledgeSources) setKnowledgeSources(cfg.knowledgeSources as KnowledgeSourceConfig);
        if (cfg.plainTextMode !== undefined) setPlainTextMode(cfg.plainTextMode as boolean);
        if (cfg.audience) setAudience(cfg.audience as string);
        if (cfg.channel) setChannel(cfg.channel as string);
        if (cfg.outputLanguage) setOutputLanguage(cfg.outputLanguage as string);
        if (cfg.multiAgentEnabled !== undefined) setMultiAgentEnabled(cfg.multiAgentEnabled as boolean);
        // Restore custom system prompt override (module default is already set above)
        if (cfg.systemPrompt) setSystemPrompt(cfg.systemPrompt as string);

        // Map DB rows → Message type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const restored: Message[] = ((data.messages as any[]) || []).map((m) => ({
          id: m.id as string,
          sessionId: (m.session_id as string) ?? data.id,
          role: m.role as 'user' | 'assistant',
          content: m.content as string,
          thinkingContent: (m.thinking_content as string | null) ?? undefined,
          tokenCount: (m.token_count as number | null) ?? undefined,
          createdAt: m.created_at as string,
          configSnapshot: ((m as Record<string, unknown>).config_snapshot as Record<string, unknown> | null) ?? null,
          rerunOf: ((m as Record<string, unknown>).rerun_of as string | null) ?? null,
        }));

        restoreSession(data.id as string, restored);

        // Restore review status from session data
        const d = data as Record<string, unknown>;
        setReviewStatus((d.review_status as 'draft' | 'reviewed' | 'approved') || 'draft');
        setReviewedBy((d.reviewed_by as string) || null);
        setReviewedAt((d.reviewed_at as string) || null);
      });
    } else {
      // Reset review state for new sessions
      setReviewStatus('draft');
      setReviewedBy(null);
      setReviewedAt(null);
      // ── Fresh Module Init — apply defaults ────────────────
      const defaultKS: KnowledgeSourceConfig = {
        modes: {
          claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
          onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'full' },
          localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: true },
          combinedMode: { enabled: false, priority: 'merged', instructions: '' },
        },
      };

      if (module) {
        // Hardcoded module — use constants defaults directly
        setThinking(module.defaults.thinking);
        setCreativity(module.defaults.creativity);
        setSelectedOutputFormats(module.defaults.outputFormats);
        if (module.defaults.knowledgeSources.claudeKnowledge) {
          Object.assign(defaultKS.modes.claudeKnowledge, module.defaults.knowledgeSources.claudeKnowledge);
        }
        if (module.defaults.knowledgeSources.onlineReference) {
          Object.assign(defaultKS.modes.onlineReference, module.defaults.knowledgeSources.onlineReference);
        }
        if (module.defaults.knowledgeSources.localFolder) {
          Object.assign(defaultKS.modes.localFolder, module.defaults.knowledgeSources.localFolder);
        }
        fetchModuleConfig(moduleId).then((cfg) => {
          if (!cfg) return;
          if (cfg.areaId) setAreaId(cfg.areaId);
          if (cfg.guidedInputs) setGuidedInputFields(cfg.guidedInputs);
          setModuleRecommendedSkills(readRecommendedSkills(cfg));
          if (typeof cfg.defaults?.transparencyLevel === 'number') {
            setTransparencyLevel(cfg.defaults.transparencyLevel as 0 | 1 | 2);
          }
          // Showcase example — powers the "Try an example" chip
          if (typeof cfg.exampleInput === 'string' && cfg.exampleInput.trim()) {
            setModuleExample({
              input: cfg.exampleInput,
              values: (cfg as Record<string, unknown>).exampleValues as Record<string, unknown> | undefined,
            });
          }
          // Apply first recommended persona if available
          const personas = (cfg as Record<string, unknown>).recommendedPersonas as string[] | undefined;
          if (Array.isArray(personas) && personas.length > 0) {
            setSelectedPersonas([personas[0]]);
          }
        });
      } else if (dynamicCfg) {
        // API-discovered module (e.g. Trades area) — use defaults from server module.json
        const defs = dynamicCfg.defaults ?? {};
        if (defs.thinking) setThinking(defs.thinking);
        if (defs.creativity) setCreativity(defs.creativity);
        if (Array.isArray(defs.outputFormats)) setSelectedOutputFormats(defs.outputFormats);
        if (dynamicCfg.areaId) setAreaId(dynamicCfg.areaId);
        if (dynamicCfg.guidedInputs) setGuidedInputFields(dynamicCfg.guidedInputs);
        setModuleRecommendedSkills(readRecommendedSkills(dynamicCfg));
        if (typeof defs.transparencyLevel === 'number') {
          setTransparencyLevel(defs.transparencyLevel as 0 | 1 | 2);
        }
        if (defs.knowledgeSources?.claudeKnowledge) {
          Object.assign(defaultKS.modes.claudeKnowledge, defs.knowledgeSources.claudeKnowledge);
        }
        // Showcase example — powers the "Try an example" chip
        if (typeof dynamicCfg.exampleInput === 'string' && dynamicCfg.exampleInput.trim()) {
          setModuleExample({
            input: dynamicCfg.exampleInput,
            values: dynamicCfg.exampleValues as Record<string, unknown> | undefined,
          });
        }
        // Apply first recommended persona if available
        const dynPersonas = (dynamicCfg as Record<string, unknown>).recommendedPersonas as string[] | undefined;
        if (Array.isArray(dynPersonas) && dynPersonas.length > 0) {
          setSelectedPersonas([dynPersonas[0]]);
        }
      }

      setKnowledgeSources(defaultKS);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, sessionParam, isDynamicModule]);

  // Wave 6 track H: the profile drives the defaults. Runs on the same trigger
  // as the init effect above and resolves after it, so the person's last-used
  // settings for this module win over the catalogue defaults — unless they
  // have already touched formats / thinking / creativity in this session.
  // Guided fields the profile can answer (jurisdiction, language,
  // organisation) start filled when still empty; the jurisdiction pack the
  // profile maps to is attached once, as a removable chip. A resumed session
  // carries its own settings and is left alone.
  useEffect(() => {
    if ((!module && isDynamicModule !== true) || !moduleId) return;
    userTouchedConfigRef.current = false;
    jurisdictionPackDismissedRef.current = false;
    setLastSettingsApplied(false);
    setJurisdictionPack(null);
    if (sessionParam) return;

    let cancelled = false;
    fetchModuleDefaults(moduleId).then((res) => {
      if (cancelled || !res) return;

      const { defaults, prefill, jurisdictionSkill } = res;
      if (defaults && !userTouchedConfigRef.current) {
        if (defaults.outputFormats.length > 0) setSelectedOutputFormats(defaults.outputFormats);
        if (isThinkingLevel(defaults.thinking)) setThinking(defaults.thinking);
        if (isCreativityLevel(defaults.creativity)) setCreativity(defaults.creativity);
        setLastSettingsApplied(true);
      }

      // Read the live store, not the render closure: the init effect reset it in between.
      const currentInputs = useConfigStore.getState().moduleInputs;
      const filled: Record<string, unknown> = { ...currentInputs };
      let changed = false;
      for (const [fieldId, value] of Object.entries(prefill)) {
        if (!isEmptyGuidedValue(currentInputs[fieldId])) continue;
        filled[fieldId] = value;
        changed = true;
      }
      if (changed) setModuleInputs(filled);

      if (jurisdictionSkill && !jurisdictionPackDismissedRef.current) {
        const currentSkills = useConfigStore.getState().selectedSkills;
        if (!currentSkills.includes(jurisdictionSkill.id)) setSelectedSkills([...currentSkills, jurisdictionSkill.id]);
        setJurisdictionPack(jurisdictionSkill);
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, sessionParam, isDynamicModule]);

  // ── Redirect coding modules to their dedicated pages ─────────────────
  const codingRouteMap: Record<string, string> = {
    'code-review-explain': '/coding/review',
    'script-lite': '/coding/script-lite',
    'script-medium': '/coding/script-medium',
    'coding-large-discovery': '/coding/large',
    'coding-large-architecture': '/coding/large',
    'coding-large-implementation': '/coding/large',
  };
  if (moduleId && codingRouteMap[moduleId]) {
    const target = sessionParam
      ? `${codingRouteMap[moduleId]}?session=${sessionParam}`
      : codingRouteMap[moduleId];
    return <Navigate to={target} replace />;
  }

  // API-discovered module still loading
  if (!module && !isCustomModule && isDynamicModule === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-adv-gray text-sm">Loading...</span>
      </div>
    );
  }

  // Not found in hardcoded list and not found via API
  if (!module && !isCustomModule && isDynamicModule === false) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-adv-gray">{t('module.moduleNotFound')}</p>
      </div>
    );
  }

  const ModuleInputs = module ? moduleComponents[module.id] : null;
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  // A failed run's bubble is shown in the thread but is not output: no export,
  // transform, review, approval or learning loop acts on it.
  const lastRunFailed = !isStreaming && isErrorMessage(lastAssistantMessage);
  const outputContent = isStreaming ? streamingText : (lastRunFailed ? '' : (lastAssistantMessage?.content || ''));
  const exportFormats = getRecommendedExportFormats(selectedOutputFormats);

  // The required-input gate applies to the opening run only. That is the turn
  // that sets the frame, and a session restored from history can carry answers
  // this client never saw (sessions written before guided inputs were part of
  // the saved config) — those must not be blocked from continuing.
  const blockingInputs = messages.length === 0 ? missingRequiredInputs : [];
  const showMissingInputsNotice = runBlockedOnInputs && blockingInputs.length > 0;

  const handleRun = () => {
    if (!userInput.trim()) return;
    if (blockingInputs.length > 0) {
      setRunBlockedOnInputs(true);
      return;
    }
    setRunBlockedOnInputs(false);
    setLearnOffered(false);
    setLearnDone(false);
    runMessage(userInput.trim());
    setUserInput('');
  };

  const handleEditMessage = (msg: Message) => {
    truncateMessagesAt(msg.id);
    setUserInput(msg.content);
  };

  // Feature C: Learn from output — extract template pattern and update default
  const handleLearnFromOutput = async () => {
    if (!outputContent || !dynamicCfg?.myWayProcessType) return;
    const processType = dynamicCfg.myWayProcessType as string;
    const isICMemo = processType === 'ic-memo';
    setLearnSaving(true);
    try {
      if (isICMemo) {
        // PE/VC IC memo learning — extract structure and save as default template
        const extractRes = await fetch('/api/pe-vc/templates/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ text: outputContent, memoType: 'full-ic-memo' }),
        });
        if (!extractRes.ok) throw new Error('Extract failed');
        const extracted = await extractRes.json() as Record<string, unknown>;
        const sections = (extracted.sections as Array<{ description?: string; label?: string }> | undefined) || [];
        const templateContent = sections.map((s) => `### ${s.label || ''}\n${s.description || ''}`).join('\n\n');
        await fetch('/api/pe-vc/templates/new', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({
            name: 'My IC Memo template',
            memoType: 'full-ic-memo',
            templateContent,
            sectionOrder: extracted.sectionOrder || [],
            styleNotes: JSON.stringify(extracted.style || {}),
            isDefault: true,
          }),
        });
      } else {
        // Trades document learning
        const docTypeMap: Record<string, string> = {
          invoicing: 'invoice',
          quoting: 'quote',
          communicating: 'message',
        };
        const docType = docTypeMap[processType] ?? processType;
        const extractRes = await fetch('/api/trades/templates/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ text: outputContent, documentType: docType }),
        });
        if (!extractRes.ok) throw new Error('Extract failed');
        const extracted = await extractRes.json() as Record<string, unknown>;
        await fetch(`/api/trades/templates/default-${docType}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({
            documentType: docType,
            name: `My ${docType} template`,
            templateData: extracted,
            isDefault: true,
            sourceExamples: [{ rawText: outputContent.slice(0, 2000), extractedAt: new Date().toISOString() }],
          }),
        });
      }
      setLearnOffered(false);
      setLearnDone(true);
    } catch {
      // non-fatal — just dismiss
      setLearnOffered(false);
    } finally {
      setLearnSaving(false);
    }
  };

  const handleReframe = () => {
    setShowReframePicker((prev) => !prev);
  };

  const handleReframeSelect = (reframeAudience: string) => {
    setShowReframePicker(false);
    const labels: Record<string, string> = {
      board: 'Board',
      customer: 'Customer',
      employee: 'Employee',
      technical: 'Technical',
    };
    const label = labels[reframeAudience] || reframeAudience;
    runMessage(`Reframe the above output for a ${label} audience. Keep the same factual content but adapt the language, structure, and emphasis accordingly.`);
  };

  const handleReviewStatusChange = async (newStatus: 'reviewed' | 'approved') => {
    if (!sessionId) return;
    setReviewUpdating(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/review-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setReviewStatus(newStatus);
        setReviewedAt(new Date().toISOString());
      }
    } catch {
      // Silent fail
    } finally {
      setReviewUpdating(false);
    }
  };

  // WP-13: Pre-run cost estimate (client-side, chars÷4 heuristic, Euro-primary display)
  const USD_TO_EUR = 0.92;
  const modelInfo = MODELS.find((m) => m.id === model);
  const estimatedInputTokens = Math.round(
    (systemPrompt.length + messages.reduce((sum, m) => sum + m.content.length, 0) + userInput.length) / 4
  );
  const estimatedOutputTokens = model === 'claude-opus-5-5' || model === 'claude-opus-4-8' ? 8000 : 4000;
  const estimatedCostUsd = modelInfo
    ? (estimatedInputTokens / 1_000_000) * modelInfo.inputCostPer1M +
      (estimatedOutputTokens / 1_000_000) * modelInfo.outputCostPer1M
    : 0;
  const estimatedCostEur = estimatedCostUsd * USD_TO_EUR;
  const euroCostDisplay =
    estimatedCostEur < 0.005
      ? '<€0.01'
      : estimatedCostEur < 1
      ? `~€${estimatedCostEur.toFixed(2)}`
      : `~€${estimatedCostEur.toFixed(1)}`;

  return (
    <div className="flex h-full flex-col gap-6 md:flex-row">
      {/* Left: Configuration Panel */}
      <div className="w-full shrink-0 overflow-auto pr-2 md:w-[340px] lg:w-[420px]">
        <div className="space-y-5">
          {/* Module Header */}
          <div>
            <h1 className="text-xl font-bold text-adv-white">{module?.label ?? customModuleLabel ?? dynamicCfg?.label ?? moduleId}</h1>
            {(module?.description || dynamicCfg?.description) && <p className="mt-1 text-xs text-adv-gray">{module?.description ?? dynamicCfg?.description}</p>}
            {isCustomModule && !module && (
              <span className="mt-1 inline-block rounded-full bg-adv-teal/10 border border-adv-teal/20 px-2 py-0.5 text-xs text-adv-teal">
                {t('module.customModule')}
              </span>
            )}
            {myWayActive && (
              <a
                href={typeof dynamicCfg?.myWayHubPath === 'string' ? dynamicCfg.myWayHubPath : '/trades'}
                className="mt-1 inline-flex items-center gap-1 text-xs text-adv-gold hover:underline"
              >
                <Wrench size={10} /> My way active
              </a>
            )}
          </div>

          {/* ONBOARD-02: First-run gap analysis walkthrough */}
          <GapAnalysisWalkthrough moduleId={moduleId ?? ''} model={model} />

          {/* Risk Atlas migration banner — surfaces on legacy FCP modules that overlap with the seven-stage methodology */}
          {!demoLimited && <AtlasMigrationBanner moduleId={moduleId} areaId={areaId ?? undefined} />}

          {/* Healthcare / medical disclaimer (LEGAL-03) */}
          {(areaId === 'healthcare' || areaId === 'community-health') && (
            <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/10 px-3 py-2 text-xs text-adv-gold">
              <strong>Medical information only — not clinical advice.</strong> AI output may contain errors. Always consult a qualified healthcare professional for diagnosis, treatment, or medication decisions.
            </div>
          )}

          {/* Rights / consumer disclaimer — the same gate as the medical banner above,
              for the areas where the user is acting on a deadline or on their own money.
              This is the SAME set the server prompt layer reads
              (RIGHTS_GUARDRAIL_AREAS in prompt-builder.ts re-exports it), so an area
              cannot get the banner without the prompt boundary or the reverse. Note
              'consumer-rights' is the area.json id of the consumer-protection directory. */}
          {RIGHTS_DISCLAIMER_AREAS.has(areaId ?? '') && (
            <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/10 px-3 py-2 text-xs text-adv-gold">
              <strong>General information — not legal or financial advice.</strong> AI output may contain errors. Rules and deadlines differ by country and region, and some rights are lost once a time limit passes — check anything time-critical with a local adviser, legal aid service, union, or the relevant authority.
            </div>
          )}

          {/* AI Controls */}
          <ThinkingControls value={thinking} onChange={(level) => { markConfigTouched(); setThinking(level); }} onAutoAdjust={setThinking} model={model} />
          <ModelSelector value={model} onChange={setModel} />

          {/* Model recommendation (Wave 3.7) — provider-aware suggestion with apply-on-click */}
          <ModelRecommendationBadge
            moduleId={moduleId}
            thinkingLevel={thinking}
            outputFormats={selectedOutputFormats}
            areaId={areaId ?? undefined}
            currentModel={model}
            onModelSelect={(m) => setModel(m as Parameters<typeof setModel>[0])}
          />

          {/* Module-specific guided inputs (JSON-driven via DynamicModule) */}
          {guidedInputFields.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-adv-off-white">{t('module.moduleSettings')}</div>
                {/* Quiet before the click, red once a run was actually blocked. */}
                {blockingInputs.length > 0 && (
                  <span
                    className={`shrink-0 text-xs ${runBlockedOnInputs ? 'text-adv-red' : 'text-adv-gray'}`}
                    aria-live="polite"
                  >
                    {blockingInputs.length === 1
                      ? t('module.requiredInputsRemainingOne', '1 required field to fill')
                      : t('module.requiredInputsRemaining', '{{count}} required fields to fill', { count: blockingInputs.length })}
                  </span>
                )}
              </div>
              <DynamicModule
                fields={guidedInputFields}
                values={moduleInputs}
                onChange={setModuleInputs}
                missingFieldIds={showMissingInputsNotice ? blockingInputs.map((f) => f.id) : undefined}
              />
            </div>
          ) : ModuleInputs ? (
            <div>
              <div className="mb-2 text-sm font-medium text-adv-off-white">{t('module.moduleSettings')}</div>
              <ModuleInputs onInputChange={setModuleInputs} />
            </div>
          ) : null}

          {/* File Upload */}
          <FileUploader files={files} onUpload={upload} onRemove={remove} />

          {/* User Input + Run */}
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-adv-off-white">
                  {messages.length === 0 ? t('module.describeTask') : t('module.followUp')}
                </label>
                {/* "Try an example" chip — fills the task box (+ guided inputs) with the module's worked example */}
                {moduleExample && !exampleUsed && messages.length === 0 && !userInput.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserInput(moduleExample.input);
                      if (moduleExample.values) setModuleInputs(moduleExample.values);
                      setExampleUsed(true);
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-adv-teal/30 bg-adv-teal/10 px-2.5 py-1 text-[11px] font-medium text-adv-teal transition-colors hover:bg-adv-teal/20"
                    title={t('module.tryExampleHint', 'Fill the inputs with a realistic worked example')}
                  >
                    <Sparkles className="h-3 w-3" />
                    {t('module.tryExample', 'Try an example')}
                  </button>
                )}
              </div>
              <div className="relative">
                <textarea
                  value={userInput}
                  onChange={(e) => {
                    const newVal = e.target.value;
                    // Reset banner dismissed state when input changes significantly (>20 chars diff)
                    if (bannerDismissed && Math.abs(newVal.length - bannerDismissedAtLength) > 20) {
                      setBannerDismissed(false);
                    }
                    setUserInput(newVal);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleRun();
                    }
                  }}
                  placeholder={
                    messages.length === 0
                      ? taskPlaceholder({
                          example: moduleExample?.input,
                          moduleLabel: module?.label ?? customModuleLabel ?? dynamicCfg?.label ?? null,
                          neutral: (label) => t('module.taskPlaceholderFor', { module: label }),
                          legacy: t('module.describeTaskPlaceholder'),
                          neutralTranslated: i18n.getResource(i18n.resolvedLanguage || i18n.language, 'translation', 'module.taskPlaceholderFor') !== undefined,
                        })
                      : t('module.followUpPlaceholder')
                  }
                  className="w-full rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal"
                  rows={4}
                />
                {isSpeechSupported && (
                  <button
                    type="button"
                    onClick={isListening ? stopListening : startListening}
                    className={`absolute right-3 bottom-3 p-1.5 rounded-lg transition-colors ${
                      isListening
                        ? 'text-adv-red animate-pulse'
                        : 'text-adv-gray hover:text-adv-teal'
                    }`}
                    title={isListening ? t('module.stopRecording') : t('module.voiceInput')}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            {/* Context budget — live token breakdown */}
            <ContextBudgetBar
              systemPrompt={systemPrompt}
              userInput={userInput}
              history={messages.map((m) => ({ role: m.role, content: m.content }))}
              model={model}
            />

            {/* Smart Model Banner — only shown when user has typed something and there's a cheaper suggestion */}
            {userInput.trim().length > 10 && !bannerDismissed && (
              <SmartModelBanner
                userInput={userInput}
                currentModel={model}
                onSwitchModel={(m) => {
                  setModel(m as Parameters<typeof setModel>[0]);
                  setBannerDismissed(true);
                  setBannerDismissedAtLength(userInput.length);
                }}
                onDismiss={() => {
                  setBannerDismissed(true);
                  setBannerDismissedAtLength(userInput.length);
                }}
              />
            )}

            {/* Wave 0 track C — the run was held back because the module's own
                required inputs are unanswered. Named by label, never by id. */}
            {showMissingInputsNotice && (
              <div
                role="alert"
                className="rounded-lg border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-xs text-adv-red"
              >
                <p className="font-medium">
                  {t('module.requiredInputsTitle', 'Fill these module settings before running')}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {blockingInputs.map((f) => (
                    <li key={f.id}>{f.label}</li>
                  ))}
                </ul>
                <p className="mt-1.5 opacity-80">
                  {t('module.requiredInputsWhy', 'Left empty, the model has to assume them — and the output would record the assumption as its basis.')}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
              {isStreaming ? (
                <button
                  onClick={stopStreaming}
                  className="flex items-center gap-2 rounded-lg bg-adv-red px-4 py-2.5 text-sm font-medium text-white hover:bg-adv-red/80 transition-colors"
                >
                  <Square className="h-4 w-4" />
                  {t('module.stop')}
                </button>
              ) : (
                <button
                  onClick={handleRun}
                  disabled={!userInput.trim()}
                  className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {messages.length === 0 ? (
                    <>
                      <Play className="h-4 w-4" />
                      {t('module.runAnalysis')}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      {t('module.send')}
                    </>
                  )}
                </button>
              )}
              {/* Wave 1: the prompt a run would carry right now — same fields as Run, composed server-side */}
              <PromptPreviewChip
                disabled={isStreaming}
                config={{
                  model, thinking, creativity, precision, moduleId, areaId: areaId ?? undefined, systemPrompt,
                  selectedOutputFormats, plainTextMode, selectedPersonas, selectedSkills, multiPerspective,
                  metaCognitiveEnabled, structureReference, referenceOutput, transparencyLevel, writingTone,
                  emojiEnabled, nativeReasoningEnabled, atomInjectionEnabled, audience, channel, outputLanguage,
                  knowledgeSources: knowledgeSources as unknown as Record<string, unknown>,
                  uploadedFileIds, sessionId, userMessage: userInput,
                }}
              />
              </div>
              {/* Cost estimate (TOKEN-04) — shown before run whenever context is non-trivial */}
              {!isStreaming && estimatedInputTokens > 200 && (
                <div className={`flex items-center gap-1 text-[11px] ${estimatedInputTokens > 50000 ? 'text-adv-gold' : 'text-adv-gray'}`}>
                  <Coins className="h-3 w-3" />
                  <span>
                    ~{estimatedInputTokens.toLocaleString()} tokens · {euroCostDisplay}
                    {estimatedInputTokens > 50000 && (
                      <span className="ml-1 font-medium">· {t('module.approachingLimit')}</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
          {/* AI disclaimer (LEGAL-02) */}
          <p className="px-1 text-xs text-adv-gray leading-snug">
            AI-generated output — not legal or compliance advice. Verify independently.
          </p>

          {/* Everything that tunes a run but is not needed to start one sits below
              Run: the task box used to be ~3,300 px down the page, under a dozen
              panels (2026-09-22 Work QA). Nothing here was removed. */}
          <div className="border-t border-border pt-4 text-xs font-semibold uppercase tracking-wide text-adv-gray">
            {t('module.moreSettings', 'More settings')}
          </div>

          {/* Precision (temperature control across providers) */}
          <PrecisionSelector value={precision} onChange={setPrecision} />

          {/* Writing Style Panel (replaces bare CreativitySlider) */}
          <WritingStylePanel
            creativity={creativity}
            onCreativityChange={(level) => { markConfigTouched(); setCreativity(level); }}
            selectedPersonas={selectedPersonas}
            onSelectedPersonasChange={setSelectedPersonas}
            multiPerspective={multiPerspective}
            onMultiPerspectiveChange={setMultiPerspective}
            metaCognitiveEnabled={metaCognitiveEnabled}
            onMetaCognitiveChange={setMetaCognitiveEnabled}
          />

          {/* Multi-Agent Mode */}
          <MultiAgentPanel />

          {/* Multi-Model Deliberation */}
          {!demoLimited && (
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-adv-teal" />
                  <h3 className="text-sm font-semibold text-adv-off-white">Deliberation Mode</h3>
                </div>
                <button
                  onClick={() => setDeliberationEnabled(!deliberationEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    deliberationEnabled ? 'bg-adv-teal' : 'bg-adv-gray-med/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      deliberationEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {deliberationEnabled && (
                <p className="mt-2 text-xs text-adv-gold">
                  Opus + Sonnet + Haiku analyse in parallel · ~3× cost · Agreement-scored synthesis
                </p>
              )}
            </div>
          )}

          {/* Session Toggles: Writing Tone, Emoji, Structured Reasoning, Transparency */}
          <SessionTogglesPanel
            writingTone={writingTone}
            emojiEnabled={emojiEnabled}
            metaCognitiveEnabled={metaCognitiveEnabled}
            transparencyLevel={transparencyLevel}
            nativeReasoningEnabled={nativeReasoningEnabled}
            atomInjectionEnabled={atomInjectionEnabled}
            atomCollectionEnabled={atomCollectionEnabled}
            currentModel={model}
            onWritingToneChange={setWritingTone}
            onEmojiChange={setEmojiEnabled}
            onMetaCognitiveChange={setMetaCognitiveEnabled}
            onTransparencyChange={setTransparencyLevel}
            onNativeReasoningChange={setNativeReasoningEnabled}
            onAtomInjectionChange={setAtomInjectionEnabled}
            onAtomCollectionChange={setAtomCollectionEnabled}
          />

          {/* Injected Knowledge Atoms */}
          <InjectedAtomsPanel sessionId={sessionId} />

          {/* Session conclusion — written after each answer; mounted whenever a session exists */}
          <ResumePanel sessionId={sessionId} />

          {/* Skills */}
          {moduleId && !suggestedSkillsDismissed && suggestedSkills.length > 0 && selectedSkills.filter((id) => id !== jurisdictionPack?.id).length === 0 && (
            <div className="mb-2 px-3 py-2 bg-adv-teal/10 border border-adv-teal/30 rounded flex items-center justify-between gap-2">
              <span className="text-xs text-adv-teal">
                Suggested for this module: {suggestedSkills.map((id) => skillCatalog.find((s) => s.id === id)?.name ?? id).join(', ')} — Apply?
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedSkills([...new Set([...selectedSkills, ...suggestedSkills])])}
                  className="text-xs px-2 py-0.5 bg-adv-teal text-adv-dark rounded hover:bg-adv-teal-dark"
                >
                  Apply
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem(`dismissed-skills-${moduleId}`, '1');
                    setSuggestedSkillsDismissed(true);
                  }}
                  className="text-adv-gray hover:text-adv-off-white text-xs"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          {jurisdictionPack && selectedSkills.includes(jurisdictionPack.id) && (
            <div className="mb-2" role="status">
              <span className="inline-flex items-center gap-2 rounded-full border border-adv-teal/30 bg-adv-teal/10 px-3 py-1 text-sm text-adv-teal">
                Jurisdiction pack: {jurisdictionPack.name}
                <button
                  type="button"
                  aria-label={`Remove jurisdiction pack ${jurisdictionPack.name}`}
                  title="Remove for this session"
                  onClick={() => {
                    jurisdictionPackDismissedRef.current = true;
                    setSelectedSkills(selectedSkills.filter((id) => id !== jurisdictionPack.id));
                    setJurisdictionPack(null);
                  }}
                  className="rounded-full p-0.5 text-adv-teal hover:bg-adv-teal/20 hover:text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-adv-teal"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            </div>
          )}
          <SkillAttacher selected={selectedSkills} onChange={setSelectedSkills} />

          {/* Knowledge Sources */}
          <KnowledgeSourcePanel config={knowledgeSources} onChange={setKnowledgeSources} />
          {activePacks.length > 0 && (
            <div className="mt-1 px-3 py-2 bg-adv-teal-soft border border-adv-teal/20 rounded flex items-start gap-2">
              <span className="text-adv-teal mt-0.5 flex-shrink-0">⚡</span>
              <span className="text-xs text-adv-off-white">
                <span className="text-adv-teal font-medium">{activePacks.length === 1 ? activePacks[0].display_name : `${activePacks.length} regulatory packs`}</span>{' '}
                active —{' '}
                {activePacks.reduce((s, p) => s + p.entity_count, 0).toLocaleString()} entities and{' '}
                {activePacks.reduce((s, p) => s + p.relationship_count, 0).toLocaleString()} relationships available to the model.
              </span>
            </div>
          )}
          {suggestedLibraryEntries.length > 0 && (
            <div className="mt-2 px-3 py-2 bg-adv-teal-soft border border-adv-teal/20 rounded flex items-start justify-between gap-2">
              <span className="text-xs text-adv-off-white">
                {suggestedLibraryEntries.length} knowledge corpus {suggestedLibraryEntries.length === 1 ? 'entry' : 'entries'} available for this module. Load suggested sources?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const paths = suggestedLibraryEntries.map(e => e.path).filter(Boolean);
                    if (paths.length > 0) {
                      setKnowledgeSources({
                        ...knowledgeSources,
                        modes: {
                          ...knowledgeSources.modes,
                          localFolder: {
                            ...knowledgeSources.modes.localFolder,
                            enabled: true,
                            folderPaths: [...new Set([...(knowledgeSources.modes.localFolder?.folderPaths ?? []), ...paths])],
                          },
                        },
                      });
                    }
                    setSuggestedLibraryEntries([]);
                  }}
                  className="text-xs px-2 py-0.5 bg-adv-teal text-adv-dark rounded hover:bg-adv-teal-dark"
                >
                  Load
                </button>
                <button
                  onClick={() => {
                    if (moduleId) localStorage.setItem(`dismissed-lib-suggest-${moduleId}`, '1');
                    setSuggestedLibraryEntries([]);
                  }}
                  className="text-adv-gray hover:text-adv-off-white text-xs"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Output Formats */}
          {lastSettingsApplied && (
            <p className="mb-1 text-sm text-adv-gray" role="status" aria-live="polite">
              Using your last settings for this module — change them anytime
            </p>
          )}
          <OutputFormatSelector selected={selectedOutputFormats} onChange={(formats) => { markConfigTouched(); setSelectedOutputFormats(formats); }} />

          {/* Communications Hub */}
          <CommunicationsPanel
            audience={audience}
            channel={channel}
            outputLanguage={outputLanguage}
            onAudienceChange={setAudience}
            onChannelChange={setChannel}
            onOutputLanguageChange={setOutputLanguage}
          />

          {/* Structure Reference (shown when formats selected) */}
          {selectedOutputFormats.length > 0 && (
            <StructureReference value={structureReference} onChange={setStructureReference} />
          )}

          {/* Reference Output — golden example of a high-quality response */}
          {selectedOutputFormats.length > 0 && (
            <ReferenceOutputPanel value={referenceOutput} onChange={setReferenceOutput} />
          )}

          {/* Advanced Settings */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
            >
              {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {t('module.advancedSettings')}
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-4">
                <SeedControl
                  seed={seed}
                  onChange={setSeed}
                  modelSupportsSeed={MODELS.find((m) => m.id === model)?.supportsSeed ?? false}
                />

                <PromptEditor
                  value={systemPrompt}
                  defaultValue={systemPrompt}
                  onChange={setSystemPrompt}
                  // Prompt versions (/versions/prompt) are outside a demo visitor's routes.
                  entityId={demoLimited ? undefined : moduleId}
                  entityType="prompt"
                  lockedSuffix={areaId === 'fcp' ? FCP_COMPLIANCE_GUARDRAIL : undefined}
                />
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Right: Output Panel — single scrollable column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Status — sticky at top */}
        <div className="shrink-0 pb-3">
          <StatusIndicator
            inputTokens={lastInputTokens}
            outputTokens={lastOutputTokens}
            cachedTokens={lastCachedTokens}
            cacheCreationTokens={lastCacheCreationTokens}
            model={model}
            isStreaming={isStreaming}
          />
        </div>

        {/* TOKEN-03: Context assembly progress indicator */}
        {isAssemblingContext && (
          <div className="shrink-0 pb-3">
            <div className="flex items-center gap-2 rounded-lg border border-adv-teal/30 bg-adv-teal-soft px-3 py-2 text-xs text-adv-teal">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Indexing documents and assembling context…
            </div>
          </div>
        )}

        {/* ATTR-05: Sources used collapsible panel */}
        {lastSourcesUsed.length > 0 && !isStreaming && (
          <div className="shrink-0 pb-2">
            <button
              onClick={() => setShowSources(v => !v)}
              className="flex w-full items-center gap-1.5 rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
              aria-expanded={showSources}
            >
              {showSources ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
              <span className="font-medium">Sources used</span>
              <span className="ml-1 rounded-full bg-adv-teal-dim px-1.5 py-0.5 text-xs font-medium text-adv-teal">{lastSourcesUsed.length}</span>
            </button>
            {showSources && (
              <ul className="mt-1 rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-2 space-y-1">
                {lastSourcesUsed.map((src, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-adv-gray">
                    <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-adv-teal" />
                    {src}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Scrollable output area — everything flows naturally */}
        <div className="flex-1 overflow-auto space-y-3">
          {/* Deliberation Panel (replaces conversation thread when enabled) */}
          {deliberationOn && (
            <DeliberationPanel
              config={{
                moduleId: moduleId,
                areaId: areaId ?? undefined,
                systemPrompt,
                creativity,
                thinking,
                transparencyLevel,
                writingTone,
                userMessage: userInput.trim() || 'Please analyse this based on the module context.',
                knowledgeSources,
                sessionId: sessionId ?? undefined,
              }}
              onNewDeliberation={() => {
                /* reset state so user can trigger another run */
              }}
            />
          )}

          {/* IRE phase progress — shown while iterative reasoning is streaming */}
          {isStreaming && ireTotalPhases > 0 && (
            <IREPhaseProgress
              currentPhase={ireCurrentPhase}
              totalPhases={ireTotalPhases}
              currentPhaseName={ireCurrentPhaseName}
            />
          )}

          {/* Conversation (shown when deliberation mode is off) */}
          {!deliberationOn && <div className="rounded-xl border border-border bg-adv-card p-5">
            {messages.length === 0 && !isStreaming ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-adv-gray">{t('module.outputWillAppear')}</p>
                  <p className="mt-1 text-xs text-adv-gray">{t('module.configureAndRun')}</p>
                </div>
              </div>
            ) : (
              <ConversationThread
                messages={messages}
                streamingText={streamingText}
                streamingThinking={streamingThinking}
                isStreaming={isStreaming}
                onEditMessage={handleEditMessage}
                moduleId={moduleId}
              />
            )}
          </div>}

          {/* Export */}
          {outputContent && !isStreaming && (
            <>
              {/* EUAI-02: Human oversight sign-off for high-risk FCP modules */}
              {sessionId && (OVERSIGHT_GATED_MODULES as readonly string[]).includes(moduleId ?? '') && (
                <HumanOversightGate
                  sessionId={sessionId}
                  moduleId={moduleId ?? ''}
                />
              )}
              <ExportBar
              content={outputContent}
              availableFormats={exportFormats.length > 0 ? exportFormats : ['md']}
              onExport={(fmt) => doExport(fmt, outputContent, {
                filename: `${moduleId}-output`,
                moduleId: moduleId ?? undefined,
                model,
                thinking,
                creativity,
                sessionId: sessionId ?? undefined,
                messageId: lastAssistantMessage?.id,
                documentsLoaded: files.filter(f => f.status === 'done').map(f => f.name),
              })}
              isExporting={isExporting}
              sessionId={sessionId ?? undefined}
              onReframe={handleReframe}
              moduleContext={module?.label ?? customModuleLabel ?? moduleId}
              entityId={sessionId ?? moduleId}
              moduleId={moduleId ?? undefined}
            />
            {/* Output Transformation panel — surfaces applicable renderers
                beyond the built-in export formats. Silent when none apply. */}
            <TransformPanel sessionId={sessionId ?? null} />
            {showReframePicker && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-3 py-2">
                <span className="text-xs text-adv-gray">{t('module.reframeFor')}</span>
                {(['board', 'customer', 'employee', 'technical'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => handleReframeSelect(a)}
                    className="rounded-md border border-border bg-adv-dark px-2.5 py-1 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                  >
                    {t(`module.reframe${a.charAt(0).toUpperCase() + a.slice(1)}`)}
                  </button>
                ))}
                <button
                  onClick={() => setShowReframePicker(false)}
                  className="ml-auto text-adv-gray hover:text-adv-off-white transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}

        {/* Feature C: Learning loop — offer to update template from output */}
        {learnOffered && dynamicCfg?.myWayProcessType && !isStreaming && (
          <div className="flex items-center gap-2 rounded-lg border border-adv-gold/30 bg-adv-gold/5 px-3 py-2 text-xs">
            <span className="text-adv-gold">Update your template from this output?</span>
            <button
              onClick={handleLearnFromOutput}
              disabled={learnSaving}
              className="rounded bg-adv-gold px-2 py-0.5 text-xs font-medium text-adv-dark hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {learnSaving ? 'Saving…' : 'Yes, learn from this'}
            </button>
            <button onClick={() => setLearnOffered(false)} className="text-adv-gray hover:text-adv-off-white transition-colors">
              Dismiss
            </button>
          </div>
        )}
        {learnDone && !learnOffered && (
          <div className="flex items-center gap-1.5 rounded-lg border border-adv-green/30 bg-adv-green/5 px-3 py-2 text-xs text-adv-green">
            <Check className="h-3 w-3" /> Template updated
          </div>
        )}

        {/* Human Review Status */}
        {outputContent && !isStreaming && sessionId && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-adv-gray" />
              <span className="text-sm text-adv-gray">{t('module.reviewStatus')}</span>
              {reviewStatus === 'draft' && (
                <span className="inline-flex items-center rounded-full bg-adv-gray/20 px-2.5 py-0.5 text-xs font-medium text-adv-gray">
                  {t('module.draft')}
                </span>
              )}
              {reviewStatus === 'reviewed' && (
                <span className="inline-flex items-center rounded-full bg-adv-blue/20 px-2.5 py-0.5 text-xs font-medium text-adv-blue">
                  {t('module.reviewed')}
                </span>
              )}
              {reviewStatus === 'approved' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-adv-green/20 px-2.5 py-0.5 text-xs font-medium text-adv-green">
                  <Check className="h-3 w-3" />
                  {t('module.approved')}{reviewedAt ? ` on ${new Date(reviewedAt).toLocaleDateString()}` : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {reviewStatus === 'draft' && (
                <button
                  onClick={() => handleReviewStatusChange('reviewed')}
                  disabled={reviewUpdating}
                  className="rounded-md bg-adv-blue/20 px-3 py-1 text-xs text-adv-blue hover:bg-adv-blue/30 transition-colors disabled:opacity-50"
                >
                  {t('module.markReviewed')}
                </button>
              )}
              {(reviewStatus === 'draft' || reviewStatus === 'reviewed') && (
                <button
                  onClick={() => handleReviewStatusChange('approved')}
                  disabled={reviewUpdating}
                  className="rounded-md bg-adv-green/20 px-3 py-1 text-xs text-adv-green hover:bg-adv-green/30 transition-colors disabled:opacity-50"
                >
                  {t('module.approve')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Output Toolbar — Citations, Review, Thinking, Full Prompt, Save */}
        {(outputContent || isStreaming) && (
          <OutputToolbar
            outputContent={outputContent}
            model={model}
            sessionId={sessionId ?? undefined}
            isStreaming={isStreaming}
            streamingThinking={streamingThinking}
            thinkingContent={lastAssistantMessage?.thinkingContent}
            moduleId={moduleId}
            areaId={areaId ?? undefined}
            systemPrompt={systemPrompt}
            creativity={creativity}
            thinking={thinking}
            plainTextMode={plainTextMode}
            selectedPersonas={selectedPersonas}
            selectedSkills={selectedSkills}
            multiPerspective={multiPerspective}
            metaCognitiveEnabled={metaCognitiveEnabled}
            structureReference={structureReference}
            transparencyLevel={transparencyLevel}
            writingTone={writingTone}
            emojiEnabled={emojiEnabled}
            audience={audience}
            channel={channel}
            outputLanguage={outputLanguage}
            knowledgeSources={knowledgeSources as unknown as Record<string, unknown>}
            uploadedFileIds={uploadedFileIds}
            moduleLabel={module?.label ?? customModuleLabel ?? moduleId}
            moduleIcon={module?.icon}
            selectedOutputFormats={selectedOutputFormats}
            knowledgeSourcesRaw={knowledgeSources as unknown as Record<string, unknown>}
            onApplyReview={(reviewText) => {
              runMessage(
                `Based on the following review feedback, please rewrite and improve your previous output. Apply all the suggestions and corrections noted in the review while maintaining the same output format and structure.\n\n--- REVIEW FEEDBACK ---\n${reviewText}`,
                'investigate'
              );
            }}
            onUpgradeThinking={(level) => setThinking(level)}
            configSnapshot={lastAssistantConfigSnapshot}
            sourceManifest={lastSourcesUsed}
            contextUsed={lastContextUsed}
            rerunOf={lastAssistantMessage?.rerunOf ?? null}
          />
        )}
        {/* Revelation Trail — shown after IRE completes */}
        {ireChainId && !isStreaming && (
          <div className="rounded-xl border border-adv-gold/20 bg-adv-card p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-adv-gold">
              <span className="text-adv-gold">⚗</span>
              Reasoning Trail
            </h3>
            <RevelationTrailPanel chainId={ireChainId} />
          </div>
        )}
        </div>{/* end scrollable output area */}
      </div>
    </div>
  );
}
