/**
 * StoryDetailPage.tsx
 *
 * Detailed view of a single story — articles from multiple sources,
 * bias spectrum visualization, AI Explainer, Truth Check shortcut.
 * Route: /news/story/:id
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  Newspaper,
  ExternalLink,
  Loader2,
  AlertCircle,
  Sparkles,
  Shield,
  X,
  Clock,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type BiasRating =
  | 'far_left'
  | 'left'
  | 'center_left'
  | 'center'
  | 'center_right'
  | 'right'
  | 'far_right'
  | string;

interface StoryArticle {
  id: string;
  title: string;
  url: string;
  source_name: string;
  bias_rating: BiasRating;
  published_at: string;
  snippet?: string;
}

interface Story {
  id: string;
  headline: string;
  summary?: string;
  article_count: number;
  last_updated: string;
  topic_tags: string;
  articles: StoryArticle[];
}

// ── Bias config ───────────────────────────────────────────────────────────────

interface BiasConfig {
  label: string;
  dot: string;
  chip: string;
  spectrumPos: number;   // 0-6 for spectrum positioning
}

const BIAS_CONFIG: Record<string, BiasConfig> = {
  far_left:     { label: 'Far Left',     dot: 'bg-red-500',    chip: 'bg-red-900/30 text-red-400 border-red-800/30',     spectrumPos: 0 },
  left:         { label: 'Left',         dot: 'bg-orange-400', chip: 'bg-orange-900/20 text-orange-400 border-orange-800/20', spectrumPos: 1 },
  center_left:  { label: 'Center-Left',  dot: 'bg-yellow-400', chip: 'bg-yellow-900/20 text-yellow-400 border-yellow-800/20', spectrumPos: 2 },
  center:       { label: 'Center',       dot: 'bg-adv-gray',   chip: 'bg-adv-gray/10 text-adv-gray border-adv-gray/20',   spectrumPos: 3 },
  center_right: { label: 'Center-Right', dot: 'bg-sky-400',    chip: 'bg-sky-900/20 text-sky-400 border-sky-800/20',       spectrumPos: 4 },
  right:        { label: 'Right',        dot: 'bg-adv-blue',   chip: 'bg-adv-blue/10 text-adv-blue border-adv-blue/20',    spectrumPos: 5 },
  far_right:    { label: 'Far Right',    dot: 'bg-blue-900',   chip: 'bg-blue-950/40 text-blue-300 border-blue-900/30',    spectrumPos: 6 },
};

const SPECTRUM_LABELS = ['Far Left', 'Left', 'C-Left', 'Center', 'C-Right', 'Right', 'Far Right'];
const SPECTRUM_RATINGS: BiasRating[] = ['far_left', 'left', 'center_left', 'center', 'center_right', 'right', 'far_right'];
const SPECTRUM_DOTS = ['bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-adv-gray', 'bg-sky-400', 'bg-adv-blue', 'bg-blue-900'];

function getBias(rating: BiasRating): BiasConfig {
  return BIAS_CONFIG[rating] ?? {
    label: rating ?? 'Unknown',
    dot: 'bg-adv-gray-med',
    chip: 'bg-adv-gray/10 text-adv-gray-med border-adv-gray/20',
    spectrumPos: 3,
  };
}

function formatTimeAgo(isoString: string): string {
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return '';
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Explainer
  const [explainerText, setExplainerText] = useState('');
  const [explainerLoading, setExplainerLoading] = useState(false);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup: abort any in-flight SSE stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const controller = new AbortController();
    fetch(`/api/news/stories/${id}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Story>;
      })
      .then((data) => {
        setStory(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        if ((err as Error).name !== 'AbortError') {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [id]);

  // ── AI Explainer ──────────────────────────────────────────────────────────

  const handleGenerateExplainer = async () => {
    if (!story || explainerLoading) return;
    setExplainerText('');
    setExplainerOpen(true);
    setExplainerLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/news/generate-explainer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story_id: story.id,
          headline: story.headline,
          summary: story.summary,
          article_titles: story.articles?.map((a) => a.title) ?? [],
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        setExplainerText('Failed to generate explainer.');
        setExplainerLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data) as { content?: string; text?: string };
              const text = parsed.content ?? parsed.text ?? '';
              if (text) {
                accumulated += text;
                setExplainerText(accumulated);
              }
            } catch {
              if (data && data !== '[DONE]') {
                accumulated += data;
                setExplainerText(accumulated);
              }
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setExplainerText('Error generating explainer.');
      }
    } finally {
      setExplainerLoading(false);
      abortRef.current = null;
    }
  };

  const closeExplainer = () => {
    abortRef.current?.abort();
    setExplainerOpen(false);
    setExplainerText('');
  };

  // ── Truth Check navigation ─────────────────────────────────────────────────

  const handleTruthCheck = () => {
    navigate('/news/truth-check', { state: { claim: story?.headline ?? '' } });
  };

  // ── Bias spectrum visualization ────────────────────────────────────────────

  const articlesWithBias = story?.articles ?? [];
  const spectrumCounts = SPECTRUM_RATINGS.map((rating) =>
    articlesWithBias.filter((a) => a.bias_rating === rating).length
  );
  const maxSpectrumCount = Math.max(1, ...spectrumCounts);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-adv-dark">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/news/feed')}
            className="rounded-lg p-1.5 text-adv-gray hover:text-adv-off-white hover:bg-adv-dark transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-blue/10">
            <Newspaper className="h-5 w-5 text-adv-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-adv-off-white truncate">
              {loading ? 'Loading story...' : story?.headline ?? 'Story not found'}
            </h1>
            {story && (
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-adv-gray">{story.article_count} sources</span>
                <span className="text-xs text-adv-gray-med flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTimeAgo(story.last_updated)}
                </span>
              </div>
            )}
          </div>
          {/* Action buttons */}
          {story && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleTruthCheck}
                className="flex items-center gap-1.5 rounded-lg border border-adv-teal/30 bg-adv-teal-soft
                           px-3 py-2 text-xs font-medium text-adv-teal hover:bg-adv-teal-dim transition-colors"
              >
                <Shield className="h-3.5 w-3.5" />
                Truth Check
              </button>
              <button
                onClick={handleGenerateExplainer}
                disabled={explainerLoading}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-2 text-xs font-medium
                           text-adv-dark hover:bg-adv-teal-dark transition-colors
                           disabled:cursor-not-allowed disabled:opacity-60"
              >
                {explainerLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {explainerLoading ? 'Generating...' : 'AI Explainer'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: story content */}
        <div className={`flex-1 overflow-y-auto px-6 py-6 ${explainerOpen ? 'hidden lg:block' : ''}`}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-adv-gray" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-8 w-8 text-adv-red mb-3" />
              <p className="text-sm text-adv-red">Failed to load story: {error}</p>
              <button
                onClick={() => navigate('/news/feed')}
                className="mt-3 text-xs text-adv-teal hover:underline"
              >
                ← Back to feed
              </button>
            </div>
          ) : !story ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-8 w-8 text-adv-gray-med mb-3" />
              <p className="text-sm text-adv-gray">Story not found.</p>
            </div>
          ) : (
            <div className="max-w-3xl space-y-6">

              {/* Summary */}
              {story.summary && (
                <div className="rounded-xl border border-border bg-adv-card p-5">
                  <h2 className="text-xs font-semibold text-adv-gray uppercase tracking-wide mb-2">Summary</h2>
                  <p className="text-sm text-adv-off-white leading-relaxed">{story.summary}</p>
                  {story.topic_tags && (
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      {story.topic_tags.split(',').map((tag, i) => (
                        <span
                          key={i}
                          className="text-[10px] rounded bg-adv-dark px-2 py-0.5 text-adv-gray-med"
                        >
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Bias spectrum visualization */}
              {story.articles?.length > 0 && (
                <div className="rounded-xl border border-border bg-adv-card p-5">
                  <h2 className="text-xs font-semibold text-adv-gray uppercase tracking-wide mb-4">
                    Coverage Spectrum
                  </h2>

                  {/* Spectrum bar */}
                  <div className="grid grid-cols-7 gap-1 mb-3">
                    {SPECTRUM_RATINGS.map((rating, i) => {
                      const count = spectrumCounts[i];
                      const height = count > 0 ? Math.max(16, Math.round((count / maxSpectrumCount) * 60)) : 4;
                      return (
                        <div key={rating} className="flex flex-col items-center gap-1">
                          <div
                            className={`w-full rounded-sm transition-all ${SPECTRUM_DOTS[i]} opacity-80`}
                            style={{ height: `${height}px` }}
                          />
                          <span className="text-[9px] text-adv-gray-med text-center leading-tight">
                            {SPECTRUM_LABELS[i]}
                          </span>
                          <span className="text-[10px] text-adv-gray font-medium">
                            {count > 0 ? count : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Source dots legend */}
                  <div className="flex items-center gap-3 flex-wrap mt-2">
                    {story.articles.map((article) => {
                      const bias = getBias(article.bias_rating);
                      return (
                        <div key={article.id} className="flex items-center gap-1">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${bias.dot}`} />
                          <span className="text-[10px] text-adv-gray">{article.source_name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Articles list */}
              <div>
                <h2 className="text-xs font-semibold text-adv-gray uppercase tracking-wide mb-3">
                  Coverage ({story.articles?.length ?? 0} sources)
                </h2>
                <div className="space-y-3">
                  {(story.articles ?? []).map((article) => {
                    const bias = getBias(article.bias_rating);
                    return (
                      <div
                        key={article.id}
                        className="group rounded-xl border border-border bg-adv-card p-4 hover:border-adv-teal/30 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          {/* Bias dot */}
                          <div className="mt-1.5 shrink-0">
                            <div className={`h-2.5 w-2.5 rounded-full ${bias.dot}`} title={bias.label} />
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Title link */}
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-adv-off-white hover:text-adv-teal transition-colors leading-snug
                                         inline-flex items-start gap-1.5 group"
                            >
                              <span>{article.title}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-60" />
                            </a>

                            {/* Snippet */}
                            {article.snippet && (
                              <p className="mt-1 text-xs text-adv-gray line-clamp-2">{article.snippet}</p>
                            )}

                            {/* Meta */}
                            <div className="mt-2 flex items-center gap-3 flex-wrap">
                              <span className="text-xs font-medium text-adv-off-white/70">
                                {article.source_name}
                              </span>
                              <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium ${bias.chip}`}>
                                {bias.label}
                              </span>
                              <span className="text-[10px] text-adv-gray-med">
                                {formatTimeAgo(article.published_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {story.articles?.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-adv-gray">No articles found for this story.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Cross-tab: study connections */}
              {story.topic_tags && (
                <div className="rounded-xl border border-adv-blue/20 bg-adv-blue/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Newspaper className="h-4 w-4 text-adv-blue" />
                    <span className="text-sm font-medium text-adv-off-white">Study Connections</span>
                  </div>
                  <p className="text-xs text-adv-gray mb-3">
                    See how this topic connects to your school subjects via My Radar.
                  </p>
                  <button
                    onClick={() => navigate('/school/radar')}
                    className="flex items-center gap-1.5 rounded-lg bg-adv-blue/10 border border-adv-blue/30 px-3 py-1.5 text-xs text-adv-blue hover:bg-adv-blue/20 transition-colors"
                  >
                    <Newspaper className="h-3.5 w-3.5" />
                    Open My Radar →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: AI Explainer panel */}
        {explainerOpen && (
          <div className="w-full lg:w-[420px] shrink-0 border-l border-border bg-adv-dark-2 flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-adv-teal" />
                <span className="text-sm font-semibold text-adv-off-white">AI Explainer</span>
              </div>
              <button
                onClick={closeExplainer}
                className="rounded-lg p-1 text-adv-gray hover:text-adv-off-white hover:bg-adv-dark transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Story context */}
            {story && (
              <div className="px-5 py-3 border-b border-border shrink-0 bg-adv-card/50">
                <p className="text-xs font-medium text-adv-off-white line-clamp-2">{story.headline}</p>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {explainerLoading && !explainerText ? (
                <div className="flex items-center gap-2 text-adv-gray">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Generating explainer...</span>
                </div>
              ) : explainerText ? (
                <div aria-live="polite" className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{explainerText}</ReactMarkdown>
                  {explainerLoading && (
                    <span className="animate-pulse text-adv-teal">▊</span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-adv-gray">
                  Click "AI Explainer" to generate a balanced overview of this story.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
