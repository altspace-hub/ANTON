/**
 * demo-export-no-copy.test.ts — an export on the public demo leaves no copy on
 * the server (privacy review M6 / D21).
 *
 * Every export was streamed back and also written to OUTPUT_DIR. No route
 * serves that copy, it has no owner, and retention deleted it by age rather
 * than with the account, so it could outlive the account by one more account
 * lifetime. In demo mode:
 *   - POST /export (every format) and /export/trust-certificate send the file
 *     and write no copy;
 *   - POST /export/with-template, whose injector must write a file, deletes it
 *     once it has been sent, and when the injection fails part-way.
 *
 * Negative control: outside demo mode each route still keeps its copy.
 *
 * The document generators and the template injector are replaced by stubs:
 * the question is only what is left in OUTPUT_DIR.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const injector = vi.hoisted(() => ({ fail: false }));

vi.mock('../../server/services/export-docx.js', () => ({ generateDocx: async () => Buffer.from('DOCX') }));
vi.mock('../../server/services/export-xlsx.js', () => ({ generateXlsx: async () => Buffer.from('XLSX') }));
vi.mock('../../server/services/export-pdf.js', () => ({ generatePdf: async () => Buffer.from('%PDF-stub') }));
vi.mock('../../server/services/export-pptx.js', () => ({ generatePptx: async () => Buffer.from('PPTX') }));
vi.mock('../../server/services/template-injector.js', () => {
  const inject = async (_template: string, content: string, outputPath: string): Promise<void> => {
    await (await import('node:fs/promises')).writeFile(outputPath, `TEMPLATED:${content}`);
    if (injector.fail) throw new Error('injection failed part-way');
  };
  return { injectIntoDocxTemplate: inject, injectIntoPptxTemplate: inject };
});

const FORMATS = ['md', 'docx', 'xlsx', 'pdf', 'pptx', 'fountain', 'fdx'] as const;
const SESSION = 'sess-export-demo-0001';

describe('exports on the public demo leave no copy on the server', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-demo-export-'));
  const outputDir = path.join(sandbox, 'outputs');
  const templateFile = path.join(sandbox, 'brand.docx');
  const saved = { output: process.env.OUTPUT_DIR, demo: process.env.DEMO_MODE, mode: process.env.DEPLOYMENT_MODE };
  let app: Server;
  let base = '';

  // Only what the three routes read: the template row, the session row of a
  // certificate. Everything else is absent.
  const db = {
    get: async (sql: string) => {
      if (/FROM brand_templates/.test(sql)) return { ok: 1, id: 'tpl-1', name: 'Brand', type: 'docx', file_path: templateFile };
      if (/FROM sessions WHERE id = \? AND user_id = \?/.test(sql)) {
        return { id: SESSION, module_id: 'gap-analysis', title: 'Export test', config: '{}', created_at: '2026-09-26T08:00:00.000Z' };
      }
      return undefined;
    },
    all: async () => [],
    run: async () => ({ changes: 0 }),
    exec: async () => undefined,
  };

  beforeAll(async () => {
    fs.writeFileSync(templateFile, 'template');
    // export.ts reads OUTPUT_DIR when it is loaded.
    process.env.OUTPUT_DIR = outputDir;
    process.env.DEPLOYMENT_MODE = 'team';
    const { createExportRouter } = await import('../../server/routes/export.js');
    const e = express();
    e.use(express.json());
    e.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { id: string; username: string; role: string } }).user = { id: 'visitor-1', username: 'visitor', role: 'analyst' };
      next();
    });
    e.use('/api', await createExportRouter(db as never));
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    injector.fail = false;
    if (saved.demo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = saved.demo;
    for (const f of fs.readdirSync(outputDir)) fs.rmSync(path.join(outputDir, f), { force: true });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    for (const [k, v] of [['OUTPUT_DIR', saved.output], ['DEPLOYMENT_MODE', saved.mode]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  const post = (route: string, body: unknown) => fetch(`${base}/api${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const leftOnServer = () => fs.readdirSync(outputDir).sort();

  it.each(FORMATS)('demo: a %s export is sent and no copy is written', async (format) => {
    process.env.DEMO_MODE = 'true';
    const res = await post('/export', { format, content: '# Findings\n\nText.', metadata: { filename: `demo-${format}` } });
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(leftOnServer()).toEqual([]);
  });

  it('demo: a trust certificate is sent and no copy is written', async () => {
    process.env.DEMO_MODE = 'true';
    const res = await post('/export/trust-certificate', { sessionId: SESSION });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('%PDF-stub');
    expect(leftOnServer()).toEqual([]);
  });

  it.each(['docx', 'pptx'] as const)('demo: a %s template export is sent, then its file is deleted', async (format) => {
    process.env.DEMO_MODE = 'true';
    const res = await post('/export/with-template', { templateId: 'tpl-1', content: 'Body text', format });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('TEMPLATED:Body text');
    expect(leftOnServer()).toEqual([]);
  });

  it('demo: a template export that fails part-way leaves no file either', async () => {
    process.env.DEMO_MODE = 'true';
    injector.fail = true;
    const res = await post('/export/with-template', { templateId: 'tpl-1', content: 'Body text', format: 'docx' });
    expect(res.status).toBe(500);
    expect(leftOnServer()).toEqual([]);
  });

  // ── Negative controls: outside demo mode the copies are kept as before ──

  it('outside demo mode every format still keeps its copy', async () => {
    delete process.env.DEMO_MODE;
    for (const format of FORMATS) {
      const res = await post('/export', { format, content: '# Findings\n\nText.', metadata: { filename: `kept-${format}` } });
      expect(res.status, format).toBe(200);
      await res.arrayBuffer();
    }
    expect(leftOnServer()).toEqual(FORMATS.map((f) => `kept-${f}.${f}`).sort());
    expect(fs.readFileSync(path.join(outputDir, 'kept-md.md'), 'utf-8')).toContain('# Findings');
  });

  it('outside demo mode the certificate and the template export keep their copies', async () => {
    delete process.env.DEMO_MODE;
    expect((await post('/export/trust-certificate', { sessionId: SESSION })).status).toBe(200);
    expect((await post('/export/with-template', { templateId: 'tpl-1', content: 'Body text', format: 'docx' })).status).toBe(200);
    const left = leftOnServer();
    expect(left).toHaveLength(2);
    expect(left.some((f) => f.startsWith('trust-certificate-') && f.endsWith('.pdf'))).toBe(true);
    expect(left.some((f) => f.startsWith('template-export-') && f.endsWith('.docx'))).toBe(true);
  });
});
