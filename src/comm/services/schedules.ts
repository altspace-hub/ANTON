/**
 * schedules.ts — scheduled / recurring payment reminders (#79 Phase 6,
 * ported from Pay's services/schedules.ts).
 *
 * The user's intuition was "let me schedule rent on the 1st." The
 * only SAFE shape for self-custody is **reminder + same-tap signing**:
 * a local notification fires at the scheduled time, the user opens
 * the app, biometric-confirms, the tx is built with a FRESH rate
 * and signed at that moment. We never:
 *   - Hold the priv key warm to auto-sign (breaks self-custody,
 *     drags us into MiCA Title V custody scope).
 *   - Pre-sign a future tx (replayable, no network/key-rotation
 *     safety net).
 *
 * Recurrence model — we deliberately do NOT pull a full RFC 5545
 * RRULE library. The four cases below cover ~95% of real consumer
 * use; the rest can be added as needed:
 *   • `daily`   — every N days
 *   • `weekly`  — every N weeks on a chosen weekday (0=Sun ... 6=Sat)
 *   • `monthly` — the Nth day of every month (1..28, or 'last')
 *   • `yearly`  — a chosen month + day-of-month
 *
 * Fire time is always 09:00 local on the chosen day.
 *
 * Storage: the shared Comm IDB (`anton-comm`) store `schedules`
 * (v8 → v9 bump in db.ts).
 */
import { openDb, STORE_SCHEDULES } from './db';

export type RecurrenceKind = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface DailyRecurrence {
  kind: 'daily';
  interval: number; // every N days
}
export interface WeeklyRecurrence {
  kind: 'weekly';
  interval: number; // every N weeks
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}
export interface MonthlyRecurrence {
  kind: 'monthly';
  /** 1..28 (avoid 29-31 to dodge Feb / 30-day months ambiguity).
   *  Special value -1 = last day of the month. */
  dayOfMonth: number;
}
export interface YearlyRecurrence {
  kind: 'yearly';
  month: 1|2|3|4|5|6|7|8|9|10|11|12;
  dayOfMonth: number;
}
export type Recurrence =
  | DailyRecurrence
  | WeeklyRecurrence
  | MonthlyRecurrence
  | YearlyRecurrence;

export interface Schedule {
  id: string;
  /** Address the recurring payment goes to. */
  payeeAddress: string;
  /** Optional human label — copies the contact name when payee is in
   *  the address book; falls back to abbreviated address. */
  payeeLabel?: string;
  /** Canonical amount being sent — µFTC. */
  amountMicroFtc: bigint;
  /** Optional fiat snapshot at create time — purely informational.
   *  The amount that actually sends at fire time is always FTC. */
  fiatAtCreate?: { value: number; currency: string };
  recurrence: Recurrence;
  /** Epoch ms when the next reminder should fire. */
  nextFireAt: number;
  /** Epoch ms when the most recent reminder fired (and was acted on
   *  OR dismissed). null if never fired. */
  lastFiredAt: number | null;
  /** When the schedule was created. */
  createdAt: number;
  /** Once paused / cancelled by the user, no further reminders fire
   *  until the user explicitly reactivates. */
  active: boolean;
  /** Optional ADR-004 reference — copied to RmtInf on each fire so
   *  the merchant can match the payment to the recurring obligation. */
  ref?: string;
}

const STORE = STORE_SCHEDULES;

interface IdbSchedule extends Omit<Schedule, 'amountMicroFtc'> {
  amountMicroFtc: string;
}
function serialize(s: Schedule): IdbSchedule {
  return { ...s, amountMicroFtc: s.amountMicroFtc.toString() };
}
function hydrate(s: IdbSchedule): Schedule {
  return { ...s, amountMicroFtc: BigInt(s.amountMicroFtc) };
}

function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ── Recurrence math ─────────────────────────────────────────────────

/** Add `days` calendar days to `from`, preserving the local hour. */
function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

function nineAm(d: Date): Date {
  const out = new Date(d);
  out.setHours(9, 0, 0, 0);
  return out;
}

function lastDayOfMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate();
}

/**
 * Compute the next fire time strictly AFTER `after`. Pure function —
 * called both at create time (with after = now) and at fire time
 * (with after = lastFiredAt) so the schedule rolls forward.
 */
export function nextFireFrom(rec: Recurrence, after: number): number {
  const start = new Date(after);
  switch (rec.kind) {
    case 'daily': {
      const next = nineAm(addDays(start, Math.max(1, rec.interval)));
      return next.getTime() <= after ? addDays(next, 1).getTime() : next.getTime();
    }
    case 'weekly': {
      const next = nineAm(start);
      while (next.getDay() !== rec.dayOfWeek || next.getTime() <= after) {
        next.setDate(next.getDate() + 1);
      }
      return next.getTime();
    }
    case 'monthly': {
      const candidate = new Date(start);
      candidate.setHours(9, 0, 0, 0);
      const setToDom = (dt: Date) => {
        const dom = rec.dayOfMonth === -1
          ? lastDayOfMonth(dt.getFullYear(), dt.getMonth())
          : Math.min(rec.dayOfMonth, lastDayOfMonth(dt.getFullYear(), dt.getMonth()));
        dt.setDate(dom);
      };
      setToDom(candidate);
      if (candidate.getTime() <= after) {
        candidate.setMonth(candidate.getMonth() + 1);
        setToDom(candidate);
      }
      return candidate.getTime();
    }
    case 'yearly': {
      const candidate = new Date(start);
      candidate.setHours(9, 0, 0, 0);
      candidate.setMonth(rec.month - 1);
      const dom = Math.min(rec.dayOfMonth,
        lastDayOfMonth(candidate.getFullYear(), candidate.getMonth()));
      candidate.setDate(dom);
      if (candidate.getTime() <= after) {
        candidate.setFullYear(candidate.getFullYear() + 1);
        candidate.setMonth(rec.month - 1);
        const dom2 = Math.min(rec.dayOfMonth,
          lastDayOfMonth(candidate.getFullYear(), candidate.getMonth()));
        candidate.setDate(dom2);
      }
      return candidate.getTime();
    }
  }
}

/** Human description of a recurrence for the schedule-list row. */
export function describeRecurrence(rec: Recurrence): string {
  switch (rec.kind) {
    case 'daily':
      return rec.interval === 1 ? 'Every day' : `Every ${rec.interval} days`;
    case 'weekly': {
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      return `Every ${days[rec.dayOfWeek]}`;
    }
    case 'monthly':
      if (rec.dayOfMonth === -1) return 'Last day of each month';
      return `Monthly on day ${rec.dayOfMonth}`;
    case 'yearly': {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `Every ${months[rec.month - 1]} ${rec.dayOfMonth}`;
    }
  }
}

// ── CRUD ───────────────────────────────────────────────────────────

