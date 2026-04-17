// ── Built-in renderer: DOCX (wraps existing export-docx.ts) ──────────────
//
// Preserves the exact behaviour of the existing DOCX export (branding,
// typography, auto-numbering). Metadata is derived from the session +
// structured payload envelope.

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { generateDocx } from '../../export-docx.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

export const render: RenderFn = async (payload, context): Promise<RenderResult> => {
  const markdown = context.markdown ?? '';
  if (!markdown.trim()) throw new Error('No markdown content available for DOCX export');

  // Brand config: the existing export-docx uses a BrandConfig shape that
  // overlaps with our BrandTemplate. The extra-field pass-through keeps the
  // legacy contract intact.
  const brandConfig = context.brand_template
    ? {
        primaryColor: context.brand_template.primary_color,
        accentColor: context.brand_template.accent_color,
        fontFamily: context.brand_template.font_family,
        logoPath: context.brand_template.logo_path,
        headerText: context.brand_template.header_text,
        footerText: context.brand_template.footer_text,
        ...(context.brand_template.extra ?? {}),
      } as never
    : undefined;

  const buffer = await generateDocx(markdown, {
    title: context.session.title,
    moduleId: context.session.module_id,
    sessionId: context.session.id,
    model: payload.model,
  }, brandConfig);

  const filename = buildFilename('{module_id}-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'export-docx',
    file_type: 'docx',
  });
  const saved = await saveArtifact({ sessionId: context.session.id, filename, content: buffer });
  return {
    file_path: saved.rel_path,
    file_type: 'docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file_size_bytes: saved.size_bytes,
    metadata: { branded: !!brandConfig },
  };
};
