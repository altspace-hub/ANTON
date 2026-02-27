/**
 * connector-templates.ts (routes)
 * REST API routes for browsing and instantiating pre-configured connector templates.
 *
 * GET  /api/connector-templates           — list all templates
 * POST /api/connector-templates/:id/instantiate — return config skeleton for UI to fill in
 */

import { Router } from 'express';
import { CONNECTOR_TEMPLATES } from '../services/connector-templates.js';
import { requireAuth } from '../middleware/auth.js';

export function createConnectorTemplatesRoutes() {
  const router = Router();

  /**
   * GET /api/connector-templates
   * Returns all available connector templates.
   */
  router.get('/connector-templates', requireAuth, (_req, res) => {
    res.json(CONNECTOR_TEMPLATES);
  });

  /**
   * GET /api/connector-templates/:id
   * Returns a single connector template by ID.
   */
  router.get('/connector-templates/:id', requireAuth, (req, res) => {
    const template = CONNECTOR_TEMPLATES.find((t) => t.id === req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  });

  /**
   * POST /api/connector-templates/:id/instantiate
   * Returns the template config skeleton for the UI to pre-populate a new connection form.
   * Does NOT create a connection — that is done via POST /api/connections.
   */
  router.post('/connector-templates/:id/instantiate', requireAuth, (req, res) => {
    const template = CONNECTOR_TEMPLATES.find((t) => t.id === req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json({
      template,
      configTemplate: template.configTemplate,
      suggestedConnectionPayload: {
        display_name: template.name,
        type: mapTemplateTypeToConnectionType(template.type),
        config: template.configTemplate,
        permissions: template.permissionsRequired,
      },
    });
  });

  return router;
}

/**
 * Maps a ConnectorTemplate type to the connection manager's accepted type values.
 * connection-manager accepts: 'database' | 'api' | 'filesystem' | 'email' | 'script_library' | 'channel_bridge'
 */
function mapTemplateTypeToConnectionType(
  templateType: 'api' | 'rss' | 'email' | 'channel_bridge' | 'webhook'
): string {
  switch (templateType) {
    case 'api':
      return 'api';
    case 'rss':
      return 'api'; // RSS feeds are polled via HTTP — treated as api connections
    case 'email':
      return 'email';
    case 'channel_bridge':
      return 'channel_bridge';
    case 'webhook':
      return 'api'; // Outbound webhooks use HTTP API transport
    default:
      return 'api';
  }
}
