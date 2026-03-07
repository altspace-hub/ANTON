/**
 * NewsFeedPage.tsx
 *
 * Main news feed — articles from all tracked sources.
 * Route: /news/feed
 *
 * Features:
 * - Fetches GET /api/news/articles?limit=50
 * - Filter bar: country (all/se/no/gb/global) + category
 * - Color-coded bias indicator dot per article
 * - "Generate Explainer" button that POSTs to /api/news/generate-explainer
 *   and streams the SSE response in a slide-out panel
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Newspaper,
  ExternalLink,
  Loader2,
  AlertCircle,
  Sparkles,
  X,
  Filter,
  ChevronRight,
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

interface Article {
  id: string;
  title: string;
  url: string;
  source_name: string;
  bias_rating: BiasRating;
  published_at: string;
  snippet?: string;
  category?: string;
  country?: string;
  story_id?: string;
}

type CountryFilter = 'all' | 'se' | 'no' | 'gb' | 'global';
type CategoryFilter = 'all' | 'general' | 'business' | 'technology' | 'science';

// ── Bias helpers ─────────────────────────────────────────────────────────────

const BIAS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  far_left:     { label: 'Far Left',      dot: 'bg-red-500',      text: 'text-red-400' },
  left:         { label: 'Left',          dot: 'bg-orange-400',   text: 'text-orange-400' },
  center_left:  { label: 'Center-Left',   dot: 'bg-yellow-400',   text: 'text-yellow-400' },
  center:       { label: 'Center',        dot: 'bg-adv-gray',     text: 'text-adv-gray' },
  center_right: { label: 'Center-Right',  dot: 'bg-sky-400',      text: 'text-sky-400' },
  right:        { label: 'Right',         dot: 'bg-adv-blue',     text: 'text-adv-blue' },
  far_right:    { label: 'Far Right',     dot: 'bg-blue-900',     text: 'text-blue-300' },
};

function getBiasConfig(rating: BiasRating) {
  return BIAS_CONFIG[rating] ?? { label: rating ?? 'Unknown', dot: 'bg-adv-gray-med', text: 'text-adv-gray' };
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

export default function NewsFeedPage() {
  const navigate = useNavigate();

  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [countryFilter, setCountryFilter] = useState<CountryFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  // Explainer panel
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [explainerArticle, setExplainerArticle] = useState<Article | null>(null);
  const [explainerText, setExplainerText] = useState('');
  const [explainerLoading, setExplainerLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/news/articles?limit=50')
      .then((r) => (r.ok ? (r.json() as Promise<Article[]>) : Promise.resolve([])))
      .then((data) => {
        setArticles(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = articles.filter((a) => {
    if (countryFilter !== 'all' && a.country !== countryFilter) return false;
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
    return true;
  });

  // ── Generate explainer via SSE ─────────────────────────────────────────────

  const handleGenerateExplainer = async (article: Article) => {
    setExplainerArticle(article);
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
        body: JSON.stringify({ article_id: article.id, title: article.title, snippet: article.snippet }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        setExplainerText('Failed to generate explainer. Please try again.');
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
        // Handle SSE lines
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data) as { type?: string; content?: string; text?: string };
              const text = parsed.content ?? parsed.text ?? '';
              if (text) {
                accumulated += text;
                setExplainerText(accumulated);
              }
            } catch {
              // plain-text chunk fallback
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
    setExplainerArticle(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const countryOptions: { value: CountryFilter; label: string }[] = [
    { value: 'all', label: 'All Countries' },
    { value: 'se', label: 'Sweden' },
    { value: 'no', label: 'Norway' },
    { value: 'gb', label: 'UK' },
    { value: 'global', label: 'Global' },
  ];

  const categoryOptions: { value: CategoryFilter; label: string }[] = [
    { value: 'all', label: 'All Categories' },
    { value: 'general', label: 'General' },
    { value: 'business', label: 'Business' },
    { value: 'technology', label: 'Technology' },
    { value: 'science', label: 'Science' },
  ];

  return (
    <div className="flex h-full flex-col bg-adv-dark">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-blue/10">
            <Newspaper className="h-5 w-5 text-adv-blue" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-adv-off-white">Today's Feed</h1>
            <p className="text-xs text-adv-gray">Latest articles from tracked sources</p>
          </div>
        </div>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-3 shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-adv-gray">
            <Filter className="h-3.5 w-3.5" />
            Filter:
          </div>

          {/* Country filter */}
          <div className="flex gap-1">
            {countryOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCountryFilter(opt.value)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  countryFilter === opt.value
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Category filter */}
          <div className="flex gap-1">
            {categoryOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCategoryFilter(opt.value)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  categoryFilter === opt.value
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-adv-gray">
            {filtered.length} article{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Main content + slide-out panel ──────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Article list */}
        <div className={`flex-1 overflow-y-auto px-6 py-4 ${explainerOpen ? 'hidden lg:block' : ''}`}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-adv-gray" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-8 w-8 text-adv-gray mb-3" />
              <p className="text-sm text-adv-gray">No articles match the selected filters.</p>
              <button
                onClick={() => navigate('/news/sources')}
                className="mt-3 text-xs text-adv-teal hover:underline"
              >
                Manage tracked sources →
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-w-3xl">
              {filtered.map((article) => {
                const bias = getBiasConfig(article.bias_rating);
                return (
                  <div
                    key={article.id}
                    className="group rounded-xl border border-border bg-adv-card p-4 hover:border-adv-teal/30 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      {/* Bias dot */}
                      <div className="mt-1.5 shrink-0">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ${bias.dot}`}
                          title={bias.label}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-adv-off-white hover:text-adv-teal transition-colors leading-snug inline-flex items-start gap-1.5"
                        >
                          <span>{article.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-60" />
                        </a>

                        {/* Snippet */}
                        {article.snippet && (
                          <p className="mt-1 text-xs text-adv-gray line-clamp-2">{article.snippet}</p>
                        )}

                        {/* Meta row */}
                        <div className="mt-2 flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-medium text-adv-off-white/70">
                            {article.source_name}
                          </span>
                          <span className={`text-xs font-medium ${bias.text}`}>
                            {bias.label}
                          </span>
                          {article.category && (
                            <span className="text-xs text-adv-gray capitalize">
                              {article.category}
                            </span>
                          )}
                          <span className="text-xs text-adv-gray">
                            {formatTimeAgo(article.published_at)}
                          </span>

                          {/* Action buttons */}
                          <div className="ml-auto flex items-center gap-2">
                            {article.story_id && (
                              <button
                                onClick={() => navigate(`/news/story/${article.story_id}`)}
                                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-adv-gray hover:text-adv-teal hover:bg-adv-teal-soft transition-colors"
                              >
                                Full story
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              onClick={() => handleGenerateExplainer(article)}
                              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-adv-gray hover:text-adv-teal hover:bg-adv-teal-soft transition-colors"
                            >
                              <Sparkles className="h-3 w-3" />
                              Explain
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Explainer slide-out panel */}
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

            {/* Article context */}
            {explainerArticle && (
              <div className="px-5 py-3 border-b border-border shrink-0 bg-adv-card/50">
                <p className="text-xs font-medium text-adv-off-white line-clamp-2">
                  {explainerArticle.title}
                </p>
                <p className="text-xs text-adv-gray mt-0.5">{explainerArticle.source_name}</p>
              </div>
            )}

            {/* Streamed content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {explainerLoading && !explainerText ? (
                <div className="flex items-center gap-2 text-adv-gray">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Generating explainer...</span>
                </div>
              ) : explainerText ? (
                <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{explainerText}</ReactMarkdown>
                  {explainerLoading && (
                    <span className="animate-pulse text-adv-teal">▊</span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-adv-gray">Click "Explain" on an article to generate an AI explainer.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
