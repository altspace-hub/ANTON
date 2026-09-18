import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  AS_OF_LINE,
  MIN_BARE_YEAR,
  asOfFooterIsLastLine,
  classifyYears,
  hasAsOfFooter,
} from '../../server/lib/as-of-footer.js';

/**
 * Guard over the module prompts (server/areas/<area>/modules/<id>/system-prompt.md).
 *
 * The area contexts are guarded by an explicit list of areas (see
 * area-context-as-of.test.ts). That works for 59 files. It does not work for 560, and
 * more to the point it would be dishonest: a footer is a claim that someone checked the
 * file that month, and stamping 560 unreviewed prompts manufactures exactly the false
 * freshness this regime exists to remove.
 *
 * So the module prompts are guarded on a different principle — TWO LISTS:
 *
 *   1. GUARD BY PRESENCE. Any prompt that carries the canonical footer is claiming it was
 *      reviewed, so the year rule applies to it and the footer must be the final line.
 *      This costs nothing today and makes the convention self-enforcing from the first
 *      file that adopts it: you cannot stamp a file and leave a stale bare year in it.
 *
 *   2. THE STAMPED SET IS A LEDGER. `STAMPED` below is not derived at runtime — it is
 *      written down, so adding a footer to a prompt nobody reviewed fails the build, and
 *      so does quietly dropping one. Its derivation is recorded above the list.
 *
 * Prompts that assert dates but were never reviewed carry NO footer and are listed in
 * not_to_github/WAVE4B_MODULE_PROMPT_FRESHNESS_2026-09-18.md as the backlog. An absent
 * footer means "nobody has checked this", which is true, rather than a date that isn't.
 */

