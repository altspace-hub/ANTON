import { fetchWithAuth } from '@/lib/api';

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
  labels: string; // JSON array of label IDs
  assigned_to: string; // JSON array
  effort_hours: number | null;
  sort_order: number;
  kanban_column: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  subtasks?: Deadline[];
  subtask_count?: number;
  subtask_completed?: number;
}

export interface DeadlineLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface DeadlineComment {
  id: string;
  deadline_id: string;
  user_id: string | null;
  content: string;
  created_at: string;
}

export interface DeadlineReminder {
  id: string;
  deadline_id: string;
  remind_days_before: number;
  remind_via: string;
  email_address: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface WeekConflict {
  weekStart: string;
  weekEnd: string;
  allocatedHours: number;
  availableHours: number;
  overloaded: boolean;
  deadlines: Deadline[];
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
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
}

export type ViewType = 'list' | 'kanban' | 'week' | 'month' | 'year';
export type FilterType = 'all' | 'today' | 'week' | 'overdue' | 'at_risk';

export const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'text-adv-red', dot: 'bg-adv-red' },
  high: { label: 'High', color: 'text-adv-gold', dot: 'bg-adv-gold' },
  medium: { label: 'Medium', color: 'text-adv-blue', dot: 'bg-adv-blue' },
  low: { label: 'Low', color: 'text-adv-gray', dot: 'bg-adv-gray-med' },
};

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  upcoming: { label: 'Upcoming', color: 'text-adv-teal bg-adv-teal-dim' },
  in_progress: { label: 'In Progress', color: 'text-adv-blue bg-adv-blue/10' },
  review: { label: 'Review', color: 'text-adv-gold bg-adv-gold/10' },
  completed: { label: 'Completed', color: 'text-adv-green bg-adv-green/10' },
  overdue: { label: 'Overdue', color: 'text-adv-red bg-adv-red/10' },
  at_risk: { label: 'At Risk', color: 'text-adv-gold bg-adv-gold/10' },
};

export const KANBAN_COLUMNS = [
  { id: 'backlog', label: 'Backlog', statusMap: 'upcoming' },
  { id: 'todo', label: 'To Do', statusMap: 'upcoming' },
  { id: 'in_progress', label: 'In Progress', statusMap: 'in_progress' },
  { id: 'review', label: 'Review', statusMap: 'review' },
  { id: 'done', label: 'Done', statusMap: 'completed' },
] as const;

// API helpers
export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetchWithAuth(path);
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetchWithAuth(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(msg || `API error ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetchWithAuth(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const r = await fetchWithAuth(path, { method: 'DELETE' });
  if (!r.ok) throw new Error(`API error ${r.status}`);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRelativeDue(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays < 7) return `Due in ${diffDays}d`;
  return formatDate(dateStr);
}

export function parseLabels(labelsJson: string): string[] {
  try { return JSON.parse(labelsJson); } catch { return []; }
}
