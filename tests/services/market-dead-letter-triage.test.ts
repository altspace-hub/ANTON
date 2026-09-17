/**
 * market-dead-letter-triage.test.ts
 *
 * The dead-letter table recorded every failed markets step for five months and
 * nothing read it, which is how 30 daily-intelligence runs produced zero theses
 * and zero predictions while reporting success. The page built on this module
 * exists to make that visible — so the two things it must get right are the
 * classification (which decides what an operator is told to do) and
 * `hiddenInSuccessfulRuns` (the number that would have caught it in March).
 *
 * The error strings below are real, taken from the live table.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyDeadLetter,
  summariseDeadLetters,
  allFailureModes,
  type DeadLetterRow,
} from '../../server/services/market-dead-letter-triage.js';

const row = (over: Partial<DeadLetterRow> & { id: string }): DeadLetterRow => ({
  run_id: 'run-1',
  step_name: 'Auto Thesis Generation',
  error: null,
  retry_count: 0,
  created_at: '2026-09-04T20:18:00.000Z',
  workflow_id: 'wf_markets_daily_intelligence',
  run_status: 'completed',
  run_error_message: null,
  ...over,
});

describe('classifyDeadLetter', () => {
  it('recognises the dominant failure on record: an empty credit balance', () => {
    // 137 of the 205 rows. Two thirds of every markets step failure ever
    // recorded is one operational fact, not a code defect.
    const mode = classifyDeadLetter('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API"}}');
    expect(mode.id).toBe('provider-credit');
    expect(mode.remedy).toBe('operator');
  });

  it('recognises the prompt-slot crash that cost the day', () => {
    const mode = classifyDeadLetter("Cannot read properties of undefined (reading 'slice')");
    expect(mode.id).toBe('prompt-slot-crash');
    expect(mode.remedy).toBe('code');
  });

  it('recognises a step timeout', () => {
    const mode = classifyDeadLetter('Step "Signal Scanner" timed out after 300000ms');
    expect(mode.id).toBe('timeout');
    expect(mode.remedy).toBe('transient');
  });

  it('recognises the PostgreSQL-migration bug class', () => {
    expect(classifyDeadLetter('operator does not exist: text < timestamp with time zone').id).toBe('sql-type-bug');
  });

  it('does not let the broad timeout pattern swallow a more specific provider error', () => {
    // Ordering matters: a provider message can carry the word "limit", and a
    // rate-limit message can mention timing out. The specific signatures are
    // tested before the general one, and this pins that.
    const rateLimited = classifyDeadLetter('429 rate limit exceeded, request timed out waiting for capacity');
    expect(rateLimited.id).toBe('provider-rate-limit');
  });

  it('returns the unclassified mode for an unrecognised message, rather than guessing', () => {
    const mode = classifyDeadLetter('something nobody has seen before');
    expect(mode.id).toBe('other');
    expect(mode.remedy).toBe('unknown');
  });

  it('handles a null error without throwing', () => {
    expect(classifyDeadLetter(null).id).toBe('other');
    expect(classifyDeadLetter(undefined).id).toBe('other');
  });

  it('exposes every mode with a remedy the UI can render', () => {
    const modes = allFailureModes();
    expect(modes.length).toBeGreaterThan(1);
    for (const m of modes) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.meaning.length).toBeGreaterThan(0);
      expect(['operator', 'code', 'transient', 'unknown']).toContain(m.remedy);
    }
  });
});

describe('summariseDeadLetters', () => {
  it('counts failures that hid inside a run reporting success', () => {
    // The headline. A step failure inside a 'completed' run is invisible to
    // loop health, to the same-day dedup guard, and to the scheduler's retry.
    const rows = [
      row({ id: 'a', run_id: 'r1', run_status: 'completed' }),
      row({ id: 'b', run_id: 'r1', run_status: 'completed' }),
      row({ id: 'c', run_id: 'r2', run_status: 'failed' }),
    ];
    const s = summariseDeadLetters(rows);
    expect(s.total).toBe(3);
    expect(s.hiddenInSuccessfulRuns).toBe(2);
    expect(s.runsThatClaimedSuccess).toBe(1); // both hidden rows share one run
    expect(s.affectedRuns).toBe(2);
  });

  it('groups by cause, most frequent first, counting distinct runs', () => {
    const rows = [
      row({ id: 'a', run_id: 'r1', error: 'Your credit balance is too low' }),
      row({ id: 'b', run_id: 'r1', error: 'Your credit balance is too low' }),
      row({ id: 'c', run_id: 'r2', error: 'Your credit balance is too low' }),
      row({ id: 'd', run_id: 'r3', error: "Cannot read properties of undefined (reading 'slice')" }),
    ];
    const s = summariseDeadLetters(rows);
    expect(s.byMode[0].mode.id).toBe('provider-credit');
    expect(s.byMode[0].count).toBe(3);
    expect(s.byMode[0].runs).toBe(2); // three rows, two runs
    expect(s.byMode[1].mode.id).toBe('prompt-slot-crash');
  });

  it('groups by step and tracks how many of each hid in a successful run', () => {
    const rows = [
      row({ id: 'a', step_name: 'Auto Thesis Generation', run_status: 'completed' }),
      row({ id: 'b', step_name: 'Auto Thesis Generation', run_status: 'failed', run_id: 'r2' }),
      row({ id: 'c', step_name: 'Signal Scanner', run_status: 'completed', run_id: 'r3' }),
    ];
    const s = summariseDeadLetters(rows);
    const thesis = s.byStep.find((x) => x.step === 'Auto Thesis Generation');
    expect(thesis?.count).toBe(2);
    expect(thesis?.hidden).toBe(1);
  });

  it('reports the true first and last occurrence regardless of input order', () => {
    const rows = [
      row({ id: 'a', created_at: '2026-06-01T00:00:00.000Z' }),
      row({ id: 'b', created_at: '2026-03-18T00:00:00.000Z' }),
      row({ id: 'c', created_at: '2026-09-04T00:00:00.000Z' }),
    ];
    const s = summariseDeadLetters(rows);
    expect(s.firstSeen).toBe('2026-03-18T00:00:00.000Z');
    expect(s.lastSeen).toBe('2026-09-04T00:00:00.000Z');
  });

  it('summarises an empty queue without inventing anything', () => {
    const s = summariseDeadLetters([]);
    expect(s).toMatchObject({
      total: 0, affectedRuns: 0, hiddenInSuccessfulRuns: 0,
      runsThatClaimedSuccess: 0, firstSeen: null, lastSeen: null,
    });
    expect(s.byMode).toEqual([]);
    expect(s.byStep).toEqual([]);
  });

  it('does not treat a run of unknown status as hidden', () => {
    // A dead letter whose run row is missing must not be counted as a silent
    // success — that would inflate the one number the page is judged on.
    const s = summariseDeadLetters([row({ id: 'a', run_status: null })]);
    expect(s.hiddenInSuccessfulRuns).toBe(0);
  });
});
