/**
 * TravelTripsPage.tsx
 *
 * Lists all trips with create/delete functionality.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Plus, X, Trash2, Loader2, ChevronRight, AlertCircle } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

interface Trip {
  id: number;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  status: 'planning' | 'active' | 'completed';
  budget: number;
  cover_emoji: string;
  created_at: string;
}

const COVER_EMOJIS = ['✈️', '🏖️', '🏔️', '🗺️', '🌍', '🏛️', '🗽', '🏕️', '🌴', '🎌'];

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-adv-blue/10 text-adv-blue border-adv-blue/20',
  active: 'bg-adv-green/10 text-adv-green border-adv-green/20',
  completed: 'bg-adv-gray-med/20 text-adv-gray border-adv-gray/20',
};

function formatDate(s: string) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('sv-SE');
}

export default function TravelTripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    destination: '',
    start_date: '',
    end_date: '',
    budget: '',
    cover_emoji: '✈️',
  });

  useEffect(() => {
    loadTrips();
  }, []);

  async function loadTrips() {
    setLoading(true);
    try {
      const res = await fetch('/api/travel/trips', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setTrips(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!formData.title.trim() || !formData.destination.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/travel/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          ...formData,
          budget: formData.budget ? Number(formData.budget) : null,
          status: 'planning',
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create trip');
      }
      const trip = await res.json();
      setTrips((prev) => [trip, ...prev]);
      setShowForm(false);
      setFormData({ title: '', destination: '', start_date: '', end_date: '', budget: '', cover_emoji: '✈️' });
      navigate(`/travel/planner?trip=${trip.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch(`/api/travel/trips/${id}`, { method: 'DELETE', headers: getAuthHeader() });
      setTrips((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // non-fatal
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal-dim">
              <Briefcase className="h-5 w-5 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-adv-off-white">My Trips</h1>
              <p className="text-sm text-adv-gray">{trips.length} trip{trips.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'New Trip'}
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-5">
        {/* Create form */}
        {showForm && (
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
            <h2 className="font-semibold text-adv-off-white">New Trip</h2>

            {/* Emoji picker */}
            <div>
              <p className="mb-2 text-xs text-adv-gray">Cover emoji</p>
              <div className="flex gap-2 flex-wrap">
                {COVER_EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setFormData((f) => ({ ...f, cover_emoji: e }))}
                    className={`rounded-lg border p-2 text-xl transition-colors ${
                      formData.cover_emoji === e ? 'border-adv-teal bg-adv-teal-dim' : 'border-border bg-adv-dark hover:border-adv-gray-med'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Trip name *</span>
                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Japan Spring 2026"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Destination *</span>
                <input type="text" value={formData.destination} onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  placeholder="e.g. Tokyo, Japan"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Start date</span>
                <input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">End date</span>
                <input type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Budget (USD)</span>
                <input type="number" value={formData.budget} onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  placeholder="e.g. 3000"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
              </label>
            </div>

            {error && <p className="text-sm text-adv-red">{error}</p>}
            <button onClick={handleCreate} disabled={saving || !formData.title.trim() || !formData.destination.trim()}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Trip & Open Planner
            </button>
          </div>
        )}

        {/* Delete confirmation */}
        {confirmDeleteId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-adv-dark/80 p-4">
            <div className="w-full max-w-sm rounded-xl border border-border bg-adv-card p-5 space-y-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-adv-red mt-0.5" />
                <div>
                  <h3 className="font-semibold text-adv-off-white">Delete trip?</h3>
                  <p className="text-sm text-adv-gray mt-1">This will permanently delete the trip and all its itinerary items.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleDelete(confirmDeleteId)} disabled={deletingId !== null}
                  className="flex items-center gap-2 rounded-lg bg-adv-red px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                  {deletingId !== null && <Loader2 className="h-4 w-4 animate-spin" />}
                  Delete
                </button>
                <button onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Trips list */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-adv-gray">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading trips…</span>
          </div>
        ) : trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Briefcase className="mb-3 h-10 w-10 text-adv-gray" />
            <h3 className="mb-1 font-semibold text-adv-off-white">No trips yet</h3>
            <p className="text-sm text-adv-gray">Create your first trip to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip) => (
              <div key={trip.id} className="group relative rounded-xl border border-border bg-adv-card p-5 transition-all hover:border-adv-teal/50 hover:shadow-lg">
                <button
                  onClick={() => setConfirmDeleteId(trip.id)}
                  className="absolute right-3 top-3 rounded p-1.5 text-adv-gray opacity-0 group-hover:opacity-100 hover:bg-adv-red/10 hover:text-adv-red transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                <button
                  onClick={() => navigate(`/travel/planner?trip=${trip.id}`)}
                  className="flex w-full flex-col gap-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{trip.cover_emoji || '✈️'}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-adv-off-white truncate">{trip.title}</h3>
                      <p className="text-sm text-adv-gray truncate">{trip.destination}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[trip.status] || ''}`}>
                      {trip.status}
                    </span>
                    {trip.start_date && (
                      <span className="text-xs text-adv-gray">{formatDate(trip.start_date)}</span>
                    )}
                  </div>

                  {trip.budget && (
                    <p className="text-xs text-adv-gray">Budget: ${trip.budget.toLocaleString()}</p>
                  )}

                  <div className="flex items-center justify-end gap-1 text-xs text-adv-teal">
                    <span>Open planner</span>
                    <ChevronRight className="h-3 w-3" />
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
