/**
 * procure-vendor-directory.ts — searchable vendor catalogue.
 * Phase B.2 build-out (Procure pillar).
 */

import type { DatabaseAdapter } from '../db/database.js';

export interface ProcureVendor {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  category: string;
  jurisdictions: string[] | null;
  certifications: string[] | null;
  size_band: 'startup' | 'sme' | 'mid' | 'enterprise' | null;
  contact_email: string | null;
  notes: string | null;
  trust_score: number | null;
  is_active: boolean;
}

export async function createProcureVendorDirectory(db: DatabaseAdapter) {

  async function listVendors(filter?: {
    category?: string;
    jurisdiction?: string;
    minTrust?: number;
    sizeBand?: ProcureVendor['size_band'];
  }): Promise<ProcureVendor[]> {
    const conds: string[] = ['is_active = TRUE'];
    const args: unknown[] = [];
    if (filter?.category)     { conds.push(`category = ?`);                args.push(filter.category); }
    if (filter?.jurisdiction) { conds.push(`? = ANY(jurisdictions)`);      args.push(filter.jurisdiction); }
    if (filter?.minTrust != null) { conds.push(`trust_score >= ?`);        args.push(filter.minTrust); }
    if (filter?.sizeBand)     { conds.push(`size_band = ?`);               args.push(filter.sizeBand); }
    return await db.all<ProcureVendor>(
      `SELECT id, name, description, website, category, jurisdictions, certifications,
              size_band, contact_email, notes, trust_score, is_active
         FROM procure_vendor_directory
         WHERE ${conds.join(' AND ')}
         ORDER BY trust_score DESC NULLS LAST, name`,
      ...args,
    );
  }

  async function getVendor(id: string): Promise<ProcureVendor | null> {
    return await db.get<ProcureVendor>(
      `SELECT id, name, description, website, category, jurisdictions, certifications,
              size_band, contact_email, notes, trust_score, is_active
         FROM procure_vendor_directory WHERE id = ?`,
      id,
    ) ?? null;
  }

  async function listCategories(): Promise<string[]> {
    const rows = await db.all<{ category: string }>(
      `SELECT DISTINCT category FROM procure_vendor_directory WHERE is_active = TRUE ORDER BY category`,
    );
    return rows.map(r => r.category);
  }

  return { listVendors, getVendor, listCategories };
}

export type ProcureVendorDirectory = Awaited<ReturnType<typeof createProcureVendorDirectory>>;
