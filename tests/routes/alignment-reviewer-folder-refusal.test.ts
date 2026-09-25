/**
 * alignment-reviewer-folder-refusal.test.ts — a refused project folder says
 * how to allow it, and leaves no empty review behind (public showcase review,
 * 2026-09-25, finding L10).
 *
 * Alignment ingest now goes through the ALLOWED_FOLDER_PATHS guard in every
 * mode. A default install allows only ./uploads and ./outputs, so a solo user
 * entering C:\Projects\myapp got 403 "Path outside allowed directories" — and
 * the page had already created the review row, left orphaned on every try.
 *
 * Now: the 403 names ALLOWED_FOLDER_PATHS and what to do, and POST
 * /coding/alignment-reviews takes the folder (optional) and checks it before
 * the row is written.
 *
 * Negative controls: an allowed folder creates the review and ingests; a
 * create without a folder behaves as before.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const ingest = vi.hoisted(() => ({ ingestLocalProject: vi.fn(async () => ({ structure: [], totalFiles: 0 })) }));
vi.mock('../../server/services/project-ingestor.js', () => ({ ingestLocalProject: ingest.ingestLocalProject }));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: vi.fn(async () => ({ text: '{}', inputTokens: 0, outputTokens: 0 })),
  mapModelToProvider: (m: string) => m,
}));

import { createAlignmentReviewerRoutes } from '../../server/routes/alignment-reviewer.js';

/** Every statement that reached the database, so a refusal can prove none wrote. */
const dbCalls: string[] = [];
const fakeDb = {
  dialect: 'postgresql',
  async get(sql: string) {
    dbCalls.push(sql);
    if (/FROM alignment_reviews WHERE id/.test(sql)) return { id: 'rev_1', project_name: 'p' };
    return undefined;
  },
  async all(sql: string) { dbCalls.push(sql); return []; },
  async run(sql: string): Promise<RunResult> { dbCalls.push(sql); return { changes: 1, lastInsertRowid: 0 }; },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(fakeDb as unknown as DatabaseAdapter); },
  async close() { /* noop */ },
};

const saved = { mode: process.env.DEPLOYMENT_MODE, folders: process.env.ALLOWED_FOLDER_PATHS };
let server: Server;
let base = '';
let allowedDir = '';
let outsideDir = '';

beforeAll(async () => {
  // Solo, the default install: the guard applies in every mode.
  delete process.env.DEPLOYMENT_MODE;
  allowedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-align-ok-'));
  outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-align-elsewhere-'));
  process.env.ALLOWED_FOLDER_PATHS = allowedDir;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'solo', username: 'solo', role: 'admin' }; next(); });
  app.use('/api', await createAlignmentReviewerRoutes(fakeDb as unknown as DatabaseAdapter));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const [k, v] of [['DEPLOYMENT_MODE', saved.mode], ['ALLOWED_FOLDER_PATHS', saved.folders]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  fs.rmSync(allowedDir, { recursive: true, force: true });
  fs.rmSync(outsideDir, { recursive: true, force: true });
});

beforeEach(() => { dbCalls.length = 0; vi.clearAllMocks(); });

const post = (url: string, body: unknown) =>
  fetch(`${base}/api${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('a folder outside ALLOWED_FOLDER_PATHS', () => {
  it('is refused at create, before any review row is written, with what to change', async () => {
    const r = await post('/coding/alignment-reviews', { project_name: 'p', path: outsideDir });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toMatch(/ALLOWED_FOLDER_PATHS/);
    expect(dbCalls.some((s) => /INSERT INTO alignment_reviews/.test(s))).toBe(false);
  });

  it('is refused at ingest with the same explanation, and nothing is read', async () => {
    const r = await post('/coding/alignment-reviews/rev_1/ingest', { source_type: 'local-directory', path: outsideDir });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toMatch(/^Path outside allowed directories\. Add .*ALLOWED_FOLDER_PATHS/);
    expect(ingest.ingestLocalProject).not.toHaveBeenCalled();
  });
});

describe('negative controls', () => {
  it('an allowed folder creates the review and ingests', async () => {
    const created = await post('/coding/alignment-reviews', { project_name: 'p', path: allowedDir });
    expect(created.status).toBe(200);
    expect(dbCalls.some((s) => /INSERT INTO alignment_reviews/.test(s))).toBe(true);
    const ingested = await post('/coding/alignment-reviews/rev_1/ingest', { source_type: 'local-directory', path: allowedDir });
    expect(ingested.status).toBe(200);
    expect(ingest.ingestLocalProject).toHaveBeenCalledTimes(1);
  });

  it('a create without a folder behaves as before', async () => {
    const created = await post('/coding/alignment-reviews', { project_name: 'p' });
    expect(created.status).toBe(200);
    expect(dbCalls.some((s) => /INSERT INTO alignment_reviews/.test(s))).toBe(true);
  });
});
