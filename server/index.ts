// Must be first — loads .env before any other module evaluates top-level env checks
import 'dotenv/config';
// OBS-02: OpenTelemetry — must be imported before all other modules for auto-instrumentation
import './lib/telemetry.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabaseAdapter } from './db/init-database.js';
import type { DatabaseAdapter } from './db/database.js';
import { listTablesQuery, tableExistsQuery } from './db/dialect-helpers.js';
import { authLimiter, userLimiter, claudeLimiter, webhookLimiter } from './middleware/rate-limit.js';
import { createHealthRouter } from './routes/health.js';
import { createClaudeRoutes } from './routes/claude.js';
import filesRouter from './routes/files.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createFolderRoutes } from './routes/folders.js';
import { createExportRouter } from './routes/export.js';
import { createTemplatesRouter } from './routes/templates.js';
import modulesRouter from './routes/modules.js';
import { createProfileRoutes } from './routes/profile.js';
import { createReviewRoutes } from './routes/reviews.js';
import { createProjectRoutes } from './routes/projects.js';
import { createSkillsRoutes } from './routes/skills.js';
import { createCustomModuleRoutes } from './routes/custom-modules.js';
import { createAuditRoutes } from './routes/audit.js';
import { createExchangeRoutes } from './routes/exchange.js';
import { createSettingsRoutes } from './routes/settings.js';
import { createRagRoutes } from './routes/rag.js';
import { createEurLexRoutes } from './routes/eurlex.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createAuthRoutes } from './routes/auth.js';
import { createAdminRoutes } from './routes/admin.js';
import { createCompliancePolicyRoutes } from './routes/compliance-policy.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createScheduleRoutes } from './routes/schedules.js';
import { initScheduler } from './services/scheduler.js';
import { startEventWorkflowProcessor } from './services/event-workflow-processor.js';
import { createVersionsRoutes } from './routes/versions.js';
import { createConnectionsRoutes } from './routes/connections.js';
import { createBridgePublicRoutes, createBridgeRoutes } from './routes/bridges.js';
import { createDatasetsRoutes } from './routes/datasets.js';
import { startDatasetCleanup } from './services/dataset-store.js';
import { createKnowledgeRoutes } from './routes/knowledge.js';
import { createDeadlinesRoutes } from './routes/deadlines.js';
import { createDeadlineReminderService } from './services/deadline-reminders.js';
import { createWorkflowRoutes } from './routes/workflows.js';
import { createMemoryRoutes } from './routes/memory.js';
import { createCanvasRoutes } from './routes/canvas.js';
import { createRadarRoutes } from './routes/radar.js';
import { createRadarFetcher } from './services/radar-fetcher.js';
import createNotificationsRouter from './routes/notifications.js';
import * as cron from 'node-cron';
import { createProjectFilesRoutes } from './routes/project-files.js';
import { createProjectCollaborationRoutes } from './routes/project-collaboration.js';
import { createQualityRoutes } from './routes/quality.js';
import { createEngagementsRoutes } from './routes/engagements.js';
import { createApprenticeRoutes } from './routes/apprentice.js';
import { createKnowledgeGraphRoutes } from './routes/knowledge-graph.js';
import { createIntelligenceDashboardRoutes } from './routes/intelligence-dashboard.js';
import { createPatternDetectionRoutes } from './routes/pattern-detection.js';
import { createPatternDetection } from './services/pattern-detection.js';
import { createCommandRoutes } from './routes/commands.js';
import { createComplianceRoutes } from './routes/compliance.js';
import { createDataRoutes } from './routes/data.js';
import { createCollectionsRoutes } from './routes/collections.js';
import { createSearchRoutes } from './routes/search.js';
import { createEmbeddingRoutes } from './routes/embeddings.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createDiscoveryRoutes } from './routes/discovery.js';
import ollamaRouter from './routes/ollama.js';
import { createCodingRoutes } from './routes/coding.js';
import { createCodingReviewRoutes } from './routes/coding-review.js';
import { createCodingScriptsRoutes } from './routes/coding-scripts.js';
import { createCodingLargeRoutes } from './routes/coding-large.js';
import { createPptxPipelineRoutes } from './routes/pptx-pipeline.js';
import { createPresentationsRoutes } from './routes/presentations.js';
import { createInstructionBuilderRoutes } from './routes/instruction-builder.js';
import { createAlignmentReviewerRoutes } from './routes/alignment-reviewer.js';
import { createKnowledgeLibraryRoutes } from './routes/knowledge-library.js';
import { createBatchRoutes } from './routes/batch.js';
import { createSkillPacksRoutes } from './routes/skill-packs.js';
import { createModelRouterRoutes } from './routes/model-router.js';
import { createAudienceAdapterRoutes } from './routes/audience-adapter.js';
import { createSuggestionsRoutes } from './routes/suggestions.js';
import { createBenchmarkRoutes } from './routes/benchmark.js';
import { createMcpRouter } from './mcp/mcp-server.js';
import { createConnectorTemplatesRoutes } from './routes/connector-templates.js';
import { createIntegrationsRoutes } from './routes/integrations.js';
import { createTradesRoutes } from './routes/trades.js';
import { createPEVCRoutes } from './routes/pe-vc.js';
import { createSchoolRoutes } from './routes/school.js';
import { createNewsRoutes } from './routes/news.js';
import { createFinanceRoutes } from './routes/finance.js';
import { createTravelRoutes } from './routes/travel.js';
import { createCommunityRoutes, setCommunitySocketNS } from './routes/community.js';
import { createTriggersRoutes } from './routes/triggers.js';
import { createWebhooksPublicRoutes } from './routes/webhooks.js';
import { createSessionResumeRoutes } from './routes/session-resume.js';
import { createInsightsRoutes } from './routes/insights.js';
import { createOrgContextRoutes } from './routes/org-context.js';
import { createKnowledgePacksRoutes } from './routes/knowledge-packs.js';
import { createLegalResearchRoutes } from './routes/legal-research.js';
import { createGapAssessmentsRoutes } from './routes/gap-assessments.js';
import { createAiAssistRoutes } from './routes/ai-assist.js';
import { createTaskAgentRoutes } from './routes/task-agent.js';
import { createRoaringRoutes } from './routes/roaring.js';
import { createDowJonesRoutes } from './routes/dowjones.js';
import { createRegulatoryFeedRoutes } from './routes/regulatory-feed.js';
import { createLoreLedgerRoutes } from './routes/lore-ledger.js';
import { createPathfinderRoutes } from './routes/pathfinder.js';
import { createOrchestratorRoutes } from './routes/orchestrator.js';
import { initOrchestratorHeartbeat } from './services/orchestrator-heartbeat.js';
import { createContinuityRoutes } from './routes/continuity.js';
import { createHumanOversightRoutes } from './routes/human-oversight.js';
import { createPostMarketMonitoringRoutes } from './routes/post-market-monitoring.js';
import { createMarketsRoutes } from './routes/markets.js';
import { createMarketComputationRoutes } from './routes/market-computation.js';
import { createMarketDataService } from './services/market-data-service.js';
import { createMarketAtomService } from './services/market-atom-service.js';
import { createMarketThesesRoutes } from './routes/market-theses.js';
import { createMarketEntitiesRoutes } from './routes/market-entities.js';
import { createMarketPatternsRoutes } from './routes/market-patterns.js';
import { createMarketIndexesRoutes } from './routes/market-indexes.js';
import { createMarketLearningRoutes } from './routes/market-learning.js';
import { createMarketInvestigationsRoutes } from './routes/market-investigations.js';
import { createMarketWhyChainsRoutes } from './routes/market-why-chains.js';
import { createMarketCrossPillarRoutes } from './routes/market-cross-pillar.js';
import { createMarketEventCalendarRoutes } from './routes/market-event-calendar.js';
import { createMarketRCIRoutes } from './routes/market-rci.js';
import { createPgNotifyService } from './services/pg-notify-service.js';
import { createPartitionManager } from './services/pg-partition-manager.js';
import { createMarketComputationService } from './services/market-computation-service.js';
import { createMarketRCIService } from './services/market-rci-service.js';
import { createMarketEventTriggerService } from './services/market-event-trigger-service.js';
import { setAtomNotifyService } from './services/market-atom-service.js';
import { setThesisNotifyService } from './services/market-thesis-service.js';
import { setRebalanceNotifyService } from './services/market-index-rebalance-service.js';
import { createMarketNavEngine } from './services/market-nav-engine.js';
import { createMarketWorkflowRoutes } from './routes/market-workflows.js';
import { createMarketBacktestRoutes } from './routes/market-backtests.js';
import { createOpenApiRouter } from './routes/openapi.js';
import { csrfTokenRoute, csrfProtection, pruneExpiredCsrfTokens } from './middleware/csrf.js';
import { createWebhookListener } from './services/webhook-listener.js';
import { setEventEmitter } from './services/event-emitter.js';
import { runEmbeddingPipeline } from './services/embedding-pipeline.js';
import Anthropic from '@anthropic-ai/sdk';
import jwt from 'jsonwebtoken';
import { ensureWorkspacesRoot } from './services/workspace.js';
import { createServer as createHttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from './lib/logger.js';
import { createMetricsRouter, incrementRequests, incrementErrors } from './routes/metrics.js';
import { initAuditQueue, flushAuditQueue } from './services/audit-queue.js';
import { getTotalActiveStreams } from './services/stream-limiter.js';

// ── Startup validation ────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  logger.warn('ANTHROPIC_API_KEY is not set — Claude API calls will fail');
}