// ── The ledger ───────────────────────────────────────────────────────────────
//
// Derivation, 18 September 2026 — reproducible three ways:
//
//   reviewed      = `git diff --name-only HEAD -- 'server/areas/**/system-prompt.md'`
//                   The module-catalogue fix programme (Waves 1D, 2 and 3) commits
//                   nothing, so its output is exactly the uncommitted working tree.
//                   60 files. The 10 prompts changed in commits since the merge-base
//                   belong to a DIFFERENT programme (the SDK-completeness waves, which
//                   added explainability wording, not date corrections) and are not
//                   counted as a date review; the 7 of those also present in the working
//                   tree are counted, because this programme did touch them.
//   date-bearing  = asserts a full calendar date or a post-2023 bare year outside an
//                   instrument number. 109 of 560 prompts.
//   reviewed ∩ date-bearing = 43. Of those, 35 had a line containing a year edited;
//                   the other 8 were opened for a citation or guardrail correction.
//   minus         = tax-transfer-pricing/tax-incentive-navigator, which still carries two
//                   undated bare commencement years ("significantly from 2023" at line
//                   115, "from 2022 (Section 174)" at line 120). It was reviewed, but a
//                   line nobody dated is a line nobody checked, so it stays unstamped and
//                   goes on the backlog rather than being papered over — or, worse,
//                   reworded into a parenthetical purely to get past the guard.
//
//   => 42 stamped.
//
// 18 September 2026, Wave 5 track B — plus 2. The two Cyber Resilience Act modules
// (`cyber/cra-vulnerability-reporting-runbook`, `cyber/cra-conformity-assessment`) are
// net-new prompts written against the Act's own text, pulled from the Publications
// Office cellar (CELEX 32024R2847) and checked article by article: the Art. 14 clocks
// and their anchors, the Art. 71(2) split application dates, the Art. 69(3) reach-back,
// the Annex III/IV category lists, the Art. 32 routes and the Annex numbering. A footer
// is a claim that someone checked the file this month, and for these two that claim is
// the whole point of the module, so they are stamped on the day they are written.
//
//   => 44 stamped.
//
// 18 September 2026, Wave 5 track A — plus 2, on the same principle as track B.
// `marketing/green-claims-review` and `consumer-legal/right-to-repair-claim` are net-new
// prompts whose entire reason to exist is a date: Directive (EU) 2024/825 is applied from
// 27 September 2026, and Directive (EU) 2024/1799 has a transposition-and-application
// date of 31 July 2026 that most Member States missed. Every date, article number and
// Annex item in both was read out of the official text pulled from the Publications
// Office cellar (CELEX 32024L0825, 32024L1799 and 32019L0771 for the amended sale-of-goods
// articles) — the Art. 4(1) and Art. 22(1) transposition clocks, the Art. 21 transitional
// cut-off, the Art. 22a implementing-act deadline, the twelve new Annex I points and the
// ten Annex II product categories. Neither prompt states a transposition COUNT or a
// national commencement date: those move weekly, the guard cannot check them, and the
// prompts instruct the model to establish them per market instead of asserting them.
//
//   => 46 stamped.
//
// 18 September 2026, Wave 5 track C — plus 2, on the same principle again.
// `data-privacy/ropa-builder` and `tax-transfer-pricing/pillar-two-globe-compliance` are
// net-new prompts, and both are built on text pulled from the Publications Office cellar
// and read item by item: CELEX 32016R0679 for the Article 30(1) and 30(2) content lists,
// the "second subparagraph of Article 49(1)" qualifier on the safeguards item, the three
// disjunctive limbs of the Article 30(5) derogation and the Article 83(4)(a) fine tier;
// CELEX 32022L2523 for the Art. 2(1) threshold, the Art. 3(15) rate, the Art. 11 domestic
// top-up tax, the Art. 26-30 computation chain, the Art. 44(7)/51 filing clocks, the
// Art. 45 election terms, the Art. 48 transitional carve-out table and the Art. 56
// transposition dates.
//
// What they deliberately DO NOT assert is the reason they can be stamped honestly: the
// commencement date and conditions of the Inclusive Framework side-by-side relief, the
// current end of the transitional CbCR safe-harbour period, and any revised Article 30(5)
// threshold. None of those sits in an instrument this programme could pull, all three
// move, and both prompts instruct the model to confirm the current position and name the
// document it relied on rather than repeat a date from a file.
//
//   => 48 stamped.
const STAMPED: readonly string[] = [
  'accounting/pillar-two-minimum-tax-assessment',
  'audit/audit-planning',
  'audit/model-risk-audit-framework',
  'audit/workpaper-reviewer',
  'banking/correspondent-banking-risk',
  'banking/regulatory-capital',
  'blockchain/casp-authorization',
  'blockchain/casp-mica-dora-amlr-programme',
  'blockchain/crypto-aml-cft',
  'blockchain/mica-gap-analysis',
  'consumer-legal/right-to-repair-claim',
  'cyber/cra-conformity-assessment',
  'cyber/cra-vulnerability-reporting-runbook',
  'data-privacy/ai-act-profiling-bias-assessment',
  'data-privacy/ropa-builder',
  'esg/csrd-data-collector',
  'esg/csrd-reporting',
  'esg/supply-chain-esg-screener',
  'fcp/ai-governance-in-financial-crime',
  'fcp/data-management',
  'fcp/fcp-scope-assessor',
  'fcp/gap-analysis',
  'fcp/regulatory-monitor',
  'fcp/risk-assessment',
  'fcp/tech-selection-support',
  'government-services/social-protection-navigator',
  'government/digital-service-design',
  'healthcare/healthcare-gdpr',
  'healthcare/medical-device-compliance',
  'humanitarian/donor-reporting',
  'insurance/solvency-ii',
  'insurance/takaful-regulatory',
  'investment/csrd-data-impact-assessment',
  'investment/fund-compliance',
  'legal/regulatory-deadline-tracker',
  'marketing/email-marketing-automation',
  'marketing/green-claims-review',
  'marketing/seo-content-strategy',
  'marketing/social-media-strategy',
  'mobile-money/agent-banking-oversight',
  'project-mgmt/agile-regulatory-delivery-pattern',
  'project-mgmt/regulatory-programme-risk-taxonomy',
  'real-estate/valuation-support',
  'risk/ai-model-risk-assessment',
  'startups/regulatory-risk-startup-assessment',
  'strategy/digital-transformation-business-case',
  'tax-transfer-pricing/pillar-two-globe-compliance',
  'tax-transfer-pricing/tax-provision-reporting',
];

