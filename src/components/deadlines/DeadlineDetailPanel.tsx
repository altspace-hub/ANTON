import { useState, useEffect } from 'react';
import {
  X, Clock, Flag, Tag, FolderOpen, Calendar, FileText, Link2, Trash2,
} from 'lucide-react';
import type { Deadline, DeadlineLabel, Project } from './types';
import { PRIORITY_CONFIG, STATUS_CONFIG, KANBAN_COLUMNS, apiPut, formatDate, formatRelativeDue, parseLabels } from './types';
import SubtaskList from './SubtaskList';
import ReminderConfig from './ReminderConfig';
import CommentThread from './CommentThread';

interface DeadlineDetailPanelProps {
  deadline: Deadline;
  labels: DeadlineLabel[];
  projects: Project[];
  onClose: () => void;
  onUpdate: (updated: Deadline) => void;
  onDelete: (id: string) => void;
}

export default function DeadlineDetailPanel({
  deadline,
  labels,
  projects,
  onClose,
  onUpdate,
  onDelete,
}: DeadlineDetailPanelProps) {
  const [d, setD] = useState<Deadline>(deadline);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(d.title);
  const [descDraft, setDescDraft] = useState(d.description ?? '');
  const [editingDesc, setEditingDesc] = useState(false);

  // Sync when prop changes
  useEffect(() => {
    setD(deadline);
    setTitleDraft(deadline.title);
    setDescDraft(deadline.description ?? '');
  }, [deadline]);

  async function patchField(field: string, value: unknown) {
    try {
      const updated = await apiPut<Deadline>(`/api/deadlines/${d.id}`, { [field]: value });
      setD(updated);
      onUpdate(updated);
    } catch {
      // silently fail for inline edits
    }
  }

  async function saveTitle() {
    if (titleDraft.trim() && titleDraft.trim() !== d.title) {
      await patchField('title', titleDraft.trim());
    }
    setEditingTitle(false);
  }

  async function saveDescription() {
    const val = descDraft.trim();
    if (val !== (d.description ?? '')) {
      await patchField('description', val || null);
    }
    setEditingDesc(false);
  }

  function toggleLabel(labelId: string) {
    const current = parseLabels(d.labels);
    const next = current.includes(labelId)
      ? current.filter(id => id !== labelId)
      : [...current, labelId];
    patchField('labels', JSON.stringify(next));
  }

  const selectedLabels = parseLabels(d.labels);
  const priorityCfg = PRIORITY_CONFIG[d.priority] ?? PRIORITY_CONFIG.medium;
  const statusCfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.upcoming;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-[480px] max-w-full flex-col border-l border-border bg-adv-dark-2 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2 text-adv-gray-med text-xs">
            <Calendar className="h-3.5 w-3.5" />
            <span>Created {formatDate(d.created_at)}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Title */}
          <div>
            {editingTitle ? (
              <input
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleDraft(d.title); setEditingTitle(false); } }}
                autoFocus
                className="w-full rounded-lg border border-adv-teal bg-adv-dark px-3 py-2 text-lg font-bold text-adv-white focus:outline-none"
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className="cursor-pointer text-lg font-bold text-adv-white hover:text-adv-teal transition-colors"
                title="Click to edit"
              >
                {d.title}
              </h2>
            )}
          </div>

          {/* Status + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">Status</label>
              <select
                value={d.status}
                onChange={e => patchField('status', e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              >
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">Priority</label>
              <select
                value={d.priority}
                onChange={e => patchField('priority', e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              >
                {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">Due Date</label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={d.due_date ? d.due_date.slice(0, 10) : ''}
                onChange={e => patchField('due_date', new Date(e.target.value).toISOString())}
                className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              />
              <span className={`text-xs ${d.status === 'overdue' ? 'text-adv-red font-semibold' : 'text-adv-gray-med'}`}>
                <Clock className="mr-1 inline h-3 w-3" />
                {formatRelativeDue(d.due_date)}
              </span>
            </div>
          </div>

          {/* Category + Project row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">
                <Tag className="mr-1 inline h-3 w-3" />
                Category
              </label>
              <select
                value={d.category}
                onChange={e => patchField('category', e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              >
                <option value="regulatory">Regulatory</option>
                <option value="client">Client</option>
                <option value="internal">Internal</option>
                <option value="project">Project</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">
                <FolderOpen className="mr-1 inline h-3 w-3" />
                Project
              </label>
              <select
                value={d.project_id ?? ''}
                onChange={e => patchField('project_id', e.target.value || null)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              >
                <option value="">No project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Kanban Column */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">Kanban Column</label>
            <select
              value={d.kanban_column}
              onChange={e => patchField('kanban_column', e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              {KANBAN_COLUMNS.map(col => (
                <option key={col.id} value={col.id}>{col.label}</option>
              ))}
            </select>
          </div>

          {/* Labels */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">Labels</label>
            {labels.length === 0 ? (
              <p className="text-xs text-adv-gray-med">No labels defined.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {labels.map(l => {
                  const isSelected = selectedLabels.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleLabel(l.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                        isSelected
                          ? 'ring-1 ring-offset-1 ring-offset-adv-dark-2'
                          : 'opacity-50 hover:opacity-80'
                      }`}
                      style={{
                        backgroundColor: l.color + (isSelected ? '30' : '15'),
                        color: l.color,
                      }}
                    >
                      {l.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">
              <FileText className="mr-1 inline h-3 w-3" />
              Description
            </label>
            {editingDesc ? (
              <textarea
                value={descDraft}
                onChange={e => setDescDraft(e.target.value)}
                onBlur={saveDescription}
                rows={4}
                autoFocus
                className="w-full rounded-lg border border-adv-teal bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:outline-none resize-none"
              />
            ) : (
              <div
                onClick={() => setEditingDesc(true)}
                className="min-h-[60px] cursor-pointer rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-gray hover:border-adv-teal/40 transition-colors"
                title="Click to edit"
              >
                {d.description || <span className="text-adv-gray-med italic">Click to add a description...</span>}
              </div>
            )}
          </div>

          {/* Prep / Review / Buffer */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">Prep Days</label>
              <input
                type="number"
                min={0}
                max={90}
                value={d.preparation_days}
                onChange={e => patchField('preparation_days', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">Review Days</label>
              <input
                type="number"
                min={0}
                max={30}
                value={d.review_days}
                onChange={e => patchField('review_days', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">Buffer Days</label>
              <input
                type="number"
                min={0}
                max={14}
                value={d.buffer_days}
                onChange={e => patchField('buffer_days', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              />
            </div>
          </div>

          {/* Effort hours */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">Effort Hours</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={d.effort_hours ?? ''}
              onChange={e => patchField('effort_hours', e.target.value ? Number(e.target.value) : null)}
              placeholder="Not set"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
            />
          </div>

          {/* Calculated start date */}
          {d.earliest_start && d.status !== 'completed' && (
            <div className="rounded-lg bg-adv-teal-soft px-3 py-2 text-xs text-adv-teal">
              Start by: <strong>{formatDate(d.earliest_start)}</strong>
              <span className="ml-1 text-adv-gray">
                (prep {d.preparation_days}d + review {d.review_days}d + {d.buffer_days}d buffer)
              </span>
            </div>
          )}

          {/* Status badges */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs ${priorityCfg.color}`}>
              <Flag className="h-3 w-3" />
              {priorityCfg.label}
            </span>
          </div>

          {/* Dependencies */}
          {(d.depends_on || d.blocks) && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">
                <Link2 className="mr-1 inline h-3 w-3" />
                Dependencies
              </label>
              <div className="space-y-1 text-xs text-adv-gray">
                {d.depends_on && <p>Depends on: {d.depends_on}</p>}
                {d.blocks && <p>Blocks: {d.blocks}</p>}
              </div>
            </div>
          )}

          {/* Notes */}
          {d.notes && (
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">Notes</label>
              <p className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-gray">{d.notes}</p>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Subtasks */}
          <SubtaskList
            parentId={d.id}
          />

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Reminders */}
          <ReminderConfig deadlineId={d.id} />

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Comments */}
          <CommentThread deadlineId={d.id} />
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3">
          <button
            onClick={() => {
              if (confirm('Delete this deadline? This cannot be undone.')) {
                onDelete(d.id);
                onClose();
              }
            }}
            className="flex items-center gap-1.5 rounded-lg bg-adv-red/10 px-4 py-2 text-xs font-medium text-adv-red transition-colors hover:bg-adv-red/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Deadline
          </button>
        </div>
      </div>
    </>
  );
}