// SCALE-02: Auto-detect deployment mode from environment signals.
// If DATABASE_URL (PostgreSQL) is present and DEPLOYMENT_MODE is not explicitly set → team mode.
// Otherwise default to solo (SQLite local mode).
if (!process.env.DEPLOYMENT_MODE) {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
    process.env.DEPLOYMENT_MODE = 'team';
    logger.info('[deploy] Auto-detected team mode (DATABASE_URL is set)');
  } else {
    process.env.DEPLOYMENT_MODE = 'solo';
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3011;

// ── Allowed origins for CORS ──────────────────────────────────
// Defaults to localhost only. Override with CORS_ORIGINS env var (comma-separated).
const allowedOrigins = (process.env.CORS_ORIGINS || `http://localhost:${PORT},http://localhost:5183`)
  .split(',')
  .map((o) => o.trim());

const app = express();

// ── Security headers (helmet) ─────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],  // SEC-02: no unsafe-inline; Vite prod build uses ES module scripts
        styleSrc:  ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc:    ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'ws:',
          'wss:',
          'https://api.anthropic.com',
          'https://api.openai.com',
          'https://generativelanguage.googleapis.com',
          'https://api.mistral.ai',
        ],
        fontSrc:   ["'self'", 'data:', 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        mediaSrc:  ["'self'"],
        frameSrc:  ["'self'", 'blob:'],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [], // Upgrade HTTP to HTTPS when available
      },
    },
    crossOriginEmbedderPolicy: false, // Needed for external API calls
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  })
);

