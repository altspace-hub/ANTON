import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Four AMLR requirement summaries that misstated Regulation (EU) 2024/1624.
 *
 * A requirement summary is what a gap assessment is graded against
 * (`server/services/gap-assessment-engine.ts` loadFramework, and the frameworks
 * route), so a wrong one gives the same wrong verdict on every assessment.
 * Gap Assessor corrected these four on 2026-09-22 (commit 1fad7ef in
 * C:\Gap-Assessor, "eight requirement summaries that misstated the
 * regulation"), each checked against the Official Journal text it holds in
 * data/sources/amlr-2024-1624.articles.json. ANTON kept the old wording until
 * 2026-10-04 (expert review finding FAM-01), so the same article was graded
 * against two different requirements in two apps of the family.
 *
 *   Art.44  stated the PEP escalation for insurance beneficiaries as
 *           unconditional. Only the PEP determination is; informing senior
 *           management and enhanced scrutiny apply "where there are higher
 *           risks identified". An insurer escalating only higher-risk cases
 *           complies and was failed.
 *   Art.48  described only the permission to rely on another obliged entity
 *           and left out Art.48(4): obliged entities shall not rely on entities
 *           established in the high-risk third countries identified under
 *           Section 2, except their own branches and subsidiaries.
 *   Art.72  stated a duty to cooperate with and respond to the FIU. The article
 *           imposes no duty: it is the good-faith liability shield for
 *           disclosure under Articles 69 and 70.
 *   Art.88  described AMLA and Commission periodic typology reports. The
 *           article binds the Commission alone to report by 10 July 2030 on
 *           four named possible amendments.
 *
 * The wording below is Gap Assessor's, character for character. Change it here
 * only together with Gap Assessor's data/frameworks/amlr-2024.json, so the two
 * apps go on grading the same text.
 */

const FILE = path.resolve(__dirname, '..', '..', 'data', 'frameworks', 'amlr-2024.json');

/** Gap Assessor 1fad7ef, data/frameworks/amlr-2024.json. */
const GAP_VERIFIED: Record<string, string> = {
  'Art.44': "UNCONDITIONAL: take reasonable measures to determine whether the beneficiary of a life or other investment-related insurance policy - or, where relevant, the beneficial owner of that beneficiary - is a PEP, no later than at payout or at assignment of the policy. CONDITIONAL, only \"where there are higher risks identified\", and in addition to the Art.20 CDD measures: (a) inform senior management before payout of policy proceeds; (b) conduct enhanced scrutiny of the entire business relationship with the policyholder. Escalation and enhanced scrutiny applied only to higher-risk cases is compliant.",
  'Art.48': "May rely on other obliged entities (in a Member State or a third country) for the CDD measures in Art.20(1)(a)-(c), provided they apply equivalent CDD and record-keeping requirements and are supervised for AML/CFT compliance. Ultimate responsibility always remains with the relying entity. PROHIBITION (Art.48(4)): obliged entities SHALL NOT rely on obliged entities established in high-risk third countries identified under Section 2 of this Chapter - except that a Union entity may rely on its OWN branches and subsidiaries in those countries where all the conditions in Art.48(3) are met.",
  'Art.72': "Liability shield, not a duty: disclosure of information to the FIU in good faith under Articles 69 and 70 does not breach any contractual, legislative, regulatory or administrative restriction on disclosure, and involves the obliged entity, its directors and its employees in no liability of any kind - even where they were not precisely aware of the underlying criminal activity and regardless of whether illegal activity actually occurred. What is assessed is whether the entity relies on this protection correctly: that staff know reporting in good faith carries no personal liability, and that internal policy does not impose disclosure restrictions the Regulation disapplies.",
  'Art.88': "Binds the COMMISSION, not obliged entities and not AMLA. By 10 July 2030 the Commission shall report to the European Parliament and the Council on the necessity and proportionality of: (a) lowering the 25% beneficial-ownership threshold; (b) extending high-value goods to high-value garments and accessories; (c) extending the Art.74 threshold-based disclosures to other goods, harmonised reporting formats, and extending the reporting obligation; (d) the cash-payment limit. Relevant to an obliged entity only as a change trigger to monitor.",
};

interface Article { id: string; requirement: string }

const articles = (JSON.parse(fs.readFileSync(FILE, 'utf-8')) as { articles: Article[] }).articles;
const requirement = (id: string): string => articles.find((a) => a.id === id)?.requirement ?? '';

describe('AMLR requirement summaries corrected against the Official Journal', () => {
  it('the file carries all four articles (so the checks below cannot pass on empty strings)', () => {
    for (const id of Object.keys(GAP_VERIFIED)) expect(requirement(id), id).not.toBe('');
  });

  it('Art.44 keeps the PEP escalation conditional on higher risks', () => {
    const r = requirement('Art.44');
    expect(r).toMatch(/UNCONDITIONAL/);
    expect(r).toMatch(/where there are higher risks identified/i);
    expect(r).toMatch(/compliant/i);
  });

  it('Art.48 carries the Art.48(4) prohibition on high-risk third countries', () => {
    const r = requirement('Art.48');
    expect(r).toMatch(/SHALL NOT rely/i);
    expect(r).toMatch(/high-risk third countries/i);
    expect(r).toMatch(/OWN branches and subsidiaries/i);
  });

  it('Art.72 is a liability shield and imposes no duty', () => {
    const r = requirement('Art.72');
    expect(r).toMatch(/liability shield, not a duty/i);
    expect(r).toMatch(/good faith/i);
    expect(r).not.toMatch(/must cooperate fully|respond promptly to FIU requests/i);
  });

  it('Art.88 binds the Commission, names its date and gives AMLA no role', () => {
    const r = requirement('Art.88');
    expect(r).toMatch(/Binds the COMMISSION/);
    expect(r).toMatch(/10 July 2030/);
    expect(r).not.toMatch(/AMLA and Commission publish/i);
  });

  it('all four read exactly as Gap Assessor verified them', () => {
    for (const [id, text] of Object.entries(GAP_VERIFIED)) expect(requirement(id), id).toBe(text);
  });
});
