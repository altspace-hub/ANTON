/**
 * gap-agentic-batch.test.ts — a Gap Assessor batch on the subscription engine
 * reads evidence on demand instead of a 120,000-character paste.
 *
 * Wave 3 (2026-09-08). The one real run on this instance uploaded 247k
 * characters of evidence and lost half without a word. On the agentic
 * engine the batch gets a manifest with an excerpt of each item and reads
 * the rest through read_evidence / search_evidence, so nothing is cut and a
 * quote from deep inside a document is verified against the full text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgenticRunConfig, AgenticEvent, AgentToolDefinition } from '../../server/services/sdk-agentic-runner.js';

const runAgenticMock = vi.fn();
vi.mock('../../server/services/sdk-agentic-runner.js', () => ({
  runAgentic: (config: AgenticRunConfig, onEvent: (e: AgenticEvent) => void) => runAgenticMock(config, onEvent),
  mcpToolName: (n: string) => `mcp__anton__${n}`,
}));
vi.mock('../../server/services/provider-router.js', () => ({
  mapModelToProvider: () => 'sdk:claude-opus-5',
  callChat: vi.fn(async () => { throw new Error('callChat must not be used on the agentic path'); }),
}));
vi.mock('../../server/services/framework-text-retrieval.js', () => ({
  retrieveGroundingText: async (opts: { query: string }) => ({ text: `GROUNDED: ${opts.query}` }),
}));

import { runAssessmentBatch, extractEvidenceItems } from '../../server/services/gap-assessment-engine.js';

// A 200k-character policy with a distinctive sentence far beyond the old cap.
const FAR_SENTENCE = 'The CDD refresh cycle is fixed at three years for every customer regardless of risk rating.';
const filler = 'Section text about onboarding controls and record keeping. ';
const POLICY = filler.repeat(Math.ceil(150_000 / filler.length)) + FAR_SENTENCE + ' ' + filler.repeat(800);
const contextConfig = {
  entityType: 'Credit institution', jurisdiction: 'Sweden / EU', segments: 'Retail', maturity: 3, concerns: '',
  evidenceItems: [
    { name: 'AML Policy v7.pdf', kind: 'document', text: POLICY },
    { name: 'MLRO interview', kind: 'interview', text: 'MLRO: TM rules were last tuned in 2024.' },
  ],
};
const items = extractEvidenceItems(contextConfig);
const policyId = items[0].docId;
const interviewId = items[1].docId;

const ARTICLES = [
  { id: 'Art.20', title: 'Customer due diligence', theme: 'Customer Due Diligence', requirement: 'Apply CDD measures.' },
  { id: 'Art.26', title: 'Ongoing monitoring', theme: 'Customer Due Diligence', requirement: 'Keep customer information up to date.' },
];

beforeEach(() => { runAgenticMock.mockReset(); });

describe('runAssessmentBatch — agentic evidence', () => {
  it('sends a manifest with excerpts, not the paste, and lets the model read the rest through tools', async () => {
    let readPage = '';
    let searchHits = '';
    let knowledge = '';
    runAgenticMock.mockImplementation(async (config: AgenticRunConfig) => {
      const tool = (name: string) => config.tools.find((t: AgentToolDefinition) => t.name === name)!;
      readPage = await tool('read_evidence').handler({ doc_id: policyId, offset: 150_000 });
      searchHits = await tool('search_evidence').handler({ term: 'three years' });
      knowledge = await tool('search_knowledge').handler({ query: 'AMLR Article 26' });
      return {
        ok: true, thinking: 'reasoning…', transcript: [], toolCalls: [], turns: 3,
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
        text: JSON.stringify([
          {
            articleId: 'Art.26', articleTitle: 'Ongoing monitoring', requirement: 'Keep customer information up to date.',
            currentState: 'Refresh is not risk-based.',
            criteria: { documented: 'yes', implemented: 'partial', tested: 'no', evidenced: 'yes', ownerAssigned: 'unknown' },
            evidenceRefs: [{ docId: policyId, quote: 'fixed at three years for every customer regardless of risk rating' }],
            notes: 'Cycle is not risk-based.',
          },
          {
            articleId: 'Art.20', articleTitle: 'Customer due diligence', requirement: 'Apply CDD measures.',
            currentState: 'Onboarding controls documented.',
            criteria: { documented: 'yes', implemented: 'yes', tested: 'unknown', evidenced: 'yes', ownerAssigned: 'unknown' },
            evidenceRefs: [{ docId: interviewId, quote: 'TM rules were last tuned in 2024' }],
            notes: '',
          },
        ]),
      };
    });

    const events: string[] = [];
    const result = await runAssessmentBatch(null, 'amlr-2024', ARTICLES, contextConfig, 0, 1, undefined, 'sdk:claude-opus-5', undefined, {
      agentic: { packIds: ['amlr-2024'], onEvent: (e) => events.push(e.message) },
    });

    // The engine was asked with a manifest, an excerpt each, and the reading instruction.
    expect(runAgenticMock).toHaveBeenCalledTimes(1);
    const config = runAgenticMock.mock.calls[0][0] as AgenticRunConfig;
    expect(config.model).toBe('sdk:claude-opus-5');
    expect(config.tools.map((t) => t.name)).toEqual(['read_evidence', 'search_evidence', 'search_knowledge']);
    expect(config.system).toContain(`[${policyId}]: AML Policy v7.pdf — ${POLICY.length.toLocaleString('en-GB')} characters`);
    expect(config.system).toContain('call read_evidence');
    expect(config.system).not.toContain(FAR_SENTENCE);
    expect(config.system.length).toBeLessThan(20_000);

    // The tools reach the text the paste used to cut.
    expect(readPage).toContain(FAR_SENTENCE);
    expect(readPage).toMatch(/characters 150,000–180,000/);
    expect(searchHits).toContain(`[${policyId}] AML Policy v7.pdf @`);
    expect(knowledge).toBe('GROUNDED: AMLR Article 26');

    // A quote from beyond the old cap is verified against the full text and kept.
    const art26 = result.findings.find((f) => f.articleId === 'Art.26')!;
    expect(art26.evidenceRefs).toHaveLength(1);
    expect(art26.evidenceRefs![0].docId).toBe(policyId);
    const art20 = result.findings.find((f) => f.articleId === 'Art.20')!;
    expect(art20.evidenceRefs).toHaveLength(1);
    expect(result.thinking).toBe('reasoning…');
  });

  it('reports a run that failed as a batch error, and pages a read past the end cleanly', async () => {
    runAgenticMock.mockImplementation(async (config: AgenticRunConfig) => {
      const read = config.tools.find((t) => t.name === 'read_evidence')!;
      const missing = await read.handler({ doc_id: 'doc-nope' });
      expect(missing).toMatch(/No evidence item with id "doc-nope"/);
      return { ok: false, error: 'SDK engine run failed (error_during_execution)', text: '', thinking: '', transcript: [], toolCalls: [], turns: 0, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } };
    });
    await expect(runAssessmentBatch(null, 'amlr-2024', ARTICLES, contextConfig, 0, 1, undefined, 'sdk:claude-opus-5', undefined, { agentic: {} }))
      .rejects.toThrow(/error_during_execution/);
  });

  it('keeps the paste path when no evidence is attached', async () => {
    const { callChat } = await import('../../server/services/provider-router.js');
    (callChat as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({ text: '[]', thinking: '', inputTokens: 1, outputTokens: 1 }));
    const result = await runAssessmentBatch(null, 'amlr-2024', ARTICLES, { entityType: 'Bank' }, 0, 1, undefined, 'sdk:claude-opus-5', undefined, { agentic: {} });
    expect(runAgenticMock).not.toHaveBeenCalled();
    expect(result.findings).toEqual([]);
  });
});
