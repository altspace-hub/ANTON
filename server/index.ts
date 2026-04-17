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
import { authLimiter, userLimiter, claudeLimiter, webhookLimiter, p2pLimiter } from './middleware/rate-limit.js';
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
import { createTemporalReasoningRoutes } from './routes/temporal-reasoning.js';
import { createOpenApiRouter } from './routes/openapi.js';
import { createAzureOpenAIRoutes } from './routes/azure-openai.js';
import { createProcureRoutes } from './routes/procure.js';
import { createCivicRoutes } from './routes/civic.js';
import { createGrowRoutes } from './routes/grow.js';
import { createTalentRoutes } from './routes/talent.js';
import { createAppGatewayRoutes } from './routes/app-gateway.js';
import { setupCompanionNamespace } from './services/app-websocket.js';
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
const PORT = process.env.PORT || 3001;

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
// Allow localhost + LAN IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x) for companion app testing
const isLocalhostOrigin = (origin: string) => /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);

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

// Payment Gateway public API (API key auth, no session required)
const { createFCGatewayRoutes } = await import('./routes/fc-gateway.js');
const { adminRouter: gwAdmin, publicRouter: gwPublic } = await createFCGatewayRoutes(db);
app.use('/api/gateway', gwPublic);

// Companion App Gateway — M9: controlled by APP_GATEWAY_ENABLED (default: enabled)
const APP_GATEWAY_ENABLED = process.env.APP_GATEWAY_ENABLED !== 'false';
let appGatewaySvc: Awaited<ReturnType<typeof createAppGatewayRoutes>>['service'] | null = null;
if (APP_GATEWAY_ENABLED) {
  // SEC: Rate-limit auth endpoints (brute-force protection)
  app.use('/api/app/auth', authLimiter);
  // SEC: General rate limit on all app public routes
  app.use('/api/app', userLimiter);
  const { publicRouter: appPublic, adminRouter: appAdmin, service } = await createAppGatewayRoutes(db);
  appGatewaySvc = service;
  app.use('/api/app', appPublic);
  // Admin routes mounted after auth middleware (see below)
  // Store adminRouter for later mounting
  (app as unknown as Record<string, unknown>)._appAdminRouter = appAdmin;
  logger.info('[app-gateway] Companion App Gateway enabled');
} else {
  logger.info('[app-gateway] Companion App Gateway disabled (APP_GATEWAY_ENABLED=false)');
}

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
// Beehive — multi-party reasoning sessions across N ANTONs (Phase 1: lifecycle only)
const { createBeehiveRoutes } = await import('./routes/beehive.js');
app.use('/api', createBeehiveRoutes(db));
// Missions — autonomous multi-step work (Phase 1: foundation + Knowledge Synthesis template)
const { createMissionRoutes } = await import('./routes/missions.js');
app.use('/api', createMissionRoutes(db));
// Missions Phase 2 — Action Layer: credential vault, browser automation, service packs
const { createMissionCredentialRoutes } = await import('./routes/mission-credentials.js');
app.use('/api', createMissionCredentialRoutes(db));
const { createBrowserRoutes } = await import('./routes/mission-browser.js');
app.use('/api', createBrowserRoutes(db));
const { createServicePackRoutes } = await import('./routes/service-packs.js');
app.use('/api', createServicePackRoutes(db));
// Task Delegation — community task exchange between ANTON instances
const { createTaskDelegationRoutes } = await import('./routes/task-delegation.js');
app.use('/api', await createTaskDelegationRoutes(db));
// D3: Signed reasoning trails for task delegation
const { createCommunitySigningRoutes } = await import('./routes/community-signing.js');
app.use('/api', await createCommunitySigningRoutes(db));
// D6: Delegation compliance rules engine
const { createDelegationComplianceRoutes } = await import('./routes/delegation-compliance.js');
app.use('/api', await createDelegationComplianceRoutes(db));
// FutureChain preparation scaffold
const { createFCSettingsRoutes } = await import('./routes/fc-settings.js');
app.use('/api', await createFCSettingsRoutes(db));
const { createFCWalletRoutes } = await import('./routes/fc-wallets.js');
app.use('/api', await createFCWalletRoutes(db));
const { createFCTransactionRoutes } = await import('./routes/fc-transactions.js');
app.use('/api', await createFCTransactionRoutes(db));
const { createFCBudgetRoutes } = await import('./routes/fc-budget.js');
app.use('/api', await createFCBudgetRoutes(db));
const { createFCMarketplaceRoutes } = await import('./routes/fc-marketplace.js');
app.use('/api', await createFCMarketplaceRoutes(db));
// FutureChain Payment Gateway — admin routes (session-protected)
app.use('/api', gwAdmin);
// P2P message transport — public endpoint for ANTON-to-ANTON delivery (rate-limited)
const { createP2PRoutes } = await import('./routes/p2p.js');
app.use('/api/p2p', p2pLimiter);
app.use('/api', await createP2PRoutes(db));
// Collaborative Project Workspace
const { createCommunityProjectRoutes } = await import('./routes/community-projects.js');
app.use('/api', await createCommunityProjectRoutes(db));
// Relay server (store-and-forward for offline peers)
const { createRelayRoutes } = await import('./routes/relay.js');
app.use('/api', await createRelayRoutes(db));
// Bundle marketplace (discovery, ratings, reviews)
const { createMarketplaceRoutes } = await import('./routes/marketplace.js');
app.use('/api', await createMarketplaceRoutes(db));
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

