/**
 * CalendarEventSheet — bottom sheet for adding a calendar event from the
 * companion app. Shared by Pro CalendarScreen and Standard StdCalendarScreen.
 *
 * Posts to /api/app/org/:orgId/calendar/events via createOrgCalendarEvent.
 * On success the parent gets onCreated() so it can refresh its events list.
 */

import { useState, useEffect } from 'react';
import BottomSheet from './BottomSheet';
import { Btn, Spinner } from './ui';
import { createOrgCalendarEvent } from '../services/api';
import { tick, success as hapticSuccess, error as hapticError } from '../services/haptics';

interface Props {
  open: boolean;
  orgId: string;
  /** YYYY-MM-DD; defaults to today when omitted */
  defaultDate?: string;
  onClose: () => void;
  onCreated: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextHourLabel(offset = 0): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1 + offset);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function CalendarEventSheet({ open, orgId, defaultDate, onClose, onCreated }: Props): JSX.Element {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate ?? todayIso());
  const [startTime, setStartTime] = useState(nextHourLabel(0));
  const [endTime, setEndTime] = useState(nextHourLabel(1));
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Reset form whenever the sheet is reopened so leftover state from a
  // previous edit doesn't leak into the next add.
  useEffect(() => {
    if (open) {
      setTitle('');
      setDate(defaultDate ?? todayIso());
      setStartTime(nextHourLabel(0));
      setEndTime(nextHourLabel(1));
      setAllDay(false);
      setLocation('');
      setErrMsg(null);
    }
  }, [open, defaultDate]);

  async function save() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setErrMsg(null);
    void tick();
    try {
      const startIso = allDay
        ? `${date}T00:00:00.000Z`
        : new Date(`${date}T${startTime}:00`).toISOString();
      const endIso = allDay
        ? `${date}T23:59:00.000Z`
        : new Date(`${date}T${endTime}:00`).toISOString();
      await createOrgCalendarEvent(orgId, {
        title: title.trim(),
        start_at: startIso,
        end_at: endIso,
        all_day: allDay,
        location: location.trim() || undefined,
      });
      void hapticSuccess();
      onCreated();
      onClose();
    } catch (e) {
      void hapticError();
      setErrMsg(e instanceof Error ? e.message : 'Failed to create event');
    }
    setSaving(false);
  }

  const inputStyle = {
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  } as const;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Add event"
      maxHeight="80dvh"
      footer={
        <div className="flex gap-2">
          <Btn variant="ghost" size="md" block onClick={onClose} disabled={saving}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            size="md"
            block
            onClick={() => void save()}
            disabled={saving || !title.trim()}
            icon={saving ? <Spinner size="sm" tone="on-accent" /> : undefined}
          >
            Save
          </Btn>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        {errMsg && (
          <div
            role="alert"
            className="rounded-[var(--radius-r2)] px-3 py-2 text-xs"
            style={{ background: 'var(--color-red-dim)', color: 'var(--color-red)' }}
          >
            {errMsg}
          </div>
        )}

        <div>
          <label htmlFor="evt-title" className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">
            Title
          </label>
          <input
            id="evt-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="What is it?"
            autoFocus
            className="w-full rounded-[var(--radius-r2)] px-3 text-base focus:outline-none"
            style={{ ...inputStyle, height: 44 }}
          />
        </div>

        <div>
          <label htmlFor="evt-date" className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">
            Date
          </label>
          <input
            id="evt-date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full rounded-[var(--radius-r2)] px-3 text-base focus:outline-none"
            style={{ ...inputStyle, height: 44 }}
          />
        </div>

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={allDay}
            onChange={e => setAllDay(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm text-[var(--color-text)]">All-day event</span>
        </label>

        {!allDay && (
          <div className="flex gap-2.5">
            <div className="flex-1">
              <label htmlFor="evt-start" className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">
                Start
              </label>
              <input
                id="evt-start"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-[var(--radius-r2)] px-3 text-base focus:outline-none"
                style={{ ...inputStyle, height: 44 }}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="evt-end" className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">
                End
              </label>
              <input
                id="evt-end"
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full rounded-[var(--radius-r2)] px-3 text-base focus:outline-none"
                style={{ ...inputStyle, height: 44 }}
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="evt-loc" className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">
            Location <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
          </label>
          <input
            id="evt-loc"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Office, Zoom link, address…"
            className="w-full rounded-[var(--radius-r2)] px-3 text-base focus:outline-none"
            style={{ ...inputStyle, height: 44 }}
          />
        </div>
      </div>
    </BottomSheet>
  );
}
