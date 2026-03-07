// Must be first — loads .env before any other module evaluates top-level env checks
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './db/init.js';
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
import { createOrchestratorRoutes } from './routes/orchestrator.js';
import { initOrchestratorHeartbeat } from './services/orchestrator-heartbeat.js';
import { createContinuityRoutes } from './routes/continuity.js';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// ── Allowed origins for CORS ──────────────────────────────────
// Defaults to localhost only. Override with CORS_ORIGINS env var (comma-separated).
const allowedOrigins = (process.env.CORS_ORIGINS || `http://localhost:${PORT},http://localhost:5173`)
  .split(',')
  .map((o) => o.trim());

const app = express();

// ── Security headers (helmet) ─────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],  // TODO: Add nonce for inline scripts in production
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

// Initialize database
const db = initDatabase();

// Verify database tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>;
console.log('[db] Available tables:', tables.map(t => t.name).join(', '));

// Verify projects table specifically
const projectsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();
if (!projectsTable) {
  console.error('[db] ⚠️  WARNING: projects table not found!');
} else {
  const projectsCount = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
  console.log(`[db] ✅ Projects table exists with ${projectsCount.count} projects`);
}

// RATE-04: initialise async audit queue now that DB is ready
initAuditQueue(db);

// Initialize workspace root directory
await ensureWorkspacesRoot();

// Initialize Anthropic client for quality scoring
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : undefined;

// Initialize workflow scheduler
initScheduler(db);

// Initialize event-driven workflow processor (picks up pending webhook-triggered runs)
startEventWorkflowProcessor(db);

// Initialize pattern detection background job (runs every hour)
const patternDetection = createPatternDetection(db);
setInterval(() => {
  try {
    console.log('[pattern-detection] Running background detection...');
    const result = patternDetection.runAllDetectors();
    console.log(`[pattern-detection] Detected ${result.patternsDetected} patterns`);
  } catch (error) {
    console.error('[pattern-detection] Background job error:', error);
  }
}, 3600000); // every hour

