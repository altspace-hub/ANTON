import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useClaude } from '@/hooks/useClaude';
import { useSessionStore } from '@/stores/useSessionStore';
import { streamMessage, fetchSessions, fetchSession, deleteSession } from '@/lib/api';
import type { KnowledgeSourceConfig, ModelId, ThinkingLevel, CreativityLevel } from '@/lib/types';
import ThinkingControls from '@/components/shared/ThinkingControls';
import ModelSelector from '@/components/shared/ModelSelector';
import KnowledgeSourcePanel from '@/components/shared/KnowledgeSourcePanel';
import OutputFormatSelector from '@/components/shared/OutputFormatSelector';
import WritingStylePanel from '@/components/shared/WritingStylePanel';
import ConversationThread from '@/components/shared/ConversationThread';
import StatusIndicator from '@/components/shared/StatusIndicator';
import FileUploader from '@/components/shared/FileUploader';
import ExportBar from '@/components/shared/ExportBar';
import OutputToolbar from '@/components/shared/OutputToolbar';
import SkillAttacher from '@/components/platform/SkillAttacher';
import SessionTogglesPanel from '@/components/shared/SessionTogglesPanel';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useExport } from '@/hooks/useExport';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { Send, Square, Trash2, ChevronDown, ChevronRight, Copy, Check, Sparkles, Loader2, X, ArrowRight, Coins, Zap, Users, Mic, MicOff, Plus, MessageSquare, Clock } from 'lucide-react';
import { MODELS } from '@/lib/constants';
import { EXPERT_ROLES } from '@/lib/expert-roles';
import type { Message } from '@/lib/types';

const DEFAULT_SYSTEM_PROMPT = `You are Anton, a knowledgeable AI assistant. You provide thorough, well-structured analysis across any topic. You are professional, precise, and helpful. You can assist with questions, analysis, document review, brainstorming, and more. When working with specialised domains, you adapt your depth and terminology accordingly.`;

const IMPROVE_ANALYZE_PROMPT = `You are a prompt engineering expert helping Financial Crime Prevention consultants write better prompts for an AI assistant.

Analyze the user's draft prompt and ask exactly 5 concise clarifying questions to help create a more effective, detailed prompt. Your questions should help understand:

1. What expert role or persona the AI should adopt (e.g., senior AML advisor, sanctions specialist, regulatory analyst)
2. What specific aspects, details, or focus areas are most important for this task
3. What the desired end goal or deliverable looks like (format, depth, structure)
4. What context is relevant — jurisdiction, entity type, regulatory framework, timeline
5. Any constraints, quality criteria, or specific requirements to follow

Format your response as numbered questions. Be concise and specific to the user's topic. Do NOT rewrite the prompt — only ask questions.`;

const IMPROVE_BUILD_PROMPT = `You are a prompt engineering expert for Financial Crime Prevention consultants. Based on the original draft prompt and the user's answers to clarifying questions, create a comprehensive, detailed prompt that will produce excellent results from an AI assistant.

The improved prompt should include:
- A clear role/persona definition
- Detailed task description with specific requirements
- Context, jurisdiction, and constraints
- Output format and structure requirements
- Quality criteria and what to include/avoid

Output ONLY the improved prompt text, ready to be used directly. Do not include any preamble, explanations, or meta-commentary about the prompt. Start directly with the prompt content.`;

