/**
 * TravelPlannerPage.tsx
 *
 * Day-by-day itinerary builder for a trip.
 * Supports adding activities per day and AI itinerary generation.
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Map, Plus, X, Loader2, Sparkles, ChevronLeft,
  Clock, MapPin, DollarSign,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAuthHeader } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface Trip {
  id: number;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  status: string;
  cover_emoji: string;
  items?: ItineraryItem[];
}

interface ItineraryItem {
  id: number;
  trip_id: number;
  day_number: number;
  time_slot: string;
  title: string;
  description: string;
  location: string;
  category: 'activity' | 'food' | 'transport' | 'accommodation' | 'other';
  cost: number;
}

type TravelStyle = 'budget' | 'mid' | 'luxury';

const CATEGORY_COLORS: Record<string, string> = {
  activity: 'bg-adv-teal-dim text-adv-teal',
  food: 'bg-adv-gold/10 text-adv-gold',
  transport: 'bg-adv-blue/10 text-adv-blue',
  accommodation: 'bg-adv-green/10 text-adv-green',
  other: 'bg-adv-dark text-adv-gray',
};

const INTERESTS = ['History & Culture', 'Food & Cuisine', 'Nature & Hiking', 'Beaches', 'Art & Museums', 'Nightlife', 'Shopping', 'Architecture', 'Sports', 'Photography'];

// ── Helpers ──────────────────────────────────────────────────────────

function getDayCount(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 3;
  const diff = new Date(endDate).getTime() - new Date(startDate).getTime();
  const days = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
  return Math.min(days, 30);
}

function dayLabel(n: number, startDate?: string): string {
  if (!startDate) return `Day ${n}`;
  const d = new Date(startDate);
  d.setDate(d.getDate() + n - 1);
  return `Day ${n} — ${d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

// ── Component ────────────────────────────────────────────────────────

export default function TravelPlannerPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tripId = searchParams.get('trip');

  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // AI generation
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiInterests, setAiInterests] = useState<string[]>([]);
  const [aiDays, setAiDays] = useState('5');
  const [aiStyle, setAiStyle] = useState<TravelStyle>('mid');
  const abortRef = useRef<AbortController | null>(null);

  // Add form
  const [formData, setFormData] = useState({
    time_slot: '',
    title: '',
    description: '',
    location: '',
    category: 'activity' as ItineraryItem['category'],
    cost: '',
  });

  useEffect(() => {
    if (tripId) loadTrip(tripId);
    else setLoading(false);
  }, [tripId]);

  async function loadTrip(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/travel/trips/${id}`, { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setTrip(data);
        setItems(data.items ?? []);
        if (data.start_date && data.end_date) {
          setAiDays(String(getDayCount(data.start_date, data.end_date)));
        }
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }

  async function handleAddItem() {
    if (!formData.title.trim() || !tripId) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/travel/trips/${tripId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          ...formData,
          day_number: activeDay,
          cost: formData.cost ? Number(formData.cost) : 0,
        }),
      });
      if (!res.ok) throw new Error('Failed to add item');
      const item = await res.json();
      setItems((prev) => [...prev, item]);
      setFormData({ time_slot: '', title: '', description: '', location: '', category: 'activity', cost: '' });
      setShowAddForm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateAI() {
    if (!trip) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAiResult('');
    setAiStreaming(true);

    try {
      const res = await fetch('/api/travel/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          destination: trip.destination,
          days: Number(aiDays),
          interests: aiInterests,
          budget: aiStyle,
        }),
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
              setAiResult(fullText);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setAiResult('Failed to generate itinerary. Please try again.');
      }
    } finally {
      setAiStreaming(false);
    }
  }

  const dayCount = trip ? getDayCount(trip.start_date, trip.end_date) : 3;
  const dayItems = items.filter((i) => i.day_number === activeDay).sort((a, b) => (a.time_slot || '').localeCompare(b.time_slot || ''));
  const dayTotal = dayItems.reduce((s, i) => s + (i.cost || 0), 0);
  const tripTotal = items.reduce((s, i) => s + (i.cost || 0), 0);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-adv-gray">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading trip…</span>
      </div>
    );
  }

  if (!trip && !tripId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-adv-gray">No trip selected.</p>
        <button onClick={() => navigate('/travel/trips')} className="flex items-center gap-2 text-adv-teal hover:underline">
          <ChevronLeft className="h-4 w-4" />
          Go to My Trips
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/travel/trips')} className="text-adv-gray hover:text-adv-off-white">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-blue/10">
            <Map className="h-5 w-5 text-adv-blue" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">{trip?.cover_emoji || '✈️'}</span>
              <h1 className="text-xl font-semibold text-adv-off-white">{trip?.title || 'Trip Planner'}</h1>
            </div>
            <p className="text-sm text-adv-gray">{trip?.destination} {trip?.start_date ? `· ${trip.start_date}` : ''}</p>
          </div>
          <div className="text-right text-xs text-adv-gray-med">
            <div>Trip total: <span className="text-adv-off-white font-semibold">${tripTotal.toLocaleString()}</span></div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-5">
        {/* Day tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => (
            <button
              key={day}
              onClick={() => { setActiveDay(day); setShowAddForm(false); }}
              className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                activeDay === day
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border bg-adv-card text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
              }`}
            >
              Day {day}
            </button>
          ))}
        </div>

        {/* Day header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-adv-off-white">{dayLabel(activeDay, trip?.start_date)}</h2>
            {dayTotal > 0 && (
              <p className="text-xs text-adv-gray">Day cost: <span className="text-adv-off-white">${dayTotal.toLocaleString()}</span></p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAiPanel((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-adv-gold/30 bg-adv-gold/10 px-3 py-2 text-sm text-adv-gold hover:bg-adv-gold/20 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Generate with AI
            </button>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
            >
              {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              Add Activity
            </button>
          </div>
        </div>

        {/* AI generation panel */}
        {showAiPanel && (
          <div className="rounded-xl border border-adv-gold/30 bg-adv-card p-5 space-y-4">
            <h3 className="font-semibold text-adv-off-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-adv-gold" />
              Generate AI Itinerary
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Number of days</span>
                <input type="number" min="1" max="30" value={aiDays} onChange={(e) => setAiDays(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Travel style</span>
                <select value={aiStyle} onChange={(e) => setAiStyle(e.target.value as TravelStyle)}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none">
                  <option value="budget">Budget</option>
                  <option value="mid">Mid-range</option>
                  <option value="luxury">Luxury</option>
                </select>
              </label>
            </div>
            <div>
              <p className="mb-2 text-xs text-adv-gray">Interests (select all that apply)</p>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((interest) => (
                  <button key={interest}
                    onClick={() => setAiInterests((prev) => prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest])}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                      aiInterests.includes(interest) ? 'border-adv-teal bg-adv-teal-dim text-adv-teal' : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med'
                    }`}>
                    {interest}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleGenerateAI} disabled={aiStreaming}
              className="flex items-center gap-2 rounded-lg bg-adv-gold px-4 py-2 text-sm font-medium text-adv-dark hover:bg-yellow-500 disabled:opacity-50">
              {aiStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate Itinerary
            </button>
            {(aiResult || aiStreaming) && (
              <div className="rounded-lg border border-adv-gold/20 bg-adv-dark p-4">
                <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiResult}</ReactMarkdown>
                  {aiStreaming && <span className="animate-pulse text-adv-gold">▊</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add item form */}
        {showAddForm && (
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-3">
            <h3 className="font-semibold text-adv-off-white">Add Activity — Day {activeDay}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Time</span>
                <input type="time" value={formData.time_slot} onChange={(e) => setFormData({ ...formData, time_slot: e.target.value })}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Category</span>
                <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value as ItineraryItem['category'] })}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none">
                  <option value="activity">Activity</option>
                  <option value="food">Food</option>
                  <option value="transport">Transport</option>
                  <option value="accommodation">Accommodation</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-adv-gray">Title *</span>
                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Visit Senso-ji Temple"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Location</span>
                <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. Asakusa, Tokyo"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Estimated cost (USD)</span>
                <input type="number" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  placeholder="0"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-adv-gray">Notes</span>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2} placeholder="Optional notes…"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none resize-none" />
              </label>
            </div>
            {error && <p className="text-sm text-adv-red">{error}</p>}
            <button onClick={handleAddItem} disabled={saving || !formData.title.trim()}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add
            </button>
          </div>
        )}

        {/* Day items */}
        {dayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
            <Map className="mb-2 h-8 w-8 text-adv-gray-med" />
            <p className="text-sm text-adv-gray">No activities yet for Day {activeDay}</p>
            <button onClick={() => setShowAddForm(true)} className="mt-3 text-sm text-adv-teal hover:underline">
              + Add an activity
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {dayItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-adv-card p-4 flex gap-4">
                <div className="shrink-0 w-14 text-center">
                  {item.time_slot && (
                    <div className="flex items-center gap-1 text-xs text-adv-gray-med">
                      <Clock className="h-3 w-3" />
                      <span>{item.time_slot}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[item.category]}`}>
                      {item.category}
                    </span>
                    {item.cost > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-adv-gray-med">
                        <DollarSign className="h-3 w-3" />{item.cost}
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-adv-off-white">{item.title}</p>
                  {item.location && (
                    <p className="flex items-center gap-1 text-xs text-adv-gray mt-0.5">
                      <MapPin className="h-3 w-3" />{item.location}
                    </p>
                  )}
                  {item.description && (
                    <p className="text-xs text-adv-gray-med mt-1">{item.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
