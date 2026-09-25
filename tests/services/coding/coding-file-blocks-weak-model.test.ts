/**
 * coding-file-blocks-weak-model.test.ts — ANTON-side cases for the hardened
 * Studio output boundary, beyond the shared table in
 * coding-file-blocks-hardening.test.ts (the standalone Code Studio's fixtures):
 *
 *   - more path-line and elision shapes, and the negative controls that must
 *     NOT be taken for a file or a placeholder;
 *   - hostile input: the apply preview parses text the CLIENT sends, so no
 *     line may make a pattern backtrack (ANTON's three guards);
 *   - the JSON replies of the Studio planner and the core-team panel, read
 *     through their real parsers (parsePlannerReply, parsePanelVerdict), and
 *     a workshop reply (parseWorkshopUpdate) — reasoning stripped only where a
 *     chat template puts it.
 *
 * Pure: no DB, no model, no filesystem.
 */
import { describe, it, expect } from 'vitest';
import {
  parseFileBlocks,
  pathFromLine,
  findElisionPlaceholder,
  checkWholeFileWrite,
  stripReasoning,
  extractJsonReply,
} from '../../../server/services/coding-workspace.js';
import { parsePanelVerdict, CORE_TEAM_ROLES } from '../../../server/services/core-team-panel.js';
import { parsePlannerReply } from '../../../server/services/coding-studio-orchestrator.js';
import { parseWorkshopUpdate, createDefaultWorkshopState } from '../../../server/services/coding-workshop-engine.js';

const fence = '```';

// ── Fences and paths ────────────────────────────────────────────────────────

describe('parseFileBlocks — more weak-model shapes', () => {
  it('a ``` line inside a ~~~ fence is content, not a closer', () => {
    const r = parseFileBlocks('~~~md\n<!-- FILE: docs/x.md -->\nUse:\n```\nnpm test\n```\n~~~\n');
    expect(r.files[0].content).toBe('Use:\n```\nnpm test\n```\n');
  });

  it('the documented upper-case FILE: still takes a path with spaces', () => {
    const r = parseFileBlocks(`${fence}md\n<!-- FILE: docs/release notes.md -->\nhi\n${fence}`);
    expect(r.files[0]?.path).toBe('docs/release notes.md');
  });

  it.each([
    ['**src/c.ts**'],
    ['`src/c.ts`:'],
    ['### src/c.ts'],
    ['File: src/c.ts'],
    ['**File:** `src/c.ts`'],
    ['- `src/c.ts`'],
    ['src/c.ts'],
  ])('takes the path from the line above the fence: %s', (pathLine) => {
    const r = parseFileBlocks(`Here you go.\n\n${pathLine}\n${fence}ts\nexport const c = 3;\n${fence}\n`);
    expect(r.files).toEqual([{ path: 'src/c.ts', content: 'export const c = 3;\n', language: 'ts' }]);
    expect(r.pathsFromLineAbove).toEqual(['src/c.ts']);
  });

  it.each([
    ['Here is the updated helper:'],
    ['Update `src/c.ts` like this:'],
    ['**Explanation:**'],
    ['Version 1.2'],
  ])('prose above the fence names no file: %s', (line) => {
    const r = parseFileBlocks(`${line}\n${fence}ts\nexport const c = 3;\n${fence}`);
    expect(r.files).toHaveLength(0);
    expect(r.rejected).toHaveLength(0);
    expect(r.ignoredBlocks).toBe(1);
  });

  it('a path line above is validated like a header (no escaping the workspace)', () => {
    const r = parseFileBlocks(`**../outside.ts**\n${fence}ts\nx();\n${fence}`);
    expect(r.files).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
  });

  it('an unterminated fence named by the line above is reported, not applied', () => {
    const r = parseFileBlocks(`**src/half.ts**\n~~~ts\nconst x = 1;\n// cut off`);
    expect(r.files).toHaveLength(0);
    expect(r.rejected[0]).toMatchObject({ path: 'src/half.ts' });
    expect(r.rejected[0].reason).toContain('unterminated');
  });

  it('pathFromLine: files yes, prose no', () => {
    expect(pathFromLine('**src/app/[id]/page.tsx**')).toBe('src/app/[id]/page.tsx');
    expect(pathFromLine('`.env.example`')).toBe('.env.example');
    expect(pathFromLine('File: Dockerfile')).toBe('Dockerfile');
    expect(pathFromLine('#### `src/routes/+page.svelte`')).toBe('src/routes/+page.svelte');
    expect(pathFromLine('Dockerfile')).toBeNull(); // unlabelled, no folder, no extension
    expect(pathFromLine('Here is the code:')).toBeNull();
    expect(pathFromLine('https://example.com/a.js')).toBeNull();
    expect(pathFromLine('1.5')).toBeNull();
    expect(pathFromLine('')).toBeNull();
  });
});

