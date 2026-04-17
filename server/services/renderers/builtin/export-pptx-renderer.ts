// ── Built-in renderer: PPTX (wraps existing export-pptx.ts) ──────────────

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { generatePptx } from '../../export-pptx.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

export const render: RenderFn = async (_payload, context): Promise<RenderResult> => {
  const markdown = context.markdown ?? '';
  if (!markdown.trim()) throw new Error('No markdown content available for PPTX export');

  // generatePptx signature is lighter (title + author only)
  const buffer = await generatePptx(markdown, {
    title: context.session.title,
  } as never);

  const filename = buildFilename('{module_id}-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'export-pptx',
    file_type: 'pptx',
  });
  const saved = await saveArtifact({ sessionId: context.session.id, filename, content: buffer });
  return {
    file_path: saved.rel_path,
    file_type: 'pptx',
    mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    file_size_bytes: saved.size_bytes,
    metadata: {},
  };
};
