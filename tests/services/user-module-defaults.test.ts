/**
 * user-module-defaults.test.ts — per-user module defaults and the
 * profile-driven guided prefill (Wave 6 track H, 2026-09-17).
 *
 * The upsert and the read run against a fake adapter that records the
 * statements (no database): the SQL shape is what is asserted — one row per
 * (user, module), a counter that climbs, levels that survive a bad value.
 * The hygiene and prefill functions are pure and tested directly.
 */
import { describe, it, expect } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  recordModuleUse,
  getModuleDefaults,
  sanitiseGuidedInputs,
  suggestGuidedPrefill,
  classifyPrefillField,
  GUIDED_VALUE_MAX_CHARS,
  SENSITIVE_FIELD_RE,
} from '../../server/services/user-module-defaults.js';

interface Stored {
  output_formats: string; thinking: string | null; creativity: string | null; guided_inputs: string; used_count: number;
}

/** Emulates exactly the two statements the service issues. */
function makeFakeDb() {
  const rows = new Map<string, Stored>();
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (!/FROM user_module_defaults/.test(sql)) throw new Error(`fake db: unexpected get(): ${sql.slice(0, 60)}`);
      const [userId, moduleId] = params as [string, string];
      return rows.get(`${userId}|${moduleId}`) as T | undefined;
    },
    async all<T>(): Promise<T[]> { throw new Error('fake db: unexpected all()'); },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      runs.push({ sql, params });
      if (!/INSERT INTO user_module_defaults/.test(sql)) throw new Error(`fake db: unexpected run(): ${sql.slice(0, 60)}`);
      const [userId, moduleId, formats, thinking, creativity, guided] = params as [string, string, string, string | null, string | null, string];
      const key = `${userId}|${moduleId}`;
      const prev = rows.get(key);
      rows.set(key, {
        output_formats: formats,
        thinking: thinking ?? prev?.thinking ?? null,
        creativity: creativity ?? prev?.creativity ?? null,
        guided_inputs: guided,
        used_count: (prev?.used_count ?? 0) + 1,
      });
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, rows, runs };
}

