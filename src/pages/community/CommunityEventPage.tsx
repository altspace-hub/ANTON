/**
 * CommunityEventPage.tsx
 *
 * Single event detail page.
 * Shows event info, RSVP (if enabled), attendees, "Add to Calendar" (.ics download),
 * and edit/delete controls for the creator.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CalendarDays, Clock, MapPin, Link, Repeat, Download,
  Check, X, Minus, Trash2, Edit2, Users,
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────

interface Rsvp {
  id: string;
  contact_hash: string;
  display_name: string | null;
  status: 'accepted' | 'declined' | 'maybe' | 'pending';
  note: string | null;
  responded_at: string;
}

interface EventDetail {
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
  rsvps: Rsvp[];
}

// ── Constants ─────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  event: '#2DD4A8', meeting: '#3498DB', deadline: '#F5A623', birthday: '#E74C3C',
};

const TYPE_ICONS: Record<string, string> = {
  event: '🎉', meeting: '🤝', deadline: '⏰', birthday: '🎂',
};

const RSVP_STYLES: Record<Rsvp['status'], string> = {
  accepted: 'border-adv-green/40 bg-adv-green/10 text-adv-green',
  declined:  'border-adv-red/40 bg-adv-red/10 text-adv-red',
  maybe:     'border-adv-gold/40 bg-adv-gold/10 text-adv-gold',
  pending:   'border-border bg-adv-card text-adv-gray',
};

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay) return d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return d.toLocaleString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function myHash(): string { return localStorage.getItem('community-contact-hash') ?? ''; }

// ── Main page ─────────────────────────────────────────────────────────────

export default function CommunityEventPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const me = myHash();

  const loadEvent = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/events/${id}`, { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Event not found');
      setEvent(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load event');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadEvent(); }, [loadEvent]);

  async function handleRsvp(status: 'accepted' | 'declined' | 'maybe') {
    if (!id) return;
    setRsvpLoading(true);
    try {
      await fetchWithAuth(`/api/community/events/${id}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      void loadEvent();
    } finally {
      setRsvpLoading(false);
    }
  }

  function handleDownloadIcs() {
    if (!id) return;
    const a = document.createElement('a');
    a.href = `/api/community/events/${id}/ics`;
    a.setAttribute('download', `event-${id}.ics`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    await fetchWithAuth(`/api/community/events/${id}`, { method: 'DELETE' });
    navigate('/community/calendar');
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
    </div>
  );

  if (error || !event) return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="mb-4 text-adv-red">{error ?? 'Event not found'}</p>
      <button onClick={() => navigate('/community/calendar')} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark">
        Back to Calendar
      </button>
    </div>
  );

  const isCreator = event.creator_hash === me;
  const myRsvp = event.rsvps.find(r => r.contact_hash === me);
  const allDay = event.all_day === 1;
  const typeColor = TYPE_COLORS[event.event_type] ?? '#2DD4A8';

  const accepted = event.rsvps.filter(r => r.status === 'accepted');
  const declined = event.rsvps.filter(r => r.status === 'declined');
  const maybe    = event.rsvps.filter(r => r.status === 'maybe');

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Event header */}
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ backgroundColor: `${typeColor}20` }}>
          {TYPE_ICONS[event.event_type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold text-adv-white leading-tight">{event.title}</h1>
            <div className="flex shrink-0 gap-1">
              {isCreator && (
                <>
                  <button onClick={() => {}} title="Edit event" className="rounded-lg border border-border p-2 text-adv-gray transition hover:border-adv-teal/40 hover:text-adv-teal">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setShowDeleteConfirm(true)} title="Delete event" className="rounded-lg border border-border p-2 text-adv-gray transition hover:border-adv-red/40 hover:text-adv-red">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
          {event.recurrence !== 'none' && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-adv-card px-2 py-0.5 text-xs text-adv-gray">
              <Repeat className="h-3 w-3" />
              {event.recurrence.charAt(0).toUpperCase() + event.recurrence.slice(1)}
            </span>
          )}
        </div>
      </div>

      {/* Details card */}
      <div className="mb-5 rounded-xl border border-border bg-adv-card p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-adv-teal" />
          <div>
            <p className="text-sm text-adv-off-white">{formatDate(event.start_at, allDay)}</p>
            {event.end_at !== event.start_at && (
              <p className="text-xs text-adv-gray">→ {formatDate(event.end_at, allDay)}</p>
            )}
          </div>
        </div>
        {event.location && (
          <div className="flex items-center gap-3">
            <MapPin className="h-4 w-4 shrink-0 text-adv-teal" />
            <p className="text-sm text-adv-off-white">{event.location}</p>
          </div>
        )}
        {event.meeting_link && (
          <div className="flex items-center gap-3">
            <Link className="h-4 w-4 shrink-0 text-adv-blue" />
            <a href={event.meeting_link} target="_blank" rel="noopener noreferrer" className="text-sm text-adv-blue hover:underline truncate">
              {event.meeting_link}
            </a>
          </div>
        )}
        {event.description && (
          <p className="text-sm text-adv-off-white pt-1 border-t border-border">{event.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="mb-5 flex gap-3">
        <button
          onClick={handleDownloadIcs}
          className="flex items-center gap-2 rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-sm text-adv-off-white transition hover:border-adv-teal/40 hover:text-adv-teal"
        >
          <Download className="h-4 w-4" />
          Add to Calendar (.ics)
        </button>
      </div>

      {/* RSVP section */}
      {event.rsvp_required === 1 && (
        <div className="mb-5 rounded-xl border border-border bg-adv-card p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-adv-white">
            <Users className="h-4 w-4 text-adv-teal" />
            RSVP
          </h3>

          <div className="mb-4 flex gap-2">
            <button onClick={() => handleRsvp('accepted')} disabled={rsvpLoading}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${myRsvp?.status === 'accepted' ? 'border-adv-green bg-adv-green/10 text-adv-green' : 'border-border bg-adv-dark-2 text-adv-off-white hover:border-adv-green/40'}`}>
              <Check className="h-4 w-4" /> Accept
            </button>
            <button onClick={() => handleRsvp('maybe')} disabled={rsvpLoading}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${myRsvp?.status === 'maybe' ? 'border-adv-gold bg-adv-gold/10 text-adv-gold' : 'border-border bg-adv-dark-2 text-adv-off-white hover:border-adv-gold/40'}`}>
              <Minus className="h-4 w-4" /> Maybe
            </button>
            <button onClick={() => handleRsvp('declined')} disabled={rsvpLoading}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${myRsvp?.status === 'declined' ? 'border-adv-red bg-adv-red/10 text-adv-red' : 'border-border bg-adv-dark-2 text-adv-off-white hover:border-adv-red/40'}`}>
              <X className="h-4 w-4" /> Decline
            </button>
          </div>

          {event.rsvps.length > 0 && (
            <div className="space-y-2">
              {[...accepted, ...maybe, ...declined].map(r => (
                <div key={r.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${RSVP_STYLES[r.status]}`}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/20 text-xs font-medium">
                    {(r.display_name ?? r.contact_hash).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{r.display_name ?? r.contact_hash.slice(0, 20)}</p>
                    {r.note && <p className="text-xs opacity-75 truncate">{r.note}</p>}
                  </div>
                  <span className="text-xs capitalize">{r.status}</span>
                </div>
              ))}
              <p className="text-xs text-adv-gray pt-1">
                {accepted.length} accepted · {maybe.length} maybe · {declined.length} declined
              </p>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-adv-card p-6 shadow-2xl">
            <h3 className="mb-2 font-bold text-adv-white">Delete event?</h3>
            <p className="mb-5 text-sm text-adv-gray">This will permanently delete "{event.title}" and all RSVPs. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-sm text-adv-off-white">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 rounded-lg bg-adv-red px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
