// ── Renderer: Mermaid Gantt (for plan_document content) ─────────────────

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

interface Milestone {
  id: string;
  title: string;
  workstream_id?: string;
  start_date: string;                 // YYYY-MM-DD
  end_date: string;
  owner?: string;
  status?: 'not_started' | 'in_progress' | 'at_risk' | 'blocked' | 'done';
  progress?: number;
  dependencies?: string[];
  is_critical_path?: boolean;
}

interface PlanBody {
  title?: string;
  start_date?: string;
  end_date?: string;
  workstreams?: Array<{ id: string; label: string; owner?: string }>;
  milestones: Milestone[];
}

export const render: RenderFn<PlanBody> = async (payload, context): Promise<RenderResult> => {
  if (payload.content_type !== 'plan_document') {
    throw new Error(`mermaid-gantt expects plan_document, got ${payload.content_type}`);
  }
  const body = payload.body;
  if (!body?.milestones?.length) throw new Error('Plan has no milestones');

  const mermaid = buildGantt(body);
  const filename = buildFilename('{module_id}-gantt-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'mermaid-gantt',
    file_type: 'mmd',
  });
  const saved = await saveArtifact({ sessionId: context.session.id, filename, content: mermaid });

  return {
    file_path: saved.rel_path,
    file_type: 'mmd',
    mime_type: 'text/vnd.mermaid',
    file_size_bytes: saved.size_bytes,
    metadata: {
      mermaid_syntax: mermaid,
      milestone_count: body.milestones.length,
      title: body.title ?? context.session.title,
    },
    validation: { valid: true },
  };
};

function buildGantt(body: PlanBody): string {
  const lines: string[] = [];
  lines.push('gantt');
  lines.push(`    title ${escapeLine(body.title ?? 'Project Plan')}`);
  lines.push('    dateFormat  YYYY-MM-DD');
  lines.push('    axisFormat  %Y-%m');

  // Group milestones by workstream. Fallback single section when no groups.
  const workstreamMap = new Map<string, string>();
  for (const ws of body.workstreams ?? []) workstreamMap.set(ws.id, ws.label);

  const grouped = new Map<string, Milestone[]>();
  for (const m of body.milestones) {
    const key = m.workstream_id ?? '_default';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  const idByMilestone = new Map<string, string>();
  for (const m of body.milestones) idByMilestone.set(m.id, sanitiseTaskId(m.id));

  let firstSection = true;
  for (const [wsId, milestones] of grouped.entries()) {
    const sectionLabel = wsId === '_default' ? 'Milestones' : (workstreamMap.get(wsId) ?? wsId);
    lines.push(`    section ${escapeLine(sectionLabel)}`);
    firstSection = false;
    for (const m of milestones) {
      const tag = buildTag(m);
      const taskId = idByMilestone.get(m.id)!;
      const label = escapeLine(m.title + (m.owner ? ` (${m.owner})` : ''));
      // Prefer dependency chain if declared; otherwise explicit start_date.
      const deps = (m.dependencies ?? []).map(d => idByMilestone.get(d)).filter(Boolean).join(',');
      if (deps) {
        lines.push(`    ${label} :${tag}${taskId}, after ${deps}, ${duration(m)}`);
      } else {
        lines.push(`    ${label} :${tag}${taskId}, ${m.start_date}, ${m.end_date}`);
      }
    }
  }
  void firstSection;
  return lines.join('\n') + '\n';
}

function buildTag(m: Milestone): string {
  const parts: string[] = [];
  if (m.is_critical_path) parts.push('crit');
  if (m.status === 'done') parts.push('done');
  else if (m.status === 'in_progress') parts.push('active');
  // Leave at_risk / blocked as default; Mermaid lacks a first-class state for them.
  return parts.length ? parts.join(', ') + ', ' : '';
}

function duration(m: Milestone): string {
  // If both dates are present, use end_date; otherwise compute from start + duration.
  if (m.end_date) return m.end_date;
  return `${m.start_date}`;
}

function sanitiseTaskId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_');
}

function escapeLine(s: string): string {
  return String(s)
    .replace(/%%\{[^}]*\}%%/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/:/g, '-')
    .replace(/\n/g, ' ')
    .trim();
}