describe('recordModuleUse / getModuleDefaults — one row per (user, module)', () => {
  it('upserts with ON CONFLICT on the primary key and climbs the counter', async () => {
    const { db, runs } = makeFakeDb();
    const use = { userId: 'alice', moduleId: 'gap-analysis', outputFormats: ['executive-summary', 'action-plan'], thinking: 'investigate', creativity: 'strict', guidedInputs: { entity_type: 'bank' } };

    await recordModuleUse(db, use);
    await recordModuleUse(db, { ...use, outputFormats: ['action-plan'], thinking: 'think' });

    expect(runs).toHaveLength(2);
    expect(runs[0].sql).toMatch(/ON CONFLICT \(user_id, module_id\) DO UPDATE/);
    expect(runs[0].sql).toMatch(/used_count\s*=\s*user_module_defaults\.used_count \+ 1/);
    expect(runs[0].sql).not.toMatch(/\$\{/); // parameterised, never interpolated
    expect(runs[0].params.slice(0, 2)).toEqual(['alice', 'gap-analysis']);

    const d = await getModuleDefaults(db, 'alice', 'gap-analysis');
    expect(d).toEqual({
      outputFormats: ['action-plan'],
      thinking: 'think',
      creativity: 'strict',
      guidedInputs: { entity_type: 'bank' },
      usedCount: 2,
    });
  });

  it('null before the first run; another user and another module are separate rows', async () => {
    const { db } = makeFakeDb();
    expect(await getModuleDefaults(db, 'alice', 'gap-analysis')).toBeNull();
    await recordModuleUse(db, { userId: 'alice', moduleId: 'gap-analysis', outputFormats: ['x'], thinking: 'think', creativity: 'balanced', guidedInputs: {} });
    expect(await getModuleDefaults(db, 'bob', 'gap-analysis')).toBeNull();
    expect(await getModuleDefaults(db, 'alice', 'risk-assessment')).toBeNull();
    expect((await getModuleDefaults(db, 'alice', 'gap-analysis'))?.usedCount).toBe(1);
  });

  it('an unrecognised thinking / creativity keeps the last known value; bad formats are dropped', async () => {
    const { db, runs } = makeFakeDb();
    await recordModuleUse(db, { userId: 'a', moduleId: 'm', outputFormats: ['executive-summary'], thinking: 'think_hard', creativity: 'creative', guidedInputs: {} });
    await recordModuleUse(db, { userId: 'a', moduleId: 'm', outputFormats: ['ok-format', 'not valid!', 42, 'ok-format'], thinking: 'ultra', creativity: null, guidedInputs: {} });
    expect(runs[1].params[3]).toBeNull();
    expect(runs[1].params[4]).toBeNull();
    expect(runs[1].sql).toMatch(/thinking\s*=\s*COALESCE\(EXCLUDED\.thinking, user_module_defaults\.thinking\)/);
    const d = await getModuleDefaults(db, 'a', 'm');
    expect(d?.thinking).toBe('think_hard');
    expect(d?.creativity).toBe('creative');
    expect(d?.outputFormats).toEqual(['ok-format']);
  });

  it('a corrupt stored row reads back as empty defaults rather than throwing', async () => {
    const { db, rows } = makeFakeDb();
    rows.set('a|m', { output_formats: '{not json', thinking: 'bogus', creativity: 'strict', guided_inputs: null as unknown as string, used_count: 7 });
    expect(await getModuleDefaults(db, 'a', 'm')).toEqual({ outputFormats: [], thinking: null, creativity: 'strict', guidedInputs: {}, usedCount: 7 });
  });
});

describe('sanitiseGuidedInputs — what may be remembered', () => {
  it('drops fields whose id matches the sensitive pattern', () => {
    const out = sanitiseGuidedInputs({
      entity_type: 'bank', api_token: 'abc', Password: 'x', client_secret: 'y', iban_number: 'SE12', ssn: '1', personnummer: '19800101-1234', fine: 'keep',
    });
    expect(Object.keys(out).sort()).toEqual(['entity_type', 'fine']);
    for (const k of ['password', 'secret', 'token', 'iban', 'ssn', 'personnummer']) expect(SENSITIVE_FIELD_RE.test(k)).toBe(true);
  });

  it('drops fields whose LABEL matches even when the id looks harmless', () => {
    const out = sanitiseGuidedInputs(
      { f1: 'value', f2: 'value', f3: 'value' },
      [{ id: 'f1', label: 'Personnummer' }, { id: 'f2', label: 'API Token' }, { id: 'f3', label: 'Entity type' }],
    );
    expect(Object.keys(out)).toEqual(['f3']);
  });

  it(`caps every string at ${GUIDED_VALUE_MAX_CHARS} characters, inside lists too`, () => {
    const long = 'x'.repeat(GUIDED_VALUE_MAX_CHARS + 50);
    const out = sanitiseGuidedInputs({ notes: long, areas: [long, 'short'] });
    expect((out.notes as string).length).toBe(GUIDED_VALUE_MAX_CHARS);
    expect((out.areas as string[])[0].length).toBe(GUIDED_VALUE_MAX_CHARS);
    expect((out.areas as string[])[1]).toBe('short');
  });

  it('keeps numbers, booleans and string lists; drops objects, mixed lists and non-objects', () => {
    expect(sanitiseGuidedInputs({ n: 3, b: false, list: ['a', 1, 'b'], obj: { k: 'v' }, nan: Number.NaN }))
      .toEqual({ n: 3, b: false, list: ['a', 'b'] });
    expect(sanitiseGuidedInputs('nope')).toEqual({});
    expect(sanitiseGuidedInputs(['a'])).toEqual({});
    expect(sanitiseGuidedInputs(null)).toEqual({});
  });

  it('recordModuleUse stores the sanitised set (labels checked through guidedFields)', async () => {
    const { db } = makeFakeDb();
    await recordModuleUse(db, {
      userId: 'a', moduleId: 'm', outputFormats: [], thinking: 'quick', creativity: 'strict',
      guidedInputs: { jurisdiction: ['sweden'], bank_token: 'secret', f9: 'hidden', note: 'y'.repeat(500) },
      guidedFields: [{ id: 'f9', label: 'IBAN' }],
    });
    const d = await getModuleDefaults(db, 'a', 'm');
    expect(Object.keys(d!.guidedInputs).sort()).toEqual(['jurisdiction', 'note']);
    expect((d!.guidedInputs.note as string).length).toBe(GUIDED_VALUE_MAX_CHARS);
  });
});

describe('suggestGuidedPrefill — the profile answers the form', () => {
  const fields = [
    { id: 'entity_type', label: 'Institution Type', type: 'select', options: [{ value: 'bank', label: 'Bank' }] },
    { id: 'jurisdiction', label: 'Jurisdiction(s)', type: 'chips', options: [{ value: 'eu', label: 'EU / AMLR' }, { value: 'sweden', label: 'Sweden' }, { value: 'sg', label: 'Singapore (MAS)' }] },
    { id: 'language', label: 'Language', type: 'select', options: [{ value: 'en', label: 'English' }, { value: 'sv', label: 'Swedish' }] },
    { id: 'company_name', label: 'Company name', type: 'text' },
    { id: 'target_jurisdiction', label: 'Target Jurisdiction', type: 'text' },
    { id: 'source_language', label: 'Source Language', type: 'text' },
    { id: 'client_name', label: 'Client name', type: 'text' },
  ];

  it('fills jurisdiction (as the option value, wrapped for chips), language and organisation', () => {
    const out = suggestGuidedPrefill(
      { jurisdiction: 'Sweden', output_language: 'sv', organisation: 'Nordbank' },
      { jurisdiction: 'Finland', org_name: 'Org Ltd', preferred_language: 'fi' },
      fields,
    );
    expect(out).toEqual({ jurisdiction: ['sweden'], language: 'sv', company_name: 'Nordbank' });
  });

  it('profile beats org context; org context fills what the profile leaves blank', () => {
    const out = suggestGuidedPrefill(
      { jurisdiction: '', output_language: null, organisation: '  ', company: '' },
      { jurisdiction: 'Sweden', org_name: 'Org Ltd', preferred_language: 'sv' },
      fields,
    );
    expect(out).toEqual({ jurisdiction: ['sweden'], language: 'sv', company_name: 'Org Ltd' });

    const mixed = suggestGuidedPrefill({ jurisdiction: 'Singapore', company: 'Acme' }, { jurisdiction: 'Sweden', org_name: 'Org Ltd' }, fields);
    expect(mixed.jurisdiction).toEqual(['sg']);      // profile jurisdiction, matched inside the option label
    expect(mixed.company_name).toBe('Acme');         // legacy `company` column still counts as the profile's organisation
  });

  it('a select / chips field is only filled when an option names the value; free text gets the value itself', () => {
    const out = suggestGuidedPrefill({ jurisdiction: 'Norway', output_language: 'de' }, null, [
      ...fields,
      { id: 'jurisdiction_note', label: 'Jurisdiction', type: 'textarea' },
      { id: 'working_language', label: 'Working language', type: 'text' },
    ]);
    expect(out.jurisdiction).toBeUndefined();        // no "Norway" option
    expect(out.language).toBeUndefined();            // no German option
    expect(out.jurisdiction_note).toBe('Norway');
    expect(out.working_language).toBe('German');     // the code is spelled out for a text field
  });

  it('never touches fields about somebody else, nor non-text types, nor an empty profile', () => {
    const out = suggestGuidedPrefill({ jurisdiction: 'Sweden', output_language: 'sv', organisation: 'Nordbank' }, null, fields);
    expect(out).not.toHaveProperty('target_jurisdiction');
    expect(out).not.toHaveProperty('source_language');
    expect(out).not.toHaveProperty('client_name');
    expect(out).not.toHaveProperty('entity_type');

    expect(suggestGuidedPrefill({ jurisdiction: 'Sweden' }, null, [{ id: 'jurisdiction', label: 'Jurisdiction', type: 'boolean' }])).toEqual({});
    expect(suggestGuidedPrefill({}, {}, fields)).toEqual({});
    expect(suggestGuidedPrefill(null, undefined, fields)).toEqual({});
  });

  it('classifyPrefillField: the ids and labels modules actually use', () => {
    expect(classifyPrefillField({ id: 'jurisdiction', label: 'Jurisdiction' })).toBe('jurisdiction');
    expect(classifyPrefillField({ id: 'jurisdictions', label: 'Jurisdiction(s)' })).toBe('jurisdiction');
    expect(classifyPrefillField({ id: 'primary_jurisdiction', label: 'Primary Jurisdiction' })).toBe('jurisdiction');
    expect(classifyPrefillField({ id: 'country', label: 'Country of operation' })).toBe('jurisdiction');
    expect(classifyPrefillField({ id: 'q7', label: 'Jurisdiction / Regulator' })).toBeNull();
    expect(classifyPrefillField({ id: 'respondent_jurisdiction', label: 'Respondent jurisdiction' })).toBeNull();
    expect(classifyPrefillField({ id: 'sending_country', label: 'Sending Country' })).toBeNull();
    expect(classifyPrefillField({ id: 'language', label: 'Language' })).toBe('language');
    expect(classifyPrefillField({ id: 'target_language', label: 'Target Language' })).toBeNull();
    expect(classifyPrefillField({ id: 'organisation_name', label: 'Organisation name' })).toBe('organisation');
    expect(classifyPrefillField({ id: 'company', label: 'Company' })).toBe('organisation');
    expect(classifyPrefillField({ id: 'organisation_type', label: 'Organisation type' })).toBeNull();
    expect(classifyPrefillField({ id: 'entity_description', label: 'Entity' })).toBeNull();
  });
});
