import { useState, useEffect } from 'react';
import { getAuthHeader } from '@/lib/api';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';

interface SubmissionData {
  id: string;
  studentName: string;
  assignmentTitle: string;
  submittedAt: string;
  durationMinutes: number;
  answers: Array<{
    questionId: string;
    questionContent: string;
    studentAnswer: string;
    aiScore?: number;
    maxMarks: number;
  }>;
  aiGrade: {
    totalScore: string;
    strengths: string[];
    areasForImprovement: string[];
    suggestedGrade: string;
  };
  learningEvidenceLog: {
    summary: string;
    sessions: Array<{
      questionId: string;
      outcome: string;
      skillsDemonstrated: string[];
      steps: Array<{ type: string; content: string; timestamp: string }>;
    }>;
  };
  teacherGrade?: {
    grade: string;
    feedback: string;
  };
}

export default function SubmissionReviewerPage() {
  const { t } = useTranslation('school');
  const { submissionId } = useParams<{ submissionId: string }>();
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [teacherGrade, setTeacherGrade] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (submissionId) loadSubmission(submissionId);
  }, [submissionId]);

  async function loadSubmission(id: string) {
    try {
      const res = await fetch(`/api/school/submissions/${id}`, { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setSubmission(data);
        setTeacherGrade(data.teacherGrade?.grade ?? data.aiGrade?.suggestedGrade ?? '');
        setTeacherFeedback(data.teacherGrade?.feedback ?? '');
      }
    } catch { /* non-fatal */ }
    finally { setIsLoading(false); }
  }

  async function handleSaveGrade() {
    if (!submissionId) return;
    setIsSaving(true);
    try {
      await fetch(`/api/school/submissions/${submissionId}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ grade: teacherGrade, feedback: teacherFeedback }),
      });
    } catch { /* non-fatal */ }
    finally { setIsSaving(false); }
  }

  function toggleQuestion(id: string) {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleEvidence(id: string) {
    setExpandedEvidence((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return (
      <SchoolLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
        </div>
      </SchoolLayout>
    );
  }

  if (!submission) {
    return (
      <SchoolLayout>
        <p className="text-sm text-adv-gray">Submission not found.</p>
      </SchoolLayout>
    );
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Link to="/school/teacher" className="mt-0.5 rounded-lg p-1.5 text-adv-gray hover:text-adv-off-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-adv-white">{submission.assignmentTitle}</h1>
            <p className="text-sm text-adv-gray">
              {submission.studentName} · {new Date(submission.submittedAt).toLocaleDateString()} · {submission.durationMinutes}min
            </p>
          </div>
        </div>

        {/* AI Grade Summary */}
        <div className="rounded-xl border border-adv-teal/20 bg-adv-teal/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-adv-teal" />
            <h2 className="text-sm font-semibold text-adv-off-white">AI Assessment: {submission.aiGrade.totalScore}</h2>
            <span className="ms-auto rounded-full bg-adv-teal/20 px-2.5 py-0.5 text-sm font-medium text-adv-teal">
              Suggested: {submission.aiGrade.suggestedGrade}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="mb-1 font-medium text-adv-off-white">Strengths</p>
              <ul className="space-y-1 text-adv-gray">
                {submission.aiGrade.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 text-adv-teal">✓</span> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium text-adv-off-white">Areas for improvement</p>
              <ul className="space-y-1 text-adv-gray">
                {submission.aiGrade.areasForImprovement.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 text-adv-gold">→</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Answers */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-adv-off-white">Student Answers</h2>
          <div className="space-y-2">
            {submission.answers.map((ans, idx) => (
              <div key={ans.questionId} className="rounded-xl border border-border bg-adv-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleQuestion(ans.questionId)}
                  className="flex w-full items-center justify-between px-4 py-3 text-start"
                >
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-adv-gray" />
                    <span className="text-sm text-adv-off-white">
                      Q{idx + 1}: {ans.questionContent.slice(0, 60)}{ans.questionContent.length > 60 ? '...' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {ans.aiScore !== undefined && (
                      <span className="text-xs text-adv-teal">{ans.aiScore}/{ans.maxMarks}</span>
                    )}
                    {expandedQuestions.has(ans.questionId)
                      ? <ChevronDown className="h-4 w-4 text-adv-gray" />
                      : <ChevronRight className="h-4 w-4 text-adv-gray" />}
                  </div>
                </button>
                {expandedQuestions.has(ans.questionId) && (
                  <div className="border-t border-border px-4 pb-4 pt-3 text-sm text-adv-off-white">
                    <p className="mb-2 text-adv-gray">{ans.questionContent}</p>
                    <div className="rounded-lg bg-adv-dark p-3">
                      <p className="text-xs text-adv-gray mb-1">Student answer</p>
                      <p>{ans.studentAnswer}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Learning Evidence Log */}
        <section>
          <h2 className="mb-1 text-sm font-semibold text-adv-off-white">Learning Evidence Log</h2>
          <p className="mb-3 text-xs text-adv-gray">{submission.learningEvidenceLog.summary}</p>

          {submission.learningEvidenceLog.sessions.map((session) => (
            <div key={session.questionId} className="rounded-xl border border-border bg-adv-card overflow-hidden mb-2">
              <button
                type="button"
                onClick={() => toggleEvidence(session.questionId)}
                className="flex w-full items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-adv-off-white">{session.questionId}</span>
                  <span className="text-xs text-adv-teal">{session.outcome}</span>
                </div>
                {expandedEvidence.has(session.questionId)
                  ? <ChevronDown className="h-4 w-4 text-adv-gray" />
                  : <ChevronRight className="h-4 w-4 text-adv-gray" />}
              </button>
              {expandedEvidence.has(session.questionId) && (
                <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
                  {session.steps.map((step, i) => (
                    <div key={i} className={`text-xs px-3 py-2 rounded-lg ${
                      step.type.startsWith('ai_') || step.type === 'ai_scaffold'
                        ? 'bg-adv-teal/5 text-adv-off-white'
                        : 'bg-adv-dark text-adv-gray ms-4'
                    }`}>
                      <span className="text-adv-gray">[{step.type}]</span> {step.content}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {session.skillsDemonstrated.map((skill) => (
                      <span key={skill} className="rounded-full bg-adv-teal/10 px-2 py-0.5 text-xs text-adv-teal">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>

        {/* Teacher grade override */}
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-adv-off-white">Your Grade & Feedback</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-adv-gray mb-1">Grade</label>
              <input
                type="text"
                value={teacherGrade}
                onChange={(e) => setTeacherGrade(e.target.value)}
                placeholder="e.g. B / 14/17 / Pass"
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-adv-gray mb-1">Written feedback (optional)</label>
              <textarea
                value={teacherFeedback}
                onChange={(e) => setTeacherFeedback(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveGrade}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Save Grade
            </button>
          </div>
        </section>
      </div>
    </SchoolLayout>
  );
}
