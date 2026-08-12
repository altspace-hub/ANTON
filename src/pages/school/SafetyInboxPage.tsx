/**
 * SafetyInboxPage — signals raised by the School LLM safety screen.
 *
 * This is the page ANTON's removed "Teacher Oversight" pretended to be. That one queried
 * tables which did not exist, wrapped the query in `catch { return [] }`, and had no error
 * state — so a teacher saw "no flags" whether that meant no incidents or a broken query.
 * A safety view that can only ever look clean is worse than none.
 *
 * Three things follow from that, and none is decoration:
 *
 *   1. A failed load renders an ERROR, never an empty list. The empty state and the
 *      failure state must never be confusable.
 *   2. The page states what the screen does and does not catch, on the page, where the
 *      person relying on it will read it — not in a design doc.
 *   3. It never implies anyone has been told. ANTON contacts nobody.
 */
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ShieldAlert, Check, RefreshCw, Info } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '@/lib/api';

interface SafetyEvent {
  id: string;
  student_user_id: string;
  student_name: string | null;
  class_name: string | null;
  disposition: 'support' | 'block';
  category: string;
  created_at: string;
  acknowledged_at: string | null;
}

/** Plain language. A teacher should not have to decode a slug at speed. */
const CATEGORY_LABEL: Record<string, string> = {
  self_harm: 'Possible self-harm',
  suicide: 'Possible suicidal thoughts',
  distress: 'Signs of distress',
  abuse: 'Possible harm from someone else',
  weapons: 'Asked how to make a weapon',
  drugs: 'Asked how to make drugs',
  violence: 'Asked how to harm someone',
  sexual: 'Asked for sexual content',
};

/** Welfare categories come first and read differently from rule-breaking. */
const WELFARE = new Set(['self_harm', 'suicide', 'distress', 'abuse']);

export default function SafetyInboxPage() {
  const [events, setEvents] = useState<SafetyEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(
        `/api/school/safety/events${showAll ? '?all=1' : ''}`,
        { headers: getAuthHeader() },
      );
      if (!res.ok) {
        // Explicitly NOT `r.ok ? r.json() : []`. That idiom is why the old page could
        // render "nothing to see" on top of a 500.
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Could not load (HTTP ${res.status})`);
      }
      const data = await res.json() as { events?: SafetyEvent[] };
      setEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [showAll]);

  useEffect(() => { void load(); }, [load]);

  async function acknowledge(id: string) {
    setBusyId(id);
    try {
      const res = await fetchWithAuth(`/api/school/safety/events/${id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      if (!res.ok) throw new Error(`Could not update (HTTP ${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-adv-off-white">
          <ShieldAlert className="h-5 w-5 text-adv-gold" /> Wellbeing signals
        </h1>
        <p className="mt-1 text-sm text-adv-gray">
          Raised automatically when a pupil&apos;s message to ANTON suggests they may need
          support, or asks for something ANTON declined to help with.
        </p>
      </header>

      {/* Stated on the page, not in a doc. Someone relying on this must know its limits. */}
      <div className="mb-5 flex gap-2 rounded-lg border border-border bg-adv-card p-3 text-sm text-adv-gray">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-adv-blue" />
        <div className="space-y-1">
          <p>
            <strong className="text-adv-off-white">This is a signal, not an assessment.</strong>{' '}
            It detects clearly-worded statements only. It will miss hinting, slang, a
            different language, and a pupil who does not want to be noticed — which is
            common. An empty list does not mean nobody needs help.
          </p>
          <p>
            ANTON has <strong className="text-adv-off-white">not</strong> contacted anyone.
            Follow your school&apos;s safeguarding procedure — this page does not replace it,
            and marking something as seen here tells nobody else.
          </p>
          <p>ANTON records the category only. It does not store what the pupil wrote.</p>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={() => setShowAll(v => !v)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-adv-gray hover:border-adv-teal/40"
        >
          {showAll ? 'Show unseen only' : 'Include ones marked seen'}
        </button>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-adv-gray hover:border-adv-teal/40"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm text-adv-red"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">This list could not be loaded.</p>
            <p className="mt-0.5 opacity-90">{error}</p>
            <p className="mt-1 opacity-90">
              Do not read this as &quot;no concerns&quot; — nothing was retrieved. Try again,
              and tell whoever runs ANTON at your school if it keeps happening.
            </p>
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-adv-gray">Loading…</p>}

      {!isLoading && !error && events.length === 0 && (
        <div className="rounded-lg border border-border bg-adv-card p-6 text-center">
          <p className="text-sm text-adv-off-white">Nothing has been raised.</p>
          <p className="mt-1 text-xs text-adv-gray">
            This list loaded correctly and is empty. See the note above about what it cannot see.
          </p>
        </div>
      )}

      {!isLoading && !error && events.length > 0 && (
        <ul className="space-y-2">
          {events.map(ev => {
            const welfare = WELFARE.has(ev.category);
            return (
              <li
                key={ev.id}
                className={`rounded-lg border bg-adv-card p-3 ${welfare ? 'border-adv-gold/50' : 'border-border'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-adv-off-white">
                      {ev.student_name ?? ev.student_user_id}
                      {ev.class_name && <span className="text-adv-gray"> · {ev.class_name}</span>}
                    </p>
                    <p className={`text-sm ${welfare ? 'text-adv-gold' : 'text-adv-gray'}`}>
                      {CATEGORY_LABEL[ev.category] ?? ev.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <time className="text-xs text-adv-gray" dateTime={ev.created_at}>
                      {new Date(ev.created_at).toLocaleString()}
                    </time>
                    {ev.acknowledged_at ? (
                      <span className="flex items-center gap-1 text-xs text-adv-green">
                        <Check className="h-3.5 w-3.5" /> seen
                      </span>
                    ) : (
                      <button
                        disabled={busyId === ev.id}
                        onClick={() => void acknowledge(ev.id)}
                        className="rounded-lg border border-border px-2.5 py-1 text-xs text-adv-gray hover:border-adv-teal/40 disabled:opacity-50"
                      >
                        {busyId === ev.id ? 'Saving…' : 'Mark as seen'}
                      </button>
                    )}
                  </div>
                </div>
                {welfare && (
                  <p className="mt-2 text-xs text-adv-gray">
                    Talk to this pupil. ANTON encouraged them to speak to an adult they trust
                    and gave them a helpline, but it cannot follow up.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