const emptyKnowledgeSources: KnowledgeSourceConfig = {
  modes: {
    claudeKnowledge: { enabled: false, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [], fileFilter: [], recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

type ImproveState = 'idle' | 'analyzing' | 'questions' | 'suggestions' | 'building';

export default function PromptPage() {
  const [searchParams] = useSearchParams();

  const {
    thinking, creativity, model, knowledgeSources, selectedOutputFormats,
    selectedPersonas, selectedSkills, multiPerspective, metaCognitiveEnabled,
    sessionId, systemPrompt: currentSystemPrompt,
    plainTextMode, structureReference, transparencyLevel, writingTone, emojiEnabled,
    nativeReasoningEnabled,
    audience, channel, outputLanguage, uploadedFileIds,
    setThinking, setCreativity, setModel, setSystemPrompt,
    setKnowledgeSources, setSelectedOutputFormats,
    setSelectedPersonas, setSelectedSkills, setMultiPerspective, setMetaCognitiveEnabled, clearSession,
    setTransparencyLevel, setWritingTone, setEmojiEnabled, setNativeReasoningEnabled,
    truncateMessagesAt,
    setModule, setAreaId, restoreSession,
    setAudience, setChannel, setOutputLanguage, setMultiAgentEnabled,
  } = useSessionStore();

  const { runMessage, stopStreaming, isStreaming, streamingText, streamingThinking, messages, lastInputTokens, lastOutputTokens } = useClaude();
  const { files, upload, remove } = useFileUpload();
  const { doExport, isExporting } = useExport();
  const { isListening, transcript, startListening, stopListening, isSupported: isSpeechSupported } = useSpeechRecognition();

  // Per-message config snapshot for "How ANTON Thought" accuracy on old sessions
  const lastAssistantConfigSnapshot = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    return last?.configSnapshot ?? null;
  }, [messages]);

  const [userInput, setUserInput] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [copied, setCopied] = useState(false);

  // Prompt improvement state
  const [improveState, setImproveState] = useState<ImproveState>('idle');
  const [improveQuestions, setImproveQuestions] = useState('');
  const [improveAnswers, setImproveAnswers] = useState('');
  const [improveDraft, setImproveDraft] = useState('');
  const [improveBuildingText, setImproveBuildingText] = useState('');
  const [suggestedPersonas, setSuggestedPersonas] = useState<string[]>([]);
  const [suggestedSkills, setSuggestedSkills] = useState<string[]>([]);
  const [appliedPersonas, setAppliedPersonas] = useState<string[]>([]);
  const [appliedSkills, setAppliedSkills] = useState<string[]>([]);
  const improveAbortRef = useRef<AbortController | null>(null);

  // History sidebar state
  const [historySessions, setHistorySessions] = useState<Array<{ id: string; title: string; created_at: string; module_id: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Initialize system prompt, persona, and module for session persistence
  useState(() => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setSelectedPersonas(['general-assistant']);
    setModule('open-chat');
    setAreaId('');
  });

  // Append speech transcript to user input when voice input completes
  useEffect(() => {
    if (transcript) {
      setUserInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  // Load chat history from DB
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const sessions = await fetchSessions('open-chat', { limit: 30 });
      setHistorySessions(sessions);
    } catch {
      // Non-fatal — history is a nice-to-have
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Fetch history on mount
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Refresh history when streaming ends (new session may have been created)
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      // Streaming just ended — refresh history after a short delay to allow title generation
      const timer = setTimeout(loadHistory, 2000);
      return () => clearTimeout(timer);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, loadHistory]);

  // Restore a past session from history
  const handleRestoreSession = useCallback(async (historySessionId: string) => {
    if (historySessionId === sessionId) return; // already active
    try {
      const data = await fetchSession(historySessionId);
      if (data && data.messages) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawMessages: any[] = typeof data.messages === 'string' ? JSON.parse(data.messages) : data.messages;
        const parsedMessages: Message[] = rawMessages.map((m) => ({
          id: m.id as string,
          sessionId: (m.session_id as string) ?? historySessionId,
          role: m.role as 'user' | 'assistant',
          content: m.content as string,
          thinkingContent: (m.thinking_content as string | null) ?? undefined,
          tokenCount: (m.token_count as number | null) ?? undefined,
          createdAt: m.created_at as string,
          configSnapshot: ((m as Record<string, unknown>).config_snapshot as Record<string, unknown> | null) ?? null,
        }));
        restoreSession(historySessionId, parsedMessages);
        setModule('open-chat');
        const cfg: Record<string, unknown> =
          typeof data.config === 'string' ? JSON.parse(data.config) : (data.config ?? {});
        // Always restore system prompt and persona (fall back to defaults)
        setSystemPrompt((cfg.systemPrompt as string) || DEFAULT_SYSTEM_PROMPT);
        setSelectedPersonas(
          Array.isArray(cfg.selectedPersonas) && (cfg.selectedPersonas as string[]).length
            ? (cfg.selectedPersonas as string[]) : ['general-assistant']
        );
        if (Array.isArray(cfg.selectedSkills)) setSelectedSkills(cfg.selectedSkills as string[]);
        if (cfg.model) setModel(cfg.model as ModelId);
        if (cfg.thinking) setThinking(cfg.thinking as ThinkingLevel);
        if (cfg.creativity) setCreativity(cfg.creativity as CreativityLevel);
        if (cfg.transparencyLevel !== undefined) setTransparencyLevel(cfg.transparencyLevel as 0 | 1 | 2);
        if (cfg.writingTone) setWritingTone(cfg.writingTone as 'formal' | 'professional' | 'casual' | 'conversational');
        if (cfg.emojiEnabled !== undefined) setEmojiEnabled(cfg.emojiEnabled as boolean);
        if (cfg.metaCognitiveEnabled !== undefined) setMetaCognitiveEnabled(cfg.metaCognitiveEnabled as boolean);
        if (cfg.multiPerspective !== undefined) setMultiPerspective(cfg.multiPerspective as boolean);
        if (cfg.nativeReasoningEnabled !== undefined) setNativeReasoningEnabled(cfg.nativeReasoningEnabled as boolean);
        if (cfg.knowledgeSources) setKnowledgeSources(cfg.knowledgeSources as KnowledgeSourceConfig);
        if (cfg.audience) setAudience(cfg.audience as string);
        if (cfg.outputLanguage) setOutputLanguage(cfg.outputLanguage as string);
        if (cfg.multiAgentEnabled !== undefined) setMultiAgentEnabled(cfg.multiAgentEnabled as boolean);
        if (cfg.channel) setChannel(cfg.channel as string);
      }
    } catch {
      // Failed to restore — stay on current session
    }
  }, [sessionId, restoreSession, setModule, setSystemPrompt, setSelectedPersonas,
      setSelectedSkills, setModel, setThinking, setCreativity, setTransparencyLevel,
      setWritingTone, setEmojiEnabled, setMetaCognitiveEnabled, setMultiPerspective,
      setNativeReasoningEnabled, setKnowledgeSources, setAudience, setOutputLanguage,
      setMultiAgentEnabled, setChannel]);

  // Restore session from ?session= URL param (e.g. when arriving from My Work)
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    if (sessionParam) handleRestoreSession(sessionParam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start a new chat
  const handleNewChat = useCallback(() => {
    clearSession();
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setSelectedPersonas(['general-assistant']);
    setModule('open-chat');
    setAreaId('');
    setUserInput('');
  }, [clearSession, setSystemPrompt, setSelectedPersonas, setModule, setAreaId]);

  // Delete a session from history
  const handleDeleteHistory = useCallback(async (historySessionId: string) => {
    try {
      await deleteSession(historySessionId);
      setHistorySessions((prev) => prev.filter((s) => s.id !== historySessionId));
      if (historySessionId === sessionId) {
        handleNewChat();
      }
    } catch {
      // Non-fatal
    }
  }, [sessionId, handleNewChat]);

  const handleSend = () => {
    if (userInput.trim() && !isStreaming) {
      runMessage(userInput.trim());
      setUserInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSend();
    }
  };

  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
  const handleCopy = async () => {
    if (lastAssistantMsg) {
      await navigator.clipboard.writeText(lastAssistantMsg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Prompt Improvement Handlers ──────────────────────────

  const handleImprovePrompt = async () => {
    if (!userInput.trim() || isStreaming || improveState !== 'idle') return;

    setImproveDraft(userInput);
    setImproveState('analyzing');
    setImproveQuestions('');
    setImproveAnswers('');
    setImproveBuildingText('');

    const controller = new AbortController();
    improveAbortRef.current = controller;

    try {
      const stream = streamMessage(
        {
          model,
          thinking: 'think' as const,
          creativity: 'balanced' as const,
          systemPrompt: IMPROVE_ANALYZE_PROMPT,
          userMessage: userInput,
          history: [],
          outputFormats: [],
          knowledgeSources: emptyKnowledgeSources,
          moduleInputs: {},
        },
        controller.signal
      );

      let fullText = '';
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          fullText += event.content;
          setImproveQuestions(fullText);
        }
        if (event.type === 'error') {
          setImproveState('idle');
          return;
        }
      }
      setImproveState('questions');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setImproveState('idle');
      }
    }
  };

  // Analyse prompt text and suggest relevant personas + skills
  const handleGetSuggestions = () => {
    if (!improveAnswers.trim() || improveState !== 'questions') return;

    const combined = `${improveDraft} ${improveAnswers}`.toLowerCase();

    // Persona suggestions — keyword matching
    const personaSuggestions: string[] = [];
    if (combined.match(/\baml|anti.money|financial crime|kyc|cdd|beneficial owner/)) personaSuggestions.push('fcp-expert');
    if (combined.match(/\blegal|law|regulation|directive|article|transpos/)) personaSuggestions.push('legal-expert');
    if (combined.match(/\baudit|control test|findings|deficiencies|three.line/)) personaSuggestions.push('auditor');
    if (combined.match(/\bsanctions|ofac|asset freeze|eu restrictive|designated/)) personaSuggestions.push('sanctions-expert');
    if (combined.match(/\bboard|governance|non.exec|risk committee|strategic/)) personaSuggestions.push('board-member');
    if (combined.match(/\bregulat|supervisor|inspection|on.site|compliance test/)) personaSuggestions.push('regulator');
    if (combined.match(/\bdata|model|analytics|transaction monitoring|ml |machine learning/)) personaSuggestions.push('data-scientist');
    if (combined.match(/\brisk|risk.based|inherent|residual|risk appetite/)) personaSuggestions.push('risk-specialist');
    if (combined.match(/\bcco|chief compliance|governance framework|risk appetite statement/)) personaSuggestions.push('cco');

    // Skill suggestions — keyword matching
    const skillSuggestions: string[] = [];
    if (combined.match(/\bamlr|regulation 2024|2024.1624/)) skillSuggestions.push('amlr-article-reference');
    if (combined.match(/\bnordic|sweden|norway|denmark|finland|fi \(|finanstilsynet|fin.fsa/)) skillSuggestions.push('nordic-regulatory-navigator');
    if (combined.match(/\bboard|executive summary|c.suite|one.pager|concise/)) skillSuggestions.push('board-communication');
    if (combined.match(/\beu regulation|eu directive|eba|esma|eiopa|level 2|rts|its/)) skillSuggestions.push('eu-regulatory-navigator');
    if (combined.match(/\bevidence|academic|research|methodology|confidence|empirical/)) skillSuggestions.push('academic-rigour');
    if (combined.match(/\brisk.based approach|risk appetite|inherent risk|residual risk/)) skillSuggestions.push('risk-based-thinking');
    if (combined.match(/\bsupervisor|inspection|on.site|examination|enforcement/)) skillSuggestions.push('regulatory-examiner');
    if (combined.match(/\bswedish|svenska|finansinspektionen|^se |sweden/)) skillSuggestions.push('swedish-regulatory');
    if (combined.match(/\bdata story|chart|graph|visuali|number|statistic/)) skillSuggestions.push('data-storytelling');
    if (combined.match(/\binvestment|roi|return|budget|cost.benefit|capex/)) skillSuggestions.push('investor-lens');

    setSuggestedPersonas(personaSuggestions.slice(0, 4));
    setSuggestedSkills(skillSuggestions.slice(0, 4));
    setAppliedPersonas([]);
    setAppliedSkills([]);
    setImproveState('suggestions');
  };

  const handleBuildImproved = async () => {
    if (!improveAnswers.trim() || (improveState !== 'questions' && improveState !== 'suggestions')) return;

    setImproveState('building');
    setImproveBuildingText('');

    const controller = new AbortController();
    improveAbortRef.current = controller;

    try {
      const stream = streamMessage(
        {
          model,
          thinking: 'think_hard' as const,
          creativity: 'balanced' as const,
          systemPrompt: IMPROVE_BUILD_PROMPT,
          userMessage: `Original prompt:\n${improveDraft}\n\nClarifying questions that were asked:\n${improveQuestions}\n\nUser's answers:\n${improveAnswers}`,
          history: [],
          outputFormats: [],
          knowledgeSources: emptyKnowledgeSources,
          moduleInputs: {},
        },
        controller.signal
      );

      let fullText = '';
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          fullText += event.content;
          setImproveBuildingText(fullText);
        }
        if (event.type === 'error') break;
      }
      // Place improved prompt in the input
      setUserInput(fullText);
      setImproveState('idle');
      setImproveQuestions('');
      setImproveAnswers('');
      setImproveDraft('');
      setImproveBuildingText('');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setImproveState('questions');
      }
    }
  };

  const handleCancelImprove = () => {
    improveAbortRef.current?.abort();
    setImproveState('idle');
    setImproveQuestions('');
    setImproveAnswers('');
    setImproveDraft('');
    setImproveBuildingText('');
  };

  const isImproving = improveState !== 'idle';

  const handleEditMessage = (msg: Message) => {
    truncateMessagesAt(msg.id);
    setUserInput(msg.content);
  };

  // Pre-run cost estimate
  const modelInfo = MODELS.find((m) => m.id === model);
  const estimatedInputTokens = Math.round(
    (DEFAULT_SYSTEM_PROMPT.length + messages.reduce((sum, m) => sum + m.content.length, 0) + userInput.length) / 4
  );
  const estimatedOutputTokens = model === 'claude-opus-4-6' ? 8000 : 4000;
  const estimatedCost = modelInfo
    ? (estimatedInputTokens / 1_000_000) * modelInfo.inputCostPer1M +
      (estimatedOutputTokens / 1_000_000) * modelInfo.outputCostPer1M
    : 0;
  const costDisplay =
    estimatedCost < 0.01 ? '<$0.01' : estimatedCost < 1 ? `~$${estimatedCost.toFixed(2)}` : `~$${estimatedCost.toFixed(1)}`;

  // Relative time helper
  const relativeTime = (dateStr: string) => {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const outputContent = lastAssistantMsg?.content || '';

  return (
    <div className="flex h-full gap-4">
      {/* Main Chat Area */}
      <div className="flex min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-adv-white">Prompt</h1>
          <p className="text-xs text-adv-gray">Direct conversation with Claude. No module constraints — ask anything.</p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-red hover:text-adv-red transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
          >
            {showConfig ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Settings
          </button>
        </div>
      </div>

      {/* Collapsible config */}
      {showConfig && (
        <div className="mb-4 grid grid-cols-2 gap-4 rounded-xl border border-border bg-adv-card p-4">
          <div className="space-y-4">
            <ThinkingControls value={thinking} onChange={setThinking} />
            <WritingStylePanel
              creativity={creativity}
              onCreativityChange={setCreativity}
              selectedPersonas={selectedPersonas}
              onSelectedPersonasChange={setSelectedPersonas}
              multiPerspective={multiPerspective}
              onMultiPerspectiveChange={setMultiPerspective}
              metaCognitiveEnabled={metaCognitiveEnabled}
              onMetaCognitiveChange={setMetaCognitiveEnabled}
            />
            <ModelSelector value={model} onChange={setModel} />
          </div>
          <div className="space-y-4">
            <KnowledgeSourcePanel config={knowledgeSources} onChange={setKnowledgeSources} />
            <OutputFormatSelector selected={selectedOutputFormats} onChange={setSelectedOutputFormats} />
            <SkillAttacher selected={selectedSkills} onChange={setSelectedSkills} />
            <SessionTogglesPanel
              writingTone={writingTone}
              emojiEnabled={emojiEnabled}
              metaCognitiveEnabled={metaCognitiveEnabled}
              transparencyLevel={transparencyLevel}
              nativeReasoningEnabled={nativeReasoningEnabled}
              currentModel={model}
              onWritingToneChange={setWritingTone}
              onEmojiChange={setEmojiEnabled}
              onMetaCognitiveChange={setMetaCognitiveEnabled}
              onTransparencyChange={setTransparencyLevel}
              onNativeReasoningChange={setNativeReasoningEnabled}
            />
            <FileUploader files={files} onUpload={upload} onRemove={remove} />
          </div>
        </div>
      )}

      {/* Status bar — fixed at top */}
      <div className="shrink-0 pb-2">
        <StatusIndicator
          inputTokens={lastInputTokens}
          outputTokens={lastOutputTokens}
          model={model}
          isStreaming={isStreaming}
        />
      </div>

      {/* Scrollable content area — conversation + toolbar + export all scroll together */}
      <div className="flex-1 overflow-auto space-y-3">
      {/* Conversation area */}
      <div className="rounded-xl border border-border bg-adv-card p-4">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-adv-teal/10">
              <span className="text-lg font-bold text-adv-teal">A</span>
            </div>
            <div>
              <p className="text-sm font-medium text-adv-off-white">Ask anything</p>
              <p className="mt-1 max-w-md text-xs text-adv-gray">
                Regulatory questions, document analysis, risk assessments, compliance advice,
                sanctions screening logic, or any FCP topic. Upload documents for context.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                'What are the key changes in AMLR 2024/1624?',
                'Draft a CDD procedure outline',
                'Explain EBA guidelines on de-risking',
                'Compare FATF vs EU approach to beneficial ownership',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setUserInput(suggestion)}
                  className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ConversationThread
            messages={messages}
            streamingText={streamingText}
            streamingThinking={streamingThinking}
            isStreaming={isStreaming}
            onEditMessage={handleEditMessage}
          />
        )}
      </div>

      {/* Output Toolbar: Thinking, Review, Citations, Full Prompt, Save */}
      {(outputContent || isStreaming) && (
          <OutputToolbar
            outputContent={outputContent}
            model={model}
            sessionId={sessionId ?? undefined}
            isStreaming={isStreaming}
            streamingThinking={streamingThinking}
            thinkingContent={lastAssistantMsg?.thinkingContent}
            moduleId="open-chat"
            systemPrompt={currentSystemPrompt}
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
            moduleLabel="Open Chat"
            selectedOutputFormats={selectedOutputFormats}
            knowledgeSourcesRaw={knowledgeSources as unknown as Record<string, unknown>}
            onApplyReview={(reviewText) => {
              runMessage(
                `Based on the following review feedback, please rewrite and improve your previous output. Address each point raised:\n\n${reviewText}`
              );
            }}
            onUpgradeThinking={(level) => setThinking(level)}
            configSnapshot={lastAssistantConfigSnapshot}
          />
      )}

      {/* Copy last response + Export */}
      {lastAssistantMsg && !isStreaming && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ExportBar
            content={outputContent}
            availableFormats={['md', 'docx', 'xlsx', 'pdf']}
            onExport={(fmt) => doExport(fmt, outputContent, 'open-chat-output')}
            isExporting={isExporting}
            sessionId={sessionId ?? undefined}
            moduleContext="Open Chat"
            entityId={sessionId ?? undefined}
          />
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-adv-green" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy last response'}
          </button>
        </div>
      )}
      </div>{/* end scrollable content area */}

      {/* Prompt Improvement Panel */}
      {isImproving && (
        <div className="mt-3 rounded-xl border border-adv-teal/30 bg-adv-teal-soft p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-adv-teal" />
              <span className="text-sm font-medium text-adv-off-white">Prompt Improvement</span>
              {improveState === 'analyzing' && (
                <span className="flex items-center gap-1 text-xs text-adv-gray">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Analyzing your prompt...
                </span>
              )}
              {improveState === 'building' && (
                <span className="flex items-center gap-1 text-xs text-adv-gray">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Building improved prompt...
                </span>
              )}
            </div>
            <button
              onClick={handleCancelImprove}
              className="rounded p-1 text-adv-gray hover:text-adv-red transition-colors"
              title="Cancel improvement"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Original draft */}
          <div className="mb-3 rounded-lg bg-adv-dark/50 px-3 py-2">
            <span className="text-xs uppercase tracking-wider text-adv-gray">Your draft</span>
            <p className="mt-1 text-xs text-adv-gray">{improveDraft}</p>
          </div>

          {/* Questions from Claude */}
          {improveQuestions && (
            <div className="mb-3 rounded-lg bg-adv-card px-3 py-2">
              <span className="text-xs uppercase tracking-wider text-adv-gray">Clarifying questions</span>
              <div className="mt-1 whitespace-pre-wrap text-sm text-adv-off-white">{improveQuestions}</div>
            </div>
          )}

          {/* Answer area (shown when questions are ready) */}
          {improveState === 'questions' && (
            <div className="space-y-3">
              <textarea
                value={improveAnswers}
                onChange={(e) => setImproveAnswers(e.target.value)}
                placeholder="Answer the questions above... (you can number your answers to match, or write freely)"
                className="w-full resize-none rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal"
                rows={4}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancelImprove}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-red hover:text-adv-red transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGetSuggestions}
                  disabled={!improveAnswers.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next: Smart Suggestions
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {/* Smart Suggestions step */}
          {improveState === 'suggestions' && (
            <div className="space-y-4 rounded-lg border border-adv-teal/20 bg-adv-teal-soft p-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-3.5 w-3.5 text-adv-teal" />
                  <span className="text-xs font-semibold text-adv-teal">Smart Suggestions</span>
                </div>
                <p className="text-[11px] text-adv-gray">Based on your prompt, these personas and skills may enhance your results. Click to apply — or skip.</p>
              </div>

              {suggestedPersonas.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs uppercase tracking-wider text-adv-gray">
                    <Users className="h-3 w-3" /> Recommended personas
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedPersonas.map((id) => {
                      const role = EXPERT_ROLES.find((r) => r.id === id);
                      const isApplied = appliedPersonas.includes(id);
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            if (isApplied) {
                              setAppliedPersonas(appliedPersonas.filter((p) => p !== id));
                            } else {
                              setAppliedPersonas([...appliedPersonas, id]);
                            }
                          }}
                          className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${isApplied ? 'border-adv-teal bg-adv-teal-dim text-adv-teal' : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'}`}
                        >
                          {isApplied ? '✓ ' : ''}{role?.label || id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {suggestedSkills.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs uppercase tracking-wider text-adv-gray">
                    <Zap className="h-3 w-3" /> Recommended skills
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedSkills.map((id) => {
                      const isApplied = appliedSkills.includes(id);
                      const label = id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            if (isApplied) {
                              setAppliedSkills(appliedSkills.filter((s) => s !== id));
                            } else {
                              setAppliedSkills([...appliedSkills, id]);
                            }
                          }}
                          className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${isApplied ? 'border-adv-teal bg-adv-teal-dim text-adv-teal' : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'}`}
                        >
                          {isApplied ? '✓ ' : ''}{label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setImproveState('questions')}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    // Apply selected personas and skills to session store
                    if (appliedPersonas.length > 0) setSelectedPersonas(appliedPersonas);
                    if (appliedSkills.length > 0) setSelectedSkills(appliedSkills);
                    handleBuildImproved();
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                >
                  Build Improved Prompt
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {/* Building preview */}
          {improveState === 'building' && improveBuildingText && (
            <div className="rounded-lg bg-adv-card px-3 py-2">
              <span className="text-xs uppercase tracking-wider text-adv-gray">Improved prompt (generating...)</span>
              <div className="mt-1 whitespace-pre-wrap text-sm text-adv-off-white">{improveBuildingText}</div>
            </div>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="mt-3 flex gap-2">
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question, paste a document, or describe what you need..."
          className="flex-1 resize-y rounded-xl border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal"
          rows={4}
          style={{ minHeight: '80px', maxHeight: '400px' }}
          disabled={isStreaming || isImproving}
        />
        <div className="flex flex-col gap-2">
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="flex h-full items-center justify-center rounded-xl bg-adv-red px-4 text-white hover:bg-adv-red/80 transition-colors"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <>
              <button
                onClick={handleSend}
                disabled={!userInput.trim() || isImproving}
                className="flex flex-1 items-center justify-center rounded-xl bg-adv-teal px-4 text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Send message (Ctrl+Enter)"
              >
                <Send className="h-4 w-4" />
              </button>
              <button
                onClick={handleImprovePrompt}
                disabled={!userInput.trim() || isImproving}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-adv-teal/50 px-4 py-2 text-adv-teal hover:bg-adv-teal/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Improve prompt with AI"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
              {isSpeechSupported && (
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  disabled={isImproving}
                  className={`flex items-center justify-center rounded-xl border px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isListening
                      ? 'border-adv-red text-adv-red animate-pulse'
                      : 'border-border text-adv-gray hover:border-adv-teal hover:text-adv-teal'
                  }`}
                  title={isListening ? 'Stop recording' : 'Voice input'}
                >
                  {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-xs text-adv-gray">
          Ctrl+Enter to send · Click ✦ to improve your prompt with AI
        </p>
        {!isStreaming && userInput.trim() && (
          <div className="flex items-center gap-1 text-[11px] text-adv-gray">
            <Coins className="h-3 w-3" />
            <span>{estimatedInputTokens.toLocaleString()} tokens · {costDisplay}</span>
          </div>
        )}
      </div>
      </div>{/* end main chat area */}

      {/* History Sidebar */}
      <div className="hidden w-64 flex-shrink-0 flex-col lg:flex">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-adv-gray">History</h2>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1 rounded-lg bg-adv-teal px-2.5 py-1 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="h-3 w-3" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-adv-card">
          {historyLoading && historySessions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-adv-gray" />
            </div>
          ) : historySessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <MessageSquare className="h-5 w-5 text-adv-gray" />
              <p className="px-4 text-xs text-adv-gray">No chat history yet. Start a conversation and it will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {historySessions.map((s) => (
                <div
                  key={s.id}
                  className={`group relative cursor-pointer px-3 py-2.5 transition-colors hover:bg-adv-dark-2 ${
                    s.id === sessionId ? 'border-l-2 border-l-adv-teal bg-adv-teal-soft' : ''
                  }`}
                  onClick={() => handleRestoreSession(s.id)}
                >
                  <p className={`truncate text-xs font-medium ${s.id === sessionId ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                    {s.title || 'Untitled chat'}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-adv-gray">
                    <Clock className="h-2.5 w-2.5" />
                    {relativeTime(s.created_at)}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteHistory(s.id); }}
                    className="absolute right-2 top-2.5 hidden rounded p-0.5 text-adv-gray hover:text-adv-red group-hover:block transition-colors"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