// ── CORS — localhost only ─────────────────────────────────────
// In dev, Vite may land on any port (5173, 5174, 5175…) if earlier ports are taken.
// Allow any http://localhost:<port> origin so the proxy always works.
const isLocalhostOrigin = (origin: string) => /^http:\/\/localhost(:\d+)?$/.test(origin);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin requests (no Origin header), any localhost port, or explicit whitelist
      if (!origin || isLocalhostOrigin(origin) || allowedOrigins.some((allowed) => origin === allowed)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' is not allowed`));
      }
    },
    credentials: true,
  })
);

// ── Rate limiting ─────────────────────────────────────────────
// Apply auth rate limiter to login/password reset endpoints (set before routes)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// Apply Claude-specific rate limiter to AI endpoints
app.use('/api/claude/message', claudeLimiter);
app.use('/api/claude/message-sync', claudeLimiter);

// SEC-05: Parse cookies so auth middleware can read httpOnly session cookie
app.use(cookieParser());

app.use(express.json({
  limit: '50mb',
  // Capture raw body bytes for HMAC-SHA256 webhook signature verification.
  // Stored on req.rawBody so the inbound webhook handler can verify signatures
  // against the original bytes rather than re-serialised JSON (which loses whitespace).
  verify: (req: import('express').Request & { rawBody?: Buffer }, _res, buf) => {
    req.rawBody = buf;
  },
}));
// URL-encoded body parsing for Slack slash commands (application/x-www-form-urlencoded)
app.use('/api/integrations/slack/commands', express.urlencoded({ extended: true }));

// LONE-22: API version header on all responses
app.use((_req, res, next) => {
  res.setHeader('X-API-Version', '1.0');
  next();
});

// Initialize database (async — supports both SQLite and PostgreSQL)
const db: DatabaseAdapter = await initDatabaseAdapter();

// Verify database tables (dialect-aware)
const tables = await db.all<{ name: string }>(listTablesQuery(db.dialect));
console.log('[db] Available tables:', tables.map(t => t.name).join(', '));

// Verify projects table specifically
const projectsTable = await db.get<{ name: string }>(tableExistsQuery(db.dialect), 'projects');
if (!projectsTable) {
  console.error('[db] ⚠️  WARNING: projects table not found!');
} else {
  const projectsCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM projects');
  console.log(`[db] ✅ Projects table exists with ${projectsCount?.count ?? 0} projects`);
}

// RATE-04: initialise async audit queue now that DB is ready
initAuditQueue(db);

// Initialize workspace root directory
await ensureWorkspacesRoot();

// Initialize Anthropic client for quality scoring
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 20 * 60 * 1000 }) : undefined;

// Initialize workflow scheduler
initScheduler(db);

// Initialize event-driven workflow processor (picks up pending webhook-triggered runs)
startEventWorkflowProcessor(db);

// Initialize pattern detection background job (runs every hour)
const patternDetection = await createPatternDetection(db);
setInterval(async () => {
  try {
    console.log('[pattern-detection] Running background detection...');
    const result = await patternDetection.runAllDetectors();
    console.log(`[pattern-detection] Detected ${result.patternsDetected} patterns`);
  } catch (error) {
    console.error('[pattern-detection] Background job error:', error);
  }
}, 3600000); // every hour

// Run pattern detection on startup (delayed by 30 seconds)
setTimeout(async () => {
  try {
    console.log('[pattern-detection] Running initial pattern detection...');
    const result = await patternDetection.runAllDetectors();
    console.log(`[pattern-detection] Initial scan detected ${result.patternsDetected} patterns`);
  } catch (error) {
    console.error('[pattern-detection] Initial scan error:', error);
  }
}, 30000);

// MCP authentication guard - team mode only
if (process.env.DEPLOYMENT_MODE === 'team' && process.env.MCP_SECRET) {
  app.use('/mcp', (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token !== process.env.MCP_SECRET) {
      return res.status(401).json({ error: 'MCP access requires Authorization: Bearer <MCP_SECRET>' });
    }
    next();
  });
}

