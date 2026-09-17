/**
 * knowledge-resolver-budget-fairness.test.ts — Wave 2 (2026-09-16): budget
 * fairness and visibility of skipped sources.
 *
 * Before: sources were packed in request order (URLs → folders → uploads), the
 * document that CROSSED the budget was included whole (the route then rejected
 * the whole run as CONTEXT_TOO_LARGE), and only a skipped upload reached the UI
 * — a skipped URL or folder file was visible only in the run artifact.
 *
 * Now: the user's own material goes first (uploads → project documents → URLs
 * → folder files → RAG chunks); every source is packed whole or skipped whole;
 * every budget skip is a sourceDetails row with the same note prefix and its
 * measured size; and the result carries skippedCount / skippedTokens.
 *
 * fetchUrl and the BM25 retriever are mocked (no network, no DB). Uploads and
 * the local folder are real .txt files in a temp dir, which extractTextFromFile
 * reads verbatim — so token expectations are exact.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { DatabaseAdapter } from '../../server/db/database.js';
import type { KnowledgeSourceConfig } from '../../src/lib/types.js';

// vi.mock is hoisted above the imports, so everything a factory reads must be
// hoisted with it.
const fixtures = vi.hoisted(() => ({
  URL: 'https://example.invalid/eba-guidelines',
  URL_TITLE: 'EBA ML/TF risk factor guidelines',
  URL_TEXT: 'Online reference: the EBA guidelines on ML/TF risk factors, section 4, on customer risk. '.repeat(3),
  CHUNK_SMALL: 'Retrieved passage: customer due diligence is refreshed on a risk-sensitive basis.',
  CHUNK_BIG: 'Retrieved passage: the enhanced due diligence file lists every high-risk third country and the measures applied to each. '.repeat(6),
}));

vi.mock('../../server/services/url-fetcher.js', () => ({
  fetchUrl: vi.fn(async (url: string) => ({
    url,
    text: fixtures.URL_TEXT,
    title: fixtures.URL_TITLE,
    wordCount: 999,
    // Deliberately wrong (the fetcher's words×1.3 heuristic). If the resolver
    // budgets with THIS number instead of its own tokenizer, the exact
    // tokenEstimate assertions below fail.
    tokenEstimate: 1,
  })),
}));

vi.mock('../../server/services/rag/retriever.js', () => ({
  retrieveChunks: vi.fn(async () => [
    { id: 'c1', documentName: 'cdd-manual.pdf', folderPath: '/indexed', chunkIndex: 0, text: fixtures.CHUNK_SMALL, score: 0.9, tokenCount: 1 },
    { id: 'c2', documentName: 'edd-file.pdf', folderPath: '/indexed', chunkIndex: 3, text: fixtures.CHUNK_BIG, score: 0.8, tokenCount: 1 },
  ]),
}));

import { resolveKnowledgeSources, BUDGET_SKIP_NOTE } from '../../server/services/knowledge-resolver.js';
import { estimateTokens } from '../../server/services/token-estimator.js';

const UPLOAD_A = 'Upload A: minutes of the 3 September board meeting on the AMLR readiness programme.';
const UPLOAD_B_BIG = 'Upload B: ' + 'the business-wide risk assessment covers every product, channel, customer type and geography in scope. '.repeat(10);
const PROJECT_DOC = 'Project document: engagement letter for Baltic Bank, countersigned on 1 September.';
const FOLDER_TEXT = 'Local folder document: internal AML policy v3, approved by the board in June. '.repeat(3);

const tA = estimateTokens(UPLOAD_A);
const tB = estimateTokens(UPLOAD_B_BIG);
const tP = estimateTokens(PROJECT_DOC);
const tUrl = estimateTokens(fixtures.URL_TEXT);
const tFolder = estimateTokens(FOLDER_TEXT);
const tChunkSmall = estimateTokens(fixtures.CHUNK_SMALL);
const tChunkBig = estimateTokens(fixtures.CHUNK_BIG);

let tmpDir: string;
let uploadA: string;
let uploadB: string;
let projectDoc: string;
let folderDir: string;
let folderFile: string;
const savedAllowed = process.env.ALLOWED_FOLDER_PATHS;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-resolver-fairness-'));
  uploadA = path.join(tmpDir, 'board-minutes.txt');
  uploadB = path.join(tmpDir, 'bwra-full.txt');
  projectDoc = path.join(tmpDir, 'a1b2c3d4e5f6.txt'); // project files carry a random on-disk name
  folderDir = path.join(tmpDir, 'policies');
  folderFile = path.join(folderDir, 'aml-policy.txt');
  await fs.writeFile(uploadA, UPLOAD_A, 'utf8');
  await fs.writeFile(uploadB, UPLOAD_B_BIG, 'utf8');
  await fs.writeFile(projectDoc, PROJECT_DOC, 'utf8');
  await fs.ensureDir(folderDir);
  await fs.writeFile(folderFile, FOLDER_TEXT, 'utf8');
  // localFolder mode enforces ALLOWED_FOLDER_PATHS; whitelist the fixture like
  // a real operator would. Do not weaken the guard to make this pass.
  process.env.ALLOWED_FOLDER_PATHS = folderDir;
});

afterAll(async () => {
  if (savedAllowed === undefined) delete process.env.ALLOWED_FOLDER_PATHS;
  else process.env.ALLOWED_FOLDER_PATHS = savedAllowed;
  await fs.remove(tmpDir);
});

/** URL + local folder enabled; uploads are passed separately. */
function config(): KnowledgeSourceConfig {
  return {
    modes: {
      claudeKnowledge: { enabled: false, webSearchEnabled: false, description: '' },
      onlineReference: { enabled: true, urls: [fixtures.URL], fetchDepth: 'full' },
      localFolder: { enabled: true, folderPaths: [folderDir], recursive: false },
      combinedMode: { enabled: false, priority: 'merged' },
    },
  };
}

