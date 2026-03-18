import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Plus, Trash2, CheckCircle2, Loader2,
  ChevronDown, ChevronUp, Bell,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface CalendarEvent {
  id: string;
  event_type: string;
  title: string;
  symbol: string | null;
  scheduled_at: string;
  importance: string;
  status: string;
  expected_outcome: string | null;
  actual_outcome: string | null;
  created_at: string;
}

const IMPORTANCE_COLORS: Record<string, string> = {
  low: 'text-adv-gray',
  medium: 'text-adv-blue',
  high: 'text-adv-gold',
  critical: 'text-adv-red',
};

const IMPORTANCE_BG: Record<string, string> = {
  low: 'bg-adv-gray/10 border-adv-gray/30',
  medium: 'bg-adv-blue/10 border-adv-blue/30',
  high: 'bg-adv-gold/10 border-adv-gold/30',
  critical: 'bg-adv-red/10 border-adv-red/30',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  earnings: 'Earnings',
  economic_release: 'Economic Release',
  central_bank: 'Central Bank',
  ipo: 'IPO',
  dividend: 'Dividend',
  regulatory: 'Regulatory',
  geopolitical: 'Geopolitical',
  technical: 'Technical',
};

export default function MarketEventCalendarPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingTriggers, setCheckingTriggers] = useState(false);
  const [horizon, setHorizon] = useState('7d');
  const [showCreate, setShowCreate] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [actualOutcome, setActualOutcome] = useState('');

  // Create form state
  const [newEventType, setNewEventType] = useState('earnings');
  const [newTitle, setNewTitle] = useState('');
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [newImportance, setNewImportance] = useState('medium');
  const [newSymbol, setNewSymbol] = useState('');
  const [newExpectedOutcome, setNewExpectedOutcome] = useState('');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/markets/events?horizon=${horizon}`);
      if (res.ok) setEvents(await res.json() as CalendarEvent[]);
    } catch (err) {
      console.error('[MarketEventCalendar] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [horizon]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleCheckTriggers = async () => {
    setCheckingTriggers(true);
    try {
      await fetchWithAuth('/api/markets/events/check-triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      fetchEvents();
    } catch (err) {
      console.error('[MarketEventCalendar] Trigger check error:', err);
    } finally {
      setCheckingTriggers(false);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newScheduledAt) return;
    try {
      await fetchWithAuth('/api/markets/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: newEventType,
          title: newTitle,
          scheduledAt: newScheduledAt,
          importance: newImportance,
          symbol: newSymbol || undefined,
          expectedOutcome: newExpectedOutcome || undefined,
        }),
      });
      setShowCreate(false);
      setNewTitle('');
      setNewScheduledAt('');
      setNewSymbol('');
      setNewExpectedOutcome('');
      fetchEvents();
    } catch (err) {
      console.error('[MarketEventCalendar] Create error:', err);
    }
  };

  const handleComplete = async (id: string) => {
    if (!actualOutcome.trim()) return;
    try {
      await fetchWithAuth(`/api/markets/events/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualOutcome }),
      });
      setCompletingId(null);
      setActualOutcome('');
      fetchEvents();
    } catch (err) {
      console.error('[MarketEventCalendar] Complete error:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this event?')) return;
    try {
      await fetchWithAuth(`/api/markets/events/${id}`, { method: 'DELETE' });
      fetchEvents();
    } catch (err) {
      console.error('[MarketEventCalendar] Delete error:', err);
    }
  };

  // Group events by date
  const grouped: Record<string, CalendarEvent[]> = {};
  for (const event of events) {
    const dateKey = new Date(event.scheduled_at).toLocaleDateString();
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(event);
  }

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/markets')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <Calendar className="h-6 w-6 text-adv-blue" />
              Event Calendar
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Track market-moving events and their outcomes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCheckTriggers} disabled={checkingTriggers} className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-sm text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-50">
            {checkingTriggers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Check Triggers
          </button>
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
            <Plus className="h-4 w-4" /> Add Event
          </button>
        </div>
      </div>

      <MarketDisclaimer compact />

      {/* Horizon Filters */}
      <div className="flex items-center gap-2">
        {['24h', '48h', '7d', '30d'].map((h) => (
          <button key={h} onClick={() => setHorizon(h)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${horizon === h ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
          >
            {h}
          </button>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">New Event</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-adv-gray mb-1">Title *</label>
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Event title"
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Scheduled At *</label>
              <input type="datetime-local" value={newScheduledAt} onChange={(e) => setNewScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal" />
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Event Type</label>
              <select value={newEventType} onChange={(e) => setNewEventType(e.target.value)} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
                <option value="earnings">Earnings</option>
                <option value="economic_release">Economic Release</option>
                <option value="central_bank">Central Bank</option>
                <option value="ipo">IPO</option>
                <option value="dividend">Dividend</option>
                <option value="regulatory">Regulatory</option>
                <option value="geopolitical">Geopolitical</option>
                <option value="technical">Technical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Importance</label>
              <select value={newImportance} onChange={(e) => setNewImportance(e.target.value)} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Symbol</label>
              <input type="text" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="AAPL"
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-adv-gray mb-1">Expected Outcome</label>
            <textarea value={newExpectedOutcome} onChange={(e) => setNewExpectedOutcome(e.target.value)} placeholder="What do you expect from this event?"
              rows={2} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newTitle.trim() || !newScheduledAt} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
          </div>
        </div>
      )}

      {/* Event List Grouped by Date */}
      {loading ? (
        <p className="text-sm text-adv-gray">Loading events...</p>
      ) : events.length === 0 ? (
        <div className="text-center py-16">
          <Calendar className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">No events in this horizon</h2>
          <p className="text-sm text-adv-gray">Add market events to track upcoming catalysts</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dateEvents]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-adv-off-white mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-adv-blue" />
                {date}
              </h3>
              <div className="space-y-2">
                {dateEvents.map((event) => (
                  <div key={event.id} className="rounded-xl border border-adv-card bg-adv-card p-4 hover:border-adv-teal/30 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${IMPORTANCE_BG[event.importance] || ''} ${IMPORTANCE_COLORS[event.importance] || 'text-adv-gray'}`}>
                            {event.importance}
                          </span>
                          <span className="rounded-md bg-adv-dark-2 px-2 py-0.5 text-xs text-adv-gray">
                            {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                          </span>
                          {event.symbol && (
                            <span className="text-xs font-medium text-adv-blue">{event.symbol}</span>
                          )}
                          <span className="text-xs text-adv-gray capitalize">{event.status}</span>
                        </div>
                        <h4 className="text-sm font-semibold text-adv-off-white">{event.title}</h4>
                        <p className="mt-0.5 text-xs text-adv-gray">
                          {new Date(event.scheduled_at).toLocaleTimeString()}
                        </p>
                        {event.expected_outcome && (
                          <p className="mt-1 text-xs text-adv-gray">
                            <span className="text-adv-off-white font-medium">Expected:</span> {event.expected_outcome}
                          </p>
                        )}
                        {event.actual_outcome && (
                          <p className="mt-1 text-xs text-adv-green">
                            <span className="font-medium">Actual:</span> {event.actual_outcome}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {event.status !== 'completed' && (
                          <button
                            onClick={() => { setCompletingId(completingId === event.id ? null : event.id); setActualOutcome(''); }}
                            className="flex items-center gap-1 rounded-md border border-adv-dark bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-green hover:border-adv-green transition-colors"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Complete
                          </button>
                        )}
                        <button onClick={() => handleDelete(event.id)} className="p-1.5 text-adv-gray hover:text-adv-red transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {completingId === event.id && (
                      <div className="mt-3 space-y-2 rounded-lg border border-adv-dark bg-adv-dark-2 p-3">
                        <label className="block text-xs text-adv-gray">Actual Outcome</label>
                        <textarea value={actualOutcome} onChange={(e) => setActualOutcome(e.target.value)} placeholder="What actually happened?"
                          rows={2} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
                        <div className="flex gap-2">
                          <button onClick={() => handleComplete(event.id)} disabled={!actualOutcome.trim()} className="rounded-md bg-adv-teal px-3 py-1 text-xs text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Submit</button>
                          <button onClick={() => setCompletingId(null)} className="rounded-md border border-adv-dark px-3 py-1 text-xs text-adv-gray hover:text-adv-off-white">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
