import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Square, ChevronDown, ChevronUp, Copy, Check, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamMessage } from '@/lib/api';
import type { Message, StreamEvent } from '@/lib/types';

// ── Advisor Personas ─────────────────────────────────────────

interface AdvisorPersona {
  id: string;
  label: string;
  description: string;
  systemPrompt: string;
  accentColor: string;
}

const ADVISOR_PERSONAS: AdvisorPersona[] = [
  {
    id: 'strategic',
    label: 'General Strategic Advisor',
    description: 'Big-picture thinking, strategic options, stakeholder dynamics',
    accentColor: 'text-adv-teal',
    systemPrompt: `You are a General Strategic Advisor — a trusted, senior advisor with broad expertise across business strategy, organisational dynamics, and professional challenges. You think in frameworks, options, and trade-offs. You are direct, insightful, and help the user think through complex situations with clarity. You ask clarifying questions when needed. You never give vague platitudes — you give specific, actionable strategic guidance.`,
  },
  {
    id: 'legal',
    label: 'Legal Counsel',
    description: 'Legal risk, contracts, regulatory obligations, liability',
    accentColor: 'text-adv-blue',
    systemPrompt: `You are a Legal Counsel — a senior lawyer with expertise in financial regulation, corporate law, contracts, and compliance obligations. You think about legal risk, liability, obligations, and defensibility. You identify legal issues the user may have missed, flag potential exposure, and help them understand their legal position. You are precise and structured. You note when specialist legal advice should be sought, but you give substantive guidance, not just disclaimers.`,
  },
  {
    id: 'risk',
    label: 'Risk Expert',
    description: 'Risk identification, assessment, mitigation, controls',
    accentColor: 'text-adv-gold',
    systemPrompt: `You are a Risk Expert — a senior risk professional with deep expertise in identifying, assessing, and mitigating operational, financial, regulatory, and reputational risks. You think in risk frameworks (likelihood x impact), control environments, and residual risk. You help the user see risks they may have overlooked and think through appropriate mitigations. You are structured and methodical.`,
  },
  {
    id: 'regulatory',
    label: 'Regulatory Specialist',
    description: 'Supervisory expectations, regulatory interpretation, compliance frameworks',
    accentColor: 'text-adv-green',
    systemPrompt: `You are a Regulatory Specialist — a senior compliance professional with deep knowledge of financial regulation, supervisory expectations, and regulatory interpretation. You understand how regulators think, what they look for, and what organisations must demonstrate to satisfy supervisory requirements. You help the user understand regulatory obligations and translate them into practical action. You are precise and cite regulatory sources where relevant.`,
  },
  {
    id: 'fincrime',
    label: 'Financial Crime Expert',
    description: 'AML/CFT, sanctions, fraud, typologies, financial crime risk',
    accentColor: 'text-adv-red',
    systemPrompt: `You are a Financial Crime Expert — a senior specialist in anti-money laundering (AML), counter-financing of terrorism (CFT), sanctions compliance, fraud prevention, and financial crime risk management. You understand typologies, red flags, regulatory frameworks (FATF, EU AMLR, local legislation), and practical compliance challenges. You help the user think through financial crime risks and controls with practical, expert-level guidance.`,
  },
  {
    id: 'socratic',
    label: 'Socratic Tutor',
    description: 'Asks probing questions to help you reason through the problem yourself',
    accentColor: 'text-adv-teal',
    systemPrompt: `You are a Socratic Tutor. Your role is NOT to give answers — it is to ask powerful, probing questions that help the user reason through the problem themselves.

For every message:
1. Identify the core assumption the user is making
2. Ask 2-3 targeted questions that challenge that assumption or invite deeper analysis
3. If they are heading in the wrong direction, ask a question that highlights the flaw — without stating it directly
4. Only after the user has reasoned through it should you offer brief affirmation and, if truly needed, a clarifying summary

Never give the answer directly. Guide, probe, let them think.`,
  },
];

// ── Local storage keys ────────────────────────────────────────
const LS_USER_CONTEXT = 'sounding-board:user-context';
const LS_PERSONA = 'sounding-board:persona';

// ── Empty knowledge sources ───────────────────────────────────
const EMPTY_KS = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

// ── Component ─────────────────────────────────────────────────

