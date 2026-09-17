/**
 * project-context.ts — one container: the project holds the matter, the
 * engagement and the sessions (Wave 4, track D, 2026-09-17).
 *
 * Three matter models lived side by side and never met: `projects` (what a
 * session is filed under), `engagements` (client, brief, status — carries a
 * project_id) and `legal_research_sessions` (the matter brief Counsel's Desk
 * takes at intake — carries a project_id since migration 275). The old
 * project layer (`buildProjectContextSummary` in prompt-builder.ts) read none
 * of that: it pasted the first 200 words of the last answer of three sibling
 * sessions, with no access check at all, into any run that carried the id.
 *
 * This service renders the project as the model should see it, in order:
 *
 *   ## PROJECT                       name, description, goal
 *   ### Matter brief                 newest legal_research_sessions row
 *   ### Engagement                   newest engagements row
 *   ### Earlier sessions …           up to five siblings, newest first, each
 *                                    with its written conclusion
 *                                    (sessions.summary + the latest
 *                                    snapshot's key decisions) or, when no
 *                                    conclusion exists yet, the opening of
 *                                    its last answer, marked as such
 *
 * In team mode the caller's access is verified before a single byte is read;
 * a denied call returns nothing and says so. One query per table, everything
 * parameterised, and the builder never throws — the project layer is
 * enrichment, and a broken enrichment must not cost the run.
 */
import type { DatabaseAdapter } from '../db/database.js';

export interface ProjectContextInput {
  projectId: string;
  /** The session being run — excluded from the sibling list. */
  currentSessionId?: string | null;
  userId: string;
  teamMode: boolean;
  /** The caller's users.role when the route already knows it; looked up
   *  (team mode only) when omitted. */
  userRole?: string | null;
  /** Hard cap on the rendered text. Default 6,000 characters. */
  maxChars?: number;
}

export interface ProjectContextResult {
  text: string;
  chars: number;
  /** Sibling sessions rendered. */
  sessions: number;
  hasMatter: boolean;
  hasEngagement: boolean;
  /** Team mode: the project does not exist or the caller may not see it. */
  denied: boolean;
}

export type ProjectAccess = 'ok' | 'not_found' | 'forbidden';

export interface ProjectAccessInput {
  projectId: string;
  userId: string;
  userRole?: string | null;
  teamMode: boolean;
}

const DEFAULT_MAX_CHARS = 6000;
const SIBLING_LIMIT = 5;
const BRIEF_CAP = 1200;
const FALLBACK_WORDS = 60;
const DECISIONS_SHOWN = 3;

/** Exported so a fake adapter can answer by exact statement (see tests). */
export const PROJECT_CONTEXT_SQL = {
  project: 'SELECT id, name, description, project_goal, user_id FROM projects WHERE id = ?',
  membership: 'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
  userRole: 'SELECT role FROM users WHERE id = ?',
  matter: 'SELECT id, title, matter_brief, updated_at FROM legal_research_sessions WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1',
  engagement: 'SELECT id, title, client_name, engagement_type, status, engagement_brief, updated_at FROM engagements WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1',
  siblings: `SELECT id, title, module_id, summary, updated_at FROM sessions WHERE project_id = ? ORDER BY updated_at DESC LIMIT ${SIBLING_LIMIT}`,
  siblingsExcluding: `SELECT id, title, module_id, summary, updated_at FROM sessions WHERE project_id = ? AND id <> ? ORDER BY updated_at DESC LIMIT ${SIBLING_LIMIT}`,
  /** Latest snapshot per session; `IN (…)` is filled with one placeholder per id. */
  latestSnapshots: 'SELECT DISTINCT ON (session_id) session_id, key_decisions FROM session_snapshots WHERE session_id IN (%IN%) ORDER BY session_id, created_at DESC',
  /** Last assistant message per session; `IN (…)` as above. */
  lastAnswers: "SELECT DISTINCT ON (session_id) session_id, content FROM messages WHERE session_id IN (%IN%) AND role = 'assistant' ORDER BY session_id, created_at DESC",
} as const;

interface ProjectRow { id: string; name: string; description: string | null; project_goal: string | null; user_id: string | null }
interface MatterRow { id: string; title: string | null; matter_brief: string | null; updated_at: unknown }
interface EngagementRow { id: string; title: string | null; client_name: string | null; engagement_type: string | null; status: string | null; engagement_brief: string | null; updated_at: unknown }
interface SiblingRow { id: string; title: string | null; module_id: string | null; summary: string | null; updated_at: unknown }
interface SnapshotRow { session_id: string; key_decisions: string | null }
interface AnswerRow { session_id: string; content: string | null }

