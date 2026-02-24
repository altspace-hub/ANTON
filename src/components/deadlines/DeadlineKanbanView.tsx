import { useState, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { Deadline, DeadlineLabel } from './types';
import {
  KANBAN_COLUMNS,
  PRIORITY_CONFIG,
  apiPut,
  formatRelativeDue,
  parseLabels,
} from './types';

interface DeadlineKanbanViewProps {
  deadlines: Deadline[];
  labels: DeadlineLabel[];
  onSelect: (d: Deadline) => void;
  onUpdate: (updated: Deadline) => void;
  onRefresh: () => void;
}

/* ------------------------------------------------------------------ */
/*  Compact kanban card (draggable)                                    */
/* ------------------------------------------------------------------ */

function SortableCard({
  deadline,
  labels,
  onSelect,
}: {
  deadline: Deadline;
  labels: DeadlineLabel[];
  onSelect: (d: Deadline) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deadline.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const prio = PRIORITY_CONFIG[deadline.priority];
  const dlLabels = parseLabels(deadline.labels);
  const matchedLabels = labels.filter((l) => dlLabels.includes(l.id));
  const dueText = formatRelativeDue(deadline.due_date);
  const isOverdue = dueText.includes('overdue');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group cursor-pointer rounded-lg border border-border bg-adv-dark-2 p-3 transition-colors hover:border-adv-teal/40"
      onClick={() => onSelect(deadline)}
    >
      {/* drag handle + title */}
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab text-adv-gray-med opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-adv-off-white">
            {deadline.title}
          </p>

          {/* meta row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {/* priority dot */}
            <span
              className={`inline-block h-2 w-2 rounded-full ${prio.dot}`}
              title={prio.label}
            />

            {/* due chip */}
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${
                isOverdue
                  ? 'bg-adv-red/15 text-adv-red'
                  : 'bg-adv-dark text-adv-gray'
              }`}
            >
              {dueText}
            </span>

            {/* subtask count */}
            {(deadline.subtask_count ?? 0) > 0 && (
              <span className="text-xs text-adv-gray-med">
                {deadline.subtask_completed ?? 0}/{deadline.subtask_count}
              </span>
            )}
          </div>

          {/* labels */}
          {matchedLabels.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {matchedLabels.map((l) => (
                <span
                  key={l.id}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: l.color + '22', color: l.color }}
                >
                  {l.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Static card shown in DragOverlay                                   */
/* ------------------------------------------------------------------ */

function OverlayCard({
  deadline,
  labels,
}: {
  deadline: Deadline;
  labels: DeadlineLabel[];
}) {
  const prio = PRIORITY_CONFIG[deadline.priority];
  return (
    <div className="w-[220px] rounded-lg border border-adv-teal/60 bg-adv-card p-3 shadow-xl">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${prio.dot}`} />
        <p className="truncate text-sm font-medium text-adv-off-white">
          {deadline.title}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Droppable column                                                   */
/* ------------------------------------------------------------------ */

function KanbanColumn({
  columnId,
  label,
  deadlines,
  labels,
  onSelect,
}: {
  columnId: string;
  label: string;
  deadlines: Deadline[];
  labels: DeadlineLabel[];
  onSelect: (d: Deadline) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <div
      className={`flex min-w-[220px] flex-col rounded-xl border bg-adv-dark transition-colors ${
        isOver ? 'border-adv-teal/60' : 'border-border'
      }`}
    >
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-adv-off-white">{label}</h3>
        <span className="rounded-full bg-adv-card px-2 py-0.5 text-xs text-adv-gray">
          {deadlines.length}
        </span>
      </div>

      {/* cards area */}
      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3"
        style={{ maxHeight: 'calc(100vh - 260px)' }}
      >
        <SortableContext
          items={deadlines.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {deadlines.map((d) => (
            <SortableCard
              key={d.id}
              deadline={d}
              labels={labels}
              onSelect={onSelect}
            />
          ))}
        </SortableContext>

        {deadlines.length === 0 && (
          <p className="py-8 text-center text-xs text-adv-gray-med">
            No items
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Kanban view                                                   */
/* ------------------------------------------------------------------ */

export default function DeadlineKanbanView({
  deadlines,
  labels,
  onSelect,
  onUpdate,
  onRefresh,
}: DeadlineKanbanViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Group deadlines by kanban_column
  const grouped = useMemo(() => {
    const map: Record<string, Deadline[]> = {};
    for (const col of KANBAN_COLUMNS) {
      map[col.id] = [];
    }
    for (const d of deadlines) {
      const colId = d.kanban_column || 'backlog';
      if (!map[colId]) map[colId] = [];
      map[colId].push(d);
    }
    // Sort each column by sort_order
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [deadlines]);

  const activeDeadline = activeId
    ? deadlines.find((d) => d.id === activeId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const draggedId = String(active.id);
    const dragged = deadlines.find((d) => d.id === draggedId);
    if (!dragged) return;

    // Determine target column: over.id may be a column id or a card id
    let targetColumn: string | null = null;

    // Check if dropped over a column directly
    const isColumn = KANBAN_COLUMNS.some((c) => c.id === String(over.id));
    if (isColumn) {
      targetColumn = String(over.id);
    } else {
      // Dropped over a card -- find which column that card is in
      const overDeadline = deadlines.find((d) => d.id === String(over.id));
      if (overDeadline) {
        targetColumn = overDeadline.kanban_column || 'backlog';
      }
    }

    if (!targetColumn) return;

    // Find the new status from column config
    const colConfig = KANBAN_COLUMNS.find((c) => c.id === targetColumn);
    if (!colConfig) return;

    const newStatus = colConfig.statusMap;

    // If nothing actually changed, bail
    if (dragged.kanban_column === targetColumn && dragged.status === newStatus) {
      return;
    }

    try {
      // Update the deadline's kanban_column and status
      const updated = await apiPut<Deadline>(`/api/deadlines/${draggedId}`, {
        kanban_column: targetColumn,
        status: newStatus,
      });
      onUpdate(updated);

      // Also call reorder endpoint
      const columnDeadlines = grouped[targetColumn] || [];
      const reorderPayload = columnDeadlines
        .filter((d) => d.id !== draggedId)
        .map((d, i) => ({ id: d.id, sort_order: i, kanban_column: targetColumn }));
      // Insert dragged item at the position of the over item, or at end
      const overIndex = reorderPayload.findIndex((r) => r.id === String(over.id));
      const insertAt = overIndex >= 0 ? overIndex : reorderPayload.length;
      reorderPayload.splice(insertAt, 0, {
        id: draggedId,
        sort_order: insertAt,
        kanban_column: targetColumn!,
      });
      // Re-number
      reorderPayload.forEach((r, i) => {
        r.sort_order = i;
      });

      await apiPut('/api/deadlines/reorder', reorderPayload);
      onRefresh();
    } catch (err) {
      console.error('Kanban drag failed:', err);
      onRefresh();
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            columnId={col.id}
            label={col.label}
            deadlines={grouped[col.id] || []}
            labels={labels}
            onSelect={onSelect}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeadline ? (
          <OverlayCard deadline={activeDeadline} labels={labels} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
