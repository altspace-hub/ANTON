/**
 * ProjectChip — "In: Acme merger — change".
 *
 * The matter a conversation belongs to. A session created with a project
 * carries it from the first turn: the composer adds what that project's
 * other sessions concluded, and the history rail can group by it. Work
 * projects only — Coding Studio's project rows (a workspace path on disk)
 * are a different thing and stay out of this list.
 */
import { useEffect, useState } from 'react';
import { FolderOpen, Loader2, Plus, X } from 'lucide-react';
import { fetchProjects, createProject } from '@/lib/api';
import type { SessionProject } from '@/stores/useConfigStore';

interface ProjectRow {
  id: string;
  name: string;
  project_type?: string | null;
  workspace_path?: string | null;
  /** Set by GET /projects: a coding_projects row exists — a Coding Studio project. */
  is_coding?: boolean | null;
  is_archived?: number | boolean | null;
  status?: string | null;
}

/** A Work project: not a Coding Studio project, not archived. The Studio's
 *  152 dogfood scaffolds share the projects table and look identical by
 *  column; only the coding_projects link tells them apart. */
export function isWorkProject(p: ProjectRow): boolean {
  if (p.is_coding) return false;
  if (p.workspace_path) return false;
  if (p.project_type && p.project_type !== 'standard') return false;
  if (p.is_archived) return false;
  return p.status !== 'deleted';
}

interface Props {
  project: SessionProject | null;
  disabled?: boolean;
  onPick: (project: SessionProject) => void;
  onClear: () => void;
}

export default function ProjectChip({ project, disabled, onPick, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchProjects()
      .then((data: unknown) => { if (!cancelled) setRows((Array.isArray(data) ? data : []) as ProjectRow[]); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const close = () => { setOpen(false); setFilter(''); setNewName(''); };
  const visible = rows
    .filter(isWorkProject)
    .filter((p) => !filter.trim() || p.name.toLowerCase().includes(filter.trim().toLowerCase()))
    .slice(0, 40);

  async function handleCreate() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const created = await createProject({ name }) as { id?: string; name?: string };
      if (created?.id) { onPick({ id: created.id, name: created.name ?? name }); close(); }
    } catch {
      // stays open; the user can retry
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative flex items-center gap-2 text-xs">
      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-adv-teal" />
      {project ? (
        <span className="text-adv-gray">
          In{' '}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={disabled}
            className="font-medium text-adv-off-white underline-offset-2 hover:text-adv-teal hover:underline disabled:opacity-60"
          >
            {project.name}
          </button>
        </span>
      ) : (
        <span className="text-adv-gray">
          No project —{' '}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={disabled}
            className="text-adv-teal underline-offset-2 hover:underline disabled:opacity-60"
          >
            file this under a matter
          </button>
        </span>
      )}
      {project && (
        <button type="button" onClick={onClear} disabled={disabled} title="Take this chat out of the project" className="text-adv-gray hover:text-adv-off-white disabled:opacity-60">
          <X className="h-3 w-3" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-6 z-20 w-80 max-w-[90vw] rounded-xl border border-border bg-adv-card p-3 shadow-lg">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
            placeholder="Find a project…"
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none"
          />
          <div className="mt-2 max-h-48 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 px-1 py-2 text-adv-gray"><Loader2 className="h-3 w-3 animate-spin" /> Loading projects…</div>
            )}
            {!loading && visible.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onPick({ id: p.id, name: p.name }); close(); }}
                className={`block w-full rounded-lg px-2 py-1.5 text-left hover:bg-adv-dark-2 ${project?.id === p.id ? 'text-adv-teal' : 'text-adv-off-white'}`}
              >
                {p.name}
              </button>
            ))}
            {!loading && visible.length === 0 && (
              <div className="px-1 py-2 text-adv-gray">{filter.trim() ? 'No project matches.' : 'No projects yet — create the first one below.'}</div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreate(); } }}
              placeholder="New project name"
              className="min-w-0 flex-1 rounded-lg border border-border bg-adv-dark px-2 py-1.5 text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim()}
              className="flex items-center gap-1 rounded-lg bg-adv-teal px-2.5 py-1.5 font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
