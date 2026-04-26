/**
 * coding-engine.test.ts — pure-function tests for the coding-engine
 * response parsers (parseScriptFromResponse, parseFilesFromResponse).
 *
 * These are the highest-value test targets: they parse LLM output and
 * are the boundary where regex / format changes can silently break
 * everything downstream.
 */

import { describe, it, expect } from 'vitest';
import { createCodingEngine } from '../../../server/services/coding-engine.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

const stubDb = {
  all: async () => [],
  get: async () => undefined,
  run: async () => {},
  exec: async () => {},
} as unknown as DatabaseAdapter;

describe('parseScriptFromResponse', () => {
  it('extracts a python code block', async () => {
    const eng = await createCodingEngine(stubDb);
    const r = eng.parseScriptFromResponse('Here is the script:\n```python\nprint("hi")\n```\n');
    expect(r.script).toBe('print("hi")');
  });

  it('falls back to any code block when no python tag', async () => {
    const eng = await createCodingEngine(stubDb);
    const r = eng.parseScriptFromResponse('```\nhello\n```');
    expect(r.script).toBe('hello');
  });

  it('returns empty script when no code block present', async () => {
    const eng = await createCodingEngine(stubDb);
    const r = eng.parseScriptFromResponse('just prose, no code at all.');
    expect(r.script).toBe('');
  });

  it('extracts How to Run section into explanation', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = '```python\nx=1\n```\n\n## How to Run\nRun python script.py\n\n## What It Does\nPrints 1';
    const r = eng.parseScriptFromResponse(md);
    expect(r.explanation).toContain('How to Run');
    expect(r.explanation).toContain('Run python script.py');
    expect(r.explanation).toContain('What It Does');
  });

  it('extracts dependencies from pip install line', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = '```python\nimport requests\n```\n\n## Dependencies\npip install requests httpx';
    const r = eng.parseScriptFromResponse(md);
    expect(r.dependencies).toContain('requests');
    expect(r.dependencies).toContain('httpx');
  });

  it('extracts dependencies from bullet list', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = '```python\n# code\n```\n\n## Dependencies\n- `numpy`\n- `pandas`\n- scikit-learn';
    const r = eng.parseScriptFromResponse(md);
    expect(r.dependencies).toContain('numpy');
    expect(r.dependencies).toContain('pandas');
    expect(r.dependencies).toContain('scikit-learn');
  });

  it('returns empty dependencies when "no third-party" mentioned', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = '```python\n# code\n```\n\n## Dependencies\nNo third-party packages required';
    const r = eng.parseScriptFromResponse(md);
    expect(r.dependencies).toEqual([]);
  });

  it('returns empty dependencies when "standard library only"', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = '```python\n# code\n```\n\n## Dependencies\nStandard library only';
    const r = eng.parseScriptFromResponse(md);
    expect(r.dependencies).toEqual([]);
  });
});

describe('parseFilesFromResponse', () => {
  it('extracts a single file from path-tagged code block', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = '```src/App.tsx\nexport default function App() {}\n```';
    const files = eng.parseFilesFromResponse(md);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/App.tsx');
    expect(files[0].language).toBe('typescript');
    expect(files[0].content).toBe('export default function App() {}');
  });

  it('extracts multiple files', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = `
\`\`\`src/App.tsx
const a = 1;
\`\`\`

\`\`\`package.json
{ "name": "x" }
\`\`\`
`;
    const files = eng.parseFilesFromResponse(md);
    expect(files).toHaveLength(2);
    expect(files.map(f => f.path)).toEqual(['src/App.tsx', 'package.json']);
  });

  it('skips pure-language code blocks (no path)', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = '```python\nprint(1)\n```';
    const files = eng.parseFilesFromResponse(md);
    expect(files).toHaveLength(0);
  });

  it('treats hyphenated extensions as files (e.g. dockerfile.yml)', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = '```docker-compose.yml\nversion: "3"\n```';
    const files = eng.parseFilesFromResponse(md);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('docker-compose.yml');
  });

  it('infers language from extension', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = `
\`\`\`script.py
x = 1
\`\`\`

\`\`\`style.css
body {}
\`\`\`

\`\`\`config.json
{}
\`\`\`
`;
    const files = eng.parseFilesFromResponse(md);
    expect(files.find(f => f.path === 'script.py')?.language).toBe('python');
    expect(files.find(f => f.path === 'style.css')?.language).toBe('css');
    expect(files.find(f => f.path === 'config.json')?.language).toBe('json');
  });

  it('normalises Windows-style backslashes in paths', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = '```src\\components\\Button.tsx\nexport const Button = () => {};\n```';
    const files = eng.parseFilesFromResponse(md);
    expect(files[0].path).toBe('src/components/Button.tsx');
  });

  it('returns empty array on prose-only input', async () => {
    const eng = await createCodingEngine(stubDb);
    expect(eng.parseFilesFromResponse('just prose without any code blocks')).toEqual([]);
  });

  it('handles mixed: file-blocks + pure-language blocks', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = `
Here is some inline example:

\`\`\`bash
ls -la
\`\`\`

And the actual file:

\`\`\`scripts/build.sh
#!/usr/bin/env bash
echo "build"
\`\`\`
`;
    const files = eng.parseFilesFromResponse(md);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('scripts/build.sh');
  });
});

describe('inferLanguage (via parseFilesFromResponse coverage)', () => {
  it('handles common JS/TS variants', async () => {
    const eng = await createCodingEngine(stubDb);
    const variants = ['a.ts', 'b.tsx', 'c.js', 'd.jsx', 'e.mjs', 'f.cjs'];
    for (const v of variants) {
      const md = `\`\`\`${v}\n//\n\`\`\``;
      const files = eng.parseFilesFromResponse(md);
      expect(['typescript', 'javascript']).toContain(files[0].language);
    }
  });

  it('falls back to extension itself when not in map', async () => {
    const eng = await createCodingEngine(stubDb);
    const md = '```weird.zzz\ndata\n```';
    const files = eng.parseFilesFromResponse(md);
    expect(files[0].language).toBe('zzz');
  });
});
