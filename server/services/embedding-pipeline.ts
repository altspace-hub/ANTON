/**
 * Embedding Pipeline — background embedding of content at startup and on new content.
 *
 * Runs after server startup to ensure all content types have embeddings:
 *   1. Module descriptions (from area JSON files)
 *   2. Knowledge atoms (backfill existing without embeddings)
 *   3. Checkpoint decisions (backfill existing without embeddings)
 *
 * All operations are non-blocking — logged but never crash the server.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { embedAndStore } from './hybrid-search.js';
import { getEmbeddingAdapter } from './embedding-adapter.js';

// ── Module embedding (run at startup) ──────────────────────────────────────

export async function embedModuleDescriptions(db: DatabaseAdapter): Promise<void> {
  try {
    const { getAreas } = await import('./module-loader.js');
    const areas = await getAreas();

    const adapter = getEmbeddingAdapter();
    let embedded = 0;
    let skipped = 0;

    for (const area of areas) {
      for (const mod of area.modules) {
        const contentId = mod.id;
        // Check if already embedded with this model
        const exists = await db.get(
          "SELECT 1 FROM embeddings WHERE content_type = 'module' AND content_id = ? AND embedding_model = ? LIMIT 1"
        , contentId, adapter.model);

        if (exists) { skipped++; continue; }

        const text = [
          `Module: ${mod.label || mod.id}`,
          mod.description ? `Description: ${mod.description}` : '',
          `Area: ${area.name || area.id}`,
          mod.tags?.length ? `Tags: ${mod.tags.join(', ')}` : '',
        ].filter(Boolean).join('\n');

        await embedAndStore(db, {
          contentType: 'module',
          contentId,
          contentText: text,
          metadata: { areaId: area.id, label: mod.label, tags: mod.tags },
        });
        embedded++;
      }
    }

    if (embedded > 0) {
      console.log(`[embedding-pipeline] Embedded ${embedded} module descriptions (skipped ${skipped} up-to-date)`);
    }
  } catch (err) {
    console.warn('[embedding-pipeline] Module embedding skipped:', err instanceof Error ? err.message : err);
  }
}

// ── Backfill knowledge atoms ──────────────────────────────────────────────

export async function backfillKnowledgeAtoms(db: DatabaseAdapter, batchSize = 50): Promise<void> {
  try {
    const adapter = getEmbeddingAdapter();

    // Find atoms without embeddings in the unified table
    const atoms = await db.all(`
      SELECT id, content, category, atom_type, source_area_id, source_module_id,
             source_workflow_id, confidence, created_at, superseded_by
      FROM knowledge_atoms
      WHERE is_active = 1
        AND id NOT IN (
          SELECT content_id FROM embeddings
          WHERE content_type = 'knowledge_atom' AND embedding_model = ?
        )
      LIMIT ?
    `, adapter.model, batchSize) as Array<{
      id: string; content: string; category: string; atom_type: string;
      source_area_id: string | null; source_module_id: string | null;
      source_workflow_id: string; confidence: number;
      created_at: string; superseded_by: string | null;
    }>;

    if (atoms.length === 0) return;

    console.log(`[embedding-pipeline] Backfilling ${atoms.length} knowledge atoms...`);

    for (const atom of atoms) {
      await embedAndStore(db, {
        contentType: 'knowledge_atom',
        contentId: atom.id,
        contentText: atom.content,
        metadata: {
          category: atom.category,
          atom_type: atom.atom_type,
          source_area_id: atom.source_area_id,
          source_module_id: atom.source_module_id,
          source_workflow_id: atom.source_workflow_id,
          confidence: atom.confidence,
          created_at: atom.created_at,
          is_superseded: atom.superseded_by ? 1 : 0,
        },
      }).catch(err => {
        console.warn('[embedding-pipeline] Atom backfill failed for', atom.id, err instanceof Error ? err.message : err);
      });
    }

    console.log(`[embedding-pipeline] Backfilled ${atoms.length} knowledge atoms`);
  } catch (err) {
    console.warn('[embedding-pipeline] Knowledge atom backfill error:', err instanceof Error ? err.message : err);
  }
}

// ── Backfill checkpoint decisions ─────────────────────────────────────────

export async function backfillCheckpoints(db: DatabaseAdapter, batchSize = 50): Promise<void> {
  try {
    const adapter = getEmbeddingAdapter();

    const decisions = await db.all(`
      SELECT id, human_decision, human_reasoning, context_snapshot, workflow_id, step_index, decided_by
      FROM checkpoint_decisions
      WHERE id NOT IN (
        SELECT content_id FROM embeddings
        WHERE content_type = 'checkpoint' AND embedding_model = ?
      )
      LIMIT ?
    `, adapter.model, batchSize) as Array<{
      id: string; human_decision: string; human_reasoning: string | null;
      context_snapshot: string | null; workflow_id: string; step_index: number; decided_by: string;
    }>;

    if (decisions.length === 0) return;

    console.log(`[embedding-pipeline] Backfilling ${decisions.length} checkpoint decisions...`);

    for (const dec of decisions) {
      const text = [
        `Decision: ${dec.human_decision}`,
        dec.human_reasoning ? `Reasoning: ${dec.human_reasoning}` : '',
        dec.context_snapshot ? `Context: ${dec.context_snapshot.slice(0, 500)}` : '',
      ].filter(Boolean).join('\n');

      await embedAndStore(db, {
        contentType: 'checkpoint',
        contentId: dec.id,
        contentText: text,
        metadata: {
          workflowId: dec.workflow_id,
          stepIndex: dec.step_index,
          decidedBy: dec.decided_by,
        },
      }).catch(err => {
        console.warn('[embedding-pipeline] Checkpoint backfill failed for', dec.id, err instanceof Error ? err.message : err);
      });
    }

    console.log(`[embedding-pipeline] Backfilled ${decisions.length} checkpoint decisions`);
  } catch (err) {
    console.warn('[embedding-pipeline] Checkpoint backfill error:', err instanceof Error ? err.message : err);
  }
}

// ── Run full pipeline ─────────────────────────────────────────────────────

export async function runEmbeddingPipeline(db: DatabaseAdapter): Promise<void> {
  // Only run if an embedding provider is configured
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasVoyage = !!process.env.VOYAGE_API_KEY;
  const hasOllama = !!process.env.OLLAMA_BASE_URL || !!process.env.OLLAMA_EMBEDDING_MODEL;

  if (!hasOpenAI && !hasVoyage && !hasOllama) {
    console.log('[embedding-pipeline] No embedding provider configured (OPENAI_API_KEY, VOYAGE_API_KEY, or OLLAMA_BASE_URL). Skipping.');
    return;
  }

  // Probe once before running any batch — catch invalid/expired keys early
  // rather than spamming dozens of identical 401 errors to the console.
  try {
    const adapter = getEmbeddingAdapter();
    const probe = await adapter.embed('probe');
    if (probe.every(v => v === 0)) {
      console.warn('[embedding-pipeline] Embedding probe returned zero vector — API key invalid or missing. Skipping pipeline.');
      return;
    }
  } catch (err) {
    console.warn('[embedding-pipeline] Embedding probe failed — skipping pipeline:', err instanceof Error ? err.message : err);
    return;
  }

  await embedModuleDescriptions(db);
  await backfillKnowledgeAtoms(db);
  await backfillCheckpoints(db);
}
