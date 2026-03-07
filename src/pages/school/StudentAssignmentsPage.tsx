import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Loader2, Download, ChevronRight, Clock, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';

interface Assignment {
  id: string;
  title: string;
  class_name: string;
  class_id: string;
  assignment_type: 'homework' | 'exam' | 'practice';
  assistance_level_override?: string;
  due_date?: string;
  submission_id?: string;
  submitted_at?: string;
  teacher_grade?: number;
}

type Tab = 'pending' | 'completed' | 'all';

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StudentAssignmentsPage() {
  const { t } = useTranslation('school');
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('pending');

  useEffect(() => {
    loadAssignments();
  }, []);

  async function loadAssignments() {
    try {
      const res = await fetch('/api/school/assignments', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setAssignments(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-fatal
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDownloadAnton(id: string, title: string) {
    try {
      const res = await fetch(`/api/school/assignments/${id}/export-anton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.anton`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // non-fatal
    }
  }

  async function handleDownloadSubmissionLog(submissionId: string, title: string) {
    try {
      const res = await fetch(`/api/school/submissions/${submissionId}/export-anton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '-').toLowerCase()}-submission.anton`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // non-fatal
    }
  }

  const pending = assignments.filter((a) => !a.submitted_at);
  const completed = assignments.filter((a) => !!a.submitted_at);

  const displayed = activeTab === 'pending' ? pending : activeTab === 'completed' ? completed : assignments;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'pending', label: 'Pending', count: pending.length },
    { id: 'completed', label: 'Completed', count: completed.length },
    { id: 'all', label: 'All', count: assignments.length },
  ];

  function typeLabel(type: string) {
    if (type === 'homework') return t('teacher.assignment.typeHomework', 'Homework');
    if (type === 'exam') return t('teacher.assignment.typeExam', 'Exam');
    return t('teacher.assignment.typePractice', 'Practice');
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-adv-white">{t('nav.assignments', 'Assignments')}</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-border bg-adv-card p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal ${
                activeTab === tab.id
                  ? 'bg-adv-teal/10 text-adv-teal'
                  : 'text-adv-gray hover:text-adv-off-white'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                  activeTab === tab.id ? 'bg-adv-teal/20 text-adv-teal' : 'bg-adv-dark text-adv-gray'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-adv-teal" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && displayed.length === 0 && (
          <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-adv-teal/10">
              <ClipboardList className="h-6 w-6 text-adv-teal" />
            </div>
            <p className="text-base font-semibold text-adv-white">
              {activeTab === 'pending' ? 'No pending assignments' : activeTab === 'completed' ? 'No completed assignments yet' : 'No assignments yet'}
            </p>
            <p className="mt-1 text-sm text-adv-gray">
              Assignments from your classes will appear here.
            </p>
          </div>
        )}

        {/* Assignment cards */}
        {!isLoading && displayed.map((a) => {
          const overdue = isOverdue(a.due_date) && !a.submitted_at;
          return (
            <div
              key={a.id}
              className={`rounded-xl border bg-adv-card p-4 ${overdue ? 'border-adv-red/30' : 'border-border'}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-adv-white truncate">{a.title}</span>
                    {overdue && (
                      <span className="flex items-center gap-1 rounded-full bg-adv-red/15 px-2 py-0.5 text-xs font-medium text-adv-red">
                        <AlertCircle className="h-3 w-3" />
                        Overdue
                      </span>
                    )}
                    {a.submitted_at && (
                      <span className="flex items-center gap-1 rounded-full bg-adv-green/10 px-2 py-0.5 text-xs font-medium text-adv-green">
                        <CheckCircle2 className="h-3 w-3" />
                        Submitted
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-adv-gray">
                    <span>{a.class_name}</span>
                    <span className="rounded-full border border-border px-2 py-0.5">{typeLabel(a.assignment_type)}</span>
                    {a.assistance_level_override && (
                      <span className="rounded-full border border-adv-teal/20 bg-adv-teal/5 px-2 py-0.5 text-adv-teal">
                        {a.assistance_level_override}
                      </span>
                    )}
                    {a.due_date && (
                      <span className={`flex items-center gap-1 ${overdue ? 'text-adv-red' : ''}`}>
                        <Clock className="h-3 w-3" />
                        {formatDate(a.due_date)}
                      </span>
                    )}
                    {a.teacher_grade !== undefined && a.teacher_grade !== null && (
                      <span className="font-medium text-adv-gold">{a.teacher_grade}%</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadAnton(a.id, a.title)}
                    className="rounded-lg border border-border p-1.5 text-adv-gray hover:text-adv-off-white transition-colors"
                    title={t('teacher.assignment.export', 'Export assignment as .anton')}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  {a.submitted_at && a.submission_id && (
                    <button
                      type="button"
                      onClick={() => handleDownloadSubmissionLog(a.submission_id!, a.title)}
                      className="rounded-lg border border-border p-1.5 text-adv-gray hover:text-adv-off-white transition-colors"
                      title="Export submission audit log as .anton"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!a.submitted_at && (
                    <button
                      type="button"
                      onClick={() => navigate(`/school/assignments/${a.id}/take`)}
                      className="flex items-center gap-1 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                    >
                      Start
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SchoolLayout>
  );
}
