/**
 * market-dead-letter-triage.ts
 * Sorts markets workflow step failures by what would actually fix them.
 *
 * market_workflow_dead_letters has been recording every failed step since
 * 2026-03-18 and, until now, nothing read it — no route aggregated it, no page
 * displayed it, and `grep -rn 'dead.letter' src/` returned nothing at all. That
 * is how 30 daily-intelligence runs came to produce zero theses and zero
 * predictions while reporting success for five months.
 *
 * A flat list of 205 rows would not have surfaced it either. Sorted by cause,
 * the same rows say something an operator can act on:
 *
 *     provider-credit      137 rows / 75 runs   top up the account
 *     prompt-slot-crash     36 rows / 19 runs   a code bug (fixed 2026-09-05)
 *     sql-type-bug          13 rows / 13 runs   a code bug (fixed 2026-04)
 *     timeout               10 rows / 10 runs   transient
 *     provider-rate-limit    5 rows /  5 runs   transient
 *     streaming-required     4 rows /  4 runs   a config bug
 *
 * Two thirds of every markets step failure on record is one thing: the
 * Anthropic account running out of credit. That is not a bug report, it is a
 * standing operational fact, and no amount of code hardening addresses it.
 * Grouping by cause is what makes it visible.
 *
 * The classification lives here rather than in SQL so there is exactly one
 * implementation — the route needs it for the summary AND for each row, and a
 * CASE expression duplicated into a WHERE clause is how those two drift apart.
 */

/** Who, or what, has to change for this failure to stop happening. */
export type Remedy =
  /** An operator must do something outside the app (billing, config, keys). */
  | 'operator'
  /** A defect in this repository. */
  | 'code'
  /** Expected to pass on a retry; nothing to fix. */
  | 'transient'
  /** Not recognised — read the message. */
  | 'unknown';

export interface FailureMode {
  id: string;
  label: string;
  /** One sentence an operator can act on, not a restatement of the error. */
  meaning: string;
  remedy: Remedy;
}

const MODES: Array<FailureMode & { match: (e: string) => boolean }> = [
  {
    id: 'provider-credit',
    label: 'Provider credit exhausted',
    meaning: 'The model provider refused the call because the account had no credit. Nothing in the pipeline can recover from this.',
    remedy: 'operator',
    match: (e) => /credit balance|insufficient_quota|billing/i.test(e),
  },
  {
    id: 'provider-rate-limit',
    label: 'Provider rate or usage limit',
    meaning: 'The provider throttled the call. Usually clears on its own; persistent hits mean the schedule asks for more than the plan allows.',
    remedy: 'transient',
    match: (e) => /rate limit|usage limit|429|overloaded/i.test(e),
  },
  {
    id: 'prompt-slot-crash',
    label: 'Missing input crashed the prompt',
    meaning: "A step read an earlier step's output that was not there, and JSON.stringify(undefined).slice() threw while building the prompt. Fixed 2026-09-05; rows before then are history.",
    remedy: 'code',
    match: (e) => /reading 'slice'|reading "slice"/i.test(e),
  },
  {
    id: 'sql-type-bug',
    label: 'SQL type or column fault',
    meaning: 'A query referenced a column that does not exist, or compared incompatible types — the PostgreSQL-migration bug class.',
    remedy: 'code',
    match: (e) => /operator does not exist|does not exist|42703|23502/i.test(e),
  },
  {
    id: 'streaming-required',
    label: 'Streaming required by provider',
    meaning: 'The provider rejected a long non-streaming request. A client configuration fault, not a model failure.',
    remedy: 'code',
    match: (e) => /streaming is (strongly )?required|stream: true/i.test(e),
  },
  {
    id: 'timeout',
    label: 'Step timed out',
    meaning: 'The step exceeded its own timeout. On a laptop that suspends, wall-clock time is not work time — a run frozen mid-call fires its timeout on resume.',
    remedy: 'transient',
    match: (e) => /timed out|timeout|ETIMEDOUT/i.test(e),
  },
];

