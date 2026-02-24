import { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Database, CheckCircle2, AlertCircle, Loader2, Edit2, Check, X } from 'lucide-react';
import type { KnowledgeLibraryEntry } from '@/lib/types';

const CATEGORIES = [
  { value: 'regulation', label: 'Regulation', color: 'text-adv-blue' },
  { value: 'case_law', label: 'Case Law', color: 'text-adv-gold' },
  { value: 'client', label: 'Client Docs', color: 'text-adv-teal' },
  { value: 'other', label: 'Other', color: 'text-adv-gray' },
];

const FILE_FILTER_OPTIONS = ['pdf', 'docx', 'txt', 'xlsx', 'md'];

async function fetchLibrary(): Promise<KnowledgeLibraryEntry[]> {
  const r = await fetch('/api/knowledge-library');
  if (!r.ok) throw new Error('Failed to fetch');
  return r.json();
}

async function createEntry(data: { label: string; path: string; category: string; recursive: boolean; file_filter: string[] | null; description: string }): Promise<KnowledgeLibraryEntry> {
  const r = await fetch('/api/knowledge-library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Create failed'); }
  return r.json();
}

async function deleteEntry(id: string): Promise<void> {
  const r = await fetch(`/api/knowledge-library/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Delete failed');
}

async function updateEntry(id: string, data: Partial<KnowledgeLibraryEntry>): Promise<KnowledgeLibraryEntry> {
  const r = await fetch(`/api/knowledge-library/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Update failed'); }
  return r.json();
}

async function indexEntry(id: string): Promise<KnowledgeLibraryEntry & { chunks: number }> {
  const r = await fetch(`/api/knowledge-library/${id}/index`, { method: 'POST' });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Indexing failed'); }
  return r.json();
}

export function KnowledgeLibraryManager() {
  const [entries, setEntries] = useState<KnowledgeLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [indexingId, setIndexingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [newLabel, setNewLabel] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newCategory, setNewCategory] = useState<KnowledgeLibraryEntry['category']>('regulation');
  const [newRecursive, setNewRecursive] = useState(true);
  const [newFileFilter, setNewFileFilter] = useState<string[]>([]);
  const [newDescription, setNewDescription] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editLabel, setEditLabel] = useState('');
  const [editCategory, setEditCategory] = useState<KnowledgeLibraryEntry['category']>('other');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setEntries(await fetchLibrary()); } catch { setError('Failed to load knowledge library'); }
    finally { setLoading(false); }
  }

  async function handleAdd() {
    if (!newLabel.trim()) { setAddError('Label is required'); return; }
    if (!newPath.trim()) { setAddError('Path is required'); return; }
    setAdding(true); setAddError('');
    try {
      await createEntry({
        label: newLabel.trim(),
        path: newPath.trim(),
        category: newCategory,
        recursive: newRecursive,
        file_filter: newFileFilter.length > 0 ? newFileFilter : null,
        description: newDescription,
      });
      setShowAddForm(false);
      setNewLabel(''); setNewPath(''); setNewCategory('regulation'); setNewRecursive(true); setNewFileFilter([]); setNewDescription('');
      await load();
    } catch (e) { setAddError(e instanceof Error ? e.message : 'Failed to create'); }
    finally { setAdding(false); }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try { await deleteEntry(id); await load(); } catch { setError('Delete failed'); }
    finally { setDeletingId(null); }
  }

  async function handleIndex(id: string) {
    setIndexingId(id); setError(null);
    try {
      const result = await indexEntry(id);
      setEntries(prev => prev.map(e => e.id === id ? { ...result } : e));
    } catch (e) { setError(e instanceof Error ? e.message : 'Indexing failed'); }
    finally { setIndexingId(null); }
  }

  function startEdit(entry: KnowledgeLibraryEntry) {
    setEditingId(entry.id);
    setEditLabel(entry.label);
    setEditCategory(entry.category);
    setEditDescription(entry.description);
  }

  async function saveEdit(id: string) {
    try {
      const updated = await updateEntry(id, { label: editLabel, category: editCategory, description: editDescription });
      setEntries(prev => prev.map(e => e.id === id ? updated : e));
      setEditingId(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  }

  const catColor = (cat: string) => CATEGORIES.find(c => c.value === cat)?.color ?? 'text-adv-gray';
  const catLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label ?? cat;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-adv-gray text-sm py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading knowledge library...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-sm text-adv-red">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {entries.length === 0 && !showAddForm && (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <Database className="mx-auto h-8 w-8 text-adv-gray-med mb-3" />
          <p className="text-sm text-adv-gray">No corpora registered.</p>
          <p className="text-xs text-adv-gray-med mt-1">Add your first corpus to make it available across all modules.</p>
        </div>
      )}

      {entries.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-adv-dark-2">
                <th className="px-3 py-2 text-left text-xs font-medium text-adv-gray">Label</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-adv-gray">Category</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-adv-gray hidden md:table-cell">Path</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-adv-gray">Files</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-adv-gray hidden lg:table-cell">Last Indexed</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-adv-gray">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-b border-border/50 hover:bg-adv-dark-2/50 transition-colors">
                  <td className="px-3 py-2">
                    {editingId === entry.id ? (
                      <input
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        className="w-full rounded border border-adv-teal bg-adv-dark px-2 py-0.5 text-xs text-adv-off-white focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <span className="text-adv-off-white font-medium">{entry.label}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === entry.id ? (
                      <select
                        value={editCategory}
                        onChange={e => setEditCategory(e.target.value as KnowledgeLibraryEntry['category'])}
                        className="rounded border border-border bg-adv-dark px-1 py-0.5 text-xs text-adv-off-white focus:outline-none"
                      >
                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    ) : (
                      <span className={`text-xs font-medium ${catColor(entry.category)}`}>{catLabel(entry.category)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <span className="text-xs text-adv-gray-med font-mono truncate max-w-xs block" title={entry.path}>{entry.path}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-adv-gray">
                      {entry.indexed_at
                        ? `${entry.file_count} files`
                        : <span className="text-adv-gray-med italic">Not indexed</span>
                      }
                    </span>
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {entry.indexed_at ? (
                      <div className="flex items-center gap-1 text-xs text-adv-green">
                        <CheckCircle2 className="h-3 w-3" />
                        {new Date(entry.indexed_at).toLocaleDateString()}
                      </div>
                    ) : (
                      <span className="text-xs text-adv-gray-med">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {editingId === entry.id ? (
                        <>
                          <button
                            onClick={() => saveEdit(entry.id)}
                            className="rounded p-1 text-adv-teal hover:bg-adv-teal-dim"
                            title="Save"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded p-1 text-adv-gray hover:text-adv-off-white"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(entry)}
                            className="rounded p-1 text-adv-gray hover:text-adv-off-white"
                            title="Edit"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleIndex(entry.id)}
                            disabled={indexingId === entry.id}
                            className="rounded p-1 text-adv-gray hover:text-adv-teal disabled:opacity-50"
                            title="Index Now"
                          >
                            {indexingId === entry.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5" />
                            }
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            disabled={deletingId === entry.id}
                            className="rounded p-1 text-adv-gray hover:text-adv-red disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingId === entry.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />
                            }
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddForm && (
        <div className="rounded-lg border border-adv-teal/30 bg-adv-card p-4 space-y-3">
          <h4 className="text-sm font-medium text-adv-off-white">Add Corpus</h4>
          {addError && <p className="text-xs text-adv-red">{addError}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-adv-gray mb-1 block">Label *</label>
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="EBA Guidelines Corpus"
                className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-adv-gray mb-1 block">Category</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value as KnowledgeLibraryEntry['category'])}
                className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-adv-gray mb-1 block">Folder Path *</label>
            <input
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              placeholder="C:\FCP_Workbench\RAG_dir\eba"
              className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs font-mono text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-adv-gray mb-1 block">Description (optional)</label>
            <input
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Brief description of this corpus"
              className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-adv-gray cursor-pointer">
              <input
                type="checkbox"
                checked={newRecursive}
                onChange={e => setNewRecursive(e.target.checked)}
                className="rounded border-adv-gray-med accent-adv-teal"
              />
              Include subfolders
            </label>
          </div>
          <div>
            <label className="text-xs text-adv-gray mb-1.5 block">File types (leave empty for all)</label>
            <div className="flex flex-wrap gap-1.5">
              {FILE_FILTER_OPTIONS.map(ext => (
                <button
                  key={ext}
                  onClick={() => setNewFileFilter(prev =>
                    prev.includes(ext) ? prev.filter(x => x !== ext) : [...prev, ext]
                  )}
                  className={`rounded px-2 py-0.5 text-xs border transition-colors ${
                    newFileFilter.includes(ext)
                      ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                      : 'border-border text-adv-gray hover:border-adv-gray-med'
                  }`}
                >
                  .{ext}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={adding}
              className="rounded bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 flex items-center gap-1.5"
            >
              {adding && <Loader2 className="h-3 w-3 animate-spin" />}
              Add Corpus
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddError(''); }}
              className="rounded border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Corpus
        </button>
      )}
    </div>
  );
}
