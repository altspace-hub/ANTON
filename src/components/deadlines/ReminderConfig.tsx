import { useState, useEffect, useCallback } from 'react';
import { Bell, X, Plus, Check, Loader2 } from 'lucide-react';
import type { DeadlineReminder } from './types';
import { apiGet, apiPost, apiDelete } from './types';

interface ReminderConfigProps {
  deadlineId: string;
}

const PRESET_DAYS = [1, 3, 7, 14, 30];

export default function ReminderConfig({ deadlineId }: ReminderConfigProps) {
  const [reminders, setReminders] = useState<DeadlineReminder[]>([]);
  const [loading, setLoading] = useState(true);

  // New reminder form state
  const [daysBefore, setDaysBefore] = useState<number | null>(7);
  const [customDays, setCustomDays] = useState('');
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadReminders = useCallback(async () => {
    try {
      const data = await apiGet<DeadlineReminder[]>(
        `/api/deadlines/${deadlineId}/reminders`
      );
      setReminders(data);
    } catch (err) {
      console.error('Failed to load reminders:', err);
    } finally {
      setLoading(false);
    }
  }, [deadlineId]);

  useEffect(() => {
    loadReminders();
  }, [loadReminders]);

  async function addReminder() {
    const days = daysBefore ?? parseInt(customDays, 10);
    if (!days || days < 1) return;

    setAdding(true);
    try {
      await apiPost(`/api/deadlines/${deadlineId}/reminders`, {
        remind_days_before: days,
        remind_via: email ? 'email' : 'in_app',
        email_address: email || null,
      });
      // Reset form
      setDaysBefore(7);
      setCustomDays('');
      setEmail('');
      await loadReminders();
    } catch (err) {
      console.error('Failed to add reminder:', err);
    } finally {
      setAdding(false);
    }
  }

  async function deleteReminder(id: string) {
    setDeletingId(id);
    try {
      await apiDelete(`/api/deadlines/reminders/${id}`);
      await loadReminders();
    } catch (err) {
      console.error('Failed to delete reminder:', err);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-adv-gray" />
      </div>
    );
  }

  return (
    <div>
      {/* Existing reminders */}
      {reminders.length > 0 ? (
        <div className="mb-4 flex flex-col gap-2">
          {reminders.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-border bg-adv-dark px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Bell className="h-3.5 w-3.5 text-adv-teal" />
                <span className="text-sm text-adv-off-white">
                  {r.remind_days_before} day{r.remind_days_before !== 1 ? 's' : ''}{' '}
                  before
                </span>
                {r.email_address && (
                  <span className="text-xs text-adv-gray">
                    → {r.email_address}
                  </span>
                )}
                {r.sent_at && (
                  <span className="rounded bg-adv-green/15 px-1.5 py-0.5 text-xs font-medium text-adv-green">
                    Sent
                  </span>
                )}
              </div>
              <button
                onClick={() => deleteReminder(r.id)}
                disabled={deletingId === r.id}
                className="rounded p-1 text-adv-gray transition-colors hover:bg-adv-card hover:text-adv-red"
              >
                {deletingId === r.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-center text-xs text-adv-gray">
          No reminders set.
        </p>
      )}

      {/* Add new reminder form */}
      <div className="rounded-xl border border-border bg-adv-dark p-4">
        <h4 className="mb-3 text-sm font-medium text-adv-off-white">
          Add Reminder
        </h4>

        {/* Days before selector */}
        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-adv-gray">
            Remind me
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_DAYS.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDaysBefore(d);
                  setCustomDays('');
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  daysBefore === d
                    ? 'bg-adv-teal text-adv-dark'
                    : 'bg-adv-card text-adv-gray hover:text-adv-off-white'
                }`}
              >
                {d}d
              </button>
            ))}

            {/* Custom input */}
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="365"
                value={customDays}
                onChange={(e) => {
                  setCustomDays(e.target.value);
                  setDaysBefore(null);
                }}
                placeholder="Custom"
                className="w-20 rounded-lg border border-border bg-adv-card px-2 py-1.5 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
              <span className="text-xs text-adv-gray">days before</span>
            </div>
          </div>
        </div>

        {/* Email address */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs text-adv-gray">
            Email (optional)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
        </div>

        {/* Add button */}
        <button
          onClick={addReminder}
          disabled={
            adding || (daysBefore === null && (!customDays || parseInt(customDays, 10) < 1))
          }
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-40"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add Reminder
        </button>
      </div>
    </div>
  );
}
