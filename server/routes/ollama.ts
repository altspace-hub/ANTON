/**
 * ollama.ts
 *
 * Ollama Local Model Health Check & Management
 *
 * Purpose: Check if Ollama is running locally, list available models,
 * and provide status information for the UI.
 */

import { Router } from 'express';
import { safeError } from '../lib/error-response.js';

const router = Router();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// ── Health Check ───────────────────────────────────────────────

router.get('/status', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.json({
        available: false,
        error: `Ollama server responded with status ${response.status}`,
        baseUrl: OLLAMA_BASE_URL,
      });
    }

    const data = await response.json();
    const models = data.models || [];

    res.json({
      available: true,
      baseUrl: OLLAMA_BASE_URL,
      modelCount: models.length,
      models: models.map((m: any) => ({
        name: m.name,
        size: m.size,
        modified: m.modified_at,
      })),
    });
  } catch (error) {
    const errorMessage = safeError(error);
    const isTimeout = errorMessage.includes('aborted');

    res.json({
      available: false,
      error: isTimeout
        ? 'Ollama server not responding (timeout after 3s). Is Ollama running?'
        : `Failed to connect to Ollama: ${errorMessage}`,
      baseUrl: OLLAMA_BASE_URL,
      hint: 'Install Ollama from https://ollama.com or start the Ollama service.',
    });
  }
});

// ── List Available Models ──────────────────────────────────────

router.get('/models', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Ollama server error' });
    }

    const data = await response.json();
    const models = data.models || [];

    res.json({
      models: models.map((m: any) => ({
        id: `ollama:${m.name}`,
        name: m.name,
        size: m.size,
        sizeFormatted: formatBytes(m.size),
        modified: m.modified_at,
        digest: m.digest,
      })),
    });
  } catch (error) {
    res.status(503).json({
      error: 'Failed to fetch Ollama models',
      message: safeError(error),
    });
  }
});

// ── Pull Model (Download from Ollama Registry) ────────────────

router.post('/pull', async (req, res) => {
  const { modelName } = req.body;

  if (!modelName) {
    return res.status(400).json({ error: 'Model name required' });
  }

  try {
    // Set SSE headers for streaming pull progress
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok || !response.body) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to start pull' })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
          // Skip invalid JSON
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error) {
    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        error: safeError(error),
      })}\n\n`
    );
    res.end();
  }
});

// ── Delete Model ───────────────────────────────────────────────

router.delete('/models/:modelName', async (req, res) => {
  const { modelName } = req.params;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to delete model' });
    }

    res.json({ success: true, message: `Model ${modelName} deleted` });
  } catch (error) {
    res.status(503).json({
      error: 'Failed to delete model',
      message: safeError(error),
    });
  }
});

// ── Utilities ──────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export default router;
