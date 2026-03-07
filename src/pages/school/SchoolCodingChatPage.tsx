import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Send, ArrowLeft, Loader2, AlertCircle, Code } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';
import AssistanceLevelBadge from '@/components/school/AssistanceLevelBadge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ModuleId = 'code-explainer' | 'code-mentor' | 'debug-guide';
type AssistanceLevel = 'L1' | 'L2' | 'L3' | 'L4';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const MODULE_META: Record<ModuleId, { titleKey: string; inputPlaceholderKey: string; defaultPlaceholder: string }> = {
  'code-explainer': {
    titleKey: 'coding.explainerTitle',
    inputPlaceholderKey: 'coding.codePlaceholder',
    defaultPlaceholder: 'Paste your code here, then ask your question...',
  },
  'code-mentor': {
    titleKey: 'coding.mentorTitle',
    inputPlaceholderKey: 'coding.goalPlaceholder',
    defaultPlaceholder: "Describe what you want to build, then we'll plan it together...",
  },
  'debug-guide': {
    titleKey: 'coding.debugTitle',
    inputPlaceholderKey: 'coding.errorPlaceholder',
    defaultPlaceholder: 'Paste your code and the error message — what happened when you ran it?',
  },
};

function isValidModuleId(id: string | undefined): id is ModuleId {
  return id === 'code-explainer' || id === 'code-mentor' || id === 'debug-guide';
}

export default function SchoolCodingChatPage() {
  const { t } = useTranslation('school');
  const { module: moduleParam } = useParams<{ module: string }>();
  const navigate = useNavigate();

  const moduleId: ModuleId = isValidModuleId(moduleParam) ? moduleParam : 'code-mentor';
  const language = (sessionStorage.getItem('coding_language') ?? 'python') as string;
  const assistanceLevel: AssistanceLevel = 'L2';

  const meta = MODULE_META[moduleId];

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(
    moduleId === 'code-explainer' || moduleId === 'debug-guide'
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');
    setError(null);

    // Build the full message combining code input (if any) + text
    const fullUserContent = codeInput.trim()
      ? `\`\`\`${language}\n${codeInput.trim()}\n\`\`\`\n\n${text}`
      : text;

    // Clear code input after first send
    if (codeInput.trim()) {
      setCodeInput('');
      setShowCodeInput(false);
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: fullUserContent,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }]);
    setIsStreaming(true);

    try {
      const apiMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: fullUserContent },
      ];

      const res = await fetch('/api/school/coding-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          module: moduleId,
          language,
          messages: apiMessages,
          assistanceLevel,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === 'text_delta' && parsed.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.content }
                    : m
                )
              );
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, isStreaming, messages, moduleId, language, assistanceLevel, codeInput]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function moduleTitleLabel() {
    if (moduleId === 'code-explainer') return t('coding.explainerTitle', 'Code Explainer');
    if (moduleId === 'code-mentor') return t('coding.mentorTitle', 'Code Mentor');
    return t('coding.debugTitle', 'Debug Guide');
  }

  return (
    <SchoolLayout>
      <div className="flex h-[calc(100vh-3.5rem-2rem)] flex-col">
        {/* Context bar */}
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-adv-card px-4 py-2 text-sm">
          <button
            type="button"
            onClick={() => navigate('/school/coding')}
            className="rounded-lg p-1 text-adv-gray hover:text-adv-off-white transition-colors"
            aria-label="Back to coding hub"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Code className="h-4 w-4 shrink-0 text-adv-teal" />
          <span className="font-medium text-adv-off-white">{moduleTitleLabel()}</span>
          <span className="text-adv-gray">·</span>
          <span className="font-mono text-xs text-adv-gray">{language}</span>
          <div className="ms-auto flex items-center gap-2">
            <AssistanceLevelBadge level={assistanceLevel} />
          </div>
        </div>

        {/* Welcome state */}
        {messages.length === 0 && (
          <div className="mb-4 flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-adv-teal/10">
              <Code className="h-6 w-6 text-adv-teal" />
            </div>
            <p className="text-base font-semibold text-adv-white">{moduleTitleLabel()}</p>
            <p className="max-w-sm text-sm text-adv-gray">
              {moduleId === 'code-explainer' && "Paste your code below, then ask Alma to help you understand it."}
              {moduleId === 'code-mentor' && "Describe what you want to build. Alma will guide you through building it step by step."}
              {moduleId === 'debug-guide' && "Paste your broken code and the error message. Alma will help you find the bug yourself."}
            </p>
          </div>
        )}

        {/* Message list */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'rounded-br-sm bg-adv-teal text-adv-dark'
                    : 'rounded-bl-sm border border-border bg-adv-card text-adv-off-white'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content || (isStreaming ? '▋' : '')}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-adv-red/20 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Code input area (for first message) */}
        {showCodeInput && messages.length === 0 && (
          <div className="mb-2 rounded-xl border border-border bg-adv-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium text-adv-gray uppercase tracking-widest">
                {t('coding.codePlaceholder', 'Code')} · {language}
              </span>
              <button
                type="button"
                onClick={() => setShowCodeInput(false)}
                className="text-xs text-adv-gray hover:text-adv-off-white"
              >
                Hide
              </button>
            </div>
            <textarea
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder={moduleId === 'code-explainer'
                ? t('coding.codePlaceholder', 'Paste your code here...')
                : t('coding.errorPlaceholder', 'Paste your code and the error message...')}
              rows={8}
              className="w-full resize-y bg-transparent px-4 py-3 font-mono text-sm text-adv-off-white placeholder:text-adv-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
        )}

        {/* Restore code input button */}
        {!showCodeInput && (moduleId === 'code-explainer' || moduleId === 'debug-guide') && (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowCodeInput(true)}
              className="text-xs text-adv-teal hover:text-adv-teal-dark transition-colors"
            >
              + Paste code
            </button>
          </div>
        )}

        {/* Chat input */}
        <div className="rounded-xl border border-border bg-adv-card p-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t(meta.inputPlaceholderKey, meta.defaultPlaceholder)}
            rows={2}
            disabled={isStreaming}
            className="w-full resize-none bg-transparent text-sm text-adv-off-white placeholder:text-adv-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 disabled:opacity-50"
          />
          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal transition-colors"
            >
              {isStreaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {t('chat.send', 'Send')}
            </button>
          </div>
        </div>
      </div>
    </SchoolLayout>
  );
}
