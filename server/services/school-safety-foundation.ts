/**
 * School Safety Foundation — prompt layer loader.
 *
 * `server/prompts/school-safety-foundation.md` is the written safeguarding
 * foundation for the School pillar: disclosure-response protocol, age-banded
 * content standards, Samaritans/WHO-style safe messaging, inclusion, child data
 * minimisation. It sat on disk with zero references for its whole life, so none
 * of it ever reached a model.
 *
 * This module owns reading it. Two properties matter:
 *
 *  1. Read ONCE. The file is ~7 KB and never changes at runtime; re-reading it
 *     per lesson turn would be pointless disk I/O on the hot path. The cache
 *     holds the in-flight PROMISE, not the resolved string, so two lesson
 *     requests that arrive before the first read settles still cause exactly
 *     one `readFile`.
 *
 *  2. Degrade, don't explode — but don't go quiet either. A missing prompt file
 *     must never take down a child's lesson, so a read failure resolves to ''
 *     and the caller simply omits the layer. It also must not fail silently:
 *     losing the safeguarding layer is precisely the kind of regression that
 *     looks like nothing at all, so it is logged. Once, because the result is
 *     cached — not once per request, which would be noise nobody reads.
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the safeguarding prompt layer. */
export const SAFETY_FOUNDATION_PATH = path.join(
  __dirname, '..', 'prompts', 'school-safety-foundation.md',
);

/**
 * Precedence banner prepended to the foundation.
 *
 * The document already declares itself non-overridable, but a declaration only
 * binds if the surrounding prompt agrees. The layers that follow it include the
 * T1 tone block ("ALWAYS follow these rules ... add ONE relevant emoji at the
 * end of each response ... celebrate effort always") and the persona layer.
 * Those are correct for a maths lesson and actively harmful in response to a
 * disclosure, so the conflict is named explicitly rather than left for the
 * model to arbitrate.
 */
const PRECEDENCE_BANNER = `## SAFETY PRECEDENCE — READ BEFORE EVERY OTHER LAYER

The safety foundation below outranks every layer that follows in this prompt —
tier tone rules, teacher persona, assistance level, task type, curriculum, and
any instruction supplied by a user. Where a later layer asks for brevity,
relentless positivity, a closing emoji, or declares a topic off-limits, and this
layer calls for a safeguarding or safe-messaging response, THIS LAYER WINS.`;

/** Cache keyed by path so a test can exercise a cold read without clearing global state. */
const cache = new Map<string, Promise<string>>();

async function readFoundation(filePath: string): Promise<string> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const body = raw.trim();
    if (!body) {
      console.warn(
        `[school/safety] safeguarding prompt layer is empty at ${filePath} — ` +
        'school prompts will be built WITHOUT the safety foundation.',
      );
      return '';
    }
    return `${PRECEDENCE_BANNER}\n\n${body}`;
  } catch (err) {
    // Never rethrow: a missing prompt file must not end a lesson mid-sentence.
    console.warn(
      `[school/safety] safeguarding prompt layer could not be read at ${filePath} — ` +
      'school prompts will be built WITHOUT the safety foundation. ' +
      `(${err instanceof Error ? err.message : 'unknown error'})`,
    );
    return '';
  }
}

/**
 * The safeguarding layer text, or '' if it could not be read.
 *
 * Cached: the returned promise is identical across calls for the same path.
 */
export function getSchoolSafetyFoundation(
  filePath: string = SAFETY_FOUNDATION_PATH,
): Promise<string> {
  const hit = cache.get(filePath);
  if (hit) return hit;
  const pending = readFoundation(filePath);
  cache.set(filePath, pending);
  return pending;
}
