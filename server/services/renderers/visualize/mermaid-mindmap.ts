// ── Renderer: Mermaid Mindmap (for analytic_report hierarchical sections) ─

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

interface Section {
  heading: string;
  level?: number;
  body?: string;
  subsections?: Section[];
}

interface AnalyticBody {
  title?: string;
  subtitle?: string;
  sections: Section[];
  findings?: Array<{ finding: string; severity?: string }>;
  recommendations?: Array<{ recommendation: string; priority?: string }>;
}

export const render: RenderFn<AnalyticBody> = async (payload, context): Promise<RenderResult> => {
  if (payload.content_type !== 'analytic_report') {
    throw new Error(`mermaid-mindmap expects analytic_report, got ${payload.content_type}`);
  }
  const body = payload.body;
  if (!body?.sections?.length) throw new Error('Report has no sections');

  const mermaid = buildMindmap(body, context.session.title);
  const filename = buildFilename('{module_id}-mindmap-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'mermaid-mindmap',
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
      section_count: body.sections.length,
      title: body.title ?? context.session.title,
    },
    validation: { valid: true },
  };
};

function buildMindmap(body: AnalyticBody, fallbackTitle: string): string {
  const root = (body.title ?? fallbackTitle ?? 'Report').replace(/[\(\)\n"]/g, ' ').trim() || 'Report';
  const lines: string[] = ['mindmap', `  root((${root}))`];

  // Top-level sections
  for (const section of body.sections) {
    renderSection(section, 2, lines);
  }

  // Optional branches for findings / recommendations
  if (body.findings?.length) {
    lines.push('    Findings');
    for (const f of body.findings.slice(0, 8)) {
      lines.push(`      ${truncate(f.finding, 70)}`);
    }
  }
  if (body.recommendations?.length) {
    lines.push('    Recommendations');
    for (const r of body.recommendations.slice(0, 8)) {
      lines.push(`      ${truncate(r.recommendation, 70)}`);
    }
  }

  return lines.join('\n') + '\n';
}

function renderSection(section: Section, indentLevel: number, lines: string[]): void {
  const indent = '  '.repeat(indentLevel);
  const heading = truncate(section.heading, 80);
  lines.push(`${indent}${heading}`);
  for (const sub of section.subsections ?? []) {
    renderSection(sub, indentLevel + 1, lines);
  }
}

function truncate(s: string, max: number): string {
  const cleaned = s.replace(/[\(\)\n"]/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + '…';
}
