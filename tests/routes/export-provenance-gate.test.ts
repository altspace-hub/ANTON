/**
 * export-provenance-gate.test.ts — Wave 3 (2026-09-16): the export route
 * appends the provenance appendix to every format and honours the oversight
 * gate. Pinned the way export-formats.test.ts pins the dispatch switch: by the
 * relationship between files, because each half is invisible on its own.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ExportSchema } from '../../server/lib/schemas.js';

const ROUTE = readFileSync(join(process.cwd(), 'server/routes/export.ts'), 'utf8');

describe('export route — provenance appendix', () => {
  it('accepts a messageId so the appendix binds to the exported run', () => {
    const parsed = ExportSchema.safeParse({ format: 'docx', content: 'x', metadata: { sessionId: 's', messageId: 'm' } });
    expect(parsed.success).toBe(true);
  });

  it('builds the appendix server-side and appends it before dispatch', () => {
    expect(ROUTE).toContain("import { buildProvenanceAppendix } from '../services/export-provenance.js'");
    const build = ROUTE.indexOf('await buildProvenanceAppendix(db, { sessionId, messageId, exportedContent: content');
    const append = ROUTE.indexOf('exportedContent = exportedContent + provenanceMarkdown;');
    const dispatch = ROUTE.indexOf('switch (format)');
    expect(build).toBeGreaterThan(-1);
    expect(append).toBeGreaterThan(build);
    expect(dispatch).toBeGreaterThan(append);
  });

  it('the deck gets the appendix as closing slides (pptx used to receive the raw content)', () => {
    expect(ROUTE).toContain('fn(content + provenanceMarkdown, { title, author })');
  });

  it('prefers the run record over browser metadata for model, thinking and module', () => {
    expect(ROUTE).toContain('model = prov.facts.modelRequested ?? model');
    expect(ROUTE).toContain('thinking = prov.facts.thinking ?? thinking');
    expect(ROUTE).toContain('moduleId = prov.facts.moduleId ?? moduleId');
  });
});

describe('export route — oversight gate', () => {
  it('asks the oversight service before dispatch and refuses with 403 when it blocks', () => {
    expect(ROUTE).toContain("import { getOversightStatus } from '../services/oversight-status.js'");
    const check = ROUTE.indexOf('await getOversightStatus(db, sessionId, moduleId, messageId)');
    const refuse = ROUTE.indexOf('res.status(403).json({');
    const dispatch = ROUTE.indexOf('switch (format)');
    expect(check).toBeGreaterThan(-1);
    expect(refuse).toBeGreaterThan(check);
    expect(dispatch).toBeGreaterThan(refuse);
    expect(ROUTE.slice(check, dispatch)).toContain('if (oversight.blocksExport)');
  });

  it('a failure to read the oversight status never blocks an export', () => {
    const check = ROUTE.indexOf('await getOversightStatus(db, sessionId, moduleId, messageId)');
    const dispatch = ROUTE.indexOf('switch (format)');
    expect(ROUTE.slice(check, dispatch)).toContain('export continues');
  });
});
