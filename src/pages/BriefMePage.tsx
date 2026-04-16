import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { MessageCircle, Send, Square, ArrowRight, Sparkles, Copy, Check, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamMessage } from '@/lib/api';
import { MODULES, AREAS } from '@/lib/constants';
import type { Message } from '@/lib/types';

const BRIEF_SYSTEM_PROMPT = `You are Anton, an expert AI assistant powered by openEXPERT. You have deep expertise across financial crime prevention, legal & compliance, risk management, audit, consulting, HR, finance, technology, and many other professional domains.

When a user asks you a question:
1. Respond with structured, expert-level output appropriate to their question
2. Use clear headings, bullet points, and formatting where helpful
3. Be thorough but accessible — assume the user is a professional seeking practical guidance
4. At the end of your response, add a brief section: "## Want to go deeper?" suggesting 1-2 specific modules in the app that would help them produce a formal deliverable on this topic

You can handle any professional question — compliance, legal, risk, strategy, HR, finance, technology, and more.`;

export default function BriefMePage() {
  const { t } = useTranslation();
  const [transparencyLevel, setTransparencyLevel] = useState<0 | 1 | 2>(0);
  const [userInput, setUserInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [copied, setCopied] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [userInput]);

  const handleRun = async () => {
    if (!userInput.trim() || isStreaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      sessionId: '',
      role: 'user',
      content: userInput.trim(),
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setUserInput('');
    setIsStreaming(true);
    setStreamingText('');

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let fullText = '';

    try {
      const stream = streamMessage(
        {
          model: 'claude-opus-4-7',
          thinking: 'think',
          creativity: 'balanced',
          systemPrompt: BRIEF_SYSTEM_PROMPT,
          userMessage: userInput.trim(),
          history: messages,
          outputFormats: [],
          knowledgeSources: {
            modes: {
              claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
              onlineReference: { enabled: false, urls: [], fetchDepth: 'summary' },
              localFolder: { enabled: false, folderPaths: [], fileFilter: [], recursive: false },
              combinedMode: { enabled: false, priority: 'merged', instructions: '' },
            },
          },
          selectedPersonas: [],
          selectedSkills: [],
          multiPerspective: false,
          metaCognitiveEnabled: false,
          transparencyLevel,
        },
        controller.signal
      );

      for await (const event of stream) {
        if (event.type === 'text_delta') {
          fullText += event.content;
          setStreamingText(fullText);
        } else if (event.type === 'stream_end' || event.type === 'error') {
          break;
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
    } catch (err) {
      console.error(err);
    } finally {
      setStreamingText('');
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
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
      handleRun();
    }
  };

  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  const displayText = isStreaming ? streamingText : lastAssistantMessage?.content ?? '';

  const handleCopy = () => {
    if (displayText) {
      navigator.clipboard.writeText(displayText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (displayText) {
      const blob = new Blob([displayText], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'brief-me-response.md';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Suggest related modules based on the last user question
  const getSuggestedModules = () => {
    if (!messages.length) return [];
    const lastQuestion = messages.filter((m) => m.role === 'user').pop()?.content?.toLowerCase() ?? '';
    const words = lastQuestion.split(/\W+/).filter((w) => w.length > 3);

    return MODULES
      .map((mod) => {
        const text = `${mod.label} ${mod.description}`.toLowerCase();
        const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
        return { mod, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ mod }) => mod);
  };

  const suggestedModules = getSuggestedModules();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal-dim">
            <MessageCircle className="h-5 w-5 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-adv-off-white">{t('brief.title')}</h1>
            <p className="text-xs text-adv-gray">{t('brief.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {messages.length === 0 && !isStreaming ? (
          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-teal-dim">
              <Sparkles className="h-8 w-8 text-adv-teal" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold text-adv-off-white">{t('brief.whatDoYouNeed')}</h2>
            <p className="mb-8 max-w-md text-center text-adv-gray">
              {t('brief.emptyStateDesc')}
            </p>
            <div className="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                'What are the key AMLR requirements for fintechs?',
                'Help me draft a risk appetite statement',
                'Explain Solvency II capital requirements',
                'What should a DORA incident response plan include?',
                'How do I conduct a GDPR data mapping exercise?',
                'What are red flags for beneficial ownership fraud?',
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
          /* Conversation view */
          <div className="flex flex-1 flex-col gap-4 px-6 py-4">
            {/* Previous turns (all but last assistant) */}
            {messages.slice(0, -1).map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-adv-teal text-adv-dark'
                      : 'bg-adv-card text-adv-off-white'
                  }`}
                >
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  )}
                </div>
              </div>
            ))}

            {/* Current / streaming response */}
            {(isStreaming || lastAssistantMessage) && (
              <div ref={outputRef} className="rounded-xl border border-border bg-adv-card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-adv-teal" />
                    <span className="text-xs font-medium text-adv-teal">Anton</span>
                    {isStreaming && (
                      <span className="text-xs text-adv-gray">{t('brief.thinking')}</span>
                    )}
                  </div>
                  {!isStreaming && displayText && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-gray hover:bg-adv-dark hover:text-adv-off-white"
                      >
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copied ? t('brief.copied') : t('brief.copy')}
                      </button>
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-gray hover:bg-adv-dark hover:text-adv-off-white"
                      >
                        <Download className="h-3 w-3" />
                        {t('brief.downloadMd')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
                  {isStreaming && <span className="animate-pulse text-adv-teal">▊</span>}
                </div>
              </div>
            )}

            {/* Suggested modules (shown after response) */}
            {!isStreaming && suggestedModules.length > 0 && (
              <div className="rounded-xl border border-adv-teal/20 bg-adv-teal-soft p-4">
                <p className="mb-3 text-xs font-medium text-adv-teal">{t('brief.goDeeper')} →</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedModules.map((mod) => {
                    const area = AREAS.find((a) => a.moduleIds.includes(mod.id as never));
                    return (
                      <NavLink
                        key={mod.id}
                        to={`/module/${mod.id}`}
                        className="flex items-center gap-2 rounded-lg border border-adv-teal/30 bg-adv-card px-3 py-2 text-xs text-adv-off-white transition-colors hover:border-adv-teal hover:text-adv-teal"
                      >
                        {area && (
                          <span className="text-xs text-adv-gray">{area.shortLabel} ·</span>
                        )}
                        <span>{mod.label}</span>
                        <ArrowRight className="h-3 w-3" />
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-border bg-adv-dark-2 px-6 py-4">
          {/* Transparency toggle */}
          <div className="mb-3 flex items-center gap-3">
            <span className="text-[11px] text-adv-gray shrink-0">Transparency:</span>
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
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
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
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('brief.placeholder')}
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
                  {t('brief.stop')}
                </button>
              ) : (
                <button
                  onClick={handleRun}
                  disabled={!userInput.trim()}
                  className="flex items-center gap-2 rounded-xl bg-adv-teal px-4 py-3 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {t('brief.askAnton')}
                </button>
              )}
              <span className="text-xs text-adv-gray">{t('brief.ctrlEnter')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
