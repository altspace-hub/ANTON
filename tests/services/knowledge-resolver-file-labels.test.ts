/**
 * knowledge-resolver-file-labels.test.ts — a project's files reach the model
 * under their real names.
 *
 * Wave 2 (2026-09-08): a session inside a project reads the project's files
 * as if they were attached to the turn. Those files are stored under a random
 * on-disk name, so the resolver takes a label per path; without one the
 * basename is used as before.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { resolveKnowledgeSources } from '../../server/services/knowledge-resolver.js';
import type { KnowledgeSourceConfig } from '../../src/lib/types.js';

let tmpDir: string;
let uploadPath: string;
let projectPath: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-resolver-labels-'));
  uploadPath = path.join(tmpDir, '1725000000-123-Board minutes.txt');
  projectPath = path.join(tmpDir, 'a1b2c3d4e5f6.txt');
  await fs.writeFile(uploadPath, 'Minutes of the board meeting.', 'utf8');
  await fs.writeFile(projectPath, 'Engagement letter for Baltic Bank.', 'utf8');
});

afterAll(async () => { await fs.remove(tmpDir); });

const config = () => ({ modes: {} } as unknown as KnowledgeSourceConfig);

describe('resolveKnowledgeSources — file labels', () => {
  it('labels a project file by its given name and an upload by its basename', async () => {
    const resolved = await resolveKnowledgeSources(config(), [uploadPath, projectPath], {
      fileLabels: { [projectPath]: 'Engagement letter.pdf (project: Baltic Bank)' },
    });

    expect(resolved.contextDocuments).toContain('### UPLOADED DOCUMENT: 1725000000-123-Board minutes.txt');
    expect(resolved.contextDocuments).toContain('### UPLOADED DOCUMENT: Engagement letter.pdf (project: Baltic Bank)');
    expect(resolved.contextDocuments).not.toContain('a1b2c3d4e5f6');
    expect(resolved.sourceManifest).toContain('Engagement letter.pdf (project: Baltic Bank) (uploaded)');

    const detail = resolved.sourceDetails?.find((d) => d.path === projectPath);
    expect(detail?.name).toBe('Engagement letter.pdf (project: Baltic Bank)');
    expect(detail?.contentHashed).toBe(true);
  });

  it('labels a skipped file the same way', async () => {
    const resolved = await resolveKnowledgeSources(config(), [uploadPath, projectPath], {
      contextBudget: 1, // nothing fits after the first file
      fileLabels: { [projectPath]: 'Engagement letter.pdf (project: Baltic Bank)' },
    });
    const skipped = resolved.sourceDetails?.find((d) => d.path === projectPath);
    expect(skipped?.note).toMatch(/skipped/);
    expect(skipped?.name).toBe('Engagement letter.pdf (project: Baltic Bank)');
  });
});
