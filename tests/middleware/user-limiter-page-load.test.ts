/**
 * user-limiter-page-load.test.ts — the per-user /api limiter must not refuse
 * ordinary navigation.
 *
 * Found in the 2026-09-22 Work QA: one module page load makes ~48 API calls,
 * the home page ~30, Settings ~60, against a limit of 100 per minute — so a
 * person opening a module, going home and opening another was refused by the
 * fifth page. Refused boots then crashed pages and, through the default-model
 * sync, sent module runs to the API key.
 *
 *   - three module page loads' worth of calls inside a minute all pass;
 *   - the limit stays a limit: over API_RATE_LIMIT_PER_MIN, 429 with the
 *     documented message.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

let server: Server | undefined;
const saved = process.env.API_RATE_LIMIT_PER_MIN;

beforeEach(() => { vi.resetModules(); });
afterEach(async () => {
  if (saved === undefined) delete process.env.API_RATE_LIMIT_PER_MIN; else process.env.API_RATE_LIMIT_PER_MIN = saved;
  await new Promise<void>((resolve) => { if (server) server.close(() => resolve()); else resolve(); });
  server = undefined;
});

async function start(): Promise<string> {
  const { userLimiter } = await import('../../server/middleware/rate-limit.js');
  const app = express();
  app.use((req, _res, next) => { (req as unknown as { user: { id: string } }).user = { id: 'solo' }; next(); });
  app.use('/api', userLimiter);
  app.get('/api/ping', (_req, res) => { res.json({ ok: true }); });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server!.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  return `http://127.0.0.1:${addr.port}/api/ping`;
}

async function burst(url: string, n: number): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < n; i += 25) {
    const batch = await Promise.all(Array.from({ length: Math.min(25, n - i) }, () => fetch(url).then((r) => r.status)));
    statuses.push(...batch);
  }
  return statuses;
}

describe('userLimiter', () => {
  it('three module page loads inside a minute (150 calls) are all answered', async () => {
    delete process.env.API_RATE_LIMIT_PER_MIN;
    const url = await start();
    const statuses = await burst(url, 150);
    expect(statuses.filter((s) => s === 429)).toHaveLength(0);
  });

  it('is still a limit: past API_RATE_LIMIT_PER_MIN the caller gets 429', async () => {
    process.env.API_RATE_LIMIT_PER_MIN = '20';
    const url = await start();
    const statuses = await burst(url, 25);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
  });
});