// Temporal Reasoning — goals, values, strategy, consequence checking
app.use('/api', await createTemporalReasoningRoutes(db));

// RCI service — needs computation service + anthropic client
const marketComputationSvc = await createMarketComputationService(db);
const marketRCIService = await createMarketRCIService(db, marketComputationSvc, anthropic);
app.use('/api', await createMarketRCIRoutes(marketRCIService));

// Azure OpenAI — enterprise LLM integration
app.use('/api', await createAzureOpenAIRoutes(db));

// Procure Pillar — phased procurement pipeline
app.use('/api', await createProcureRoutes(db));

// Civic Pillar — government & public institution navigator
app.use('/api', await createCivicRoutes(db));

// Grow Pillar — CRM & business development intelligence
app.use('/api', await createGrowRoutes(db));

// Talent — Discovery-driven recruitment with EU AI Act compliance
app.use('/api', await createTalentRoutes(db));

// Specialized Agents — autonomous AI personas for business functions
const { createAgentRoutes } = await import('./routes/agents.js');
app.use('/api', await createAgentRoutes(db));

// Companion App Gateway — admin routes (session-protected)
if (APP_GATEWAY_ENABLED) {
  const appAdminRouter = (app as unknown as Record<string, unknown>)._appAdminRouter as import('express').Router;
  app.use('/api/admin/app', appAdminRouter);
}

