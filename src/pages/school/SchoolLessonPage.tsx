/**
 * SchoolLessonPage.tsx
 * Renders a lesson with all content block types:
 * text, video, audio, link, image, embed, exercise, quiz, ai_discussion, checkpoint, key_concepts, divider
 * Located at /school/lesson/:lessonId
 */
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, BookOpen, Clock, Brain, Check, X, Play,
  ExternalLink, Loader2, MessageCircle, Lightbulb, AlertCircle, CheckCircle2
} from 'lucide-react';
import SchoolLayout from '../../components/school/SchoolLayout';
import VideoPlayer from '../../components/school/VideoPlayer';

interface ContentBlock {
  type: string;
  content?: string;
  title?: string;
  // video
  provider?: string;
  video_id?: string;
  search_query?: string;
  channel?: string;
  start_time?: number;
  // quiz
  question?: string;
  options?: string[];
  correct?: number;
  explanation?: string;
  // embed
  url?: string;
  height?: number;
  // key_concepts
  concepts?: { term: string; definition: string }[];
  // exercise
  solution?: string;
  // checkpoint
  check_question?: string;
}

interface Lesson {
  id: string;
  subject_id: string;
  title: string;
  description: string | null;
  content_blocks: ContentBlock[];
  estimated_minutes: number;
  bloom_level: string;
  tier: string;
}

interface QuizState {
  selected: number | null;
  revealed: boolean;
}

