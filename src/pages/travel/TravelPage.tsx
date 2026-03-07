/**
 * TravelPage.tsx
 *
 * Travel hub landing page at /travel.
 * Quick-action cards, destination quiz, and recent trips.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Map,
  Briefcase,
  Compass,
  Globe,
  ChevronRight,
  Sparkles,
  Plane,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface QuickCard {
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
}

interface RecentTrip {
  id: number;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  status: 'planning' | 'active' | 'completed';
  cover_emoji: string;
}

// ── Constants ────────────────────────────────────────────────────────

const QUICK_CARDS: QuickCard[] = [
  {
    path: '/travel/trips',
    icon: Briefcase,
    title: 'My Trips',
    description: 'View and manage all your planned, active, and completed trips.',
    iconBg: 'bg-adv-teal-dim',
    iconColor: 'text-adv-teal',
  },
  {
    path: '/travel/planner',
    icon: Map,
    title: 'Plan a Trip',
    description: 'Build day-by-day itineraries and generate AI-powered travel plans.',
    iconBg: 'bg-adv-blue/10',
    iconColor: 'text-adv-blue',
  },
  {
    path: '/travel/explore',
    icon: Compass,
    title: 'Explore Destinations',
    description: 'Browse 20 popular destinations and get AI country guides.',
    iconBg: 'bg-adv-gold/10',
    iconColor: 'text-adv-gold',
  },
  {
    path: '/travel/country/se',
    icon: Globe,
    title: 'Example Country Guide',
    description: 'See a sample AI-generated country guide — Sweden.',
    iconBg: 'bg-adv-green/10',
    iconColor: 'text-adv-green',
  },
];

// ── Destination quiz logic ───────────────────────────────────────────

type Climate = 'hot' | 'temperate' | 'cold';
type Budget = 'budget' | 'mid' | 'luxury';
type Style = 'city' | 'nature' | 'beach' | 'culture';

interface QuizAnswers {
  climate: Climate | '';
  budget: Budget | '';
  style: Style | '';
}

interface Suggestion {
  name: string;
  code: string;
  why: string;
}

function getSuggestions(answers: QuizAnswers): Suggestion[] {
  const { climate, budget, style } = answers;
  const all: Suggestion[] = [
    { name: 'Japan', code: 'jp', why: 'Temperate climate, rich culture, all budgets' },
    { name: 'Thailand', code: 'th', why: 'Hot & tropical, beaches & culture, budget-friendly' },
    { name: 'Norway', code: 'no', why: 'Cold & dramatic, nature, mid-luxury' },
    { name: 'Spain', code: 'es', why: 'Hot summers, beaches & culture, mid-range' },
    { name: 'Portugal', code: 'pt', why: 'Warm, beaches & culture, budget-friendly' },
    { name: 'Iceland', code: 'is', why: 'Cold, extreme nature, mid-luxury' },
    { name: 'Morocco', code: 'ma', why: 'Hot, culture & medinas, budget-friendly' },
    { name: 'Italy', code: 'it', why: 'Temperate, culture & food, mid-range' },
    { name: 'Greece', code: 'gr', why: 'Hot, beaches & history, budget-friendly' },
    { name: 'Singapore', code: 'sg', why: 'Hot, city & culture, mid-luxury' },
    { name: 'Canada', code: 'ca', why: 'Cold, nature & cities, mid-range' },
    { name: 'India', code: 'in', why: 'Hot, culture & spirituality, budget' },
    { name: 'France', code: 'fr', why: 'Temperate, culture & luxury, mid-luxury' },
    { name: 'Australia', code: 'au', why: 'Hot, nature & beaches, mid-luxury' },
    { name: 'Mexico', code: 'mx', why: 'Hot, beaches & culture, budget-friendly' },
  ];

  const scored = all.map((s) => {
    let score = 0;
    if (climate === 'hot' && ['th', 'es', 'ma', 'gr', 'sg', 'in', 'au', 'mx'].includes(s.code)) score += 3;
    if (climate === 'temperate' && ['jp', 'pt', 'it', 'fr'].includes(s.code)) score += 3;
    if (climate === 'cold' && ['no', 'is', 'ca'].includes(s.code)) score += 3;
    if (budget === 'budget' && ['th', 'pt', 'ma', 'gr', 'in', 'mx'].includes(s.code)) score += 2;
    if (budget === 'mid' && ['jp', 'es', 'it', 'ca'].includes(s.code)) score += 2;
    if (budget === 'luxury' && ['no', 'is', 'sg', 'fr', 'au'].includes(s.code)) score += 2;
    if (style === 'beach' && ['th', 'es', 'pt', 'gr', 'au', 'mx'].includes(s.code)) score += 2;
    if (style === 'nature' && ['no', 'is', 'ca', 'au'].includes(s.code)) score += 2;
    if (style === 'culture' && ['jp', 'ma', 'it', 'in', 'fr'].includes(s.code)) score += 2;
    if (style === 'city' && ['sg', 'fr', 'es'].includes(s.code)) score += 2;
    return { ...s, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-adv-blue/10 text-adv-blue',
  active: 'bg-adv-green/10 text-adv-green',
  completed: 'bg-adv-gray-med/20 text-adv-gray',
};

// ── Component ────────────────────────────────────────────────────────

export default function TravelPage() {
  const navigate = useNavigate();
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswers>({ climate: '', budget: '', style: '' });
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  useEffect(() => {
    fetch('/api/travel/trips', { headers: getAuthHeader() })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setRecentTrips(Array.isArray(data) ? data.slice(0, 3) : []))
      .catch(() => {});
  }, []);

  function runQuiz() {
    setSuggestions(getSuggestions(quizAnswers));
  }

  const quizComplete = quizAnswers.climate && quizAnswers.budget && quizAnswers.style;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-blue/10">
            <Map className="h-5 w-5 text-adv-blue" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-adv-off-white">Travel</h1>
            <p className="text-sm text-adv-gray">AI-powered travel intelligence and planning</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-8">
        {/* Quick-action cards */}
        <div>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-adv-gray">Navigate</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.path}
                  onClick={() => navigate(card.path)}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-adv-card p-5 text-left transition-all hover:border-adv-teal/50 hover:shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.iconBg}`}>
                      <Icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>
                    <ChevronRight className="h-4 w-4 text-adv-teal opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-semibold text-adv-off-white">{card.title}</h3>
                    <p className="text-sm leading-relaxed text-adv-gray">{card.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Destination Quiz */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-adv-gold" />
              <h2 className="font-semibold text-adv-off-white">Destination Quiz</h2>
            </div>
            <p className="mb-4 text-sm text-adv-gray">Answer 3 quick questions to find your ideal destination.</p>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-adv-gray">Climate preference</p>
                <div className="flex gap-2 flex-wrap">
                  {(['hot', 'temperate', 'cold'] as Climate[]).map((c) => (
                    <button key={c} onClick={() => setQuizAnswers((a) => ({ ...a, climate: c }))}
                      className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                        quizAnswers.climate === c ? 'border-adv-teal bg-adv-teal-dim text-adv-teal' : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med'
                      }`}>
                      {c === 'hot' ? '☀️ Hot' : c === 'temperate' ? '🌤 Temperate' : '❄️ Cold'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-adv-gray">Budget level</p>
                <div className="flex gap-2 flex-wrap">
                  {(['budget', 'mid', 'luxury'] as Budget[]).map((b) => (
                    <button key={b} onClick={() => setQuizAnswers((a) => ({ ...a, budget: b }))}
                      className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                        quizAnswers.budget === b ? 'border-adv-teal bg-adv-teal-dim text-adv-teal' : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med'
                      }`}>
                      {b === 'budget' ? '💰 Budget' : b === 'mid' ? '💳 Mid-range' : '✨ Luxury'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-adv-gray">Travel style</p>
                <div className="flex gap-2 flex-wrap">
                  {(['city', 'nature', 'beach', 'culture'] as Style[]).map((s) => (
                    <button key={s} onClick={() => setQuizAnswers((a) => ({ ...a, style: s }))}
                      className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                        quizAnswers.style === s ? 'border-adv-teal bg-adv-teal-dim text-adv-teal' : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med'
                      }`}>
                      {s === 'city' ? '🏙 City' : s === 'nature' ? '🌿 Nature' : s === 'beach' ? '🏖 Beach' : '🏛 Culture'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={runQuiz} disabled={!quizComplete}
              className="mt-4 w-full rounded-lg bg-adv-teal py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors">
              Find My Destinations
            </button>

            {suggestions && (
              <div className="mt-4 space-y-2">
                {suggestions.map((s) => (
                  <button key={s.code} onClick={() => navigate(`/travel/country/${s.code}`)}
                    className="flex w-full items-center justify-between rounded-lg border border-adv-teal/20 bg-adv-dark px-4 py-3 text-left hover:border-adv-teal/50 transition-colors">
                    <div>
                      <span className="font-medium text-adv-off-white">{s.name}</span>
                      <p className="text-xs text-adv-gray mt-0.5">{s.why}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-adv-teal" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent trips */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plane className="h-5 w-5 text-adv-teal" />
                <h2 className="font-semibold text-adv-off-white">Recent Trips</h2>
              </div>
              <button onClick={() => navigate('/travel/trips')} className="text-xs text-adv-teal hover:underline">
                View all
              </button>
            </div>

            {recentTrips.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Plane className="mb-2 h-8 w-8 text-adv-gray" />
                <p className="text-sm text-adv-gray">No trips yet. Start planning!</p>
                <button onClick={() => navigate('/travel/trips')}
                  className="mt-3 rounded-lg border border-adv-teal/30 px-3 py-1.5 text-sm text-adv-teal hover:bg-adv-teal-dim transition-colors">
                  Create Trip
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTrips.map((trip) => (
                  <button key={trip.id} onClick={() => navigate(`/travel/planner?trip=${trip.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:border-adv-teal/50 transition-colors">
                    <span className="text-2xl">{trip.cover_emoji || '✈️'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-adv-off-white truncate">{trip.title}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[trip.status] || ''}`}>
                          {trip.status}
                        </span>
                      </div>
                      <p className="text-xs text-adv-gray truncate">{trip.destination}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-adv-gray" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
