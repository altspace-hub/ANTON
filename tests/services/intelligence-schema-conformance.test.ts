import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Static regression guard for the 2026-07-17 intelligence-layer schema fixes.
 *
 * Three hand-written queries named columns that don't exist in
 * schema.postgresql.sql, so they threw (or returned nothing) only at runtime
 * against Postgres — invisible to the no-DB CI tier. These asserts lock the
 * corrected column names without needing a database. (Full behavioural coverage
 * lands with the DB-backed integration tier once CI provisions Postgres.)
 */
const repoRoot = path.resolve(__dirname, '..', '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf-8');
}

/** Strip // and block comments so assertions check CODE, not the explanatory
 *  comments (which legitimately name the old buggy columns to document the fix). */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

function schemaColumns(table: string): Set<string> {
  const schema = read('server/db/schema.postgresql.sql');
  const m = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`).exec(schema);
  if (!m) throw new Error(`table ${table} not found in schema`);
  const cols = new Set<string>();
  for (const line of m[1].split('\n')) {
    const cm = /^\s*([a-z_]+)\s+(TEXT|INTEGER|INT|DOUBLE|TIMESTAMPTZ|BOOLEAN|SERIAL|BIGINT|JSONB|REAL|NUMERIC)/i.exec(line);
    if (cm) cols.add(cm[1]);
  }
  return cols;
}

describe('intelligence-layer schema conformance', () => {
  it('revelation_steps has phase_index + output_content (not step_index / content)', () => {
    const cols = schemaColumns('revelation_steps');
    expect(cols.has('phase_index')).toBe(true);
    expect(cols.has('output_content')).toBe(true);
    expect(cols.has('step_index')).toBe(false);
    expect(cols.has('content')).toBe(false);
  });

  it('market-consul-service inserts into the real revelation_steps columns', () => {
    const src = code('server/services/market-consul-service.ts');
    // The buggy names must be gone from the INSERT column lists.
    expect(src).not.toMatch(/INSERT INTO revelation_steps[^)]*\bstep_index\b/);
    expect(src).toMatch(/INSERT INTO revelation_steps[^)]*\bphase_index\b/);
    expect(src).toMatch(/INSERT INTO revelation_steps[^)]*\boutput_content\b/);
  });

  it('entity_relationships uses source_id/target_id, and the orchestrator query matches', () => {
    const cols = schemaColumns('entity_relationships');
    expect(cols.has('source_id')).toBe(true);
    expect(cols.has('target_id')).toBe(true);
    expect(cols.has('from_id')).toBe(false);
    expect(cols.has('to_id')).toBe(false);

    const engine = code('server/services/orchestrator-engine.ts');
    // The knowledge-graph signal query must not reference the nonexistent names.
    const kgQuery = /readKnowledgeGraphSignals[\s\S]*?LIMIT 5/.exec(engine)?.[0] ?? '';
    expect(kgQuery).toContain('entity_relationships');
    expect(kgQuery).not.toMatch(/\bfrom_id\b/);
    expect(kgQuery).not.toMatch(/\bto_id\b/);
    expect(kgQuery).toMatch(/\bsource_id\b/);
  });

  it('the orchestrator no longer fabricates auto-execution audit records', () => {
    const engine = code('server/services/orchestrator-engine.ts');
    // The removed block inserted outcome='auto_executed' without executing.
    expect(engine).not.toMatch(/INSERT INTO\s+orchestrator_executions/);
    expect(engine).not.toContain("'auto_executed'");
  });
});