export async function listSchedules(): Promise<Schedule[]> {
  const db = await openDb();
  const rows = await new Promise<IdbSchedule[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as IdbSchedule[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  return rows.map(hydrate).sort((a, b) => a.nextFireAt - b.nextFireAt);
}

export async function getSchedule(id: string): Promise<Schedule | null> {
  const db = await openDb();
  const row = await new Promise<IdbSchedule | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as IdbSchedule | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  return row ? hydrate(row) : null;
}

export interface NewScheduleInput {
  payeeAddress: string;
  payeeLabel?: string;
  amountMicroFtc: bigint;
  fiatAtCreate?: { value: number; currency: string };
  recurrence: Recurrence;
  ref?: string;
  /** Override the first fire time. Defaults to nextFireFrom(rec, now). */
  firstFireAt?: number;
}

export async function createSchedule(input: NewScheduleInput): Promise<Schedule> {
  const now = Date.now();
  const s: Schedule = {
    id: newId(),
    payeeAddress: input.payeeAddress,
    payeeLabel: input.payeeLabel,
    amountMicroFtc: input.amountMicroFtc,
    fiatAtCreate: input.fiatAtCreate,
    recurrence: input.recurrence,
    nextFireAt: input.firstFireAt ?? nextFireFrom(input.recurrence, now),
    lastFiredAt: null,
    createdAt: now,
    active: true,
    ref: input.ref,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(serialize(s));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await scheduleNotificationFor(s);
  return s;
}

export async function setScheduleActive(id: string, active: boolean): Promise<void> {
  const s = await getSchedule(id);
  if (!s) return;
  const updated: Schedule = { ...s, active };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(serialize(updated));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  if (active) await scheduleNotificationFor(updated);
  else await cancelNotificationFor(s.id);
}

export async function deleteSchedule(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await cancelNotificationFor(id);
}

/**
 * Called by the schedule's tap-flow after the user signs the next
 * occurrence. Rolls nextFireAt forward to the following window,
 * stamps lastFiredAt, persists, re-arms the notification.
 */
export async function recordFire(id: string): Promise<Schedule | null> {
  const s = await getSchedule(id);
  if (!s) return null;
  const now = Date.now();
  const updated: Schedule = {
    ...s,
    lastFiredAt: now,
    nextFireAt: nextFireFrom(s.recurrence, now),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(serialize(updated));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  if (updated.active) await scheduleNotificationFor(updated);
  return updated;
}

// ── Notification scheduling ────────────────────────────────────────

/** Stable positive int per schedule for the LocalNotifications id. */
function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

type LocalNotificationsPlugin = typeof import('@capacitor/local-notifications').LocalNotifications;

// Read the registered plugin off the global bridge — NEVER `await` the proxy
// (it's thenable → `await proxy` hangs forever). See
// reference_capacitor_plugin_registration.
function loadPlugin(): LocalNotificationsPlugin | null {
  const w = window as unknown as {
    Capacitor?: { Plugins?: { LocalNotifications?: LocalNotificationsPlugin } };
  };
  return w.Capacitor?.Plugins?.LocalNotifications ?? null;
}

// Android 8+ drops a notification whose channel was never created (no auto-create).
const ensuredChannels = new Set<string>();
async function ensureChannel(plugin: LocalNotificationsPlugin, id: string, name: string): Promise<void> {
  if (ensuredChannels.has(id)) return;
  ensuredChannels.add(id);
  try {
    await plugin.createChannel({ id, name, importance: 5, visibility: 1, vibration: true });
  } catch { /* older Android / web — schedule() will still try */ }
}

function shortAddr(a: string): string {
  return a.length > 16 ? `${a.slice(0,10)}…${a.slice(-4)}` : a;
}

async function scheduleNotificationFor(s: Schedule): Promise<void> {
  const plugin = loadPlugin();
  if (!plugin || !s.active) return;
  const ftc = Number(s.amountMicroFtc) / 1_000_000;
  const payee = s.payeeLabel ?? shortAddr(s.payeeAddress);
  try {
    await ensureChannel(plugin, 'fc-comm-scheduled', 'Scheduled payments');
    await plugin.schedule({
      notifications: [{
        id: idHash(s.id),
        title: `Payment due — ${ftc} FTC to ${payee}`,
        body: 'Tap to sign and send.',
        schedule: { at: new Date(s.nextFireAt) },
        smallIcon: 'ic_stat_notify',
        channelId: 'fc-comm-scheduled',
        // Extras the tap handler reads to navigate the user straight
        // to the prefilled send screen.
        extra: { scheduleId: s.id },
      }],
    });
  } catch { /* permission may be denied — silent */ }
}

async function cancelNotificationFor(id: string): Promise<void> {
  const plugin = loadPlugin();
  if (!plugin) return;
  try {
    await plugin.cancel({ notifications: [{ id: idHash(id) }] });
  } catch { /* no-op */ }
}

/** Re-arms every active schedule's notification. Call this on app
 *  start so a fresh install / OS-cleared notifications get back to
 *  a healthy state. */
export async function reconcileScheduleNotifications(): Promise<void> {
  const all = await listSchedules();
  for (const s of all.filter(s => s.active)) {
    await scheduleNotificationFor(s);
  }
}
