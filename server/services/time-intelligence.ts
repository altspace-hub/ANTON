import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';

export interface Deadline {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  source_type: string;
  source_ref: string | null;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  depends_on: string;
  blocks: string;
  preparation_days: number;
  review_days: number;
  buffer_days: number;
  earliest_start: string | null;
  owner_id: string | null;
  team_ids: string;
  status: 'upcoming' | 'in_progress' | 'review' | 'completed' | 'overdue' | 'at_risk';
  completed_at: string | null;
  is_recurring: number;
  recurrence_rule: string | null;
  parent_id: string | null;
  project_id: string | null;
  labels: string;
  assigned_to: string;
  effort_hours: number | null;
  sort_order: number;
  kanban_column: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkRhythm {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  anchor_expression: string;
  typical_duration_days: number | null;
  typical_effort_hours: number | null;
  source: string;
  associated_workflows: string;
  is_active: number;
  created_at: string;
}

export interface MorningBrief {
  overdue: Deadline[];
  dueToday: Deadline[];
  atRisk: Deadline[];
  dueThisWeek: Deadline[];
  capacityWarning: boolean;
  allocatedHoursThisWeek: number;
  availableHoursThisWeek: number;
}

export interface WeekConflict {
  weekStart: string;
  weekEnd: string;
  allocatedHours: number;
  availableHours: number;
  overloaded: boolean;
  deadlines: Deadline[];
}

function calculateEarliestStart(dueDate: string, preparationDays: number, reviewDays: number, bufferDays: number): string {
  const due = new Date(dueDate);
  const totalDays = preparationDays + reviewDays + bufferDays;
  const start = new Date(due);
  start.setDate(start.getDate() - totalDays);
  return start.toISOString();
}

function getPriorityWeight(priority: string): number {
  const weights: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return weights[priority] ?? 2;
}

function getUrgencyScore(deadline: Deadline): number {
  const daysUntilDue = Math.max(0, (new Date(deadline.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const urgency = daysUntilDue > 0 ? (1 / daysUntilDue) * 10 : 100;
  const isRegulatory = deadline.category === 'regulatory' ? 5 : 0;
  return urgency + isRegulatory + getPriorityWeight(deadline.priority);
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function createTimeIntelligence(db: Database.Database) {
  return {
    createDeadline(
      data: {
        title: string;
        description?: string;
        due_date: string;
        category?: string;
        priority?: string;
        preparation_days?: number;
        review_days?: number;
        buffer_days?: number;
        owner_id?: string;
        source_type?: string;
        source_ref?: string;
        parent_id?: string;
        project_id?: string;
        labels?: string;
        assigned_to?: string;
        effort_hours?: number;
        kanban_column?: string;
        notes?: string;
      },
      _userId: string
    ): Deadline {
      const id = randomUUID();
      const preparationDays = data.preparation_days ?? 0;
      const reviewDays = data.review_days ?? 0;
      const bufferDays = data.buffer_days ?? 2;
      const earliestStart = calculateEarliestStart(data.due_date, preparationDays, reviewDays, bufferDays);
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO deadlines (id, title, description, due_date, source_type, source_ref, category,
          priority, preparation_days, review_days, buffer_days, earliest_start, owner_id,
          parent_id, project_id, labels, assigned_to, effort_hours, kanban_column, notes,
          status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?)
      `).run(
        id,
        data.title,
        data.description ?? null,
        data.due_date,
        data.source_type ?? 'manual',
        data.source_ref ?? null,
        data.category ?? 'internal',
        data.priority ?? 'medium',
        preparationDays,
        reviewDays,
        bufferDays,
        earliestStart,
        data.owner_id ?? null,
        data.parent_id ?? null,
        data.project_id ?? null,
        data.labels ?? '[]',
        data.assigned_to ?? '[]',
        data.effort_hours ?? null,
        data.kanban_column ?? 'backlog',
        data.notes ?? null,
        now,
        now
      );

      return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id) as Deadline;
    },

    updateDeadline(id: string, data: Partial<Deadline>): Deadline | null {
      const existing = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id) as Deadline | undefined;
      if (!existing) return null;

      const preparationDays = data.preparation_days ?? existing.preparation_days;
      const reviewDays = data.review_days ?? existing.review_days;
      const bufferDays = data.buffer_days ?? existing.buffer_days;
      const dueDate = data.due_date ?? existing.due_date;
      const earliestStart = calculateEarliestStart(dueDate, preparationDays, reviewDays, bufferDays);

      const fields: string[] = [];
      const values: unknown[] = [];

      const updateable: Array<keyof Deadline> = [
        'title', 'description', 'due_date', 'category', 'priority',
        'preparation_days', 'review_days', 'buffer_days', 'owner_id',
        'status', 'completed_at', 'is_recurring', 'recurrence_rule',
        'source_type', 'source_ref',
        'parent_id', 'project_id', 'labels', 'assigned_to',
        'effort_hours', 'sort_order', 'kanban_column', 'notes',
      ];

      for (const key of updateable) {
        if (key in data) {
          fields.push(`${key} = ?`);
          values.push(data[key] ?? null);
        }
      }

      fields.push('earliest_start = ?');
      values.push(earliestStart);
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      db.prepare(`UPDATE deadlines SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id) as Deadline;
    },

    deleteDeadline(id: string): boolean {
      const result = db.prepare('DELETE FROM deadlines WHERE id = ?').run(id);
      return result.changes > 0;
    },

    getDeadline(id: string): Deadline | null {
      return (db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id) as Deadline | undefined) ?? null;
    },

    getDeadlines(
      _userId: string,
      filters?: {
        status?: string;
        priority?: string;
        from?: string;
        to?: string;
        project_id?: string;
        parent_id?: string | null;
        kanban_column?: string;
      }
    ): Deadline[] {
      let query = 'SELECT * FROM deadlines WHERE 1=1';
      const params: unknown[] = [];

      if (filters?.status) {
        query += ' AND status = ?';
        params.push(filters.status);
      }
      if (filters?.priority) {
        query += ' AND priority = ?';
        params.push(filters.priority);
      }
      if (filters?.from) {
        query += ' AND due_date >= ?';
        params.push(filters.from);
      }
      if (filters?.to) {
        query += ' AND due_date <= ?';
        params.push(filters.to);
      }
      if (filters?.project_id) {
        query += ' AND project_id = ?';
        params.push(filters.project_id);
      }
      if (filters?.parent_id !== undefined) {
        if (filters.parent_id === null || filters.parent_id === 'null') {
          query += ' AND parent_id IS NULL';
        } else {
          query += ' AND parent_id = ?';
          params.push(filters.parent_id);
        }
      }
      if (filters?.kanban_column) {
        query += ' AND kanban_column = ?';
        params.push(filters.kanban_column);
      }

      query += ' ORDER BY due_date ASC';
      return db.prepare(query).all(...params) as Deadline[];
    },

    getMorningBrief(_userId: string): MorningBrief {
      this.refreshStatuses();

      const now = new Date();
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const allActive = db.prepare(
        "SELECT * FROM deadlines WHERE status NOT IN ('completed') ORDER BY due_date ASC"
      ).all() as Deadline[];

      const overdue = allActive
        .filter((d) => d.status === 'overdue')
        .sort((a, b) => getUrgencyScore(b) - getUrgencyScore(a));

      const dueToday = allActive
        .filter((d) => {
          const due = new Date(d.due_date);
          return due <= todayEnd && due >= now && d.status !== 'overdue';
        })
        .sort((a, b) => getUrgencyScore(b) - getUrgencyScore(a));

      const atRisk = allActive
        .filter((d) => d.status === 'at_risk')
        .sort((a, b) => getUrgencyScore(b) - getUrgencyScore(a));

      const dueThisWeek = allActive
        .filter((d) => {
          const due = new Date(d.due_date);
          return due > todayEnd && due <= weekEnd && d.status !== 'overdue' && d.status !== 'at_risk';
        })
        .sort((a, b) => getUrgencyScore(b) - getUrgencyScore(a));

      // Capacity: estimate effort from preparation_days
      const weekStart = getStartOfWeek(now);
      const weekDeadlines = allActive.filter((d) => {
        const due = new Date(d.due_date);
        return due >= weekStart && due <= weekEnd;
      });
      const allocatedHoursThisWeek = weekDeadlines.reduce((sum, d) => {
        return sum + (d.preparation_days + d.review_days) * 4; // 4h per day estimate
      }, 0);
      const availableHoursThisWeek = 40;

      return {
        overdue,
        dueToday,
        atRisk,
        dueThisWeek,
        allocatedHoursThisWeek,
        availableHoursThisWeek,
        capacityWarning: allocatedHoursThisWeek > availableHoursThisWeek * 0.8,
      };
    },

    detectConflicts(_userId: string): WeekConflict[] {
      this.refreshStatuses();

      const deadlines = db.prepare(
        "SELECT * FROM deadlines WHERE status NOT IN ('completed') ORDER BY due_date ASC"
      ).all() as Deadline[];

      if (deadlines.length === 0) return [];

      // Build week-by-week map for the next 12 weeks
      const conflicts: WeekConflict[] = [];
      const now = new Date();

      for (let w = 0; w < 12; w++) {
        const weekStart = getStartOfWeek(new Date(now.getTime() + w * 7 * 24 * 60 * 60 * 1000));
        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

        const weekDeadlines = deadlines.filter((d) => {
          const due = new Date(d.due_date);
          const earliest = d.earliest_start ? new Date(d.earliest_start) : due;
          // Deadline work spans from earliest_start to due_date; if that range overlaps this week
          return earliest <= weekEnd && due >= weekStart;
        });

        const allocatedHours = weekDeadlines.reduce((sum, d) => {
          return sum + (d.preparation_days + d.review_days) * 4;
        }, 0);

        if (weekDeadlines.length > 0 || w < 4) {
          conflicts.push({
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            allocatedHours,
            availableHours: 40,
            overloaded: allocatedHours > 40,
            deadlines: weekDeadlines,
          });
        }
      }

      return conflicts;
    },

    completeDeadline(id: string): Deadline | null {
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE deadlines SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?"
      ).run(now, now, id);
      return this.getDeadline(id);
    },

    refreshStatuses(): void {
      const now = new Date().toISOString();
      // Mark as overdue: past due_date and still upcoming/in_progress/review
      db.prepare(`
        UPDATE deadlines
        SET status = 'overdue', updated_at = ?
        WHERE due_date < ?
          AND status IN ('upcoming', 'in_progress', 'review')
      `).run(now, now);

      // Mark as at_risk: earliest_start has passed but still upcoming
      db.prepare(`
        UPDATE deadlines
        SET status = 'at_risk', updated_at = ?
        WHERE earliest_start < ?
          AND due_date >= ?
          AND status = 'upcoming'
      `).run(now, now, now);
    },

    // Work rhythms CRUD
    getRhythms(): WorkRhythm[] {
      return db.prepare('SELECT * FROM work_rhythms ORDER BY created_at DESC').all() as WorkRhythm[];
    },

    getSubtasks(parentId: string): Deadline[] {
      return db.prepare('SELECT * FROM deadlines WHERE parent_id = ? ORDER BY sort_order, due_date')
        .all(parentId) as Deadline[];
    },

    getDeadlinesByProject(projectId: string): Deadline[] {
      return db.prepare('SELECT * FROM deadlines WHERE project_id = ? ORDER BY due_date ASC')
        .all(projectId) as Deadline[];
    },

    getDeadlinesByDateRange(from: string, to: string): Deadline[] {
      return db.prepare('SELECT * FROM deadlines WHERE due_date >= ? AND due_date <= ? ORDER BY due_date ASC')
        .all(from, to) as Deadline[];
    },

    reorderDeadlines(updates: Array<{ id: string; sort_order: number; kanban_column?: string }>): void {
      const stmt = db.prepare('UPDATE deadlines SET sort_order = ?, kanban_column = COALESCE(?, kanban_column), updated_at = ? WHERE id = ?');
      const now = new Date().toISOString();
      const txn = db.transaction(() => {
        for (const u of updates) {
          stmt.run(u.sort_order, u.kanban_column ?? null, now, u.id);
        }
      });
      txn();
    },

    createRhythm(data: {
      name: string;
      description?: string;
      frequency: string;
      anchor_expression: string;
      typical_duration_days?: number;
      typical_effort_hours?: number;
      source?: string;
    }): WorkRhythm {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO work_rhythms (id, name, description, frequency, anchor_expression,
          typical_duration_days, typical_effort_hours, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.name,
        data.description ?? null,
        data.frequency,
        data.anchor_expression,
        data.typical_duration_days ?? null,
        data.typical_effort_hours ?? null,
        data.source ?? 'manual',
        now
      );
      return db.prepare('SELECT * FROM work_rhythms WHERE id = ?').get(id) as WorkRhythm;
    },
  };
}
