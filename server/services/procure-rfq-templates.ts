/**
 * procure-rfq-templates.ts — RFQ template catalogue (per category, per jurisdiction).
 * Phase B.2 build-out.
 */

import type { DatabaseAdapter } from '../db/database.js';

export interface RfqTemplate {
  id: string;
  name: string;
  category: string;
  jurisdiction: string | null;
  template_body: string;
  required_sections: string[] | null;
  is_active: boolean;
}

export async function createProcureRfqTemplates(db: DatabaseAdapter) {

  async function listTemplates(filter?: { category?: string; jurisdiction?: string }): Promise<RfqTemplate[]> {
    const conds: string[] = ['is_active = TRUE'];
    const args: unknown[] = [];
    if (filter?.category)     { conds.push(`category = ?`);                                            args.push(filter.category); }
    if (filter?.jurisdiction) { conds.push(`(jurisdiction = ? OR jurisdiction IS NULL)`);              args.push(filter.jurisdiction); }
    return await db.all<RfqTemplate>(
      `SELECT id, name, category, jurisdiction, template_body, required_sections, is_active
         FROM procure_rfq_templates
         WHERE ${conds.join(' AND ')}
         ORDER BY jurisdiction NULLS LAST, name`,
      ...args,
    );
  }

  async function getTemplate(id: string): Promise<RfqTemplate | null> {
    return await db.get<RfqTemplate>(
      `SELECT id, name, category, jurisdiction, template_body, required_sections, is_active
         FROM procure_rfq_templates WHERE id = ?`,
      id,
    ) ?? null;
  }

  /**
   * Render a template body with simple `{{variable}}` substitution.
   * No fancy templating engine — explicit substitution prevents accidental
   * code execution in user-submitted templates.
   */
  function render(template: RfqTemplate, vars: Record<string, string>): string {
    let out = template.template_body;
    for (const [key, value] of Object.entries(vars)) {
      out = out.replaceAll(`{{${key}}}`, value);
    }
    return out;
  }

  return { listTemplates, getTemplate, render };
}

export type ProcureRfqTemplates = Awaited<ReturnType<typeof createProcureRfqTemplates>>;
