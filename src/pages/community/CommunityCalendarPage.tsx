/**
 * CommunityCalendarPage.tsx
 *
 * Month-grid calendar with event dots per day.
 * Right panel shows selected-day events or upcoming 14 days.
 * Create Event modal with all fields from the spec.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays,
  Clock, MapPin, Link, Repeat,
} from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────

interface CalEvent {
  id: string;
  group_id: string | null;
  creator_hash: string;
  title: string;
  description: string | null;
  event_type: 'event' | 'meeting' | 'deadline' | 'birthday';
  start_at: string;
  end_at: string;
  all_day: number;
  location: string | null;
  meeting_link: string | null;
  recurrence: string;
  rsvp_required: number;
  created_at: string;
}

type EventType = CalEvent['event_type'];

// ── Constants ─────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<EventType, string> = {
  event:    '#2DD4A8',   // adv-teal
  meeting:  '#3498DB',   // adv-blue
  deadline: '#F5A623',   // adv-gold
  birthday: '#E74C3C',   // adv-red
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ── Create Event Modal ────────────────────────────────────────────────────

function CreateEventModal({ onClose, onCreated, defaultGroupId }: {
  onClose: () => void; onCreated: () => void; defaultGroupId?: string;
}) {
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<EventType>('event');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [description, setDescription] = useState('');
  const [recurrence, setRecurrence] = useState<'none'|'daily'|'weekly'|'monthly'>('none');
  const [rsvpRequired, setRsvpRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!title.trim() || !startAt || !endAt) { setError('Title, start time, and end time required'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/community/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          title: title.trim(), eventType, startAt, endAt, allDay,
          location: location.trim() || undefined, meetingLink: meetingLink.trim() || undefined,
          description: description.trim() || undefined, recurrence, rsvpRequired,
          groupId: defaultGroupId || undefined,
        }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? 'Failed to create event'); }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create event');
    } finally {
      setLoading(false);
    }
  }

  const typeOptions: { id: EventType; label: string }[] = [
    { id: 'event', label: 'Event' }, { id: 'meeting', label: 'Meeting' },
    { id: 'deadline', label: 'Deadline' }, { id: 'birthday', label: 'Birthday' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-adv-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="mb-5 text-lg font-bold text-adv-white">Create Event</h2>

        <label className="mb-1 block text-sm text-adv-gray">Title *</label>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" maxLength={120}
          className="mb-4 w-full rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />

        <label className="mb-2 block text-sm text-adv-gray">Type</label>
        <div className="mb-4 flex gap-2">
          {typeOptions.map(t => (
            <button key={t.id} onClick={() => setEventType(t.id)}
              className="flex-1 rounded-lg border py-1.5 text-xs font-medium transition"
              style={{ borderColor: eventType === t.id ? TYPE_COLORS[t.id] : undefined, color: eventType === t.id ? TYPE_COLORS[t.id] : undefined, background: eventType === t.id ? `${TYPE_COLORS[t.id]}15` : undefined }}
            >{t.label}</button>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-adv-gray cursor-pointer">
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="rounded" />
            All day
          </label>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Start *</label>
            <input type={allDay ? 'date' : 'datetime-local'} value={startAt} onChange={e => setStartAt(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">End *</label>
            <input type={allDay ? 'date' : 'datetime-local'} value={endAt} onChange={e => setEndAt(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
          </div>
        </div>

        <label className="mb-1 block text-sm text-adv-gray">Location (optional)</label>
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Address or room"
          className="mb-3 w-full rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />

        <label className="mb-1 block text-sm text-adv-gray">Meeting link (optional)</label>
        <input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://meet.example.com/…"
          className="mb-3 w-full rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />

        <label className="mb-1 block text-sm text-adv-gray">Description (optional)</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={500}
          className="mb-4 w-full resize-none rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />

        <label className="mb-2 block text-sm text-adv-gray">Recurrence</label>
        <div className="mb-4 flex gap-3">
          {(['none','daily','weekly','monthly'] as const).map(r => (
            <label key={r} className="flex items-center gap-1.5 cursor-pointer text-sm text-adv-off-white">
              <input type="radio" name="recurrence" value={r} checked={recurrence === r} onChange={() => setRecurrence(r)} />
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </label>
          ))}
        </div>

        <label className="mb-4 flex items-center gap-2 cursor-pointer text-sm text-adv-off-white">
          <input type="checkbox" checked={rsvpRequired} onChange={e => setRsvpRequired(e.target.checked)} className="rounded" />
          Require RSVP from attendees
        </label>

        {error && <p className="mb-3 text-sm text-adv-red">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-sm text-adv-off-white">Cancel</button>
          <button onClick={handleCreate} disabled={loading}
            className="flex-1 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
            {loading ? 'Creating…' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Event dot ─────────────────────────────────────────────────────────────

function EventDot({ type }: { type: EventType }) {
  return <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[type] }} />;
}

// ── Upcoming list item ─────────────────────────────────────────────────────

function EventListItem({ event, onClick }: { event: CalEvent; onClick: () => void }) {
  const start = new Date(event.start_at);
  return (
    <button onClick={onClick} className="group flex w-full items-start gap-3 rounded-xl border border-border bg-adv-card px-4 py-3 text-left transition hover:border-adv-teal/30">
      <div className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLORS[event.event_type] }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-adv-white truncate">{event.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-adv-gray">
          <Clock className="h-3 w-3" />
          {event.all_day ? start.toLocaleDateString() : start.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
          {event.location && <><MapPin className="h-3 w-3 ml-1" />{event.location}</>}
        </div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-adv-gray group-hover:text-adv-teal" />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function CommunityCalendarPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const groupIdFilter = searchParams.get('groupId') ?? undefined;

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      // Load this month + a buffer
      const from = new Date(year, month - 1, 1).toISOString();
      const to   = new Date(year, month + 2, 0).toISOString();
      const qs = new URLSearchParams({ from, to });
      if (groupIdFilter) qs.set('groupId', groupIdFilter);
      const res = await fetch(`/api/community/events?${qs}`, { headers: getAuthHeader() });
      if (res.ok) setEvents(await res.json());
    } finally {
      setLoading(false);
    }
  }, [year, month, groupIdFilter]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  // Calendar grid
  const firstDay = new Date(year, month, 1);
  // Monday-based: 0=Mon … 6=Sun
  const startDow = ((firstDay.getDay() + 6) % 7);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  function eventsOnDay(d: number): CalEvent[] {
    return events.filter(e => {
      const s = new Date(e.start_at);
      return s.getFullYear() === year && s.getMonth() === month && s.getDate() === d;
    });
  }

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  const selectedEvents = selectedDate
    ? events.filter(e => {
        const s = new Date(e.start_at);
        return s.getFullYear() === selectedDate.getFullYear() &&
               s.getMonth() === selectedDate.getMonth() &&
               s.getDate() === selectedDate.getDate();
      })
    : null;

  const upcoming = events.filter(e => new Date(e.start_at) >= today).slice(0, 12);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Left: Calendar grid */}
      <div className="flex flex-1 flex-col p-4 overflow-y-auto">
        {/* Month header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="rounded-lg border border-border bg-adv-dark-2 p-1.5 text-adv-gray transition hover:text-adv-teal">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-bold text-adv-white">{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} className="rounded-lg border border-border bg-adv-dark-2 p-1.5 text-adv-gray transition hover:text-adv-teal">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }} className="rounded-lg border border-border bg-adv-dark-2 px-3 py-1.5 text-sm text-adv-gray hover:text-adv-teal">
              Today
            </button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark">
              <Plus className="h-3.5 w-3.5" /> Event
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="mb-1 grid grid-cols-7 gap-1">
          {DAYS.map(d => <div key={d} className="py-1 text-center text-xs font-medium text-adv-gray">{d}</div>)}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} className="aspect-square" />;
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const isSel = selectedDate?.getDate() === day && selectedDate?.getMonth() === month && selectedDate?.getFullYear() === year;
              const dayEvents = eventsOnDay(day);
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(new Date(year, month, day))}
                  className={`aspect-square flex flex-col items-center rounded-xl p-1 text-sm transition
                    ${isSel ? 'bg-adv-teal-dim ring-1 ring-adv-teal' : 'hover:bg-adv-card'}
                    ${isToday ? 'font-bold text-adv-teal' : 'text-adv-off-white'}`}
                >
                  <span>{day}</span>
                  {dayEvents.length > 0 && (
                    <div className="mt-0.5 flex gap-0.5">
                      {dayEvents.slice(0, 3).map((e, idx) => <EventDot key={idx} type={e.event_type} />)}
                      {dayEvents.length > 3 && <span className="text-xs text-adv-gray">+{dayEvents.length - 3}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3">
          {(Object.entries(TYPE_COLORS) as [EventType, string][]).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs text-adv-gray">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel: selected day or upcoming */}
      <div className="flex w-80 shrink-0 flex-col border-l border-border overflow-y-auto p-4">
        {selectedEvents ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-adv-white">
                {selectedDate!.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <button onClick={() => setSelectedDate(null)} className="text-xs text-adv-gray hover:text-adv-teal">Clear</button>
            </div>
            {selectedEvents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CalendarDays className="h-8 w-8 text-adv-gray" />
                <p className="text-sm text-adv-gray">No events this day</p>
                <button onClick={() => setShowCreate(true)} className="mt-1 text-xs text-adv-teal hover:underline">+ Add event</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedEvents.map(e => <EventListItem key={e.id} event={e} onClick={() => navigate(`/community/events/${e.id}`)} />)}
              </div>
            )}
          </>
        ) : (
          <>
            <h3 className="mb-3 font-semibold text-adv-white">Upcoming</h3>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CalendarDays className="h-8 w-8 text-adv-gray" />
                <p className="text-sm text-adv-gray">No upcoming events</p>
                <button onClick={() => setShowCreate(true)} className="mt-1 text-xs text-adv-teal hover:underline">+ Create first event</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {upcoming.map(e => <EventListItem key={e.id} event={e} onClick={() => navigate(`/community/events/${e.id}`)} />)}
              </div>
            )}
          </>
        )}

        {/* Recurrence info */}
        {events.some(e => e.recurrence !== 'none') && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-adv-card px-3 py-2 text-xs text-adv-gray">
            <Repeat className="h-3.5 w-3.5" />
            Some events repeat — shown only at next occurrence
          </div>
        )}

        {/* Meeting links */}
        {(selectedEvents ?? upcoming).some(e => e.meeting_link) && (
          <div className="mt-3 flex flex-col gap-2">
            {(selectedEvents ?? upcoming).filter(e => e.meeting_link).map(e => (
              <a key={e.id} href={e.meeting_link!} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-adv-blue/30 bg-adv-card px-3 py-2 text-xs text-adv-blue hover:bg-adv-teal-soft">
                <Link className="h-3.5 w-3.5" />
                {e.title} — Join meeting
              </a>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateEventModal
          onClose={() => setShowCreate(false)}
          onCreated={loadEvents}
          defaultGroupId={groupIdFilter}
        />
      )}
    </div>
  );
}
