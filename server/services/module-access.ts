/**
 * module-access.ts — which modules a role may run (Wave 6 track F, 2026-09-17).
 *
 * Until today nothing gated which modules a team-mode role could run: the
 * nine admin routes were guarded, POST /api/claude/message was not, and there
 * was no per-module ACL at all. Migration 277 added `module_access_rules`
 * (role, module_id, area_id, effect allow|deny, note); this module is the one
 * place that turns those rows into a verdict.
 *
 * The rules of the verdict, in order:
 *
 *   1. Solo mode (DEPLOYMENT_MODE unset) never restricts — one laptop, one owner.
 *   2. An admin is never restricted; a rule for `admin` is pointless and the
 *      route refuses to store one.
 *   3. Otherwise the role's rules apply with this precedence: a module-specific
 *      rule beats an area rule, which beats a wildcard rule (module_id and
 *      area_id both NULL). Within one scope, deny beats allow.
 *   4. No matching rule → allowed. The default is OPEN: the owner chooses to
 *      restrict, ANTON does not restrict for them.
 *   5. A broken read → allowed, with reason 'access rules unavailable' and one
 *      warning in the log. A database hiccup must never lock everyone out.
 *
 * Rules are cached per role for a minute because the chat path is hot; every
 * write through this module drops the cache, and `resetModuleAccessCache()`
 * exists for tests and for the other write paths.
 */

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '../db/database.js';

export type AccessEffect = 'allow' | 'deny';
export type RuleScope = 'module' | 'area' | 'all';

/** The roles a rule may target. `admin` is deliberately absent — see rule 2. */
export const MODULE_ACCESS_RULE_ROLES = ['viewer', 'analyst'] as const;
export type ModuleAccessRuleRole = typeof MODULE_ACCESS_RULE_ROLES[number];

export function isAccessEffect(value: unknown): value is AccessEffect {
  return value === 'allow' || value === 'deny';
}

export function isModuleAccessRuleRole(value: unknown): value is ModuleAccessRuleRole {
  return typeof value === 'string' && (MODULE_ACCESS_RULE_ROLES as readonly string[]).includes(value);
}

