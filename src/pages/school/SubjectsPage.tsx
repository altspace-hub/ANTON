import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight, Loader2, GraduationCap, Users, FlaskConical, Globe2, MessageSquare, Code, Monitor, Briefcase, Brain, Atom, Dna, ScrollText, Lightbulb } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';

interface ClassRow {
  id: string;
  name: string;
  subject_id: string;
  education_tier: string;
  default_teacher_persona: string;
  completion_pct?: number;
  last_topic?: string;
  student_count?: number;
}

interface JoinForm {
  visible: boolean;
  code: string;
  loading: boolean;
  error: string | null;
}

// Static subject catalogue — available without a class code
const CATALOGUE = [
  {
    id: 'mathematics',
    nameKey: 'subject.mathematics',
    name: 'Mathematics',
    persona: 'Alma',
    icon: <BookOpen className="h-5 w-5 text-adv-teal" />,
    tier: 'T2',
    modules: ['Algebra', 'Geometry', 'Statistics', 'Functions', 'Number Theory'],
  },
  {
    id: 'svenska',
    nameKey: 'subject.svenska',
    name: 'Svenska',
    persona: 'Saga',
    icon: <MessageSquare className="h-5 w-5 text-adv-teal" />,
    tier: 'T2',
    modules: ['Reading Comprehension', 'Writing', 'Grammar', 'Literature', 'Oral Skills'],
  },
  {
    id: 'english',
    nameKey: 'subject.english',
    name: 'English',
    persona: 'Saga',
    icon: <Globe2 className="h-5 w-5 text-adv-teal" />,
    tier: 'T2',
    modules: ['Reading', 'Writing', 'Vocabulary', 'Grammar', 'Speaking'],
  },
  {
    id: 'science',
    nameKey: 'subject.science',
    name: 'Science (NO)',
    persona: 'Viktor',
    icon: <FlaskConical className="h-5 w-5 text-adv-teal" />,
    tier: 'T2',
    modules: ['Biology', 'Chemistry', 'Physics', 'Scientific Method'],
  },
  {
    id: 'social-studies',
    nameKey: 'subject.socialStudies',
    name: 'Social Studies (SO)',
    persona: 'Erik',
    icon: <Globe2 className="h-5 w-5 text-adv-teal" />,
    tier: 'T2',
    modules: ['History', 'Geography', 'Civics', 'Religion'],
  },
  {
    id: 'computational-thinking',
    nameKey: 'subject.computationalThinking',
    name: 'Coding',
    persona: 'Alma',
    icon: <Code className="h-5 w-5 text-adv-teal" />,
    tier: 'T2',
    modules: ['Code Explainer', 'Code Mentor', 'Debug Guide'],
    codingHub: true,
  },
  {
    id: 'technology',
    nameKey: 'subject.technology',
    name: 'Technology & Digital Skills',
    persona: 'Leo',
    icon: <Monitor className="h-5 w-5 text-adv-teal" />,
    tier: 'T2',
    modules: ['Web Literacy', 'Digital Citizenship', 'Data Handling', 'Creative Tech'],
  },
  {
    id: 'life-skills',
    nameKey: 'subject.lifeSkills',
    name: 'Life Skills',
    persona: 'Mia',
    icon: <Briefcase className="h-5 w-5 text-adv-teal" />,
    tier: 'T2',
    modules: ['Personal Finance', 'Career Exploration', 'Digital Presence', 'Home Essentials'],
  },
  {
    id: 'study-skills',
    nameKey: 'subject.studySkills',
    name: 'Study Skills',
    persona: 'Mia',
    icon: <Brain className="h-5 w-5 text-adv-teal" />,
    tier: 'T2',
    modules: ['Note-Taking', 'Time Management', 'Exam Strategy', 'Memory Techniques'],
  },
  // T3 Gymnasiet subjects
  {
    id: 'advanced-mathematics',
    nameKey: 'subject.advancedMathematics',
    name: 'Advanced Mathematics',
    persona: 'Alma',
    icon: <BookOpen className="h-5 w-5 text-adv-teal" />,
    tier: 'T3',
    modules: ['Calculus', 'Linear Algebra', 'Complex Numbers', 'Advanced Probability'],
  },
  {
    id: 'physics',
    nameKey: 'subject.physics',
    name: 'Physics (Fysik 1–2)',
    persona: 'Viktor',
    icon: <Atom className="h-5 w-5 text-adv-teal" />,
    tier: 'T3',
    modules: ['Mechanics', 'Electricity & Magnetism', 'Waves & Optics', 'Quantum Physics'],
  },
  {
    id: 'chemistry',
    nameKey: 'subject.chemistry',
    name: 'Chemistry (Kemi 1–2)',
    persona: 'Viktor',
    icon: <FlaskConical className="h-5 w-5 text-adv-teal" />,
    tier: 'T3',
    modules: ['Organic Chemistry', 'Reactions & Equilibrium', 'Lab Methodology'],
  },
  {
    id: 'biology',
    nameKey: 'subject.biology',
    name: 'Biology (Biologi 1–2)',
    persona: 'Viktor',
    icon: <Dna className="h-5 w-5 text-adv-teal" />,
    tier: 'T3',
    modules: ['Genetics', 'Ecology', 'Human Biology', 'Evolution'],
  },
  {
    id: 'swedish-advanced',
    nameKey: 'subject.swedishAdvanced',
    name: 'Swedish Advanced (Svenska 2–3)',
    persona: 'Saga',
    icon: <ScrollText className="h-5 w-5 text-adv-teal" />,
    tier: 'T3',
    modules: ['Literary Analysis', 'Essay Writing', 'Rhetoric'],
  },
  {
    id: 'philosophy',
    nameKey: 'subject.philosophy',
    name: 'Philosophy (Filosofi 1–2)',
    persona: 'Erik',
    icon: <Lightbulb className="h-5 w-5 text-adv-teal" />,
    tier: 'T3',
    modules: ['Epistemology', 'Ethics', 'Logic', 'Political Philosophy'],
  },
];

