import { useState } from 'react';
import type { Deadline, DeadlineLabel, Project } from './types';
import { apiPost, KANBAN_COLUMNS } from './types';

interface DeadlineFormProps {
  onAdded: (d: Deadline) => void;
  onCancel: () => void;
  parentId?: string;
  projects: Project[];
  labels: DeadlineLabel[];
}

function calcStartDate(dueDate: string, prepDays: number, reviewDays: number, bufferDays: number): string {
  const d = new Date(dueDate);
  d.setDate(d.getDate() - (prepDays + reviewDays + bufferDays));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function DeadlineForm({ onAdded, onCancel, parentId, projects, labels }: DeadlineFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<string>('medium');
  const [category, setCategory] = useState<string>('internal');
  const [prepDays, setPrepDays] = useState<number>(0);
  const [reviewDays, setReviewDays] = useState<number>(0);
  const [projectId, setProjectId] = useState<string>('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [kanbanColumn, setKanbanColumn] = useState<string>('backlog');
  const [effortHours, setEffortHours] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const startDate = dueDate && (prepDays + reviewDays) > 0
    ? calcStartDate(dueDate, prepDays, reviewDays, 2)
    : null;

  function toggleLabel(labelId: string) {
    setSelectedLabels(prev =>
      prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueDate) {
      setErr('Title and due date are required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const d = await apiPost<Deadline>('/api/deadlines', {
        title: title.trim(),
        description: description.trim() || undefined,
        due_date: new Date(dueDate).toISOString(),
        priority,
        category,
        preparation_days: prepDays,
        review_days: reviewDays,
        buffer_days: 2,
        parent_id: parentId || undefined,
        project_id: projectId || undefined,
        labels: JSON.stringify(selectedLabels),
        kanban_column: kanbanColumn,
        effort_hours: effortHours ? Number(effortHours) : undefined,
        notes: notes.trim() || undefined,
      });
      onAdded(d);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save deadline.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-adv-teal/30 bg-adv-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-adv-teal">
        {parentId ? 'New Subtask' : 'New Deadline'}
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Title */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-adv-gray">Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Submit AMLR Gap Analysis"
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            required
          />
        </div>

        {/* Description */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-adv-gray">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional context or notes..."
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
          />
        </div>

        {/* Due Date */}
        <div>
          <label className="mb-1 block text-xs font-medium text-adv-gray">Due Date *</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            required
          />
        </div>

        {/* Priority */}
        <div>
          <label className="mb-1 block text-xs font-medium text-adv-gray">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Category */}
        <div>
          <label className="mb-1 block text-xs font-medium text-adv-gray">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          >
            <option value="regulatory">Regulatory</option>
            <option value="client">Client</option>
            <option value="internal">Internal</option>
            <option value="project">Project</option>
          </select>
        </div>

        {/* Project */}
        <div>
          <label className="mb-1 block text-xs font-medium text-adv-gray">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          >
            <option value="">No project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Preparation Days */}
        <div>
          <label className="mb-1 block text-xs font-medium text-adv-gray">
            Preparation Days
            <span className="ml-1 text-adv-gray font-normal">(how many days to prepare)</span>
          </label>
          <input
            type="number"
            min={0}
            max={90}
            value={prepDays}
            onChange={(e) => setPrepDays(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
        </div>

        {/* Review Days */}
        <div>
          <label className="mb-1 block text-xs font-medium text-adv-gray">
            Review Days
            <span className="ml-1 text-adv-gray font-normal">(review / approval time)</span>
          </label>
          <input
            type="number"
            min={0}
            max={30}
            value={reviewDays}
            onChange={(e) => setReviewDays(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
        </div>

        {/* Labels */}
        {labels.length > 0 && (
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-adv-gray">Labels</label>
            <div className="flex flex-wrap gap-2">
              {labels.map(l => {
                const isSelected = selectedLabels.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLabel(l.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? 'ring-1 ring-offset-1 ring-offset-adv-card'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: l.color + (isSelected ? '30' : '15'),
                      color: l.color,
                      ...(isSelected ? { ringColor: l.color } : {}),
                    }}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        className="mt-4 text-xs text-adv-gray hover:text-adv-teal transition-colors"
      >
        {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
      </button>

      {showAdvanced && (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-border pt-4">
          {/* Kanban Column */}
          <div>
            <label className="mb-1 block text-xs font-medium text-adv-gray">Kanban Column</label>
            <select
              value={kanbanColumn}
              onChange={(e) => setKanbanColumn(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              {KANBAN_COLUMNS.map(col => (
                <option key={col.id} value={col.id}>{col.label}</option>
              ))}
            </select>
          </div>

          {/* Effort Hours */}
          <div>
            <label className="mb-1 block text-xs font-medium text-adv-gray">
              Effort Hours
              <span className="ml-1 text-adv-gray font-normal">(estimated)</span>
            </label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={effortHours}
              onChange={(e) => setEffortHours(e.target.value)}
              placeholder="e.g. 8"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>

          {/* Notes */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-adv-gray">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes, links, references..."
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
            />
          </div>
        </div>
      )}

      {/* Calculated start date */}
      {startDate && (
        <div className="mt-3 rounded-lg bg-adv-teal-soft px-3 py-2 text-xs text-adv-teal">
          You should start by: <strong>{startDate}</strong>
          <span className="ml-1 text-adv-gray">(prep {prepDays}d + review {reviewDays}d + 2d buffer)</span>
        </div>
      )}

      {err && <p className="mt-2 text-xs text-adv-red">{err}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
        >
          {saving ? 'Saving...' : parentId ? 'Add Subtask' : 'Add Deadline'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray transition-colors hover:text-adv-off-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
