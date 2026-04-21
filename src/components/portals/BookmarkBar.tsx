// ── BookmarkBar.tsx ─────────────────────────────────────────────────────────
// Persistent full-width bookmark row at the top of the Visitor Home. Shows
// the user's global-scoped bookmarks (category_id IS NULL). Platform
// bookmarks (undeletable) stay anchored left; user bookmarks follow; the
// "+ Add" button trails. Drag-to-reorder is deferred to a follow-up — v1
// is click + remove + rename.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Edit2, MoreVertical } from 'lucide-react';
import { useBookmarksStore } from '../../stores/useBookmarksStore';
import CategoryIcon from './CategoryIcon';

export default function BookmarkBar() {
  const navigate = useNavigate();
  const { globalBookmarks, load, remove, rename, loading } = useBookmarksStore();
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => { void load(); }, [load]);

  const bookmarks = globalBookmarks();

  function handleClick(target: string | null, url: string | null, portalId: string | null) {
    if (portalId) { navigate(`/portals/p/${portalId}`); return; }
    if (target) { navigate(target); return; }
    if (url) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
  }

  async function commitRename(id: string) {
    const v = editValue.trim();
    if (v.length > 0 && v.length <= 64) {
      try { await rename(id, v); } catch { /* swallow; server is source of truth */ }
    }
    setEditingId(null);
    setEditValue('');
  }

  return (
    <div className="w-full border-b border-border bg-adv-dark-2">
      <div className="flex items-center gap-1 overflow-x-auto px-4 py-2">
        {bookmarks.map(b => {
          const isEditing = editingId === b.id;
          return (
            <div key={b.id} className="relative flex-shrink-0">
              {isEditing ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => commitRename(b.id)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(b.id); if (e.key === 'Escape') { setEditingId(null); setEditValue(''); } }}
                  className="bg-adv-card text-adv-off-white px-3 py-1.5 rounded text-sm outline-none focus:ring-1 focus:ring-adv-teal"
                  maxLength={64}
                />
              ) : (
                <button
                  onClick={() => handleClick(b.target_route, b.target_url, b.target_portal_id)}
                  onContextMenu={(e) => { e.preventDefault(); setMenuForId(menuForId === b.id ? null : b.id); }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-adv-off-white hover:bg-adv-card transition active:scale-95"
                  aria-label={`${b.label} bookmark`}
                >
                  {b.icon_ref && <CategoryIcon name={b.icon_ref} size={16} />}
                  <span className="truncate max-w-[10rem]">{b.label}</span>
                </button>
              )}

              {menuForId === b.id && !isEditing && (
                <div className="absolute top-full left-0 mt-1 bg-adv-card border border-border rounded shadow-lg z-50 min-w-[10rem]">
                  <button
                    onClick={() => { setEditingId(b.id); setEditValue(b.label); setMenuForId(null); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-adv-dark-2 flex items-center gap-2"
                  >
                    <Edit2 size={14} /> Rename
                  </button>
                  {!b.undeletable && (
                    <button
                      onClick={() => { void remove(b.id); setMenuForId(null); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-adv-dark-2 flex items-center gap-2 text-adv-red"
                    >
                      <X size={14} /> Remove
                    </button>
                  )}
                  {b.undeletable && (
                    <div className="px-3 py-2 text-xs text-adv-gray italic">
                      Platform bookmark — cannot remove
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={() => {
            const label = window.prompt('Bookmark name?');
            if (!label || !label.trim()) return;
            const url = window.prompt('URL or route (e.g. /portals/discovery or https://…)?');
            if (!url || !url.trim()) return;
            const isUrl = url.startsWith('http://') || url.startsWith('https://');
            useBookmarksStore.getState().add({
              bookmark_type: isUrl ? 'external' : 'route',
              target_url: isUrl ? url : undefined,
              target_route: isUrl ? undefined : url,
              label: label.trim(),
            }).catch(err => window.alert(`Failed to add bookmark: ${err.message}`));
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm text-adv-gray hover:text-adv-off-white hover:bg-adv-card transition ml-auto flex-shrink-0"
          aria-label="Add bookmark"
        >
          <Plus size={14} />
          <span>Add</span>
        </button>
      </div>
      {loading && bookmarks.length === 0 && (
        <div className="px-4 pb-2 text-xs text-adv-gray">Loading bookmarks…</div>
      )}
    </div>
  );
}