export interface ModuleAccessRule {
  id: string;
  role: string;
  moduleId: string | null;
  areaId: string | null;
  effect: AccessEffect;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ModuleAccessInput {
  /** The caller's users.role. Missing/unknown is evaluated as `viewer`, the least privileged. */
  role: string | null | undefined;
  /** Null for a run with no module (open chat): only wildcard rules can match. */
  moduleId: string | null;
  /** Null when the caller cannot say: only module and wildcard rules can match. */
  areaId: string | null;
  /** `isTeamMode()` from role-guards — false means solo and rule 1 applies. */
  teamMode: boolean;
}

export interface ModuleAccessVerdict {
  allowed: boolean;
  /** The rule that decided, or null when the default (open) applied. */
  rule: { id: string; effect: AccessEffect; scope: RuleScope } | null;
  /** One plain sentence for a log line or a UI tooltip. */
  reason: string;
}

export interface NewModuleAccessRule {
  role: ModuleAccessRuleRole;
  moduleId?: string | null;
  areaId?: string | null;
  effect: AccessEffect;
  note?: string | null;
  createdBy?: string | null;
}

/** The statements, exported so a fake adapter can answer them by identity. */
export const MODULE_ACCESS_SQL = {
  byRole:
    'SELECT id, role, module_id, area_id, effect, note, created_by, created_at FROM module_access_rules WHERE role = ? ORDER BY created_at ASC, id ASC',
  all:
    'SELECT id, role, module_id, area_id, effect, note, created_by, created_at FROM module_access_rules ORDER BY role ASC, created_at ASC, id ASC',
  insert:
    'INSERT INTO module_access_rules (id, role, module_id, area_id, effect, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
  remove: 'DELETE FROM module_access_rules WHERE id = ?',
} as const;

interface RuleRow {
  id: string;
  role: string;
  module_id: string | null;
  area_id: string | null;
  effect: string;
  note: string | null;
  created_by: string | null;
  created_at: string | Date;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; rules: ModuleAccessRule[] }>();

/** Drop every cached rule set (tests, and after any write). */
export function resetModuleAccessCache(): void {
  cache.clear();
}

function rowToRule(row: RuleRow): ModuleAccessRule {
  return {
    id: row.id,
    role: row.role,
    moduleId: row.module_id ?? null,
    areaId: row.area_id ?? null,
    effect: row.effect === 'deny' ? 'deny' : 'allow',
    note: row.note ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

/** Which scope a stored rule speaks for. A row with both ids set is a module rule. */
export function ruleScope(rule: Pick<ModuleAccessRule, 'moduleId' | 'areaId'>): RuleScope {
  if (rule.moduleId) return 'module';
  if (rule.areaId) return 'area';
  return 'all';
}

/** Normalise the caller's role to something a rule can be stored for. */
function effectiveRole(role: string | null | undefined): string {
  return typeof role === 'string' && role.trim() !== '' ? role.trim() : 'viewer';
}

async function rulesForRole(db: DatabaseAdapter, role: string): Promise<ModuleAccessRule[]> {
  const hit = cache.get(role);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rules;
  const rows = await db.all<RuleRow>(MODULE_ACCESS_SQL.byRole, role);
  const rules = rows.map(rowToRule);
  cache.set(role, { at: Date.now(), rules });
  return rules;
}

/**
 * The pure decision over an already-loaded rule set. Exported so the preview
 * and the tests can exercise the precedence without a database.
 */
export function decideFromRules(
  rules: readonly ModuleAccessRule[],
  moduleId: string | null,
  areaId: string | null,
): ModuleAccessVerdict {
  const scopes: RuleScope[] = ['module', 'area', 'all'];
  for (const scope of scopes) {
    const matching = rules.filter((r) => {
      if (ruleScope(r) !== scope) return false;
      if (scope === 'module') return moduleId !== null && r.moduleId === moduleId;
      if (scope === 'area') return areaId !== null && r.areaId === areaId;
      return true;
    });
    if (matching.length === 0) continue;
    // Within one scope, deny beats allow.
    const winner = matching.find((r) => r.effect === 'deny') ?? matching[0];
    return {
      allowed: winner.effect === 'allow',
      rule: { id: winner.id, effect: winner.effect, scope },
      reason: `${winner.effect === 'allow' ? 'allowed' : 'denied'} by ${scope} rule`,
    };
  }
  return { allowed: true, rule: null, reason: 'no rule — default open' };
}

/**
 * May this caller run this module? See the module header for the five rules.
 * Never throws: a database error answers allowed with a reason.
 */
export async function isModuleAllowed(db: DatabaseAdapter, input: ModuleAccessInput): Promise<ModuleAccessVerdict> {
  if (!input.teamMode) return { allowed: true, rule: null, reason: 'solo mode' };
  const role = effectiveRole(input.role);
  if (role === 'admin') return { allowed: true, rule: null, reason: 'admin' };
  try {
    const rules = await rulesForRole(db, role);
    return decideFromRules(rules, input.moduleId, input.areaId);
  } catch (err) {
    console.warn(`[module-access] rules read failed for role ${role}: ${err instanceof Error ? err.message : 'db error'}`);
    return { allowed: true, rule: null, reason: 'access rules unavailable' };
  }
}

/** Every rule, all roles, for the Settings list. */
export async function listModuleAccessRules(db: DatabaseAdapter): Promise<ModuleAccessRule[]> {
  const rows = await db.all<RuleRow>(MODULE_ACCESS_SQL.all);
  return rows.map(rowToRule);
}

/**
 * Store a rule. Validation of role / effect / scope is the caller's job (the
 * route answers 400 with a named field); this throws on a value it cannot store.
 */
export async function addModuleAccessRule(db: DatabaseAdapter, rule: NewModuleAccessRule): Promise<ModuleAccessRule> {
  if (!isModuleAccessRuleRole(rule.role)) throw new Error(`module access rule role must be one of ${MODULE_ACCESS_RULE_ROLES.join(', ')}`);
  if (!isAccessEffect(rule.effect)) throw new Error('module access rule effect must be allow or deny');
  const moduleId = typeof rule.moduleId === 'string' && rule.moduleId.trim() !== '' ? rule.moduleId.trim() : null;
  const areaId = typeof rule.areaId === 'string' && rule.areaId.trim() !== '' ? rule.areaId.trim() : null;
  const note = typeof rule.note === 'string' && rule.note.trim() !== '' ? rule.note.trim() : null;
  const createdBy = typeof rule.createdBy === 'string' && rule.createdBy !== '' ? rule.createdBy : null;
  const id = randomUUID();
  await db.run(MODULE_ACCESS_SQL.insert, id, rule.role, moduleId, areaId, rule.effect, note, createdBy);
  resetModuleAccessCache();
  return {
    id, role: rule.role, moduleId, areaId, effect: rule.effect, note, createdBy,
    createdAt: new Date().toISOString(),
  };
}

/** Remove a rule by id. Returns whether a row went away. */
export async function removeModuleAccessRule(db: DatabaseAdapter, id: string): Promise<boolean> {
  const result = await db.run(MODULE_ACCESS_SQL.remove, id);
  resetModuleAccessCache();
  return result.changes > 0;
}

/**
 * For the Settings preview: what the rules would let `role` run, module by
 * module, as if in team mode. `admin` runs everything. A database error is
 * NOT swallowed here — the preview is an admin page, not the chat path, and
 * the route answers 500 through safeError.
 */
export async function effectiveAccessForRole(
  db: DatabaseAdapter,
  role: string,
  modules: ReadonlyArray<{ id: string; areaId: string | null }>,
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const normalised = effectiveRole(role);
  if (normalised === 'admin') {
    for (const m of modules) out.set(m.id, true);
    return out;
  }
  const rules = await rulesForRole(db, normalised);
  for (const m of modules) out.set(m.id, decideFromRules(rules, m.id, m.areaId).allowed);
  return out;
}