function inList(sql: string, n: number): string {
  return sql.replace('%IN%', Array.from({ length: n }, () => '?').join(', '));
}

const EMPTY: Omit<ProjectContextResult, 'denied'> = { text: '', chars: 0, sessions: 0, hasMatter: false, hasEngagement: false };

/**
 * Who may read a project. Mirrors routes/projects.ts: in team mode a
 * non-admin must be a member (project_members) or the project's owner
 * (projects.user_id); solo mode only asks that the project exists.
 */
export async function resolveProjectAccess(db: DatabaseAdapter, input: ProjectAccessInput): Promise<ProjectAccess> {
  const project = await db.get<ProjectRow>(PROJECT_CONTEXT_SQL.project, input.projectId);
  if (!project) return 'not_found';
  if (!input.teamMode) return 'ok';
  let role = input.userRole ?? null;
  if (role === null) {
    const row = await db.get<{ role: string | null }>(PROJECT_CONTEXT_SQL.userRole, input.userId);
    role = row?.role ?? null;
  }
  if (role === 'admin') return 'ok';
  if (project.user_id && project.user_id === input.userId) return 'ok';
  const member = await db.get(PROJECT_CONTEXT_SQL.membership, input.projectId, input.userId);
  return member ? 'ok' : 'forbidden';
}

function asDateLabel(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value ?? ''));
  if (Number.isNaN(d.getTime())) return String(value ?? '').slice(0, 10) || 'undated';
  return d.toISOString().slice(0, 10);
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function firstWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(' ') + (words.length > n ? '…' : '');
}

function parseObject(raw: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseStringList(raw: unknown): string[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string' ? (v as { text: string }).text : ''))
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** "- key: value" lines from a JSON object; '' when there is nothing to say. */
function renderKeyValues(raw: unknown, cap: number): string {
  const obj = parseObject(raw);
  if (!obj) return typeof raw === 'string' && raw.trim() && raw.trim() !== '{}' ? clip(raw, cap) : '';
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === '') continue;
    const text = typeof value === 'string' ? value : Array.isArray(value) ? value.map(String).join('; ') : JSON.stringify(value);
    if (!text.trim()) continue;
    lines.push(`- ${key}: ${text.trim().replace(/\s*\n\s*/g, ' ')}`);
  }
  return lines.length ? clip(lines.join('\n'), cap) : '';
}

function renderProject(p: ProjectRow): string {
  const lines = ['## PROJECT', `Name: ${(p.name ?? '').trim() || p.id}`];
  if (p.description?.trim()) lines.push(`Description: ${p.description.trim()}`);
  if (p.project_goal?.trim()) lines.push(`Goal: ${p.project_goal.trim()}`);
  return lines.join('\n');
}

function renderMatter(m: MatterRow): string {
  const body = renderKeyValues(m.matter_brief, BRIEF_CAP);
  if (!body) return '';
  const head = m.title?.trim() ? `### Matter brief — ${m.title.trim()}` : '### Matter brief';
  return `${head}\n${body}`;
}

function renderEngagement(e: EngagementRow): string {
  const lines = ['### Engagement'];
  if (e.title?.trim()) lines.push(`Title: ${e.title.trim()}`);
  if (e.client_name?.trim()) lines.push(`Client: ${e.client_name.trim()}`);
  const meta = [e.engagement_type?.trim() ? `type ${e.engagement_type.trim()}` : '', e.status?.trim() ? `status ${e.status.trim()}` : ''].filter(Boolean);
  if (meta.length) lines.push(`Engagement: ${meta.join(', ')}`);
  const brief = renderKeyValues(e.engagement_brief, BRIEF_CAP);
  if (brief) lines.push('Brief:', brief);
  return lines.join('\n');
}