// ── Elision ─────────────────────────────────────────────────────────────────

describe('parseFileBlocks — elision placeholders are refused', () => {
  it.each([
    ['ts', 'src/a.ts', '// ... rest of the file unchanged'],
    ['ts', 'src/a.ts', '// ... existing code ...'],
    ['ts', 'src/a.ts', '// ...'],
    ['tsx', 'src/A.tsx', '{/* ... rest of the component ... */}'],
    ['py', 'app/x.py', '# ... (rest of the file remains the same)'],
    ['css', 'styles/a.css', '/* ... */'],
    ['sql', 'db/a.sql', '-- remaining code unchanged'],
    ['html', 'public/i.html', '<!-- rest of the content unchanged -->'],
    ['ts', 'src/a.ts', '// other methods omitted for brevity'],
  ])('refuses %s placeholder: %s', (lang, file, marker) => {
    const text = [
      `${fence}${lang}\n// FILE: ${file}\nconst kept = 1;\n${marker}\nconst tail = 2;\n${fence}`,
      `${fence}ts\n// FILE: src/ok.ts\nexport const ok = true;\n${fence}`,
    ].join('\n\n');
    const r = parseFileBlocks(text);
    expect(r.files.map((f) => f.path)).toEqual(['src/ok.ts']);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].path).toBe(file);
    expect(r.rejected[0].reason).toContain('elision');
  });

  it('does not flag real comments or a README code example', () => {
    const text = [
      `${fence}ts\n// FILE: src/a.ts\n// Existing code paths call this helper.\n// The rest is handled in b.ts\nexport const a = 1;\n${fence}`,
      `${fence}md\n<!-- FILE: README.md -->\n# Usage\n\n    app.use(x);\n    // ...\n\n## Unchanged behaviour\n${fence}`,
      `${fence}py\n# FILE: app/y.py\n#!/usr/bin/env python\n#include is not python\nx = [1, 2]  # ... not a whole-line comment\n${fence}`,
    ].join('\n\n');
    const r = parseFileBlocks(text);
    expect(r.rejected).toEqual([]);
    expect(r.files.map((f) => f.path)).toEqual(['src/a.ts', 'README.md', 'app/y.py']);
  });

  // Showcase review C14: each of these was accepted, and the build loop wrote
  // the file, deleting the code the comment stood for.
  it.each([
    ['src/a.ts', '// ... rest of your code'],
    ['src/a.ts', '// ...your existing code...'],
    ['src/a.ts', '// ... unchanged methods ...'],
    ['src/A.tsx', '// ... rest of the JSX ...'],
    ['src/a.ts', '// Rest of the code stays as it was'],
    ['src/a.ts', '// ... rest of your component code'],
    ['src/a.ts', '// ... your code here'],
    ['src/a.ts', '// keep your existing code'],
    ['src/a.ts', '// (your existing methods remain unchanged)'],
    ['app/x.py', '# ... rest of your code'],
    ['app/x.py', '# ... unchanged methods ...'],
  ])('refuses the user-addressed placeholder in %s: %s', (file, marker) => {
    expect(findElisionPlaceholder(file, `const kept = 1;\n${marker}\n`)).toEqual({ line: 2, text: marker });
  });

  it.each([
    ['src/a.ts', '// Rest of the day is handled in cron.ts'],
    ['src/a.ts', '// your code here'],
    ['src/a.ts', '// Your existing session is kept'],
    ['src/a.ts', '// existing users are migrated below'],
    ['src/a.ts', '// the rest of your team reviews this file'],
    ['app/x.py', '# Rest of the day is handled in cron.py'],
  ])('NEGATIVE CONTROL: keeps the ordinary comment in %s: %s', (file, comment) => {
    expect(findElisionPlaceholder(file, `const kept = 1;\n${comment}\n`)).toBeNull();
  });

  it('findElisionPlaceholder says which line', () => {
    expect(findElisionPlaceholder('x.ts', 'a\n  // … keep existing code …\nb')).toEqual({ line: 2, text: '// … keep existing code …' });
    expect(findElisionPlaceholder('x.ts', 'a\nb\n')).toBeNull();
    // In prose files a bare "// ..." is an example; a placeholder comment still counts.
    expect(findElisionPlaceholder('README.md', '// ...')).toBeNull();
    expect(findElisionPlaceholder('README.md', '<!-- rest of the file unchanged -->')).not.toBeNull();
  });
});

