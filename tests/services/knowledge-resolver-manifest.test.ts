/**
 * knowledge-resolver-manifest.test.ts — Wave 1 item 1.6 (Core Experience
 * Review 2026-06): the knowledge resolver must pin every source whose content
 * it actually had in hand with a per-source sha256 + char count (sourceDetails),
 * while sources whose content never passes through the resolver (Claude
 * built-in knowledge, the native web_search tool) are listed with
 * contentHashed=false.
 *
 * Uses real temp files for the uploaded/local-file paths (extractTextFromFile
 * reads .txt verbatim, so the expected hash is exact). No network, no DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { resolveKnowledgeSources } from '../../server/services/knowledge-resolver.js';
import type { KnowledgeSourceConfig } from '../../src/lib/types.js';

const sha = (t: string) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

const FILE_CONTENT = 'AMLR Article 16 requires a business-wide risk assessment.\nLine two.';

let tmpDir: string;
let tmpFile: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-resolver-test-'));
  tmpFile = path.join(tmpDir, 'amlr-note.txt');
  await fs.writeFile(tmpFile, FILE_CONTENT, 'utf8');
});

afterAll(async () => {
  await fs.remove(tmpDir);
});

function emptyConfig(): KnowledgeSourceConfig {
  return { modes: {} } as unknown as KnowledgeSourceConfig;
}

describe('resolveKnowledgeSources — sourceDetails content hashing (1.6)', () => {
  it('hashes uploaded file content with sha256 + charCount + retrievedAt', async () => {
    const resolved = await resolveKnowledgeSources(emptyConfig(), [tmpFile]);

    expect(resolved.sourceManifest).toContain('amlr-note.txt (uploaded)');
    const detail = resolved.sourceDetails?.find((d) => d.type === 'uploaded_file');
    expect(detail).toBeTruthy();
    expect(detail!.name).toBe('amlr-note.txt');
    expect(detail!.path).toBe(tmpFile);
    expect(detail!.contentHashed).toBe(true);
    expect(detail!.sha256).toBe(sha(FILE_CONTENT));
    expect(detail!.charCount).toBe(FILE_CONTENT.length);
    expect(Number.isNaN(Date.parse(detail!.retrievedAt!))).toBe(false);
  });

  it('hashes local-folder document content', async () => {
    // localFolder mode now enforces ALLOWED_FOLDER_PATHS (server/lib/folder-guard.ts)
    // — an unlisted folder is refused unread, which is the point of that guard.
    // This case is about hashing, not authorisation, so whitelist the fixture
    // dir for the duration. Do NOT "fix" a future failure here by weakening the
    // guard; whitelist the path instead, exactly as a real operator would.
    const savedAllowed = process.env.ALLOWED_FOLDER_PATHS;
    process.env.ALLOWED_FOLDER_PATHS = tmpDir;
    try {
      const config = {
        modes: {
          localFolder: { enabled: true, folderPaths: [tmpDir], recursive: false },
        },
      } as unknown as KnowledgeSourceConfig;

      const resolved = await resolveKnowledgeSources(config, []);
      const detail = resolved.sourceDetails?.find((d) => d.type === 'local_file');
      expect(detail).toBeTruthy();
      expect(detail!.sha256).toBe(sha(FILE_CONTENT));
      expect(detail!.contentHashed).toBe(true);
    } finally {
      if (savedAllowed === undefined) delete process.env.ALLOWED_FOLDER_PATHS;
      else process.env.ALLOWED_FOLDER_PATHS = savedAllowed;
    }
  });

  it('lists Claude built-in knowledge + web_search tool as not hashable (honest limitation)', async () => {
    const config = {
      modes: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'AMLR' },
      },
    } as unknown as KnowledgeSourceConfig;

    const resolved = await resolveKnowledgeSources(config, []);
    const builtin = resolved.sourceDetails?.find((d) => d.type === 'builtin');
    const webTool = resolved.sourceDetails?.find((d) => d.type === 'web_search_tool');
    expect(builtin).toBeTruthy();
    expect(builtin!.contentHashed).toBe(false);
    expect(builtin!.sha256).toBeUndefined();
    expect(webTool).toBeTruthy();
    expect(webTool!.contentHashed).toBe(false);
  });

  it('returns an empty sourceDetails array (not undefined) when nothing resolves', async () => {
    const resolved = await resolveKnowledgeSources(emptyConfig(), []);
    expect(resolved.sourceDetails).toEqual([]);
  });
});
