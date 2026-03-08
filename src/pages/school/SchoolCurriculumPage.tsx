/**
 * SchoolCurriculumPage.tsx
 * Browse and manage curricula and lessons for a subject.
 * Located at /school/curriculum
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, ChevronRight, Plus, Clock, Brain, Loader2, Pencil, Trash2, Sparkles } from 'lucide-react';
import SchoolLayout from '../../components/school/SchoolLayout';
import { fetchWithAuth } from '@/lib/api';

interface Lesson {
  id: string;
  subject_id: string;
  curriculum_id: string | null;
  title: string;
  description: string | null;
  estimated_minutes: number;
  bloom_level: string;
  tier: string;
  published: number;
  content_blocks: unknown[];
  created_at: string;
}

interface Curriculum {
  id: string;
  subject_id: string;
  title: string;
  description: string | null;
  tier: string;
  language: string;
  created_at: string;
}

const BLOOM_COLORS: Record<string, string> = {
  remember: 'bg-adv-gray/20 text-adv-gray',
  understand: 'bg-adv-blue/20 text-adv-blue',
  apply: 'bg-adv-teal/20 text-adv-teal',
  analyze: 'bg-adv-gold/20 text-adv-gold',
  evaluate: 'bg-adv-red/20 text-adv-red',
  create: 'bg-purple-500/20 text-purple-400',
};

export default function SchoolCurriculumPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subjectId = searchParams.get('subject') || '';

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showGenForm, setShowGenForm] = useState(false);
  const [genTopic, setGenTopic] = useState('');
  const [genOutput, setGenOutput] = useState('');

  useEffect(() => {
    const params = subjectId ? `?subject_id=${subjectId}` : '';
    Promise.all([
      fetch(`/api/school/lessons${params}`).then(r => r.ok ? r.json() as Promise<Lesson[]> : []),
      fetch(`/api/school/curricula${params}`).then(r => r.ok ? r.json() as Promise<Curriculum[]> : []),
    ]).then(([les, cur]) => {
      setLessons(les);
      setCurricula(cur);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [subjectId]);

  async function generateLesson() {
    if (!genTopic.trim()) return;
    setGenerating(true);
    setGenOutput('');

    const response = await fetchWithAuth('/api/school/lessons/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: subjectId || 'general', topic: genTopic }),
    });

    if (!response.body) { setGenerating(false); return; }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let newLessonId = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const parsed = JSON.parse(raw) as { type: string; content: string };
            if (parsed.type === 'text_delta') setGenOutput(prev => prev + parsed.content);
            if (parsed.type === 'lesson_id') newLessonId = parsed.content;
          } catch {}
        }
      }
    }

    setGenerating(false);
    setShowGenForm(false);
    setGenTopic('');

    // Refresh lessons
    const params = subjectId ? `?subject_id=${subjectId}` : '';
    fetch(`/api/school/lessons${params}`)
      .then(r => r.ok ? r.json() as Promise<Lesson[]> : [])
      .then(setLessons);

    if (newLessonId) navigate(`/school/lesson/${newLessonId}`);
  }

  async function deleteLesson(id: string) {
    if (!confirm('Delete this lesson?')) return;
    await fetchWithAuth(`/api/school/lessons/${id}`, { method: 'DELETE' });
    setLessons(prev => prev.filter(l => l.id !== id));
  }

  return (
    <SchoolLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-gold/20">
              <BookOpen className="h-5 w-5 text-adv-gold" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-adv-white">Lesson Library</h1>
              <p className="text-xs text-adv-gray">{subjectId || 'All subjects'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowGenForm(true)}
              className="flex items-center gap-2 rounded-lg bg-adv-teal/10 border border-adv-teal/30 px-3 py-2 text-sm text-adv-teal hover:bg-adv-teal/20 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Generate with AI
            </button>
            <button
              onClick={() => navigate('/school/lesson-builder')}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Lesson
            </button>
          </div>
        </div>

        {/* Generate Form */}
        {showGenForm && (
          <div className="mb-6 rounded-xl border border-adv-teal/30 bg-adv-teal/5 p-4">
            <h3 className="text-sm font-medium text-adv-white mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-adv-teal" />
              Generate Lesson with AI
            </h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={genTopic}
                onChange={e => setGenTopic(e.target.value)}
                placeholder="Topic (e.g. 'Photosynthesis', 'World War I causes', 'Quadratic equations')"
                className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
              <button
                onClick={generateLesson}
                disabled={generating || !genTopic.trim()}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? 'Generating...' : 'Generate'}
              </button>
              <button onClick={() => setShowGenForm(false)} className="text-xs text-adv-gray hover:text-adv-off-white">Cancel</button>
            </div>
            {genOutput && (
              <div className="mt-3 rounded-lg bg-adv-dark p-3 text-xs text-adv-gray font-mono max-h-32 overflow-auto">
                {genOutput.slice(0, 500)}{genOutput.length > 500 ? '...' : ''}
              </div>
            )}
          </div>
        )}

        {/* Lessons Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-gray" />
          </div>
        ) : lessons.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-10 w-10 text-adv-gray mx-auto mb-3" />
            <p className="text-adv-gray text-sm">No lessons yet.</p>
            <p className="text-adv-gray text-xs mt-1">Create your first lesson or generate one with AI.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {lessons.map(lesson => (
              <div
                key={lesson.id}
                className="group rounded-xl border border-border bg-adv-card p-4 hover:border-adv-teal/40 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3
                    onClick={() => navigate(`/school/lesson/${lesson.id}`)}
                    className="text-sm font-medium text-adv-off-white group-hover:text-adv-white cursor-pointer transition-colors"
                  >
                    {lesson.title}
                  </h3>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => navigate(`/school/lesson-builder?id=${lesson.id}`)}
                      className="rounded p-1 text-adv-gray hover:text-adv-teal transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteLesson(lesson.id)}
                      className="rounded p-1 text-adv-gray hover:text-adv-red transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {lesson.description && (
                  <p className="text-xs text-adv-gray mb-2 line-clamp-2">{lesson.description}</p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${BLOOM_COLORS[lesson.bloom_level] || BLOOM_COLORS.understand}`}>
                    {lesson.bloom_level}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-adv-gray">
                    <Clock className="h-2.5 w-2.5" />
                    {lesson.estimated_minutes}m
                  </span>
                  <span className="flex items-center gap-1 text-xs text-adv-gray">
                    <Brain className="h-2.5 w-2.5" />
                    {lesson.content_blocks.length} blocks
                  </span>
                  {lesson.published ? (
                    <span className="text-xs text-adv-green">Published</span>
                  ) : (
                    <span className="text-xs text-adv-gray">Draft</span>
                  )}
                </div>

                <button
                  onClick={() => navigate(`/school/lesson/${lesson.id}`)}
                  className="mt-3 flex items-center gap-1 text-xs text-adv-teal hover:text-adv-teal-dark transition-colors"
                >
                  Open lesson <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SchoolLayout>
  );
}