export default function SchoolLessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [quizStates, setQuizStates] = useState<Record<number, QuizState>>({});
  const [completedBlocks, setCompletedBlocks] = useState<Set<number>>(new Set());
  const [aiResponses, setAiResponses] = useState<Record<number, string>>({});
  const [aiLoading, setAiLoading] = useState<Record<number, boolean>>({});
  const [aiInput, setAiInput] = useState<Record<number, string>>({});
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!lessonId) return;
    fetch(`/api/school/lessons/${lessonId}`)
      .then(r => r.ok ? r.json() as Promise<Lesson> : null)
      .then(data => { if (data) setLesson(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [lessonId]);

  function markBlockComplete(index: number) {
    setCompletedBlocks(prev => new Set([...prev, index]));
    if (lessonId) {
      fetch(`/api/school/lessons/${lessonId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed_block: String(index), student_user_id: 'default' }),
      }).catch(() => {});
    }
  }

  function handleQuizAnswer(blockIndex: number, optionIndex: number) {
    setQuizStates(prev => ({ ...prev, [blockIndex]: { selected: optionIndex, revealed: true } }));
  }

  async function handleAiDiscussion(blockIndex: number, block: ContentBlock) {
    const question = aiInput[blockIndex]?.trim() || block.content || '';
    if (!question) return;
    setAiLoading(prev => ({ ...prev, [blockIndex]: true }));
    setAiResponses(prev => ({ ...prev, [blockIndex]: '' }));

    const response = await fetch('/api/school/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: question,
        subjectId: lesson?.subject_id || 'general',
        additionalContext: `This is for lesson: "${lesson?.title}". Keep response educational and concise.`,
      }),
    });

    if (!response.body) { setAiLoading(prev => ({ ...prev, [blockIndex]: false })); return; }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
            if (parsed.type === 'text_delta') {
              setAiResponses(prev => ({ ...prev, [blockIndex]: (prev[blockIndex] || '') + parsed.content }));
            }
          } catch {}
        }
      }
    }
    setAiLoading(prev => ({ ...prev, [blockIndex]: false }));
    setAiInput(prev => ({ ...prev, [blockIndex]: '' }));
  }

  function renderBlock(block: ContentBlock, index: number) {
    const isCompleted = completedBlocks.has(index);

    switch (block.type) {
      case 'text':
        return (
          <div key={index} className="rounded-xl border border-border bg-adv-card p-5">
            <div className="prose prose-invert max-w-none text-sm text-adv-off-white leading-relaxed whitespace-pre-wrap">
              {block.content}
            </div>
            {!isCompleted && (
              <button onClick={() => markBlockComplete(index)} className="mt-3 text-xs text-adv-teal hover:underline">
                ✓ Mark as read
              </button>
            )}
          </div>
        );

      case 'video':
        return (
          <div key={index} className="rounded-xl overflow-hidden border border-border">
            {block.video_id ? (
              <VideoPlayer
                videoId={block.video_id}
                title={block.title || block.content}
                channel={block.channel}
                startTime={block.start_time || 0}
              />
            ) : (
              <div className="bg-adv-card p-5 flex items-center gap-3">
                <Play className="h-5 w-5 text-adv-gray" />
                <div>
                  <p className="text-sm text-adv-off-white">{block.title || 'Video Resource'}</p>
                  {block.search_query && (
                    <a
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(block.search_query)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-adv-teal hover:underline flex items-center gap-1 mt-1"
                    >
                      Search: "{block.search_query}" <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 'quiz': {
        const state = quizStates[index];
        const isCorrect = state?.revealed && state.selected === block.correct;
        return (
          <div key={index} className={`rounded-xl border p-5 ${state?.revealed ? (isCorrect ? 'border-adv-green/50 bg-adv-green/5' : 'border-adv-red/50 bg-adv-red/5') : 'border-border bg-adv-card'}`}>
            <div className="flex items-start gap-2 mb-4">
              <Brain className="h-4 w-4 text-adv-gold shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-adv-white">{block.question}</p>
            </div>
            <div className="space-y-2">
              {(block.options || []).map((option, optIdx) => {
                let btnClass = 'border-border bg-adv-dark text-adv-off-white hover:border-adv-gray/50';
                if (state?.revealed) {
                  if (optIdx === block.correct) btnClass = 'border-adv-green bg-adv-green/10 text-adv-green';
                  else if (optIdx === state.selected) btnClass = 'border-adv-red bg-adv-red/10 text-adv-red';
                  else btnClass = 'border-border bg-adv-dark text-adv-gray opacity-50';
                }
                return (
                  <button
                    key={optIdx}
                    onClick={() => !state?.revealed && handleQuizAnswer(index, optIdx)}
                    disabled={state?.revealed}
                    className={`w-full text-left rounded-lg border px-4 py-2.5 text-sm transition-all ${btnClass}`}
                  >
                    <span className="font-medium mr-2">{String.fromCharCode(65 + optIdx)}.</span>
                    {option}
                  </button>
                );
              })}
            </div>
            {state?.revealed && (
              <div className="mt-3 rounded-lg bg-adv-dark px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  {isCorrect ? <CheckCircle2 className="h-4 w-4 text-adv-green" /> : <X className="h-4 w-4 text-adv-red" />}
                  <span className={`text-sm font-medium ${isCorrect ? 'text-adv-green' : 'text-adv-red'}`}>
                    {isCorrect ? 'Correct!' : 'Not quite.'}
                  </span>
                </div>
                {block.explanation && <p className="text-xs text-adv-gray">{block.explanation}</p>}
                {isCorrect && !isCompleted && (
                  <button onClick={() => markBlockComplete(index)} className="mt-2 text-xs text-adv-teal hover:underline">
                    Continue →
                  </button>
                )}
              </div>
            )}
          </div>
        );
      }

      case 'exercise':
        return (
          <div key={index} className="rounded-xl border border-adv-gold/30 bg-adv-gold/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-adv-gold" />
              <span className="text-sm font-medium text-adv-gold">Exercise</span>
            </div>
            <p className="text-sm text-adv-off-white whitespace-pre-wrap mb-3">{block.content}</p>
            {block.solution && (
              <details className="mt-3">
                <summary className="text-xs text-adv-teal cursor-pointer hover:underline">Show solution hint</summary>
                <p className="mt-2 text-xs text-adv-gray rounded-lg bg-adv-dark p-3">{block.solution}</p>
              </details>
            )}
            {!isCompleted && (
              <button onClick={() => markBlockComplete(index)} className="mt-3 text-xs text-adv-teal hover:underline">
                ✓ Mark exercise complete
              </button>
            )}
          </div>
        );

      case 'key_concepts':
        return (
          <div key={index} className="rounded-xl border border-border bg-adv-card p-5">
            <h3 className="text-sm font-semibold text-adv-white mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-adv-teal" />
              Key Concepts
            </h3>
            <dl className="space-y-3">
              {(block.concepts || []).map((c, ci) => (
                <div key={ci} className="rounded-lg bg-adv-dark p-3">
                  <dt className="text-sm font-medium text-adv-teal mb-1">{c.term}</dt>
                  <dd className="text-xs text-adv-gray">{c.definition}</dd>
                </div>
              ))}
            </dl>
          </div>
        );

      case 'embed':
        return (
          <div key={index} className="rounded-xl border border-border overflow-hidden">
            <div className="bg-adv-dark-2 px-4 py-2 flex items-center justify-between border-b border-border">
              <span className="text-xs text-adv-gray">{block.title || 'Interactive Resource'}</span>
              {block.url && (
                <a href={block.url} target="_blank" rel="noopener noreferrer" className="text-xs text-adv-teal hover:underline flex items-center gap-1">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {block.url && (
              <iframe
                src={block.url}
                title={block.title || 'Interactive embed'}
                className="w-full"
                style={{ height: `${block.height || 400}px`, border: 'none' }}
                sandbox="allow-scripts allow-forms"
              />
            )}
          </div>
        );

      case 'ai_discussion':
        return (
          <div key={index} className="rounded-xl border border-adv-teal/30 bg-adv-teal/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="h-4 w-4 text-adv-teal" />
              <span className="text-sm font-medium text-adv-teal">Ask Alma</span>
            </div>
            {block.content && <p className="text-sm text-adv-off-white mb-3">{block.content}</p>}
            {aiResponses[index] && (
              <div
                aria-live="polite"
                aria-label="Alma's response"
                className="mb-3 rounded-lg bg-adv-dark p-3 text-sm text-adv-off-white whitespace-pre-wrap"
              >
                {aiResponses[index]}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={aiInput[index] || ''}
                onChange={e => setAiInput(prev => ({ ...prev, [index]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAiDiscussion(index, block)}
                placeholder={block.content || 'Ask a question about this topic...'}
                className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
              <button
                onClick={() => handleAiDiscussion(index, block)}
                disabled={aiLoading[index]}
                className="rounded-lg bg-adv-teal px-3 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
              >
                {aiLoading[index] ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ask'}
              </button>
            </div>
          </div>
        );

      case 'checkpoint':
        return (
          <div key={index} className={`rounded-xl border p-4 flex items-center gap-4 ${isCompleted ? 'border-adv-green/50 bg-adv-green/5' : 'border-adv-gold/40 bg-adv-gold/5'}`}>
            {isCompleted ? (
              <CheckCircle2 className="h-6 w-6 text-adv-green shrink-0" />
            ) : (
              <AlertCircle className="h-6 w-6 text-adv-gold shrink-0" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-adv-white">{block.content || 'Checkpoint'}</p>
              {block.check_question && <p className="text-xs text-adv-gray mt-0.5">{block.check_question}</p>}
            </div>
            {!isCompleted && (
              <button
                onClick={() => markBlockComplete(index)}
                className="shrink-0 rounded-lg bg-adv-gold/20 px-3 py-1.5 text-xs font-medium text-adv-gold hover:bg-adv-gold/30 transition-colors"
              >
                I understand
              </button>
            )}
          </div>
        );

      case 'divider':
        return <div key={index} className="border-t border-border my-2" />;

      case 'link':
        return (
          <div key={index} className="rounded-xl border border-border bg-adv-card p-4">
            <a href={block.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 text-adv-teal hover:text-adv-teal-dark transition-colors"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">{block.title || block.url}</p>
                {block.content && <p className="text-xs text-adv-gray mt-0.5">{block.content}</p>}
              </div>
            </a>
          </div>
        );

      default:
        return (
          <div key={index} className="rounded-xl border border-border bg-adv-card p-4">
            <p className="text-xs text-adv-gray">Block type: {block.type}</p>
            {block.content && <p className="text-sm text-adv-off-white mt-1">{block.content}</p>}
          </div>
        );
    }
  }

  if (loading) {
    return (
      <SchoolLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-adv-gray" />
        </div>
      </SchoolLayout>
    );
  }

  if (!lesson) {
    return (
      <SchoolLayout>
        <div className="p-6 text-center">
          <p className="text-adv-gray">Lesson not found.</p>
          <button onClick={() => navigate('/school/curriculum')} className="mt-3 text-sm text-adv-teal hover:underline">
            Back to library
          </button>
        </div>
      </SchoolLayout>
    );
  }

  const progress = lesson.content_blocks.length > 0
    ? Math.round((completedBlocks.size / lesson.content_blocks.length) * 100)
    : 0;

  return (
    <SchoolLayout>
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => navigate('/school/curriculum')} className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-off-white mb-3 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to library
          </button>
          <h1 className="text-xl font-semibold text-adv-white mb-1">{lesson.title}</h1>
          {lesson.description && <p className="text-sm text-adv-gray mb-3">{lesson.description}</p>}
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-adv-gray">
              <Clock className="h-3.5 w-3.5" /> {lesson.estimated_minutes}m
            </span>
            <span className="flex items-center gap-1.5 text-xs text-adv-gray">
              <Brain className="h-3.5 w-3.5" /> {lesson.bloom_level}
            </span>
            {/* Progress bar */}
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-adv-dark overflow-hidden">
                <div
                  className="h-full bg-adv-teal transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-adv-gray">{progress}%</span>
            </div>
          </div>
        </div>

        {/* Content blocks */}
        <div className="space-y-4">
          {lesson.content_blocks.map((block, i) => renderBlock(block, i))}
        </div>

        {/* Completion */}
        {progress === 100 && (
          <div className="mt-6 rounded-xl border border-adv-green/50 bg-adv-green/10 p-6 text-center">
            <Check className="h-10 w-10 text-adv-green mx-auto mb-2" />
            <h3 className="text-lg font-semibold text-adv-white mb-1">Lesson Complete!</h3>
            <p className="text-sm text-adv-gray">You've completed all blocks in this lesson.</p>
            <button
              onClick={() => navigate('/school/curriculum')}
              className="mt-4 flex items-center gap-2 mx-auto rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              Back to Library <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </SchoolLayout>
  );
}
