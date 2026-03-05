/**
 * FinanceLearnPage.tsx
 *
 * Financial literacy topic cards with inline AI-streamed explanations.
 * Topics have Swedish-specific context where relevant.
 */

import { useState, useEffect, useRef } from 'react';
import { BookOpen, ChevronRight, X, CheckCircle, Circle, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAuthHeader } from '@/lib/api';

interface Topic {
  id: string;
  title: string;
  description: string;
  concept: string; // sent to API
  emoji: string;
}

const TOPICS: Topic[] = [
  {
    id: 'home-economics',
    title: 'Home Economics',
    description: 'Budgeting, household expenses, saving habits, and managing a household.',
    concept: 'home economics and personal budgeting for everyday life',
    emoji: '🏠',
  },
  {
    id: 'mortgages',
    title: 'Mortgages & Housing',
    description: 'Buying a home in Sweden — amorteringskrav, ränteavdrag, and loan structures.',
    concept: 'mortgages and housing in Sweden including amorteringskrav (amortisation requirements) and ränteavdrag (mortgage interest deduction)',
    emoji: '🔑',
  },
  {
    id: 'pensions',
    title: 'Pensions',
    description: 'Swedish pension system — allmän pension, tjänstepension, and private ISK savings.',
    concept: 'Swedish pension system including allmän pension (state pension), tjänstepension (occupational pension), and ISK savings accounts',
    emoji: '👴',
  },
  {
    id: 'savings-investing',
    title: 'Savings & Investing',
    description: 'ISK accounts, index funds, ETFs, compound interest, and long-term wealth building.',
    concept: 'savings and investing fundamentals including ISK accounts, index funds, ETFs, and compound interest',
    emoji: '📈',
  },
  {
    id: 'debt-management',
    title: 'Debt Management',
    description: 'Credit cards, loans, avalanche vs snowball method, and avoiding debt traps.',
    concept: 'debt management strategies including avalanche vs snowball methods, credit card debt, and consolidation',
    emoji: '💳',
  },
  {
    id: 'tax-basics',
    title: 'Tax Basics',
    description: 'Swedish taxes — kommunalskatt, statlig skatt, capital gains, and deductions.',
    concept: 'Swedish tax system including kommunalskatt (municipal tax), statlig skatt (national tax), capital gains tax, and common deductions',
    emoji: '🧾',
  },
  {
    id: 'international-finance',
    title: 'International Finance',
    description: 'Currency exchange, international transfers, tax treaties, and investing abroad.',
    concept: 'international personal finance including currency exchange, cross-border transfers, and investing in foreign markets',
    emoji: '🌍',
  },
  {
    id: 'small-business',
    title: 'Small Business Finance',
    description: 'Sole trader (enskild firma) finances, VAT, bookkeeping basics in Sweden.',
    concept: 'small business finance in Sweden including enskild firma, aktiebolag, VAT (moms), and basic bookkeeping',
    emoji: '🏪',
  },
  {
    id: 'insurance',
    title: 'Insurance',
    description: 'Hemförsäkring, life insurance, income protection, and what you actually need.',
    concept: 'personal insurance types in Sweden including hemförsäkring (home insurance), life insurance, and income protection',
    emoji: '🛡️',
  },
  {
    id: 'decision-framework',
    title: 'Decision Framework',
    description: 'How to make big financial decisions: rent vs buy, car vs transit, invest vs pay down debt.',
    concept: 'financial decision-making frameworks for common dilemmas like rent vs buy, invest vs pay down debt, and large purchases',
    emoji: '⚖️',
  },
];

interface ProgressMap {
  [topicId: string]: boolean;
}

export default function FinanceLearnPage() {
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [explanation, setExplanation] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load existing progress on mount
  useEffect(() => {
    fetch('/api/finance/learning-progress', { headers: getAuthHeader() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && typeof data === 'object') {
          const map: ProgressMap = {};
          for (const item of data) {
            map[item.topic_id] = true;
          }
          setProgress(map);
        }
      })
      .catch(() => {/* non-fatal */});
  }, []);

  useEffect(() => {
    if (activeTopic) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeTopic]);

  async function openTopic(topic: Topic) {
    // If same topic and already loaded, close it
    if (activeTopic?.id === topic.id && !isStreaming) {
      setActiveTopic(null);
      setExplanation('');
      return;
    }

    abortRef.current?.abort();
    setActiveTopic(topic);
    setExplanation('');
    setError(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/finance/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ concept: topic.concept }),
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
              setExplanation(fullText);
            }
          } catch {
            // ignore
          }
        }
      }

      // Mark progress
      if (!progress[topic.id]) {
        setProgress((prev) => ({ ...prev, [topic.id]: true }));
        fetch('/api/finance/learning-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ topic_id: topic.id }),
        }).catch(() => {});
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Failed to load explanation. Please try again.');
      }
    } finally {
      setIsStreaming(false);
    }
  }

  function closeTopic() {
    abortRef.current?.abort();
    setActiveTopic(null);
    setExplanation('');
    setIsStreaming(false);
    setError(null);
  }

  const completedCount = Object.values(progress).filter(Boolean).length;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal-dim">
            <BookOpen className="h-5 w-5 text-adv-teal" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-adv-off-white">Financial Literacy</h1>
            <p className="text-sm text-adv-gray">10 topics — real-world explanations with Swedish context</p>
          </div>
          <div className="text-right">
            <span className="text-sm font-semibold text-adv-teal">{completedCount}</span>
            <span className="text-sm text-adv-gray"> / {TOPICS.length} completed</span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
          <div
            className="h-full rounded-full bg-adv-teal transition-all duration-500"
            style={{ width: `${(completedCount / TOPICS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-3">
        {TOPICS.map((topic) => {
          const isActive = activeTopic?.id === topic.id;
          const isDone = progress[topic.id];

          return (
            <div key={topic.id} className="rounded-xl border border-border bg-adv-card overflow-hidden">
              {/* Topic row */}
              <button
                onClick={() => openTopic(topic)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-adv-dark-2"
              >
                <span className="text-2xl">{topic.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-adv-off-white">{topic.title}</h3>
                    {isDone && <CheckCircle className="h-4 w-4 shrink-0 text-adv-green" />}
                  </div>
                  <p className="text-sm text-adv-gray truncate">{topic.description}</p>
                </div>
                {isActive ? (
                  <X className="h-4 w-4 shrink-0 text-adv-gray" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-adv-gray" />
                )}
              </button>

              {/* Inline explanation panel */}
              {isActive && (
                <div ref={panelRef} className="border-t border-border bg-adv-dark px-5 py-4">
                  {error ? (
                    <p className="text-sm text-adv-red">{error}</p>
                  ) : (
                    <>
                      {isStreaming && !explanation && (
                        <div className="flex items-center gap-2 text-adv-gray">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Loading explanation…</span>
                        </div>
                      )}
                      {(explanation || isStreaming) && (
                        <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanation}</ReactMarkdown>
                          {isStreaming && <span className="animate-pulse text-adv-teal">▊</span>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