const PROJECT_LABEL = 'Engagement letter.pdf (project: Baltic Bank)';
const stubDb = {} as unknown as DatabaseAdapter; // retrieveChunks is mocked; nothing touches it
const bm25 = { ragMode: { enabled: true, folderPaths: ['/indexed'], useSemanticSearch: false, topK: 10, minScore: 0.1 }, db: stubDb, userQuery: 'customer due diligence' };

describe('resolveKnowledgeSources — budget fairness (Wave 2)', () => {
  it('(a) packs the user\'s own material first: uploads → project documents → URLs → folder files → RAG', async () => {
    const resolved = await resolveKnowledgeSources(config(), [uploadA, projectDoc], {
      contextBudget: 100_000,
      fileLabels: { [projectDoc]: PROJECT_LABEL },
      ...bm25,
    });

    const doc = resolved.contextDocuments;
    const at = (marker: string) => {
      const i = doc.indexOf(marker);
      expect(i, `missing "${marker}"`).toBeGreaterThanOrEqual(0);
      return i;
    };
    const iUpload = at('### UPLOADED DOCUMENT: board-minutes.txt');
    const iProject = at(`### UPLOADED DOCUMENT: ${PROJECT_LABEL}`);
    const iUrl = at(`### ONLINE REFERENCE: ${fixtures.URL}`);
    const iFolder = at('### LOCAL DOCUMENT: aml-policy.txt');
    const iRag = at('## RETRIEVED RELEVANT PASSAGES');
    expect(iUpload).toBeLessThan(iProject);
    expect(iProject).toBeLessThan(iUrl);
    expect(iUrl).toBeLessThan(iFolder);
    expect(iFolder).toBeLessThan(iRag); // RAG used to be unshifted to the FRONT

    // sourceDetails follow the same order — the artifact reads like the prompt.
    expect(resolved.sourceDetails!.map((d) => d.type)).toEqual([
      'uploaded_file', 'uploaded_file', 'url', 'local_file', 'bm25_chunk', 'bm25_chunk',
    ]);

    // Nothing skipped, and the estimate is the resolver's OWN tokenizer over
    // every source — not the fetcher's bogus tokenEstimate (1), not the
    // index's stored token_count (1).
    expect(resolved.skippedCount).toBe(0);
    expect(resolved.skippedTokens).toBe(0);
    expect(resolved.tokenEstimate).toBe(tA + tP + tUrl + tFolder + tChunkSmall + tChunkBig);
  });

  it('(b) skips the document that would cross the budget — and still packs the next one that fits', async () => {
    // A fits; B would cross by exactly one token; the project document
    // (smaller than B) still fits. B alone WOULD fit an empty budget — this is
    // the "crossing" case, not the "too large on its own" case below.
    const budget = tA + tB - 1;
    expect(tB).toBeLessThanOrEqual(budget);
    expect(tA + tP).toBeLessThanOrEqual(budget);

    const resolved = await resolveKnowledgeSources({ modes: {} } as unknown as KnowledgeSourceConfig, [uploadA, uploadB, projectDoc], {
      contextBudget: budget,
      fileLabels: { [projectDoc]: PROJECT_LABEL },
    });

    expect(resolved.contextDocuments).toContain(UPLOAD_A);
    expect(resolved.contextDocuments).toContain(PROJECT_DOC);
    expect(resolved.contextDocuments).not.toContain(UPLOAD_B_BIG); // the crossing document is NOT included whole
    expect(resolved.contextDocuments).toContain('### UPLOADED FILE (SKIPPED — context budget): bwra-full.txt');

    // Never over budget by the resolver's own decision.
    expect(resolved.tokenEstimate).toBe(tA + tP);
    expect(resolved.tokenEstimate).toBeLessThanOrEqual(budget);

    const b = resolved.sourceDetails!.find((d) => d.path === uploadB);
    expect(b).toMatchObject({ type: 'uploaded_file', name: 'bwra-full.txt', note: BUDGET_SKIP_NOTE, contentHashed: false, charCount: UPLOAD_B_BIG.length });
    expect(b!.sha256).toBeUndefined();
    expect(resolved.sourceManifest).toEqual(['board-minutes.txt (uploaded)', `${PROJECT_LABEL} (uploaded)`]);

    expect(resolved.skippedCount).toBe(1);
    expect(resolved.skippedTokens).toBe(tB);
  });

  it('(c) a skipped URL and a skipped folder file carry the same sourceDetails shape and note as a skipped upload', async () => {
    // The two uploads fill the budget to within one token of the smaller
    // reference; the URL and the folder file each cross, though either would
    // fit an empty budget on its own.
    const budget = tA + tB + Math.min(tUrl, tFolder) - 1;
    expect(Math.max(tUrl, tFolder)).toBeLessThanOrEqual(budget);

    const resolved = await resolveKnowledgeSources(config(), [uploadA, uploadB], { contextBudget: budget });

    const url = resolved.sourceDetails!.find((d) => d.type === 'url');
    expect(url).toMatchObject({
      type: 'url',
      name: fixtures.URL_TITLE,
      url: fixtures.URL,
      note: BUDGET_SKIP_NOTE,
      contentHashed: false,
      charCount: fixtures.URL_TEXT.length,
    });
    expect(url!.sha256).toBeUndefined();

    const file = resolved.sourceDetails!.find((d) => d.type === 'local_file');
    expect(file).toMatchObject({
      type: 'local_file',
      name: 'aml-policy.txt',
      path: folderFile,
      note: BUDGET_SKIP_NOTE,
      contentHashed: false,
      charCount: FOLDER_TEXT.length,
    });

    // The prompt says so too, and neither text got in.
    expect(resolved.contextDocuments).toContain(`### ONLINE REFERENCE (SKIPPED — context budget): ${fixtures.URL}`);
    expect(resolved.contextDocuments).toContain('### LOCAL DOCUMENT (SKIPPED — context budget): aml-policy.txt');
    expect(resolved.contextDocuments).not.toContain(fixtures.URL_TEXT);
    expect(resolved.contextDocuments).not.toContain(FOLDER_TEXT);
    expect(resolved.contextDocuments).toContain(UPLOAD_A);
    expect(resolved.contextDocuments).toContain(UPLOAD_B_BIG);

    // One rule finds every skip: the note prefix.
    const skips = resolved.sourceDetails!.filter((d) => d.note?.startsWith('skipped — context budget'));
    expect(skips.map((d) => d.type)).toEqual(['url', 'local_file']);

    // (d) the counts are right.
    expect(resolved.skippedCount).toBe(2);
    expect(resolved.skippedTokens).toBe(tUrl + tFolder);
    expect(resolved.tokenEstimate).toBe(tA + tB);
    expect(resolved.tokenEstimate).toBeLessThanOrEqual(budget);
  });

  it('a document that alone exceeds the whole budget is skipped with a note that says so, and the next one is packed', async () => {
    const budget = tA + 1;
    expect(tB).toBeGreaterThan(budget);

    const resolved = await resolveKnowledgeSources({ modes: {} } as unknown as KnowledgeSourceConfig, [uploadB, uploadA], { contextBudget: budget });

    const b = resolved.sourceDetails!.find((d) => d.path === uploadB);
    expect(b!.note).toMatch(/^skipped — context budget: this document alone \(~[\d,]+ tokens\) exceeds the whole budget \(~[\d,]+ tokens\)$/);
    expect(b!.contentHashed).toBe(false);
    expect(resolved.contextDocuments).not.toContain(UPLOAD_B_BIG);
    expect(resolved.contextDocuments).toContain(UPLOAD_A);
    expect(resolved.tokenEstimate).toBe(tA);
    expect(resolved.skippedCount).toBe(1);
    expect(resolved.skippedTokens).toBe(tB);
  });

  it('applies whole-or-skip to RAG chunks too (skip is recorded, the run stays under budget)', async () => {
    // Both uploads + the small chunk fit; the big chunk would cross (though it
    // would fit an empty budget on its own).
    const budget = tA + tB + tChunkSmall + 1;
    expect(tChunkBig).toBeGreaterThan(1);
    expect(tChunkBig).toBeLessThanOrEqual(budget);

    const resolved = await resolveKnowledgeSources({ modes: {} } as unknown as KnowledgeSourceConfig, [uploadA, uploadB], { contextBudget: budget, ...bm25 });

    expect(resolved.contextDocuments).toContain(fixtures.CHUNK_SMALL);
    expect(resolved.contextDocuments).not.toContain(fixtures.CHUNK_BIG);
    const big = resolved.sourceDetails!.find((d) => d.name === 'edd-file.pdf#4');
    expect(big).toMatchObject({ type: 'bm25_chunk', note: BUDGET_SKIP_NOTE, contentHashed: false, charCount: fixtures.CHUNK_BIG.length });
    expect(resolved.sourceManifest).toContain('1 BM25 passages from 1 indexed folder(s)'); // the manifest counts what was packed
    expect(resolved.tokenEstimate).toBe(tA + tB + tChunkSmall);
    expect(resolved.tokenEstimate).toBeLessThanOrEqual(budget);
    expect(resolved.skippedCount).toBe(1);
    expect(resolved.skippedTokens).toBe(tChunkBig);
  });

  it('negative control: with a budget that fits everything, nothing carries a skip note', async () => {
    const resolved = await resolveKnowledgeSources(config(), [uploadA, uploadB, projectDoc], { contextBudget: 100_000, ...bm25 });
    expect(resolved.sourceDetails!.some((d) => d.note)).toBe(false);
    expect(resolved.contextDocuments).toContain(UPLOAD_B_BIG);
    expect(resolved.skippedCount).toBe(0);
  });
});
