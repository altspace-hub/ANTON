/**
 * market-prompt-slot.ts
 * Renders one interpolated slot of an LLM prompt from a value that may not exist.
 *
 * Why this is its own module rather than an inline `?:`.
 *
 * The markets orchestrator builds each prompt by interpolating the outputs of
 * earlier steps, read back with `stepResults.find(s => s.step === '...')?.output`.
 * A step that fails pushes `{ step, status: 'error', error }` with NO `output`
 * key, so that lookup yields `undefined`. And `JSON.stringify(undefined)` does
 * not return the string "undefined" — it returns the VALUE `undefined`, so the
 * `.slice(0, n)` that every one of these call sites applies throws a TypeError.
 *
 * That is not a hypothetical. On 2026-09-04 the Signal Scanner step timed out,
 * and the two steps that read its output — AI Macro Brief and Auto Thesis
 * Generation — both died with "Cannot read properties of undefined (reading
 * 'slice')". Auto Thesis Generation is the step that creates theses and
 * predictions, and line 571 sat inside its prompt template literal, so it threw
 * while BUILDING the string, before any model call. The day produced zero
 * theses and zero predictions, and the run reported `completed`.
 *
 * The database says it had been happening for months: 36 dead letters carrying
 * that exact message, across 19 runs and 11 distinct dates from 2026-03-25
 * onward, every one of them on a run whose status is `completed`. Eighteen of
 * the nineteen were opened not by a timeout but by an Anthropic 400 — an
 * exhausted credit balance — which is worth stating plainly: the common trigger
 * is an ordinary, expected API failure, not an exotic one.
 *
 * This is the same defect the weekly pulse carried until it was fixed in place
 * (see the comment at the momentum-indicator block in
 * market-workflow-orchestrator.ts, where the note records that "no pulse has
 * actually seen an indicator, and nothing reported a fault").
 *
 * ── Why an explicit absence marker, and not an empty string ────────────────
 *
 * The tempting fix is `value ? JSON.stringify(value).slice(0, n) : ''`. It does
 * stop the throw, and it is what the one already-guarded site in the
 * orchestrator does. But an empty slot in a prompt is read by the model as a
 * statement about the MARKET — "the signal scan found nothing" — when the truth
 * is a statement about the PIPELINE: the scan never ran. The model then
 * reasons, confidently and invisibly, from an absence it believes is evidence.
 *
 * So the default here is a sentence naming the missing step. A prompt that says
 * "unavailable: the Signal Scanner step failed on this run" cannot be mistaken
 * for a quiet market, and it gives the model the option of saying so.
 */

/** What a slot renders as when its producing step did not deliver. */
export function absentSlot(producer: string): string {
  return `(unavailable — the "${producer}" step did not complete on this run, so this input is missing rather than empty)`;
}

/**
 * Render `value` as JSON for interpolation into a prompt, truncated to
 * `maxChars`, or an explicit absence marker naming `producer` when there is
 * nothing to render.
 *
 * Never throws. Beyond the undefined case that caused the incident, this also
 * covers the two other ways `JSON.stringify` fails to produce a string: a
 * top-level function or symbol (returns `undefined`), and a circular structure
 * (throws). Neither can arise from the current inputs — every one of them comes
 * from `JSON.parse` of a computation's stdout, from LLM text, or from a
 * node-postgres row — but a prompt slot is not the place to depend on that
 * staying true.
 */
export function promptSlot(value: unknown, maxChars: number, producer: string): string {
  if (value === undefined || value === null) return absentSlot(producer);
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    // Circular, or a toJSON() that threw.
    return absentSlot(producer);
  }
  // JSON.stringify returns undefined (the value) for a function or a symbol.
  if (typeof json !== 'string' || json.length === 0) return absentSlot(producer);
  return json.slice(0, maxChars);
}

/**
 * The same idea for an object of named slots handed to a model as one blob.
 *
 * `JSON.stringify({ a: undefined, b: 1 })` silently DROPS `a` — the key does not
 * appear at all. That is crash-safe and therefore easy to miss, but it has the
 * same failure mode as the empty string: on 2026-09-04 all four consuls were
 * handed `{"date":"2026-09-04"}` and nothing recorded that two of their three
 * inputs were missing. Absent entries are replaced by a marker so the blob
 * still names what it does not have.
 */
export function promptSlotObject(
  entries: Record<string, { value: unknown; producer: string }>,
  maxChars: number,
): string {
  const out: Record<string, unknown> = {};
  for (const [key, { value, producer }] of Object.entries(entries)) {
    out[key] = value === undefined || value === null ? absentSlot(producer) : value;
  }
  try {
    return JSON.stringify(out).slice(0, maxChars);
  } catch {
    return JSON.stringify({ error: 'prompt context could not be serialised' });
  }
}