export default function SoundingBoardPage() {
  const [transparencyLevel, setTransparencyLevel] = useState<0 | 1 | 2>(0);
  const [userContext, setUserContext] = useState<string>(
    () => localStorage.getItem(LS_USER_CONTEXT) ?? ''
  );
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(
    () => localStorage.getItem(LS_PERSONA) ?? 'strategic'
  );
  const [contextPanelOpen, setContextPanelOpen] = useState<boolean>(!localStorage.getItem(LS_USER_CONTEXT));
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedPersona = ADVISOR_PERSONAS.find((p) => p.id === selectedPersonaId) ?? ADVISOR_PERSONAS[0];

  // Persist context and persona to localStorage
  useEffect(() => {
    localStorage.setItem(LS_USER_CONTEXT, userContext);
  }, [userContext]);

  useEffect(() => {
    localStorage.setItem(LS_PERSONA, selectedPersonaId);
  }, [selectedPersonaId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [userInput]);

  const buildSystemPrompt = () => {
    const contextSection = userContext.trim()
      ? `\n\n## About the Person You Are Advising\n${userContext.trim()}`
      : '';
    return `${selectedPersona.systemPrompt}${contextSection}

You are speaking directly with the person described above. Address their situation specifically. Be a trusted advisor — not a generic AI assistant. Respond conversationally but with depth. Use structured formatting (headings, bullets) only when it genuinely helps clarity. Keep responses focused and actionable.`;
  };

  const handleSend = async () => {
    if (!userInput.trim() || isStreaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      sessionId: '',
      role: 'user',
      content: userInput.trim(),
      createdAt: new Date().toISOString(),
    };

    const historyForApi = [...messages];
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setUserInput('');
    setIsStreaming(true);
    setStreamingText('');

    const controller = new AbortController();
    abortRef.current = controller;
    let fullText = '';

    try {
      const stream = streamMessage(
        {
          model: 'claude-opus-4-8',
          thinking: 'think',
          creativity: 'balanced',
          systemPrompt: buildSystemPrompt(),
          userMessage: userMsg.content,
          history: historyForApi,
          outputFormats: [],
          knowledgeSources: EMPTY_KS,
          transparencyLevel,
        },
        controller.signal
      );

      for await (const event of stream as AsyncGenerator<StreamEvent>) {
        if (event.type === 'text_delta') {
          fullText += event.content;
          setStreamingText(fullText);
        }
        if (event.type === 'error' || event.type === 'stream_end') break;
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error(err);
      }
    }

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      sessionId: '',
      role: 'assistant',
      content: fullText,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreamingText('');
    setIsStreaming(false);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    if (streamingText) {
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        sessionId: '',
        role: 'assistant',
        content: streamingText,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    }
    setStreamingText('');
    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearConversation = () => {
    setMessages([]);
    setStreamingText('');
    setIsStreaming(false);
    abortRef.current?.abort();
  };

  const handlePersonaChange = (personaId: string) => {
    if (messages.length > 0) {
      const confirmed = window.confirm(
        'Changing the advisor persona will reset the conversation. Continue?'
      );
      if (!confirmed) return;
      handleClearConversation();
    }
    setSelectedPersonaId(personaId);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal-dim">
              <MessageSquare className="h-5 w-5 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-adv-off-white">Sounding Board</h1>
              <p className="text-xs text-adv-gray">
                Talking with:{' '}
                <span className={`font-medium ${selectedPersona.accentColor}`}>
                  {selectedPersona.label}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={handleClearConversation}
                className="rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-gray transition-colors hover:border-adv-teal/40 hover:text-adv-off-white"
              >
                New conversation
              </button>
            )}
            <button
              onClick={() => setContextPanelOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-gray transition-colors hover:border-adv-teal/40 hover:text-adv-off-white"
            >
              Advisor settings
              {contextPanelOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>

        {/* Context panel (collapsible) */}
        {contextPanelOpen && (
          <div className="mt-4 rounded-xl border border-border bg-adv-card p-4 space-y-4">
            {/* Persona selector */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
                Advisor Persona
              </label>
              <div className="flex flex-wrap gap-2">
                {ADVISOR_PERSONAS.map((persona) => (
                  <button
                    key={persona.id}
                    onClick={() => handlePersonaChange(persona.id)}
                    title={persona.description}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedPersonaId === persona.id
                        ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                        : 'border-border bg-adv-dark text-adv-gray hover:border-adv-teal/40 hover:text-adv-off-white'
                    }`}
                  >
                    {persona.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-adv-gray">
                {selectedPersona.description}
              </p>
            </div>

            {/* User context */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
                About You
              </label>
              <textarea
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                placeholder="I am a Head of Compliance at a Nordic bank. My focus is AML/CFT. My current challenge is preparing for AMLA supervision."
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
              <p className="mt-1 text-[11px] text-adv-gray">
                This context is saved locally and included in every message to your advisor.
              </p>
            </div>

            {/* Transparency toggle */}
            <div className="space-y-1">
              <div className="text-[11px] text-adv-gray">Transparency</div>
              <div className="flex gap-1.5">
                {([
                  { level: 0 as const, label: 'Off' },
                  { level: 1 as const, label: 'Summary' },
                  { level: 2 as const, label: 'Detailed' },
                ]).map(({ level, label }) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setTransparencyLevel(level)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                      transparencyLevel === level
                        ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                        : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat thread */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4 gap-4">
        {messages.length === 0 && !isStreaming ? (
          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center text-center py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-teal-dim">
              <MessageSquare className="h-8 w-8 text-adv-teal" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-adv-off-white">
              Your personal advisor is ready
            </h2>
            <p className="mb-2 max-w-md text-sm text-adv-gray">
              Ask anything — strategic dilemmas, tricky situations, regulatory questions, or just
              thinking out loud. Your{' '}
              <span className={`font-medium ${selectedPersona.accentColor}`}>
                {selectedPersona.label}
              </span>{' '}
              will respond with focused, expert-level guidance.
            </p>
            {!userContext.trim() && (
              <p className="mb-6 text-xs text-adv-gray">
                Tip: Add your context above so your advisor can give more relevant advice.
              </p>
            )}
            <div className="grid max-w-lg grid-cols-1 gap-2 sm:grid-cols-2 text-left">
              {[
                'How should I approach an upcoming supervisory inspection?',
                'What are the biggest risks in our AMLR implementation plan?',
                'Help me think through a difficult stakeholder conversation',
                'What would a regulator focus on in a de-risking review?',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setUserInput(example)}
                  className="rounded-lg border border-border bg-adv-card p-3 text-left text-xs text-adv-gray transition-colors hover:border-adv-teal/50 hover:text-adv-off-white"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message thread */
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="mr-3 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim">
                    <span className="text-xs font-bold text-adv-teal">A</span>
                  </div>
                )}
                <div
                  className={`relative max-w-[78%] rounded-xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-adv-teal text-adv-dark'
                      : 'border border-border bg-adv-card text-adv-off-white'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <>
                      <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="mt-2 flex items-center gap-1 text-[11px] text-adv-gray hover:text-adv-gray transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="h-3 w-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </>
                  )}
                  <div className="mt-1 text-xs opacity-50">
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="ml-3 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adv-card">
                    <User className="h-4 w-4 text-adv-gray" />
                  </div>
                )}
              </div>
            ))}

            {/* Streaming response */}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="mr-3 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim">
                  <span className="text-xs font-bold text-adv-teal">A</span>
                </div>
                <div className="max-w-[78%] rounded-xl border border-border bg-adv-card px-4 py-3 text-sm">
                  {streamingText ? (
                    <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                      <span className="animate-pulse text-adv-teal">&#x258A;</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-adv-gray">
                      <span className="animate-pulse">...</span>
                      <span className="text-xs">Thinking</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask your ${selectedPersona.label}...`}
            rows={2}
            className="min-h-[60px] flex-1 resize-none rounded-xl border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            style={{ maxHeight: '200px', overflowY: 'auto' }}
            disabled={isStreaming}
          />
          <div className="flex flex-col items-end gap-2">
            {isStreaming ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 rounded-xl bg-adv-red px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!userInput.trim()}
                className="flex items-center gap-2 rounded-xl bg-adv-teal px-4 py-3 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Ask Advisor
              </button>
            )}
            <span className="text-xs text-adv-gray">Ctrl+Enter to send</span>
          </div>
        </div>
      </div>
    </div>
  );
}
