// ── Renderer: Mermaid flowchart (for process_map content) ─────────────────
//
// Emits a Mermaid flowchart source file (.mmd). The Transform Panel UI
// renders it live via mermaid.js in the browser; downloaded .mmd pastes
// directly into GitHub, VS Code, Notion, etc.
//
// Server-side SVG rendering was deliberately deferred — every Mermaid
// engine that works in Node requires either a headless browser
// (@mermaid-js/mermaid-cli) or JSDOM workarounds. The source file is
// the portable, reviewable, diff-able artifact; the SVG is one "paste
// into mmdc --input foo.mmd" command away for anyone who wants it.

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

interface ProcessStep {
  id: string;
  label: string;
  kind?: 'start' | 'end' | 'action' | 'decision' | 'system' | 'document' | 'subprocess';
  actor_id?: string;
  next?: Array<{ to: string; label?: string; condition?: string }>;
}

interface ProcessMapBody {
  title?: string;
  steps: ProcessStep[];
  swimlanes?: Array<{ id: string; label: string; actor_ids: string[] }>;
  actors?: Array<{ id: string; name: string; role?: string; type?: string }>;
}

export const render: RenderFn<ProcessMapBody> = async (payload, context): Promise<RenderResult> => {
  if (payload.content_type !== 'process_map') {
    throw new Error(`mermaid-flowchart expects process_map, got ${payload.content_type}`);
  }
  const body = payload.body;
  if (!body?.steps?.length) throw new Error('Process map has no steps');

  const mermaid = buildMermaid(body);
  const filename = buildFilename('{module_id}-flowchart-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'mermaid-flowchart',
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
      node_count: body.steps.length,
      edge_count: body.steps.reduce((acc, s) => acc + (s.next?.length ?? 0), 0),
      title: body.title ?? context.session.title,
    },
    validation: { valid: true },
  };
};

function buildMermaid(body: ProcessMapBody): string {
  const lines: string[] = [];
  const title = (body.title ?? '').replace(/\n/g, ' ');
  if (title) lines.push(`---`, `title: ${escapeFrontmatter(title)}`, `---`);
  lines.push('flowchart TD');

  // Node declarations — pick a shape per step.kind
  for (const step of body.steps) {
    const safeId = sanitiseId(step.id);
    const text = escapeMermaidText(step.label);
    const shape = nodeShape(step.kind, text);
    lines.push(`  ${safeId}${shape}`);
  }

  // Edges
  for (const step of body.steps) {
    if (!step.next?.length) continue;
    const from = sanitiseId(step.id);
    for (const edge of step.next) {
      const to = sanitiseId(edge.to);
      if (edge.label) {
        lines.push(`  ${from} -->|${escapeMermaidText(edge.label)}| ${to}`);
      } else {
        lines.push(`  ${from} --> ${to}`);
      }
    }
  }

  // Optional class styling by step.kind
  const classBuckets: Record<string, string[]> = {};
  for (const step of body.steps) {
    if (!step.kind) continue;
    (classBuckets[step.kind] ??= []).push(sanitiseId(step.id));
  }
  for (const [kind, ids] of Object.entries(classBuckets)) {
    if (!ids.length) continue;
    lines.push(`  class ${ids.join(',')} ${kind}`);
  }
  // Minimal styling — user's mermaid theme in the UI takes over visually
  lines.push(`  classDef start    fill:#E8F5E9,stroke:#1B5E20,stroke-width:2px`);
  lines.push(`  classDef end      fill:#FFEBEE,stroke:#B71C1C,stroke-width:2px`);
  lines.push(`  classDef decision fill:#FFF8E1,stroke:#F57F17`);
  lines.push(`  classDef system   fill:#E3F2FD,stroke:#0D47A1`);
  lines.push(`  classDef document fill:#F3E5F5,stroke:#4A148C`);

  return lines.join('\n') + '\n';
}

function nodeShape(kind: ProcessStep['kind'] | undefined, text: string): string {
  // Mermaid shapes:
  //   (...)     round    → action
  //   ([...])   stadium  → start / end
  //   {...}     rhombus  → decision
  //   [[...]]   subroutine → subprocess
  //   [(...)]   cylinder  → system / db
  //   [/...\]   trapezoid → document / artefact (parallelogram fallback)
  switch (kind) {
    case 'start':
    case 'end':        return `([${text}])`;
    case 'decision':   return `{${text}}`;
    case 'subprocess': return `[[${text}]]`;
    case 'system':     return `[(${text})]`;
    case 'document':   return `[/${text}/]`;
    case 'action':
    default:           return `[${text}]`;
  }
}

function sanitiseId(id: string): string {
  // Mermaid ids: alphanumerics + underscore only.
  return id.replace(/[^A-Za-z0-9_]/g, '_');
}

function escapeMermaidText(s: string): string {
  return String(s).replace(/"/g, '#quot;').replace(/\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function escapeFrontmatter(s: string): string {
  return s.replace(/"/g, '\\"');
}
