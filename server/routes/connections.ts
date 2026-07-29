/**
 * connections.ts
 * REST API routes for the Connection Framework.
 * Manages connections, scripts, tests, approvals, and audit logs.
 */

import { Router } from 'express';
import { redactConfig } from '../services/credential-vault.js';
import type { DatabaseAdapter } from '../db/database.js';
import { createConnectionManager } from '../services/connection-manager.js';
import { requireAdminOrSolo } from '../middleware/auth.js';

export async function createConnectionsRoutes(db: DatabaseAdapter) {
  const router = Router();
  const manager = await createConnectionManager(db);

  // ── Connections ──────────────────────────────────────────────

  /**
   * Strip credentials before a Connection leaves the server.
   *
   * connection-manager now decrypts config on read, so consumers get a usable password
   * — which means an unredacted res.json(conn) would put that password on the wire.
   * (Before this change these responses already carried the stored value, so editing a
   * connection — which used to save in plaintext — exposed the real credential to any
   * client that could list connections.)
   *
   * Applied to EVERY response returning a connection. One helper rather than inline
   * calls so a new endpoint has an obvious thing to reuse.
   */
  const safe = <T extends { config?: unknown }>(conn: T): T => ({
    ...conn,
    config: redactConfig((conn.config ?? {}) as Record<string, unknown>),
  });

  // GET /api/connections — list connections
  // Admin sees all; analyst/viewer sees only active ones
  router.get('/connections', async (req, res) => {
    try {
      const userId = req.user?.id ?? 'unknown';
      const role = req.user?.role ?? 'viewer';
      const connections = await manager.list(userId, role);
      res.json(connections.map(safe));
    } catch (err) {
      console.error('[connections] list error:', err);
      res.status(500).json({ error: 'Failed to list connections' });
    }
  });

  // GET /api/connections/:id — get single connection
  // ── Literal paths MUST be registered before '/connections/:id' ─────────────
  //
  // Express matches in registration order, so '/connections/:id' declared first will
  // swallow '/connections/scripts' with id='scripts'. That is exactly what happened:
  // the Script Library called GET /api/connections/scripts, hit the by-id handler, and
  // got {"error":"Connection not found"} — so the page has been permanently empty since
  // the route was added, while looking like a feature with nothing in it yet.
  //
  // Verified against the running server before and after this change.

  // GET /api/connections/scripts — list approved scripts
  router.get('/connections/scripts', async (req, res) => {
    try {
      // await: listScripts() is async, and res.json(Promise) serialises to `{}`.
      // Stacked on top of the route shadowing, so the Script Library had TWO reasons
      // to be empty — fixing the route alone would have returned {} and the UI would
      // have called setScripts({}) on it. This is the missing-await class that caused
      // the SQLite->PostgreSQL migration bugs; it survives here because a Promise
      // serialises to a plausible-looking empty object rather than throwing.
      res.json(await manager.listScripts());
    } catch (err) {
      console.error('[connections] scripts list error:', err);
      res.status(500).json({ error: 'Failed to list scripts' });
    }
  });

  // POST /api/connections/test — test a config that has NOT been saved yet.
  //
  // The creation wizard needs a real check before a connection exists. Without this it
  // slept 600ms and returned a hardcoded pass, so someone typing the wrong database
  // password saw a green tick, saved it, and found out when a workflow failed. A test
  // that cannot fail is worse than no test.
  //
  // Nothing is persisted and nothing is returned but the verdict — the config arrives in
  // the request body and stays there.
  router.post('/connections/test', requireAdminOrSolo, async (req, res) => {
    try {
      const { type, config } = req.body as { type?: string; config?: Record<string, unknown> };
      if (!type || typeof config !== 'object' || config === null) {
        res.status(400).json({ error: 'type and config are required' });
        return;
      }
      const result = await manager.testConfig(type, config);
      res.json(result);
    } catch (err) {
      console.error('[connections] pre-save test error:', err);
      res.status(500).json({ error: 'Failed to test configuration' });
    }
  });

  router.get('/connections/:id', async (req, res) => {
    try {
      const conn = await manager.get(String(req.params.id));
      if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

      // Non-admins can only see active connections
      if (req.user?.role !== 'admin' && conn.status !== 'active') {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      res.json(safe(conn));
    } catch (err) {
      console.error('[connections] get error:', err);
      res.status(500).json({ error: 'Failed to get connection' });
    }
  });

  // POST /api/connections — create connection (admin only)
  router.post('/connections', requireAdminOrSolo, async (req, res) => {
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

      const conn = await manager.create(
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
  router.put('/connections/:id', requireAdminOrSolo, async (req, res) => {
    try {
      const updated = await manager.update(String(req.params.id), req.body as Parameters<typeof manager.update>[1]);
      if (!updated) { res.status(404).json({ error: 'Connection not found' }); return; }
      res.json(safe(updated));
    } catch (err) {
      console.error('[connections] update error:', err);
      res.status(500).json({ error: 'Failed to update connection' });
    }
  });

  // DELETE /api/connections/:id — soft-delete connection (admin only)
  router.delete('/connections/:id', requireAdminOrSolo, async (req, res) => {
    try {
      const conn = await manager.get(String(req.params.id));
      if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }
      await manager.delete(String(req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error('[connections] delete error:', err);
      res.status(500).json({ error: 'Failed to delete connection' });
    }
  });

  // POST /api/connections/:id/test — test connectivity
  router.post('/connections/:id/test', requireAdminOrSolo, async (req, res) => {
    try {
      const conn = await manager.get(String(req.params.id));
      if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

      const result = await manager.test(String(req.params.id));

      await manager.logAction(
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
  router.post('/connections/:id/approve', requireAdminOrSolo, async (req, res) => {
    try {
      const conn = await manager.get(String(req.params.id));
      if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }
      if (conn.status !== 'pending') {
        res.status(400).json({ error: `Connection is already "${conn.status}", not pending` });
        return;
      }

      const approved = await manager.approve(String(req.params.id), req.user!.id);
      if (!approved) { res.status(404).json({ error: 'Connection not found' }); return; }

      await manager.logAction(
        String(req.params.id),
        null,
        'approve',
        {},
        'Connection approved',
        req.user!.id
      );

      res.json(safe(approved));
    } catch (err) {
      console.error('[connections] approve error:', err);
      res.status(500).json({ error: 'Failed to approve connection' });
    }
  });

  // GET /api/connections/:id/audit — get audit log for a connection (admin only)
  router.get('/connections/:id/audit', requireAdminOrSolo, async (req, res) => {
    try {
      const conn = await manager.get(String(req.params.id));
      if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);
      const log = await manager.getAuditLog(String(req.params.id), limit);
      res.json(log);
    } catch (err) {
      console.error('[connections] audit error:', err);
      res.status(500).json({ error: 'Failed to get audit log' });
    }
  });

  // ── Scripts ──────────────────────────────────────────────────

  // POST /api/connections/scripts — create/register a new script (admin only)
  router.post('/connections/scripts', requireAdminOrSolo, async (req, res) => {
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

      const script = await manager.createScript({
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
  router.put('/connections/scripts/:id', requireAdminOrSolo, async (req, res) => {
    try {
      const updated = await manager.updateScript(
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
  router.delete('/connections/scripts/:id', requireAdminOrSolo, async (req, res) => {
    try {
      const script = await manager.getScript(String(req.params.id));
      if (!script) { res.status(404).json({ error: 'Script not found' }); return; }
      await manager.deleteScript(String(req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error('[connections] script delete error:', err);
      res.status(500).json({ error: 'Failed to delete script' });
    }
  });

  return router;
}
