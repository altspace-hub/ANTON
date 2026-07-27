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
import { createIntelligenceHealthRoutes } from './routes/intelligence-health.js';
import { createClaudeRoutes } from './routes/claude.js';
import { createRerunRoutes } from './routes/rerun.js';
import filesRouter from './routes/files.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createWorkTimelineRoutes } from './routes/work-timeline.js';
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
import { createAuditTrailRoutes } from './routes/audit-trail.js';
import { createOrchestratorGateRoutes } from './routes/orchestrator-gate.js';
import { createSchoolEvidenceRoutes } from './routes/school-evidence.js';
import { createMarketConsulRoutes } from './routes/market-consul.js';
import { createCivicExtendedRoutes } from './routes/civic-extended.js';
import { createExchangeRoutes } from './routes/exchange.js';
import { createSettingsRoutes } from './routes/settings.js';
import { createCustomModelEndpointsRoutes } from './routes/custom-model-endpoints.js';
import { seedApeApiEndpoint } from './services/apeapi-seed.js';
import { seedMoonshotEndpoint } from './services/moonshot-seed.js';
import { createRagRoutes } from './routes/rag.js';
import { createEurLexRoutes } from './routes/eurlex.js';
import { createAuthMiddleware, requireAdminOrSolo } from './middleware/auth.js';
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
import { createTabularReviewRoutes } from './routes/tabular-review.js';
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
import { createProcureExtendedRoutes } from './routes/procure-extended.js';
import { createCivicRoutes } from './routes/civic.js';
import { createGrowRoutes } from './routes/grow.js';
import { createHardwareRoutes } from './routes/hardware.js';
import { createPortalsRoutes } from './routes/portals.js';
import { createPortalBookmarksRoutes } from './routes/portal-bookmarks.js';
import { createTrustedStoreRoutes } from './routes/trusted-stores.js';
import { createStarterPackRoutes } from './routes/starter-packs.js';
import { createJobsRoutes } from './routes/jobs.js';
import { createMarketplaceVisitorRoutes } from './routes/marketplace-visitor.js';
import { createFriendsRoutes } from './routes/friends.js';
import { createVideoRoutes } from './routes/video.js';
import { createEvidencePackRoutes, createSharedPackRoutes } from './routes/evidence-pack.js';
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
import { startMeshDialer } from './services/mesh/bootstrap.js';

// ── Startup validation ────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  logger.warn('ANTHROPIC_API_KEY is not set — Claude API calls will fail');
}

// Deployment mode: solo (default, no auth) or team (explicit opt-in, JWT auth).
// The old SCALE-02 auto-detect ("DATABASE_URL=postgres → team") is retired: ANTON is
// PostgreSQL-only now, so every install has DATABASE_URL and the signal is meaningless.
// Worse, modules that snapshot DEPLOYMENT_MODE at import time evaluated before this
// block, so auto-detected "team" REPORTED team everywhere while auth silently ran the
// solo branch. Team mode must be set explicitly in .env; auth reads the env lazily.
if (!process.env.DEPLOYMENT_MODE) {
  process.env.DEPLOYMENT_MODE = 'solo';
  // WARN, not info. Defaulting to solo means every request is served as an admin
  // with no authentication — correct on a laptop, a data breach on a shared host.
  // .env.example previously implied DATABASE_URL turned team mode on by itself, so
  // operators have followed that guidance and shipped an open instance believing it
  // was authenticated. The default stays solo (right for the common case); the log
  // now states the consequence rather than just the fact.
  logger.warn(
    '[deploy] DEPLOYMENT_MODE not set — defaulting to SOLO: authentication is OFF and '
    + 'every request is served as an admin. This is correct for a single-user machine. '
    + 'If anyone else can reach this server, stop and set DEPLOYMENT_MODE=team (plus JWT_SECRET) in .env.',
  );
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
// Allow any localhost port + LAN IPs over BOTH http and https so the proxy
// always works AND the Capacitor companion app (whose WebView origin is
// `https://localhost` because androidScheme/iosScheme = 'https') can reach
// the API. The regex matches localhost, 127.0.0.1, RFC1918 LAN ranges,
// and the Capacitor custom schemes (capacitor:// + ionic://) on Android/iOS.
const isLocalhostOrigin = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)
  || /^(capacitor|ionic):\/\/localhost$/.test(origin);

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

// Restore Settings-persisted provider API keys (app_settings → process.env)
// BEFORE any LLM client is constructed below (quality-scoring Anthropic
// instance, claude-client singleton, route factories). Keys set in the
// Settings UI survive restarts via this loader; names only are logged.
try {
  const { loadPersistedEnvKeys } = await import('./services/env-keys-store.js');
  const restoredKeys = await loadPersistedEnvKeys(db);
  if (restoredKeys.length > 0) {
    console.log(`[settings] restored persisted provider key(s): ${restoredKeys.join(', ')}`);
  }
} catch (err) {
  console.warn('[settings] failed to restore persisted provider keys:', err instanceof Error ? err.message : err);
}

// FC-CONN-SEED: pick up FUTURECHAIN_RPC_URL from the portable bundle's
// run-anton.ps1 probe (Step 5.5) on first boot. Only applies when the
// fc_connection_config row is still at its migration-081 defaults —
// any manual config via Settings → FutureChain is left alone.
try {
  const { createFCConnectionService } = await import('./services/fc-connection-service.js');
  const fcConn = await createFCConnectionService(db);
  const result = await fcConn.applyEnvOverrides();
  if (result.applied) {
    console.log(`[fc] seeded node_url from FUTURECHAIN_RPC_URL → ${result.node_url} (stub_mode=false)`);
  } else if (process.env.FUTURECHAIN_RPC_URL) {
    console.log(`[fc] env override skipped: ${result.reason}`);
  }
} catch (err) {
  console.warn('[fc] applyEnvOverrides failed:', err instanceof Error ? err.message : err);
}

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

// MCP authentication guard (any deployment mode — was team-only, which left the full
// unauthenticated tool surface reachable from the LAN on solo installs).
// - MCP_SECRET set → require Authorization: Bearer <MCP_SECRET>.
// - MCP_SECRET unset → loopback clients only: local MCP clients (Cursor, Claude Code)
//   keep working with zero config, but network clients are refused.
app.use('/mcp', (req, res, next) => {
  const secret = process.env.MCP_SECRET;
  if (secret) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token !== secret) {
      return res.status(401).json({ error: 'MCP access requires Authorization: Bearer <MCP_SECRET>' });
    }
    return next();
  }
  const ip = req.socket.remoteAddress ?? '';
  const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLoopback) {
    return res.status(401).json({ error: 'MCP over the network requires MCP_SECRET (send Authorization: Bearer <MCP_SECRET>)' });
  }
  next();
});

