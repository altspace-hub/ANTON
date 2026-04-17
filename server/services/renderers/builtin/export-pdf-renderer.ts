// ── Built-in renderer: PDF (wraps existing export-pdf.ts) ────────────────

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { generatePdf } from '../../export-pdf.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

export const render: RenderFn = async (payload, context): Promise<RenderResult> => {
  const markdown = context.markdown ?? '';
  if (!markdown.trim()) throw new Error('No markdown content available for PDF export');

  const brandConfig = context.brand_template
    ? {
        primaryColor: context.brand_template.primary_color,
        accentColor: context.brand_template.accent_color,
        fontFamily: context.brand_template.font_family,
        logoPath: context.brand_template.logo_path,
        ...(context.brand_template.extra ?? {}),
      } as never
    : undefined;

  const buffer = await generatePdf(markdown, {
    title: context.session.title,
    moduleId: context.session.module_id,
    sessionId: context.session.id,
    model: payload.model,
  }, brandConfig);

  const filename = buildFilename('{module_id}-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'export-pdf',
    file_type: 'pdf',
  });
  const saved = await saveArtifact({ sessionId: context.session.id, filename, content: buffer });
  return {
    file_path: saved.rel_path,
    file_type: 'pdf',
    mime_type: 'application/pdf',
    file_size_bytes: saved.size_bytes,
    metadata: {},
  };
};