describe('checkWholeFileWrite — a rewrite that keeps a sliver of the current file', () => {
  const lines = (n: number): string => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') + '\n';

  it('refuses a 40-line file rewritten as 10 lines', () => {
    expect(checkWholeFileWrite('a.ts', lines(10), lines(40))).toMatch(/shrinks from 40 to 10/);
  });

  it('accepts a moderate change, a small original, and a new file', () => {
    expect(checkWholeFileWrite('a.ts', lines(25), lines(40))).toBeNull();
    expect(checkWholeFileWrite('a.ts', lines(1), lines(12))).toBeNull();
    expect(checkWholeFileWrite('a.ts', lines(1), null)).toBeNull();
    expect(checkWholeFileWrite('a.ts', lines(1))).toBeNull();
  });

  it('counts non-blank lines only (padding cannot hide a truncation)', () => {
    const padded = lines(10) + '\n'.repeat(60);
    expect(checkWholeFileWrite('a.ts', padded, lines(40))).not.toBeNull();
  });
});

// ── Hostile input ───────────────────────────────────────────────────────────
// The apply preview parses text the client sends. Each shape below took
// seconds to minutes with the standalone's lazy patterns (measured
// 2026-09-25); ANTON reads them with linear scans and gets the same result.

describe('hostile input stays fast', () => {
  const timed = (fn: () => unknown): number => {
    const t0 = Date.now();
    fn();
    return Date.now() - t0;
  };

  it('a FILE header line padded with 100k spaces — still refused as a header, not ignored', () => {
    const text = `${fence}\n// FILE: a${' '.repeat(100_000)}b\nx\n${fence}`;
    let r = parseFileBlocks('');
    expect(timed(() => { r = parseFileBlocks(text); })).toBeLessThan(1000);
    expect(r.files).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
  });

  it('a comment line of 3,000 asterisks', () => {
    const line = `/*${'*'.repeat(3_000)}x`;
    expect(timed(() => parseFileBlocks(`${fence}css\n/* FILE: s.css */\n${line}\n${fence}`))).toBeLessThan(1000);
    expect(timed(() => findElisionPlaceholder('a.css', line))).toBeLessThan(1000);
  });

  it('a 100k-character run of quotes inside a path line and inside a FILE header', () => {
    const quotes = '"'.repeat(100_000);
    let above = parseFileBlocks('');
    expect(timed(() => { above = parseFileBlocks(`a${quotes}b.ts:\n${fence}ts\nconst a = 1;\n${fence}`); })).toBeLessThan(1000);
    expect(above.files).toHaveLength(0); // quotes inside a path: not a path line
    let header = parseFileBlocks('');
    expect(timed(() => { header = parseFileBlocks(`${fence}ts\n// FILE: a${quotes}b\nconst b = 2;\n${fence}`); })).toBeLessThan(1000);
    expect(header.rejected).toHaveLength(1); // a header, refused: path too long
  });

  // Showcase review C16: the trailing-newline trim was /\n+$/, which backtracks
  // quadratically on a newline run that does not end the block (100k: ~5 s).
  it('a 100k-line run of blank lines inside a block', () => {
    const text = `${fence}ts\n// FILE: src/a.ts\nx\n${'\n'.repeat(100_000)}y\n${fence}`;
    let r = parseFileBlocks('');
    expect(timed(() => { r = parseFileBlocks(text); })).toBeLessThan(1000);
    expect(r.files).toHaveLength(1);
    expect(r.files[0].content.startsWith('x\n\n')).toBe(true);
    expect(r.files[0].content.endsWith('\n\ny\n')).toBe(true);
  });

  it('NEGATIVE CONTROL: trailing blank lines are still trimmed to one newline, inner ones kept', () => {
    const r = parseFileBlocks(`${fence}ts\n// FILE: src/a.ts\nx\n\ny\n\n\n\n${fence}`);
    expect(r.files[0].content).toBe('x\n\ny\n');
    expect(parseFileBlocks(`${fence}ts\n// FILE: src/e.ts\n\n\n${fence}`).files[0].content).toBe('\n');
  });

  it('100k lines of unclosed <think> openers', () => {
    const text = '<think>\n'.repeat(100_000) + `${fence}ts\n// FILE: a.ts\nx\n${fence}`;
    let r = parseFileBlocks('');
    expect(timed(() => { r = parseFileBlocks(text); })).toBeLessThan(1000);
    expect(r.files).toHaveLength(0); // all of it was reasoning
  });
});

