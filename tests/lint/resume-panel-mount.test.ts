/**
 * resume-panel-mount.test.ts — the session conclusion has a reader (Wave 4b).
 *
 * The panel that shows a session's conclusion was mounted in ModulePage only
 * when the session had NO messages (`sessionId && messages.length === 0`), so
 * the conclusion — written after every answer — was never on screen, and
 * PromptPage had no panel at all. This static guard pins the two mount lines:
 * both pages mount <ResumePanel sessionId={sessionId} /> on the sessionId
 * alone, next to the InjectedAtomsPanel mount, with no message-count gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PAGES = ['src/pages/ModulePage.tsx', 'src/pages/PromptPage.tsx'] as const;
const MOUNT = /<ResumePanel\s+sessionId=\{sessionId\}\s*\/>/;
const ATOMS_MOUNT = /<InjectedAtomsPanel\s+sessionId=\{sessionId\}\s*\/>/;

function source(page: string): string {
  return readFileSync(join(process.cwd(), page), 'utf8');
}

function lineOf(src: string, re: RegExp): number {
  const m = re.exec(src);
  if (!m || m.index === undefined) return -1;
  return src.slice(0, m.index).split('\n').length;
}

describe.each(PAGES)('%s mounts the session conclusion panel', (page) => {
  const src = source(page);

  it('imports ResumePanel from the shared components', () => {
    expect(src).toMatch(/import \{ ResumePanel \} from '@\/components\/shared\/ResumePanel';/);
  });

  it('mounts <ResumePanel sessionId={sessionId} /> exactly once', () => {
    expect(src.match(new RegExp(MOUNT.source, 'g'))?.length ?? 0).toBe(1);
  });

  it('mounts it beside the InjectedAtomsPanel, not in a "no messages yet" block', () => {
    const atomsLine = lineOf(src, ATOMS_MOUNT);
    const resumeLine = lineOf(src, MOUNT);
    expect(atomsLine).toBeGreaterThan(0);
    expect(resumeLine).toBeGreaterThan(atomsLine);
    expect(resumeLine - atomsLine).toBeLessThanOrEqual(4);
  });

  it('is not gated on the message count anywhere near the mount', () => {
    const lines = src.split('\n');
    const resumeLine = lineOf(src, MOUNT);
    const window = lines.slice(Math.max(0, resumeLine - 6), resumeLine).join('\n');
    expect(window).not.toMatch(/messages\.length\s*===\s*0/);
    expect(window).not.toMatch(/sessionId\s*&&\s*messages/);
    // The old ModulePage block, in full, must be gone.
    expect(src).not.toMatch(/sessionId && messages\.length === 0 && !isStreaming && \([\s\S]{0,200}<ResumePanel/);
  });
});