// MCP endpoint — mounted at /mcp, outside /api and outside auth middleware
// MCP clients (Cursor, Claude Code) do not perform browser auth
app.use('/mcp', await createMcpRouter(db));

// Prune expired CSRF tokens every hour
setInterval(pruneExpiredCsrfTokens, 60 * 60 * 1000);

// API routes — auth routes and config must be registered BEFORE the auth middleware
app.use('/api', await createAuthRoutes(db));

// Channel Bridge public query endpoint — uses per-bridge Bearer token, not session auth
app.use('/api', await createBridgePublicRoutes(db, anthropic));

// Deployment config endpoint (public — no auth required)
app.get('/api/config', (req, res) => {
  const deploymentMode = process.env.DEPLOYMENT_MODE || 'solo';
  const base = { deploymentMode, version: '0.2.0' };

  const oauthFlags = {
    googleOAuthEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    githubOAuthEnabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    oidcEnabled: !!process.env.OIDC_ISSUER_URL,
  };

  if (deploymentMode !== 'team') {
    // Solo mode: always return full config
    return res.json({ ...base, ...oauthFlags });
  }

  // Team mode: only authenticated users see OAuth flags
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  let isAuthenticated = false;
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      isAuthenticated = true;
    } catch { /* invalid token */ }
  }

  res.json(isAuthenticated ? { ...base, ...oauthFlags } : base);
});

// Auth middleware — protects all subsequent /api routes
const authMiddleware = await createAuthMiddleware(db);
app.use('/api', authMiddleware);

// SEC-14: CSRF token endpoint — registered AFTER auth middleware so req.user is
// populated. This ensures the token is stored under the correct user key ('solo'
// in solo mode, or the real user ID in team mode), matching the key used during
// CSRF validation on mutating requests.
app.get('/api/csrf-token', csrfTokenRoute);

// SEC-14: CSRF protection on all state-mutating authenticated routes
app.use('/api', csrfProtection);

// Apply per-user rate limiter to all authenticated API routes
app.use('/api', userLimiter);

app.use('/api', await createHealthRouter(db));
app.use('/', await createMetricsRouter(db)); // OBS-03: Prometheus /metrics — mounted at root, not /api

// OBS-03: request + error counters
app.use((_req, _res, next) => { incrementRequests(); next(); });
app.use((_err: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
  incrementErrors();
  next(_err);
});