// MCP endpoint — mounted at /mcp, outside /api and outside auth middleware
// MCP clients (Cursor, Claude Code) do not perform browser auth
app.use('/mcp', await createMcpRouter(db));

// Prune expired CSRF tokens every hour
setInterval(pruneExpiredCsrfTokens, 60 * 60 * 1000);

// Prune expired Portals caches (resolution, descriptor, replay nonces)
// every hour. Without this, three tables grow unbounded forever.
setInterval(async () => {
  try {
    const { createRegistryClient } = await import('./services/registry-client/index.js');
    const client = createRegistryClient(db, { baseUrl: process.env.PORTAL_REGISTRY_URL ?? 'https://registry.anton.space/v1' });
    const r = await client.pruneExpiredCaches();
    if (r.resolution + r.descriptor + r.nonces > 0) {
      console.log(`[portals] pruned: ${r.resolution} resolution + ${r.descriptor} descriptor + ${r.nonces} nonce rows`);
    }
  } catch (e) {
    console.warn('[portals] cache prune failed:', e instanceof Error ? e.message : e);
  }
}, 60 * 60 * 1000);

// Portals transparency-log freshness check (audit #3c). Warn when the
// registry's Signed Tree Head stops advancing — registry down, withheld
// log, or network broken. Edge-triggered so we don't spam logs.
// Only runs when PORTAL_REGISTRY_URL is explicitly configured — the legacy
// transparency-log registry is not deployed, so a dead-host default would
// log a failed fetch every 20 minutes on every install forever. The relay
// HTTP registry (RELAY_PORTAL_SUBMIT_URL) is the active publishing path
// and does not use STHs.
if (process.env.PORTAL_REGISTRY_URL && process.env.PORTAL_STH_MONITOR_DISABLED !== 'true') {
  try {
    const { createRegistryClient } = await import('./services/registry-client/index.js');
    const { startSthGapMonitor } = await import('./services/registry-client/sth-gap-check.js');
    const sthClient = createRegistryClient(db, { baseUrl: process.env.PORTAL_REGISTRY_URL });
    startSthGapMonitor(sthClient);
  } catch (e) {
    console.warn('[portals] STH monitor failed to start:', e instanceof Error ? e.message : e);
  }
}

// API routes — auth routes and config must be registered BEFORE the auth middleware
app.use('/api', await createAuthRoutes(db));

// Channel Bridge public query endpoint — uses per-bridge Bearer token, not session auth
app.use('/api', await createBridgePublicRoutes(db, anthropic));

// Evidence Pack — public regulator endpoints (token IS the auth, no JWT,
// no CSRF). Must mount before authMiddleware. Owner endpoints stay below.
app.use('/api', createSharedPackRoutes(db));

// Payment Gateway public API (API key auth, no session required)
const { createFCGatewayRoutes } = await import('./routes/fc-gateway.js');
const { adminRouter: gwAdmin, publicRouter: gwPublic } = await createFCGatewayRoutes(db);
app.use('/api/gateway', gwPublic);

// Web e-commerce checkout — "Pay with FutureChain" (plan #11 / Area 7).
// Create is Bearer-apiKey (reuses the gateway validateApiKey); status/QR are
// public-by-id for the embeddable widget. No keys on the merchant; amount is
// sealed server-side. See docs/WEB_CHECKOUT.md.
const { createFCCheckoutRoutes } = await import('./routes/fc-checkout.js');
const checkoutRouter = await createFCCheckoutRoutes(db);
app.use('/api/checkout', checkoutRouter);
// Background settlement sweeper: advance pending→seen→confirmed for live
// requests + fold in lazy expiry. Status GETs also drive a poll, so this is a
// belt-and-braces loop for requests no one is currently watching. Opt out with
// WEB_CHECKOUT_SWEEP_DISABLED=true.
if (process.env.WEB_CHECKOUT_SWEEP_DISABLED !== 'true') {
  const { createCheckoutService } = await import('./services/checkout-service.js');
  const checkoutSvc = await createCheckoutService(db);
  const sweep = setInterval(() => { void checkoutSvc.pollAllLive().catch(() => {}); }, 15_000);
  sweep.unref();
}

