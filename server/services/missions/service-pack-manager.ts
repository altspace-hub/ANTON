// ── Missions — Service Pack Manager (Phase 2) ──────────────────────────────
//
// A Service Pack is a pre-built description of how a specific website / app /
// service works (URLs, selectors, page maps, common workflows, fallback hints).
// When loaded, ANTON skips LLM-guided navigation for known sites — the pack
// tells it exactly where to click and what to fill in.
//
// Interaction priority (per spec §14.3):
//   1. Service Pack (fast, deterministic)
//   2. API connector (if pack defines API workflows)
//   3. MCP tool (if available — handled outside this service)
//   4. LLM-guided Playwright (fallback)
//
// Packs are loaded from missions.service_packs (DB) and seeded from
// data/service-packs/*.json on first request.

import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../db/database.js';

export type InteractionType = 'browser' | 'api' | 'mcp' | 'hybrid';
export type SelectorHealth = 'healthy' | 'degraded' | 'broken' | 'unverified';

export interface ServicePackPage {
  /** Selectors keyed by element id, e.g. { "search_input": "#search", "submit": "button[type=submit]" } */
  selectors?: Record<string, string>;
  /** URL pattern this page matches */
  url_pattern?: string;
  /** Brief description for LLM context */
  description?: string;
}

export interface ServicePackWorkflowStep {
  /** browser action (click, fill, navigate, extract, …) OR an HTTP step for api packs */
  action: string;
  selector?: string;
  value?: string;
  url?: string;
  /** HTTP method for api steps (default GET). */
  method?: string;
  /**
   * Reference template — JSON-shaped body documented for LLM + humans.
   * NOT executed by the runner (pseudocode like base64url(...) is allowed
   * here). Use `body_template` for machine-executable bodies.
   */
  template?: string;
  /**
   * Executable body template. JSON-compatible object where string leaves
   * may contain `${param}` placeholders. The runner walks the tree and
   * substitutes each string leaf, so values stay type-safe (no raw string
   * concat into JSON).
   */
  body_template?: unknown;
  description?: string;
}

export interface ServicePackWorkflow {
  description: string;
  parameters?: Array<{ name: string; type: string; required?: boolean; description?: string }>;
  steps: ServicePackWorkflowStep[];
}

export interface ServicePack {
  id: string;
  service_id: string;
  service_name: string;
  version: string;
  author: string | null;
  description: string | null;
  category: string | null;
  interaction_type: InteractionType;

  service_info: {
    base_urls?: string[];
    auth_type?: 'none' | 'oauth2' | 'api_key' | 'username_password';
    auth_flow?: Record<string, unknown>;
    rate_limits?: Record<string, unknown>;
    api_base?: string;
  };
  pages: Record<string, ServicePackPage>;
  workflows: Record<string, ServicePackWorkflow>;
  known_issues: string[];
  fallback_hints: Record<string, string>;

