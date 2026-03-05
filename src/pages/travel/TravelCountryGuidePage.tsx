/**
 * TravelCountryGuidePage.tsx
 *
 * AI-generated country guide. Fetches from API or prompts generation.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Globe, RefreshCw, ChevronLeft, Loader2, AlertTriangle,
  Shield, DollarSign, MessageCircle, Car, Utensils,
  AlertCircle, Sun, BadgePercent, Sparkles, Newspaper,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAuthHeader } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface CountryGuide {
  country_name: string;
  country_code: string;
  safety_level: 'green' | 'yellow' | 'orange' | 'red';
  safety_summary: string;
  culture_etiquette: string;
  visa_info: string;
  currency_money: string;
  language_tips: string;
  getting_around: string;
  food_guide: string;
  scam_alerts: string[];
  best_months: string;
  budget_guide: { budget: string; mid: string; luxury: string };
  generated_at: string;
}

const SAFETY_COLORS: Record<string, string> = {
  green: 'bg-adv-green/10 text-adv-green border-adv-green/30',
  yellow: 'bg-adv-gold/10 text-adv-gold border-adv-gold/30',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  red: 'bg-adv-red/10 text-adv-red border-adv-red/30',
};

const SAFETY_LABELS: Record<string, string> = {
  green: 'Generally Safe',
  yellow: 'Exercise Caution',
  orange: 'Heightened Caution',
  red: 'High Risk',
};

interface Section {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  key: keyof CountryGuide;
}

const SECTIONS: Section[] = [
  { icon: Globe, title: 'Culture & Etiquette', key: 'culture_etiquette' },
  { icon: Shield, title: 'Visa Info', key: 'visa_info' },
  { icon: DollarSign, title: 'Currency & Money', key: 'currency_money' },
  { icon: MessageCircle, title: 'Language Tips', key: 'language_tips' },
  { icon: Car, title: 'Getting Around', key: 'getting_around' },
  { icon: Utensils, title: 'Food Guide', key: 'food_guide' },
  { icon: Sun, title: 'Best Months to Visit', key: 'best_months' },
];

// ── Component ────────────────────────────────────────────────────────

export default function TravelCountryGuidePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [guide, setGuide] = useState<CountryGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsGeneration, setNeedsGeneration] = useState(false);
  const [countryName, setCountryName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Cross-tab: related news stories from this country
  const [relatedNews, setRelatedNews] = useState<Array<{ id: string; headline: string; summary?: string; article_count: number }>>([]);

  useEffect(() => {
    if (code) loadGuide(code);
  }, [code]);

  async function loadGuide(countryCode: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/travel/country/${countryCode}`, { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setGuide(data);
        setNeedsGeneration(false);
        // Cross-tab: fetch related news
        const name = (data as CountryGuide).country_name;
        if (name) {
          fetch(`/api/news/stories?topic=${encodeURIComponent(name)}&limit=3`)
            .then((r) => r.ok ? r.json() : [])
            .then((stories: Array<{ id: string; headline: string; summary?: string; article_count: number }>) => setRelatedNews(stories))
            .catch(() => {});
        }
      } else if (res.status === 404) {
        const data = await res.json().catch(() => ({}));
        setNeedsGeneration(true);
        // Pre-fill country name from code if possible
        if (data.country_name) setCountryName(data.country_name);
      }
    } catch {
      setError('Failed to load guide. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!code || !countryName.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    setStreamText('');
    setError('');

    try {
      const res = await fetch(`/api/travel/country/${code}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ country_name: countryName }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === 'text_delta' && parsed.content) {
              fullText += parsed.content;
              setStreamText(fullText);
            } else if (parsed.type === 'guide_complete' && parsed.guide) {
              setGuide(parsed.guide);
              setNeedsGeneration(false);
            }
          } catch { /* ignore */ }
        }
      }

      // If no structured guide came back, reload
      if (!guide) {
        await loadGuide(code);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError('Generation failed. Please try again.');
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleRefresh() {
    if (!code) return;
    setGuide(null);
    setNeedsGeneration(true);
    setStreamText('');
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-adv-gray">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading guide…</span>
      </div>
    );
  }

  // ── Needs generation ─────────────────────────────────────────────

  if (needsGeneration) {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/travel/explore')} className="text-adv-gray hover:text-adv-off-white">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-blue/10">
              <Globe className="h-5 w-5 text-adv-blue" />
            </div>
            <h1 className="text-xl font-semibold text-adv-off-white">Country Guide — {code?.toUpperCase()}</h1>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-blue/10">
            <Sparkles className="h-8 w-8 text-adv-blue" />
          </div>
          <div className="text-center">
            <h2 className="mb-1 text-xl font-semibold text-adv-off-white">Generate Country Guide</h2>
            <p className="text-sm text-adv-gray">No guide exists for this destination yet. Enter the country name and ANTON will generate one.</p>
          </div>
          <div className="w-full max-w-sm space-y-3">
            <label className="space-y-1 block">
              <span className="text-xs text-adv-gray">Country name</span>
              <input
                type="text"
                value={countryName}
                onChange={(e) => setCountryName(e.target.value)}
                placeholder="e.g. Japan, Thailand, Norway"
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              />
            </label>
            {error && <p className="text-sm text-adv-red">{error}</p>}
            <button onClick={handleGenerate} disabled={generating || !countryName.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-adv-teal py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate Guide
            </button>
          </div>
          {(streamText || generating) && (
            <div className="w-full max-w-2xl rounded-xl border border-border bg-adv-card p-5">
              <p className="mb-3 text-xs font-medium text-adv-teal">Generating guide…</p>
              <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText}</ReactMarkdown>
                {generating && <span className="animate-pulse text-adv-teal">▊</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!guide) return null;

  // ── Guide view ───────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/travel/explore')} className="text-adv-gray hover:text-adv-off-white">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-blue/10">
              <Globe className="h-5 w-5 text-adv-blue" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-adv-off-white">{guide.country_name}</h1>
              <p className="text-xs text-adv-gray-med">
                Generated {new Date(guide.generated_at).toLocaleDateString('sv-SE')}
              </p>
            </div>
          </div>
          <button onClick={handleRefresh}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors">
            <RefreshCw className="h-4 w-4" />
            Refresh Guide
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-5">
        {/* Safety level */}
        <div className={`flex items-start gap-3 rounded-xl border p-4 ${SAFETY_COLORS[guide.safety_level]}`}>
          <Shield className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{SAFETY_LABELS[guide.safety_level]}</p>
            {guide.safety_summary && <p className="text-sm mt-1 opacity-90">{guide.safety_summary}</p>}
          </div>
        </div>

        {/* Budget guide */}
        {guide.budget_guide && (
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <BadgePercent className="h-5 w-5 text-adv-teal" />
              <h2 className="font-semibold text-adv-off-white">Daily Budget Guide (USD)</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Budget', value: guide.budget_guide.budget, color: 'text-adv-green' },
                { label: 'Mid-range', value: guide.budget_guide.mid, color: 'text-adv-teal' },
                { label: 'Luxury', value: guide.budget_guide.luxury, color: 'text-adv-gold' },
              ].map((b) => (
                <div key={b.label} className="rounded-lg border border-border bg-adv-dark p-3 text-center">
                  <p className={`text-lg font-bold ${b.color}`}>{b.value}</p>
                  <p className="text-xs text-adv-gray mt-1">{b.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main sections */}
        {SECTIONS.map(({ icon: Icon, title, key }) => {
          const content = guide[key] as string;
          if (!content) return null;
          return (
            <div key={key} className="rounded-xl border border-border bg-adv-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Icon className="h-5 w-5 text-adv-teal" />
                <h2 className="font-semibold text-adv-off-white">{title}</h2>
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            </div>
          );
        })}

        {/* Scam alerts */}
        {guide.scam_alerts && guide.scam_alerts.length > 0 && (
          <div className="rounded-xl border border-adv-red/30 bg-adv-red/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5 text-adv-red" />
              <h2 className="font-semibold text-adv-off-white">Scam Alerts</h2>
            </div>
            <div className="space-y-2">
              {guide.scam_alerts.map((scam, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-adv-red/20 bg-adv-red/10 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-adv-red" />
                  <p className="text-sm text-adv-off-white">{scam}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cross-tab: Related news stories */}
        {relatedNews.length > 0 && (
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-adv-blue" />
                <h2 className="font-semibold text-adv-off-white">In the News</h2>
              </div>
              <button
                onClick={() => navigate(`/news?topic=${encodeURIComponent(guide.country_name)}`)}
                className="text-xs text-adv-teal hover:text-adv-teal-dark transition-colors"
              >
                See all news →
              </button>
            </div>
            <div className="space-y-2">
              {relatedNews.map((story) => (
                <button
                  key={story.id}
                  onClick={() => navigate(`/news/story/${story.id}`)}
                  className="w-full text-left rounded-lg border border-border bg-adv-dark px-4 py-3 hover:border-adv-blue/40 transition-colors"
                >
                  <p className="text-sm font-medium text-adv-off-white leading-snug">{story.headline}</p>
                  {story.article_count > 0 && (
                    <p className="text-xs text-adv-gray mt-1">{story.article_count} source{story.article_count !== 1 ? 's' : ''}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