// Companion App Gateway — M9: controlled by APP_GATEWAY_ENABLED (default: enabled)
// Radar fetcher is created here (early) so the companion-app gateway can
// expose POST /api/app/radar/scan; the main /api/radar mount below shares
// the same instance.
const radarFetcher = anthropic ? await createRadarFetcher(db, anthropic) : undefined;
const APP_GATEWAY_ENABLED = process.env.APP_GATEWAY_ENABLED !== 'false';
let appGatewaySvc: Awaited<ReturnType<typeof createAppGatewayRoutes>>['service'] | null = null;
if (APP_GATEWAY_ENABLED) {
  // SEC: Rate-limit auth endpoints (brute-force protection)
  app.use('/api/app/auth', authLimiter);
  // SEC: General rate limit on all app public routes
  app.use('/api/app', userLimiter);
  const { publicRouter: appPublic, adminRouter: appAdmin, service } = await createAppGatewayRoutes(db, radarFetcher);
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
app.use('/api', createIntelligenceHealthRoutes(db)); // Wave 3.9: honest background-intelligence status
app.use('/', await createMetricsRouter(db)); // OBS-03: Prometheus /metrics — mounted at root, not /api

// OBS-03: request + error counters
app.use((_req, _res, next) => { incrementRequests(); next(); });
app.use((_err: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
  incrementErrors();
  next(_err);
});

const claudeRouter = await createClaudeRoutes(db, anthropic);
app.use('/api', claudeRouter);
// "Rerun with…" (Wave 2.3) — dispatches internally INTO claudeRouter so a rerun
// goes through the exact live pipeline (composition, adapters, persistence).
app.use('/api', createRerunRoutes(db, claudeRouter));
app.use('/api', filesRouter);
app.use('/api', await createSessionRoutes(db));
// Unified work timeline (4.3) — sessions ∪ engagements ∪ workflow runs/executions ∪ discovery
app.use('/api', createWorkTimelineRoutes(db));
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
app.use('/api/audit-trail', createAuditTrailRoutes(db));
app.use('/api/orchestrator-gate', createOrchestratorGateRoutes(db));
app.use('/api/school', createSchoolEvidenceRoutes(db));
app.use('/api/markets/consul', createMarketConsulRoutes(db));
app.use('/api/civic', createCivicExtendedRoutes(db));
app.use('/api', await createExchangeRoutes(db));
app.use('/api', await createSettingsRoutes(db));
app.use('/api', createCustomModelEndpointsRoutes(db));
// Auto-register ApeAPI (compat: bundle) from APEAPI_API_KEY if set — one-step onboarding.
await seedApeApiEndpoint(db);
// Same for Moonshot AI (Kimi) from MOONSHOT_API_KEY — also OpenAI-compatible, so it
// needs no adapter of its own; models become addressable as compat:kimi:<model>.
await seedMoonshotEndpoint(db);
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
// Radar fetcher created earlier (above app-gateway mount) so the companion
// app can share the same instance for POST /api/app/radar/scan.
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
// Mission sub-routers (Phases 2-5) MUST mount BEFORE the generic missions
// router so collection paths like /missions/delegations/inbound are not
// captured by missions.ts's GET /missions/:id (which would 404 with id='delegations').
// Phase 5 — AAP delegation
const { createMissionDelegationRoutes } = await import('./routes/mission-delegation.js');
app.use('/api', createMissionDelegationRoutes(db));
// Phase 4 — Financial: FutureChain wallet integration, payment proposals, approval + cancel-window workflow
const { createMissionPaymentRoutes } = await import('./routes/mission-payments.js');
app.use('/api', createMissionPaymentRoutes(db));
// Phase 3 — Intelligence + Delivery: output channels, risk classification, parallel-review checkpoints (BEEHIVE-backed)
const { createMissionDeliveryRoutes } = await import('./routes/mission-delivery.js');
app.use('/api', createMissionDeliveryRoutes(db));
// Grow CRM bridge — sales-style mission outputs route to grow_contacts/opportunities/signals (spec v2 §13.3)
const { createMissionGrowRoutes } = await import('./routes/mission-grow.js');
app.use('/api', createMissionGrowRoutes(db));
// Phase 2 — Action Layer: credential vault, browser automation, service packs
const { createMissionCredentialRoutes } = await import('./routes/mission-credentials.js');
app.use('/api', createMissionCredentialRoutes(db));
const { createBrowserRoutes } = await import('./routes/mission-browser.js');
app.use('/api', createBrowserRoutes(db));
const { createServicePackRoutes } = await import('./routes/service-packs.js');
app.use('/api', createServicePackRoutes(db));
// Phase 1 — generic missions router (mounted LAST so its /missions/:id catch-all
// doesn't shadow the sub-routers above)
const { createMissionRoutes } = await import('./routes/missions.js');
app.use('/api', createMissionRoutes(db));

// Output Transformation System — renderer registry + transform endpoints
const { createRendererRoutes } = await import('./routes/renderers.js');
app.use('/api', createRendererRoutes(db));
// AI Council — dissent-ledger extraction over persisted council sessions (Wave 4.2)
const { createCouncilRoutes } = await import('./routes/council.js');
app.use('/api', createCouncilRoutes(db));
// ANTON Studio — core-team 7-expert panel + code-computed enforced gate (Studio P2)
const { createCoreTeamRoutes } = await import('./routes/core-team.js');
app.use('/api', createCoreTeamRoutes(db));
// ANTON Studio — kickoff Workshop → Project Charter → seeds a Studio project (Studio P1)
const { createCodingWorkshopRoutes } = await import('./routes/coding-workshop.js');
app.use('/api', createCodingWorkshopRoutes(db));
// ANTON Studio — server-side iterate-to-finish ORCHESTRATOR + .anton blueprint export (Studio P5)
const { createCodingStudioRoutes } = await import('./routes/coding-studio.js');
app.use('/api', createCodingStudioRoutes(db));
// ANTON Studio — real Git (branch-per-release / commit-per-task) over the workspace (Studio P6)
const { createCodingGitRoutes } = await import('./routes/coding-git.js');
app.use('/api', createCodingGitRoutes(db));
// ANTON Studio — live local preview server (opt-in CODING_STUDIO_PREVIEW; owns only its own spawned PIDs) (Studio P6)
const { createCodingPreviewRoutes } = await import('./routes/coding-preview.js');
app.use('/api', createCodingPreviewRoutes(db));
// Save-chat-as-module v2 — conversation → distilled module prompt (Wave 4.8)
const { createDistillRoutes } = await import('./routes/distill.js');
app.use('/api', createDistillRoutes(db));
// Seed the renderer registry on startup (idempotent — inserts new entries,
// updates existing, never overrides admin-set status)
{
  const { createRendererRegistry } = await import('./services/renderer-registry.js');
  const registry = createRendererRegistry(db);
  try {
    const seed = await registry.seedRegistry();
    console.log(`[renderer-registry] seeded: ${seed.inserted} inserted, ${seed.updated} updated`);
  } catch (err) {
    console.error('[renderer-registry] seed failed:', err instanceof Error ? err.message : err);
  }
}

// Risk Atlas — universal seven-stage threat-path methodology
const { createAtlasRoutes } = await import('./routes/atlas.js');
app.use('/api', createAtlasRoutes(db, anthropic));
// Seed built-in industry packs (idempotent — INSERT … ON CONFLICT DO UPDATE)
{
  const { createAtlasPackLoader } = await import('./services/risk-atlas/atlas-pack-loader.js');
  const atlasPacks = createAtlasPackLoader(db);
  try {
    const seed = await atlasPacks.seedBuiltinPacks();
    console.log(`[risk-atlas] packs seeded: ${seed.inserted} inserted, ${seed.updated} updated${seed.errors.length ? `, errors: ${seed.errors.length}` : ''}`);
    if (seed.errors.length > 0) console.warn('[risk-atlas] pack seed warnings:', seed.errors);
  } catch (err) {
    console.error('[risk-atlas] pack seed failed:', err instanceof Error ? err.message : err);
  }
}
// Mission payment execution tick — settles approved payments past their cancel window
{
  const { createMissionBudget } = await import('./services/missions/mission-budget.js');
  const missionBudget = await createMissionBudget(db);
  setInterval(async () => {
    try {
      const result = await missionBudget.runPendingExecutions();
      if (result.executed > 0 || result.failed > 0) {
        console.log(`[mission-payments] tick: executed=${result.executed} failed=${result.failed} waiting=${result.waiting}`);
      }
    } catch (err) {
      console.error('[mission-payments] tick error:', err);
    }
  }, 60_000); // every minute
}
// Mission delivery retry tick — re-attempts deliveries that failed transiently
{
  const { createMissionDelivery } = await import('./services/missions/mission-delivery.js');
  const missionDelivery = createMissionDelivery(db);
  setInterval(async () => {
    try {
      const result = await missionDelivery.retryPending();
      if (result.retried > 0) {
        console.log(`[mission-delivery] retry tick: retried=${result.retried} succeeded=${result.succeeded} failed=${result.failed}`);
      }
    } catch (err) {
      console.error('[mission-delivery] retry tick error:', err);
    }
  }, 180_000); // every 3 minutes
}
// Mission checkpoint poll tick — resumes paused missions whose BEEHIVE session concluded
{
  const { pollCheckpointBeehive } = await import('./services/missions/mission-checkpoint.js');
  setInterval(async () => {
    try {
      const paused = await db.all<{ mission_id: string }>(
        `SELECT DISTINCT mission_id FROM missions.mission_tasks
         WHERE task_type = 'checkpoint' AND status = 'paused' AND beehive_session_id IS NOT NULL`,
      );
      for (const row of paused) {
        try {
          const result = await pollCheckpointBeehive(db, row.mission_id);
          if (result.resolved > 0) {
            console.log(`[mission-checkpoints] mission=${row.mission_id} resolved=${result.resolved} pending=${result.pending}`);
          }
        } catch (err) {
          console.error(`[mission-checkpoints] mission=${row.mission_id} error:`, err);
        }
      }
    } catch (err) {
      console.error('[mission-checkpoints] tick error:', err);
    }
  }, 60_000); // every minute
}
// Mission runner tick (Wave-2 2A.1) — advances 'active' missions in the
// background so missions are genuinely autonomous instead of manual-click.
// Only status='active' missions advance ('briefed' awaits human plan
// approval); per-mission in-flight lock + global concurrency cap live in
// mission-runner.ts. Autonomy gates / checkpoints / budgets pause exactly as
// they do on the manual endpoint. Opt out: MISSIONS_RUNNER_DISABLED=true.
if (process.env.MISSIONS_RUNNER_DISABLED === 'true') {
  console.log('[mission-runner] disabled via MISSIONS_RUNNER_DISABLED — missions advance only via the manual API/UI');
} else {
  const { createMissionRunner, RUNNER_TICK_MS, RUNNER_MAX_CONCURRENT_MISSIONS } = await import('./services/missions/mission-runner.js');
  const missionRunner = createMissionRunner(db);
  setInterval(async () => {
    try {
      const result = await missionRunner.tick();
      if (result.picked > 0) {
        console.log(`[mission-runner] tick: missions=${result.picked} tasks_ok=${result.advanced} completed=${result.completed} paused=${result.paused} failed=${result.failed}`);
      }
    } catch (err) {
      console.error('[mission-runner] tick error:', err);
    }
  }, RUNNER_TICK_MS);
  console.log(`[mission-runner] background runner active (every ${RUNNER_TICK_MS / 1000}s, ≤${RUNNER_MAX_CONCURRENT_MISSIONS} missions in flight). Set MISSIONS_RUNNER_DISABLED=true to disable.`);
}
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
// FutureChain Payment Gateway — admin routes (session-protected + admin-gated).
// All 5 routes live under /futurechain/gateway/ (config read/write, API-key
// regeneration, audit log, stats), so the guard is scoped to that exact prefix
// rather than to the '/api' mount — a middleware on '/api' here would run for
// every route mounted BELOW this line and 403 non-admins across the app.
app.use('/api/futurechain/gateway', requireAdminOrSolo);
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
app.use('/webhooks', webhookLimiter);                 // Rate limit public webhook endpoint (SEC-19) — matches the root mount below
app.use('/', await createWebhooksPublicRoutes(db));        // Public inbound webhook endpoint (no ANTON auth) — POST /webhooks/inbound/:id
app.use('/api', await createSessionResumeRoutes(db));      // Session Resume (snapshots)
app.use('/api', await createInsightsRoutes(db));           // Proactive Intelligence
app.use('/api', await createOrgContextRoutes(db));         // Org Context Layer (prompt layer 2a)
app.use('/api', await createContinuityRoutes(db));         // Org Continuity (key-person risk)
app.use('/api', await createKnowledgePacksRoutes(db));     // Regulatory Knowledge Packs
app.use('/api', await createLegalResearchRoutes(db, anthropic));   // Counsel's Desk — legal research sessions
app.use('/api', await createGapAssessmentsRoutes(db, anthropic)); // Compliance Gap Assessor
app.use('/api', createTabularReviewRoutes(db));                    // Tabular Review — folder-of-docs → AI grid (Wave 1: AMLR Obligation Mapping)
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
app.use('/api', await createModelRouterRoutes(db));
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
// Phase-B.2 extension (vendors directory / benchmarks / RFQ templates) — was
// never mounted, leaving 3 fully-built pages fetching 404s (fixed 2026-07-17).
app.use('/api/procure', createProcureExtendedRoutes(db));

// Civic Pillar — government & public institution navigator
app.use('/api', await createCivicRoutes(db));

// Grow Pillar — CRM & business development intelligence
app.use('/api', await createGrowRoutes(db));

// Hardware Build (Tier 5 of Coding area) — HKPs, families, paths
app.use('/api', createHardwareRoutes(db));

// Portals (spec v0.2) — user-created ANTON-only web spaces with capability descriptors
app.use('/api', createPortalsRoutes(db));
app.use('/api', createPortalBookmarksRoutes(db));
// Trusted Stores (P0) — pin + mutual key-anchored verification of favourite sellers
app.use('/api', createTrustedStoreRoutes(db));
app.use('/api', await createStarterPackRoutes(db));
app.use('/api', createJobsRoutes(db));
app.use('/api', createMarketplaceVisitorRoutes(db));
app.use('/api', createFriendsRoutes(db));
app.use('/api', createVideoRoutes(db));

// Evidence Pack (regulator-ready audit bundles, EVIDENCE_PACK_SPEC.md)
app.use('/api', createEvidencePackRoutes(db));

// Talent — Discovery-driven recruitment with EU AI Act compliance
app.use('/api', await createTalentRoutes(db));

// Specialized Agents — autonomous AI personas for business functions
const { createAgentRoutes } = await import('./routes/agents.js');
app.use('/api', await createAgentRoutes(db));

// Companion App Gateway — admin routes (session-protected)
if (APP_GATEWAY_ENABLED) {
  const appAdminRouter = (app as unknown as Record<string, unknown>)._appAdminRouter as import('express').Router;
  // Admin-gated: these 33 routes mint enrollment packages for arbitrary users,
  // do org CRUD, repoint the mesh relay and inject checkpoints. They sit behind
  // authMiddleware, but that only proves SOME user — in team mode a viewer
  // reached them. Applied at the mount rather than inside app-gateway.ts on
  // purpose: importing middleware/auth.js there would pull its module-level
  // JWT_SECRET throw into the import graph of tests that construct the router
  // directly (app-gateway.ts deliberately imports SOLO_USER_ID from the
  // side-effect-free user-constants.js for the same reason).
  //
  // NOTE this is NOT what keeps a mesh peer out — solo mode is the default and
  // stamps every request role:'admin', so requireAdminOrSolo passes for mesh
  // traffic too. The mesh path is bounded by the allowlist in
  // services/mesh/bridge.ts, which never dispatches /api/admin/* at all.
  app.use('/api/admin/app', requireAdminOrSolo, appAdminRouter);
}

// Serve companion app PWA at /app (if built)
const appDist = path.join(__dirname, '..', 'dist', 'app');
app.use('/app', express.static(appDist));
app.get('/app/*', (_req, res) => {
  res.sendFile(path.join(appDist, 'index.html'));
});

// Serve the static Help & Knowledge Base at /help (docs/help/, 24 pages,
// v0.7.5). Mounted 2026-07-17 — the site was fully built but unreachable from
// the product (no route). Must precede the SPA catch-all below.
const helpDist = path.join(__dirname, '..', 'docs', 'help');
app.use('/help', express.static(helpDist));
app.get('/help', (_req, res) => res.sendFile(path.join(helpDist, 'index.html')));

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

// Bind address. In solo mode every /api request is auto-admin, so exposing the port
// to the LAN hands the full admin surface to any device on the network — default to
// loopback and widen only on explicit LAN intent:
//   - ANTON_LAN_BIND=true|false  → explicit override in either direction;
//   - otherwise, any of APP_GATEWAY_PUBLIC_URL / APP_GATEWAY_MDNS=true /
//     APP_GATEWAY_LAN_BROWSE=true (documented network-facing opt-ins for phone
//     pairing) implies LAN intent → 0.0.0.0.
// LAN binding uses 0.0.0.0 (not the Node default) because Windows can otherwise pick
// IPv6-loopback-only, making LAN-IP phone pairing silently fail. USB phone workflows
// (adb reverse) and mesh/relay pairing work fine on loopback.
const lanIntent =
  process.env.ANTON_LAN_BIND != null
    ? process.env.ANTON_LAN_BIND === 'true'
    : Boolean(
        process.env.APP_GATEWAY_PUBLIC_URL ||
        process.env.APP_GATEWAY_MDNS === 'true' ||
        process.env.APP_GATEWAY_LAN_BROWSE === 'true'
      );
const BIND_ADDR = lanIntent ? '0.0.0.0' : '127.0.0.1';
if (!lanIntent) {
  logger.info('[bind] Listening on 127.0.0.1 only — set ANTON_LAN_BIND=true (or configure the app gateway) for LAN phone pairing');
}
httpServer.listen(Number(PORT), BIND_ADDR, async () => {
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

  // ── ANTON Mesh dialer ────────────────────────────────────────────
  // When ANTON_MESH_RELAYS is set, dial out to each relay so paired
  // Companion App phones can reach this instance via the mesh transport.
  // Bridge wires inbound RPC frames into the existing Express app.
  // See docs/ANTON_MESH_SPEC.md.
  try {
    await startMeshDialer(db, app);
  } catch (err) {
    console.error('[mesh] Failed to start dialer:', err);
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

    // ── Pause flags (cost control) ──────────────────────────────────────────
    // MARKETS_THINKING_DISABLED=true  → skip every LLM-spending call (atom
    //   extraction, daily/weekly intelligence, validation, fundamental
    //   analysis). NAV, price syncs, prediction checkpoints (price-only),
    //   event triggers and materialized-view refreshes still run.
    // MARKETS_FETCH_DISABLED=true     → skip every external data fetch
    //   (FMP, news, RSS). Free in-DB processing still runs if thinking is on.
    const marketsThinkingDisabled =
      String(process.env.MARKETS_THINKING_DISABLED || '').toLowerCase() === 'true';
    const marketsFetchDisabled =
      String(process.env.MARKETS_FETCH_DISABLED || '').toLowerCase() === 'true';
    const marketsAutorebalanceDisabled =
      String(process.env.MARKETS_AUTOREBALANCE_DISABLED || '').toLowerCase() === 'true';
    if (marketsThinkingDisabled) console.log('[markets-schedule] MARKETS_THINKING_DISABLED=true — LLM phases will skip');
    if (marketsFetchDisabled) console.log('[markets-schedule] MARKETS_FETCH_DISABLED=true — data fetches will skip');
    if (marketsAutorebalanceDisabled) console.log('[markets-schedule] MARKETS_AUTOREBALANCE_DISABLED=true — scheduled rebalances will skip');

    // ── Markets automation opt-in (plan 1.11) ──────────────────────────────
    // MARKETS_AUTOMATION=true is the explicit opt-in master switch for every
    // token-spending (LLM) and external-data-fetching markets cron. Default is
    // OFF: a fresh install schedules ONLY the free deterministic loops — NAV,
    // price→historical sync, MV refreshes, prediction checkpoints, the (price-
    // graded) verifier + calibration, pattern→weight feedback, lifecycle
    // sweeps, backlog triage, event triggers, and the loop-health watchdog.
    // When automation is ON, the existing MARKETS_THINKING_DISABLED /
    // MARKETS_FETCH_DISABLED flags keep working as finer-grained overrides.
    const marketsAutomation =
      String(process.env.MARKETS_AUTOMATION || '').toLowerCase() === 'true';
    // Effective tiers (opt-in AND not paused by the existing flags):
    const marketsLlmOn = marketsAutomation && !marketsThinkingDisabled;
    const marketsFetchOn = marketsAutomation && !marketsFetchDisabled;
    console.log(
      `[markets-schedule] Automation tiers — free deterministic loops: ON | LLM phases: ${marketsLlmOn ? 'ON' : 'OFF'} | external data fetch: ${marketsFetchOn ? 'ON' : 'OFF'}` +
      (marketsAutomation ? '' : ' (set MARKETS_AUTOMATION=true to enable the token/data-spending crons)'),
    );
    /** Register a cron only when the token/data-spending tier is opted in. */
    const scheduleSpending = (expr: string, fn: () => Promise<void>): void => {
      if (marketsAutomation) cron.schedule(expr, fn, MARKET_TZ);
    };

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

    // Phase 1: Morning Intelligence (07:00 CET) — fetch + LLM (opt-in)
    scheduleSpending('0 7 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 1: Morning Intelligence');
      try {
        await marketAtomService.applyAtomDecay();
        const backlog = await getBacklogSize();
        if (!marketsFetchDisabled && backlog < 500) {
          await marketDataService.fetchAllSources();
          console.log(`[markets-schedule] Phase 1: fetched data (backlog was ${backlog})`);
        } else if (marketsFetchDisabled) {
          console.log('[markets-schedule] Phase 1: fetch skipped (MARKETS_FETCH_DISABLED)');
        } else {
          console.log(`[markets-schedule] Phase 1: skipping fetch, processing backlog (${backlog} items)`);
        }
        if (marketsThinkingDisabled) {
          console.log('[markets-schedule] Phase 1: backlog processing skipped (MARKETS_THINKING_DISABLED)');
        } else {
          const processed = await processBacklog(40);
          console.log(`[markets-schedule] Phase 1 complete — processed ${processed} articles`);
        }
      } catch (err) { console.error('[markets-schedule] Phase 1 error:', err); }
    });

    // Phase 2: Pre-Open (14:30 CET) — light fetch + process (opt-in)
    scheduleSpending('30 14 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 2: Pre-Open');
      try {
        const backlog = await getBacklogSize();
        if (!marketsFetchDisabled && backlog < 500) await marketDataService.fetchAllSources();
        if (marketsThinkingDisabled) {
          console.log('[markets-schedule] Phase 2: backlog processing skipped (MARKETS_THINKING_DISABLED)');
        } else {
          const processed = await processBacklog(20);
          console.log(`[markets-schedule] Phase 2 complete — processed ${processed}, backlog: ${backlog}`);
        }
      } catch (err) { console.error('[markets-schedule] Phase 2 error:', err); }
    });

    // Phase 3: Market Open (15:45 CET) — prices only, external fetch (opt-in)
    scheduleSpending('45 15 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 3: Market Open');
      if (marketsFetchDisabled) {
        console.log('[markets-schedule] Phase 3 skipped (MARKETS_FETCH_DISABLED)');
        return;
      }
      try {
        const priceSources = await db.all<{ id: string }>(
          "SELECT id FROM market_data_sources WHERE is_active = 1 AND provider = 'fmp' AND config::text LIKE '%price%'"
        );
        for (const src of priceSources) {
          try { await marketDataService.fetchFromSource(src.id); } catch { /* skip */ }
        }
        console.log('[markets-schedule] Phase 3 complete — prices captured');
      } catch (err) { console.error('[markets-schedule] Phase 3 error:', err); }
    });

    // Phase 4: Mid-Day Intelligence (18:00 CET) — THE main cycle, fetch + LLM (opt-in)
    scheduleSpending('0 18 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 4: Mid-Day Intelligence');
      try {
        const backlog = await getBacklogSize();
        if (!marketsFetchDisabled && backlog < 500) await marketDataService.fetchAllSources();
        if (marketsThinkingDisabled) {
          console.log('[markets-schedule] Phase 4 skipped (MARKETS_THINKING_DISABLED) — daily intelligence + backlog deferred');
        } else {
          const processed = await processBacklog(40);
          console.log(`[markets-schedule] Phase 4: processed ${processed} articles, running intelligence...`);
          await workflowOrchestrator.runDailyIntelligence();
          console.log('[markets-schedule] Phase 4 complete');
        }
      } catch (err) { console.error('[markets-schedule] Phase 4 error:', err); }
    });

    // Phase 5: Market Close (22:15 CET) — EOD prices + NAV. Stays registered
    // always: the NAV/leaderboard/checkpoint legs are free deterministic
    // in-DB work. Only the external fetch leg requires the automation opt-in.
    cron.schedule('15 22 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 5: Market Close + NAV');
      try {
        if (marketsFetchOn) await marketDataService.fetchAllSources();
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

    // Phase 6: Post-Market (23:00 CET) — backlog + rotating fundamental analysis, LLM (opt-in)
    scheduleSpending('0 23 * * 1-5', async () => {
      console.log('[markets-schedule] Phase 6: Post-Market Processing + Fundamental Analysis');
      if (marketsThinkingDisabled) {
        console.log('[markets-schedule] Phase 6 skipped (MARKETS_THINKING_DISABLED)');
        return;
      }
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
    });

    // Phase 7: Weekend Deep Dive (Saturday 10:00 CET) — validation + bigger analysis batch, LLM (opt-in)
    scheduleSpending('0 10 * * 6', async () => {
      console.log('[markets-schedule] Phase 7: Weekend Deep Dive');
      if (marketsThinkingDisabled) {
        console.log('[markets-schedule] Phase 7 skipped (MARKETS_THINKING_DISABLED)');
        return;
      }
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
    });

    // Phase 8: Weekly Pulse — short-term directional predictions (Monday + Thursday 09:00 CET), LLM (opt-in)
    scheduleSpending('0 9 * * 1,4', async () => {
      console.log('[markets-schedule] Phase 8: Weekly Pulse Predictions');
      if (marketsThinkingDisabled) {
        console.log('[markets-schedule] Phase 8 skipped (MARKETS_THINKING_DISABLED)');
        return;
      }
      try {
        await workflowOrchestrator.runWeeklyPulse();
        console.log('[markets-schedule] Phase 8 complete');
      } catch (err) { console.error('[markets-schedule] Phase 8 error:', err); }
    });

    // Daily auto-verification of expired predictions (12:00 CET weekdays).
    // Stays registered always: directional/price-target grading is free
    // (pure price comparison). LLM (binary/event) verification only runs
    // when the automation opt-in + thinking flag both allow it — deferred
    // predictions stay retriable.
    cron.schedule('0 12 * * 1-5', async () => {
      try {
        const { createPredictionVerifier } = await import('./services/market-prediction-verifier.js');
        const verifier = await createPredictionVerifier(db);
        const result = await verifier.runAutoVerification({ allowLLM: marketsLlmOn });
        if (result.verified > 0 || result.unverifiable > 0 || result.deferred_llm > 0) {
          console.log(`[markets-verify] Daily: verified=${result.verified} (${result.correct}✓ ${result.incorrect}✗) unverifiable=${result.unverifiable} llm_deferred=${result.deferred_llm}`);
        }
        // Plan 1.10d: compute confidence calibration after a successful
        // verification pass — pure SQL arithmetic over validated predictions,
        // no LLM cost, so it runs regardless of the automation opt-in.
        if (result.verified > 0) {
          try {
            const { createMarketIntelligenceService } = await import('./services/market-intelligence-service.js');
            const intelligence = await createMarketIntelligenceService(db);
            await intelligence.runCalibrationCheck();
            console.log('[markets-verify] Confidence calibration recomputed');
          } catch (calErr) {
            console.error('[markets-verify] Calibration check failed:', calErr instanceof Error ? calErr.message : calErr);
          }
        }
      } catch (err) { console.error('[markets-verify] Daily verification error:', err); }
    }, MARKET_TZ);

    // Reduced hourly fetch: prices only every 2 hours during market (14:00-22:00) — external fetch (opt-in)
    scheduleSpending('0 14,16,18,20,22 * * 1-5', async () => {
      if (marketsFetchDisabled) return;
      try {
        const priceSources = await db.all<{ id: string }>(
          "SELECT id FROM market_data_sources WHERE is_active = 1 AND provider = 'fmp' AND config::text LIKE '%price%'"
        );
        for (const src of priceSources) {
          try { await marketDataService.fetchFromSource(src.id); } catch { /* skip */ }
        }
      } catch { /* silent */ }
    });

    // ── Free (no-LLM, no-fetch) repair sweeps M1-M3/M5-M7 ────────────────
    // Extracted into named functions (2026-07-17) so the same idempotent bodies
    // run BOTH on their early-morning cron AND from the startup/07:30 catch-up.
    // Previously these were inline crons at 03:00-06:30 CET with no catch-up —
    // on a workstation that sleeps overnight (the actual deployment) they
    // effectively never fired: 52k+ unprocessed rows sat stale, theses never
    // closed. They are all idempotent, so an extra catch-up run is safe.

    // M1: pattern → signal-weight feedback. Reads unapplied
    // market_pattern_detections, adjusts market_signal_weights (bounded). No LLM.
    async function sweepPatternWeightFeedback(): Promise<void> {
      try {
        const { createMarketPatternWeightFeedbackService } =
          await import('./services/market-pattern-weight-feedback-service.js');
        const svc = await createMarketPatternWeightFeedbackService(db);
        const r = await svc.applyPatternFeedback();
        if (r.patternsConsidered > 0) {
          console.log(`[markets-feedback] considered=${r.patternsConsidered} applied=${r.patternsApplied} adjustments=${r.adjustments} skipped=${r.patternsSkipped.length}`);
        }
      } catch (err) {
        console.error('[markets-feedback] pattern feedback error:', err instanceof Error ? err.message : err);
      }
    }

    // M2: prediction-attribution PnL. Walks matured attributions, fills
    // subsequent_return + attribution_pnl. Pure DB + arithmetic.
    async function sweepAttributionPnL(): Promise<void> {
      try {
        const { createMarketPredictionAttributionService } =
          await import('./services/market-prediction-attribution-service.js');
        const svc = await createMarketPredictionAttributionService(db);
        const r = await svc.computeMaturedAttributionPnL();
        if (r.matured_considered > 0) {
          console.log(`[markets-attribution] considered=${r.matured_considered} computed=${r.pnl_computed} missing_price=${r.skipped_missing_price} errors=${r.errors.length}`);
        }
      } catch (err) {
        console.error('[markets-attribution] pnl compute error:', err instanceof Error ? err.message : err);
      }
    }

    // M3: thesis lifecycle. Closes theses whose predictions all resolved,
    // archives stale/redundant theses. Deterministic, no LLM.
    async function sweepThesisLifecycle(): Promise<void> {
      try {
        const { createMarketThesisLifecycleService } =
          await import('./services/market-thesis-lifecycle-service.js');
        const svc = await createMarketThesisLifecycleService(db);
        const r = await svc.applyThesisLifecycle();
        if (r.theses_considered > 0) {
          console.log(`[markets-thesis-lifecycle] considered=${r.theses_considered} validated=${r.validated} invalidated=${r.invalidated} stale=${r.archived_stale} redundant=${r.archived_redundant} left_open=${r.left_open} errors=${r.errors.length}`);
        }
      } catch (err) {
        console.error('[markets-thesis-lifecycle] sweep error:', err instanceof Error ? err.message : err);
      }
    }

    // M5: investigation lifecycle. Closes resolved why-chains, abandons
    // superseded/stale investigations. Deterministic, no LLM.
    async function sweepInvestigationLifecycle(): Promise<void> {
      try {
        const { createMarketInvestigationLifecycleService } =
          await import('./services/market-investigation-lifecycle-service.js');
        const svc = await createMarketInvestigationLifecycleService(db);
        const r = await svc.applyInvestigationLifecycle();
        if (r.considered > 0) {
          console.log(`[markets-investigation-lifecycle] considered=${r.considered} completed=${r.completed_via_why_chain} superseded=${r.abandoned_superseded} stale=${r.abandoned_stale} left_open=${r.left_open} errors=${r.errors.length}`);
        }
      } catch (err) {
        console.error('[markets-investigation-lifecycle] sweep error:', err instanceof Error ? err.message : err);
      }
    }

    // M6: time-based scheduled rebalance sweep. Deterministic (no LLM); gated by
    // MARKETS_AUTOREBALANCE_DISABLED for manual-only environments.
    async function sweepScheduledRebalance(): Promise<void> {
      if (marketsAutorebalanceDisabled) return;
      try {
        const { createMarketIndexRebalanceService } =
          await import('./services/market-index-rebalance-service.js');
        const svc = await createMarketIndexRebalanceService(db);
        const r = await svc.runScheduledRebalances();
        if (r.checked > 0 || r.rebalanced.length > 0) {
          console.log(`[markets-rebalance-schedule] checked=${r.checked} rebalanced=${r.rebalanced.length}${r.rebalanced.length > 0 ? ` (${r.rebalanced.join(', ')})` : ''}`);
        }
      } catch (err) {
        console.error('[markets-rebalance-schedule] sweep error:', err instanceof Error ? err.message : err);
      }
    }

    // M7: market-data backlog triage. Marks clearly-worthless unprocessed news
    // (stale >30d / empty / short / same-source dup) is_processed=1. No LLM.
    async function sweepBacklogTriage(): Promise<void> {
      try {
        const { createMarketDataBacklogTriageService } =
          await import('./services/market-data-backlog-triage-service.js');
        const svc = await createMarketDataBacklogTriageService(db);
        const r = await svc.triageBacklog();
        if (r.scanned > 0 || r.still_pending > 0) {
          console.log(`[markets-backlog-triage] triaged=${r.scanned} (stale=${r.triaged_stale} empty=${r.triaged_empty} short=${r.triaged_short} dup=${r.triaged_duplicate}) still_pending=${r.still_pending}`);
        }
      } catch (err) {
        console.error('[markets-backlog-triage] sweep error:', err instanceof Error ? err.message : err);
      }
    }

    // Run every free sweep once (catch-up entrypoint). Each has its own
    // try/catch so one failure never blocks the rest.
    async function runMarketsFreeSweeps(trigger: string): Promise<void> {
      console.log(`[markets-free-sweeps] running M1-M7 (trigger: ${trigger})`);
      await sweepPatternWeightFeedback();
      await sweepAttributionPnL();
      await sweepThesisLifecycle();
      await sweepInvestigationLifecycle();
      await sweepScheduledRebalance();
      await sweepBacklogTriage();
    }

    // Primary early-morning cron schedule (fires on always-on hosts).
    cron.schedule('0 3 * * *', () => { void sweepPatternWeightFeedback(); }, MARKET_TZ);
    cron.schedule('0 4 * * *', () => { void sweepAttributionPnL(); }, MARKET_TZ);
    cron.schedule('0 5 * * *', () => { void sweepThesisLifecycle(); }, MARKET_TZ);
    cron.schedule('30 5 * * *', () => { void sweepInvestigationLifecycle(); }, MARKET_TZ);
    cron.schedule('0 6 * * *', () => { void sweepScheduledRebalance(); }, MARKET_TZ);
    cron.schedule('30 6 * * *', () => { void sweepBacklogTriage(); }, MARKET_TZ);

    // Catch-up: also run all free sweeps at 12:00 CET (a time the workstation is
    // provably up) and ~2min after boot, so a machine asleep 03:00-06:30 still
    // gets them. Idempotent, so double-running on an always-on host is harmless.
    cron.schedule('0 12 * * *', () => { void runMarketsFreeSweeps('1200-catchup'); }, MARKET_TZ);
    setTimeout(() => { void runMarketsFreeSweeps('startup-catchup'); }, 120_000).unref();

    // News fetch 3x per day (not hourly) — 08:00, 15:00, 21:00 — external fetch (opt-in)
    scheduleSpending('0 8,15,21 * * 1-5', async () => {
      if (marketsFetchDisabled) return;
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
    });

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

    // Daily Markets loop-health watchdog (07:30 CET — plan 1.10c). Read-only
    // stale-loop detection: a closed loop with pending work but zero
    // transitions in the window has silently frozen (the April-2026 failure
    // mode). Logs a warning AND writes a system notification so the failure
    // is visible in the UI without reading server logs. Pure SQL, no LLM and
    // no fetch — runs under every pause flag and without MARKETS_AUTOMATION.
    cron.schedule('30 7 * * *', async () => {
      try {
        const { staleMarketLoops } = await import('./services/market-loop-health.js');
        const stale = await staleMarketLoops(db);
        if (stale.length === 0) return;
        for (const loop of stale) {
          console.warn(`[markets-loop-health] STALE: ${loop.loop} — ${loop.detail}`);
        }
        try {
          const { createNotification } = await import('./services/notification-service.js');
          await createNotification(db, {
            type: 'system',
            title: `Markets loop health: ${stale.length} stale loop${stale.length === 1 ? '' : 's'} detected`,
            message: stale.map((l) => `${l.loop}: ${l.detail}`).join(' | '),
            link: '/markets',
          });
        } catch (notifyErr) {
          console.error('[markets-loop-health] notification write failed:', notifyErr instanceof Error ? notifyErr.message : notifyErr);
        }
      } catch (err) {
        console.error('[markets-loop-health] watchdog error:', err instanceof Error ? err.message : err);
      }
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

        // 1. Process backlog immediately (always useful after restart) — LLM-spending
        const backlog = await getBacklogSize();
        if (backlog > 0 && marketsLlmOn) {
          const processed = await processBacklog(Math.min(backlog, 100));
          console.log(`[markets-catchup] Processed ${processed}/${backlog} backlog items`);
          catchUpActions++;
        } else if (backlog > 0) {
          console.log(`[markets-catchup] Backlog of ${backlog} items deferred (LLM automation off)`);
        }

        // 1b. Sync prices to historical table (free)
        try {
          await marketDataService.syncPricesToHistorical();
        } catch { /* non-fatal */ }

        // 1c. Ensure sector ETF data exists for rotation analysis (fetch)
        if (marketsFetchOn) {
          try {
            const { backfilled } = await marketDataService.ensureSectorETFData();
            if (backfilled.length > 0) {
              console.log(`[markets-catchup] Backfilled sector ETFs: ${backfilled.join(', ')}`);
              catchUpActions++;
            }
          } catch { /* non-fatal */ }
        }

        // 2. Check if daily intelligence ran today (weekdays only) — LLM-spending.
        // NOTE: these heartbeat queries previously filtered status='success',
        // a value the workflow_runs CHECK constraint makes impossible — so
        // catch-up believed the workflows had NEVER run and re-ran the paid
        // jobs on every boot. Aligned to 'completed' ('success' kept
        // defensively for pre-CHECK rows).
        if (isWeekday && marketsLlmOn) {
          const lastIntel = await db.get<{ started_at: string }>(
            "SELECT started_at FROM workflow_runs WHERE workflow_id = 'wf_markets_daily_intelligence' AND status IN ('completed','success') ORDER BY started_at DESC LIMIT 1"
          );
          const hoursSinceIntel = lastIntel
            ? (now.getTime() - new Date(lastIntel.started_at).getTime()) / 3600000
            : Infinity;

          if (hoursSinceIntel > 24) {
            console.log(`[markets-catchup] Daily intelligence last ran ${hoursSinceIntel === Infinity ? 'never' : Math.round(hoursSinceIntel) + 'h ago'} — running now`);
            try {
              if (marketsFetchOn) await marketDataService.fetchAllSources();
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

        // 4. Check if prediction validation ran this week (should run Saturday) — LLM-spending
        if ((dayOfWeek === 6 || dayOfWeek === 0) && marketsLlmOn) {
          const lastValidation = await db.get<{ started_at: string }>(
            "SELECT started_at FROM workflow_runs WHERE workflow_id = 'wf_markets_prediction_validation' AND status IN ('completed','success') ORDER BY started_at DESC LIMIT 1"
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

        // 5. Check if weekly pulse ran recently — LLM-spending
        if (marketsLlmOn) {
          const lastPulse = await db.get<{ started_at: string }>(
            "SELECT started_at FROM workflow_runs WHERE workflow_id = 'wf_markets_weekly_pulse' AND status IN ('completed','success') ORDER BY started_at DESC LIMIT 1"
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
    const radarAutomationDisabled =
      String(process.env.RADAR_AUTOMATION_DISABLED || '').toLowerCase() === 'true';
    if (radarAutomationDisabled) {
      console.log('[radar] RADAR_AUTOMATION_DISABLED=true — auto-scan + cron skipped');
    } else {
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

  // ANTON Studio P6 — SIGTERM only the preview dev-servers WE spawned (by their
  // tracked ChildProcess handles). Never taskkill, never kill by name/port.
  void import('./services/coding-preview-service.js')
    .then((m) => m.shutdownAllPreviews?.())
    .catch(() => {});

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
