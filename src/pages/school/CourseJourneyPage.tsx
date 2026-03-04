import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';
import {
  BookOpen,
  Loader2,
  ChevronRight,
  CheckCircle2,
  Circle,
  PlayCircle,
  TrendingUp,
  Clock,
  Users,
  FlaskConical,
  Globe2,
  MessageSquare,
  Code,
} from 'lucide-react';

interface ClassCard {
  id: string;
  name: string;
  subjectId: string;
  educationTier: string;
  overallProgressPct: number;
  teacherPersona: string;
  currentTopic?: string;
  dueDate?: string;
}

interface TopicModule {
  id: string;
  label: string;
  description?: string;
}

// Static curriculum map — topic blocks per subject
const SUBJECT_MODULES: Record<string, TopicModule[]> = {
  mathematics: [
    { id: 'number-theory', label: 'Number Theory', description: 'Integers, primes, factors, fractions' },
    { id: 'algebra', label: 'Algebra', description: 'Equations, expressions, inequalities' },
    { id: 'geometry', label: 'Geometry', description: 'Shapes, angles, area, volume' },
    { id: 'statistics', label: 'Statistics', description: 'Data, graphs, probability' },
    { id: 'functions', label: 'Functions', description: 'Linear, quadratic, exponential' },
  ],
  svenska: [
    { id: 'reading', label: 'Reading Comprehension', description: 'Texts, strategies, analysis' },
    { id: 'writing', label: 'Writing', description: 'Essays, reports, creative writing' },
    { id: 'grammar', label: 'Grammar', description: 'Syntax, spelling, punctuation' },
    { id: 'literature', label: 'Literature', description: 'Novels, poetry, short stories' },
    { id: 'oral', label: 'Oral Skills', description: 'Presentations, discussions, debates' },
  ],
  english: [
    { id: 'reading', label: 'Reading', description: 'Comprehension, vocabulary in context' },
    { id: 'writing', label: 'Writing', description: 'Paragraphs, essays, emails' },
    { id: 'vocabulary', label: 'Vocabulary', description: 'Word families, idioms, collocations' },
    { id: 'grammar', label: 'Grammar', description: 'Tenses, conditionals, passive voice' },
    { id: 'speaking', label: 'Speaking', description: 'Conversations, presentations, debates' },
  ],
  science: [
    { id: 'scientific-method', label: 'Scientific Method', description: 'Hypotheses, experiments, analysis' },
    { id: 'biology', label: 'Biology', description: 'Cells, organisms, ecosystems' },
    { id: 'chemistry', label: 'Chemistry', description: 'Matter, reactions, periodic table' },
    { id: 'physics', label: 'Physics', description: 'Forces, energy, waves, electricity' },
  ],
  'social-studies': [
    { id: 'history', label: 'History', description: 'World events, causes, perspectives' },
    { id: 'geography', label: 'Geography', description: 'Landscapes, climate, populations' },
    { id: 'civics', label: 'Civics', description: 'Democracy, rights, political systems' },
    { id: 'religion', label: 'Religion & Ethics', description: 'World religions, ethics, values' },
  ],
  'computational-thinking': [
    { id: 'code-explainer', label: 'Code Explainer', description: 'Understand existing code' },
    { id: 'code-mentor', label: 'Code Mentor', description: 'Build projects with guidance' },
    { id: 'debug-guide', label: 'Debug Guide', description: 'Find and fix errors' },
  ],
};

const SUBJECT_ICONS: Record<string, React.ReactNode> = {
  mathematics: <BookOpen className="h-4 w-4 text-adv-teal" />,
  svenska: <MessageSquare className="h-4 w-4 text-adv-teal" />,
  english: <Globe2 className="h-4 w-4 text-adv-teal" />,
  science: <FlaskConical className="h-4 w-4 text-adv-teal" />,
  'social-studies': <Globe2 className="h-4 w-4 text-adv-teal" />,
  'computational-thinking': <Code className="h-4 w-4 text-adv-teal" />,
};

function getTopicStatus(
  topic: TopicModule,
  allTopics: TopicModule[],
  currentTopic: string | undefined,
  progressPct: number,
): 'done' | 'active' | 'upcoming' {
  if (!currentTopic) {
    // Estimate from progress: topics proportionally
    const idx = allTopics.findIndex((t) => t.id === topic.id);
    const cutoff = Math.floor((progressPct / 100) * allTopics.length);
    if (idx < cutoff) return 'done';
    if (idx === cutoff) return 'active';
    return 'upcoming';
  }
  const currentIdx = allTopics.findIndex((t) => t.label.toLowerCase() === currentTopic.toLowerCase() || t.id === currentTopic);
  const topicIdx = allTopics.findIndex((t) => t.id === topic.id);
  if (currentIdx === -1) return 'upcoming';
  if (topicIdx < currentIdx) return 'done';
  if (topicIdx === currentIdx) return 'active';
  return 'upcoming';
}

function getStudyLink(cls: ClassCard, topic: TopicModule): string {
  if (cls.subjectId === 'computational-thinking') {
    return `/school/coding/${topic.id}`;
  }
  return `/school/chat?classId=${cls.id}&topic=${encodeURIComponent(topic.label)}`;
}

