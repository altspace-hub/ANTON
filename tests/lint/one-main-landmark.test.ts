/**
 * one-main-landmark.test.ts — a page inside MainLayout has one <main>.
 *
 * MainLayout already renders <main id="main-content"> around every route in
 * its block (src/App.tsx). A page component there that renders its own <main>
 * nests a second main landmark — screen readers announce two, and the "skip to
 * main content" link targets the outer one. Found in the 2026-09-22 Work QA
 * (TabularReview) and fixed on nine more pages on 2026-09-23; this keeps the
 * class from coming back.
 *
 * Pages routed OUTSIDE the layout (public share links, login) own their only
 * <main> and are not checked.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const SRC = join(process.cwd(), 'src');
const APP = readFileSync(join(SRC, 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');

/** Component name → source file, from `import X from './…'` and `lazy(() => import('./…'))`. */
function componentFiles(): Map<string, string> {
  const map = new Map<string, string>();
  const forms = [
    /^import\s+([A-Z]\w*)\s+from\s+'(\.\/[^']+)';/gm,
    /^const\s+([A-Z]\w*)\s*=\s*lazy\(\(\)\s*=>\s*import\('(\.\/[^']+)'\)\);/gm,
  ];
  for (const re of forms) {
    for (const m of APP.matchAll(re)) {
      const base = resolve(SRC, m[2]);
      const file = [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx')].find((f) => existsSync(f));
      if (file) map.set(m[1], file);
    }
  }
  return map;
}

/**
 * Where a `<Route …>` opening tag ends, and whether it closes itself. An
 * attribute can hold JSX — `element={<X />}` — so the tag's own `>` is the first
 * one outside braces, not the first one.
 */
function routeTagEnd(src: string, open: number): { end: number; selfClosing: boolean } {
  let depth = 0;
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return { end: i + 1, selfClosing: src[i - 1] === '/' };
  }
  throw new Error(`unterminated <Route at ${open}`);
}

/** The source text of the <Route> whose element renders <MainLayout />, children included. */
function mainLayoutBlock(src: string = APP): string {
  const start = src.indexOf('<MainLayout />');
  expect(start, 'MainLayout route not found in App.tsx').toBeGreaterThan(-1);
  const open = src.lastIndexOf('<Route', start);
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const nextOpen = src.indexOf('<Route', i);
    const nextClose = src.indexOf('</Route>', i);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      const { end, selfClosing } = routeTagEnd(src, nextOpen);
      if (!selfClosing) depth++;
      i = end;
    } else {
      depth--;
      i = nextClose + '</Route>'.length;
      if (depth === 0) return src.slice(open, i);
    }
  }
  throw new Error('MainLayout route block is not closed');
}

/** Code only: comments hold words like "<main>" without rendering them. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('one <main> landmark per page', () => {
  const files = componentFiles();
  const block = mainLayoutBlock();
  const pages = [...new Set([...block.matchAll(/element=\{<([A-Z]\w*)/g)].map((m) => m[1]))]
    .filter((name) => name !== 'MainLayout' && name !== 'ProtectedRoute' && files.has(name));

  it('finds the routed pages (so an empty scan cannot pass)', () => {
    expect(pages.length).toBeGreaterThan(150);
    for (const known of ['HardwareDiagnosePage', 'CommunityMessagesPage', 'FriendsChatPage', 'PortalVisitorPage', 'TabularReview']) {
      expect(pages, `${known} should be routed inside MainLayout`).toContain(known);
    }
    // Public pages render their own <main> legitimately — they must sit outside the block.
    for (const standalone of ['SharePage', 'SharedTabularReview', 'RegulatorSharedPackPage']) {
      expect(pages).not.toContain(standalone);
    }
  });

  it('reads a route with JSX in its element and children of its own as one nested route', () => {
    // Review 2026-09-23: a regex stopping at the first ">" read
    // `<Route element={<XLayout />}>` as self-closing, so its </Route> ended the
    // MainLayout block early and every page after it went unchecked.
    const src = [
      '<Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>',
      '  <Route path="/a" element={<A />} />',
      '  <Route path="/x" element={<XLayout />}>',
      '    <Route path="/x/1" element={<X1 />} />',
      '  </Route>',
      '  <Route path="/b" element={<B />} />',
      '</Route>',
      '<Route path="/public" element={<P />} />',
    ].join('\n');
    const block = mainLayoutBlock(src);
    expect(block).toContain('element={<B />}');
    expect(block).not.toContain('/public');
  });

  it('no page inside MainLayout renders a second <main>', () => {
    const offenders = pages
      .map((name) => files.get(name) as string)
      .filter((file) => /<main\b/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.replace(process.cwd(), '.'));
    expect(offenders).toEqual([]);
  });
});