const repoRoot = path.resolve(__dirname, '..', '..');
const areasRoot = path.join(repoRoot, 'server', 'areas');

interface Prompt {
  key: string;
  file: string;
  text: string;
}

function readAllPrompts(): Prompt[] {
  const out: Prompt[] = [];
  for (const area of fs.readdirSync(areasRoot).sort()) {
    const modulesDir = path.join(areasRoot, area, 'modules');
    if (!fs.existsSync(modulesDir) || !fs.statSync(modulesDir).isDirectory()) continue;
    for (const moduleId of fs.readdirSync(modulesDir).sort()) {
      const file = path.join(modulesDir, moduleId, 'system-prompt.md');
      if (!fs.existsSync(file)) continue;
      out.push({ key: `${area}/${moduleId}`, file, text: fs.readFileSync(file, 'utf-8') });
    }
  }
  return out;
}

// Read the corpus once — 560 files, and every describe block wants the same view of it.
const PROMPTS = readAllPrompts();
const STAMPED_SET = new Set(STAMPED);

describe('module prompts: the stamped set is exactly the reviewed set', () => {
  it('finds the module prompt corpus at all (so the guard cannot pass vacuously)', () => {
    expect(PROMPTS.length).toBeGreaterThan(500);
  });

  it('every ledger entry names a module prompt that exists', () => {
    const missing = STAMPED.filter((key) => !PROMPTS.some((p) => p.key === key));
    expect(missing).toEqual([]);
  });

  it('the ledger has no duplicates', () => {
    expect(STAMPED.length).toBe(STAMPED_SET.size);
  });

  it('every prompt carrying a footer is on the ledger, and every ledger entry carries one', () => {
    const onDisk = PROMPTS.filter((p) => hasAsOfFooter(p.text)).map((p) => p.key);
    // Compare as sorted arrays rather than as a joined string: a joined-text assertion
    // passes for the wrong reason as soon as one name is a prefix of another.
    expect([...onDisk].sort()).toEqual([...STAMPED].sort());
  });
});

describe('module prompts: a footer is a claim, and the claim is checked', () => {
  for (const key of STAMPED) {
    const prompt = PROMPTS.find((p) => p.key === key);

    it(`${key}: the footer is the final line`, () => {
      expect(prompt, `${key} not found on disk`).toBeDefined();
      const text = prompt?.text ?? '';
      expect(text).toMatch(AS_OF_LINE);
      expect(
        asOfFooterIsLastLine(text),
        'the As-of line must be the final line; a note naming the sources checked goes on its own line ABOVE it',
      ).toBe(true);
    });

    it(`${key}: every year is >= ${MIN_BARE_YEAR} or part of an instrument name/number/date`, () => {
      const text = prompt?.text ?? '';
      const stale = classifyYears(text)
        .filter((h) => !h.allowed)
        .map((h) => `line ${h.line}: …${h.context}…`);
      expect(stale).toEqual([]);
    });
  }
});

describe('module prompts: an unstamped prompt is out of scope, not exempt', () => {
  it('the majority of the corpus is unstamped, and the guard does not touch it', () => {
    const unstamped = PROMPTS.filter((p) => !STAMPED_SET.has(p.key));
    expect(unstamped.length).toBeGreaterThan(400);
    // Proof that "ignored" is real and not an accident of the corpus being clean: some
    // unstamped prompts DO carry years this rule would reject. They are the backlog.
    const wouldFail = unstamped.filter((p) => classifyYears(p.text).some((h) => !h.allowed));
    expect(wouldFail.length).toBeGreaterThan(0);
    // …and none of them carries a footer, which is what keeps them out of scope.
    expect(wouldFail.filter((p) => hasAsOfFooter(p.text)).map((p) => p.key)).toEqual([]);
  });
});
