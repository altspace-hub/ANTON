/**
 * atlas-service-updates.test.ts — changing and removing Atlas rows (2026-09-23).
 *
 * Until now the Atlas could add and remove rows but not change one, so an AI
 * suggestion to correct a record had nowhere to go. The update calls:
 *   - write only the fields a person may change (never codes, links or scores);
 *   - log each change with its old and new value, and where it came from;
 *   - hold a control to the same "strong needs evidence" rule as adding one;
 *   - have the calculator rescore every path a control's strength touches.
 * And two fixes found on the way:
 *   - removing a vulnerability took its control links with it (cascade) but
 *     left the residuals of its paths as they were;
 *   - changing an approved appetite statement kept the approval.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../../server/db/database.js';
import { createAtlasService } from '../../../server/services/risk-atlas/atlas-service.js';
import type { AtlasKnowledgeBridge } from '../../../server/services/risk-atlas/atlas-knowledge-bridge.js';
import { resolveTestDatabaseUrl } from '../../helpers/test-database-url';

const noBridge = new Proxy({}, { get: () => async () => undefined }) as AtlasKnowledgeBridge;

// ── Against a recording fake: what SQL is issued ────────────────────────────

interface Call { sql: string; params: unknown[] }

function fakeDb(rows: Record<string, Record<string, unknown>>, links: { vulnsOfControl?: string[]; pathsOfVulns?: string[] } = {}) {
  const calls: Call[] = [];
  const events: Array<Record<string, unknown>> = [];
  const db = {
    async run(sql: string, ...params: unknown[]) {
      calls.push({ sql, params });
      if (sql.startsWith('INSERT INTO atlas_events')) events.push({ event: params[1], sub: params[2], details: JSON.parse(String(params[4] ?? 'null')) });
      const upd = /^UPDATE (atlas_\w+) SET (.+), updated_at = NOW\(\) WHERE id = \? AND atlas_id = \?/.exec(sql);
      if (upd) {
        const cols = upd[2].split(', ').map((s) => s.replace(' = ?', ''));
        const row = rows[String(params[cols.length])];
        cols.forEach((c, i) => { row[c] = params[i]; });
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async get(sql: string, ...params: unknown[]) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT inherent_score FROM atlas_inherent_scores')) return { inherent_score: 5 };
      if (sql.startsWith('SELECT atlas_id FROM atlas_threat_paths')) return { atlas_id: 'a1' };
      if (sql.startsWith('SELECT * FROM atlas_residual_scores')) return { residual_score: 3 };
      const hit = rows[String(params[0])];
      return hit && (hit.atlas_id === undefined || params[1] === undefined || hit.atlas_id === params[1]) ? { ...hit } : undefined;
    },
    async all(sql: string, ...params: unknown[]) {
      calls.push({ sql, params });
      // assertInAtlas: which of these ids are rows of this Atlas?
      if (/^SELECT id FROM atlas_\w+ WHERE atlas_id = \? AND id IN/.test(sql)) {
        const [atlasId, ...ids] = params as string[];
        return ids.filter((id) => rows[id]?.atlas_id === atlasId).map((id) => ({ id }));
      }
      if (sql.includes('FROM atlas_control_vulnerability_map WHERE control_id')) return (links.vulnsOfControl ?? []).map((v) => ({ vulnerability_id: v }));
      if (sql.includes('FROM atlas_threat_path_vulnerabilities WHERE vulnerability_id IN')) return (links.pathsOfVulns ?? []).map((t) => ({ threat_path_id: t }));
      if (sql.includes('SELECT DISTINCT c.strength')) return [{ strength: 'strong' }];
      return [];
    },
  } as unknown as DatabaseAdapter;
  return { db, calls, events };
}

const residualWrites = (calls: Call[]) => calls.filter((c) => c.sql.includes('INSERT INTO atlas_residual_scores')).map((c) => c.params[1]);

describe('update — only the fields a person may change', () => {
  let rows: Record<string, Record<string, unknown>>;
  beforeEach(() => {
    rows = {
      'v-1': { id: 'v-1', atlas_id: 'a1', vuln_code: 'V-1', name: 'Weak eKYC', description: null, severity: 3 },
      'c-1': { id: 'c-1', atlas_id: 'a1', control_code: 'C-1', name: 'Review', type: 'detect', strength: 'adequate', evidence: null, owner_role: null },
    };
  });

  it('writes the allowed field, ignores a code, and logs from/to with its source', async () => {
    const { db, calls, events } = fakeDb(rows);
    const svc = createAtlasService(db, { knowledgeBridge: noBridge });
    const row = await svc.updateVulnerability('a1', 'v-1', { severity: 4, vuln_code: 'V-9' } as never, 'u1', { source: 'ai_suggestion', proposal_id: 'p1' });
    const update = calls.find((c) => c.sql.startsWith('UPDATE atlas_vulnerabilities'))!;
    expect(update.sql).toMatch(/SET severity = \?, updated_at = NOW\(\) WHERE id = \? AND atlas_id = \?/);
    expect(update.sql).not.toContain('vuln_code');
    expect(row.severity).toBe(4);
    expect(events).toEqual([{ event: 'vulnerability_updated', sub: 'v-1', details: { changes: { severity: { from: 3, to: 4 } }, source: 'ai_suggestion', proposal_id: 'p1' } }]);
  });

  it('a change to the value a field already has writes nothing and logs nothing', async () => {
    const { db, calls, events } = fakeDb(rows);
    await createAtlasService(db, { knowledgeBridge: noBridge }).updateVulnerability('a1', 'v-1', { severity: 3 }, 'u1');
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
    expect(events).toEqual([]);
  });

  it('a row in another Atlas is not found', async () => {
    const { db } = fakeDb(rows);
    await expect(createAtlasService(db, { knowledgeBridge: noBridge }).updateVulnerability('a2', 'v-1', { severity: 4 }, 'u1')).rejects.toThrow(/not found in this atlas/);
  });

  it('a control is rated strong only with evidence — recorded before or given in the same change', async () => {
    const { db } = fakeDb(rows);
    const svc = createAtlasService(db, { knowledgeBridge: noBridge });
    await expect(svc.updateControl('a1', 'c-1', { strength: 'strong' }, 'u1')).rejects.toThrow(/without specific evidence/);
    await expect(svc.updateControl('a1', 'c-1', { strength: 'strong', evidence: 'Tested Q3 2026, 40 samples' }, 'u1')).resolves.toMatchObject({ strength: 'strong' });
  });

  it('a strength change rescores every path the control covers; a name change does not', async () => {
    const { db, calls } = fakeDb(rows, { vulnsOfControl: ['v-1'], pathsOfVulns: ['tp-1', 'tp-2'] });
    const svc = createAtlasService(db, { knowledgeBridge: noBridge });
    await svc.updateControl('a1', 'c-1', { name: 'Four-eyes review' }, 'u1');
    expect(residualWrites(calls)).toEqual([]);
    await svc.updateControl('a1', 'c-1', { strength: 'weak' }, 'u1');
    expect(residualWrites(calls)).toEqual(['tp-1', 'tp-2']);
  });
});

describe('removeVulnerability rescores the paths it sat on', () => {
  it('collects the paths before the delete and recalculates each after it', async () => {
    const { db, calls, events } = fakeDb({ 'v-1': { id: 'v-1', atlas_id: 'a1' } }, { pathsOfVulns: ['tp-1'] });
    await createAtlasService(db, { knowledgeBridge: noBridge }).removeVulnerability('a1', 'v-1', 'u1', { source: 'ai_suggestion' });
    const del = calls.findIndex((c) => c.sql.startsWith('DELETE FROM atlas_vulnerabilities'));
    const lookup = calls.findIndex((c) => c.sql.includes('FROM atlas_threat_path_vulnerabilities WHERE vulnerability_id IN'));
    expect(lookup).toBeGreaterThan(-1);
    expect(lookup).toBeLessThan(del);
    expect(residualWrites(calls)).toEqual(['tp-1']);
    expect(events[0]).toMatchObject({ event: 'vulnerability_removed', details: { source: 'ai_suggestion' } });
  });

  it('a vulnerability of another Atlas is refused, and rescores nothing', async () => {
    const { db, calls, events } = fakeDb({ 'v-1': { id: 'v-1', atlas_id: 'a1' } }, { pathsOfVulns: ['tp-1'] });
    await expect(createAtlasService(db, { knowledgeBridge: noBridge }).removeVulnerability('a2', 'v-1', 'u1')).rejects.toThrow(/not found in this atlas/);
    expect(residualWrites(calls)).toEqual([]);
    expect(calls.some((c) => c.sql.startsWith('DELETE'))).toBe(false);
    expect(events).toEqual([]);
  });
});

describe('links stay inside their Atlas', () => {
  // Before 2026-09-23 the link tables took any id: a vulnerability, control or
  // appetite statement could be attached to another Atlas's rows, and that
  // Atlas's residuals and rollup would then count it.
  const rows = {
    'tp-a': { id: 'tp-a', atlas_id: 'a1' }, 'tp-b': { id: 'tp-b', atlas_id: 'a2' },
    'v-a': { id: 'v-a', atlas_id: 'a1' }, 'v-b': { id: 'v-b', atlas_id: 'a2' },
    'ex-b': { id: 'ex-b', atlas_id: 'a2' },
  };
  it.each([
    ['a vulnerability on another Atlas\'s path', (s: ReturnType<typeof createAtlasService>) => s.addVulnerability('a1', { vuln_code: 'V-9', name: 'x', severity: 3, threat_path_ids: ['tp-a', 'tp-b'] }, 'u1')],
    ['a control on another Atlas\'s vulnerability', (s: ReturnType<typeof createAtlasService>) => s.addControl('a1', { control_code: 'C-9', name: 'x', type: 'detect', strength: 'weak', vulnerability_links: [{ vulnerability_id: 'v-b', type: 'detect' }] }, 'u1')],
    ['a threat path on another Atlas\'s exposure', (s: ReturnType<typeof createAtlasService>) => s.addThreatPath('a1', { path_code: 'TP-9', name: 'x', exposure_ids: ['ex-b'] }, 'u1')],
    ['an appetite statement on another Atlas\'s path', (s: ReturnType<typeof createAtlasService>) => s.upsertAppetite('a1', { threat_path_id: 'tp-b', appetite_position: 'within' }, 'u1')],
  ])('%s is refused before anything is written', async (_label, act) => {
    const { db, calls } = fakeDb({ ...rows });
    await expect(act(createAtlasService(db, { knowledgeBridge: noBridge }))).rejects.toThrow(/not found in this atlas/);
    expect(calls.filter((c) => /^\s*(INSERT|UPDATE|DELETE)/.test(c.sql))).toEqual([]);
  });
});

// ── Against PostgreSQL: the statements do what they say ─────────────────────
// tests/setup/db-guard.ts decides DATABASE_URL; without one this block skips.
const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

d('against PostgreSQL', () => {
  let db: DatabaseAdapter;
  let svc: ReturnType<typeof createAtlasService>;
  const userId = `u_atlas_upd_${randomUUID().slice(0, 8)}`;
  let atlasId = '';

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    await db.run(`INSERT INTO users (id, username, password_hash) VALUES (?, ?, 'x')`, userId, userId);
    svc = createAtlasService(db, { knowledgeBridge: noBridge });
    atlasId = (await svc.createAtlas({ name: 'Update test (delete me)' }, userId)).id;
  });

  afterAll(async () => {
    if (atlasId) await db.run('DELETE FROM risk_atlases WHERE id = ?', atlasId);
    await db.run('DELETE FROM users WHERE id = ?', userId);
    await db.close();
  });

  it('a target date comes back as the day it is — not a timestamp that reads as the day before', async () => {
    // Live 2026-09-23: the workspace showed "By 2027-03-30T22:00:00.000Z" for a
    // 2027-03-31 target, and the path card's date field saved it back a day early.
    const tp = await svc.addThreatPath(atlasId, { path_code: 'TP-9', name: 'Dates' }, userId);
    const up = await svc.upsertAppetite(atlasId, { threat_path_id: tp.id, appetite_position: 'outside', target_date: '2027-03-31' }, userId);
    expect(up.target_date).toBe('2027-03-31');
    expect((await svc.listAppetite(atlasId)).find((a) => a.threat_path_id === tp.id)?.target_date).toBe('2027-03-31');
    expect((await svc.getThreatPathFull(tp.id, atlasId))?.appetite?.target_date).toBe('2027-03-31');
    // Saved back as shown, it stays the same day.
    const again = await svc.upsertAppetite(atlasId, { threat_path_id: tp.id, appetite_position: 'outside', target_date: up.target_date }, userId);
    expect(again.target_date).toBe('2027-03-31');
  });

  it('a changed appetite statement loses its approval; the same content keeps it', async () => {
    const tp = await svc.addThreatPath(atlasId, { path_code: 'TP-1', name: 'Layering' }, userId);
    const first = await svc.upsertAppetite(atlasId, { threat_path_id: tp.id, appetite_position: 'outside', required_action: 'Fix onboarding', target_date: '2026-12-31', budget_eur: 5000 }, userId);
    await svc.approveAppetite(atlasId, first.id, userId);

    const same = await svc.upsertAppetite(atlasId, { threat_path_id: tp.id, appetite_position: 'outside', required_action: 'Fix onboarding', target_date: '2026-12-31', budget_eur: 5000 }, userId);
    expect(same.approved_by).toBe(userId);

    const changed = await svc.upsertAppetite(atlasId, { threat_path_id: tp.id, appetite_position: 'outside', required_action: 'Replace the onboarding vendor', target_date: '2026-12-31', budget_eur: 5000 }, userId);
    expect(changed.approved_by).toBeNull();
    expect(changed.approved_at).toBeNull();
  });

  it('removing a vulnerability recalculates the residual of the path it covered', async () => {
    const tp = await svc.addThreatPath(atlasId, { path_code: 'TP-2', name: 'Mules' }, userId);
    const v = await svc.addVulnerability(atlasId, { vuln_code: 'V-1', name: 'Weak eKYC', severity: 4, threat_path_ids: [tp.id] }, userId);
    await svc.addControl(atlasId, { control_code: 'C-1', name: 'Liveness', type: 'prevent', strength: 'strong', evidence: 'Vendor audit 2026', vulnerability_links: [{ vulnerability_id: v.id, type: 'prevent' }] }, userId);
    const scored = await svc.scoreInherent(atlasId, tp.id, { exposure: 5, threat: 4, vulnerability: 4 }, userId);
    expect(scored.residual?.residual_score).toBe(3);          // 5 − 2 (strong)

    await svc.removeVulnerability(atlasId, v.id, userId);
    const after = await db.get<{ residual_score: number; control_quality_rollup: string }>(`SELECT residual_score, control_quality_rollup FROM atlas_residual_scores WHERE threat_path_id = ?`, tp.id);
    expect(after).toMatchObject({ residual_score: 5, control_quality_rollup: 'absent' });   // no control left: 5 − 0
  });

  it('a strength change rescores, and the audit event carries from/to', async () => {
    const tp = await svc.addThreatPath(atlasId, { path_code: 'TP-3', name: 'Fraud' }, userId);
    const v = await svc.addVulnerability(atlasId, { vuln_code: 'V-2', name: 'No callback', severity: 3, threat_path_ids: [tp.id] }, userId);
    const c = await svc.addControl(atlasId, { control_code: 'C-2', name: 'Callback', type: 'prevent', strength: 'adequate', vulnerability_links: [{ vulnerability_id: v.id, type: 'prevent' }] }, userId);
    await svc.scoreInherent(atlasId, tp.id, { exposure: 4, threat: 4, vulnerability: 4 }, userId);
    await svc.updateControl(atlasId, c.id, { strength: 'weak' }, userId, { source: 'ai_suggestion' });
    const residual = await db.get<{ residual_score: number }>(`SELECT residual_score FROM atlas_residual_scores WHERE threat_path_id = ?`, tp.id);
    expect(residual?.residual_score).toBe(4);                 // 4 − 0 (weak)
    const ev = await db.get<{ details: unknown }>(`SELECT details FROM atlas_events WHERE atlas_id = ? AND event_type = 'control_updated' ORDER BY id DESC LIMIT 1`, atlasId);
    const details = typeof ev?.details === 'string' ? JSON.parse(ev.details) : ev?.details;
    expect(details).toMatchObject({ changes: { strength: { from: 'adequate', to: 'weak' } }, source: 'ai_suggestion' });
  });
});
