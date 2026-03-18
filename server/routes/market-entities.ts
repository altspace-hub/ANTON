import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketGraphService } from '../services/market-graph-service.js';

export async function createMarketEntitiesRoutes(db: DatabaseAdapter) {
  const router = Router();
  const graphService = await createMarketGraphService(db);

  // ── Entity CRUD ────────────────────────────────────────────────────────

  router.get('/markets/entities', async (req, res) => {
    try {
      const entities = await graphService.listEntities({
        entityType: req.query.type as string | undefined,
        query: req.query.q as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      });
      res.json(entities);
    } catch (err) {
      console.error('[market-entities] List error:', err);
      res.status(500).json({ error: 'Failed to list entities' });
    }
  });

  router.get('/markets/entities/stats', async (_req, res) => {
    try {
      const stats = await graphService.getGraphStats();
      res.json(stats);
    } catch (err) {
      console.error('[market-entities] Stats error:', err);
      res.status(500).json({ error: 'Failed to get graph stats' });
    }
  });

  router.get('/markets/entities/graph', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const graph = await graphService.getFullGraph(limit);
      res.json(graph);
    } catch (err) {
      console.error('[market-entities] Graph error:', err);
      res.status(500).json({ error: 'Failed to get graph' });
    }
  });

  router.get('/markets/entities/:id', async (req, res) => {
    try {
      const entity = await graphService.getEntity(req.params.id);
      if (!entity) return res.status(404).json({ error: 'Entity not found' });
      res.json(entity);
    } catch (err) {
      console.error('[market-entities] Get error:', err);
      res.status(500).json({ error: 'Failed to get entity' });
    }
  });

  router.post('/markets/entities', async (req, res) => {
    try {
      const { name, entityType, symbol, description, metadata } = req.body;
      if (!name || !entityType) return res.status(400).json({ error: 'name and entityType are required' });
      const id = await graphService.createEntity({ name, entityType, symbol, description, metadata });
      res.status(201).json({ id });
    } catch (err) {
      console.error('[market-entities] Create error:', err);
      res.status(500).json({ error: 'Failed to create entity' });
    }
  });

  router.put('/markets/entities/:id', async (req, res) => {
    try {
      await graphService.updateEntity(req.params.id, req.body);
      res.json({ ok: true });
    } catch (err) {
      console.error('[market-entities] Update error:', err);
      res.status(500).json({ error: 'Failed to update entity' });
    }
  });

  router.delete('/markets/entities/:id', async (req, res) => {
    try {
      await graphService.deleteEntity(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[market-entities] Delete error:', err);
      res.status(500).json({ error: 'Failed to delete entity' });
    }
  });

  // ── Aliases ────────────────────────────────────────────────────────────

  router.post('/markets/entities/:id/aliases', async (req, res) => {
    try {
      const { alias, aliasType } = req.body;
      if (!alias) return res.status(400).json({ error: 'alias is required' });
      await graphService.addAlias(req.params.id, alias, aliasType);
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[market-entities] Add alias error:', err);
      res.status(500).json({ error: 'Failed to add alias' });
    }
  });

  router.get('/markets/entities/resolve/:alias', async (req, res) => {
    try {
      const entity = await graphService.resolveAlias(req.params.alias);
      if (!entity) return res.status(404).json({ error: 'Entity not found' });
      res.json(entity);
    } catch (err) {
      console.error('[market-entities] Resolve alias error:', err);
      res.status(500).json({ error: 'Failed to resolve alias' });
    }
  });

  // ── Relationships ──────────────────────────────────────────────────────

  router.get('/markets/entities/:id/relationships', async (req, res) => {
    try {
      const rels = await graphService.getRelationships(req.params.id);
      res.json(rels);
    } catch (err) {
      console.error('[market-entities] Get relationships error:', err);
      res.status(500).json({ error: 'Failed to get relationships' });
    }
  });

  router.post('/markets/entities/:id/relationships', async (req, res) => {
    try {
      const { targetEntityId, relationshipType, strength, metadata } = req.body;
      if (!targetEntityId || !relationshipType) {
        return res.status(400).json({ error: 'targetEntityId and relationshipType are required' });
      }
      await graphService.addRelationship(req.params.id, targetEntityId, relationshipType, strength, metadata);
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[market-entities] Add relationship error:', err);
      res.status(500).json({ error: 'Failed to add relationship' });
    }
  });

  // ── Graph Build ────────────────────────────────────────────────────────

  router.post('/markets/entities/build-graph', async (_req, res) => {
    try {
      const result = await graphService.buildGraphFromAtoms();
      res.json(result);
    } catch (err) {
      console.error('[market-entities] Build graph error:', err);
      res.status(500).json({ error: 'Failed to build graph' });
    }
  });

  return router;
}
