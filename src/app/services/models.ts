/**
 * models.ts — typed companion-app client for /api/app/org/:orgId/models.
 *
 * Lists the cloud models the user can pick from in the chat composer.
 * The selection is persisted in localStorage (per-instance, not per-org —
 * users want their picked model to follow them across orgs they manage).
 */

import { activeAuthHeaders } from './instances';
import { clientFetch } from './api';

export type ModelTier = 'fast' | 'balanced' | 'top';

export interface ModelOption {
  id: string;
  label: string;
  provider: 'anthropic' | 'openai' | 'mistral' | 'google' | string;
  tier: ModelTier;
  description: string;
}

export interface ModelList {
  models: ModelOption[];
  defaultModel: string | null;
}

export async function listModels(orgId: string): Promise<ModelList> {
  const headers = await activeAuthHeaders();
  const r = await clientFetch(`/org/${encodeURIComponent(orgId)}/models`, { headers });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json() as Promise<ModelList>;
}

const MODEL_KEY = 'anton-companion-selected-model';

export function getSelectedModel(): string | null {
  try { return localStorage.getItem(MODEL_KEY); } catch { return null; }
}

export function setSelectedModel(modelId: string | null): void {
  try {
    if (modelId) localStorage.setItem(MODEL_KEY, modelId);
    else localStorage.removeItem(MODEL_KEY);
  } catch { /* swallow — quota / private mode */ }
}