  last_verified: string | null;
  selectors_health: SelectorHealth;
  fallback_count: number;
  total_uses: number;

  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

interface PackRow {
  id: string;
  service_id: string;
  service_name: string;
  version: string;
  author: string | null;
  description: string | null;
  category: string | null;
  interaction_type: string;
  service_info: unknown;
  pages: unknown;
  workflows: unknown;
  known_issues: unknown;
  fallback_hints: unknown;
  last_verified: string | null;
  selectors_health: string;
  fallback_count: number;
  total_uses: number;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

function asJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return v as T;
}

function newPackId(): string {
  return `pack_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function rowToPack(row: PackRow): ServicePack {
  return {
    id: row.id,
    service_id: row.service_id,
    service_name: row.service_name,
    version: row.version,
    author: row.author,
    description: row.description,
    category: row.category,
    interaction_type: row.interaction_type as InteractionType,
    service_info: asJson(row.service_info, {}),
    pages: asJson(row.pages, {}),
    workflows: asJson(row.workflows, {}),
    known_issues: asJson(row.known_issues, []),
    fallback_hints: asJson(row.fallback_hints, {}),
    last_verified: row.last_verified,
    selectors_health: row.selectors_health as SelectorHealth,
    fallback_count: row.fallback_count,
    total_uses: row.total_uses,
    is_builtin: !!row.is_builtin,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createServicePackManager(db: DatabaseAdapter, options?: { packsDir?: string }) {
  const packsDir = options?.packsDir ?? path.join(process.cwd(), 'data', 'service-packs');

  // ── Loading ──────────────────────────────────────────────────────────────

  async function listPacks(filter?: { category?: string; activeOnly?: boolean }): Promise<ServicePack[]> {
    const where: string[] = [];
    const args: unknown[] = [];
    if (filter?.category) { where.push('category = ?'); args.push(filter.category); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await db.all<PackRow>(
      `SELECT * FROM missions.service_packs ${whereSql} ORDER BY service_name ASC`,
      ...args,
    );
    return rows.map(rowToPack);
  }

  async function getPack(serviceId: string): Promise<ServicePack | null> {
    const row = await db.get<PackRow>(`SELECT * FROM missions.service_packs WHERE service_id = ?`, serviceId);
    return row ? rowToPack(row) : null;
  }

  /**
   * Seed built-in Service Packs from data/service-packs/*.json.
   * Idempotent — existing packs (by service_id) are skipped.
   */
  async function seedBuiltinPacks(): Promise<{ seeded: number; errors: Array<{ file: string; error: string }> }> {
    const errors: Array<{ file: string; error: string }> = [];
    let seeded = 0;
    let files: string[] = [];
    try {
      files = (await fs.readdir(packsDir)).filter(f => f.endsWith('.json'));
    } catch (err) {
      // Directory doesn't exist yet — fine, just no built-in packs to seed
      return { seeded: 0, errors: [] };
    }
    for (const file of files) {
      try {
        const filePath = path.join(packsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const pack = JSON.parse(content) as Partial<ServicePack> & { service_id: string; service_name: string };
        if (!pack.service_id || !pack.service_name) {
          errors.push({ file, error: 'Missing service_id or service_name' });
          continue;
        }
        const existing = await getPack(pack.service_id);
        if (existing) continue;
        await registerPack({ ...pack, is_builtin: true } as Partial<ServicePack> & { service_id: string; service_name: string });
        seeded++;
      } catch (err) {
        errors.push({ file, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (seeded > 0) console.log(`[service-packs] Seeded ${seeded} built-in pack(s).`);
    return { seeded, errors };
  }

  /**
   * Register a Service Pack in the DB (insert or skip if service_id exists).
   */
  async function registerPack(pack: Partial<ServicePack> & { service_id: string; service_name: string }): Promise<ServicePack> {
    const existing = await getPack(pack.service_id);
    if (existing) return existing;
    const id = newPackId();
    await db.run(
      `INSERT INTO missions.service_packs
        (id, service_id, service_name, version, author, description, category,
         interaction_type, service_info, pages, workflows, known_issues, fallback_hints,
         is_builtin, selectors_health)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, pack.service_id, pack.service_name,
      pack.version ?? '1.0.0', pack.author ?? null, pack.description ?? null, pack.category ?? null,
      pack.interaction_type ?? 'browser',
      JSON.stringify(pack.service_info ?? {}),
      JSON.stringify(pack.pages ?? {}),
      JSON.stringify(pack.workflows ?? {}),
      JSON.stringify(pack.known_issues ?? []),
      JSON.stringify(pack.fallback_hints ?? {}),
      pack.is_builtin ?? false,
      pack.selectors_health ?? 'unverified',
    );
    const created = await getPack(pack.service_id);
    if (!created) throw new Error('Pack disappeared after insert');
    return created;
  }

  // ── Workflow execution ───────────────────────────────────────────────────

  /**
   * Execute a named workflow from a Service Pack with parameter substitution.
   * Returns the resolved step list — caller (browser-automation or HTTP
   * client) is responsible for actually executing the steps. This separation
   * lets us test pack workflows without launching Playwright.
   */
  async function resolveWorkflow(
    serviceId: string,
    workflowId: string,
    params: Record<string, string> = {},
  ): Promise<{ pack: ServicePack; workflow: ServicePackWorkflow; resolvedSteps: ServicePackWorkflowStep[] }> {
    const pack = await getPack(serviceId);
    if (!pack) throw new Error(`Service pack '${serviceId}' not found`);
    const workflow = pack.workflows[workflowId];
    if (!workflow) throw new Error(`Workflow '${workflowId}' not found in pack '${serviceId}'`);

    // Validate required parameters
    for (const p of workflow.parameters ?? []) {
      if (p.required && !(p.name in params)) {
        throw new Error(`Workflow '${workflowId}' requires parameter '${p.name}'`);
      }
    }

    // Substitute ${param_name} in step values + selectors + URLs. Body
    // templates are walked recursively so only string leaves get substituted —
    // keeps JSON structure intact without risking injection into raw JSON.
    const resolved = workflow.steps.map(step => ({
      ...step,
      selector: substitute(step.selector, params),
      value: substitute(step.value, params),
      // URL substitution: percent-encode params so `${q}` with value 'a&b'
      // becomes 'a%26b' instead of breaking the query string.
      url: substituteUrl(step.url, params),
      template: substitute(step.template, params),
      body_template: step.body_template !== undefined ? substituteDeep(step.body_template, params) : undefined,
    }));

    return { pack, workflow, resolvedSteps: resolved };
  }

  // ── Health tracking ──────────────────────────────────────────────────────

  async function recordWorkflowUse(serviceId: string, _workflowId: string, success: boolean): Promise<void> {
    const setExpr = success
      ? 'total_uses = total_uses + 1'
      : 'total_uses = total_uses + 1, fallback_count = fallback_count + 1';
    await db.run(
      `UPDATE missions.service_packs SET ${setExpr}, updated_at = NOW() WHERE service_id = ?`,
      serviceId,
    );
    // Mark degraded if fallback_count > 25% of uses
    if (!success) {
      const row = await db.get<{ total_uses: number; fallback_count: number }>(
        `SELECT total_uses, fallback_count FROM missions.service_packs WHERE service_id = ?`,
        serviceId,
      );
      if (row && row.total_uses >= 4 && row.fallback_count / row.total_uses > 0.25) {
        await db.run(
          `UPDATE missions.service_packs SET selectors_health = 'degraded' WHERE service_id = ? AND selectors_health = 'healthy'`,
          serviceId,
        );
      }
    }
  }

  async function recordHealEvent(serviceId: string, params: {
    page_id?: string; element_id?: string; old_selector?: string;
    proposed_selector?: string; screenshot_path?: string; llm_reasoning?: string;
  }): Promise<void> {
    const pack = await getPack(serviceId);
    if (!pack) return;
    await db.run(
      `INSERT INTO missions.service_pack_health
        (pack_id, page_id, element_id, old_selector, proposed_selector, screenshot_path, llm_reasoning)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      pack.id, params.page_id ?? null, params.element_id ?? null,
      params.old_selector ?? null, params.proposed_selector ?? null,
      params.screenshot_path ?? null, params.llm_reasoning ?? null,
    );
  }

  async function listHealEvents(serviceId: string, status?: string): Promise<Array<{
    id: number; page_id: string | null; element_id: string | null;
    old_selector: string | null; proposed_selector: string | null;
    status: string; detected_at: string; resolved_at: string | null;
  }>> {
    const pack = await getPack(serviceId);
    if (!pack) return [];
    if (status) {
      return db.all(
        `SELECT id, page_id, element_id, old_selector, proposed_selector, status, detected_at, resolved_at
         FROM missions.service_pack_health WHERE pack_id = ? AND status = ? ORDER BY detected_at DESC`,
        pack.id, status,
      );
    }
    return db.all(
      `SELECT id, page_id, element_id, old_selector, proposed_selector, status, detected_at, resolved_at
       FROM missions.service_pack_health WHERE pack_id = ? ORDER BY detected_at DESC`,
      pack.id,
    );
  }

  return {
    listPacks, getPack, registerPack, seedBuiltinPacks,
    resolveWorkflow,
    recordWorkflowUse, recordHealEvent, listHealEvents,
  };
}

export type ServicePackManager = ReturnType<typeof createServicePackManager>;

// ── Helpers ────────────────────────────────────────────────────────────────

function substitute(value: string | undefined, params: Record<string, string>): string | undefined {
  if (value == null) return value;
  return value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, key) => params[key] ?? '');
}

function substituteUrl(value: string | undefined, params: Record<string, string>): string | undefined {
  if (value == null) return value;
  return value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, key) => encodeURIComponent(params[key] ?? ''));
}

/**
 * Walk a JSON-shaped value, substituting `${param}` in string leaves. Arrays
 * and plain objects recurse; numbers/booleans/null pass through untouched.
 * Guarantees the output stays structurally identical to the input — only
 * string contents change. Safe for building HTTP request bodies without
 * risking JSON injection via raw string concatenation.
 */
function substituteDeep(value: unknown, params: Record<string, string>): unknown {
  if (typeof value === 'string') return substitute(value, params);
  if (Array.isArray(value)) return value.map(v => substituteDeep(v, params));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Keys can carry placeholders too (e.g. Notion's dynamic title property
      // key). substitute() leaves keys without placeholders unchanged.
      const resolvedKey = substitute(k, params) ?? k;
      out[resolvedKey] = substituteDeep(v, params);
    }
    return out;
  }
  return value;
}
