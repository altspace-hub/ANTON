// ── Renderer: Mermaid Sequence (for process_map with named actors) ───────

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

interface Actor { id: string; name: string; role?: string; type?: string }
interface Step {
  id: string;
  label: string;
  actor_id?: string;
  kind?: 'start' | 'end' | 'action' | 'decision' | 'system' | 'document' | 'subprocess';
  next?: Array<{ to: string; label?: string }>;
}
interface ProcessMapBody {
  title?: string;
  actors?: Actor[];
  steps: Step[];
}

export const render: RenderFn<ProcessMapBody> = async (payload, context): Promise<RenderResult> => {
  if (payload.content_type !== 'process_map') {
    throw new Error(`mermaid-sequence expects process_map, got ${payload.content_type}`);
  }
  const body = payload.body;
  if (!body?.steps?.length || !body.actors?.length) {
    throw new Error('Process map needs actors + steps to render as sequence');
  }

  const mermaid = buildSequence(body);
  const filename = buildFilename('{module_id}-sequence-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'mermaid-sequence',
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
      actor_count: body.actors.length,
      step_count: body.steps.length,
      title: body.title ?? context.session.title,
    },
    validation: { valid: true },
  };
};

function buildSequence(body: ProcessMapBody): string {
  const lines: string[] = [];
  const title = (body.title ?? '').replace(/\n/g, ' ');
  if (title) lines.push('---', `title: ${title.replace(/"/g, '\\"')}`, '---');
  lines.push('sequenceDiagram');

  // Participant declarations — keep the given order
  const byId = new Map<string, Actor>();
  for (const a of body.actors ?? []) byId.set(a.id, a);
  for (const a of body.actors ?? []) {
    const idSafe = sanitise(a.id);
    const label = escapeSeqText(a.name + (a.role ? ` (${a.role})` : ''));
    lines.push(`    participant ${idSafe} as ${label}`);
  }

  // For each step with outgoing edges, emit a sender→receiver message
  // keyed on actor_id of the source and actor_id of the target step.
  const stepById = new Map<string, Step>();
  for (const s of body.steps) stepById.set(s.id, s);

  for (const s of body.steps) {
    const fromActor = s.actor_id ? sanitise(s.actor_id) : null;
    for (const edge of s.next ?? []) {
      const target = stepById.get(edge.to);
      if (!target) continue;
      const toActor = target.actor_id ? sanitise(target.actor_id) : null;
      if (!fromActor || !toActor) continue;
      const label = escapeSeqText(edge.label ? `${edge.label}: ${target.label}` : target.label);
      const arrow = s.kind === 'decision' ? '-->>+' : '->>+';
      lines.push(`    ${fromActor}${arrow}${toActor}: ${label}`);
    }
  }

  return lines.join('\n') + '\n';
}

function sanitise(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_');
}

function escapeSeqText(s: string): string {
  // Strip Mermaid directives + HTML tags as defense-in-depth against
  // user-controlled step labels overriding render config or injecting markup.
  return String(s)
    .replace(/%%\{[^}]*\}%%/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n/g, ' ')
    .replace(/:/g, '-')
    .trim();
}