function renderSibling(s: SiblingRow, snapshot: SnapshotRow | undefined, lastAnswer: AnswerRow | undefined): string | null {
  const title = (s.title ?? '').trim() || 'Untitled';
  const module = (s.module_id ?? '').trim() || 'unknown';
  let conclusion: string;
  if (s.summary?.trim()) {
    conclusion = s.summary.trim().replace(/\s*\n\s*/g, ' ');
  } else if (lastAnswer?.content?.trim()) {
    conclusion = `${firstWords(lastAnswer.content, FALLBACK_WORDS)} (no conclusion yet)`;
  } else {
    return null; // nothing was ever said in it — no line
  }
  const lines = [`- ${asDateLabel(s.updated_at)} ${title} (${module}): ${conclusion}`];
  const decisions = snapshot ? parseStringList(snapshot.key_decisions).slice(0, DECISIONS_SHOWN) : [];
  if (decisions.length) lines.push(`  decisions: ${decisions.join('; ')}`);
  return lines.join('\n');
}

/**
 * The project as the model should see it — see the file header for the
 * order. Never throws: on any error the result is empty (denied: false) and
 * only the project id is logged.
 */
export async function buildProjectContext(db: DatabaseAdapter, input: ProjectContextInput): Promise<ProjectContextResult> {
  const projectId = (input.projectId ?? '').trim();
  const maxChars = Math.max(200, input.maxChars ?? DEFAULT_MAX_CHARS);
  if (!projectId) return { ...EMPTY, denied: false };

  try {
    const project = await db.get<ProjectRow>(PROJECT_CONTEXT_SQL.project, projectId);
    if (!project) return { ...EMPTY, denied: input.teamMode };

    if (input.teamMode) {
      let role = input.userRole ?? null;
      if (role === null) {
        const row = await db.get<{ role: string | null }>(PROJECT_CONTEXT_SQL.userRole, input.userId);
        role = row?.role ?? null;
      }
      const owner = !!project.user_id && project.user_id === input.userId;
      if (role !== 'admin' && !owner) {
        const member = await db.get(PROJECT_CONTEXT_SQL.membership, projectId, input.userId);
        if (!member) return { ...EMPTY, denied: true };
      }
    }

    const matter = await db.get<MatterRow>(PROJECT_CONTEXT_SQL.matter, projectId);
    const engagement = await db.get<EngagementRow>(PROJECT_CONTEXT_SQL.engagement, projectId);
    const current = input.currentSessionId?.trim() || null;
    const siblings = current
      ? await db.all<SiblingRow>(PROJECT_CONTEXT_SQL.siblingsExcluding, projectId, current)
      : await db.all<SiblingRow>(PROJECT_CONTEXT_SQL.siblings, projectId);

    const snapshots = new Map<string, SnapshotRow>();
    const answers = new Map<string, AnswerRow>();
    if (siblings.length > 0) {
      const ids = siblings.map((s) => s.id);
      for (const row of await db.all<SnapshotRow>(inList(PROJECT_CONTEXT_SQL.latestSnapshots, ids.length), ...ids)) {
        snapshots.set(row.session_id, row);
      }
      const unconcluded = siblings.filter((s) => !s.summary?.trim()).map((s) => s.id);
      if (unconcluded.length > 0) {
        for (const row of await db.all<AnswerRow>(inList(PROJECT_CONTEXT_SQL.lastAnswers, unconcluded.length), ...unconcluded)) {
          answers.set(row.session_id, row);
        }
      }
    }

    const sections: string[] = [renderProject(project)];
    const matterText = matter ? renderMatter(matter) : '';
    if (matterText) sections.push(matterText);
    const engagementText = engagement ? renderEngagement(engagement) : '';
    if (engagementText) sections.push(engagementText);

    const siblingLines = siblings
      .map((s) => renderSibling(s, snapshots.get(s.id), answers.get(s.id)))
      .filter((l): l is string => l !== null);
    if (siblingLines.length > 0) sections.push(['### Earlier sessions in this project', ...siblingLines].join('\n'));

    // Cap in order: a section that does not fit is cut and nothing after it is rendered.
    let text = '';
    for (const section of sections) {
      const candidate = text ? `${text}\n\n${section}` : section;
      if (candidate.length <= maxChars) { text = candidate; continue; }
      const room = maxChars - (text ? text.length + 2 : 0);
      if (room > 40) text = text ? `${text}\n\n${clip(section, room)}` : clip(section, maxChars);
      break;
    }

    return {
      text,
      chars: text.length,
      sessions: siblingLines.length,
      hasMatter: matterText.length > 0,
      hasEngagement: engagementText.length > 0,
      denied: false,
    };
  } catch {
    console.warn(`[project-context] could not build the project layer (non-fatal) for project ${projectId}`);
    return { ...EMPTY, denied: false };
  }
}
