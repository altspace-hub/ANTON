import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import Anthropic from '@anthropic-ai/sdk';
import { parseCommand, executeCommand } from '../services/command-parser.js';
import { safeError } from '../lib/error-response.js';

export async function createCommandRoutes(db: DatabaseAdapter, anthropic: Anthropic | undefined) {
  const router = Router();

  router.post('/commands/parse', async (req, res) => {
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ error: 'input required' });
    }

    if (!anthropic) {
      return res.status(503).json({ error: 'Claude API not configured' });
    }

    try {
      const parsed = await parseCommand(input, anthropic);
      res.json(parsed);
    } catch (error: any) {
      console.error('[commands] Parse error:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  router.post('/commands/execute', async (req, res) => {
    const { input, parsed: preParsed } = req.body;
    if (!input) {
      return res.status(400).json({ error: 'input required' });
    }

    if (!anthropic) {
      return res.status(503).json({ error: 'Claude API not configured' });
    }

    try {
      // If caller already parsed (e.g. after confirmation step), skip re-parsing
      const parsed = preParsed ?? await parseCommand(input, anthropic);
      const result = await executeCommand(parsed, {
        db,
        userId: (req as any).user?.id
      });
      res.json({ parsed, result });
    } catch (error: any) {
      console.error('[commands] Execute error:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  return router;
}