app.use('/api', await createClaudeRoutes(db, anthropic));
app.use('/api', filesRouter);
app.use('/api', await createSessionRoutes(db));
app.use('/api', await createFolderRoutes(db));
app.use('/api', await createExportRouter(db));
app.use('/api', await createTemplatesRouter(db));
app.use('/api', await createCustomModuleRoutes(db, anthropic)); // must be before modulesRouter — /modules/community would otherwise be swallowed by /modules/:id wildcard
app.use('/api', modulesRouter);
app.use('/api', await createProfileRoutes(db));
app.use('/api', await createReviewRoutes(db, anthropic));
app.use('/api', await createProjectRoutes(db));
app.use('/api', await createProjectFilesRoutes(db));
app.use('/api', await createProjectCollaborationRoutes(db));
app.use('/api', await createSkillsRoutes(db));
app.use('/api', await createAuditRoutes(db));
app.use('/api', await createExchangeRoutes(db));
app.use('/api', await createSettingsRoutes(db));
app.use('/api', await createRagRoutes(db));
app.use('/api', await createKnowledgeLibraryRoutes(db));
app.use('/api', await createEurLexRoutes(db, anthropic));
app.use('/api', await createAdminRoutes(db));
app.use('/api', await createCompliancePolicyRoutes(db));
app.use('/api/analytics', await createAnalyticsRouter(db));
app.use('/api', await createScheduleRoutes(db));
app.use('/api/versions', await createVersionsRoutes(db));
app.use('/api/claude/review', claudeLimiter);
app.use('/api', await createConnectionsRoutes(db));
app.use('/api', await createBridgeRoutes(db, anthropic));
app.use('/api', await createDatasetsRoutes(db));
app.use('/api', await createKnowledgeRoutes(db));
app.use('/api', await createDeadlinesRoutes(db));
app.use('/api/workflows', await createWorkflowRoutes(db, anthropic));
app.use('/api', await createMemoryRoutes(db));
app.use('/api', await createCanvasRoutes(db));
// Initialize radar fetcher for automated feed scanning
const radarFetcher = anthropic ? await createRadarFetcher(db, anthropic) : undefined;
app.use('/api', await createRadarRoutes(db, radarFetcher));
app.use('/api', createNotificationsRouter(db));
app.use('/api', await createQualityRoutes(db, anthropic));
app.use('/api/engagements', await createEngagementsRoutes(db));
app.use('/api', await createApprenticeRoutes(db));
app.use('/api', await createTradesRoutes(db));
app.use('/api', await createPEVCRoutes(db));
app.use('/api', await createSchoolRoutes(db));
app.use('/api', await createNewsRoutes(db, anthropic));
app.use('/api', await createFinanceRoutes(db, anthropic));
app.use('/api', await createTravelRoutes(db, anthropic));
app.use('/api', await createCommunityRoutes(db));
// Strategic Improvements + Event-Driven Triggers
const webhookListenerInstance = await createWebhookListener(db);
setEventEmitter(webhookListenerInstance);            // Wire internal event emitter singleton
app.use('/api', await createTriggersRoutes(db));           // RBAC-protected trigger management
app.use('/api/webhooks', webhookLimiter);             // Rate limit public webhook endpoint (SEC-19)
app.use('/', await createWebhooksPublicRoutes(db));        // Public inbound webhook endpoint (no ANTON auth)
app.use('/api', await createSessionResumeRoutes(db));      // Session Resume (snapshots)
app.use('/api', await createInsightsRoutes(db));           // Proactive Intelligence
app.use('/api', await createOrgContextRoutes(db));         // Org Context Layer (prompt layer 2a)
app.use('/api', await createContinuityRoutes(db));         // Org Continuity (key-person risk)
app.use('/api', await createKnowledgePacksRoutes(db));     // Regulatory Knowledge Packs
app.use('/api', await createLegalResearchRoutes(db, anthropic));   // Counsel's Desk — legal research sessions
app.use('/api', await createGapAssessmentsRoutes(db, anthropic)); // Compliance Gap Assessor
app.use('/api', await createAiAssistRoutes());                     // AI-assist endpoints (module builder, patterns, deadlines, etc.)
app.use('/api/task-agent', await createTaskAgentRoutes(db, anthropic)); // ANTON Task Agent — conversational task intake + approach proposal
app.use('/api', await createRoaringRoutes(db));                   // Roaring — Nordic entity registry + UBO + sanctions
app.use('/api', await createDowJonesRoutes(db));                  // Dow Jones Risk & Compliance — global screening
app.use('/api', await createRegulatoryFeedRoutes(db, anthropic)); // Regulatory Feed — subscribe + AI digest (LONE-07/18)
app.use('/api', await createLoreLedgerRoutes(db, anthropic));    // Lore Ledger — world-building + consistency checker (LONE-09)
app.use('/api', await createPathfinderRoutes(db, anthropic));     // Pathfinder — AI-powered multi-model search
app.use('/api', await createOrchestratorRoutes(db, anthropic));   // ANTON Orchestrator — AI management layer
app.use('/api', await createHumanOversightRoutes(db));            // EUAI-02: Human oversight sign-off for high-risk FCP modules
app.use('/api', await createPostMarketMonitoringRoutes(db));      // EUAI-04: Post-market monitoring log (quality, reversals, complaints)
app.use('/api', await createOpenApiRouter());                     // OSS-05: OpenAPI 3.0 spec at /api/openapi.json
app.use('/api', await createKnowledgeGraphRoutes(db));
app.use('/api', await createIntelligenceDashboardRoutes(db));
app.use('/api', await createPatternDetectionRoutes(db));
app.use('/api/data', await createDataRoutes(db));
app.use('/api', await createCommandRoutes(db, anthropic));
app.use('/api', await createComplianceRoutes(db));
app.use('/api', await createCollectionsRoutes(db));
app.use('/api', await createSearchRoutes(db));
app.use('/api/embeddings', await createEmbeddingRoutes(db));
app.use('/api', await createDocumentsRouter(db));
app.use('/api', await createDiscoveryRoutes(db, anthropic));
app.use('/api/ollama', ollamaRouter);
app.use('/api', await createCodingRoutes(db));
app.use('/api', await createCodingReviewRoutes(db));
app.use('/api', await createCodingScriptsRoutes(db));
app.use('/api', await createCodingLargeRoutes(db));
app.use('/api', await createPptxPipelineRoutes(db));
app.use('/api', await createPresentationsRoutes(db));
app.use('/api', await createInstructionBuilderRoutes(db));
app.use('/api', await createAlignmentReviewerRoutes(db));
app.use('/api/batch', await createBatchRoutes(anthropic, db));
app.use('/api', await createSkillPacksRoutes(db));
app.use('/api', await createModelRouterRoutes());
app.use('/api', await createAudienceAdapterRoutes());
app.use('/api', await createSuggestionsRoutes(db));
app.use('/api', await createBenchmarkRoutes(db));
app.use('/api', await createConnectorTemplatesRoutes());
app.use('/api', await createIntegrationsRoutes(db));

// Markets Pillar — financial intelligence
app.use('/api', await createMarketsRoutes(db, anthropic));
app.use('/api', await createMarketComputationRoutes(db));
app.use('/api', await createMarketThesesRoutes(db, anthropic));
app.use('/api', await createMarketEntitiesRoutes(db));
app.use('/api', await createMarketPatternsRoutes(db));
app.use('/api', await createMarketIndexesRoutes(db));
app.use('/api', await createMarketLearningRoutes(db));
app.use('/api', await createMarketInvestigationsRoutes(db));
app.use('/api', await createMarketWhyChainsRoutes(db));
app.use('/api', await createMarketCrossPillarRoutes(db));
app.use('/api', await createMarketEventCalendarRoutes(db));
app.use('/api', await createMarketWorkflowRoutes(db));
app.use('/api', await createMarketBacktestRoutes(db));

