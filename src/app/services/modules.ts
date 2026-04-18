/**
 * modules.ts — typed companion-app client for /api/app/org/:orgId/modules.
 * Returns the curated mobile module list (pinned + browse).
 */

import { activeServerBase, activeAuthHeaders } from './instances';

export interface PinnedModule {
  id: string;
  name: string;
  description: string;
  color: 'red' | 'blue' | 'teal' | 'gold' | 'green';
  busy: boolean;
  message?: string;
}

export interface BrowseModule {
  id: string;
  name: string;
  description: string;
}

export interface ModuleList {
  pinned: PinnedModule[];
  browse: BrowseModule[];
}

export async function listModules(orgId: string): Promise<ModuleList> {
  const base = activeServerBase();
  const headers = await activeAuthHeaders();
  const r = await fetch(`${base}/api/app/org/${encodeURIComponent(orgId)}/modules`, { headers });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json() as Promise<ModuleList>;
}
