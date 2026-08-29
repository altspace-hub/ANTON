/**
 * no-shell-instructions-in-errors.test.ts — a thrown message is read by a user.
 *
 * installBundledPack used to throw:
 *
 *   Bundled pack 'uk-fca-aml' is missing its .anton file.
 *   Run: node data/knowledge-packs/build-pack.mjs uk-fca-aml
 *
 * written for whoever built the pack, and shown to whoever clicked Install.
 * Eleven packs shipped in that state, so it was not hypothetical.
 *
 * The reason it reached them is worth keeping in view: safeError() only
 * genericises when NODE_ENV=production, and ANTON's own `start` script is
 * `tsx server/index.ts` — no NODE_ENV. In the ordinary local-first install,
 * safeError is a pass-through and the thrown text IS the user-facing text.
 * That makes every throw in server/ potentially user-visible, which is the
 * assumption this rule is written under.
 *
 * Build instructions still belong in the logs. console.error, logEvent and
 * comments are deliberately not matched — only the message that is thrown.
 *
 * Not every throw has a user behind it. A boot-time configuration error is read
 * by whoever started the process and by nobody else, and telling that person
 * which command to run is the helpful thing to do. Those files are exempted by
 * name, with the reason, and a second test fails if an exemption stops being
 * needed — an exemption that outlives its cause is how a rule quietly stops
 * meaning anything.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SERVER_DIR = join(process.cwd(), 'server');

/**
 * Commands, not prose. `node` alone is a graph node in half this codebase, so
 * it only counts when followed by a script path; `Run:` only when it introduces
 * something, as it does in an instruction.
 */
const SHELL_INSTRUCTION = [
  /\bRun:\s*\S/,
  /\bnpm run\b/,
  /\bpnpm (run|install|dlx)\b/,
  /\bnpx\s+\S/,
  /\bnode\s+[\w./-]+\.(mjs|cjs|js|ts)\b/,
];

/**
 * Files whose thrown instructions are aimed at an operator, not a user.
 * Keyed by path relative to the repo root, with why.
 */
const ALLOWED = new Map<string, string>([
  ['server/db/init-database.ts',
   'throws at startup when DATABASE_URL is unset; the only reader is whoever '
   + 'is starting the server, and `pnpm run db:init` is exactly what they need'],
]);

const relative = (file: string) =>
  file.replace(process.cwd(), '').replace(/^[\\/]/, '').replace(/\\/g, '/');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : [],
  );
}

/**
 * The text of every `throw new Error(...)` in a file, with its line number.
 * Scans forward from each throw to its closing parenthesis so a message split
 * across lines is read whole — the original offender was one line, but a
 * reformat would have hidden it from a line-based check.
 */
export function thrownMessages(source: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  const marker = /throw new Error\(/g;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(source)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    out.push({
      line: source.slice(0, m.index).split('\n').length,
      text: source.slice(start, i - 1),
    });
  }
  return out;
}

export function offendersIn(source: string, label: string): string[] {
  return thrownMessages(source)
    .filter(({ text }) => SHELL_INSTRUCTION.some(re => re.test(text)))
    .map(({ line, text }) => `${label}:${line}  ${text.replace(/\s+/g, ' ').slice(0, 90)}`);
}

describe('thrown errors do not hand the user a shell command', () => {
  it('no throw new Error() in server/ contains a command to run', () => {
    const offenders: string[] = [];
    for (const file of walk(SERVER_DIR)) {
      const rel = relative(file);
      if (ALLOWED.has(rel)) continue;
      offenders.push(...offendersIn(readFileSync(file, 'utf8'), rel));
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('finds the throws it is meant to be checking', () => {
    // A scanner that reads nothing passes exactly as quietly as one that works.
    const total = walk(SERVER_DIR)
      .reduce((n, f) => n + thrownMessages(readFileSync(f, 'utf8')).length, 0);
    expect(total).toBeGreaterThan(100);
  });

  it('keeps no exemption it no longer needs', () => {
    for (const [rel, reason] of ALLOWED) {
      const source = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(
        offendersIn(source, rel).length,
        `${rel} no longer needs its exemption (${reason})`,
      ).toBeGreaterThan(0);
    }
  });

  it('catches the message this rule was written for', () => {
    const original = [
      'throw new Error(`Bundled pack \'${slug}\' is missing its .anton file.',
      ' Run: node data/knowledge-packs/build-pack.mjs ${slug}`);',
    ].join('');
    expect(offendersIn(original, 'x.ts')).toHaveLength(1);

    // and leaves the replacement alone
    const replacement =
      'throw new Error(`The "${name}" knowledge pack is incomplete in this '
      + 'installation: its data file was not included in this build.`);';
    expect(offendersIn(replacement, 'x.ts')).toHaveLength(0);
  });
});
