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
  X,
} from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';
import AssistanceLevelBadge from '@/components/school/AssistanceLevelBadge';
import TaskTypeSelector from '@/components/school/TaskTypeSelector';
import LaxhjalpMode from '@/components/school/LaxhjalpMode';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeSandbox from '@/components/school/CodeSandbox';
import PythonSandbox from '@/components/school/PythonSandbox';

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

/** Extract code blocks with language tag from markdown string */
function extractCodeBlocks(markdown: string): Array<{ lang: string; code: string }> {
  const regex = /```(\w+)\n([\s\S]*?)```/g;
  const blocks: Array<{ lang: string; code: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push({ lang: match[1].toLowerCase(), code: match[2] });
  }
  return blocks;
}

const SANDBOX_LANGS = ['html', 'css', 'javascript', 'js'];

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
  const [attachedDoc, setAttachedDoc] = useState<{ text: string; filename: string } | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingDoc(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/school/upload-doc', {
        method: 'POST',
        headers: getAuthHeader(),
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        setAttachedDoc({ text: data.text, filename: data.filename });
      } else {
        setError('Could not read the file. Please try a PDF, DOCX, or TXT file.');
      }
    } catch {
      setError('File upload failed. Please try again.');
    } finally {
      setIsUploadingDoc(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
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

    // Build additionalContext including attached doc if any
    let additionalContext: string | undefined;
    if (attachedDoc) {
      additionalContext = `\n\n[Attached document: ${attachedDoc.filename}]\n${attachedDoc.text}`;
      setAttachedDoc(null); // consume after send
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text + (attachedDoc ? `\n\n📎 ${attachedDoc.filename}` : ''),
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
          additionalContext,
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
  }, [input, isStreaming, classId, taskType, currentAssistanceLevel, messages, classContext, attachedDoc]);

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
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        className="hidden"
        onChange={handleFileSelect}
        aria-label={t('chat.attachFile', 'Attach a document')}
      />

      <div className="flex h-[calc(100vh-3.5rem-2rem)] flex-col">
        {/* Context bar */}
        {classContext && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-adv-card px-4 py-2 text-sm">
            <BookOpen className="h-4 w-4 shrink-0 text-adv-teal" />
            <span className="font-medium text-adv-off-white">{classContext.name}</span>
            {classContext.currentTopic && (
              <>
                <span className="text-adv-gray">·</span>
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

          {messages.map((msg) => {
            const codeBlocks = msg.role === 'assistant' ? extractCodeBlocks(msg.content) : [];
            const sandboxBlocks = codeBlocks.filter(b => SANDBOX_LANGS.includes(b.lang));
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
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
                {/* Show code sandbox for HTML/CSS/JS blocks in assistant messages */}
                {msg.role === 'assistant' && sandboxBlocks.length > 0 && !isStreaming && (
                  <div className="mt-2 max-w-[85%] w-full">
                    {sandboxBlocks.map((block, i) => (
                      <CodeSandbox key={i} code={block.code} language={block.lang as 'html' | 'css' | 'js'} />
                    ))}
                  </div>
                )}
                {/* Show Python sandbox for python code blocks */}
                {msg.role === 'assistant' && !isStreaming && (() => {
                  const pythonBlocks = extractCodeBlocks(msg.content).filter(b => b.lang === 'python');
                  const isCodingSubject = ['computational-thinking', 'uni-computer-science', 'uni-statistics', 'mathematics', 'uni-mathematics'].includes(classContext?.subjectId ?? urlSubjectId ?? '');
                  if (pythonBlocks.length === 0 || !isCodingSubject) return null;
                  return (
                    <div className="mt-2 max-w-[85%] w-full">
                      {pythonBlocks.map((block, i) => <PythonSandbox key={`py-${i}`} code={block.code} />)}
                    </div>
                  );
                })()}
              </div>
            );
          })}

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

        {/* Attached document chip */}
        {attachedDoc && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-adv-teal/30 bg-adv-teal/5 px-3 py-2 text-xs text-adv-teal">
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{attachedDoc.filename}</span>
            <button
              type="button"
              onClick={() => setAttachedDoc(null)}
              className="ms-auto shrink-0 rounded-full p-0.5 hover:bg-adv-teal/20 transition-colors"
              aria-label={t('chat.removeAttachment', 'Remove attachment')}
            >
              <X className="h-3 w-3" />
            </button>
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
            className="w-full resize-none bg-transparent text-sm text-adv-off-white placeholder:text-adv-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 disabled:opacity-50"
            aria-label={t('chat.placeholder')}
          />
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingDoc || isStreaming}
              className="rounded-lg p-1.5 text-adv-gray hover:text-adv-off-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal disabled:opacity-40"
              aria-label={t('chat.attachFile', 'Attach a document')}
              title={t('chat.uploadsAllowed')}
            >
              {isUploadingDoc ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim() || isStreaming}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal transition-colors"
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
