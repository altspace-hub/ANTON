// ── Built-in renderer: XLSX (wraps existing export-xlsx.ts) ──────────────

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { generateXlsx } from '../../export-xlsx.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

export const render: RenderFn = async (payload, context): Promise<RenderResult> => {
  const markdown = context.markdown ?? '';
  if (!markdown.trim()) throw new Error('No markdown content available for XLSX export');

  const brandConfig = context.brand_template
    ? {
        primaryColor: context.brand_template.primary_color,
        accentColor: context.brand_template.accent_color,
        ...(context.brand_template.extra ?? {}),
      } as never
    : undefined;

  const buffer = await generateXlsx(markdown, {
    title: context.session.title,
    moduleId: context.session.module_id,
    sessionId: context.session.id,
    model: payload.model,
  }, brandConfig);

  const filename = buildFilename('{module_id}-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'export-xlsx',
    file_type: 'xlsx',
  });
  const saved = await saveArtifact({ sessionId: context.session.id, filename, content: buffer });
  return {
    file_path: saved.rel_path,
    file_type: 'xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file_size_bytes: saved.size_bytes,
    metadata: {},
  };
};
