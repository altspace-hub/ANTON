/**
 * demo-owner-data.ts — the owner's own data that a public demo's database
 * must not hold (privacy memo G6 / B6; privacy verification 2026-09-26,
 * problem 13).
 *
 * On a visitor's run the Work route adds some instance-wide settings to the
 * prompt the model receives, and the prompt preview shows them to the
 * visitor: the org context (every run), the Trades business identity (a
 * Trades module) and the fund identity (the IC memo module). Shared knowledge
 * atoms (owner_user_id NULL) are the instance's memory; atom injection is
 * forced off on a demo, but they have no place in a demo's database either.
 * The demo must start from a freshly initialised database, which is an ops
 * step; this check is the code's half: index.ts runs it once at boot in demo
 * mode and logs one warning line naming what it found.
 *
 * It reads only whether each thing is there — never its content, and the
 * warning names the kind of data only. A check that cannot run (a missing
 * table, a failed query) is reported as unchecked, so a broken check is not
 * mistaken for a clean database.
 */
import type { DatabaseAdapter } from '../db/database.js';

export interface DemoOwnerDataReport {
  /** What the database holds that a demo should not, by name. */
  found: string[];
  /** What could not be checked, by name. */
  unchecked: string[];
}

/** Text columns of org_context whose content would reach a prompt or the org-context page. */
const ORG_CONTEXT_TEXT = ['org_name', 'org_type', 'jurisdiction', 'risk_appetite', 'custom_context'] as const;
/** JSON-array columns of org_context; '[]' (their default) is empty. */
const ORG_CONTEXT_LISTS = ['regulatory_perimeter', 'current_priorities', 'key_systems', 'key_relationships', 'regulatory_calendar'] as const;

function nonEmptyText(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

function nonEmptyList(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  const s = String(v).trim();
  if (s === '' || s === '[]') return false;
  try {
    const parsed: unknown = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.length > 0 : true;
  } catch {
    return true; // not a JSON list, but not empty either
  }
}

/**
 * The org context counts when any field a person fills in has content.
 * Reading the org-context page creates an empty 'default' row
 * (services/org-context.ts), so a row alone does not count.
 */
async function orgContextFilledIn(db: DatabaseAdapter): Promise<boolean> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT ${[...ORG_CONTEXT_TEXT, ...ORG_CONTEXT_LISTS].join(', ')} FROM org_context`,
  );
  return rows.some((row) => ORG_CONTEXT_TEXT.some((c) => nonEmptyText(row[c])) || ORG_CONTEXT_LISTS.some((c) => nonEmptyList(row[c])));
}

/** A row exists: the Trades and PE/VC identity rows are written only when someone saves the form. */
async function anyRow(db: DatabaseAdapter, table: 'business_identity' | 'fund_identity'): Promise<boolean> {
  return !!(await db.get(`SELECT 1 AS present FROM ${table} LIMIT 1`));
}

async function sharedAtomCount(db: DatabaseAdapter): Promise<number> {
  const row = await db.get<{ n: string | number }>('SELECT COUNT(*) AS n FROM knowledge_atoms WHERE owner_user_id IS NULL');
  return Number(row?.n ?? 0);
}

/** Checks the demo database for the owner's data. Names only, never content. */
export async function findDemoOwnerData(db: DatabaseAdapter): Promise<DemoOwnerDataReport> {
  const found: string[] = [];
  const unchecked: string[] = [];
  const checks: Array<[name: string, run: () => Promise<boolean | string>]> = [
    ['the org context', () => orgContextFilledIn(db)],
    ['the Trades business identity', () => anyRow(db, 'business_identity')],
    ['the fund identity', () => anyRow(db, 'fund_identity')],
    ['shared knowledge atoms', async () => {
      const n = await sharedAtomCount(db);
      return n > 0 ? `${n} shared knowledge atom${n === 1 ? '' : 's'}` : false;
    }],
  ];
  for (const [name, run] of checks) {
    try {
      const result = await run();
      if (result) found.push(typeof result === 'string' ? result : name);
    } catch {
      unchecked.push(name);
    }
  }
  return { found, unchecked };
}

/** The one line index.ts logs at boot on a demo, or null when the database is clean. */
export function demoOwnerDataWarning(report: DemoOwnerDataReport): string | null {
  const parts: string[] = [];
  if (report.found.length > 0) {
    parts.push(`this database holds ${report.found.join(', ')}: the owner's data, which can reach a visitor's run and the prompt preview. Start the demo from a freshly initialised database (docs/deployment/public-demo.md).`);
  }
  if (report.unchecked.length > 0) {
    parts.push(`Could not check ${report.unchecked.join(', ')}.`);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}