// RCI service — needs computation service + anthropic client
const marketComputationSvc = await createMarketComputationService(db);
const marketRCIService = await createMarketRCIService(db, marketComputationSvc, anthropic);
app.use('/api', await createMarketRCIRoutes(marketRCIService));

// Serve static React build in production
const clientDist = path.join(__dirname, '..', 'dist', 'client');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ── HTTP server + Socket.IO (Study Rooms) ─────────────────────────────────
const httpServer = createHttpServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  path: '/school-ws',
  // LONE-12: prevent DoS via oversized packets — max 1MB per message
  maxHttpBufferSize: 1_048_576,
  perMessageDeflate: {
    threshold: 1024, // Only compress messages > 1KB
  },
});

// Study room namespace
const studyRooms = io.of('/study-rooms');
studyRooms.on('connection', (socket) => {
  const { roomId, displayName } = socket.handshake.query as { roomId?: string; displayName?: string };
  if (!roomId) { socket.disconnect(); return; }

  void socket.join(roomId);
  studyRooms.to(roomId).emit('user:joined', { socketId: socket.id, displayName: displayName ?? 'Anonymous', timestamp: Date.now() });

  socket.on('message', (payload: { text: string; displayName: string }) => {
    studyRooms.to(roomId).emit('message', {
      socketId: socket.id,
      displayName: payload.displayName,
      text: payload.text,
      timestamp: Date.now(),
    });
  });

  socket.on('focus:update', (payload: { subject: string; topic: string; displayName: string }) => {
    studyRooms.to(roomId).emit('focus:update', { socketId: socket.id, ...payload, timestamp: Date.now() });
  });

  socket.on('disconnect', () => {
    studyRooms.to(roomId).emit('user:left', { socketId: socket.id, displayName, timestamp: Date.now() });
  });
});

// Community namespace — personal notification rooms + group chat relay
const communityNS = io.of('/community');
setCommunitySocketNS(communityNS);

// SEC-16: JWT auth gate for community namespace in team mode
const IS_TEAM_MODE_SOCK = process.env.DEPLOYMENT_MODE === 'team';
const SOCK_JWT_SECRET = process.env.JWT_SECRET || '';
communityNS.use((socket, next) => {
  if (!IS_TEAM_MODE_SOCK) return next(); // solo mode — always allow
  const token = (socket.handshake.auth as Record<string, string>)?.token
    || (socket.handshake.query.token as string | undefined);
  if (!token) { next(new Error('Authentication required')); return; }
  try {
    jwt.verify(token, SOCK_JWT_SECRET);
    db.get('SELECT id FROM user_sessions WHERE token = ? AND expires_at > datetime(\'now\')', token).then(session => {
      if (!session) { next(new Error('Session expired')); return; }
      next();
    }).catch(() => next(new Error('Session lookup failed')));
  } catch {
    next(new Error('Invalid token'));
  }
});

communityNS.on('connection', (socket) => {
  const { contactHash } = socket.handshake.query as { contactHash?: string };
  if (contactHash) void socket.join(`user:${contactHash}`);

  socket.on('join:group', (gid: string) => { void socket.join(`group:${gid}`); });
  socket.on('leave:group', (gid: string) => { void socket.leave(`group:${gid}`); });

  // Group chat relay (wired for future Group Chat page)
  socket.on('chat:message', (payload: { groupId: string; text: string; displayName: string }) => {
    communityNS.to(`group:${payload.groupId}`).emit('chat:message', { ...payload, timestamp: Date.now() });
  });
});

let pgNotifyService: Awaited<ReturnType<typeof createPgNotifyService>> | null = null;