// ── JSON replies ────────────────────────────────────────────────────────────

describe('stripReasoning / extractJsonReply', () => {
  it('drops <think> blocks, a stray closer and an unclosed opener', () => {
    expect(stripReasoning('<think>draft {"a":1}</think>\nanswer')).toBe('\nanswer');
    expect(stripReasoning('plan {x}\n</think>\n{"b":2}')).toBe('\n{"b":2}');
    expect(stripReasoning('{"c":3}\n<thinking>more')).toBe('{"c":3}\n');
  });

  it('ignores a draft inside <think> and takes the answer', () => {
    expect(extractJsonReply('<think>{"tasks":["draft"]}</think>\nHere: {"tasks":["final"]}')?.value).toEqual({ tasks: ['final'] });
  });

  it('prefers the LAST fenced block that parses — a truncated trailing block does not win', () => {
    const text = `${fence}json\n{"tasks":[1]}\n${fence}\n\nOr more compactly:\n${fence}json\n{"tasks": [1,\n${fence}`;
    expect(extractJsonReply(text)?.value).toEqual({ tasks: [1] });
  });

  it('a JSON example before the answer does not win when it fails `accept`', () => {
    const text = `Example:\n${fence}json\n{"example": true}\n${fence}\nAnswer:\n${fence}json\n{"tasks": []}\n${fence}`;
    const isPlan = (v: unknown): boolean => typeof v === 'object' && v !== null && Array.isArray((v as { tasks?: unknown }).tasks);
    expect(extractJsonReply(text, isPlan)?.value).toEqual({ tasks: [] });
  });

  it('finds unfenced JSON between prose braces (balanced-brace scan, quote-aware)', () => {
    const text = 'Sure {see below}! Here it is: {"a": "has } and { inside", "b": {"c": 1}} — done {x}.';
    expect(extractJsonReply(text)?.value).toEqual({ a: 'has } and { inside', b: { c: 1 } });
  });

  it('returns null when nothing parses', () => {
    expect(extractJsonReply('no json here {oops')).toBeNull();
  });
});

