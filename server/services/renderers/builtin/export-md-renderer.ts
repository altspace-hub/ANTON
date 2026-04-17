// ── Built-in renderer: Markdown passthrough ──────────────────────────────
//
// The Markdown output is the canonical source. This renderer writes it to
// disk as an .md file for download. Works on any content type.

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

export const render: RenderFn = async (payload, context): Promise<RenderResult> => {
  const markdown = context.markdown ?? '';
  if (!markdown.trim()) {
    throw new Error('No markdown content available for this session');
  }
  const filename = buildFilename('{module_id}-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'export-md',
    file_type: 'md',
  });
  const saved = await saveArtifact({ sessionId: context.session.id, filename, content: markdown });
  return {
    file_path: saved.rel_path,
    file_type: 'md',
    mime_type: 'text/markdown; charset=utf-8',
    file_size_bytes: saved.size_bytes,
    metadata: { content_type: payload.content_type },
  };
};