httpServer.listen(PORT, async () => {
  logger.info({ port: PORT, apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY }, 'ANTON by openEXPERT server started');

  // Start background dataset cleanup (runs every hour)
  await startDatasetCleanup(db);
  console.log('Dataset cleanup service started');

  // Start embedding pipeline (runs in background, 10s delay to avoid blocking startup)
  setTimeout(() => {
    runEmbeddingPipeline(db).catch(err => {
      console.warn('[embedding-pipeline] Startup run failed (non-fatal):', err instanceof Error ? err.message : err);
    });
  }, 10000);

  // Start deadline reminder service (checks every 15 minutes)
  try {
    const reminderService = await createDeadlineReminderService(db);
    reminderService.startTimer(15);
    console.log('[deadline-reminders] Reminder service started');
  } catch (err) {
    console.error('[deadline-reminders] Failed to start reminder service:', err);
  }

  // Initialize ANTON Orchestrator heartbeat
  try {
    initOrchestratorHeartbeat(db, anthropic);
  } catch (err) {
    console.error('[orchestrator-heartbeat] Failed to start:', err);
  }

  // ── PG-specific: NOTIFY/LISTEN, partitions, materialized views ────────
  if (db.dialect === 'postgresql') {
    try {
      const notifySvc = await createPgNotifyService(db);
      pgNotifyService = notifySvc;
      setAtomNotifyService(pgNotifyService);
      setThesisNotifyService(pgNotifyService);
      setRebalanceNotifyService(pgNotifyService);
    } catch (err) {
      console.error('[pg-notify] Failed to start:', err);
    }

    try {
      const partMgr = createPartitionManager(db);
      await partMgr.ensureFuturePartitions(12);
      console.log('[pg-partitions] Future partitions ensured');

      // Weekly cron to create future partitions
      if (cron.validate('0 2 * * 0')) {
        cron.schedule('0 2 * * 0', async () => {
          try {
            const result = await partMgr.ensureFuturePartitions(12);
            console.log(`[pg-partitions] Created ${result.created.length} partitions`);
          } catch (err) {
            console.error('[pg-partitions] Failed:', err);
          }
        });
      }
    } catch (err) {
      console.error('[pg-partitions] Failed to initialize:', err);
    }

    // Daily materialized view refresh at 4 AM
    if (cron.validate('0 4 * * *')) {
      cron.schedule('0 4 * * *', async () => {
        console.log('[markets-cron] Refreshing materialized views...');
        try {
          await db.run('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_prediction_track_record');
          await db.run('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_index_stats');
          await db.run('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_index_leaderboard_ranked');
          console.log('[markets-cron] Materialized views refreshed');
        } catch (err) {
          console.error('[markets-cron] Materialized view refresh failed:', err);
        }
      });
      console.log('[markets-cron] Scheduled daily materialized view refresh at 4 AM');
    }
  }

  // ── Markets Pillar: CET-aligned Trading Day Schedule ─────────────────────
  try {
    const marketDataService = await createMarketDataService(db);
    const marketAtomService = await createMarketAtomService(db, anthropic);
    const eventTriggerService = await createMarketEventTriggerService(db);
    const navEngine = await createMarketNavEngine(db);
    const { createMarketWorkflowOrchestrator: createOrch } = await import('./services/market-workflow-orchestrator.js');
    const marketComputationSvcCron = await createMarketComputationService(db);
    const workflowOrchestrator = await createOrch(db, marketComputationSvcCron, marketDataService);

    const MARKET_TZ = { timezone: 'Europe/Stockholm' };

    // Phase 1: Morning Intelligence (07:00 CET) — overnight review, atom decay, calendar
    cron.schedule('0 7 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 1: Morning Intelligence');
      try {
        // Fetch overnight news
        await marketDataService.fetchAllSources();
        // Apply atom decay
        await marketAtomService.applyAtomDecay();
        // Extract atoms from new data
        const unprocessed = await db.all<{ id: string; data_type: string; content: string; title: string | null }>(
          "SELECT id, data_type, content, title FROM market_data_raw WHERE is_processed = 0 AND data_type != 'price' LIMIT 50"
        );
        for (const row of unprocessed) {
          try {
            const text = row.title ? `${row.title}\n\n${row.content}` : row.content;
            await marketAtomService.extractAtomsFromRawData(row.id, text, row.data_type);
            await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id);
          } catch { await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id); }
        }
        console.log('[markets-schedule] Phase 1 complete');
      } catch (err) { console.error('[markets-schedule] Phase 1 error:', err); }
    }, MARKET_TZ);

    // Phase 2: Pre-Open Signal Scan (14:30 CET) — final prep before US open
    cron.schedule('30 14 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 2: Pre-Open Signal Scan');
      try {
        await marketDataService.fetchAllSources();
        console.log('[markets-schedule] Phase 2 complete');
      } catch (err) { console.error('[markets-schedule] Phase 2 error:', err); }
    }, MARKET_TZ);

    // Phase 3: Market Open Capture (15:45 CET) — opening data 15 min after US open
    cron.schedule('45 15 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 3: Market Open Capture');
      try {
        await marketDataService.fetchAllSources();
        console.log('[markets-schedule] Phase 3 complete');
      } catch (err) { console.error('[markets-schedule] Phase 3 error:', err); }
    }, MARKET_TZ);

    // Phase 4: Mid-Day Intelligence (18:00 CET) — full intelligence cycle
    cron.schedule('0 18 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 4: Mid-Day Intelligence');
      try {
        await marketDataService.fetchAllSources();
        await workflowOrchestrator.runDailyIntelligence();
        console.log('[markets-schedule] Phase 4 complete');
      } catch (err) { console.error('[markets-schedule] Phase 4 error:', err); }
    }, MARKET_TZ);

    // Phase 5: Market Close (22:15 CET) — EOD data, NAV calculation
    cron.schedule('15 22 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 5: Market Close');
      try {
        await marketDataService.fetchAllSources();
        await navEngine.updateAllActiveIndexes();
        await navEngine.updateLeaderboard();
        console.log('[markets-schedule] Phase 5 complete');
      } catch (err) { console.error('[markets-schedule] Phase 5 error:', err); }
    }, MARKET_TZ);

    // Phase 6: Post-Market Learning (23:00 CET) — validation, learning, next-day prep
    cron.schedule('0 23 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 6: Post-Market Learning');
      try {
        // Extract atoms from any remaining unprocessed data
        const remaining = await db.all<{ id: string; data_type: string; content: string; title: string | null }>(
          "SELECT id, data_type, content, title FROM market_data_raw WHERE is_processed = 0 AND data_type != 'price' LIMIT 30"
        );
        for (const row of remaining) {
          try {
            const text = row.title ? `${row.title}\n\n${row.content}` : row.content;
            await marketAtomService.extractAtomsFromRawData(row.id, text, row.data_type);
            await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id);
          } catch { await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id); }
        }
        console.log('[markets-schedule] Phase 6 complete');
      } catch (err) { console.error('[markets-schedule] Phase 6 error:', err); }
    }, MARKET_TZ);

    // Phase 7: Weekend Deep Dive (Saturday 10:00 CET)
    cron.schedule('0 10 * * 6', async () => {
      console.log('[markets-schedule] Phase 7: Weekend Deep Dive');
      try {
        await workflowOrchestrator.runPredictionValidation();
        console.log('[markets-schedule] Phase 7 complete');
      } catch (err) { console.error('[markets-schedule] Phase 7 error:', err); }
    }, MARKET_TZ);

    // Keep hourly event trigger check
    cron.schedule('0 * * * *', async () => {
      try {
        const result = await eventTriggerService.checkAndFireTriggers();
        if (result.fired > 0) {
          console.log(`[markets-schedule] Event triggers: ${result.fired} fired, ${result.errors} errors`);
        }
      } catch { /* silent */ }
    }, MARKET_TZ);

    // Keep daily materialized view refresh (4 AM CET)
    cron.schedule('0 4 * * *', async () => {
      try {
        await db.run("REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_index_leaderboard_ranked");
      } catch { /* silent */ }
    }, MARKET_TZ);

    console.log('[markets-schedule] CET-aligned trading day schedule active (7 phases + hourly triggers + 4AM MV refresh)');
  } catch (err) {
    console.error('[markets-schedule] Failed to start market scheduled jobs:', err);
  }

  // Initialize radar background scanning from DB settings
  if (radarFetcher) {
    try {
      const autoEnabled = await db.get<{ value: string }>("SELECT value FROM radar_settings WHERE key = 'auto_scan_enabled'");
      const autoInterval = await db.get<{ value: string }>("SELECT value FROM radar_settings WHERE key = 'auto_scan_interval_hours'");
      const enabled = autoEnabled?.value === '1';
      const hours = parseInt(autoInterval?.value || '24', 10);

      if (enabled) {
        radarFetcher.startAutoScan(hours);
        console.log(`[radar] Auto-scan enabled (${hours}h interval)`);
      } else {
        console.log('[radar] Auto-scan disabled (change in Radar settings)');
      }

      // Also check for cron-based radar schedule
      const radarCronRow = await db.get<{ value: string }>("SELECT value FROM radar_settings WHERE key = 'auto_scan_cron'");
      const radarCronExpr = radarCronRow?.value;
      if (radarCronExpr && cron.validate(radarCronExpr)) {
        cron.schedule(radarCronExpr, async () => {
          console.log('[radar-cron] Starting scheduled radar scan');
          try {
            await radarFetcher!.scanAllSources();
            console.log('[radar-cron] Scheduled scan completed');
          } catch (err) {
            console.error('[radar-cron] Scan failed:', err);
          }
        });
        console.log(`[radar-cron] Scheduled radar scan: ${radarCronExpr}`);
      }
    } catch (err) {
      console.error('[radar] Failed to read auto-scan settings:', err);
    }
  }
});

