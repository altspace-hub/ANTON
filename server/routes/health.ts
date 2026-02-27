import { Router } from 'express';
import type Database from 'better-sqlite3';
import { isApiKeyConfigured } from '../services/claude-client.js';

export function createHealthRouter(db: Database.Database) {
  const router = Router();

  router.get('/health', (_req, res) => {
    let dbOk = false;
    try {
      db.prepare('SELECT 1').get();
      dbOk = true;
    } catch { /* db not ready */ }

    res.json({
      status: 'ok',
      apiKeyConfigured: isApiKeyConfigured(),
      database: dbOk,
      version: '0.2.0',
    });
  });

  return router;
}
