/**
 * NewsPage.tsx
 *
 * Hub / landing page for the News Intelligence section.
 * Route: /news
 *
 * Shows quick-action cards for the four main sub-sections,
 * and a live "Top Stories" list pulled from the API.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Newspaper,
  Shield,
  Radio,
  User,
  ExternalLink,
  TrendingUp,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Story {
  id: string;
  headline: string;
  summary?: string;
  article_count: number;
  last_updated: string;
  topic_tags: string;
}

interface QuickAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  to: string;
  color: string;
  bg: string;
}

// ── Quick-action definitions ─────────────────────────────────────────────────

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: Newspaper,
    label: "Today's Feed",
    desc: 'Latest stories from tracked sources',
    to: '/news/feed',
    color: 'text-adv-blue',
    bg: 'bg-adv-blue/10',
  },
  {
    icon: Shield,
    label: 'Truth Check',
    desc: 'Verify claims with AI analysis',
    to: '/news/truth-check',
    color: 'text-adv-teal',
    bg: 'bg-adv-teal-dim',
  },
  {
    icon: Radio,
    label: 'Source Intelligence',
    desc: 'Explore media bias spectrum',
    to: '/news/sources',
    color: 'text-adv-gold',
    bg: 'bg-adv-gold/10',
  },
  {
    icon: User,
    label: 'My Bias Profile',
    desc: 'Understand your reading patterns',
    to: '/news/my-bias',
    color: 'text-adv-green',
    bg: 'bg-adv-green/10',
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function NewsPage() {
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/news/stories?limit=5')
      .then((r) => (r.ok ? (r.json() as Promise<Story[]>) : Promise.resolve([])))
      .then((data) => {
        setStories(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-adv-dark">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-blue/10">
            <Newspaper className="h-5 w-5 text-adv-blue" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-adv-off-white">News Intelligence</h1>
            <p className="text-xs text-adv-gray">Stay informed. Understand bias. Verify truth.</p>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex-1 px-6 py-8 max-w-5xl mx-auto w-full">

        {/* Quick-action cards */}
        <div className="grid grid-cols-2 gap-4 mb-8 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.to}
                onClick={() => navigate(action.to)}
                className="flex flex-col gap-3 rounded-xl border border-border bg-adv-card p-4 text-left
                           transition-all hover:border-adv-teal/40 hover:bg-adv-card/80 focus:outline-none
                           focus:ring-2 focus:ring-adv-teal/50"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${action.bg}`}>
                  <Icon className={`h-4 w-4 ${action.color}`} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-adv-off-white">{action.label}</div>
                  <div className="mt-0.5 text-xs text-adv-gray">{action.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Top Stories panel */}
        <div className="rounded-xl border border-border bg-adv-card p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-adv-off-white">
              <TrendingUp className="h-4 w-4 text-adv-teal" />
              Top Stories
            </h2>
            <button
              onClick={() => navigate('/news/feed')}
              className="text-xs text-adv-teal hover:text-adv-teal-dark transition-colors"
            >
              View all →
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-adv-gray" />
            </div>
          ) : stories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <AlertCircle className="h-8 w-8 text-adv-gray-med mb-2" />
              <p className="text-sm text-adv-gray">
                No stories yet. Stories are fetched from tracked sources.
              </p>
              <button
                onClick={() => navigate('/news/sources')}
                className="mt-3 text-xs text-adv-teal hover:underline"
              >
                Manage sources →
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {stories.map((story) => (
                <button
                  key={story.id}
                  onClick={() => navigate(`/news/story/${story.id}`)}
                  className="w-full text-left rounded-lg px-3 py-3 hover:bg-adv-dark transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-adv-off-white group-hover:text-adv-white transition-colors leading-snug">
                        {story.headline}
                      </p>
                      {story.summary && (
                        <p className="mt-1 text-xs text-adv-gray line-clamp-1">{story.summary}</p>
                      )}
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-adv-gray shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-adv-gray-med">
                      {story.article_count} {story.article_count === 1 ? 'source' : 'sources'}
                    </span>
                    {story.topic_tags && (
                      <span className="text-[10px] text-adv-gray-med truncate">
                        {story.topic_tags.split(',').slice(0, 3).join(' · ')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <button
          onClick={() => navigate('/news/feed')}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-adv-teal/30
                     bg-adv-teal-soft py-4 text-sm font-medium text-adv-teal transition-all
                     hover:bg-adv-teal-dim hover:border-adv-teal/60 focus:outline-none focus:ring-2
                     focus:ring-adv-teal/50"
        >
          Open Today's Feed
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
