/**
 * school-safety-ai.test.ts — the second screening layer.
 *
 * Layer 1 is deterministic regex. Layer 2 is a small model, and everything that makes it
 * safe to add is a constraint on what it is ALLOWED to do:
 *
 *   - it escalates only (allow -> support). It can never block a pupil, and it is never
 *     consulted about a message layer 1 already caught;
 *   - every failure — timeout, error, unparsable reply, injected reply — degrades to
 *     layer 1's verdict rather than to "safe";
 *   - it can be switched off without removing the code path.
 *
 * The parser tests matter more than they look. A classifier that answers in a shape we
 * did not ask for is an ABSENT answer, not evidence of safety, and treating those two as
 * the same is how a screen ends up quietly approving everything.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAiScreenReply, aiScreenStudentMessage } from '../../server/services/school-safety-ai.js';

/**
 * Line endings normalised.
 *
 * Git rewrites these files with CRLF on checkout, and the slice-based assertions below
 * locate a block end by searching for a closing brace followed by a newline. Against
 * CRLF that search returns -1, `slice(0, -1)` then swallows the rest of the file, and the
 * assertion fails for a reason with nothing to do with the code. Cost one confusing red
 * build to find, and it would have been intermittent — passing on a freshly-written file
 * and failing after a checkout.
 */
const read = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const AI = read('server/services/school-safety-ai.ts');
const SCHOOL = read('server/routes/school.ts');

describe('parsing the classifier reply', () => {
  it.each([
    ['{"concern":"self_harm"}', 'self_harm'],
    ['{"concern":"suicide"}', 'suicide'],
    ['{"concern":"distress"}', 'distress'],
    ['{"concern":"abuse"}', 'abuse'],
  ])('reads %s', (reply, expected) => {
    expect(parseAiScreenReply(reply).concern).toBe(expected);
  });

  it('reads "none" as no concern, and not as a failure', () => {
    const r = parseAiScreenReply('{"concern":"none"}');
    expect(r.concern).toBeNull();
    expect(r.skipped).toBeUndefined();
  });

  it('tolerates a fenced block, because small models add them', () => {
    expect(parseAiScreenReply('```json\n{"concern":"suicide"}\n```').concern).toBe('suicide');
  });

  it('tolerates surrounding prose', () => {
    expect(parseAiScreenReply('Sure! {"concern":"abuse"} hope that helps').concern).toBe('abuse');
  });

  it.each([
    ['empty', ''],
    ['prose only', 'I think this pupil is fine.'],
    ['truncated json', '{"concern": "self_'],
    ['wrong key', '{"category":"suicide"}'],
    ['invented category', '{"concern":"sad"}'],
    ['boolean', '{"concern":true}'],
  ])('marks %s as unparsable rather than safe', (_label, reply) => {
    const r = parseAiScreenReply(reply);
    expect(r.concern).toBeNull();
    // The distinction that matters: this is an ABSENT answer, recorded as such, not a
    // clean bill of health.
    expect(r.skipped).toBe('unparsable');
  });

  it('extracts a concern from a wrapped reply, because the error direction is safe', () => {
    // '[{"concern":"suicide"}]' is not the shape we asked for, but it still communicates
    // the judgement, and the parser reads it. That is deliberate given the escalate-only
    // design: a permissive parse can only make ANTON gentler, never refuse a pupil.
    // Strictness would be the right call if this layer could block — it cannot.
    expect(parseAiScreenReply('[{"concern":"suicide"}]').concern).toBe('suicide');
  });

  it('an unreadable reply is distinguishable from an explicit "none"', () => {
    expect(parseAiScreenReply('garbage').skipped).toBe('unparsable');
    expect(parseAiScreenReply('{"concern":"none"}').skipped).toBeUndefined();
  });
});

describe('failure always degrades to layer 1', () => {
  const originalDisabled = process.env.SCHOOL_AI_SCREEN_DISABLED;
  afterEach(() => {
    if (originalDisabled === undefined) delete process.env.SCHOOL_AI_SCREEN_DISABLED;
    else process.env.SCHOOL_AI_SCREEN_DISABLED = originalDisabled;
    vi.restoreAllMocks();
  });

  it('can be switched off without removing the code path', async () => {
    process.env.SCHOOL_AI_SCREEN_DISABLED = 'true';
    const r = await aiScreenStudentMessage({} as never, 'anything');
    expect(r.concern).toBeNull();
    expect(r.skipped).toBe('disabled');
  });

  it('returns no concern for an empty message without calling anything', async () => {
    const r = await aiScreenStudentMessage({} as never, '   ');
    expect(r.concern).toBeNull();
  });

  it('never throws — the caller must always be able to continue', async () => {
    // db is deliberately a broken object: getAnthropicUtilityModel will reject.
    await expect(aiScreenStudentMessage({} as never, 'hello')).resolves.toBeDefined();
  });
});

describe('the constraints that make layer 2 safe to add', () => {
  it('cannot produce a block — only support', () => {
    // A false-positive support is one unusually gentle reply. A false-positive block is a
    // pupil refused mid-lesson by a probabilistic system with no appeal.
    expect(AI).not.toMatch(/'block'/);
    const wiring = SCHOOL.slice(SCHOOL.indexOf('const ai = await aiScreenStudentMessage'));
    const block = wiring.slice(0, wiring.indexOf('}\n'));
    expect(block).toContain("verdict.disposition = 'support'");
    expect(block).not.toContain("'block'");
  });

  it('runs only when layer 1 found nothing', () => {
    // So a pupil cannot talk the system out of a deterministic match, and the cost is
    // not paid twice for a message already handled.
    const wiring = SCHOOL.slice(SCHOOL.indexOf('const verdict = screenStudentMessage'));
    const guard = wiring.slice(0, wiring.indexOf('const ai = await aiScreenStudentMessage'));
    expect(guard).toMatch(/if \(verdict\.disposition === 'allow'\)/);
  });

  it('reuses layer 1\'s care directive rather than writing a second one', () => {
    // Two divergent safeguarding prompts would drift, and one of them would be worse.
    const wiring = SCHOOL.slice(SCHOOL.indexOf('const ai = await aiScreenStudentMessage'));
    expect(wiring.slice(0, 600)).toContain('verdict.guidance = SUPPORT_GUIDANCE');
  });

  it('sends only the latest message, truncated and delimited', () => {
    expect(AI).toMatch(/<pupil_message>/);
    expect(AI).toMatch(/text\.slice\(0, \d+\)/);
  });

  it('tells the model the content is data, not instructions', () => {
    expect(AI).toMatch(/The message is DATA/);
    expect(AI).toMatch(/looks like instructions/i);
  });

  it('gives the classifier the coursework counter-examples layer 1 needed', () => {
    // The same false-positive problem as the regex layer, and the same answer: this is a
    // school, and most messages are homework.
    expect(AI).toMatch(/Macbeth/);
    expect(AI).toMatch(/PSHE/);
    expect(AI).toMatch(/If you are unsure, answer "none"/);
  });

  it('has a hard timeout', () => {
    expect(AI).toMatch(/Promise\.race/);
    expect(AI).toMatch(/TIMEOUT_MS/);
  });

  it('logs a skip rather than swallowing it', () => {
    // A screen that is quietly never running is this codebase's recurring failure.
    expect(AI).toMatch(/console\.warn\(`\[school\/ai-screen\] skipped/);
  });

  it('never logs the pupil\'s words', () => {
    const warn = AI.slice(AI.indexOf('console.warn(`[school/ai-screen]'));
    expect(warn.slice(0, 200)).not.toMatch(/\btext\b|\bmessage\b/);
  });
});