// Run pattern detection on startup (delayed by 30 seconds)
setTimeout(() => {
  try {
    console.log('[pattern-detection] Running initial pattern detection...');
    const result = patternDetection.runAllDetectors();
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
app.use('/mcp', createMcpRouter(db));

// API routes — auth routes and config must be registered BEFORE the auth middleware
app.use('/api', createAuthRoutes(db));

// Channel Bridge public query endpoint — uses per-bridge Bearer token, not session auth
app.use('/api', createBridgePublicRoutes(db, anthropic));

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
const authMiddleware = createAuthMiddleware(db);
app.use('/api', authMiddleware);

// Apply per-user rate limiter to all authenticated API routes
app.use('/api', userLimiter);

app.use('/api', createHealthRouter(db));
app.use('/', createMetricsRouter(db)); // OBS-03: Prometheus /metrics — mounted at root, not /api

// OBS-03: request + error counters
app.use((_req, _res, next) => { incrementRequests(); next(); });
app.use((_err: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
  incrementErrors();
  next(_err);
});

app.use('/api', createClaudeRoutes(db, anthropic));
app.use('/api', filesRouter);
app.use('/api', createSessionRoutes(db));
app.use('/api', createFolderRoutes(db));
app.use('/api', createExportRouter(db));
app.use('/api', createTemplatesRouter(db));
app.use('/api', createCustomModuleRoutes(db, anthropic)); // must be before modulesRouter — /modules/community would otherwise be swallowed by /modules/:id wildcard
app.use('/api', modulesRouter);
app.use('/api', createProfileRoutes(db));
app.use('/api', createReviewRoutes(db, anthropic));
app.use('/api', createProjectRoutes(db));
app.use('/api', createProjectFilesRoutes(db));
app.use('/api', createProjectCollaborationRoutes(db));
app.use('/api', createSkillsRoutes(db));
app.use('/api', createAuditRoutes(db));
app.use('/api', createExchangeRoutes(db));
app.use('/api', createSettingsRoutes(db));
app.use('/api', createRagRoutes(db));
app.use('/api', createKnowledgeLibraryRoutes(db));
app.use('/api', createEurLexRoutes());
app.use('/api', createAdminRoutes(db));
app.use('/api', createCompliancePolicyRoutes(db));
app.use('/api/analytics', createAnalyticsRouter(db));
app.use('/api', createScheduleRoutes(db));
app.use('/api/versions', createVersionsRoutes(db));
app.use('/api/claude/review', claudeLimiter);
app.use('/api', createConnectionsRoutes(db));
app.use('/api', createBridgeRoutes(db, anthropic));
app.use('/api', createDatasetsRoutes(db));
app.use('/api', createKnowledgeRoutes(db));
app.use('/api', createDeadlinesRoutes(db));
app.use('/api/workflows', createWorkflowRoutes(db, anthropic));
app.use('/api', createMemoryRoutes(db));
app.use('/api', createCanvasRoutes(db));
// Initialize radar fetcher for automated feed scanning
const radarFetcher = anthropic ? createRadarFetcher(db, anthropic) : undefined;
app.use('/api', createRadarRoutes(db, radarFetcher));
app.use('/api', createNotificationsRouter(db));
app.use('/api', createQualityRoutes(db, anthropic));
app.use('/api/engagements', createEngagementsRoutes(db));
app.use('/api', createApprenticeRoutes(db));
app.use('/api', createTradesRoutes(db));
app.use('/api', createPEVCRoutes(db));
app.use('/api', createSchoolRoutes(db));
app.use('/api', createNewsRoutes(db, anthropic));
app.use('/api', createFinanceRoutes(db, anthropic));
app.use('/api', createTravelRoutes(db, anthropic));
app.use('/api', createCommunityRoutes(db));
// Strategic Improvements + Event-Driven Triggers
const webhookListenerInstance = createWebhookListener(db);
setEventEmitter(webhookListenerInstance);            // Wire internal event emitter singleton
app.use('/api', createTriggersRoutes(db));           // RBAC-protected trigger management
app.use('/api/webhooks', webhookLimiter);             // Rate limit public webhook endpoint (SEC-19)
app.use('/', createWebhooksPublicRoutes(db));        // Public inbound webhook endpoint (no ANTON auth)
app.use('/api', createSessionResumeRoutes(db));      // Session Resume (snapshots)
app.use('/api', createInsightsRoutes(db));           // Proactive Intelligence
app.use('/api', createOrgContextRoutes(db));         // Org Context Layer (prompt layer 2a)
app.use('/api', createContinuityRoutes(db));         // Org Continuity (key-person risk)
app.use('/api', createKnowledgePacksRoutes(db));     // Regulatory Knowledge Packs
app.use('/api', createLegalResearchRoutes(db, anthropic));   // Counsel's Desk — legal research sessions
app.use('/api', createGapAssessmentsRoutes(db, anthropic)); // Compliance Gap Assessor
app.use('/api', createAiAssistRoutes());                     // AI-assist endpoints (module builder, patterns, deadlines, etc.)
app.use('/api/task-agent', createTaskAgentRoutes(db, anthropic)); // ANTON Task Agent — conversational task intake + approach proposal
app.use('/api', createRoaringRoutes(db));                   // Roaring — Nordic entity registry + UBO + sanctions
app.use('/api', createDowJonesRoutes(db));                  // Dow Jones Risk & Compliance — global screening
app.use('/api', createOrchestratorRoutes(db, anthropic));   // ANTON Orchestrator — AI management layer
app.use('/api', createKnowledgeGraphRoutes(db));
app.use('/api', createIntelligenceDashboardRoutes(db));
app.use('/api', createPatternDetectionRoutes(db));
app.use('/api/data', createDataRoutes(db));
app.use('/api', createCommandRoutes(db, anthropic));
app.use('/api', createComplianceRoutes(db));
app.use('/api', createCollectionsRoutes(db));
app.use('/api', createSearchRoutes(db));
app.use('/api', createDocumentsRouter(db));
app.use('/api', createDiscoveryRoutes(db, anthropic));
app.use('/api/ollama', ollamaRouter);
app.use('/api', createCodingRoutes(db));
app.use('/api', createCodingReviewRoutes(db));
app.use('/api', createCodingScriptsRoutes(db));
app.use('/api', createCodingLargeRoutes(db));
app.use('/api', createPptxPipelineRoutes(db));
app.use('/api', createPresentationsRoutes(db));
app.use('/api', createInstructionBuilderRoutes(db));
app.use('/api', createAlignmentReviewerRoutes(db));
app.use('/api/batch', createBatchRoutes(anthropic, db));
app.use('/api', createSkillPacksRoutes(db));
app.use('/api', createModelRouterRoutes());
app.use('/api', createAudienceAdapterRoutes());
app.use('/api', createSuggestionsRoutes(db));
app.use('/api', createBenchmarkRoutes(db));
app.use('/api', createConnectorTemplatesRoutes());
app.use('/api', createIntegrationsRoutes(db));

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
    const session = db.prepare('SELECT id FROM user_sessions WHERE token = ? AND expires_at > datetime("now")').get(token);
    if (!session) { next(new Error('Session expired')); return; }
    next();
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

httpServer.listen(PORT, () => {
  logger.info({ port: PORT, apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY }, 'ANTON by openEXPERT server started');

  // Start background dataset cleanup (runs every hour)
  startDatasetCleanup(db);
  console.log('Dataset cleanup service started');

  // Start embedding pipeline (runs in background, 10s delay to avoid blocking startup)
  setTimeout(() => {
    runEmbeddingPipeline(db).catch(err => {
      console.warn('[embedding-pipeline] Startup run failed (non-fatal):', err instanceof Error ? err.message : err);
    });
  }, 10000);

  // Start deadline reminder service (checks every 15 minutes)
  try {
    const reminderService = createDeadlineReminderService(db);
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

  // Initialize radar background scanning from DB settings
  if (radarFetcher) {
    try {
      const autoEnabled = db.prepare("SELECT value FROM radar_settings WHERE key = 'auto_scan_enabled'").get() as { value: string } | undefined;
      const autoInterval = db.prepare("SELECT value FROM radar_settings WHERE key = 'auto_scan_interval_hours'").get() as { value: string } | undefined;
      const enabled = autoEnabled?.value === '1';
      const hours = parseInt(autoInterval?.value || '24', 10);

      if (enabled) {
        radarFetcher.startAutoScan(hours);
        console.log(`[radar] Auto-scan enabled (${hours}h interval)`);
      } else {
        console.log('[radar] Auto-scan disabled (change in Radar settings)');
      }

      // Also check for cron-based radar schedule
      const radarCronExpr = (db.prepare("SELECT value FROM radar_settings WHERE key = 'auto_scan_cron'").get() as { value: string } | undefined)?.value;
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
  httpServer.close((closeErr) => {
    if (closeErr) {
      logger.error({ err: closeErr }, 'Error closing HTTP server');
    } else {
      logger.info('HTTP server closed');
    }
    flushAuditQueue(); // RATE-04: drain pending audit entries before closing
    try { db.close(); } catch { /* ignore */ }
    logger.info('Database closed — exiting');
    process.exit(closeErr ? 1 : 0);
  });

  // Force-kill if drain takes too long
  setTimeout(() => {
    logger.error({ timeoutMs: DRAIN_TIMEOUT_MS }, 'Drain timeout exceeded — forcing exit');
    try { db.close(); } catch { /* ignore */ }
    process.exit(1);
  }, DRAIN_TIMEOUT_MS).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