// Serve companion app PWA at /app (if built)
const appDist = path.join(__dirname, '..', 'dist', 'app');
app.use('/app', express.static(appDist));
app.get('/app/*', (_req, res) => {
  res.sendFile(path.join(appDist, 'index.html'));
});

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
    origin: (origin, callback) => {
      if (!origin || isLocalhostOrigin(origin) || allowedOrigins.some(a => origin === a)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
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

// Companion App namespace — real-time query streaming for app users
if (APP_GATEWAY_ENABLED && appGatewaySvc) {
  const APP_MAX_CONNECTIONS = parseInt(process.env.APP_GATEWAY_MAX_CONNECTIONS || '100', 10);
  const companionNS = io.of('/companion');

  // M10: Enforce max concurrent WebSocket connections
  let activeConnections = 0;
  companionNS.use((socket, next) => {
    if (activeConnections >= APP_MAX_CONNECTIONS) {
      return next(new Error('Maximum connections reached'));
    }
    activeConnections++;
    socket.on('disconnect', () => { activeConnections--; });
    next();
  });

  setupCompanionNamespace(companionNS, db, appGatewaySvc);
  logger.info(`[app-gateway] /companion WebSocket namespace active (max ${APP_MAX_CONNECTIONS} connections)`);
}

let pgNotifyService: Awaited<ReturnType<typeof createPgNotifyService>> | null = null;

// Allow long-running SSE streams (reasoning models can take 5-10 min)
httpServer.timeout = 0;              // No socket timeout
httpServer.keepAliveTimeout = 620_000; // 10 min + 20s buffer

httpServer.listen(PORT, async () => {
  logger.info({ port: PORT, apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY }, 'ANTON by openEXPERT server started');

  // mDNS advertising for companion app LAN discovery
  if (APP_GATEWAY_ENABLED) {
    try {
      const { createMdnsAdvertiser } = await import('./services/mdns-advertiser.js');
      const mdns = await createMdnsAdvertiser(parseInt(String(PORT), 10));
      await mdns.start();
    } catch {}
  }

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
    const { createTemporalReasoningService } = await import('./services/temporal-reasoning.js');
    const temporalReasoning = await createTemporalReasoningService(db);
    const workflowOrchestrator = await createOrch(db, marketComputationSvcCron, marketDataService, undefined, temporalReasoning);

    const MARKET_TZ = { timezone: 'Europe/Stockholm' };

    // ── Sustainable schedule: fetch less, process more, quality over speed ──
    // Backlog gate: skip new fetches if too many unprocessed articles
    async function getBacklogSize(): Promise<number> {
      const row = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM market_data_raw WHERE is_processed = 0 AND data_type NOT IN ('price')");
      return Number(row?.count) || 0;
    }

    async function processBacklog(limit: number) {
      const unprocessed = await db.all<{ id: string; data_type: string; content: string; title: string | null }>(
        "SELECT id, data_type, content, title FROM market_data_raw WHERE is_processed = 0 AND data_type NOT IN ('price') ORDER BY fetched_at ASC LIMIT ?", limit
      );
      let processed = 0;
      for (const row of unprocessed) {
        try {
          const text = row.title ? `${row.title}\n\n${row.content}` : row.content;
          await marketAtomService.extractAtomsFromRawData(row.id, text, row.data_type);
          processed++;
        } catch { /* skip */ }
        await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id);
      }
      return processed;
    }

    // Phase 1: Morning Intelligence (07:00 CET)
    cron.schedule('0 7 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 1: Morning Intelligence');
      try {
        await marketAtomService.applyAtomDecay();
        const backlog = await getBacklogSize();
        // Only fetch if backlog is manageable (< 500)
        if (backlog < 500) {
          await marketDataService.fetchAllSources();
          console.log(`[markets-schedule] Phase 1: fetched data (backlog was ${backlog})`);
        } else {
          console.log(`[markets-schedule] Phase 1: skipping fetch, processing backlog (${backlog} items)`);
        }
        // Always process — more than we fetch
        const processed = await processBacklog(40);
        console.log(`[markets-schedule] Phase 1 complete — processed ${processed} articles`);
      } catch (err) { console.error('[markets-schedule] Phase 1 error:', err); }
    }, MARKET_TZ);

    // Phase 2: Pre-Open (14:30 CET) — light fetch + process
    cron.schedule('30 14 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 2: Pre-Open');
      try {
        const backlog = await getBacklogSize();
        if (backlog < 500) await marketDataService.fetchAllSources();
        const processed = await processBacklog(20);
        console.log(`[markets-schedule] Phase 2 complete — processed ${processed}, backlog: ${backlog}`);
      } catch (err) { console.error('[markets-schedule] Phase 2 error:', err); }
    }, MARKET_TZ);

    // Phase 3: Market Open (15:45 CET) — prices only (no news to avoid backlog)
    cron.schedule('45 15 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 3: Market Open');
      try {
        const priceSources = await db.all<{ id: string }>(
          "SELECT id FROM market_data_sources WHERE is_active = 1 AND provider = 'fmp' AND config::text LIKE '%price%'"
        );
        for (const src of priceSources) {
          try { await marketDataService.fetchFromSource(src.id); } catch { /* skip */ }
        }
        console.log('[markets-schedule] Phase 3 complete — prices captured');
      } catch (err) { console.error('[markets-schedule] Phase 3 error:', err); }
    }, MARKET_TZ);

    // Phase 4: Mid-Day Intelligence (18:00 CET) — THE main cycle
    cron.schedule('0 18 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 4: Mid-Day Intelligence');
      try {
        const backlog = await getBacklogSize();
        if (backlog < 500) await marketDataService.fetchAllSources();
        // Process a big batch before intelligence
        const processed = await processBacklog(40);
        console.log(`[markets-schedule] Phase 4: processed ${processed} articles, running intelligence...`);
        await workflowOrchestrator.runDailyIntelligence();
        console.log('[markets-schedule] Phase 4 complete');
      } catch (err) { console.error('[markets-schedule] Phase 4 error:', err); }
    }, MARKET_TZ);

    // Phase 5: Market Close (22:15 CET) — EOD prices + NAV
    cron.schedule('15 22 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 5: Market Close + NAV');
      try {
        await marketDataService.fetchAllSources();
        await marketDataService.syncPricesToHistorical();
        await navEngine.updateAllActiveIndexes();
        await navEngine.updateLeaderboard();
        // Run mid-flight prediction checkpoints (no LLM cost — just price comparison)
        try {
          const checkpoints = await workflowOrchestrator.runPredictionCheckpoints();
          console.log(`[markets-schedule] Prediction checkpoints: ${checkpoints.onTrack}/${checkpoints.checked} on track`);
        } catch { /* non-fatal */ }
        console.log('[markets-schedule] Phase 5 complete — NAV calculated + prices synced');
      } catch (err) { console.error('[markets-schedule] Phase 5 error:', err); }
    }, MARKET_TZ);

    // Phase 6: Post-Market (23:00 CET) — backlog + rotating fundamental analysis
    cron.schedule('0 23 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 6: Post-Market Processing + Fundamental Analysis');
      try {
        const processed = await processBacklog(60);

        // Rotating fundamental analysis: 3 companies per night
        // Cycles through all followed companies over ~2 weeks
        try {
          const { createMarketFundamentalAnalysisService } = await import('./services/market-fundamental-analysis-service.js');
          const analysisService = await createMarketFundamentalAnalysisService(db);

          // Get all symbols we follow (portfolios + fundamentals source)
          const allSymbols = await db.all<{ symbol: string }>(
            `SELECT DISTINCT symbol FROM (
              SELECT DISTINCT symbol FROM market_index_holdings WHERE removed_at IS NULL AND symbol IS NOT NULL
              UNION
              SELECT DISTINCT symbol FROM market_data_raw WHERE data_type = 'income_statement' AND symbol IS NOT NULL
            ) s ORDER BY symbol`
          );

          // Find symbols not analyzed recently (or never analyzed)
          const staleSymbols = [];
          for (const { symbol } of allSymbols) {
            const lastNote = await db.get<{ created_at: string }>(
              'SELECT created_at FROM market_analyst_notes WHERE symbol = ? ORDER BY created_at DESC LIMIT 1', symbol
            );
            // Analyze if never done or older than 14 days
            if (!lastNote || (Date.now() - new Date(lastNote.created_at).getTime()) > 14 * 86400000) {
              staleSymbols.push(symbol);
            }
          }

          // Analyze up to 3 per night (sustainable pace)
          const toAnalyze = staleSymbols.slice(0, 3);
          let analyzed = 0;
          for (const symbol of toAnalyze) {
            try {
              const result = await analysisService.analyzeCompany(symbol);
              if (result) {
                console.log(`[markets-schedule] Analyzed ${symbol}: "${result.headline}" (rating: ${result.rating}/5, ${result.atomsCreated} atoms)`);
                analyzed++;
              }
            } catch (err) { console.error(`[markets-schedule] Failed to analyze ${symbol}:`, err); }
          }

          console.log(`[markets-schedule] Phase 6 complete — processed ${processed} articles, analyzed ${analyzed}/${toAnalyze.length} companies (${staleSymbols.length} remaining)`);
        } catch (err) {
          console.error('[markets-schedule] Fundamental analysis error:', err);
          console.log(`[markets-schedule] Phase 6 complete — processed ${processed} articles (analysis skipped)`);
        }
      } catch (err) { console.error('[markets-schedule] Phase 6 error:', err); }
    }, MARKET_TZ);

    // Phase 7: Weekend Deep Dive (Saturday 10:00 CET) — validation + bigger analysis batch
    cron.schedule('0 10 * * 6', async () => {
      console.log('[markets-schedule] Phase 7: Weekend Deep Dive');
      try {
        await workflowOrchestrator.runPredictionValidation();
        const processed = await processBacklog(100);

        // Weekend: analyze up to 8 companies (bigger batch)
        try {
          const { createMarketFundamentalAnalysisService } = await import('./services/market-fundamental-analysis-service.js');
          const analysisService = await createMarketFundamentalAnalysisService(db);
          const result = await analysisService.runBatchAnalysis(8);
          console.log(`[markets-schedule] Phase 7 complete — validated predictions, processed ${processed} articles, analyzed ${result.analyzed} companies`);
        } catch {
          console.log(`[markets-schedule] Phase 7 complete — validated predictions, processed ${processed} articles`);
        }
      } catch (err) { console.error('[markets-schedule] Phase 7 error:', err); }
    }, MARKET_TZ);

    // Phase 8: Weekly Pulse — short-term directional predictions (Monday + Thursday 09:00 CET)
    cron.schedule('0 9 * * 1,4', async () => {
      console.log('[markets-schedule] Phase 8: Weekly Pulse Predictions');
      try {
        await workflowOrchestrator.runWeeklyPulse();
        console.log('[markets-schedule] Phase 8 complete');
      } catch (err) { console.error('[markets-schedule] Phase 8 error:', err); }
    }, MARKET_TZ);

    // Daily auto-verification of expired predictions (12:00 CET weekdays)
    cron.schedule('0 12 * * 1-5', async () => {
      try {
        const { createPredictionVerifier } = await import('./services/market-prediction-verifier.js');
        const verifier = await createPredictionVerifier(db);
        const result = await verifier.runAutoVerification();
        if (result.verified > 0) {
          console.log(`[markets-verify] Daily: verified ${result.verified} (${result.correct} correct, ${result.incorrect} wrong)`);
        }
      } catch (err) { console.error('[markets-verify] Daily verification error:', err); }
    }, MARKET_TZ);

    // Reduced hourly fetch: prices only every 2 hours during market (14:00-22:00)
    cron.schedule('0 14,16,18,20,22 * * 1-5', async () => {
      try {
        const priceSources = await db.all<{ id: string }>(
          "SELECT id FROM market_data_sources WHERE is_active = 1 AND provider = 'fmp' AND config::text LIKE '%price%'"
        );
        for (const src of priceSources) {
          try { await marketDataService.fetchFromSource(src.id); } catch { /* skip */ }
        }
      } catch { /* silent */ }
    }, MARKET_TZ);

    // News fetch 3x per day (not hourly) — 08:00, 15:00, 21:00
    cron.schedule('0 8,15,21 * * 1-5', async () => {
      const backlog = await getBacklogSize();
      if (backlog > 1000) {
        console.log(`[markets-news] Skipping news fetch — backlog too large (${backlog})`);
        return;
      }
      try {
        const newsSources = await db.all<{ id: string }>(
          "SELECT id FROM market_data_sources WHERE is_active = 1 AND (config::text LIKE '%news%' OR provider = 'rss')"
        );
        for (const src of newsSources) {
          try { await marketDataService.fetchFromSource(src.id); } catch { /* skip */ }
        }
      } catch { /* silent */ }
    }, MARKET_TZ);

    // Event trigger check 3x per day (not hourly)
    cron.schedule('0 9,16,22 * * 1-5', async () => {
      try {
        const result = await eventTriggerService.checkAndFireTriggers();
        if (result.fired > 0) console.log(`[markets-events] ${result.fired} triggers fired`);
      } catch { /* silent */ }
    }, MARKET_TZ);

    // Daily materialized view refresh (4 AM CET)
    cron.schedule('0 4 * * *', async () => {
      try {
        await db.run("REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_index_leaderboard_ranked");
      } catch { /* silent */ }
    }, MARKET_TZ);

    console.log('[markets-schedule] Sustainable CET schedule active — quality over speed');

    // ── Startup Catch-Up: recover missed workflows after downtime ──────────
    setTimeout(async () => {
      try {
        console.log('[markets-catchup] Checking for missed workflows...');
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        let catchUpActions = 0;

        // 1. Process backlog immediately (always useful after restart)
        const backlog = await getBacklogSize();
        if (backlog > 0) {
          const processed = await processBacklog(Math.min(backlog, 100));
          console.log(`[markets-catchup] Processed ${processed}/${backlog} backlog items`);
          catchUpActions++;
        }

        // 1b. Sync prices to historical table
        try {
          await marketDataService.syncPricesToHistorical();
        } catch { /* non-fatal */ }

        // 1c. Ensure sector ETF data exists for rotation analysis
        try {
          const { backfilled } = await marketDataService.ensureSectorETFData();
          if (backfilled.length > 0) {
            console.log(`[markets-catchup] Backfilled sector ETFs: ${backfilled.join(', ')}`);
            catchUpActions++;
          }
        } catch { /* non-fatal */ }

        // 2. Check if daily intelligence ran today (weekdays only)
        if (isWeekday) {
          const lastIntel = await db.get<{ started_at: string }>(
            "SELECT started_at FROM workflow_runs WHERE workflow_id = 'wf_markets_daily_intelligence' AND status = 'success' ORDER BY started_at DESC LIMIT 1"
          );
          const hoursSinceIntel = lastIntel
            ? (now.getTime() - new Date(lastIntel.started_at).getTime()) / 3600000
            : Infinity;

          if (hoursSinceIntel > 24) {
            console.log(`[markets-catchup] Daily intelligence last ran ${hoursSinceIntel === Infinity ? 'never' : Math.round(hoursSinceIntel) + 'h ago'} — running now`);
            try {
              await marketDataService.fetchAllSources();
              await workflowOrchestrator.runDailyIntelligence();
              catchUpActions++;
              console.log('[markets-catchup] Daily intelligence catch-up complete');
            } catch (err) { console.error('[markets-catchup] Daily intelligence catch-up failed:', err); }
          }
        }

        // 3. Check if NAV was computed today
        const lastNav = await db.get<{ nav_date: string }>(
          "SELECT nav_date FROM market_index_nav_history ORDER BY nav_date DESC LIMIT 1"
        );
        const hoursSinceNav = lastNav
          ? (now.getTime() - new Date(lastNav.nav_date).getTime()) / 3600000
          : Infinity;

        if (hoursSinceNav > 24 && isWeekday) {
          console.log(`[markets-catchup] NAV last calculated ${hoursSinceNav === Infinity ? 'never' : Math.round(hoursSinceNav) + 'h ago'} — updating`);
          try {
            await navEngine.updateAllActiveIndexes();
            await navEngine.updateLeaderboard();
            catchUpActions++;
            console.log('[markets-catchup] NAV catch-up complete');
          } catch (err) { console.error('[markets-catchup] NAV catch-up failed:', err); }
        }

        // 4. Check if prediction validation ran this week (should run Saturday)
        if (dayOfWeek === 6 || dayOfWeek === 0) {
          const lastValidation = await db.get<{ started_at: string }>(
            "SELECT started_at FROM workflow_runs WHERE workflow_id = 'wf_markets_prediction_validation' AND status = 'success' ORDER BY started_at DESC LIMIT 1"
          );
          const daysSinceValidation = lastValidation
            ? (now.getTime() - new Date(lastValidation.started_at).getTime()) / 86400000
            : Infinity;

          if (daysSinceValidation > 7) {
            console.log(`[markets-catchup] Prediction validation last ran ${daysSinceValidation === Infinity ? 'never' : Math.round(daysSinceValidation) + ' days ago'} — running now`);
            try {
              await workflowOrchestrator.runPredictionValidation();
              catchUpActions++;
              console.log('[markets-catchup] Prediction validation catch-up complete');
            } catch (err) { console.error('[markets-catchup] Prediction validation catch-up failed:', err); }
          }
        }

        // 5. Check if weekly pulse ran recently
        const lastPulse = await db.get<{ started_at: string }>(
          "SELECT started_at FROM workflow_runs WHERE workflow_id = 'wf_markets_weekly_pulse' AND status = 'success' ORDER BY started_at DESC LIMIT 1"
        );
        const daysSincePulse = lastPulse
          ? (now.getTime() - new Date(lastPulse.started_at).getTime()) / 86400000
          : Infinity;
        if (daysSincePulse > 4 && isWeekday) {
          console.log(`[markets-catchup] Weekly pulse last ran ${daysSincePulse === Infinity ? 'never' : Math.round(daysSincePulse) + ' days ago'} — running now`);
          try {
            await workflowOrchestrator.runWeeklyPulse();
            catchUpActions++;
            console.log('[markets-catchup] Weekly pulse catch-up complete');
          } catch (err) { console.error('[markets-catchup] Weekly pulse catch-up failed:', err); }
        }

        // 6. Refresh materialized views (always safe, idempotent)
        try {
          await db.run("REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_prediction_track_record");
          await db.run("REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_index_stats");
          await db.run("REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_index_leaderboard_ranked");
          catchUpActions++;
        } catch { /* MVs may not exist yet */ }

        if (catchUpActions > 0) {
          console.log(`[markets-catchup] Startup recovery complete — ${catchUpActions} actions taken`);
        } else {
          console.log('[markets-catchup] All workflows up to date — nothing to catch up');
        }
      } catch (err) {
        console.error('[markets-catchup] Startup catch-up failed:', err);
      }
    }, 10_000); // Run 10 seconds after startup to let everything initialize

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

// Community message queue processing — every 30 seconds
setInterval(async () => {
  try {
    const { createMessageQueueService } = await import('./services/message-queue-service.js');
    const queueService = await createMessageQueueService(db);
    const result = await queueService.processQueue();
    if (result.sent > 0 || result.failed > 0) {
      console.log(`[community-queue] Processed: ${result.sent} sent, ${result.failed} failed`);
    }
  } catch { /* silent */ }
}, 30_000);

// P2P replay protection — purge expired nonces every 5 minutes
setInterval(async () => {
  try {
    await db.run("DELETE FROM p2p_message_nonces WHERE created_at < NOW() - INTERVAL '10 minutes'");
  } catch { /* silent */ }
}, 5 * 60_000);

// Relay collection — check peer relays for messages stored for us every 2 minutes
setInterval(async () => {
  try {
    const { createMessageQueueService } = await import('./services/message-queue-service.js');
    const queueService = await createMessageQueueService(db);
    const { collected, processed } = await queueService.collectFromPeerRelays();
    if (collected > 0) {
      console.log(`[relay-collect] Collected ${collected} messages, processed ${processed}`);
    }
  } catch { /* silent */ }
}, 2 * 60_000);

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
