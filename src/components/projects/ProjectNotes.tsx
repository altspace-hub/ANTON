import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Milestone, Bell, Trash2, Send } from 'lucide-react';

interface ProjectNote {
  id: string;
  project_id: string;
  user_id: string;
  user_name: string;
  content: string;
  note_type: string;
  created_at: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const NOTE_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof MessageSquare }> = {
  note: { label: 'Note', color: 'bg-adv-gray/20 text-adv-gray', icon: MessageSquare },
  update: { label: 'Update', color: 'bg-adv-blue/20 text-adv-blue', icon: Bell },
  milestone: { label: 'Milestone', color: 'bg-adv-teal/20 text-adv-teal', icon: Milestone },
};

export default function ProjectNotes({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [newContent, setNewContent] = useState('');
  const [noteType, setNoteType] = useState<'note' | 'update' | 'milestone'>('note');
  const [submitting, setSubmitting] = useState(false);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`, { headers: getAuthHeader() });
      const data = await res.json();
      setNotes(data);
    } catch (err) {
      console.error('[project-notes] fetch error:', err);
    }
  }, [projectId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch(`/api/projects/${projectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ content: newContent.trim(), noteType }),
      });
      setNewContent('');
      fetchNotes();
    } catch (err) {
      console.error('[project-notes] submit error:', err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(noteId: string) {
    try {
      await fetch(`/api/projects/${projectId}/notes/${noteId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      });
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      console.error('[project-notes] delete error:', err);
    }
  }

  return (
    <div>
      {/* Add note form */}
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="rounded-xl border border-border bg-adv-card p-4">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Add a note, update, or milestone..."
            rows={3}
            className="mb-3 w-full resize-none rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(['note', 'update', 'milestone'] as const).map(type => {
                const config = NOTE_TYPE_CONFIG[type];
                const Icon = config.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setNoteType(type)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      noteType === type
                        ? config.color
                        : 'text-adv-gray hover:text-adv-off-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {config.label}
                  </button>
                );
              })}
            </div>
            <button
              type="submit"
              disabled={!newContent.trim() || submitting}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {submitting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      </form>

      {/* Notes feed */}
      {notes.length === 0 ? (
        <div className="rounded-xl border border-border bg-adv-card p-6 text-center">
          <MessageSquare className="mx-auto mb-2 h-8 w-8 text-adv-gray" />
          <p className="text-sm text-adv-gray">No notes yet</p>
          <p className="mt-1 text-xs text-adv-gray">
            Add notes to track progress, decisions, and milestones
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(note => {
            const config = NOTE_TYPE_CONFIG[note.note_type] || NOTE_TYPE_CONFIG.note;
            const Icon = config.icon;
            return (
              <div
                key={note.id}
                className="group rounded-xl border border-border bg-adv-card p-4 transition-all hover:border-adv-teal/10"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${config.color}`}>
                      <Icon className="h-3 w-3" />
                      {config.label}
                    </span>
                    <span className="text-xs font-medium text-adv-off-white">
                      {note.user_name}
                    </span>
                    <span className="text-xs text-adv-gray">
                      {formatRelativeTime(note.created_at)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="rounded p-1 text-adv-gray opacity-0 transition-all hover:text-adv-red group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-adv-off-white">
                  {note.content}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
