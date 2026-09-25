/**
 * coding-file-blocks-hardening.test.ts — ANTON's file-block parser against what
 * weaker models actually write, on the SAME table as the standalone Code
 * Studio (tests/services/coding/fixtures/weak-model-replies.ts is a verbatim
 * copy of its fixtures). Ported from its tests/file-blocks-hardening.test.ts.
 *
 * THE FINDING THIS CLOSES (2026-09-25 OpenRouter review): the parser only knew
 * the documented form. An opener like ```ts title="x", an indented fence, a
 * lower-case `// file:`, or a path written above the fence meant the block was
 * silently ignored; a README with its own fences threw fence tracking off for
 * every later block; and nothing noticed "// ... rest unchanged" in a
 * whole-file write, which deletes the code it stands for.
 */
import { describe, it, expect } from 'vitest';
import {
  checkWholeFileWrite,
  findElisionPlaceholder,
  parseFileBlocks,
} from '../../../server/services/coding-workspace.js';
import { WEAK_REPLY_FIXTURES } from './fixtures/weak-model-replies.js';

describe('weak-model replies (the standalone Code Studio\'s table)', () => {
  for (const fx of WEAK_REPLY_FIXTURES) {
    it(fx.name, () => {
      const originals = fx.originals ? new Map(Object.entries(fx.originals)) : undefined;
      const r = parseFileBlocks(fx.reply, originals ? { originals } : {});
      const written = new Map(r.files.map((f) => [f.path, f.content]));

      expect([...written.keys()].sort()).toEqual(Object.keys(fx.files).sort());
      for (const [p, needle] of Object.entries(fx.files)) {
        expect(written.get(p)).toContain(needle);
      }
      const rejected = fx.rejected ?? {};
      expect(r.rejected.map((x) => x.path).sort()).toEqual(Object.keys(rejected).sort());
      for (const [p, pattern] of Object.entries(rejected)) {
        expect(r.rejected.find((x) => x.path === p)!.reason).toMatch(pattern);
      }
      for (const text of fx.absent ?? []) {
        for (const content of written.values()) expect(content).not.toContain(text);
      }
    });
  }
});

describe('what the parser records about how it read the reply', () => {
  it('names the files whose path came from the line above the fence', () => {
    const r = parseFileBlocks(['**src/u.ts**', '```ts', 'export const u = 1;', '```'].join('\n'));
    expect(r.pathsFromLineAbove).toEqual(['src/u.ts']);
  });

  it('NEGATIVE CONTROL: a header inside the fence wins over the line above, and is not counted as from-above', () => {
    const r = parseFileBlocks(['**src/other.ts**', '```ts', '// FILE: src/real.ts', 'export const r = 1;', '```'].join('\n'));
    expect(r.files.map((f) => f.path)).toEqual(['src/real.ts']);
    expect(r.files[0].content).toBe('export const r = 1;\n');
    expect(r.pathsFromLineAbove).toEqual([]);
  });

  it('the documented form still parses exactly as before', () => {
    const r = parseFileBlocks(['```ts', '// FILE: src/a.ts', 'export const a = 1;', '```'].join('\n'));
    expect(r.files).toEqual([{ path: 'src/a.ts', content: 'export const a = 1;\n', language: 'ts' }]);
    expect(r.rejected).toEqual([]);
    expect(r.ignoredBlocks).toBe(0);
  });
});

describe('the whole-file write check on its own', () => {
  it('finds the placeholder and says where', () => {
    const hit = findElisionPlaceholder('src/a.ts', 'export const a = 1;\n\n// ...\n');
    expect(hit).toEqual({ line: 3, text: '// ...' });
  });

  it('a bare ellipsis line is a placeholder in TypeScript and code in Python', () => {
    expect(findElisionPlaceholder('src/a.ts', 'function f() {\n  ...\n}\n')).not.toBeNull();
    expect(findElisionPlaceholder('src/a.py', 'def f():\n    ...\n')).toBeNull();
  });

  it('a Markdown heading is not a comment', () => {
    expect(findElisionPlaceholder('README.md', '# Existing code\n\nSee below.\n')).toBeNull();
    expect(findElisionPlaceholder('README.md', '<!-- rest of the document unchanged -->\n')).not.toBeNull();
  });

  it('the shrink rule only applies to files big enough to judge', () => {
    const small = 'a\nb\nc\n';
    expect(checkWholeFileWrite('x.ts', 'a\n', small)).toBeNull();
    const big = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    expect(checkWholeFileWrite('x.ts', 'line 0\n', big)).toMatch(/shrinks from 50 to 1/);
    expect(checkWholeFileWrite('x.ts', big.split('\n').slice(0, 25).join('\n'), big)).toBeNull();
  });
});
