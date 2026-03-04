import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';
import {
  Send,
  Loader2,
  StopCircle,
  CheckSquare,
  Square,
  ChevronDown,
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AssignmentInfo {
  title: string;
  instructions: string;
  subject_id: string;
}

export default function SocraticExamPage() {
  const { id: assignmentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('school');

  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<string | null>(null);
  const [checkedObjectives, setCheckedObjectives] = useState<Set<number>>(new Set());
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (assignmentId) loadAssignment(assignmentId);
  }, [assignmentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, evaluation]);

  async function loadAssignment(id: string) {
    try {
      const res = await fetch(`/api/school/assignments/${id}`, { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json() as AssignmentInfo;
        setAssignment(data);
        // Auto-start the examination
        sendToExaminer([], data);
      }
    } catch { /* non-fatal */ }
  }

  async function sendToExaminer(history: Message[], info?: AssignmentInfo) {
    const assignmentInfo = info ?? assignment;
    if (!assignmentInfo || isThinking) return;

    setIsThinking(true);
    try {
      const res = await fetch('/api/school/socratic-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          assignmentId,
          messages: history,
          subjectId: assignmentInfo.subject_id,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

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
              fullText += parsed.content;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: fullText };
                return next;
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* non-fatal */ }
    finally {
      setIsThinking(false);
      inputRef.current?.focus();
    }
  }

  async function handleSend() {
    if (!input.trim() || isThinking || !assignment) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');

    await sendToExaminer(newHistory);
  }

  async function handleEndExamination() {
    if (!assignment || messages.length === 0) return;
    setShowEndConfirm(false);
    setIsEvaluating(true);

    try {
      const res = await fetch(`/api/school/assignments/${assignmentId}/socratic-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ conversation: messages }),
      });

      if (!res.ok || !res.body) throw new Error('Evaluation failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      setEvaluation('');

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
              fullText += parsed.content;
              setEvaluation(fullText);
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* non-fatal */ }
    finally {
      setIsEvaluating(false);
    }
  }

  const objectives = assignment?.instructions
    ? assignment.instructions.split('\n').map(s => s.trim()).filter(Boolean)
    : [];

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-adv-white">
              {t('assessment.socraticExam', 'Socratic Examination')}
            </h1>
            {assignment?.title && (
              <p className="text-sm text-adv-gray">{assignment.title}</p>
            )}
          </div>

          {!evaluation && (
            <button
              type="button"
              onClick={() => setShowEndConfirm(true)}
              disabled={messages.length < 2 || isThinking}
              className="flex items-center gap-1.5 rounded-lg border border-adv-red/30 px-4 py-2 text-sm text-adv-red hover:bg-adv-red/10 disabled:opacity-40 transition-colors"
            >
              <StopCircle className="h-4 w-4" />
              {t('assessment.endExam', 'End Examination')}
            </button>
          )}
        </div>

        <div className="flex gap-4">
          {/* Objectives sidebar */}
          {objectives.length > 0 && (
            <aside className="hidden lg:block w-56 shrink-0">
              <div className="rounded-xl border border-border bg-adv-card p-3 space-y-2 sticky top-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-adv-gray-med mb-2">
                  Objectives
                </p>
                {objectives.map((obj, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCheckedObjectives(prev => {
                      const next = new Set(prev);
                      next.has(i) ? next.delete(i) : next.add(i);
                      return next;
                    })}
                    className="flex items-start gap-2 text-left w-full group"
                  >
                    {checkedObjectives.has(i)
                      ? <CheckSquare className="h-3.5 w-3.5 shrink-0 text-adv-teal mt-0.5" />
                      : <Square className="h-3.5 w-3.5 shrink-0 text-adv-gray-med mt-0.5" />
                    }
                    <span className={`text-xs leading-relaxed ${checkedObjectives.has(i) ? 'text-adv-gray line-through' : 'text-adv-off-white'}`}>
                      {obj}
                    </span>
                  </button>
                ))}
                {objectives.length > 0 && (
                  <p className="text-xs text-adv-gray-med pt-1 border-t border-border">
                    {checkedObjectives.size}/{objectives.length} covered
                  </p>
                )}
              </div>
            </aside>
          )}

          {/* Main chat area */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {/* Conversation */}
            <div className="rounded-xl border border-border bg-adv-card p-4 space-y-4 min-h-[400px] max-h-[60vh] overflow-y-auto">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-adv-teal" />
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-adv-teal text-adv-dark'
                      : 'border border-border bg-adv-dark text-adv-off-white'
                  }`}>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isThinking && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-adv-dark px-4 py-2.5 text-sm text-adv-gray">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('assessment.examinerThinking', 'Examiner is thinking...')}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input area */}
            {!evaluation && (
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={t('assessment.socraticPlaceholder', 'Type your answer... (Enter to send, Shift+Enter for new line)')}
                  rows={3}
                  disabled={isThinking || messages.length === 0}
                  className="flex-1 resize-none rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || isThinking || messages.length === 0}
                  className="self-end rounded-lg bg-adv-teal px-4 py-2 text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Evaluation report */}
            {(isEvaluating || evaluation) && (
              <div className="rounded-xl border border-adv-teal/30 bg-adv-teal/5 p-5">
                <h2 className="text-sm font-bold text-adv-teal mb-3 flex items-center gap-2">
                  <ChevronDown className="h-4 w-4" />
                  {t('assessment.evaluationReport', 'Examination Report')}
                </h2>
                {isEvaluating && !evaluation && (
                  <div className="flex items-center gap-2 text-sm text-adv-gray">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('assessment.generating', 'Generating evaluation...')}
                  </div>
                )}
                {evaluation && (
                  <pre className="whitespace-pre-wrap text-sm text-adv-off-white leading-relaxed font-sans">{evaluation}</pre>
                )}
                {evaluation && (
                  <button
                    type="button"
                    onClick={() => navigate('/school/assignments')}
                    className="mt-4 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
                  >
                    {t('assessment.backToAssignments', 'Back to Assignments')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* End examination confirmation */}
        {showEndConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-xl border border-border bg-adv-card p-6 max-w-sm w-full mx-4 space-y-4">
              <h2 className="text-base font-semibold text-adv-white">
                {t('assessment.endExamConfirm', 'End the examination?')}
              </h2>
              <p className="text-sm text-adv-gray">
                {t('assessment.endExamNote', 'The AI will evaluate the conversation and generate your report. This cannot be undone.')}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowEndConfirm(false)}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                >
                  {t('teacher.lesson.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleEndExamination}
                  className="flex-1 rounded-lg bg-adv-red px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  {t('assessment.endExam', 'End Examination')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SchoolLayout>
  );
}