export const UNKNOWN_MODE: FailureMode = {
  id: 'other',
  label: 'Unclassified',
  meaning: 'No known signature matched. Read the message — if this grows, it deserves its own category here.',
  remedy: 'unknown',
};

/**
 * Classify one dead letter by its error text.
 *
 * Order matters: a timeout message can also contain the word "limit", so the
 * more specific provider signatures are tested first. `timeout` is deliberately
 * last of the real modes because its pattern is the broadest.
 */
export function classifyDeadLetter(error: string | null | undefined): FailureMode {
  if (!error) return UNKNOWN_MODE;
  for (const mode of MODES) {
    if (mode.match(error)) {
      const { match: _match, ...info } = mode;
      return info;
    }
  }
  return UNKNOWN_MODE;
}

/** Every mode the UI may need to render, in the order it should list them. */
export function allFailureModes(): FailureMode[] {
  return MODES.map(({ match: _match, ...info }) => info).concat(UNKNOWN_MODE);
}

export interface DeadLetterRow {
  id: string;
  run_id: string;
  step_name: string;
  error: string | null;
  retry_count: number;
  created_at: string;
  workflow_id: string | null;
  run_status: string | null;
  run_error_message: string | null;
}

export interface DeadLetterSummary {
  total: number;
  affectedRuns: number;
  /** Failures whose containing run nonetheless reported success. */
  hiddenInSuccessfulRuns: number;
  /** Runs that reported success while containing at least one failed step. */
  runsThatClaimedSuccess: number;
  firstSeen: string | null;
  lastSeen: string | null;
  byMode: Array<{ mode: FailureMode; count: number; runs: number; lastSeen: string }>;
  byStep: Array<{ step: string; count: number; hidden: number; lastSeen: string }>;
}

/**
 * Aggregate a set of dead letters for the page header.
 *
 * `hiddenInSuccessfulRuns` is the number this page exists for. A step failure
 * inside a run that reported `completed` is invisible everywhere else in the
 * product: the loop-health watchdog counts the run as a success, the same-day
 * dedup guard treats the day as done, and the scheduler's catch-up will not
 * retry the slot. It is the shape that hid the thesis-generation bug from March
 * to September.
 */
export function summariseDeadLetters(rows: readonly DeadLetterRow[]): DeadLetterSummary {
  const byMode = new Map<string, { mode: FailureMode; count: number; runs: Set<string>; lastSeen: string }>();
  const byStep = new Map<string, { step: string; count: number; hidden: number; lastSeen: string }>();
  const runs = new Set<string>();
  const successfulRuns = new Set<string>();
  let hidden = 0;
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;

  for (const row of rows) {
    runs.add(row.run_id);
    const isHidden = row.run_status === 'completed';
    if (isHidden) {
      hidden++;
      successfulRuns.add(row.run_id);
    }
    if (firstSeen === null || row.created_at < firstSeen) firstSeen = row.created_at;
    if (lastSeen === null || row.created_at > lastSeen) lastSeen = row.created_at;

    const mode = classifyDeadLetter(row.error);
    const m = byMode.get(mode.id) ?? { mode, count: 0, runs: new Set<string>(), lastSeen: row.created_at };
    m.count++;
    m.runs.add(row.run_id);
    if (row.created_at > m.lastSeen) m.lastSeen = row.created_at;
    byMode.set(mode.id, m);

    const s = byStep.get(row.step_name) ?? { step: row.step_name, count: 0, hidden: 0, lastSeen: row.created_at };
    s.count++;
    if (isHidden) s.hidden++;
    if (row.created_at > s.lastSeen) s.lastSeen = row.created_at;
    byStep.set(row.step_name, s);
  }

  return {
    total: rows.length,
    affectedRuns: runs.size,
    hiddenInSuccessfulRuns: hidden,
    runsThatClaimedSuccess: successfulRuns.size,
    firstSeen,
    lastSeen,
    byMode: [...byMode.values()]
      .map((m) => ({ mode: m.mode, count: m.count, runs: m.runs.size, lastSeen: m.lastSeen }))
      .sort((a, b) => b.count - a.count),
    byStep: [...byStep.values()].sort((a, b) => b.count - a.count),
  };
}
