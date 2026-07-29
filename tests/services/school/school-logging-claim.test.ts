/**
 * school-logging-claim.test.ts — the prompt must not tell a child something untrue
 * about who can read what they write.
 *
 * `school-system-foundation.md` told the model, under "Safety and Wellbeing":
 *
 *     All interactions are logged for academic integrity and student safety
 *
 * They are not. `POST /school/chat` writes a row to `messages` only inside
 * `if (sessionId)`, and `SchoolChatPage.tsx` — the student-facing chat — never sends
 * one. The word `sessionId` does not appear in that file at all. So the branch is
 * unreachable from the only surface a pupil uses, and the transcript does not exist.
 *
 * What DOES exist is narrower and the opposite shape: `school_safety_events` records
 * `disposition`, `category` and `rule_name` when the screen fires, and deliberately
 * never the child's words (see migration 255). So the honest statement is almost the
 * inverse of the old one — the conversation is not kept, but a safety concern does
 * reach an adult.
 *
 * Why this matters more than a stale comment: a child told they are being watched
 * behaves as though they are being watched. Some of them will not say the thing that
 * needed saying. That is a safeguarding harm caused by a sentence in a prompt file,
 * and the direction of the error is the dangerous one — the product under-delivering
 * on a promise of oversight that a teacher may also believe.
 *
 * The owner's decision was explicit: do not build transcript persistence, fix the
 * claim. This test pins BOTH halves — the wording, and the behaviour that makes the
 * wording true — so that adding persistence later fails here and forces the prompt to
 * be updated with it, rather than the two drifting apart again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const PROMPT = read('server/prompts/school-system-foundation.md');
const CHAT_PAGE = read('src/pages/school/SchoolChatPage.tsx');
const SCHOOL_ROUTES = read('server/routes/school.ts');

describe('the prompt does not claim a transcript that does not exist', () => {
  it('the old sentence is gone', () => {
    expect(PROMPT).not.toContain('All interactions are logged');
  });

  it('does not tell the model the conversation is logged, saved or recorded', () => {
    // Scoped to affirmative claims. The replacement text mentions those words while
    // FORBIDDING the claim, so a bare substring search would be satisfied by exactly
    // the wording that fixes the bug — the kind of assertion that passes for the
    // wrong reason.
    const claims = [
      /interactions are (logged|recorded|saved)/i,
      /conversations? (is|are) (logged|recorded|saved|stored)\b/i,
      /your teacher can (read|see) (this|your) (conversation|chat)/i,
    ];
    for (const re of claims) {
      expect(PROMPT, `prompt still asserts: ${re}`).not.toMatch(re);
    }
  });

  it('instructs the model not to make the claim to a student', () => {
    expect(PROMPT).toMatch(/never tell a student that this conversation is being logged/i);
  });

  it('does not swing to the opposite error and promise secrecy', () => {
    // "Nothing you say leaves this room" would be equally false and considerably
    // worse: a safety event genuinely does reach a teacher.
    expect(PROMPT).toMatch(/never promise secrecy/i);
  });

  it('states what actually happens instead', () => {
    expect(PROMPT).toMatch(/Safety Inbox/);
    expect(PROMPT).toMatch(/never the student's own words/i);
  });
});

describe('...and the behaviour still matches the wording', () => {
  it('the student chat page sends no sessionId, so nothing is persisted', () => {
    // The whole reason the claim was false. If this ever changes, the prompt has to
    // change with it — which is what this test is for.
    expect(CHAT_PAGE).not.toMatch(/\bsessionId\b/);
  });

  it('the message insert is still gated on a sessionId', () => {
    // Guards the assertion above from becoming decorative: it only proves anything
    // while persistence depends on that parameter.
    const handler = SCHOOL_ROUTES.slice(SCHOOL_ROUTES.indexOf("router.post('/school/chat'"));
    const insert = handler.indexOf('INSERT INTO messages');
    expect(insert, 'the /school/chat handler must still contain the message insert').toBeGreaterThan(-1);
    expect(handler.slice(0, insert)).toMatch(/if \(sessionId\)/);
  });

  it('the safety-event row carries no message content', () => {
    // The claim "never the student's own words" is only honest while this holds.
    const insert = SCHOOL_ROUTES.slice(SCHOOL_ROUTES.indexOf('INSERT INTO school_safety_events'));
    const columns = /\(([^)]*)\)/.exec(insert)![1];
    expect(columns).not.toMatch(/\b(content|message|text|body|excerpt)\b/);
    expect(columns).toMatch(/category/);
  });
});
