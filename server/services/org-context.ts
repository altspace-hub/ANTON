/**
 * org-context.ts
 * Organisational Context Layer — persistent org-wide context injected into
 * every Claude prompt as layer 2a. Stores and retrieves org-level settings.
 */

import type { Database } from 'better-sqlite3';

export interface OrgContext {
  id: string;
  org_name: string | null;
  org_type: string | null;
  jurisdiction: string | null;
  regulatory_perimeter: string[];
  risk_appetite: string | null;
  key_systems: string[];
  key_relationships: string[];
  current_priorities: string[];
  regulatory_calendar: Array<{ date: string; event: string; source?: string }>;
  preferred_language: string;
  custom_context: string | null;
  user_id: string;
  updated_at: string;
}

interface RawOrgContextRow {
  id: string;
  org_name: string | null;
  org_type: string | null;
  jurisdiction: string | null;
  regulatory_perimeter: string;
  risk_appetite: string | null;
  key_systems: string;
  key_relationships: string;
  current_priorities: string;
  regulatory_calendar: string;
  preferred_language: string;
  custom_context: string | null;
  user_id: string;
  updated_at: string;
}

function parseOrgContext(row: RawOrgContextRow): OrgContext {
  return {
    ...row,
    regulatory_perimeter: JSON.parse(row.regulatory_perimeter || '[]'),
    key_systems: JSON.parse(row.key_systems || '[]'),
    key_relationships: JSON.parse(row.key_relationships || '[]'),
    current_priorities: JSON.parse(row.current_priorities || '[]'),
    regulatory_calendar: JSON.parse(row.regulatory_calendar || '[]'),
  };
}

export type OrgContextUpdate = Partial<Omit<OrgContext, 'id' | 'user_id' | 'updated_at'>>;

export function createOrgContextService(db: Database) {
  const CONTEXT_ID = 'default';

  /**
   * Get the org context for a user (creates empty one if not exists).
   */
  function getContext(userId: string = 'default'): OrgContext {
    const existing = db.prepare('SELECT * FROM org_context WHERE id = ?').get(CONTEXT_ID) as RawOrgContextRow | undefined;

    if (existing) return parseOrgContext(existing);

    // Create empty default context
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO org_context (id, user_id, updated_at)
      VALUES (?, ?, ?)
    `).run(CONTEXT_ID, userId, now);

    return getContext(userId);
  }

  /**
   * Update the org context, logging history for changed fields.
   */
  function updateContext(update: OrgContextUpdate, changedBy: string = 'default'): OrgContext {
    const current = getContext(changedBy);

    const fields: Record<string, unknown> = {};
    const historyEntries: Array<{ field: string; prev: unknown; next: unknown }> = [];

    // Scalar fields
    const scalarFields = ['org_name', 'org_type', 'jurisdiction', 'risk_appetite', 'preferred_language', 'custom_context'] as const;
    for (const f of scalarFields) {
      if (update[f] !== undefined) {
        historyEntries.push({ field: f, prev: current[f], next: update[f] });
        fields[f] = update[f] ?? null;
      }
    }

    // Array / JSON fields
    const jsonFields = ['regulatory_perimeter', 'key_systems', 'key_relationships', 'current_priorities', 'regulatory_calendar'] as const;
    for (const f of jsonFields) {
      if (update[f] !== undefined) {
        historyEntries.push({ field: f, prev: JSON.stringify(current[f]), next: JSON.stringify(update[f]) });
        fields[f] = JSON.stringify(update[f]);
      }
    }

    if (Object.keys(fields).length === 0) return current;

    const now = new Date().toISOString();
    const sets = [...Object.keys(fields).map((k) => `${k} = ?`), 'updated_at = ?'].join(', ');
    const values = [...Object.values(fields), now, CONTEXT_ID];

    db.prepare(`UPDATE org_context SET ${sets} WHERE id = ?`).run(...values);

    // Log history
    const historyStmt = db.prepare(`
      INSERT INTO org_context_history (org_context_id, field_changed, previous_value, new_value, changed_by, changed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const h of historyEntries) {
      historyStmt.run(CONTEXT_ID, h.field, String(h.prev ?? ''), String(h.next ?? ''), changedBy, now);
    }

    return getContext(changedBy);
  }

  /**
   * Build prompt layer 2a: Organisational Context.
   * Injected before the module system prompt.
   */
  function buildOrgContextPrompt(userId: string = 'default'): string {
    const ctx = getContext(userId);

    // If no meaningful context is set, return empty
    if (!ctx.org_name && !ctx.jurisdiction && ctx.current_priorities.length === 0 && !ctx.custom_context) {
      return '';
    }

    const lines: string[] = ['## ORGANISATIONAL CONTEXT'];

    if (ctx.org_name) lines.push(`**Organisation:** ${ctx.org_name}${ctx.org_type ? ` (${ctx.org_type})` : ''}`);
    if (ctx.jurisdiction) lines.push(`**Jurisdiction:** ${ctx.jurisdiction}`);
    if (ctx.regulatory_perimeter.length > 0) lines.push(`**Regulatory Perimeter:** ${ctx.regulatory_perimeter.join(', ')}`);
    if (ctx.risk_appetite) lines.push(`\n**Risk Appetite:** ${ctx.risk_appetite}`);
    if (ctx.key_systems.length > 0) lines.push(`**Key Systems:** ${ctx.key_systems.join(', ')}`);
    if (ctx.key_relationships.length > 0) lines.push(`**Key Relationships/Counterparties:** ${ctx.key_relationships.join(', ')}`);

    if (ctx.current_priorities.length > 0) {
      lines.push(`\n**Current Strategic Priorities:**`);
      ctx.current_priorities.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
    }

    if (ctx.regulatory_calendar.length > 0) {
      lines.push(`\n**Upcoming Regulatory Deadlines:**`);
      ctx.regulatory_calendar.slice(0, 5).forEach((e) => {
        lines.push(`- ${e.date}: ${e.event}${e.source ? ` (${e.source})` : ''}`);
      });
    }

    if (ctx.custom_context) {
      lines.push(`\n**Additional Context:** ${ctx.custom_context}`);
    }

    lines.push(`\nUse this organisational context to tailor analysis, recommendations, and language to this specific organisation's situation. Reference the regulatory perimeter when assessing applicability.`);

    return lines.join('\n');
  }

  /**
   * Get context change history.
   */
  function getHistory(limit = 20): Array<{
    id: number; field_changed: string; previous_value: string;
    new_value: string; changed_by: string; changed_at: string;
  }> {
    return db.prepare(`
      SELECT * FROM org_context_history WHERE org_context_id = ?
      ORDER BY changed_at DESC LIMIT ?
    `).all(CONTEXT_ID, limit) as ReturnType<typeof getHistory>;
  }

  return {
    getContext,
    updateContext,
    buildOrgContextPrompt,
    getHistory,
  };
}
