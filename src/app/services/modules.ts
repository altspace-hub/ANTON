/**
 * modules.ts — typed companion-app client for /api/app/org/:orgId/modules.
 * Returns the curated mobile module list (pinned + browse) and per-module
 * detail used by the chat header when running inside a module.
 */

import { activeAuthHeaders } from './instances';
import { clientFetch } from './api';

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

export interface ModuleDetail {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  color: 'red' | 'blue' | 'teal' | 'gold' | 'green';
  areaId: string | null;
  areaLabel: string | null;
  /** First "You are a..." paragraph from the module's system prompt. Null
   *  when the prompt file doesn't exist yet (some areas are unauthored). */
  persona: string | null;
  /** Content of the "## Role and Objective" section (or equivalent), trimmed. */
  roleObjective: string | null;
  defaults: {
    thinking: string;
    creativity: string;
    outputFormats: string[];
    outputFormatLabels: string[];
  };
}

export async function listModules(orgId: string): Promise<ModuleList> {
  const headers = await activeAuthHeaders();
  const r = await clientFetch(`/org/${encodeURIComponent(orgId)}/modules`, { headers });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json() as Promise<ModuleList>;
}

export async function getModule(orgId: string, moduleId: string): Promise<ModuleDetail> {
  const headers = await activeAuthHeaders();
  const r = await clientFetch(
    `/org/${encodeURIComponent(orgId)}/modules/${encodeURIComponent(moduleId)}`,
    { headers }
  );
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  const body = await r.json() as { module: ModuleDetail };
  return body.module;
}
