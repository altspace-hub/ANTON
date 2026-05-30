/**
 * openapi.ts
 * OSS-05: OpenAPI 3.0 specification served at GET /api/openapi.json
 *
 * Documents the core openEXPERT API surface. This is a curated specification
 * covering the most important / externally-useful endpoints. Internal/admin
 * routes and school-mode routes are omitted for brevity.
 *
 * The spec is generated at request time so the server URL is always correct.
 */

import express from 'express';

export function createOpenApiRouter() {
  const router = express.Router();

  router.get('/openapi.json', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const spec = {
      openapi: '3.0.3',
      info: {
        title: 'openEXPERT API',
        version: '1.0.0',
        description:
          'REST API for the openEXPERT AI-powered compliance and professional advisory platform. ' +
          'All endpoints (except /api/auth/login) require a Bearer JWT in the Authorization header.',
        contact: {
          name: 'Futurechain Team',
          url: 'https://futurechain.se',
        },
        license: {
          name: 'Proprietary',
        },
      },
      servers: [{ url: baseUrl, description: 'Current server' }],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          Session: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              module_id: { type: 'string' },
              model: { type: 'string' },
              thinking: { type: 'string', enum: ['quick', 'think', 'think_hard', 'investigate', 'plan_first'] },
              creativity: { type: 'string', enum: ['strict', 'balanced', 'creative'] },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time' },
            },
          },
          Message: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              session_id: { type: 'string' },
              role: { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
          KnowledgePack: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              version: { type: 'string' },
              is_active: { type: 'boolean' },
              entity_count: { type: 'integer' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
          OversightReview: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              session_id: { type: 'string' },
              module_id: { type: 'string' },
              reviewer_name: { type: 'string' },
              reviewer_role: { type: 'string', nullable: true },
              verdict: { type: 'string', enum: ['approved', 'requires_amendment', 'rejected'] },
              notes: { type: 'string', nullable: true },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
          PostMarketEvent: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              session_id: { type: 'string', nullable: true },
              module_id: { type: 'string', nullable: true },
              event_type: {
                type: 'string',
                enum: ['quality_rating', 'reversal', 'amendment', 'complaint', 'incident'],
              },
              severity: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical'],
                nullable: true,
              },
              quality_score: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
              description: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      security: [{ BearerAuth: [] }],
      paths: {
        // ── Auth ──────────────────────────────────────────────────────
        '/api/auth/login': {
          post: {
            tags: ['Authentication'],
            summary: 'Login and obtain a JWT',
            security: [],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                      username: { type: 'string' },
                      password: { type: 'string', format: 'password' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'JWT token',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { token: { type: 'string' }, user: { type: 'object' } },
                    },
                  },
                },
              },
              '401': { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            },
          },
        },

        // ── Sessions ──────────────────────────────────────────────────
        '/api/sessions': {
          get: {
            tags: ['Sessions'],
            summary: 'List sessions for the current user',
            parameters: [
              { name: 'module_id', in: 'query', schema: { type: 'string' } },
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
              { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
            ],
            responses: {
              '200': {
                description: 'List of sessions',
                content: { 'application/json': { schema: { type: 'object', properties: { sessions: { type: 'array', items: { $ref: '#/components/schemas/Session' } } } } } },
              },
            },
          },
          post: {
            tags: ['Sessions'],
            summary: 'Create a new session',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['module_id'],
                    properties: {
                      module_id: { type: 'string' },
                      model: { type: 'string', default: 'claude-opus-4-8' },
                      thinking: { type: 'string', enum: ['quick', 'think', 'think_hard', 'investigate', 'plan_first'] },
                      creativity: { type: 'string', enum: ['strict', 'balanced', 'creative'] },
                    },
                  },
                },
              },
            },
            responses: {
              '201': { description: 'Created session', content: { 'application/json': { schema: { $ref: '#/components/schemas/Session' } } } },
            },
          },
        },
        '/api/sessions/{sessionId}': {
          get: {
            tags: ['Sessions'],
            summary: 'Get a session by ID',
            parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
            responses: {
              '200': { description: 'Session', content: { 'application/json': { schema: { $ref: '#/components/schemas/Session' } } } },
              '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            },
          },
          delete: {
            tags: ['Sessions'],
            summary: 'Delete a session',
            parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
            responses: {
              '200': { description: 'Deleted' },
              '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            },
          },
        },

        // ── Claude Streaming ──────────────────────────────────────────
        '/api/claude/message': {
          post: {
            tags: ['Claude AI'],
            summary: 'Send a message and receive a streaming SSE response',
            description:
              'POSTs a message to Claude. Returns a Server-Sent Events stream. ' +
              'Events: `{type: "text", content: "..."}`, `{type: "thinking", content: "..."}`, ' +
              '`{type: "done", usage: {...}}`, `{type: "error", message: "..."}`. ' +
              'The client must set `Accept: text/event-stream`.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['message', 'sessionId'],
                    properties: {
                      message: { type: 'string', description: 'User message content' },
                      sessionId: { type: 'string' },
                      model: { type: 'string', default: 'claude-opus-4-8' },
                      thinking: { type: 'string', enum: ['quick', 'think', 'think_hard', 'investigate', 'plan_first'] },
                      creativity: { type: 'string', enum: ['strict', 'balanced', 'creative'] },
                      selectedOutputFormats: { type: 'array', items: { type: 'string' } },
                      knowledgeSources: { type: 'object', description: 'KnowledgeSourceConfig' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': { description: 'SSE stream of text/thinking/done events' },
              '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            },
          },
        },

        // ── Export ────────────────────────────────────────────────────
        '/api/export/{format}': {
          post: {
            tags: ['Export'],
            summary: 'Export content to a file format',
            parameters: [
              {
                name: 'format',
                in: 'path',
                required: true,
                schema: { type: 'string', enum: ['docx', 'xlsx', 'pdf', 'fountain', 'fdx'] },
              },
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['content'],
                    properties: {
                      content: { type: 'string', description: 'Markdown content to export' },
                      filename: { type: 'string' },
                      moduleId: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': { description: 'File download (binary)', content: { 'application/octet-stream': {} } },
              '400': { description: 'Unsupported format', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            },
          },
        },

        // ── Knowledge Packs ───────────────────────────────────────────
        '/api/knowledge-packs': {
          get: {
            tags: ['Knowledge Packs'],
            summary: 'List all knowledge packs',
            responses: {
              '200': {
                description: 'List of packs',
                content: { 'application/json': { schema: { type: 'object', properties: { packs: { type: 'array', items: { $ref: '#/components/schemas/KnowledgePack' } } } } } },
              },
            },
          },
        },
        '/api/knowledge-packs/{id}/activate': {
          post: {
            tags: ['Knowledge Packs'],
            summary: 'Activate a knowledge pack',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: {
              '200': { description: 'Activated' },
              '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            },
          },
        },

        // ── Human Oversight (EUAI-02) ─────────────────────────────────
        '/api/oversight/reviews': {
          post: {
            tags: ['Human Oversight (EU AI Act)'],
            summary: 'Record a professional sign-off review for a high-risk AI output',
            description:
              'Required for gap-analysis, sanctions-advisory, and investigation-support modules ' +
              '(EU AI Act Art. 14 compliance). Records attestation, verdict, and reviewer details.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['session_id', 'module_id', 'reviewer_name', 'verdict'],
                    properties: {
                      session_id: { type: 'string' },
                      module_id: { type: 'string' },
                      reviewer_name: { type: 'string', maxLength: 200 },
                      reviewer_role: { type: 'string', maxLength: 200 },
                      verdict: { type: 'string', enum: ['approved', 'requires_amendment', 'rejected'] },
                      notes: { type: 'string', maxLength: 2000 },
                    },
                  },
                },
              },
            },
            responses: {
              '201': { description: 'Review recorded', content: { 'application/json': { schema: { type: 'object', properties: { review: { $ref: '#/components/schemas/OversightReview' } } } } } },
              '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            },
          },
          get: {
            tags: ['Human Oversight (EU AI Act)'],
            summary: 'List oversight reviews',
            parameters: [
              { name: 'session_id', in: 'query', schema: { type: 'string' } },
              { name: 'module_id', in: 'query', schema: { type: 'string' } },
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            ],
            responses: {
              '200': { description: 'List of reviews', content: { 'application/json': { schema: { type: 'object', properties: { reviews: { type: 'array', items: { $ref: '#/components/schemas/OversightReview' } } } } } } },
            },
          },
        },

        // ── Post-Market Monitoring (EUAI-04) ──────────────────────────
        '/api/pmm/events': {
          post: {
            tags: ['Post-Market Monitoring (EU AI Act)'],
            summary: 'Record a post-market monitoring event',
            description: 'Records quality ratings, reversals, amendments, complaints, or incidents for EU AI Act Art. 72 compliance.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['event_type', 'description'],
                    properties: {
                      event_type: { type: 'string', enum: ['quality_rating', 'reversal', 'amendment', 'complaint', 'incident'] },
                      description: { type: 'string', maxLength: 5000 },
                      session_id: { type: 'string' },
                      module_id: { type: 'string' },
                      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                      quality_score: { type: 'integer', minimum: 1, maximum: 5 },
                    },
                  },
                },
              },
            },
            responses: {
              '201': { description: 'Event recorded', content: { 'application/json': { schema: { type: 'object', properties: { event: { $ref: '#/components/schemas/PostMarketEvent' } } } } } },
            },
          },
          get: {
            tags: ['Post-Market Monitoring (EU AI Act)'],
            summary: 'List post-market monitoring events',
            parameters: [
              { name: 'event_type', in: 'query', schema: { type: 'string' } },
              { name: 'module_id', in: 'query', schema: { type: 'string' } },
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
              { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
            ],
            responses: {
              '200': { description: 'Paginated list of events' },
            },
          },
        },
        '/api/pmm/summary': {
          get: {
            tags: ['Post-Market Monitoring (EU AI Act)'],
            summary: 'Aggregated post-market monitoring metrics',
            responses: {
              '200': { description: 'Summary by event type and module' },
            },
          },
        },

        // ── System Cards (EUAI-03) ────────────────────────────────────
        '/api/oversight/modules': {
          get: {
            tags: ['Human Oversight (EU AI Act)'],
            summary: 'List modules that require mandatory human oversight',
            responses: {
              '200': {
                description: 'Module list',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        modules: { type: 'array', items: { type: 'string' } },
                        rationale: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },

        // ── Health ────────────────────────────────────────────────────
        '/api/health': {
          get: {
            tags: ['Platform'],
            summary: 'Health check',
            security: [],
            responses: {
              '200': {
                description: 'Platform health',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok', 'degraded'] },
                        db: { type: 'string' },
                        uptime: { type: 'number' },
                        memory: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-API-Version', '1.0');
    res.json(spec);
  });

  return router;
}
