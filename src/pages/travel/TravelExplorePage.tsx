/**
 * TravelExplorePage.tsx
 *
 * Browse 20 popular destinations and get AI country guides.
 * Includes search filter and the 3-question destination quiz.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, Search, ChevronRight, Sparkles } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────

interface Destination {
  name: string;
  code: string;
  flag: string;
  tagline: string;
  tags: string[];
}

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
  flag: string;
  why: string;
}

// ── Data ─────────────────────────────────────────────────────────────

const DESTINATIONS: Destination[] = [
  { name: 'Japan', code: 'jp', flag: '🇯🇵', tagline: 'Ancient temples, neon cities, and perfect food', tags: ['culture', 'city', 'temperate'] },
  { name: 'Italy', code: 'it', flag: '🇮🇹', tagline: 'Art, history, and the world\'s best cuisine', tags: ['culture', 'city', 'temperate'] },
  { name: 'Thailand', code: 'th', flag: '🇹🇭', tagline: 'Tropical beaches, street food paradise, temples', tags: ['beach', 'culture', 'hot', 'budget'] },
  { name: 'Norway', code: 'no', flag: '🇳🇴', tagline: 'Fjords, Northern Lights, and epic hiking', tags: ['nature', 'cold', 'luxury'] },
  { name: 'Spain', code: 'es', flag: '🇪🇸', tagline: 'Vibrant cities, flamenco, and sunny coasts', tags: ['beach', 'city', 'culture', 'hot', 'mid'] },
  { name: 'France', code: 'fr', flag: '🇫🇷', tagline: 'Romance, gastronomy, and world-class art', tags: ['culture', 'city', 'temperate', 'luxury'] },
  { name: 'Portugal', code: 'pt', flag: '🇵🇹', tagline: 'Lisbon\'s soul, Algarve beaches, amazing pastries', tags: ['beach', 'culture', 'hot', 'budget'] },
  { name: 'Greece', code: 'gr', flag: '🇬🇷', tagline: 'Ancient ruins, island-hopping, Mediterranean bliss', tags: ['beach', 'culture', 'hot', 'budget'] },
  { name: 'Iceland', code: 'is', flag: '🇮🇸', tagline: 'Volcanoes, glaciers, and Aurora Borealis', tags: ['nature', 'cold', 'luxury'] },
  { name: 'Morocco', code: 'ma', flag: '🇲🇦', tagline: 'Medinas, Sahara dunes, and rich spice markets', tags: ['culture', 'hot', 'budget'] },
  { name: 'Mexico', code: 'mx', flag: '🇲🇽', tagline: 'Mayan ruins, taco culture, and turquoise coast', tags: ['beach', 'culture', 'hot', 'budget'] },
  { name: 'USA', code: 'us', flag: '🇺🇸', tagline: 'National parks, metropolises, road trip heaven', tags: ['city', 'nature', 'temperate', 'mid'] },
  { name: 'Brazil', code: 'br', flag: '🇧🇷', tagline: 'Amazon rainforest, carnival energy, Copacabana', tags: ['nature', 'beach', 'hot', 'mid'] },
  { name: 'Australia', code: 'au', flag: '🇦🇺', tagline: 'Outback, Great Barrier Reef, and laid-back culture', tags: ['nature', 'beach', 'hot', 'luxury'] },
  { name: 'New Zealand', code: 'nz', flag: '🇳🇿', tagline: 'Hobbit landscapes, adventure sports, clean air', tags: ['nature', 'cold', 'mid'] },
  { name: 'South Africa', code: 'za', flag: '🇿🇦', tagline: 'Safari, Cape winelands, diverse culture', tags: ['nature', 'culture', 'hot', 'mid'] },
  { name: 'India', code: 'in', flag: '🇮🇳', tagline: 'Incredible diversity — spice, colour, spirituality', tags: ['culture', 'hot', 'budget'] },
  { name: 'Singapore', code: 'sg', flag: '🇸🇬', tagline: 'Ultra-modern city, hawker food, tropical gardens', tags: ['city', 'hot', 'luxury'] },
  { name: 'Canada', code: 'ca', flag: '🇨🇦', tagline: 'Rocky Mountains, maple syrup, and friendly vibes', tags: ['nature', 'cold', 'mid'] },
  { name: 'Sweden', code: 'se', flag: '🇸🇪', tagline: 'Northern forests, design culture, midnight sun', tags: ['nature', 'culture', 'cold', 'mid'] },
];

// ── Quiz logic (same as TravelPage) ─────────────────────────────────

function getSuggestions(answers: QuizAnswers): Suggestion[] {
  const { climate, budget, style } = answers;
  const scored = DESTINATIONS.map((d) => {
    let score = 0;
    if (climate && d.tags.includes(climate)) score += 3;
    if (budget && d.tags.includes(budget)) score += 2;
    if (style && d.tags.includes(style)) score += 2;
    return { ...d, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ name, code, flag, tagline }) => ({ name, code, flag, why: tagline }));
}

// ── Component ────────────────────────────────────────────────────────

export default function TravelExplorePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswers>({ climate: '', budget: '', style: '' });
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  const filtered = DESTINATIONS.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.tagline.toLowerCase().includes(search.toLowerCase())
  );

  const quizComplete = quizAnswers.climate && quizAnswers.budget && quizAnswers.style;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-gold/10">
            <Compass className="h-5 w-5 text-adv-gold" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-adv-off-white">Explore Destinations</h1>
            <p className="text-sm text-adv-gray">Browse {DESTINATIONS.length} popular destinations — click for AI country guide</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-8">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray-med" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search destinations…"
            className="w-full rounded-xl border border-border bg-adv-card pl-10 pr-4 py-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none"
          />
        </div>

        {/* Destination grid */}
        <div>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-adv-gray">
            {search ? `${filtered.length} results` : 'All Destinations'}
          </h2>
          {filtered.length === 0 ? (
            <p className="text-sm text-adv-gray py-8 text-center">No destinations match your search.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {filtered.map((dest) => (
                <button
                  key={dest.code}
                  onClick={() => navigate(`/travel/country/${dest.code}`)}
                  className="group flex flex-col gap-2 rounded-xl border border-border bg-adv-card p-4 text-left transition-all hover:border-adv-teal/50 hover:shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{dest.flag}</span>
                    <ChevronRight className="h-4 w-4 text-adv-teal opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-adv-off-white">{dest.name}</h3>
                    <p className="text-xs leading-relaxed text-adv-gray mt-0.5">{dest.tagline}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Where Should I Go? quiz */}
        <div className="rounded-xl border border-border bg-adv-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-adv-gold" />
            <h2 className="font-semibold text-adv-off-white">Where Should I Go?</h2>
          </div>
          <p className="mb-5 text-sm text-adv-gray">
            Answer 3 questions and get 3 personalised destination recommendations.
          </p>

          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-medium text-adv-gray">Climate preference</p>
              <div className="flex gap-2 flex-wrap">
                {(['hot', 'temperate', 'cold'] as Climate[]).map((c) => (
                  <button key={c}
                    onClick={() => setQuizAnswers((a) => ({ ...a, climate: c }))}
                    className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                      quizAnswers.climate === c ? 'border-adv-teal bg-adv-teal-dim text-adv-teal' : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                    }`}>
                    {c === 'hot' ? '☀️ Hot' : c === 'temperate' ? '🌤 Temperate' : '❄️ Cold'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-adv-gray">Budget</p>
              <div className="flex gap-2 flex-wrap">
                {(['budget', 'mid', 'luxury'] as Budget[]).map((b) => (
                  <button key={b}
                    onClick={() => setQuizAnswers((a) => ({ ...a, budget: b }))}
                    className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                      quizAnswers.budget === b ? 'border-adv-teal bg-adv-teal-dim text-adv-teal' : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
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
                  <button key={s}
                    onClick={() => setQuizAnswers((a) => ({ ...a, style: s }))}
                    className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                      quizAnswers.style === s ? 'border-adv-teal bg-adv-teal-dim text-adv-teal' : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                    }`}>
                    {s === 'city' ? '🏙 City' : s === 'nature' ? '🌿 Nature' : s === 'beach' ? '🏖 Beach' : '🏛 Culture'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => setSuggestions(getSuggestions(quizAnswers))}
            disabled={!quizComplete}
            className="mt-5 w-full rounded-lg bg-adv-teal py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
          >
            Find My Destinations
          </button>

          {suggestions && (
            <div className="mt-5 space-y-3">
              <p className="text-xs font-medium text-adv-teal">Recommended for you:</p>
              {suggestions.map((s) => (
                <button
                  key={s.code}
                  onClick={() => navigate(`/travel/country/${s.code}`)}
                  className="flex w-full items-center gap-3 rounded-xl border border-adv-teal/20 bg-adv-dark px-4 py-3 text-left hover:border-adv-teal/50 transition-colors"
                >
                  <span className="text-2xl">{s.flag}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-adv-off-white">{s.name}</span>
                    <p className="text-xs text-adv-gray mt-0.5 truncate">{s.why}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-adv-teal" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