// OBS-05: Graceful shutdown — drain in-flight requests (30s), then close
const DRAIN_TIMEOUT_MS = 30_000;

function shutdown(signal: string): void {
  logger.info({ signal }, 'Graceful shutdown initiated');

  // Stop accepting new connections
  httpServer.close(async (closeErr) => {
    if (closeErr) {
      logger.error({ err: closeErr }, 'Error closing HTTP server');
    } else {
      logger.info('HTTP server closed');
    }
    // Shut down PG notify listener if active
    if (pgNotifyService) {
      await pgNotifyService.shutdown().catch(() => {});
    }
    flushAuditQueue(); // RATE-04: drain pending audit entries before closing
    db.close().catch(() => {}).finally(() => {
      logger.info('Database closed — exiting');
      process.exit(closeErr ? 1 : 0);
    });
  });

  // Force-kill if drain takes too long
  setTimeout(() => {
    logger.error({ timeoutMs: DRAIN_TIMEOUT_MS }, 'Drain timeout exceeded — forcing exit');
    db.close().catch(() => {}).finally(() => process.exit(1));
  }, DRAIN_TIMEOUT_MS).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Safety net for async errors ───────────────────────────────
// After the SQLite→async migration, any missing `await` or uncaught promise
// rejection would crash the whole Node process.  Log and survive instead.
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ err: reason }, 'Unhandled promise rejection (server kept running)');
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception (server kept running)');
  console.error('[uncaughtException]', err);
  // Note: after an uncaught exception the process state may be inconsistent.
  // We log but do NOT call process.exit() so the server stays up for the user.
  // In production you may want to trigger a graceful restart instead.
});
