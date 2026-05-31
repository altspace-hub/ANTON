/**
 * no-raw-error-leak.test.ts — CI guard (roadmap Phase 6).
 *
 * Route error responses must go through safeError() (which returns a generic
 * message in production) — never the raw error. This fails if any route
 * res.json / SSE response interpolates String(err) or err.message directly,
 * preventing the ~250-site leak class from creeping back in.
 *
 * Line-based (catches the dominant single-line responses + SSE frames). Service
 * `return { error }` objects and logEvent/console/log calls are intentionally
 * NOT flagged — full errors belong in logs, only client responses are stripped.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROUTES_DIR = join(process.cwd(), 'server', 'routes');

// A raw error is String(<var>) or an error-named var's .message (err/error/e/ex/
// exception) — the latter is restricted to error-like receivers so a controlled
// handler-result message (e.g. `r.message`) is NOT flagged.
const RAW = String.raw`(String\([A-Za-z_$][\w$]*\)|\(?(err|error|e|ex|exception)( as Error)?\)?\.message)`;
// Client-facing fields that must be stripped in prod: error / detail / message.
const FIELD = String.raw`(error|detail|message)`;
const LEAK_RES_JSON = new RegExp(String.raw`\.json\(\{[^}]*${FIELD}:\s*${RAW}`);
// SSE frames go out via JSON.stringify({...}) or a sendEvent(res, {...}) helper.
const LEAK_SSE = new RegExp(String.raw`(JSON\.stringify|sendEvent)\([^{]*\{[^}]*${FIELD}:\s*${RAW}`);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : [],
  );
}

describe('no raw error leaks in route responses', () => {
  it('every route res.json / SSE response uses safeError(), not the raw error', () => {
    const offenders: string[] = [];
    for (const file of walk(ROUTES_DIR)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (LEAK_RES_JSON.test(l) || LEAK_SSE.test(l)) {
          offenders.push(`${file.replace(process.cwd(), '.')}:${i + 1}  ${l.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
