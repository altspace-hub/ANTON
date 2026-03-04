import { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthHeader } from '@/lib/api';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Send,
  Paperclip,
  BookOpen,
  Info,
  Loader2,
  AlertCircle,
  Dumbbell,
  HelpCircle,
  Lightbulb,
  ClipboardList,
} from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';
import AssistanceLevelBadge from '@/components/school/AssistanceLevelBadge';
import TaskTypeSelector from '@/components/school/TaskTypeSelector';
import LaxhjalpMode from '@/components/school/LaxhjalpMode';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type TaskType = 'homework' | 'studying' | 'practice' | null;
type AssistanceLevel = 'L1' | 'L2' | 'L3' | 'L4';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ClassContext {
  id: string;
  name: string;
  subjectId: string;
  educationTier: string;
  teacherPersona: string;
  assistanceLevels: Record<string, AssistanceLevel>;
  currentTopic?: string;
}

export default function SchoolChatPage() {
  const { t } = useTranslation('school');
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId') || '';
  const urlSubjectId = searchParams.get('subjectId') || '';
  const initialQuestion = searchParams.get('q') || '';

  const [classContext, setClassContext] = useState<ClassContext | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialQuestion);
  const [taskType, setTaskType] = useState<TaskType>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLaxhjalp, setShowLaxhjalp] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(!!classId);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (classId) loadClassContext(classId);
    else setIsLoadingContext(false);
  }, [classId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send initial question if passed via URL
  useEffect(() => {
    if (initialQuestion && !isLoadingContext && messages.length === 0) {
      handleSend(initialQuestion);
      setInput('');
    }
  }, [isLoadingContext]);

  async function loadClassContext(id: string) {
    try {
      const res = await fetch(`/api/school/classes/${id}`, { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setClassContext(data);
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingContext(false);
    }
  }

  const currentAssistanceLevel: AssistanceLevel = (() => {
    if (!classContext || !taskType) return 'L2';
    const levels = classContext.assistanceLevels;
    if (taskType === 'homework') return levels.homework ?? 'L1';
    if (taskType === 'studying') return levels.self_study ?? 'L2';
    if (taskType === 'practice') return levels.exam_practice ?? 'L3';
    return 'L2';
  })();

  const handleSend = useCallback(async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    if (!text || isStreaming) return;

    setInput('');
    setError(null);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
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
      // Build full message array: prior history + new user message
      const apiMessages = [
        ...messages
          .filter((m) => m.id !== assistantId)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
      ];

      const res = await fetch('/api/school/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          classId: classId || undefined,
          messages: apiMessages,
          taskType: taskType ?? 'studying',
          assistanceLevel: currentAssistanceLevel,
          teacherPersonaId: classContext?.teacherPersona ?? 'alma',
          subjectId: classContext?.subjectId ?? urlSubjectId ?? 'mathematics',
          educationTier: classContext?.educationTier ?? 'T2',
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
            // Ignore non-JSON SSE lines
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
  }, [input, isStreaming, classId, taskType, currentAssistanceLevel, messages, classContext]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (showLaxhjalp) {
    return (
      <SchoolLayout>
        <LaxhjalpMode
          classId={classId}
          subjectId={classContext?.subjectId ?? urlSubjectId ?? 'mathematics'}
          onClose={() => setShowLaxhjalp(false)}
          onResolved={(topic) => {
            setShowLaxhjalp(false);
            handleSend(`I just worked through a problem about ${topic}. Let's continue.`);
          }}
        />
      </SchoolLayout>
    );
  }

  return (
    <SchoolLayout>
      <div className="flex h-[calc(100vh-3.5rem-2rem)] flex-col">
        {/* Context bar */}
        {classContext && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-adv-card px-4 py-2 text-sm">
            <BookOpen className="h-4 w-4 shrink-0 text-adv-teal" />
            <span className="font-medium text-adv-off-white">{classContext.name}</span>
            {classContext.currentTopic && (
              <>
                <span className="text-adv-gray-med">·</span>
                <span className="text-adv-gray">{classContext.currentTopic}</span>
              </>
            )}
            <div className="ms-auto flex items-center gap-2">
              <AssistanceLevelBadge level={currentAssistanceLevel} />
            </div>
          </div>
        )}

        {/* Task type selector (shown when no task type selected and no messages) */}
        {!taskType && messages.length === 0 && !isLoadingContext && (
          <div className="mb-4 flex flex-col items-center gap-4 py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-adv-teal/10">
              <BookOpen className="h-6 w-6 text-adv-teal" />
            </div>
            <p className="text-lg font-semibold text-adv-white">
              {t('chat.greeting', { persona: classContext?.teacherPersona === 'alma' ? t('persona.alma.name') : 'Alma' })}
            </p>
            <TaskTypeSelector onSelect={setTaskType} />
          </div>
        )}

        {/* Message list */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {isLoadingContext && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-adv-teal" />
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
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
                  <p>{msg.content}</p>
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

        {/* Läxhjälp prompt (shown after a few messages if L1 and stuck) */}
        {messages.length >= 4 && !showLaxhjalp && currentAssistanceLevel === 'L1' && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setShowLaxhjalp(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-adv-teal/20 bg-adv-teal/5 px-4 py-2.5 text-sm text-adv-teal hover:bg-adv-teal/10 transition-colors"
            >
              <Info className="h-4 w-4" />
              {t('chat.laxhjalpMode')}
            </button>
          </div>
        )}

        {/* Contextual action bar — shown after first AI response */}
        {messages.some((m) => m.role === 'assistant') && !isStreaming && (
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              {
                icon: <Dumbbell className="h-3.5 w-3.5" />,
                label: t('chat.actions.practice', 'Practice problems'),
                message: t('chat.actions.practiceMsg', 'Give me 3 practice problems on what we\'ve been discussing. Don\'t show the answers yet.'),
              },
              {
                icon: <HelpCircle className="h-3.5 w-3.5" />,
                label: t('chat.actions.quiz', 'Quiz me'),
                message: t('chat.actions.quizMsg', 'Quiz me with one question on this topic. Wait for my answer before telling me if I\'m right.'),
              },
              {
                icon: <Lightbulb className="h-3.5 w-3.5" />,
                label: t('chat.actions.hint', 'Give me a hint'),
                message: t('chat.actions.hintMsg', 'I\'m a bit stuck. Can you give me a hint without revealing the full answer?'),
              },
              {
                icon: <ClipboardList className="h-3.5 w-3.5" />,
                label: t('chat.actions.summarise', 'Summarise session'),
                message: t('chat.actions.summariseMsg', 'Can you summarise the key things we\'ve covered in this session?'),
              },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => handleSend(action.message)}
                disabled={isStreaming}
                className="flex items-center gap-1.5 rounded-full border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal/50 hover:text-adv-teal disabled:opacity-40 transition-colors"
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="rounded-xl border border-border bg-adv-card p-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            rows={2}
            disabled={isStreaming}
            className="w-full resize-none bg-transparent text-sm text-adv-off-white placeholder:text-adv-gray-med focus:outline-none disabled:opacity-50"
            aria-label={t('chat.placeholder')}
          />
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              className="rounded-lg p-1.5 text-adv-gray hover:text-adv-off-white transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal"
              aria-label={t('chat.uploadsAllowed')}
              title={t('chat.uploadsAllowed')}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim() || isStreaming}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-adv-teal transition-colors"
              aria-label={t('chat.send')}
            >
              {isStreaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {t('chat.send')}
            </button>
          </div>
        </div>
      </div>
    </SchoolLayout>
  );
}
