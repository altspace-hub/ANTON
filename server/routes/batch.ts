import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import type { DatabaseAdapter } from '../db/database.js';

import { callChat, mapModelToProvider } from '../services/provider-router.js';

export async function createBatchRoutes(anthropic?: Anthropic, db?: DatabaseAdapter) {
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
      const entriesRaw: Array<{ label: string; category: string } | null> = [];
      for (const id of knowledgeLibraryIds) {
        entriesRaw.push(await db.get('SELECT label, category FROM knowledge_library WHERE id=?', id) as { label: string; category: string } | null);
      }
      const entries = entriesRaw.filter((e): e is { label: string; category: string } => e !== null);
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
        const result = await callChat({
          model: mapModelToProvider(model),
          maxTokens,
          system: resolvedSysPrompt,
          messages: [{ role: 'user', content: message }],
        });

        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        successCount++;

        send({
          type: 'result',
          rowIndex: i,
          output: result.text,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
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

  /**
   * POST /api/batch/anthropic-batch — MODEL-04
   * Submits a bulk job to the Anthropic Message Batches API (50% cost reduction vs. real-time).
   * Designed for jobs with ≥20 rows where results can wait up to 24 hours.
   *
   * Body: { rows, headers, template, systemPrompt, model }
   * Returns: { batchId, requestCount, estimatedSavings }
   */
  router.post('/anthropic-batch', async (req, res) => {
    if (!anthropic) {
      return res.status(503).json({ error: 'AI service not configured' });
    }

    const {
      rows,
      headers: colHeaders,
      template,
      systemPrompt,
      model = 'claude-haiku-4-5-20251001',
      maxTokens = 2048,
    } = req.body as {
      rows: string[][];
      headers: string[];
      template: string;
      systemPrompt?: string;
      model?: string;
      maxTokens?: number;
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required and must not be empty' });
    }
    if (!template || typeof template !== 'string') {
      return res.status(400).json({ error: 'template is required' });
    }
    if (rows.length > 10000) {
      return res.status(400).json({ error: 'Maximum 10,000 rows per batch' });
    }

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sysPrompt = systemPrompt?.trim() ||
      'You are a Financial Crime Prevention compliance expert. Provide precise, professional analysis.';

    // Build Anthropic Batch requests
    const requests: Anthropic.Messages.MessageCreateParamsNonStreaming[] = rows.map((row, i) => {
      let message = template;
      (colHeaders || []).forEach((header, idx) => {
        const pattern = new RegExp(`\\{\\{${escapeRegex(header)}\\}\\}`, 'g');
        message = message.replace(pattern, row[idx] ?? '');
      });
      return {
        model,
        max_tokens: maxTokens,
        system: sysPrompt,
        messages: [{ role: 'user' as const, content: message }],
      } as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming;
    });

    // Anthropic Batch API expects custom_id per request
    const batchRequests = requests.map((params, i) => ({
      custom_id: `row-${i}`,
      params,
    }));

    try {
      const batch = await (anthropic.messages.batches as unknown as {
        create: (params: { requests: typeof batchRequests }) => Promise<{ id: string; request_counts: { processing: number } }>;
      }).create({ requests: batchRequests });

      res.json({
        batchId: batch.id,
        requestCount: rows.length,
        model,
        status: 'submitted',
        // Batch API is ~50% cheaper: approximate savings vs. real-time
        estimatedSavingsNote: 'Anthropic Batch API provides ~50% cost reduction vs. real-time messaging.',
        pollUrl: `/api/batch/anthropic-batch/${batch.id}`,
        resultsUrl: `/api/batch/anthropic-batch/${batch.id}/results`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Batch submission failed';
      res.status(502).json({ error: message });
    }
  });

  /**
   * GET /api/batch/anthropic-batch/:batchId — poll batch status
   */
  router.get('/anthropic-batch/:batchId', async (req, res) => {
    if (!anthropic) return res.status(503).json({ error: 'AI service not configured' });

    const { batchId } = req.params;
    if (!/^msgbatch_/.test(batchId)) {
      return res.status(400).json({ error: 'Invalid batch ID format' });
    }

    try {
      const batch = await (anthropic.messages.batches as unknown as {
        retrieve: (id: string) => Promise<Record<string, unknown>>;
      }).retrieve(batchId);
      res.json(batch);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to retrieve batch' });
    }
  });

  /**
   * GET /api/batch/anthropic-batch/:batchId/results — stream completed results
   * Returns JSONL (one JSON object per line) when batch is complete.
   */
  router.get('/anthropic-batch/:batchId/results', async (req, res) => {
    if (!anthropic) return res.status(503).json({ error: 'AI service not configured' });

    const { batchId } = req.params;
    if (!/^msgbatch_/.test(batchId)) {
      return res.status(400).json({ error: 'Invalid batch ID format' });
    }

    try {
      const batchAPI = anthropic.messages.batches as unknown as {
        retrieve: (id: string) => Promise<{ processing_status: string }>;
        results: (id: string) => AsyncIterable<{ custom_id: string; result: unknown }>;
      };

      const batch = await batchAPI.retrieve(batchId);
      if (batch.processing_status !== 'ended') {
        return res.status(202).json({
          status: batch.processing_status,
          message: 'Batch not yet complete — poll /api/batch/anthropic-batch/:id for status',
        });
      }

      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      for await (const result of batchAPI.results(batchId)) {
        res.write(JSON.stringify(result) + '\n');
      }
      res.end();
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to retrieve results' });
    }
  });

  return router;
}
