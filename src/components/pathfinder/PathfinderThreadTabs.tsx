import { useState } from 'react';
import { Plus, Pin, X, Pencil, Check } from 'lucide-react';
import type { PathfinderThread } from '@/lib/pathfinder-api';

interface PathfinderThreadTabsProps {
  threads: PathfinderThread[];
  activeThreadId: string | null;
  onSelect: (threadId: string | null) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
}

export default function PathfinderThreadTabs({
  threads, activeThreadId, onSelect, onCreate, onRename, onPin, onDelete,
}: PathfinderThreadTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  function startEdit(id: string, currentTitle: string) {
    setEditingId(id);
    setEditTitle(currentTitle);
  }

  function commitEdit(id: string) {
    if (editTitle.trim()) onRename(id, editTitle.trim());
    setEditingId(null);
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin pb-1">
      {/* "All" tab */}
      <button
        onClick={() => onSelect(null)}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
          activeThreadId === null
            ? 'bg-adv-teal text-adv-dark'
            : 'text-adv-gray hover:text-adv-off-white hover:bg-adv-card/50'
        }`}
      >
        All
      </button>

      {threads.map(t => (
        <div
          key={t.id}
          className={`group flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors ${
            activeThreadId === t.id
              ? 'bg-adv-teal/15 text-adv-teal border border-adv-teal/30'
              : 'text-adv-gray hover:text-adv-off-white hover:bg-adv-card/50 border border-transparent'
          }`}
        >
          {t.pinned ? <Pin className="h-2.5 w-2.5 text-adv-gold shrink-0" /> : null}

          {editingId === t.id ? (
            <div className="flex items-center gap-1">
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && commitEdit(t.id)}
                className="w-24 rounded bg-adv-dark px-1.5 py-0.5 text-xs text-adv-off-white focus:outline-none"
                autoFocus
              />
              <button onClick={() => commitEdit(t.id)} className="text-adv-green hover:text-adv-green/80">
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => onSelect(t.id)}
                className="max-w-[120px] truncate font-medium"
              >
                {t.title}
              </button>
              <span className="text-[10px] opacity-50">{t.search_count}</span>

              {/* Action buttons — visible on hover */}
              <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                <button onClick={() => startEdit(t.id, t.title)} className="text-adv-gray hover:text-adv-off-white">
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button onClick={() => onPin(t.id, !t.pinned)} className="text-adv-gray hover:text-adv-gold">
                  <Pin className="h-2.5 w-2.5" />
                </button>
                <button onClick={() => onDelete(t.id)} className="text-adv-gray hover:text-adv-red">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {/* New thread button */}
      <button
        onClick={onCreate}
        className="shrink-0 flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1.5 text-xs text-adv-gray hover:text-adv-teal hover:border-adv-teal/30 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Thread
      </button>
    </div>
  );
}
