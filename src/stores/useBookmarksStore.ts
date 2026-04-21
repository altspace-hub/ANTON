// ── useBookmarksStore.ts ────────────────────────────────────────────────────
// Zustand store for the Visitor Home bookmark bar. Mirrors the rows in
// portal_bookmarks (migration 158). Backing API: server/routes/portal-bookmarks.ts.
//
// Two scopes: global (category_id = null) and per-category. Both live in
// the same store, separated by the bookmark's own category_id.

import { create } from 'zustand';
import { fetchWithAuth } from '../lib/api';

export type BookmarkType = 'platform' | 'portal' | 'route' | 'external';

export interface Bookmark {
  id: string;
  bookmark_type: BookmarkType;
  target_portal_id: string | null;
  target_route: string | null;
  target_url: string | null;
  category_id: string | null;
  label: string;
  icon_ref: string | null;
  sort_order: number;
  undeletable: boolean;
  created_at: string;
}

export interface CreateBookmarkInput {
  bookmark_type: BookmarkType;
  target_portal_id?: string;
  target_route?: string;
  target_url?: string;
  category_id?: string;
  label: string;
  icon_ref?: string;
}

interface BookmarksState {
  bookmarks: Bookmark[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: (input: CreateBookmarkInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, label: string) => Promise<void>;
  reorder: (scope: 'global' | string, orderedIds: string[]) => Promise<void>;
  isPortalBookmarked: (portalId: string) => boolean;
  globalBookmarks: () => Bookmark[];
  categoryBookmarks: (categoryId: string) => Bookmark[];
}

export const useBookmarksStore = create<BookmarksState>((set, get) => ({
  bookmarks: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetchWithAuth('/api/portal-bookmarks');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { bookmarks: Bookmark[] };
      set({ bookmarks: json.bookmarks, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  add: async (input) => {
    const res = await fetchWithAuth('/api/portal-bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    await get().load();
  },

  remove: async (id) => {
    const res = await fetchWithAuth(`/api/portal-bookmarks/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    set(s => ({ bookmarks: s.bookmarks.filter(b => b.id !== id) }));
  },

  rename: async (id, label) => {
    const res = await fetchWithAuth(`/api/portal-bookmarks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    set(s => ({ bookmarks: s.bookmarks.map(b => b.id === id ? { ...b, label } : b) }));
  },

  reorder: async (scope, orderedIds) => {
    // Optimistic: update local sort_order first, then POST. If it fails
    // the server's order wins on next load().
    set(s => {
      const map = new Map(orderedIds.map((id, i) => [id, i] as const));
      return {
        bookmarks: s.bookmarks.map(b => {
          if (!map.has(b.id)) return b;
          const scopeMatches = scope === 'global' ? b.category_id === null : b.category_id === scope;
          if (!scopeMatches) return b;
          return { ...b, sort_order: map.get(b.id)! };
        }),
      };
    });
    const res = await fetchWithAuth('/api/portal-bookmarks/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: orderedIds, scope }),
    });
    if (!res.ok) {
      await get().load(); // revert to server truth
      throw new Error(`HTTP ${res.status}`);
    }
  },

  isPortalBookmarked: (portalId) => get().bookmarks.some(b => b.target_portal_id === portalId),

  globalBookmarks: () => get().bookmarks
    .filter(b => b.category_id === null)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order),

  categoryBookmarks: (categoryId) => get().bookmarks
    .filter(b => b.category_id === categoryId)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order),
}));