export default function SubjectsPage() {
  const { t } = useTranslation('school');
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joinForm, setJoinForm] = useState<JoinForm>({ visible: false, code: '', loading: false, error: null });
  const [activeTab, setActiveTab] = useState<'mine' | 'browse'>('browse');
  const [browseTier, setBrowseTier] = useState<'T2' | 'T3'>('T2');

  useEffect(() => {
    loadClasses();
  }, []);

  async function loadClasses() {
    try {
      const res = await fetch('/api/school/classes', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setClasses(list);
        // If they have classes, default to "My Classes" tab
        if (list.length > 0) setActiveTab('mine');
      }
    } catch {
      // non-fatal
    } finally {
      setIsLoading(false);
    }
  }

  async function handleJoin() {
    const code = joinForm.code.trim().toUpperCase();
    if (!code) return;
    setJoinForm((p) => ({ ...p, loading: true, error: null }));
    try {
      const res = await fetch('/api/school/classes/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ classCode: code }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Join failed' }));
        throw new Error(err.error ?? 'Join failed');
      }
      setJoinForm({ visible: false, code: '', loading: false, error: null });
      loadClasses();
    } catch (err) {
      setJoinForm((p) => ({
        ...p,
        loading: false,
        error: err instanceof Error ? err.message : 'Join failed',
      }));
    }
  }

  function tierLabel(tier: string) {
    if (tier === 'T2') return t('onboarding.student.step1.tierT2', 'Years 7–9');
    if (tier === 'T3') return t('onboarding.student.step1.tierT3', 'Years 10–12');
    if (tier === 'T4') return t('onboarding.student.step1.tierT4', 'University');
    return tier;
  }

  function handleStudySubject(subjectId: string, classId?: string) {
    if (subjectId === 'computational-thinking') {
      navigate('/school/coding');
      return;
    }
    const url = classId
      ? `/school/chat?classId=${classId}`
      : `/school/chat?subjectId=${subjectId}`;
    navigate(url);
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-adv-white">{t('nav.subjects', 'Subjects')}</h1>
          </div>
          <button
            type="button"
            onClick={() => setJoinForm((p) => ({ ...p, visible: !p.visible }))}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <GraduationCap className="h-4 w-4" />
            {t('onboarding.student.step3.join', 'Join class')}
          </button>
        </div>

        {/* Join class form */}
        {joinForm.visible && (
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-4 space-y-3">
            <p className="text-sm font-medium text-adv-off-white">
              {t('onboarding.student.step3.enterCode', 'Enter the class code from your teacher')}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinForm.code}
                onChange={(e) => setJoinForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder={t('onboarding.student.step3.codePlaceholder', 'e.g. MATH-9B-2026')}
                className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm font-mono text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
              <button
                type="button"
                onClick={handleJoin}
                disabled={!joinForm.code.trim() || joinForm.loading}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {joinForm.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('onboarding.student.step3.join', 'Join')}
              </button>
              <button
                type="button"
                onClick={() => setJoinForm({ visible: false, code: '', loading: false, error: null })}
                className="rounded-lg border border-border px-3 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
              >
                {t('onboarding.student.step3.skip', 'Cancel')}
              </button>
            </div>
            {joinForm.error && <p className="text-sm text-adv-red">{joinForm.error}</p>}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-border bg-adv-card p-1">
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === 'browse' ? 'bg-adv-teal/10 text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}
          >
            Browse Subjects
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mine')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === 'mine' ? 'bg-adv-teal/10 text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}
          >
            My Classes
            {classes.length > 0 && (
              <span className="ml-1.5 rounded-full bg-adv-dark px-1.5 py-0.5 text-xs text-adv-gray-med">
                {classes.length}
              </span>
            )}
          </button>
        </div>

        {/* Browse tab — static catalogue with tier filter */}
        {activeTab === 'browse' && (
          <div className="space-y-3">
            {/* Tier sub-tabs */}
            <div className="flex gap-1 rounded-lg border border-border bg-adv-dark p-1">
              <button
                type="button"
                onClick={() => setBrowseTier('T2')}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${browseTier === 'T2' ? 'bg-adv-teal/10 text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}
              >
                {t('onboarding.student.step1.tierT2', 'Years 7–9')} (Grundskola)
              </button>
              <button
                type="button"
                onClick={() => setBrowseTier('T3')}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${browseTier === 'T3' ? 'bg-adv-teal/10 text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}
              >
                {t('onboarding.student.step1.tierT3', 'Years 10–12')} (Gymnasiet)
              </button>
            </div>

            {CATALOGUE.filter((s) => s.tier === browseTier).map((subject) => (
              <div key={subject.id} className="rounded-xl border border-border bg-adv-card p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-adv-teal/10">
                    {subject.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-adv-white">
                        {t(subject.nameKey, subject.name)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-adv-gray-med">
                      with {subject.persona} · {subject.modules.join(', ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStudySubject(subject.id)}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                  >
                    {t('dashboard.startStudying', 'Study')}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* My Classes tab */}
        {activeTab === 'mine' && (
          <>
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-adv-teal" />
              </div>
            )}

            {!isLoading && classes.length === 0 && (
              <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-adv-teal/10">
                  <GraduationCap className="h-6 w-6 text-adv-teal" />
                </div>
                <p className="text-base font-semibold text-adv-white">
                  {t('dashboard.noClasses', "You're not enrolled in any classes yet.")}
                </p>
                <p className="mt-1.5 text-sm text-adv-gray-med">
                  {t('dashboard.enrollPrompt', 'Ask your teacher for a class code to get started.')}
                </p>
                <button
                  type="button"
                  onClick={() => { setActiveTab('browse'); }}
                  className="mt-4 flex items-center gap-1.5 mx-auto rounded-lg border border-adv-teal/30 px-5 py-2 text-sm text-adv-teal hover:bg-adv-teal/10 transition-colors"
                >
                  Browse subjects without a class
                </button>
              </div>
            )}

            {classes.map((cls) => (
              <div key={cls.id} className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-adv-white truncate">{cls.name}</h2>
                      <span className="shrink-0 rounded-full border border-adv-teal/30 bg-adv-teal/10 px-2 py-0.5 text-xs font-medium text-adv-teal">
                        {tierLabel(cls.education_tier)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-adv-gray capitalize">
                      {t(`subject.${cls.subject_id}`, cls.subject_id)}
                      {cls.student_count !== undefined && (
                        <span className="ml-3 inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {cls.student_count}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStudySubject(cls.subject_id, cls.id)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                  >
                    {t('dashboard.startStudying', 'Study')}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {cls.completion_pct !== undefined && (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-adv-gray-med">
                      <span>{cls.last_topic ?? t(`subject.${cls.subject_id}`, cls.subject_id)}</span>
                      <span>{t('dashboard.progressLabel', '{{pct}}% complete', { pct: Math.round(cls.completion_pct ?? 0) })}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
                      <div className="h-full rounded-full bg-adv-teal transition-all" style={{ width: `${cls.completion_pct ?? 0}%` }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </SchoolLayout>
  );
}
