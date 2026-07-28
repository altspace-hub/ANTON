/**
 * school-oversight-removed.test.ts — the Teacher Oversight feature stays gone.
 *
 * It presented itself as the School pillar's safeguarding dashboard: a flag inbox where a
 * teacher could see concerns raised about pupils. It never worked. Two of the tables it
 * queried — `class_members` and `oversight_flags` — exist in neither the schema nor any
 * migration (verified against a live database), and nothing anywhere in the codebase ever
 * WROTE a flag, so even with the tables the inbox would have been empty for ever.
 *
 * The flags query was wrapped in `catch { return [] }` and the page had no error state, so
 * a teacher saw "no flags" — which is indistinguishable from "no safety incidents". A
 * safety dashboard that can only ever look clean is worse than no dashboard: it
 * manufactures false assurance about children.
 *
 * This test exists because a plausible-looking safeguarding page is exactly the kind of
 * thing someone reinstates in good faith. If it comes back, it must come back with flag
 * generation and authorization — not as UI over tables that do not exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SCHOOL_ROUTES = readFileSync(join(process.cwd(), 'server/routes/school.ts'), 'utf8');
const APP = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
const LAYOUT = readFileSync(join(process.cwd(), 'src/components/school/SchoolLayout.tsx'), 'utf8');

describe('the School oversight endpoints are gone', () => {
  it('serves no /school/oversight route', () => {
    expect(SCHOOL_ROUTES).not.toMatch(/['"]\/school\/oversight/);
  });

  it('queries neither of the tables that never existed', () => {
    // Comments are stripped first, deliberately. The removal note NAMES both tables —
    // that is the whole point of it — so a test that forbade the strings outright would
    // force the explanation to be vague. What must not come back is a QUERY.
    const code = SCHOOL_ROUTES.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/\boversight_flags\b/);
    expect(code).not.toMatch(/\bclass_members\b/);
  });

  it('records WHY it was removed, not just that it was', () => {
    // A bare deletion invites a well-meaning re-add. The note has to carry the reason.
    const note = SCHOOL_ROUTES.slice(SCHOOL_ROUTES.indexOf('Teacher Oversight was REMOVED'));
    expect(note.slice(0, 2000)).toMatch(/do not exist|never/i);
  });
});

describe('the page and its entry points are gone', () => {
  it('has no page component', () => {
    expect(existsSync(join(process.cwd(), 'src/pages/school/TeacherOversightPage.tsx'))).toBe(false);
  });

  it('has no router entry or lazy import', () => {
    expect(APP).not.toContain('TeacherOversightPage');
    expect(APP).not.toContain('/school/teacher/oversight');
  });

  it('has no sidebar link', () => {
    // A nav item pointing at a removed route renders a dead link, which reads as a
    // broken product rather than a deliberate removal.
    expect(LAYOUT).not.toContain('/school/teacher/oversight');
    expect(LAYOUT).not.toContain("id: 'oversight'");
  });
});

describe('the unrelated EU AI Act oversight feature is untouched', () => {
  /**
   * `/api/oversight/*` (HumanOversightGate, EU AI Act Art. 14 professional sign-off) is a
   * DIFFERENT feature that shares the word. Removing the school one by grepping for
   * "oversight" would have taken it with it — which is why this assertion is here.
   */
  it('still has the HumanOversightGate component', () => {
    expect(existsSync(join(process.cwd(), 'src/components/shared/HumanOversightGate.tsx'))).toBe(true);
  });

  it('still calls the /api/oversight review endpoints', () => {
    const gate = readFileSync(join(process.cwd(), 'src/components/shared/HumanOversightGate.tsx'), 'utf8');
    expect(gate).toContain('/api/oversight/reviews');
  });
});
