/**
 * connections.ts
 * REST API routes for the Connection Framework.
 * Manages connections, scripts, tests, approvals, and audit logs.
 */

import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { createConnectionManager } from '../services/connection-manager.js';
import { requireAdminOrSolo } from '../middleware/auth.js';

export function createConnectionsRoutes(db: Database) {
  const router = Router();
  const manager = createConnectionManager(db);

  // ── Connections ──────────────────────────────────────────────

  // GET /api/connections — list connections
  // Admin sees all; analyst/viewer sees only active ones
  router.get('/connections', (req, res) => {
    try {
      const userId = req.user?.id ?? 'unknown';
      const role = req.user?.role ?? 'viewer';
      const connections = manager.list(userId, role);
      res.json(connections);
    } catch (err) {
      console.error('[connections] list error:', err);
      res.status(500).json({ error: 'Failed to list connections' });
    }
  });

  // GET /api/connections/:id — get single connection
  router.get('/connections/:id', (req, res) => {
    try {
      const conn = manager.get(String(req.params.id));
      if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

      // Non-admins can only see active connections
      if (req.user?.role !== 'admin' && conn.status !== 'active') {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      res.json(conn);
    } catch (err) {
      console.error('[connections] get error:', err);
      res.status(500).json({ error: 'Failed to get connection' });
    }
  });

  // POST /api/connections — create connection (admin only)
  router.post('/connections', requireAdminOrSolo, (req, res) => {
    try {
      const { display_name, type, config, permissions } = req.body as {
        display_name?: string;
        type?: string;
        config?: Record<string, unknown>;
        permissions?: string[];
      };

      if (!display_name || !type || !config) {
        res.status(400).json({ error: 'display_name, type, and config are required' });
        return;
      }

      const validTypes = ['database', 'api', 'filesystem', 'email', 'script_library', 'channel_bridge'];
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
        return;
      }

      const conn = manager.create(
        {
          display_name,
          type: type as Parameters<typeof manager.create>[0]['type'],
          config,
          permissions,
        },
        req.user!.id
      );
      res.status(201).json(conn);
    } catch (err) {
      console.error('[connections] create error:', err);
      res.status(500).json({ error: 'Failed to create connection' });
    }
  });

  // PUT /api/connections/:id — update connection (admin only)
  router.put('/connections/:id', requireAdminOrSolo, (req, res) => {
    try {
      const updated = manager.update(String(req.params.id), req.body as Parameters<typeof manager.update>[1]);
      if (!updated) { res.status(404).json({ error: 'Connection not found' }); return; }
      res.json(updated);
    } catch (err) {
      console.error('[connections] update error:', err);
      res.status(500).json({ error: 'Failed to update connection' });
    }
  });

  // DELETE /api/connections/:id — soft-delete connection (admin only)
  router.delete('/connections/:id', requireAdminOrSolo, (req, res) => {
    try {
      const conn = manager.get(String(req.params.id));
      if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }
      manager.delete(String(req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error('[connections] delete error:', err);
      res.status(500).json({ error: 'Failed to delete connection' });
    }
  });

  // POST /api/connections/:id/test — test connectivity
  router.post('/connections/:id/test', requireAdminOrSolo, async (req, res) => {
    try {
      const conn = manager.get(String(req.params.id));
      if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

      const result = await manager.test(String(req.params.id));

      manager.logAction(
        String(req.params.id),
        null,
        'test',
        { ok: result.ok },
        result.message,
        req.user!.id
      );

      res.json(result);
    } catch (err) {
      console.error('[connections] test error:', err);
      res.status(500).json({ error: 'Failed to test connection' });
    }
  });

  // POST /api/connections/:id/approve — approve pending connection (admin only)
  router.post('/connections/:id/approve', requireAdminOrSolo, (req, res) => {
    try {
      const conn = manager.get(String(req.params.id));
      if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }
      if (conn.status !== 'pending') {
        res.status(400).json({ error: `Connection is already "${conn.status}", not pending` });
        return;
      }

      const approved = manager.approve(String(req.params.id), req.user!.id);

      manager.logAction(
        String(req.params.id),
        null,
        'approve',
        {},
        'Connection approved',
        req.user!.id
      );

      res.json(approved);
    } catch (err) {
      console.error('[connections] approve error:', err);
      res.status(500).json({ error: 'Failed to approve connection' });
    }
  });

  // GET /api/connections/:id/audit — get audit log for a connection (admin only)
  router.get('/connections/:id/audit', requireAdminOrSolo, (req, res) => {
    try {
      const conn = manager.get(String(req.params.id));
      if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);
      const log = manager.getAuditLog(String(req.params.id), limit);
      res.json(log);
    } catch (err) {
      console.error('[connections] audit error:', err);
      res.status(500).json({ error: 'Failed to get audit log' });
    }
  });

  // ── Scripts ──────────────────────────────────────────────────

  // GET /api/connections/scripts — list approved scripts
  router.get('/connections/scripts', (req, res) => {
    try {
      res.json(manager.listScripts());
    } catch (err) {
      console.error('[connections] scripts list error:', err);
      res.status(500).json({ error: 'Failed to list scripts' });
    }
  });

  // POST /api/connections/scripts — create/register a new script (admin only)
  router.post('/connections/scripts', requireAdminOrSolo, (req, res) => {
    try {
      const {
        display_name,
        description,
        language,
        script_path,
        parameters,
        expected_outputs,
        max_runtime_seconds,
        memory_limit_mb,
        sandbox,
        network_access,
        file_hash,
        version,
      } = req.body as {
        display_name?: string;
        description?: string;
        language?: string;
        script_path?: string;
        parameters?: Record<string, unknown>;
        expected_outputs?: Record<string, unknown>;
        max_runtime_seconds?: number;
        memory_limit_mb?: number;
        sandbox?: boolean;
        network_access?: boolean;
        file_hash?: string;
        version?: string;
      };

      if (!display_name || !language || !script_path) {
        res.status(400).json({ error: 'display_name, language, and script_path are required' });
        return;
      }

      const validLanguages = ['python', 'bash', 'r', 'powershell', 'node'];
      if (!validLanguages.includes(language)) {
        res.status(400).json({ error: `Invalid language. Must be one of: ${validLanguages.join(', ')}` });
        return;
      }

      const script = manager.createScript({
        display_name,
        description,
        language: language as Parameters<typeof manager.createScript>[0]['language'],
        script_path,
        parameters,
        expected_outputs,
        max_runtime_seconds,
        memory_limit_mb,
        sandbox,
        network_access,
        file_hash,
        version,
        approved_by: req.user!.id,
      });

      res.status(201).json(script);
    } catch (err) {
      console.error('[connections] script create error:', err);
      res.status(500).json({ error: 'Failed to create script' });
    }
  });

  // PUT /api/connections/scripts/:id — update a script (admin only)
  router.put('/connections/scripts/:id', requireAdminOrSolo, (req, res) => {
    try {
      const updated = manager.updateScript(
        String(req.params.id),
        req.body as Parameters<typeof manager.updateScript>[1]
      );
      if (!updated) { res.status(404).json({ error: 'Script not found' }); return; }
      res.json(updated);
    } catch (err) {
      console.error('[connections] script update error:', err);
      res.status(500).json({ error: 'Failed to update script' });
    }
  });

  // DELETE /api/connections/scripts/:id — soft-delete a script (admin only)
  router.delete('/connections/scripts/:id', requireAdminOrSolo, (req, res) => {
    try {
      const script = manager.getScript(String(req.params.id));
      if (!script) { res.status(404).json({ error: 'Script not found' }); return; }
      manager.deleteScript(String(req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error('[connections] script delete error:', err);
      res.status(500).json({ error: 'Failed to delete script' });
    }
  });

  return router;
}
