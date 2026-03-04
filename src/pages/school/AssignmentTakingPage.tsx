import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Send,
} from 'lucide-react';

type QuestionType = 'multiple_choice' | 'short_answer' | 'calculation';

interface Question {
  id: string;
  type: QuestionType;
  content: string;
  marks: number;
  blooms: string;
  options?: string[];
}

interface AssignmentDetail {
  id: string;
  title: string;
  instructions?: string;
  assignment_type: 'homework' | 'exam' | 'practice';
  subject_id?: string;
  topic?: string;
  assistance_level?: string;
  due_date?: string;
  time_limit_minutes?: number | null;
  class_name?: string;
  class_id?: string;
  questions: Question[];
}

type AnswerMap = Record<string, string>; // questionId → answer text

const BLOOMS_BADGE: Record<string, string> = {
  knowledge: 'bg-adv-teal/10 text-adv-teal',
  application: 'bg-adv-blue/10 text-adv-blue',
  analysis: 'bg-adv-gold/10 text-adv-gold',
  evaluation: 'bg-adv-green/10 text-adv-green',
  creation: 'bg-adv-red/10 text-adv-red',
  metacognition: 'bg-adv-gray/10 text-adv-gray',
};

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AssignmentTakingPage() {
  const { t } = useTranslation('school');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Timer state
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleSubmit = useCallback(async (currentAnswers: AnswerMap) => {
    if (!assignment) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        assignmentId: assignment.id,
        answers: assignment.questions.map((q) => ({
          questionId: q.id,
          answerText: currentAnswers[q.id] ?? '',
          selectedOption: q.type === 'multiple_choice' ? currentAnswers[q.id] ?? null : null,
        })),
      };
      const res = await fetch('/api/school/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Submission failed' }));
        throw new Error(err.error ?? 'Submission failed');
      }
      setSubmitted(true);
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [assignment]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/school/assignments/${id}`, { headers: getAuthHeader() })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load assignment');
        return r.json();
      })
      .then((data: AssignmentDetail) => {
        setAssignment(data);
        // Start countdown timer if time limit is set
        if (data.time_limit_minutes) {
          const secs = data.time_limit_minutes * 60;
          setSecondsLeft(secs);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [id]);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft === null) return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === null || prev <= 1) {
          // Time's up — auto-submit
          setAnswers((currentAnswers) => {
            handleSubmit(currentAnswers);
            return currentAnswers;
          });
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft !== null]);

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  const answeredCount = assignment
    ? assignment.questions.filter((q) => (answers[q.id] ?? '').trim().length > 0).length
    : 0;
  const totalQuestions = assignment?.questions.length ?? 0;
  const totalMarks = assignment?.questions.reduce((sum, q) => sum + q.marks, 0) ?? 0;
  const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const isTimeCritical = secondsLeft !== null && secondsLeft < 120;

  if (submitted) {
    return (
      <SchoolLayout>
        <div className="mx-auto max-w-lg py-16 text-center space-y-5">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-adv-green/10">
            <CheckCircle2 className="h-10 w-10 text-adv-green" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-adv-white">Submitted!</h1>
            <p className="mt-1 text-sm text-adv-gray-med">
              Your answers have been saved. Your teacher will review them soon.
            </p>
          </div>
          <Link
            to="/school/assignments"
            className="inline-flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            Back to assignments
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </SchoolLayout>
    );
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Back link */}
        <Link
          to="/school/assignments"
          className="flex items-center gap-1.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('nav.assignments', 'Assignments')}
        </Link>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-adv-red/20 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {assignment && (
          <>
            {/* Assignment header */}
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-lg font-bold text-adv-white">{assignment.title}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-adv-gray-med">
                    {assignment.class_name && <span>{assignment.class_name}</span>}
                    <span className="rounded-full border border-border px-2 py-0.5 capitalize">
                      {assignment.assignment_type}
                    </span>
                    {assignment.due_date && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Due {new Date(assignment.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <span>{totalMarks} marks total</span>
                  </div>
                </div>

                {/* Timer */}
                {secondsLeft !== null && (
                  <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-mono font-semibold ${
                    isTimeCritical
                      ? 'border-adv-red/30 bg-adv-red/10 text-adv-red'
                      : 'border-border bg-adv-dark text-adv-off-white'
                  }`}>
                    <Clock className={`h-3.5 w-3.5 ${isTimeCritical ? 'animate-pulse' : ''}`} />
                    {formatTime(secondsLeft)}
                  </div>
                )}
              </div>

              {/* Instructions */}
              {assignment.instructions && (
                <p className="mt-3 text-sm text-adv-gray border-t border-border pt-3">
                  {assignment.instructions}
                </p>
              )}

              {/* Progress bar */}
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-adv-gray-med">
                  <span>{answeredCount} of {totalQuestions} answered</span>
                  <span className="text-adv-teal">{progressPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
                  <div
                    className="h-full rounded-full bg-adv-teal transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Questions */}
            <div className="space-y-4">
              {assignment.questions.map((q, idx) => {
                const answered = (answers[q.id] ?? '').trim().length > 0;
                const bloomsClass = BLOOMS_BADGE[q.blooms] ?? 'bg-adv-card text-adv-gray';
                return (
                  <div
                    key={q.id}
                    className={`rounded-xl border bg-adv-card p-5 transition-colors ${
                      answered ? 'border-adv-teal/30' : 'border-border'
                    }`}
                  >
                    {/* Question header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-start gap-2.5">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          answered ? 'bg-adv-teal text-adv-dark' : 'bg-adv-dark text-adv-gray-med'
                        }`}>
                          {idx + 1}
                        </span>
                        <p className="text-sm font-medium text-adv-off-white leading-snug">{q.content}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${bloomsClass}`}>
                          {q.blooms}
                        </span>
                        <span className="rounded-full bg-adv-dark px-2 py-0.5 text-xs text-adv-gray-med">
                          {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
                        </span>
                      </div>
                    </div>

                    {/* Multiple choice */}
                    {q.type === 'multiple_choice' && q.options && (
                      <div className="space-y-2 pl-8">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = answers[q.id] === opt;
                          return (
                            <label
                              key={optIdx}
                              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'border-adv-teal/50 bg-adv-teal/5'
                                  : 'border-border hover:border-adv-gray hover:bg-adv-dark/50'
                              }`}
                            >
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-xs ${
                                isSelected ? 'border-adv-teal bg-adv-teal text-adv-dark' : 'border-adv-gray-med'
                              }`}>
                                {isSelected && '✓'}
                              </span>
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                value={opt}
                                checked={isSelected}
                                onChange={() => setAnswer(q.id, opt)}
                                className="sr-only"
                              />
                              <span className="text-sm text-adv-off-white">{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* Short answer */}
                    {q.type === 'short_answer' && (
                      <div className="pl-8">
                        <textarea
                          value={answers[q.id] ?? ''}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          rows={3}
                          placeholder="Write your answer here..."
                          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none resize-none"
                        />
                      </div>
                    )}

                    {/* Calculation */}
                    {q.type === 'calculation' && (
                      <div className="pl-8 space-y-2">
                        <input
                          type="number"
                          value={answers[q.id] ?? ''}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          placeholder="Enter your answer..."
                          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm font-mono text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                        />
                        <p className="text-xs text-adv-gray-med">
                          Show your working in the box below (optional):
                        </p>
                        <textarea
                          value={answers[`${q.id}_working`] ?? ''}
                          onChange={(e) => setAnswer(`${q.id}_working`, e.target.value)}
                          rows={2}
                          placeholder="Working / steps..."
                          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none resize-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Submit section */}
            <div className="rounded-xl border border-border bg-adv-card p-5">
              {submitError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-adv-red/20 bg-adv-red/10 px-3 py-2 text-sm text-adv-red">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {submitError}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-sm text-adv-gray-med">
                  {answeredCount < totalQuestions && (
                    <span className="flex items-center gap-1.5 text-adv-gold">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {totalQuestions - answeredCount} question{totalQuestions - answeredCount !== 1 ? 's' : ''} unanswered
                    </span>
                  )}
                  {answeredCount === totalQuestions && (
                    <span className="flex items-center gap-1.5 text-adv-green">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      All questions answered
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleSubmit(answers)}
                  disabled={isSubmitting || answeredCount === 0}
                  className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Submit assignment
                </button>
              </div>

              {answeredCount > 0 && answeredCount < totalQuestions && (
                <p className="mt-2 text-xs text-adv-gray-med">
                  You can submit with unanswered questions — unanswered questions will receive 0 marks.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </SchoolLayout>
  );
}