export default function CourseJourneyPage() {
  const { t } = useTranslation('school');
  const [classes, setClasses] = useState<ClassCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/school/dashboard', { headers: getAuthHeader() })
      .then((r) => r.ok ? r.json() : { classes: [] })
      .then((data) => {
        const loaded: ClassCard[] = data.classes ?? [];
        setClasses(loaded);
        if (loaded.length > 0) setExpandedClass(loaded[0].id);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-adv-white">
            {t('journey.title', 'My Learning Journey')}
          </h1>
          <p className="mt-0.5 text-sm text-adv-gray-med">
            {t('journey.subtitle', 'Track your progress through each subject')}
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && classes.length === 0 && (
          <div className="rounded-xl border border-border bg-adv-card p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-adv-teal/10">
              <TrendingUp className="h-6 w-6 text-adv-teal" />
            </div>
            <p className="text-base font-semibold text-adv-white">No classes yet</p>
            <p className="mt-1 text-sm text-adv-gray-med">Join a class to start your learning journey.</p>
            <Link
              to="/school/subjects"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              {t('nav.subjects', 'Subjects')}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* Class journey cards */}
        {classes.map((cls) => {
          const modules = SUBJECT_MODULES[cls.subjectId] ?? [];
          const isExpanded = expandedClass === cls.id;
          const doneCount = modules.filter(
            (m) => getTopicStatus(m, modules, cls.currentTopic, cls.overallProgressPct) === 'done'
          ).length;

          return (
            <div key={cls.id} className="rounded-xl border border-border bg-adv-card overflow-hidden">
              {/* Class header — clickable to expand/collapse */}
              <button
                type="button"
                onClick={() => setExpandedClass(isExpanded ? null : cls.id)}
                className="flex w-full items-center gap-3 p-5 text-left hover:bg-adv-dark/30 transition-colors"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-adv-teal/10">
                  {SUBJECT_ICONS[cls.subjectId] ?? <BookOpen className="h-4 w-4 text-adv-teal" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-adv-white truncate">{cls.name}</p>
                    <span className="rounded-full border border-border px-1.5 py-0.5 text-xs text-adv-gray-med">
                      {cls.educationTier}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-adv-dark">
                      <div
                        className="h-full rounded-full bg-adv-teal transition-all"
                        style={{ width: `${cls.overallProgressPct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs text-adv-teal">{cls.overallProgressPct}%</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-adv-gray-med">
                    {doneCount}/{modules.length} topics
                  </p>
                  {cls.dueDate && (
                    <p className="flex items-center justify-end gap-1 text-xs text-adv-gold mt-0.5">
                      <Clock className="h-3 w-3" />
                      {new Date(cls.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
                <ChevronRight className={`h-4 w-4 shrink-0 text-adv-gray-med transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>

              {/* Topic timeline */}
              {isExpanded && (
                <div className="border-t border-border px-5 pb-5 pt-4">
                  {cls.currentTopic && (
                    <p className="mb-3 flex items-center gap-1.5 text-xs text-adv-gray-med">
                      <Users className="h-3.5 w-3.5" />
                      Class is currently studying: <span className="font-medium text-adv-off-white">{cls.currentTopic}</span>
                    </p>
                  )}

                  {modules.length === 0 && (
                    <p className="text-sm text-adv-gray-med">No topics available for this subject yet.</p>
                  )}

                  <div className="space-y-2">
                    {modules.map((topic, idx) => {
                      const status = getTopicStatus(topic, modules, cls.currentTopic, cls.overallProgressPct);
                      const isLast = idx === modules.length - 1;
                      const studyLink = getStudyLink(cls, topic);

                      return (
                        <div key={topic.id} className="flex gap-3">
                          {/* Timeline line */}
                          <div className="flex flex-col items-center">
                            {status === 'done' && <CheckCircle2 className="h-5 w-5 text-adv-green shrink-0" />}
                            {status === 'active' && <PlayCircle className="h-5 w-5 text-adv-teal shrink-0 animate-pulse" />}
                            {status === 'upcoming' && <Circle className="h-5 w-5 text-adv-gray-med shrink-0" />}
                            {!isLast && (
                              <div className={`mt-1 w-px flex-1 min-h-[16px] ${status === 'done' ? 'bg-adv-green/40' : 'bg-border'}`} />
                            )}
                          </div>

                          {/* Topic content */}
                          <div className={`flex-1 pb-3 ${isLast ? '' : ''}`}>
                            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
                              status === 'active'
                                ? 'bg-adv-teal/5 border border-adv-teal/20'
                                : status === 'done'
                                ? 'bg-adv-dark/50'
                                : 'bg-transparent'
                            }`}>
                              <div>
                                <p className={`text-sm font-medium ${
                                  status === 'active' ? 'text-adv-teal'
                                  : status === 'done' ? 'text-adv-gray'
                                  : 'text-adv-off-white'
                                }`}>
                                  {topic.label}
                                  {status === 'active' && (
                                    <span className="ml-2 rounded-full bg-adv-teal/20 px-1.5 py-0.5 text-xs text-adv-teal">
                                      Current
                                    </span>
                                  )}
                                </p>
                                {topic.description && (
                                  <p className="mt-0.5 text-xs text-adv-gray-med">{topic.description}</p>
                                )}
                              </div>

                              {(status === 'active' || status === 'done') && (
                                <Link
                                  to={studyLink}
                                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors shrink-0 ${
                                    status === 'active'
                                      ? 'bg-adv-teal text-adv-dark hover:bg-adv-teal-dark'
                                      : 'border border-border text-adv-gray hover:text-adv-off-white'
                                  }`}
                                >
                                  {status === 'active' ? 'Study' : 'Revise'}
                                  <ChevronRight className="h-3 w-3" />
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SchoolLayout>
  );
}