// Showcase review L12: an unclosed <think> ANYWHERE cut the reply there, and a
// pair anywhere was cut out — inside JSON strings, prose and fences too. Only
// reasoning where a chat template puts it (a tag that begins a line, outside a
// fence) is reasoning.
describe('stripReasoning — a tag that is content is kept', () => {
  const plan = {
    releaseName: 'MVP',
    summary: 'A chat UI',
    tasks: [{ title: "Collapse the model's <think> block in a <Thinking> panel", files: ['src/ui.tsx'] }],
  };

  it('a plan whose task mentions <think> is read, compact or pretty-printed and fenced', () => {
    expect(parsePlannerReply(JSON.stringify(plan))).toEqual(plan);
    expect(parsePlannerReply(`${fence}json\n${JSON.stringify(plan, null, 2)}\n${fence}`)).toEqual(plan);
  });

  it('a <think>…</think> pair inside a JSON string is not cut out', () => {
    const text = '{"claims":[{"text":"the parser strips <think>...</think> regions"}]}';
    expect(stripReasoning(text)).toBe(text);
    expect(extractJsonReply(text)?.value).toEqual({ claims: [{ text: 'the parser strips <think>...</think> regions' }] });
  });

  it('a panel rationale that quotes the tag is read', () => {
    const json = panelJson().replace('"rationale":"ok"', '"rationale":"an unclosed <thinking> tag truncates the reply"');
    const r = parsePanelVerdict(json, 'build');
    expect(r?.experts).toHaveLength(7);
    expect(r?.experts[0].rationale).toBe('an unclosed <thinking> tag truncates the reply');
  });

  it('a workshop reply that mentions the tag keeps its text and its state', () => {
    const reply = "The UI should collapse the model's <think> block into a <Thinking> panel.\n"
      + '[STATE_UPDATE]:{"title":"ChatUI","summary":"Hide <think> output"}';
    const { cleanResponse, updatedState } = parseWorkshopUpdate(reply, createDefaultWorkshopState('standard', 'project'));
    expect(cleanResponse).toBe("The UI should collapse the model's <think> block into a <Thinking> panel.");
    expect(updatedState.title).toBe('ChatUI');
    expect(updatedState.summary).toBe('Hide <think> output');
  });

  it('tags inside a fenced block are the block\'s content', () => {
    const text = `Example:\n${fence}html\n<think>\n<p>x</p>\n${fence}\nDone.`;
    expect(stripReasoning(text)).toBe(text);
  });

  it('NEGATIVE CONTROL: reasoning where the template puts it is still removed', () => {
    expect(stripReasoning('<think>\ndraft {"tasks":[]}\n</think>\n{"tasks":[1]}')).toBe('\n{"tasks":[1]}');
    expect(stripReasoning('  <thinking>a</thinking><think>b</think>answer')).toBe('  answer');
    expect(stripReasoning('draft\n</think>\nanswer')).toBe('\nanswer');
    expect(stripReasoning('<think>\ncut off mid-reasoning {"tasks":[]}')).toBe('');
    const plain = { releaseName: 'MVP', summary: 's', tasks: [{ title: 'final', files: ['a.ts'] }] };
    expect(parsePlannerReply(`<think>\n${fence}json\n{"tasks":[{"title":"draft"}]}\n${fence}\n</think>\n${JSON.stringify(plain)}`)).toEqual(plain);
  });
});

function panelJson(): string {
  return JSON.stringify({
    gate: 'build',
    experts: CORE_TEAM_ROLES.map((r) => ({ role: r.label, verdict: 'endorse', concerns: [], required_change: null, rationale: 'ok' })),
    agreements: [], dissents: [], open_questions: [], synthesis: 'fine',
  });
}

describe('parsePanelVerdict — weak-model replies', () => {
  it('reads the verdict when a truncated second ```json block follows it', () => {
    const text = `${fence}json\n${panelJson()}\n${fence}\n\n${fence}json\n{"experts": [\n${fence}`;
    expect(parsePanelVerdict(text, 'build')?.experts).toHaveLength(7);
  });

  it('reads unfenced JSON with prose braces around it', () => {
    expect(parsePanelVerdict(`Panel {build gate}:\n${panelJson()}\nThat is all {end}.`, 'build')?.experts).toHaveLength(7);
  });

  it('ignores a <think> draft that dissents', () => {
    const draft = panelJson().replace(/"endorse"/g, '"dissent"');
    const r = parsePanelVerdict(`<think>${draft}</think>${panelJson()}`, 'build');
    expect(r?.experts.every((e) => e.verdict === 'endorse')).toBe(true);
  });

  it('NEGATIVE CONTROL: JSON without experts is still no verdict', () => {
    expect(parsePanelVerdict(`${fence}json\n{"gate":"build"}\n${fence}`, 'build')).toBeNull();
  });
});

describe('parsePlannerReply — weak-model replies', () => {
  const plan = { releaseName: 'MVP', summary: 's', tasks: [{ title: 'Build it', files: ['index.js'] }] };

  it('reads a plan after a code example and with prose around it', () => {
    const text = `Structure:\n${fence}js\nmodule.exports = { a: 1 };\n${fence}\nPlan:\n${fence}json\n${JSON.stringify(plan)}\n${fence}\nGood luck {team}!`;
    expect(parsePlannerReply(text)).toEqual(plan);
  });

  it('reads a plan after leaked reasoning', () => {
    expect(parsePlannerReply(`<think>maybe {"tasks": []}</think>${JSON.stringify(plan)}`)).toEqual(plan);
  });

  it('NEGATIVE CONTROL: a reply with no plan in it is null', () => {
    expect(parsePlannerReply('I would split this into three tasks: setup, build, test.')).toBeNull();
    expect(parsePlannerReply(`${fence}json\n{"releaseName": "x"}\n${fence}`)).toBeNull();
  });
});
