import { Router } from 'express';
import { isApiKeyConfigured } from '../services/claude-client.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: isApiKeyConfigured(),
    database: true,
    version: '0.1.0',
  });
});

export default router;
