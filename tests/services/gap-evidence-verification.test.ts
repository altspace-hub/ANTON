/**
 * gap-evidence-verification.test.ts — adversarial-review fixes #3 + #5
 * (Gap Assessor evidence integrity, 2026-06):
 *
 *  #3b Content-derived docIds: `doc-<8-hex sha256(text)>` generated in ONE
 *      place (extractEvidenceItems) so a Step-3 re-save can never reassign an
 *      old id to a DIFFERENT document. Explicit docIds (bundle imports /
 *      legacy fixtures) are honoured verbatim.
 *
 *  #5  Quote verification + truncation honesty: validateEvidenceRefs verifies
 *      each quote against the document text the model actually SAW; fabricated
 *      quotes and citations of truncated-out documents are downgraded with a
 *      flag (kept, never hard-failed). Plain-Set callers keep the original
 *      membership-only behaviour.
 *
 * Pure functions — no DB, no LLM.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  extractEvidenceItems,
  buildEvidencePromptContext,
} from '../../server/services/gap-assessment-engine.js';
import {
  validateEvidenceRefs,
  quoteAppearsIn,
  type EvidenceRefIndex,
} from '../../server/services/gap-scoring.js';

const sha8 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 8);

describe('extractEvidenceItems — content-derived docIds (#3)', () => {
  const policyText = 'Our policy mandates KYC at onboarding and a risk-based CDD refresh.';
  const auditText = 'The 2026 internal audit confirmed the screening control operates.';
  const interviewText = 'MLRO: TM rules were last tuned in 2024.';

  it('derives ids from the text content (doc-<sha8> / int-<sha8>)', () => {
    const items = extractEvidenceItems({
      evidenceItems: [
        { name: 'AML Policy', kind: 'document', text: policyText },
        { name: 'MLRO interview', kind: 'interview', text: interviewText },
      ],
    });
    expect(items.map(i => i.docId)).toEqual([`doc-${sha8(policyText)}`, `int-${sha8(interviewText)}`]);
  });

  it('a re-save that removes/adds documents never reassigns a surviving doc a different id', () => {
    // Old positional scheme: removing the first doc renumbered the survivor
    // doc-2 → doc-1, silently re-pointing stored evidenceRefs at a different
    // document. Content-derived ids are stable regardless of position.
    const before = extractEvidenceItems({
      evidenceItems: [
        { name: 'AML Policy', kind: 'document', text: policyText },
        { name: 'Audit report', kind: 'document', text: auditText },
      ],
    });
    const after = extractEvidenceItems({
      evidenceItems: [
        { name: 'Audit report', kind: 'document', text: auditText }, // now first
        { name: 'Brand new doc', kind: 'document', text: 'Completely different content.' },
      ],
    });
    const auditBefore = before.find(i => i.name === 'Audit report')!;
    const auditAfter = after.find(i => i.name === 'Audit report')!;
    expect(auditAfter.docId).toBe(auditBefore.docId);          // survivor keeps its id
    // No id from the old save is reused by a DIFFERENT document in the new save
    const policyIdBefore = before.find(i => i.name === 'AML Policy')!.docId;
    expect(after.some(i => i.docId === policyIdBefore)).toBe(false);
  });

  it('honours an explicit docId on the entry (bundle imports / legacy fixtures)', () => {
    const items = extractEvidenceItems({
      evidenceItems: [{ docId: 'doc-1', name: 'Imported', kind: 'document', text: policyText }],
    });
    expect(items[0].docId).toBe('doc-1');
  });

  it('duplicate texts get a deterministic uniqueness suffix', () => {
    const items = extractEvidenceItems({
      evidenceItems: [
        { name: 'Copy A', kind: 'document', text: policyText },
        { name: 'Copy B', kind: 'document', text: policyText },
      ],
    });
    expect(items[0].docId).toBe(`doc-${sha8(policyText)}`);
    expect(items[1].docId).toBe(`doc-${sha8(policyText)}-2`);
  });

  it('still skips empty-text entries and tolerates garbage', () => {
    const items = extractEvidenceItems({
      evidenceItems: [{ name: 'Empty', kind: 'document', text: '   ' }, null, 42, 'nope'],
    });
    expect(items).toEqual([]);
    expect(extractEvidenceItems({})).toEqual([]);
  });
});

describe('buildEvidencePromptContext — truncation awareness (#5b)', () => {
  it('returns full texts as shown when everything fits', () => {
    const items = extractEvidenceItems({
      evidenceItems: [
        { name: 'Doc A', kind: 'document', text: 'alpha content' },
        { name: 'Doc B', kind: 'document', text: 'beta content' },
      ],
    });
    const ctx = buildEvidencePromptContext({}, items);
    expect(ctx.text).toContain(`[${items[0].docId}]: Doc A`);
    expect(ctx.text).toContain('beta content');
    expect(ctx.shownTextByDocId.get(items[0].docId)).toBe('alpha content');
    expect(ctx.shownTextByDocId.get(items[1].docId)).toBe('beta content');
  });

  it('a document truncated out of the 120k cap has empty shown text', () => {
    const bigText = 'x'.repeat(125_000);
    const items = extractEvidenceItems({
      evidenceItems: [
        { name: 'Huge doc', kind: 'document', text: bigText },
        { name: 'Unseen doc', kind: 'document', text: 'the model never saw this needle' },
      ],
    });
    const ctx = buildEvidencePromptContext({}, items);
    expect(ctx.text.length).toBe(120_000);
    // Huge doc is partially shown; the second doc never reached the prompt.
    const shownHuge = ctx.shownTextByDocId.get(items[0].docId)!;
    expect(shownHuge.length).toBeGreaterThan(0);
    expect(shownHuge.length).toBeLessThan(bigText.length);
    expect(ctx.shownTextByDocId.get(items[1].docId)).toBe('');
    expect(ctx.text).not.toContain('needle');
  });

  it('legacy concatenated documents string falls back with an empty shown map', () => {
    const ctx = buildEvidencePromptContext({ documents: 'legacy blob' }, []);
    expect(ctx.text).toBe('legacy blob');
    expect(ctx.shownTextByDocId.size).toBe(0);
  });
});

describe('validateEvidenceRefs — quote verification + truncation flags (#5)', () => {
  const docText = 'The CDD refresh cycle is 3 years for all customers — no risk-based differentiation.';
  const docId = `doc-${sha8(docText)}`;
  const index: EvidenceRefIndex = {
    known: new Set([docId, 'doc-truncated']),
    shownTextByDocId: new Map([
      [docId, docText],
      ['doc-truncated', ''], // in the manifest, but never shown to the model
    ]),
  };

  it('verbatim quote passes without flags', () => {
    const r = validateEvidenceRefs([{ docId, quote: 'CDD refresh cycle is 3 years' }], index);
    expect(r.refs).toEqual([{ docId, quote: 'CDD refresh cycle is 3 years' }]);
    expect(r.warnings).toEqual([]);
  });

  it('whitespace/case/typographic differences still match (normalized check)', () => {
    const r = validateEvidenceRefs([{ docId, quote: 'cdd   refresh\ncycle IS 3 years' }], index);
    expect(r.refs[0].check).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it('elided quotes ("start … end") match when all segments appear', () => {
    const r = validateEvidenceRefs([{ docId, quote: 'CDD refresh cycle ... no risk-based differentiation' }], index);
    expect(r.refs[0].check).toBeUndefined();
  });

  it('fabricated quote is KEPT but downgraded with quote_not_found (never hard-fails)', () => {
    const r = validateEvidenceRefs([{ docId, quote: 'screening runs in real time across all rails' }], index);
    expect(r.refs).toHaveLength(1);
    expect(r.refs[0].check).toBe('quote_not_found');
    expect(r.warnings).toEqual([`quote_not_found:${docId}`]);
  });

  it('citation of a truncated-out document gets the DISTINCT doc_not_shown flag', () => {
    const r = validateEvidenceRefs([{ docId: 'doc-truncated', quote: 'anything' }], index);
    expect(r.refs).toHaveLength(1);
    expect(r.refs[0].check).toBe('doc_not_shown');
    expect(r.warnings).toEqual(['doc_not_shown:doc-truncated']);
  });

  it('unknown docIds are still dropped with the existing warning', () => {
    const r = validateEvidenceRefs([{ docId: 'doc-99', quote: 'hallucinated' }], index);
    expect(r.refs).toEqual([]);
    expect(r.warnings).toEqual(['unknown_doc_ref:doc-99']);
  });

  it('plain ReadonlySet input keeps the original membership-only behaviour (back-compat)', () => {
    const r = validateEvidenceRefs(
      [{ docId, quote: 'totally fabricated quote' }],
      new Set([docId]),
    );
    expect(r.refs).toEqual([{ docId, quote: 'totally fabricated quote' }]);
    expect(r.warnings).toEqual([]);
  });
});

describe('quoteAppearsIn', () => {
  it('normalizes curly quotes and dashes', () => {
    expect(quoteAppearsIn('“risk-based” – yes', 'the "risk-based" - yes approach')).toBe(true);
  });
  it('rejects empty / non-matching quotes', () => {
    expect(quoteAppearsIn('', 'some doc')).toBe(false);
    expect(quoteAppearsIn('absent', 'some doc')).toBe(false);
  });
});
