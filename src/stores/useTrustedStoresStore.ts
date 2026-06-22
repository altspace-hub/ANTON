// ── useTrustedStoresStore.ts ────────────────────────────────────────────────
// Zustand store for Trusted Stores P0. Backing API: server/routes/trusted-stores.ts.
// Pin a favourite seller (portal), verify its live signing key via a mutual
// handshake, and watch for key rotation. NO money/budgets here — P0 is trust only.

import { create } from 'zustand';
import { fetchWithAuth } from '../lib/api';

export type TrustStatus = 'pending' | 'pinned' | 'trusted' | 'key_changed' | 'revoked';

export interface TrustedSeller {
  id: string;
  portalAddress: string;
  displayTitle: string | null;
  contactHash: string | null;
  signingPubkeyHex: string;
  signingKeyFingerprint: string;
  status: TrustStatus;
  verificationMethod: string | null;
  descriptorSigVerified: boolean;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  keyChangedAt: string | null;
  previousPubkeyHex: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LookAlikeWarning {
  kind: 'mixed-script' | 'skeleton-collision' | 'edit-distance';
  against?: string;
  editDistance?: number;
  reason: string;
}

export interface ResolvePreview {
  resolved: {
    portalAddress: string;
    signingPubkeyHex: string;
    signingKeyFingerprint: string;
    displayTitle?: string;
    contactHash?: string;
    originEndpoint?: string;
  } | null;
  integrity: { valid: boolean; reasons: string[] } | null;
  lookAlikeWarnings: LookAlikeWarning[];
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetchWithAuth(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error || `HTTP ${res.status}`);
  return json as T;
}

interface State {
  sellers: TrustedSeller[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  resolve: (portalAddress: string) => Promise<ResolvePreview>;
  pin: (portalAddress: string) => Promise<{ seller: TrustedSeller; lookAlikeWarnings: LookAlikeWarning[] }>;
  requestHandshake: (portalAddress: string) => Promise<{ responseId: string; status: string }>;
  agree: (responseId: string) => Promise<void>;
  verifyHandshake: (portalAddress: string, responseId: string) => Promise<{ verified: boolean; pending?: boolean; reasons: string[] }>;
  recheckKey: (portalAddress: string) => Promise<{ rotated: boolean; resolvable: boolean; oldFingerprint?: string; newFingerprint?: string }>;
  remove: (portalAddress: string) => Promise<void>;
}

export const useTrustedStoresStore = create<State>((set, get) => ({
  sellers: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetchWithAuth('/api/trusted-stores');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { sellers: TrustedSeller[] };
      set({ sellers: json.sellers, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  resolve: (portalAddress) => post<ResolvePreview>('/trusted-stores/resolve', { portalAddress }),

  pin: async (portalAddress) => {
    const r = await post<{ seller: TrustedSeller; lookAlikeWarnings: LookAlikeWarning[] }>('/trusted-stores/pin', { portalAddress });
    await get().load();
    return r;
  },

  requestHandshake: (portalAddress) => post('/trusted-stores/handshake/request', { portalAddress }),

  agree: async (responseId) => { await post('/trusted-stores/agree', { responseId }); },

  verifyHandshake: async (portalAddress, responseId) => {
    const r = await post<{ verified: boolean; pending?: boolean; reasons: string[] }>('/trusted-stores/handshake/verify', { portalAddress, responseId });
    if (r.verified) await get().load();
    return r;
  },

  recheckKey: async (portalAddress) => {
    const r = await post<{ rotated: boolean; resolvable: boolean; oldFingerprint?: string; newFingerprint?: string }>('/trusted-stores/recheck-key', { portalAddress });
    await get().load();
    return r;
  },

  remove: async (portalAddress) => {
    const res = await fetchWithAuth(`/api/trusted-stores/${encodeURIComponent(portalAddress)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    set((s) => ({ sellers: s.sellers.filter((x) => x.portalAddress !== portalAddress) }));
  },
}));
