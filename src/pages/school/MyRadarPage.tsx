import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';
import {
  Loader2,
  RefreshCw,
  Newspaper,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';

interface RadarItem {
  headline: string;
  category: string;
  curriculumLink: string;
  discussionQuestion: string;
  chatPrompt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Sports:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Gaming:     'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Technology: 'bg-adv-teal/10 text-adv-teal border-adv-teal/20',
  Science:    'bg-green-500/10 text-green-400 border-green-500/20',
  Culture:    'bg-adv-gold/10 text-adv-gold border-adv-gold/20',
  World:      'bg-adv-gray/10 text-adv-gray border-adv-gray/20',
};

const SUBJECT_OPTIONS = [
  { value: 'mathematics',            label: 'Mathematics' },
  { value: 'svenska',                label: 'Svenska' },
  { value: 'english',                label: 'English' },
  { value: 'science',                label: 'Science' },
  { value: 'social-studies',         label: 'Social Studies' },
  { value: 'computational-thinking', label: 'Computational Thinking' },
  { value: 'technology',             label: 'Technology' },
];

// Persona display names (fallback to id)
const PERSONA_NAMES: Record<string, string> = {
  alma:   'Alma',
  saga:   'Saga',
  viktor: 'Viktor',
  erik:   'Erik',
  leo:    'Leo',
  freja:  'Freja',
  mia:    'Mia',
};

export default function MyRadarPage() {
  const { t } = useTranslation('school');
  const navigate = useNavigate();

  const [items, setItems] = useState<RadarItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState('mathematics');
  const [personaId, setPersonaId] = useState('alma');
  const [enrolledSubjects, setEnrolledSubjects] = useState<string[]>([]);

  // Load enrolled subjects from dashboard
  useEffect(() => {
    fetch('/api/school/dashboard', { headers: getAuthHeader() })
      .then((r) => r.ok ? r.json() : { classes: [] })
      .then((data) => {
        const subjects: string[] = (data.classes ?? []).map(
          (c: { subjectId: string }) => c.subjectId
        );
        if (subjects.length > 0) {
          setEnrolledSubjects(subjects);
          setSelectedSubject(subjects[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch radar items when subject changes
  useEffect(() => {
    loadRadar();
  }, [selectedSubject]);

  async function loadRadar() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/school/radar?subjectId=${encodeURIComponent(selectedSubject)}`,
        { headers: getAuthHeader() }
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      if (data.personaId) setPersonaId(data.personaId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load radar');
    } finally {
      setIsLoading(false);
    }
  }

  function handleExplore(item: RadarItem) {
    navigate(`/school/chat?q=${encodeURIComponent(item.chatPrompt)}`);
  }

  // Subject tabs — show enrolled first, then all
  const subjectTabs = enrolledSubjects.length > 0
    ? SUBJECT_OPTIONS.filter((s) => enrolledSubjects.includes(s.value))
    : SUBJECT_OPTIONS.slice(0, 3);

  const personaName = PERSONA_NAMES[personaId] ?? personaId;

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Newspaper className="h-5 w-5 text-adv-teal" />
              <h1 className="text-xl font-bold text-adv-white">
                {t('radar.title', 'My Radar')}
              </h1>
            </div>
            <p className="text-sm text-adv-gray">
              {t('radar.subtitle', 'See how today\'s world connects to your studies')}
            </p>
          </div>
          <button
            type="button"
            onClick={loadRadar}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal/40 hover:text-adv-off-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {t('radar.refresh', 'Refresh')}
          </button>
        </div>

        {/* Subject filter */}
        {subjectTabs.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {subjectTabs.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSelectedSubject(s.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selectedSubject === s.value
                    ? 'border-adv-teal bg-adv-teal/10 text-adv-teal'
                    : 'border-border text-adv-gray hover:border-adv-teal/30 hover:text-adv-off-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
            <span className="ml-2 text-sm text-adv-gray">
              {t('radar.loading', 'Finding connections...')}
            </span>
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-adv-red/20 bg-adv-red/5 p-4 text-sm text-adv-red">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && items.length === 0 && (
          <div className="rounded-xl border border-border bg-adv-card p-10 text-center">
            <Newspaper className="mx-auto mb-3 h-10 w-10 text-adv-gray" />
            <p className="text-sm text-adv-gray">
              {t('radar.noItems', 'No connections found. Try refreshing or selecting another subject.')}
            </p>
          </div>
        )}

        {/* Radar cards */}
        {!isLoading && !error && items.length > 0 && (
          <div className="space-y-4">
            {items.map((item, idx) => {
              const categoryClass = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS['World'];
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-adv-card p-5 space-y-3 hover:border-adv-teal/30 transition-colors"
                >
                  {/* Category chip + headline */}
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 mt-0.5 rounded-full border px-2 py-0.5 text-xs font-medium ${categoryClass}`}>
                      {item.category}
                    </span>
                    <h2 className="text-sm font-semibold text-adv-white leading-snug">
                      {item.headline}
                    </h2>
                  </div>

                  {/* Curriculum link */}
                  <div className="rounded-lg bg-adv-teal/5 border border-adv-teal/10 px-3 py-2">
                    <p className="text-xs font-medium text-adv-teal mb-0.5">How this connects to your studies</p>
                    <p className="text-xs text-adv-off-white">{item.curriculumLink}</p>
                  </div>

                  {/* Discussion question */}
                  <p className="text-xs italic text-adv-gray">
                    💬 {item.discussionQuestion}
                  </p>

                  {/* Explore button */}
                  <button
                    type="button"
                    onClick={() => handleExplore(item)}
                    className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {t('radar.exploreWith', 'Explore with {{persona}}', { persona: personaName })}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SchoolLayout>
  );
}
