import { Router } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import type Database from 'better-sqlite3';

export function createBatchRoutes(anthropic?: Anthropic, db?: Database.Database) {
  const router = Router();

  /**
   * POST /api/batch/run
   * Body: { rows: string[][], headers: string[], template: string, systemPrompt: string, model: string }
   * Streams SSE events: progress | result | error | done
   */
  router.post('/run', async (req, res) => {
    if (!anthropic) {
      return res.status(503).json({ error: 'AI service not configured' });
    }

    const {
      rows,
      headers,
      template,
      systemPrompt,
      model = 'claude-haiku-4-5-20251001',
      maxTokens = 2048,
      knowledgeLibraryIds,
    } = req.body as {
      rows: string[][];
      headers: string[];
      template: string;
      systemPrompt?: string;
      model?: string;
      maxTokens?: number;
      knowledgeLibraryIds?: string[];
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required and must not be empty' });
    }
    if (!template || typeof template !== 'string') {
      return res.status(400).json({ error: 'template is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data: unknown) => {
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const sysPrompt =
      systemPrompt?.trim() ||
      'You are a Financial Crime Prevention compliance expert. Provide precise, professional analysis.';

    let resolvedSysPrompt = sysPrompt;
    if (db && knowledgeLibraryIds && knowledgeLibraryIds.length > 0) {
      const entries = knowledgeLibraryIds.map(id =>
        db.prepare('SELECT label, category FROM knowledge_library WHERE id=?').get(id) as { label: string; category: string } | null
      ).filter((e): e is { label: string; category: string } => e !== null);
      if (entries.length > 0) {
        const libraryContext = `## KNOWLEDGE CONTEXT\nThis analysis should draw on the following registered knowledge corpora:\n${entries.map(e => `- ${e.label} (${e.category})`).join('\n')}\nReference these as authoritative sources when forming your response.\n\n`;
        resolvedSysPrompt = libraryContext + resolvedSysPrompt;
      }
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      if (res.destroyed) break;

      send({ type: 'progress', rowIndex: i, total: rows.length });

      // Substitute {{column}} placeholders
      let message = template;
      (headers || []).forEach((header, idx) => {
        const pattern = new RegExp(`\\{\\{${escapeRegex(header)}\\}\\}`, 'g');
        message = message.replace(pattern, rows[i][idx] ?? '');
      });

      try {
        const response = await anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          system: resolvedSysPrompt,
          messages: [{ role: 'user', content: message }],
        });

        const outputText = response.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { type: 'text'; text: string }).text)
          .join('');

        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        successCount++;

        send({
          type: 'result',
          rowIndex: i,
          output: outputText,
          inputTokens,
          outputTokens,
        });
      } catch (err) {
        errorCount++;
        send({
          type: 'error',
          rowIndex: i,
          error: err instanceof Error ? err.message : 'API error',
        });
      }

      // Throttle to avoid TPM limits
      if (i < rows.length - 1 && !res.destroyed) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    send({
      type: 'done',
      total: rows.length,
      successCount,
      errorCount,
      totalInputTokens,
      totalOutputTokens,
    });
    res.end();
  });

  return router;
}
