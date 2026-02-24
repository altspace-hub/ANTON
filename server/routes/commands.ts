import { Router } from 'express';
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { parseCommand, executeCommand } from '../services/command-parser.js';

export function createCommandRoutes(db: Database.Database, anthropic: Anthropic | undefined) {
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
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/commands/execute', async (req, res) => {
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ error: 'input required' });
    }

    if (!anthropic) {
      return res.status(503).json({ error: 'Claude API not configured' });
    }

    try {
      const parsed = await parseCommand(input, anthropic);
      const result = await executeCommand(parsed, {
        db,
        userId: (req as any).user?.id
      });
      res.json({ parsed, result });
    } catch (error: any) {
      console.error('[commands] Execute error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
