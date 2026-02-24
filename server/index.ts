import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDatabase } from './db/init.js';
import { authLimiter, userLimiter, claudeLimiter } from './middleware/rate-limit.js';
import healthRouter from './routes/health.js';
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
import { createAnalyticsRouter } from './routes/analytics.js';
import { createScheduleRoutes } from './routes/schedules.js';
import { initScheduler } from './services/scheduler.js';
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
import { createProjectFilesRoutes } from './routes/project-files.js';
import { createProjectCollaborationRoutes } from './routes/project-collaboration.js';
import { createQualityRoutes } from './routes/quality.js';
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
import Anthropic from '@anthropic-ai/sdk';
import { ensureWorkspacesRoot } from './services/workspace.js';

dotenv.config();

// ── Startup validation ────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[openEXPERT] WARNING: ANTHROPIC_API_KEY is not set. Claude API calls will fail.');
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
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin requests (no Origin header) and whitelisted origins
      if (!origin || allowedOrigins.some((allowed) => origin === allowed)) {
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

app.use(express.json({ limit: '50mb' }));

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

// Initialize workspace root directory
await ensureWorkspacesRoot();

// Initialize Anthropic client for quality scoring
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : undefined;

// Initialize workflow scheduler
initScheduler(db);

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

// API routes — auth routes and config must be registered BEFORE the auth middleware
app.use('/api', createAuthRoutes(db));

// Channel Bridge public query endpoint — uses per-bridge Bearer token, not session auth
app.use('/api', createBridgePublicRoutes(db, anthropic));

// Deployment config endpoint (public — no auth required)
app.get('/api/config', (_req, res) => {
  res.json({
    deploymentMode: process.env.DEPLOYMENT_MODE || 'solo',
    version: '1.0.0',
    googleOAuthEnabled: !!process.env.GOOGLE_CLIENT_ID,
    githubOAuthEnabled: !!process.env.GITHUB_CLIENT_ID,
    oidcEnabled: !!(process.env.OIDC_ISSUER_URL && process.env.OIDC_CLIENT_ID),
  });
});

// Auth middleware — protects all subsequent /api routes
const authMiddleware = createAuthMiddleware(db);
app.use('/api', authMiddleware);

// Apply per-user rate limiter to all authenticated API routes
app.use('/api', userLimiter);

app.use('/api', healthRouter);
app.use('/api', createClaudeRoutes(db, anthropic));
app.use('/api', filesRouter);
app.use('/api', createSessionRoutes(db));
app.use('/api', createFolderRoutes(db));
app.use('/api', createExportRouter(db));
app.use('/api', createTemplatesRouter(db));
app.use('/api', modulesRouter);
app.use('/api', createProfileRoutes(db));
app.use('/api', createReviewRoutes(db, anthropic));
app.use('/api', createProjectRoutes(db));
app.use('/api', createProjectFilesRoutes(db));
app.use('/api', createProjectCollaborationRoutes(db));
app.use('/api', createSkillsRoutes(db));
app.use('/api', createCustomModuleRoutes(db, anthropic));
app.use('/api', createAuditRoutes(db));
app.use('/api', createExchangeRoutes(db));
app.use('/api', createSettingsRoutes(db));
app.use('/api', createRagRoutes(db));
app.use('/api', createKnowledgeLibraryRoutes(db));
app.use('/api', createEurLexRoutes());
app.use('/api', createAdminRoutes(db));
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
app.use('/api', createQualityRoutes(db, anthropic));
app.use('/api', createApprenticeRoutes(db));
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

// Serve static React build in production
const clientDist = path.join(__dirname, '..', 'dist', 'client');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`openEXPERT by ANTON — server running on http://localhost:${PORT}`);
  console.log(`Claude API key configured: ${!!process.env.ANTHROPIC_API_KEY}`);

  // Start background dataset cleanup (runs every hour)
  startDatasetCleanup(db);
  console.log('Dataset cleanup service started');

  // Start deadline reminder service (checks every 15 minutes)
  try {
    const reminderService = createDeadlineReminderService(db);
    reminderService.startTimer(15);
    console.log('[deadline-reminders] Reminder service started');
  } catch (err) {
    console.error('[deadline-reminders] Failed to start reminder service:', err);
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
    } catch (err) {
      console.error('[radar] Failed to read auto-scan settings:', err);
    }
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
