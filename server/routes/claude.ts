import { Router, type Response } from 'express';
import { MODEL_CAPABILITIES } from '../config/model-capabilities.js';
import path from 'path';
import type { DatabaseAdapter } from '../db/database.js';

import { streamToResponse, isApiKeyConfigured, callSync, getClient, isCacheSupportedModel } from '../services/claude-client.js';
import { runIterativeReasoning, getRevelationChain, ireSupportedProvider } from '../services/iterative-reasoning.js';
import { runDeliberation, DEFAULT_PANELISTS } from '../services/deliberation-engine.js';
import { createOutputStore } from '../services/output-store.js';
import { composeSystemPrompt, composeSystemPromptParts, foundationPromptText } from '../services/prompt-composer.js';
import { ensurePromptVersion, FOUNDATION_PROMPT_ID } from '../services/prompt-versions.js';
import { getModule } from '../services/module-loader.js';
import { estimateTokens } from '../services/token-estimator.js';
import { buildOutputInstruction } from '../../src/lib/output-format-definitions.js';
import { buildOrgContextLayer, buildResumeContextLayer, buildKnowledgePackLayer, buildKnowledgePackLayerDetailed, buildAtomLayerDetailed } from '../services/prompt-builder.js';
import { buildProjectContext, resolveProjectAccess } from '../services/project-context.js';
import { buildResumeContextIfDue } from '../services/session-resume.js';
import { writeSessionConclusion } from '../services/session-conclusion.js';
import { retrieveGroundingText, type GroundingResult } from '../services/framework-text-retrieval.js';
import { frameworksForArea } from '../services/area-frameworks.js';
import { resolveKnowledgeSources } from '../services/knowledge-resolver.js';
import type { ResolvedKnowledge, ThinkingLevel } from '../../src/lib/types.js';
import { resolveContextBudget, resolveCompatInputWindow, resolveOllamaNumCtx } from '../services/context-budget.js';
import { runMultiAgent } from '../services/multi-agent-orchestrator.js';
import { writeAuditEntry } from '../services/auditLogger.js';
import { safeError, publicErrorMessage } from '../lib/error-response.js';
import { MODEL_REGISTRY, getModelConfig, getTemperature, isApiKeyAvailable } from '../types/modelAdapter.js';
import type { PrecisionLevel } from '../types/modelAdapter.js';
import { streamOpenAI } from '../services/adapters/openaiAdapter.js';
import { streamGemini } from '../services/adapters/geminiAdapter.js';
import { streamMistral } from '../services/adapters/mistralAdapter.js';
import { streamOllama, listOllamaModels } from '../services/adapters/ollamaAdapter.js';
import { streamAzureOpenAI } from '../services/adapters/azureOpenaiAdapter.js';
import type { AzureOpenAIConfig } from '../services/adapters/azureOpenaiAdapter.js';
import {
  streamOpenAICompatible,
  compatUnfinishedUsageOf,
  compatSentMaxTokens,
  estimateCompatInputTokens,
  COMPAT_WORK_RUN_MAX_TOKENS,
  type OpenAICompatibleStreamResult,
  type CompatInputMessage,
} from '../services/adapters/openaiCompatibleAdapter.js';
import { resolveCompatModel, CompatEndpointError, modelAcceptsImages, type ResolvedCompatModel } from '../services/compat-endpoint.js';
import { assertSpendAllowed, isSpendCapError, type SpendCostSource } from '../services/llm-spend.js';
import { isDemoMode, demoOfferedModels, demoPostAnswerCalls } from '../middleware/demo-mode.js';
import { compatReasoningParam } from '../services/thinking-map.js';
import { decrypt } from '../services/credential-vault.js';
import { verifyCitations } from '../services/citation-verifier.js';
import { getAutoAttachSkillIds } from '../services/skills-manager.js';
import { isKnownAudience, getAudiencePrompt } from '../services/audience-adapter.js';
import { createBudgetMiddleware } from '../middleware/budget.js';
import { semanticSearch } from '../services/semantic-search.js';
import { createQualityRatchet } from '../services/quality-ratchet.js';
import { getEffectiveDefaultModel } from '../services/default-model-store.js';
import { getAreaDefaultModelSync } from '../services/area-default-model-store.js';
import { streamToResponse as sdkStreamToResponse, stripWebSearchInstructions, sdkWebToolsRequested } from '../services/claude-sdk-client.js';
import { capabilityModelId } from '../services/engine-model-id.js';
import { mapModelToProvider, callChat, getConfiguredProvider } from '../services/provider-router.js';
import { CLAUDE_LARGE } from '../config/claude-lineup.js';
import { hasClaudeEngine, NO_CLAUDE_ENGINE_MESSAGE } from '../services/claude-engine-availability.js';
import { isSdkEngineEnabled } from '../services/sdk-engine-store.js';
import { streamToResponse as codexStreamToResponse } from '../services/codex-sdk-client.js';
import { isCodexEngineEnabled } from '../services/codex-engine-store.js';
import { validate } from '../lib/validate.js';
import { ClaudeMessageSchema } from '../lib/schemas.js';
import { acquireStream, releaseStream } from '../services/stream-limiter.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../services/circuit-breaker.js';
import { enqueueAudit } from '../services/audit-queue.js';
import { buildCompactionConfig, buildContextManagementParam } from '../services/compaction-manager.js';
import { createTemporalReasoningService } from '../services/temporal-reasoning.js';
import { writeRunArtifact, writeRunArtifactV2, buildLayerSummary, sha256Hex, messageRunRecordFields, isSseErrorFrame } from '../services/run-artifact-writer.js';
import { assignAtomArm, isAtomAbEnabled, isExperimentSubject, resolveFinalArm } from '../services/atom-ab.js';
import { getAtomInjectionStatus } from '../services/atom-injection-gate.js';
import { runComplianceOnCompletion } from '../services/compliance-on-completion.js';
import { isModuleAllowed } from '../services/module-access.js';
import { resolveModuleAreaId } from './module-access.js';
import { isTeamMode } from '../middleware/role-guards.js';
import { scopesToOwner, assertOwned, type OwnedRequest } from '../middleware/ownership.js';
import { loadLayer0Profile } from './profile.js';
import { embedSessionOutput } from '../services/session-output-embedder.js';
import { getAnthropicUtilityModel, getRoutedUtilityModel } from '../services/utility-model.js';
import { validateModuleMatches } from '../services/module-recommendation.js';
import { computeRunCostUsd } from '../services/run-cost.js';
import { anthropicEffort } from '../services/thinking-map.js';

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');

/**
 * Abort a stream that has STALLED, not one that is merely taking a while.
 *
 * The per-thinking-level ceilings were applied as absolute wall-clock limits:
 * a run was killed at the ceiling even while it was streaming tokens the whole
 * way. A model-validation prompt of 77k characters with two structured output
 * formats exceeds the 300s `think` ceiling comfortably — so it started, did
 * real work, and was cut off mid-answer with "Operation aborted". The bigger
 * and more valuable the request, the more reliably it failed.
 *
 * The ceilings were tuned for time to FIRST token ("runtime spawn adds seconds
 * before first token"), which is what they govern here. Once output is flowing,
 * only silence is a fault: each write resets an idle window. A generous
 * absolute ceiling remains as a backstop against a genuinely wedged stream.
 *
 * Returns a stop() for the caller's finally block.
 */
function armIdleAbort(
  res: { write: (chunk: string) => boolean; on: (ev: string, fn: () => void) => unknown },
  abort: () => void,
  opts: { firstTokenMs: number; idleMs?: number; ceilingMs?: number },
): () => void {
  const idleMs = opts.idleMs ?? 180_000;        // silence AFTER output began
  const ceilingMs = opts.ceilingMs ?? 1_800_000; // 30 min hard backstop
  let stopped = false;
  let idleTimer: NodeJS.Timeout;

  const ceilingTimer = setTimeout(() => { if (!stopped) abort(); }, ceilingMs);
  idleTimer = setTimeout(() => { if (!stopped) abort(); }, opts.firstTokenMs);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(idleTimer);
    clearTimeout(ceilingTimer);
  };

  // Every byte written to the client is evidence the run is alive.
  const originalWrite = res.write.bind(res);
  res.write = (chunk: string): boolean => {
    if (!stopped) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { if (!stopped) abort(); }, idleMs);
    }
    return originalWrite(chunk);
  };

  res.on('close', stop);
  res.on('finish', stop);
  return stop;
}

/** Time to first output for a non-Claude run, per thinking level (armIdleAbort's firstTokenMs). */
const ADAPTER_FIRST_TOKEN_MS: Readonly<Record<string, number>> = {
  quick: 90_000, think: 180_000, think_hard: 300_000, investigate: 420_000, plan_first: 420_000, deep_investigate: 600_000,
};
let adapterTimerOverride: { firstTokenMs?: number; idleMs?: number } | null = null;

/** Test hook: shorter non-Claude run timers (null restores the defaults). */
export function setWorkRunTimeoutsForTests(opts: { firstTokenMs?: number; idleMs?: number } | null): void {
  adapterTimerOverride = opts;
}

/**
 * At most this many online references per run or preview. Each is fetched
 * from this server (15 s and 2 MB apiece) and, in a preview, handed back as
 * text: with no limit, one request made the server fetch hundreds of pages
 * for whoever sent it.
 */
export const MAX_ONLINE_REFERENCE_URLS = 20;

interface OnlineReferenceConfig { enabled?: unknown; urls?: unknown }

function onlineReferenceOf(knowledgeSources: unknown): OnlineReferenceConfig | undefined {
  const modes = (knowledgeSources as { modes?: { onlineReference?: unknown } } | null | undefined)?.modes;
  const ref = modes?.onlineReference;
  return typeof ref === 'object' && ref !== null ? (ref as OnlineReferenceConfig) : undefined;
}

/** The refusal for a request naming more online references than MAX_ONLINE_REFERENCE_URLS, or null. */
function onlineReferenceLimitProblem(knowledgeSources: unknown): string | null {
  const ref = onlineReferenceOf(knowledgeSources);
  if (!ref?.enabled || !Array.isArray(ref.urls) || ref.urls.length <= MAX_ONLINE_REFERENCE_URLS) return null;
  return `At most ${MAX_ONLINE_REFERENCE_URLS} online references can be used at once (${ref.urls.length} were given). Remove some and try again.`;
}

/**
 * The knowledge sources with online references switched off — for a preview
 * in demo mode, where a visitor's preview must not make this server fetch
 * pages and hand back their text. The run itself still fetches them.
 */
function withoutOnlineReferenceFetch(knowledgeSources: unknown): unknown {
  const ref = onlineReferenceOf(knowledgeSources);
  if (!ref?.enabled) return knowledgeSources;
  const ks = knowledgeSources as { modes: Record<string, unknown> };
  return { ...ks, modes: { ...ks.modes, onlineReference: { ...ref, enabled: false } } };
}

const IMAGE_UPLOAD_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/**
 * Can this run's engine read an image attachment? Claude and the subscription
 * engines take image blocks; a compat model does when its endpoint's /models
 * lists image input. The other adapters (OpenAI, Gemini, Mistral, Azure,
 * Ollama) take plain text only — they were handed the image as JSON-stringified
 * base64 text: no vision, and a 2 MB photo billed as hundreds of thousands of
 * tokens. Those runs are now refused with a clear message instead.
 */
function engineReadsImages(provider: string, compat: ResolvedCompatModel | null): boolean {
  if (provider === 'anthropic' || provider === 'anthropic_sdk' || provider === 'openai_codex') return true;
  if (provider === 'openai_compatible') return modelAcceptsImages(compat?.meta);
  return false;
}

/** The text of a message's content — Claude blocks flattened, images and thinking dropped. */
function contentText(content: string | object[]): string {
  if (typeof content === 'string') return content;
  return content
    .map((b) => {
      const block = b as { type?: unknown; text?: unknown };
      return block.type === 'text' && typeof block.text === 'string' ? block.text : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

export async function createClaudeRoutes(db: DatabaseAdapter, anthropic?: any) {
  const router = Router();
  const checkBudget = await createBudgetMiddleware(db);
  const ratchet = await createQualityRatchet(db);
  const temporalReasoning = await createTemporalReasoningService(db);

  // Lazy knowledge pipeline instances — shared across requests, initialised on first use.
  // (getAtomExtractor removed 2026-07-17 — atom extraction is driven solely by
  // output-store's summary→extraction pipeline; see storeOutput call below.)
  let _outputStore: Awaited<ReturnType<typeof createOutputStore>> | null = null;
  async function getSessionOutputStore() {
    if (!_outputStore) _outputStore = await createOutputStore(db);
    return _outputStore;
  }

  // Output Transformation — bounded-concurrency structured-extraction queue.
  // Created once so all /claude/message completions share a MAX_CONCURRENT
  // semaphore and per-session dedup. Enqueue is fire-and-forget.
  const { createExtractionQueue } = await import('../services/structured-extraction-queue.js');
  const { getModule } = await import('../services/module-loader.js');
  const extractionQueue = createExtractionQueue(db, async (moduleId) => {
    if (!moduleId) return 'analytic_report';
    try {
      const mod = await getModule(moduleId);
      return (mod?.contentType ?? 'analytic_report') as 'gap_analysis' | 'risk_register' | 'process_map' | 'policy_document' | 'analytic_report' | 'plan_document' | 'entity_register' | 'scorecard';
    } catch { return 'analytic_report'; }
  });
  function enqueueExtraction(input: { sessionId: string; markdown: string; moduleId: string | null; areaId?: string | null; userId?: string | null; generationModel?: string | null }): void {
    extractionQueue.enqueue(input);
  }

  // POST /api/claude/message — streaming SSE proxy (multi-LLM)
  /**
   * Wave 6: per-role module access (team mode). Answers 403 and returns true
   * when the caller's role may not run this module; solo mode, admins and
   * modules with no matching rule pass (default open — the owner restricts).
   * The area is taken from the request when sent, else looked up, so area
   * rules match too. Never throws: a broken rules read allows the run.
   */
  async function refuseForbiddenModule(
    req: { user?: { role?: string } },
    res: { status: (code: number) => { json: (body: unknown) => unknown } },
    moduleId: unknown,
    areaId: unknown,
  ): Promise<boolean> {
    if (!isTeamMode() || typeof moduleId !== 'string' || !moduleId) return false;
    try {
      const area = typeof areaId === 'string' && areaId ? areaId : await resolveModuleAreaId(db, moduleId);
      const verdict = await isModuleAllowed(db, { role: req.user?.role, moduleId, areaId: area, teamMode: true });
      if (verdict.allowed) return false;
      res.status(403).json({ error: 'Your role is not permitted to run this module. Ask an administrator.', rule: verdict.rule });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Team isolation (B2): a caller may only run in, read from or write to a
   * session they own. Every sessionId-keyed step of a run trusts this one check
   * — the user and assistant message rows, the session's config and conclusion,
   * its resume snapshot, its project's documents and context, its atom feedback
   * — so each route calls it before any of them. A session that is not theirs
   * answers 404 exactly like a missing one (ownership.ts).
   *
   * Solo mode and admins are not scoped, and unlike a bare assertOwned they are
   * not existence-checked either: a stale sessionId has always run the turn
   * unpersisted there, and a single-user machine must behave exactly as before.
   * Returns true to continue; on false the response has already been sent.
   */
  async function ensureOwnSession(req: OwnedRequest, res: Response, sessionId: unknown): Promise<boolean> {
    if (sessionId === undefined || sessionId === null || sessionId === '') return true;
    if (!scopesToOwner(req)) return true;
    return assertOwned(db, req, res, {
      table: 'sessions', ownerColumn: 'user_id', id: String(sessionId),
      notFoundMessage: 'Session not found',
    });
  }

  /**
   * Team isolation (B5, attachments): uploadedFileIds name files in UPLOAD_DIR
   * by their upload id. In team mode a non-admin may attach only files whose
   * file_uploads row names them as the uploader — the rule GET /api/files/:id
   * applies. Anything else (another user's upload, an unattributed file from
   * before migration 253, a path such as rag-documents/…) is dropped the way a
   * missing file always was: the turn runs without it, so the response never
   * reveals whose it was. Solo mode and admins keep the list exactly as sent.
   */
  async function ownedUploadIds(req: OwnedRequest, requested: string[]): Promise<string[]> {
    if (!scopesToOwner(req)) return requested;
    const userId = req.user?.id;
    const candidates = (Array.isArray(requested) ? requested : [])
      .filter((id): id is string => typeof id === 'string' && id.length > 0 && path.basename(id) === id);
    if (!userId || candidates.length === 0) return [];
    const rows = await db.all<{ id: string }>(
      `SELECT id FROM file_uploads WHERE uploaded_by = ? AND id IN (${candidates.map(() => '?').join(', ')})`,
      userId, ...candidates,
    );
    const owned = new Set(rows.map((r) => r.id));
    return candidates.filter((id) => owned.has(id));
  }

  router.post('/claude/message', validate(ClaudeMessageSchema), checkBudget, async (req, res) => {
    try {
      const {
        model,
        thinking,
        creativity,
        precision,
        moduleId,
        areaId,
        systemPrompt,
        outputInstruction,
        plainTextMode,
        multiAgentEnabled,
        multiAgentTeam,
        multiAgentStyle,
        userMessage,
        history,
        knowledgeSources,
        outputFormats,
        selectedPersonas,
        selectedSkills,
        multiPerspective,
        metaCognitiveEnabled,
        structureReference,
        referenceOutput,
        transparencyLevel,
        writingTone,
        emojiEnabled,
        nativeReasoningEnabled,
        audience,
        channel,
        outputLanguage,
        sessionId,
        seed,
        moduleInputs,
        iterativeReasoningEnabled,
        atomInjectionEnabled,
        atomCollectionEnabled,
        compactionEnabled,
        rerunOf,
      } = req.body;

      if (await refuseForbiddenModule(req, res, moduleId, areaId)) return;
      if (!(await ensureOwnSession(req, res, sessionId))) return;

      // MGOV-01/02: Apply compliance_policy + model allowlist checks
      //
      // Model-resolution precedence (highest first), CODING_STUDIO_DESIGN §C-req7:
      //   1. user override        — the session `model` from the request body
      //   2. compliance enforce_model — applied below (governance, wins over all)
      //   3. AREA default         — area_default_model:<areaId> (Studio seeds coding=mistral-large)
      //   4. product default      — persisted Settings choice / env DEFAULT_MODEL
      //   5. env / opus literal   — final fallback
      // Only the *fallback* (when no user model is sent) consults rungs 3–5;
      // a user-selected model and the enforce_model override are unchanged.
      let policyModel =
        (model as string) ||
        getAreaDefaultModelSync(areaId as string | null | undefined) ||
        getEffectiveDefaultModel() ||
        CLAUDE_LARGE;
      if (moduleId) {
        try {
          // enforce_model override (server-side); enforce_thinking/creativity served to client via GET /api/compliance-policy/:moduleId
          const policy = await db.get(
            'SELECT enforce_model FROM compliance_policy WHERE module_id = ?'
          , moduleId) as { enforce_model: string | null } | undefined;
          if (policy?.enforce_model) policyModel = policy.enforce_model;

          // MGOV-02: per-user model allowlist (team mode only)
          if (process.env.DEPLOYMENT_MODE === 'team' && req.user && req.user.id !== 'solo') {
            const userAllowlistCount = (await db.get('SELECT COUNT(*) as c FROM model_allowed WHERE user_id = ?', req.user.id) as { c: number }).c;
            if (userAllowlistCount > 0) {
              const allowed = (await db.get('SELECT COUNT(*) as c FROM model_allowed WHERE user_id = ? AND model_id = ?', req.user.id, policyModel) as { c: number }).c;
              if (allowed === 0) {
                res.status(403).json({ error: `Model '${policyModel}' is not permitted for your account. Contact your administrator.` });
                return;
              }
            }
          }
        } catch { /* non-fatal — policy table may not exist on older DBs */ }
      }

      // A bare Claude id with no API key configured follows the configured
      // engine — the rule every specialty route already gets from
      // provider-router. A browser with no saved model sends the literal
      // fallback id; on a subscription-only instance that must not end in
      // "add ANTHROPIC_API_KEY to your .env".
      if (policyModel.startsWith('claude-') && !isApiKeyConfigured()) {
        policyModel = mapModelToProvider(policyModel);
      }

      // Determine provider and validate API key
      const selectedModel = policyModel;
      // Ollama models are prefixed with 'ollama:' (e.g. 'ollama:llama3.2').
      // They are not in the MODEL_REGISTRY so we detect them by prefix first.
      const isOllamaModel = selectedModel.startsWith('ollama:');
      const isAzureModel = selectedModel.startsWith('azure:');
      // compat:<slug>:<model> — a user-configured OpenAI-compatible endpoint
      // (OpenRouter/Together/Groq/DeepSeek/Qwen/vLLM/…). Detected by prefix here so
      // it never falls through to getModelConfig=undefined → provider='anthropic'
      // (which silently ran the request on Claude instead of the chosen model).
      const isCompatModel = selectedModel.startsWith('compat:');
      // sdk:<model> — the Claude Agent SDK execution engine (subscription auth,
      // no API key). Prefix-detected like ollama:/azure:/compat: so it never
      // falls through to getModelConfig=undefined → provider='anthropic'.
      const isSdkEngineModel = selectedModel.startsWith('sdk:');
      // codex:<model> — the ChatGPT-subscription Codex engine (no API key).
      const isCodexEngineModel = selectedModel.startsWith('codex:');
      const modelConfig = (isOllamaModel || isAzureModel || isCompatModel || isSdkEngineModel || isCodexEngineModel) ? undefined : await getModelConfig(selectedModel, db);
      const provider = isOllamaModel ? 'ollama' : isAzureModel ? 'azure_openai' : isCompatModel ? 'openai_compatible' : isSdkEngineModel ? 'anthropic_sdk' : isCodexEngineModel ? 'openai_codex' : (modelConfig?.provider || 'anthropic');
      // The resolved compat endpoint (compat-endpoint.ts) for a compat: run.
      let compatModel: ResolvedCompatModel | null = null;

      // Demo mode: a visitor may run only the models the demo offers
      // (DEMO_OFFERED_MODELS). The picker showed only those, but this route ran
      // any model id it was sent, on any key the server holds — and outside
      // the compat branch no daily USD cap applies. With no list set, only
      // compat models run. Admins are not restricted. Checked on the model
      // the run would actually use (after enforce_model and the defaults).
      if (isDemoMode() && req.user?.role !== 'admin') {
        const offered = demoOfferedModels();
        const allowed = offered.length > 0 ? offered.includes(selectedModel) : provider === 'openai_compatible';
        if (!allowed) {
          res.status(403).json({
            error: 'This model is not offered in this demo. Pick one of the models in the model menu.',
            code: 'MODEL_NOT_OFFERED',
          });
          return;
        }
      }

      if (provider === 'anthropic') {
        if (!isApiKeyConfigured()) {
          res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
          return;
        }
      } else if (provider === 'anthropic_sdk') {
        // No API key involved — the engine authenticates with this machine's
        // Claude Code login. Gate on the Settings toggle before any SSE starts.
        if (!isSdkEngineEnabled()) {
          res.status(400).json({ error: 'The SDK execution engine is disabled. Enable it in Settings → Execution engines (requires Claude Code installed and logged in on this machine).' });
          return;
        }
      } else if (provider === 'openai_codex') {
        // No API key involved — the engine authenticates with this machine's
        // ChatGPT sign-in (`codex login`). Gate on the Settings toggle.
        if (!isCodexEngineEnabled()) {
          res.status(400).json({ error: 'The ChatGPT (Codex) execution engine is disabled. Enable it in Settings → Execution engines (requires a ChatGPT sign-in on this machine: `npx codex login`).' });
          return;
        }
      } else if (provider === 'azure_openai') {
        // Azure credentials are stored in DB, not env vars — validated at stream time
      } else if (provider === 'openai_compatible') {
        // Credentials live in the custom_model_endpoints table. Resolved here,
        // before anything is saved or sent: the endpoint's allowed_models list
        // refuses a model it does not offer, and a priced call stops at the
        // daily spend caps (llm-spend.ts).
        try {
          compatModel = await resolveCompatModel(selectedModel, db);
          await assertSpendAllowed({ db, userId: req.user?.id ?? null, role: req.user?.role ?? null });
        } catch (err) {
          if (isSpendCapError(err)) {
            res.status(402).json({ error: publicErrorMessage(err), code: err.code });
            return;
          }
          if (err instanceof CompatEndpointError) {
            res.status(err.status).json({ error: publicErrorMessage(err), code: err.code });
            return;
          }
          throw err;
        }
      } else if (provider !== 'ollama' && !isApiKeyAvailable(selectedModel)) {
        const keyName = modelConfig?.requiresApiKey || 'API_KEY';
        res.status(500).json({ error: `${keyName} not configured. Add it in Settings or your .env file.` });
        return;
      }

      // An image the chosen model cannot read is refused before anything is
      // saved — never sent as base64 text in the prompt (engineReadsImages).
      const requestedImageIds = (Array.isArray(req.body.uploadedFileIds) ? req.body.uploadedFileIds as unknown[] : [])
        .filter((id): id is string => typeof id === 'string' && IMAGE_UPLOAD_EXTENSIONS.has(path.extname(id).toLowerCase()));
      if (requestedImageIds.length > 0 && !engineReadsImages(provider, compatModel)) {
        res.status(400).json({
          error: `The model "${selectedModel}" does not read images. Remove the image, or pick a model that accepts images.`,
          code: 'IMAGE_NOT_SUPPORTED',
        });
        return;
      }
      const tooManyUrls = onlineReferenceLimitProblem(knowledgeSources);
      if (tooManyUrls) {
        res.status(400).json({ error: tooManyUrls, code: 'TOO_MANY_ONLINE_REFERENCES' });
        return;
      }

      // What a compat run will send as max_tokens (the reasoning room for this
      // level included): the knowledge budget and the whole-input check below
      // leave exactly that much of the window for the answer.
      const compatSentMax = compatModel
        ? (compatSentMaxTokens({
            maxTokens: compatModel.endpoint.maxOutputTokens ?? COMPAT_WORK_RUN_MAX_TOKENS,
            thinkingLevel: (thinking || 'think_hard') as ThinkingLevel,
            modelMeta: compatModel.meta,
            maxOutputTokens: compatModel.endpoint.maxOutputTokens,
          }) ?? COMPAT_WORK_RUN_MAX_TOKENS)
        : undefined;

      // Budget cap check (team mode only)
      if (process.env.DEPLOYMENT_MODE === 'team' && req.user && req.user.id !== 'solo') {
        const budgetRow = await db.get('SELECT monthly_token_budget FROM users WHERE id = ?', req.user.id) as { monthly_token_budget: number } | undefined;
        const budget = budgetRow?.monthly_token_budget ?? 0;
        if (budget > 0) {
          const yearMonth = new Date().toISOString().slice(0, 7);
          const usageRow = await db.get(
            'SELECT COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) as total FROM user_monthly_usage WHERE user_id = ? AND year_month = ?'
          , req.user.id, yearMonth) as { total: number } | undefined;
          const used = usageRow?.total ?? 0;
          const pct = used / budget;
          if (pct >= 1) {
            res.status(402).json({ error: 'Monthly token budget reached — contact your administrator' });
            return;
          }
          if (pct >= 0.8) {
            res.setHeader('X-Budget-Warning', '80');
          }
        }
      }

      // E5: Global monthly budget cap check (EUR cost-based, applies to all modes)
      {
        const settingRow = await db.get("SELECT value FROM app_settings WHERE key = 'monthly_budget_cap'") as { value: string } | undefined;
        const capFromDb = settingRow ? parseFloat(settingRow.value) : NaN;
        const capFromEnv = parseFloat(process.env.MONTHLY_BUDGET_CAP || '0');
        const globalCap = !isNaN(capFromDb) ? capFromDb : capFromEnv;
        if (globalCap > 0) {
          const capMonth = new Date().toISOString().slice(0, 7);
          const capSpentRow = await db.get(
            `SELECT COALESCE(SUM(cost), 0) as total FROM messages WHERE TO_CHAR(created_at, 'YYYY-MM') = ?`
          , capMonth) as { total: number };
          const capSpent = capSpentRow.total ?? 0;
          if (capSpent >= globalCap) {
            res.status(402).json({ error: 'Monthly budget cap reached', spent: capSpent, cap: globalCap });
            return;
          }
        }
      }

      // Save user message to DB before streaming starts.
      // The id is hoisted because it doubles as the deterministic unit for the
      // atom-layer A/B arm assignment (Wave 3.4) further down.
      const userMessageId = sessionId && userMessage ? crypto.randomUUID() : null;
      // Wave 1: the assistant message id is minted before dispatch and sent to
      // the page in the "context used" frame, so the answer the user is looking
      // at carries the same id as its persisted row and run artifact. Before
      // this the row id was minted inside onComplete and the browser minted its
      // own at stream end, so the artifact route 404'd until a reload.
      const assistantMessageId = crypto.randomUUID();
      if (sessionId && userMessage) {
        try {
          await db.run(
            `INSERT INTO messages (id, session_id, role, content, created_at)
             VALUES (?, ?, 'user', ?, ?)
             ON CONFLICT DO NOTHING`
          , userMessageId, sessionId, userMessage, new Date().toISOString());

          // Update session timestamp
          await db.run(`UPDATE sessions SET updated_at = ? WHERE id = ?`, new Date().toISOString(), sessionId);
        } catch {
          // Non-fatal — continue streaming even if save fails
        }
      }

      // Build messages array from history + new message.
      // For assistant messages, use stored content_blocks (which include thinking block
      // signatures) when available — this preserves extended reasoning context across turns.
      const messages: Array<{ role: 'user' | 'assistant'; content: string | object[] }> = [];

      // Pre-fetch stored content blocks for assistant messages in this session (C11 fix)
      const storedBlocksMap = new Map<string, object[]>();
      if (sessionId) {
        try {
          const stored = await db.all(`SELECT content, content_blocks FROM messages
             WHERE session_id = ? AND role = 'assistant' AND content_blocks IS NOT NULL`
          , sessionId) as Array<{ content: string; content_blocks: string }>;
          for (const row of stored) {
            try { storedBlocksMap.set(row.content, JSON.parse(row.content_blocks) as object[]); } catch { /* ignore */ }
          }
        } catch { /* non-fatal */ }
      }

      if (history && Array.isArray(history)) {
        for (const msg of history) {
          if (msg.role && msg.content) {
            if (msg.role === 'assistant' && typeof msg.content === 'string') {
              // Use stored content blocks (with thinking signatures) if available
              const blocks = storedBlocksMap.get(msg.content);
              messages.push({ role: 'assistant', content: blocks ?? msg.content });
            } else {
              messages.push({ role: msg.role, content: msg.content });
            }
          }
        }
      }
      // Inject guided module inputs as a structured context block before the user message
      // The module's config (labels, guided inputs) — used for the intake
      // rendering below and for the framework grounding query (Wave 2).
      const runModuleCfg = moduleId ? await getModule(String(moduleId)).catch(() => undefined) : undefined;
      let finalUserMessage = userMessage;
      if (moduleInputs && typeof moduleInputs === 'object' && Object.keys(moduleInputs as object).length > 0) {
        // Wave 1: render guided inputs with the module's own field labels and
        // option labels. Before this the model saw key-derived labels and raw
        // option values ("Entity Type: bank") although 9,187 of 9,188 options
        // define a label ("Institution Type: Bank / credit institution").
        const moduleCfg = runModuleCfg;
        const fieldById = new Map((moduleCfg?.guidedInputs ?? []).map((f) => [f.id, f] as const));
        const inputLines = Object.entries(moduleInputs as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
          .map(([k, v]) => {
            const field = fieldById.get(k);
            const label = field?.label?.trim() || k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            const render = (x: unknown): string => {
              const raw = String(x);
              const opt = field?.options?.find((o) => o.value === raw);
              return opt?.label ?? raw;
            };
            const value = Array.isArray(v) ? (v as unknown[]).map(render).join(', ') : render(v);
            return `- **${label}:** ${value}`;
          });
        if (inputLines.length > 0) {
          finalUserMessage = `## Module Settings\n${inputLines.join('\n')}\n\n---\n\n${userMessage}`;
        }
      }
      // Resolve uploaded file IDs → absolute paths in the uploads directory
      // The client sends file IDs (filenames) from the /api/files/upload response.
      const uploadedFileIds: string[] = await ownedUploadIds(req, (req.body.uploadedFileIds as string[]) || []);
      const IMAGE_EXTENSIONS_SERVER = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
      const IMAGE_MEDIA_TYPES_SERVER: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp',
      };

      // Separate image files from document files
      const imageFileIds: string[] = [];
      const documentFileIds: string[] = [];
      for (const id of uploadedFileIds) {
        const ext = path.extname(id).toLowerCase();
        if (IMAGE_EXTENSIONS_SERVER.has(ext)) imageFileIds.push(id);
        else documentFileIds.push(id);
      }

      // NEXT-02: Vision — build multimodal content if image files were uploaded
      if (imageFileIds.length > 0) {
        const contentBlocks: object[] = [];
        for (const id of imageFileIds) {
          const imgPath = path.join(UPLOAD_DIR, id);
          const safe = imgPath.startsWith(UPLOAD_DIR);
          if (!safe) continue;
          try {
            const imgBuf = await import('fs-extra').then(m => m.default.readFile(imgPath));
            const ext = path.extname(id).toLowerCase();
            const mediaType = IMAGE_MEDIA_TYPES_SERVER[ext] || 'image/png';
            contentBlocks.push({
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imgBuf.toString('base64') },
            });
          } catch (imgErr) {
            // The id is the client's: an argument, never part of the format string.
            console.error('[claude] Failed to read image %s:', id, imgErr);
          }
        }
        contentBlocks.push({ type: 'text', text: finalUserMessage });
        messages.push({ role: 'user', content: contentBlocks });
      } else {
        messages.push({ role: 'user', content: finalUserMessage });
      }

      // WP-11: Load user profile for Layer 0 prompt personalisation — the
      // caller's own in team mode (B4), the single 'default' row in solo.
      const userProfile = await loadLayer0Profile(db, req);

      const uploadedFilePaths = documentFileIds
        .map((id) => path.join(UPLOAD_DIR, id))
        .filter((p) => {
          // Security: ensure the resolved path is within UPLOAD_DIR
          const ok = p.startsWith(UPLOAD_DIR);
          if (!ok) console.warn(`[claude] Rejected path (outside UPLOAD_DIR): ${p}`);
          return ok;
        });

      // Project (matter) documents (Wave 2, 2026-09-08): a session inside a
      // project reads the project's files as if they were attached to the
      // turn — the project is the container, so its documents ride along.
      // Newest ten, images excluded, budgeted by the resolver like uploads.
      let projectRow: { id: string; name: string } | null = null;
      const projectFileLabels: Record<string, string> = {};
      const projectDocumentPaths: string[] = [];
      if (sessionId) {
        try {
          projectRow = (await db.get(
            'SELECT p.id, p.name FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.id = ?',
            String(sessionId),
          ) as { id: string; name: string } | undefined) ?? null;
          // The session is the caller's (ensureOwnSession), but its project may
          // no longer be: someone removed from a matter keeps their old sessions
          // and must not keep reading its files. Same rule as the project layer.
          if (projectRow && scopesToOwner(req)) {
            const access = await resolveProjectAccess(db, {
              projectId: projectRow.id,
              userId: req.user?.id ?? '',
              userRole: req.user?.role ?? null,
              teamMode: true,
            });
            if (access !== 'ok') projectRow = null;
          }
          if (projectRow) {
            const rows = await db.all(
              'SELECT file_path, original_name, extension FROM project_files WHERE project_id = ? ORDER BY created_at DESC LIMIT 10',
              projectRow.id,
            ) as Array<{ file_path: string; original_name: string; extension: string | null }>;
            for (const f of rows) {
              const ext = String(f.extension || path.extname(f.original_name)).toLowerCase();
              if (IMAGE_EXTENSIONS_SERVER.has(ext)) continue;
              const resolvedPath = path.resolve(f.file_path);
              if (uploadedFilePaths.includes(resolvedPath) || projectDocumentPaths.includes(resolvedPath)) continue;
              projectDocumentPaths.push(resolvedPath);
              projectFileLabels[resolvedPath] = `${f.original_name} (project: ${projectRow.name})`;
            }
          }
        } catch { /* non-fatal — project documents are enrichment */ }
      }
      const allDocumentPaths = [...uploadedFilePaths, ...projectDocumentPaths];

      // Capability-aware knowledge budget (plan 2.15): derived from the
      // session model's real context window — 800k for 1M-context Claude
      // (unchanged), ~104k for Mistral Large, the trained window for
      // ollama:* (via /api/show), the per-endpoint setting for compat:*.
      // Previously every non-1M model silently got the ~892k default.
      // Derived from the capability table, not a hardcoded id list — every new
      // 1M-context model would otherwise silently be treated as short-context and
      // pick up a long-context beta header it does not need (see line ~1120).
      // Keyed by the model the run will actually use (selectedModel — after
      // compliance enforce_model / area default / instance default), with an
      // sdk: prefix stripped: the engine's model has the engine's window. Keyed
      // by the raw request field, the sdk: default missed the table and got a
      // 16k budget on a 1M model.
      const is1MModel = (MODEL_CAPABILITIES[capabilityModelId(selectedModel)]?.maxContextWindow ?? 0) >= 1_000_000;
      const knowledgeBudget = await resolveContextBudget(
        selectedModel,
        db as DatabaseAdapter,
        compatSentMax !== undefined ? { outputTokens: compatSentMax } : {},
      );

      // TOKEN-03: Emit SSE progress events during context assembly when local folders are involved.
      // Set SSE headers early so we can stream progress before the Claude API call starts.
      const hasLocalFolders = !!(knowledgeSources as any)?.modes?.localFolder?.enabled &&
        ((knowledgeSources as any)?.modes?.localFolder?.folderPaths?.length ?? 0) > 0;
      const hasUploadedFiles = allDocumentPaths.length > 0 || imageFileIds.length > 0;
      const needsEarlySSE = hasLocalFolders || hasUploadedFiles;

      const sendProgress = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

      if (needsEarlySSE && !res.headersSent) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        sendProgress({ type: 'context_assembly_start' });
      }

      // Resolve knowledge sources (existing: Claude knowledge, URLs, local folders)
      const resolved: ResolvedKnowledge = knowledgeSources
        ? await resolveKnowledgeSources(knowledgeSources, allDocumentPaths, { contextBudget: knowledgeBudget, fileLabels: projectFileLabels })
        : { systemPromptAdditions: '', contextDocuments: '', tools: [], tokenEstimate: 0, sourceManifest: [], sourceDetails: [] };

      if (needsEarlySSE) {
        sendProgress({ type: 'context_assembly_complete', tokenEstimate: resolved.tokenEstimate });
      }

      // NEW: RAG Search Integration (Phase 4.8 + 4.9)
      let ragContext = '';
      let ragChunks: any[] = [];
      let ragTokenEstimate = 0;

      // ragSearch is nested inside knowledgeSources on the client side
      const ragSearchConfig = (knowledgeSources as any)?.ragSearch ?? req.body.ragSearch;
      if (ragSearchConfig?.enabled && ragSearchConfig.collections?.length > 0) {
        const { collections, topK, rerank } = ragSearchConfig;

        try {
          const results = await semanticSearch(db as DatabaseAdapter, {
            query: userMessage, // Use user's message as search query
            collections,
            topK: topK || 10,
            rerank: rerank ?? true,
            // Collections are shared, documents are not: in team mode only the
            // sender's own uploads reach their prompt (solo/admin: all).
            owner: req as OwnedRequest,
          });

          ragChunks = results;

          if (results.length > 0) {
            // Wave 2: say how the passages were found. Until now this block said
            // "relevant" with a "Relevance %" whatever ran — and on this instance
            // the vector index was unreachable, so the number was keyword density.
            const methodWord: Record<string, string> = {
              vector: 'vector similarity over your uploaded documents',
              hybrid: 'vector similarity fused with keyword matching over your uploaded documents',
              keyword: 'keyword matching over your uploaded documents (no vector index was available)',
            };
            const scoreLabel = (r: { score?: number; scoreKind?: string; relevanceScore?: number }): string => {
              const s = typeof r.score === 'number' ? r.score : (r.relevanceScore ?? 0);
              switch (r.scoreKind) {
                case 'cosine_similarity': return `Cosine similarity: ${(s * 100).toFixed(1)}%`;
                case 'rrf_normalised': return `Hybrid rank score: ${s.toFixed(2)} (1.0 = first in both lists)`;
                default: return `Keyword coverage: ${(s * 100).toFixed(0)}% of query terms`;
              }
            };
            const setMethod = results[0]?.method ?? 'keyword';
            ragContext = '\n\n## RETRIEVED KNOWLEDGE FROM KNOWLEDGE BASE\n\n';
            ragContext += `I have retrieved ${results.length} passages by ${methodWord[setMethod] ?? setMethod}. Use these as reference material and cite them when applicable.\n\n`;

            results.forEach((result, idx) => {
              const chunkText = `### Source ${idx + 1}: ${result.citation}\n` +
                `${scoreLabel(result)}\n` +
                `Collection: ${result.collectionName}\n\n` +
                `${result.content}\n\n` +
                `---\n\n`;

              ragContext += chunkText;
              // Estimate tokens: ~4 chars per token
              ragTokenEstimate += Math.ceil(chunkText.length / 4);
            });

            // Add to resolved knowledge
            resolved.contextDocuments += ragContext;
            resolved.tokenEstimate += ragTokenEstimate;
            resolved.sourceManifest.push(`RAG: ${results.length} chunks from ${collections.length} collection(s)`);
            // Item 1.6: pin each retrieved chunk in the run artifact source manifest
            const ragRetrievedAt = new Date().toISOString();
            (resolved.sourceDetails ??= []).push(...results.map((r) => ({
              type: 'rag_chunk',
              name: String(r.citation ?? r.collectionName ?? 'rag chunk'),
              sha256: sha256Hex(String(r.content ?? '')),
              charCount: String(r.content ?? '').length,
              retrievedAt: ragRetrievedAt,
              contentHashed: true,
            })));
          }
        } catch (error) {
          console.error('[RAG] Search failed:', error);
          // Non-fatal — continue without RAG results
        }
      }

      // Wave 3: server-built output-format instruction (Layer 6b). The browser
      // still sends its own copy; when it also sends the format ids the server
      // rebuilds the instruction from the same library and prefers that.
      const serverOutputInstruction: string | undefined =
        Array.isArray(outputFormats) && outputFormats.length > 0
          ? (buildOutputInstruction(outputFormats as string[]) || (outputInstruction as string | undefined))
          : (outputInstruction as string | undefined);
      // Auto-attach output-format-specific skills (e.g., pptx-generation for PowerPoint output)
      const autoAttachIds = getAutoAttachSkillIds(Array.isArray(outputFormats) ? outputFormats : []);
      const mergedSkills = Array.isArray(selectedSkills)
        ? [...new Set([...selectedSkills, ...autoAttachIds])]
        : autoAttachIds.length > 0 ? autoAttachIds : undefined;

      // PE/VC "My Way of Working" — inject fund identity + IC memo template for ic-memo module
      let businessContext: string | null = null;
      if (moduleId === 'ic-memo') {
        try {
          const identityRow = await db.get(
            'SELECT * FROM fund_identity WHERE id = ?', 'default'
          ) as {
            fund_name?: string; fund_type?: string; geography_focus?: string;
            sector_focus?: string; typical_check_size?: string; partner_name?: string;
            currency?: string; investment_style_notes?: string;
          } | undefined;
          if (identityRow) {
            const contextParts: string[] = ['## YOUR FIRM\'S CONTEXT (MY WAY OF WORKING)'];
            contextParts.push(
              `Fund: ${identityRow.fund_name || '(not set)'} (${identityRow.fund_type || 'fund type not set'})\n` +
              `Geography: ${identityRow.geography_focus || '(not set)'}\n` +
              `Sectors: ${identityRow.sector_focus || '(not set)'}\n` +
              `Typical check size: ${identityRow.typical_check_size || '(not set)'}\n` +
              `Partner: ${identityRow.partner_name || '(not set)'}\n` +
              `Currency: ${identityRow.currency || 'EUR'}\n` +
              `Investment style: ${identityRow.investment_style_notes || '(not set)'}`
            );

            // Look up the default IC memo template
            const tmplRow = await db.get(
              "SELECT template_content, section_order, style_notes FROM ic_memo_templates WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1"
            ) as { template_content: string; section_order: string; style_notes: string } | undefined;

            if (tmplRow?.template_content) {
              let sectionOrder: string[] = [];
              try { sectionOrder = JSON.parse(tmplRow.section_order); } catch { /* keep empty */ }
              contextParts.push(
                `## YOUR IC MEMO FORMAT (MY WAY OF WORKING)\n` +
                `The user's IC memos follow this EXACT structure. Replicate it precisely:\n\n` +
                tmplRow.template_content +
                (sectionOrder.length ? `\n\nSection order: ${sectionOrder.join(' → ')}` : '') +
                (tmplRow.style_notes ? `\n\nStyle notes: ${tmplRow.style_notes}` : '')
              );
              contextParts.push(
                `## CRITICAL INSTRUCTION\nThis IC memo must follow the user's established format exactly. ` +
                `Match their section headings, level of detail per section, writing style, and recommendation framing. ` +
                `The user must not be able to tell whether they or ANTON wrote this memo.`
              );
            }

            businessContext = contextParts.join('\n\n');
          }
        } catch (pevcErr) {
          console.warn('[pe-vc] Failed to load IC memo context (non-fatal):', pevcErr);
        }
      }

      // Trades "My Way of Working" — fetch business identity + matching template/pattern
      if (!businessContext && areaId === 'trades') {
        try {
          const identityRow = await db.get("SELECT profile_data FROM business_identity WHERE id = 'default'") as { profile_data: string } | undefined;
          if (identityRow) {
            const profile = JSON.parse(identityRow.profile_data);

            // Look up the module config to find myWayProcessType
            let processType: string | null = null;
            if (moduleId) {
              try {
                const { getModule } = await import('../services/module-loader.js');
                const modConfig = await getModule(moduleId);
                processType = (modConfig as any)?.myWayProcessType || null;
              } catch { /* non-fatal */ }
            }

            const docTypeMap: Record<string, string> = {
              invoicing: 'invoice',
              quoting: 'quote',
              communicating: 'message',
            };
            const docType = processType ? docTypeMap[processType] || processType : null;

            let templateData: unknown = null;
            if (docType) {
              const tmplRow = await db.get(
                "SELECT template_data FROM document_templates WHERE document_type = ? ORDER BY is_default DESC, updated_at DESC LIMIT 1",
                docType
              ) as { template_data: string } | undefined;
              if (tmplRow) {
                try { templateData = JSON.parse(tmplRow.template_data); } catch { /* ignore */ }
              }
            }

            let patternData: unknown = null;
            if (processType) {
              const ptnRow = await db.get("SELECT pattern_data FROM process_patterns WHERE process_type = ? ORDER BY updated_at DESC LIMIT 1", processType) as
                | { pattern_data: string }
                | undefined;
              if (ptnRow) {
                try { patternData = JSON.parse(ptnRow.pattern_data); } catch { /* ignore */ }
              }
            }

            const contextParts: string[] = ['## MY WAY OF WORKING — BUSINESS IDENTITY'];
            contextParts.push(
              `Business: ${profile.businessName || '(not set)'}\n` +
              `Owner: ${profile.ownerName || ''}\n` +
              `Trade: ${profile.tradeType || ''}\n` +
              `Hourly rate: ${profile.hourlyRate ? `${profile.hourlyRate} ${profile.currency || 'SEK'}` : '(not set)'}\n` +
              `Travel rate: ${profile.travelRate ? `${profile.travelRate} ${profile.currency || 'SEK'}/hour` : '(none)'}\n` +
              `Payment: ${profile.preferredPaymentMethods?.map((p: any) => p.details).join(', ') || '(not set)'}\n` +
              `Payment terms: ${profile.defaultPaymentTerms ? `${profile.defaultPaymentTerms} days` : '(not set)'}\n` +
              `VAT registered: ${profile.vatRegistered ? 'Yes' : 'No'}\n` +
              `Country: ${profile.country || 'SE'}\n` +
              `Invoice numbering: ${profile.invoiceNumberFormat || '(not set)'}\n` +
              `Invoice prefix: ${profile.invoicePrefix || ''}\n` +
              `Certifications: ${profile.certifications?.join(', ') || 'none'}\n` +
              `Late payment text: ${profile.latePaymentText || '(default)'}`
            );

            if (templateData) {
              contextParts.push(
                `## MY INVOICE/DOCUMENT TEMPLATE\n` +
                `The user's documents follow this EXACT structure and vocabulary. USE THIS, do not deviate:\n` +
                JSON.stringify(templateData, null, 2)
              );
            }

            if (patternData) {
              contextParts.push(
                `## MY PROCESS PATTERN\n` +
                `When creating ${processType} documents, apply these rules and inputs:\n` +
                JSON.stringify(patternData, null, 2)
              );
            }

            contextParts.push(
              `## CRITICAL INSTRUCTION\nGenerate output that matches the user's business identity EXACTLY. Use their vocabulary, their document structure, their rates, their payment terms. The user must not be able to tell whether they or ANTON created this document.`
            );

            businessContext = contextParts.join('\n\n');
          }
        } catch (bizErr) {
          console.warn('[trades] Failed to load business context (non-fatal):', bizErr);
        }
      }

      // Compose the full system prompt through the layered PromptComposer (async).
      // For Anthropic models that support prompt caching (Opus 4.8, Sonnet 4.6, Sonnet 4.5) we use
      // the split variant so the stable static layers (Foundation + Area Context + Module
      // Prompt) can be marked with cache_control and cached by Anthropic between API calls,
      // reducing costs ~90% on those tokens. Dynamic layers (output format instructions,
      // knowledge additions, reference documents, etc.) are sent in a second uncached block.
      // Pre-build strategic improvement layers (non-fatal — empty string if DB table missing)
      const orgContextPrompt = await buildOrgContextLayer(db, req.user?.id || 'default');
      // Wave 4: the resume block is injected only when the session is picked up
      // again after a break (RESUME_GAP_MINUTES); the conversation history
      // already carries recent context, so on a continuous run it stays out.
      const resumeDue = sessionId ? await buildResumeContextIfDue(db, String(sessionId)) : null;
      const resumeContextPrompt = resumeDue?.text ?? '';
      // The project (matter) this session belongs to: what was concluded in its
      // other sessions rides along. buildProjectContextSummary had existed for
      // months with no caller — sessions never carried a project_id at creation.
      // Wave 4: the project layer reads what the sibling sessions CONCLUDED
      // (sessions.summary + their conclusion's decisions), the matter brief and
      // the engagement linked to the project — not the first 200 words of each
      // last answer — and checks membership first in team mode.
      let projectContextPrompt = '';
      if (sessionId && projectRow) {
        try {
          const pc = await buildProjectContext(db, {
            projectId: projectRow.id,
            currentSessionId: String(sessionId),
            userId: req.user?.id ?? 'default',
            userRole: req.user?.role ?? null,
            teamMode: process.env.DEPLOYMENT_MODE === 'team',
          });
          projectContextPrompt = pc.text;
        } catch { /* non-fatal — the project layer is enrichment */ }
      }
      // Wave 2: the pack layer is scoped to the run's area and returns the
      // entries it injected (pack, ref, tier, score) for the run artifact.
      const packLayer = await buildKnowledgePackLayerDetailed(db, { areaId, moduleId, userMessage });
      const knowledgePackPrompt = packLayer.text;
      // Wave 2: framework article text reaches module runs. Until now the 60
      // article-level framework files grounded Counsel's Desk, the Task Agent
      // and the agentic tools, but never a run through this route — an FCP
      // gap analysis received pack entity summaries and no article. The
      // area seeds the weak scope; a regulation the user names is strong scope.
      let frameworkGrounding: GroundingResult | null = null;
      if (moduleId || areaId) {
        try {
          frameworkGrounding = await retrieveGroundingText({
            query: [runModuleCfg?.label, userMessage].filter(Boolean).join(' '),
            frameworkIds: frameworksForArea(areaId),
            tokenBudget: 3000,
          });
        } catch { frameworkGrounding = null; }
      }
      const frameworkGroundingPrompt = frameworkGrounding?.text ?? '';
      const groundingRetrievedAt = new Date().toISOString();
      // Wave 3.4 — atom-layer A/B experiment: when injection is on and the run
      // will be persisted, ~20% of runs are deterministically assigned to a
      // 'holdout' arm (hash of the user-message id — no Math.random) where the
      // atom layer is SKIPPED. The arm is tagged in audit_log.atom_arm and in
      // run_artifacts.layer_summary so quality_scores can finally be compared
      // per arm (Intelligence Dashboard card) instead of assuming the layer
      // helps. Kill switch: app_settings 'atom_ab_experiment' (default on).
      // F2: reruns (body.rerunOf, set only by the rerun dispatcher) are never
      // experiment subjects — an arm from the rerun's fresh message id would
      // straddle arms within the session (excluded from the stats) or
      // double-count another model's quality into one arm. Atom injection
      // itself still applies to reruns exactly like the original run.
      const atomInjectionOn = atomInjectionEnabled !== false;
      let atomArm: 'injected' | 'holdout' | null = null;
      // Wave 4b: no arm while the injection gate is closed — a 'holdout' tagged
      // on a run that could not have been injected anyway would count a
      // non-treatment as a treatment and bias the experiment.
      if (
        userMessageId && // type narrowing — the predicate also checks it
        isExperimentSubject({ isRerun: !!rerunOf, atomInjectionOn, sessionId, userMessageId }) &&
        await isAtomAbEnabled(db) &&
        (await getAtomInjectionStatus(db)).applies
      ) {
        atomArm = assignAtomArm(userMessageId);
      }
      // Wave 4: the layer goes through the injection gate (Settings
      // atom_injection_mode: auto | on | off; auto injects only once 100 module
      // atoms and 30 ratings exist), binds each injected atom to this answer's
      // id so a rating is per answer, and reports what it did in contextUsed.
      const atomLayer = atomInjectionOn && atomArm !== 'holdout'
        ? await buildAtomLayerDetailed(db, {
            areaId,
            moduleId,
            userMessage,
            sessionId: sessionId ? String(sessionId) : null,
            messageId: sessionId ? assistantMessageId : null,
            ownerUserId: req.user?.id ?? null,
            teamMode: process.env.DEPLOYMENT_MODE === 'team',
          })
        : null;
      const atomLayerPrompt = atomLayer?.text ?? '';
      // Finding #9: drop an 'injected' arm whose atom layer came back empty so the
      // A/B experiment is not biased toward "atoms don't help" by runs that never
      // actually injected anything. resolveFinalArm leaves 'holdout'/null as-is.
      atomArm = resolveFinalArm(atomArm, atomLayerPrompt);
      // A run without an area gets the user's universal ('all'-scoped) values
      // and nothing else. Defaulting the domain to 'finance' handed every
      // open-chat question the Markets strategy and paper-trading constraints
      // as HARD rules — a stored run shows a kickoff-agenda request being
      // rewritten into an AMLR project under them.
      const goalsValuesPrompt = await temporalReasoning.buildGoalsValuesLayer(
        req.user?.id || 'default',
        areaId || 'general'
      );

      const promptComposerConfig = {
        moduleId,
        areaId,
        systemPromptOverride: systemPrompt,
        creativity: creativity || 'balanced',
        thinking: thinking || 'think_hard',
        // Wave 3: the output-format instruction is built on the server from the
        // selected format ids (same library the browser used), so sync/MCP
        // callers get it too and the run artifact hashes text the server owns.
        outputInstruction: serverOutputInstruction,
        plainTextMode: !!plainTextMode,
        selectedPersonas: Array.isArray(selectedPersonas) ? selectedPersonas : undefined,
        selectedSkills: mergedSkills,
        multiPerspective: !!multiPerspective,
        metaCognitiveEnabled: !!metaCognitiveEnabled,
        structureReference,
        referenceOutput: referenceOutput || undefined,
        transparencyLevel: ([0, 1, 2] as number[]).includes(transparencyLevel) ? (transparencyLevel as 0 | 1 | 2) : 0,
        writingTone: writingTone || 'professional',
        emojiEnabled: !!emojiEnabled,
        audience: audience || undefined,
        channel: channel || undefined,
        outputLanguage: outputLanguage || undefined,
        knowledgeSystemAdditions: resolved.systemPromptAdditions,
        knowledgeContextDocuments: resolved.contextDocuments,
        userProfile: userProfile || null,
        businessContext: businessContext || null,
        orgContextPrompt: orgContextPrompt || undefined,
        knowledgePackPrompt: knowledgePackPrompt || undefined,
        frameworkGroundingPrompt: frameworkGroundingPrompt || undefined,
        atomLayerPrompt: atomLayerPrompt || undefined,
        resumeContextPrompt: resumeContextPrompt || undefined,
        projectContextPrompt: projectContextPrompt || undefined,
        goalsValuesPrompt: goalsValuesPrompt || undefined,
      } as const;

      // Use the split composer for Anthropic models (supports caching); plain for others.
      // The same test claude-client applies — a second list here missed Fable 5.1.
      const isCachingModel = provider === 'anthropic' && isCacheSupportedModel(selectedModel);

      // Wave 1: one composition for every engine (same block order on the API
      // and the subscription engine); the parts list feeds the per-layer
      // hashes in the run artifact and the prompt-version bookkeeping.
      const composed = await composeSystemPromptParts(promptComposerConfig);
      let composedPrompt: string;
      let staticSystemPrompt: string | undefined;

      if (isCachingModel) {
        composedPrompt = composed.dynamicPart;   // dynamic portion → system string in StreamConfig
        staticSystemPrompt = composed.staticPart; // static portion → cached block
      } else {
        composedPrompt = composed.full;
        staticSystemPrompt = undefined;
      }

      // Merge tools from knowledge resolver (web search) with any request-level tools
      const tools = resolved.tools as Array<{ type: string; name: string }>;

      // Wave 2 (2026-09-08): what this answer is built from — sent to the page
      // as a "context used" frame before the model call and kept on the
      // message's config snapshot. It records what is actually in the prompt
      // (documents, project, lens, knowledge layers), not what was toggled.
      // Wave 0: the effort word the ladder resolves for this level on this
      // model — recorded so "how hard did it think" is a fact, not a level name.
      // Only Anthropic-family engines express effort; others record null.
      // A compat model records the reasoning setting actually sent ('off' when
      // switched off; null when the endpoint says the model does not reason).
      const compatReasoning = provider === 'openai_compatible'
        ? compatReasoningParam((thinking || 'think_hard') as Parameters<typeof compatReasoningParam>[0], compatModel?.meta?.reasoning)
        : undefined;
      const resolvedEffort: string | null =
        provider === 'anthropic' || provider === 'anthropic_sdk'
          ? anthropicEffort((thinking || 'think_hard') as Parameters<typeof anthropicEffort>[0], capabilityModelId(selectedModel))
          : compatReasoning
            ? ('effort' in compatReasoning ? compatReasoning.effort : 'off')
            : null;
      const contextUsed = {
        model: selectedModel,
        thinking: String(thinking || 'think_hard'),
        engine: provider,
        effort: resolvedEffort,
        assistantMessageId: sessionId ? assistantMessageId : null,
        lens: moduleId ? { moduleId: String(moduleId), areaId: areaId ? String(areaId) : null } : null,
        project: projectRow,
        // Wave 2: every document-class source — uploads, project files, URLs
        // and folder files — with budget skips flagged whatever the type. The
        // resolver now marks a skipped URL or folder file exactly like a
        // skipped upload; before, only uploads reached this list.
        documents: (resolved.sourceDetails ?? [])
          .filter((d) => d.type === 'uploaded_file' || d.type === 'url' || d.type === 'local_file')
          .map((d) => ({
            name: d.name,
            chars: d.charCount ?? 0,
            source: (d.type === 'url' ? 'url'
              : d.type === 'local_file' ? 'folder'
              : d.path && projectFileLabels[d.path] ? 'project' : 'upload') as 'project' | 'upload' | 'url' | 'folder',
            ...(d.note ? { skipped: true, note: d.note } : {}),
          })),
        skippedCount: resolved.skippedCount ?? 0,
        skippedTokens: resolved.skippedTokens ?? 0,
        knowledgeSources: resolved.sourceManifest,
        ragChunks: ragChunks.length,
        packGroundingChars: knowledgePackPrompt.length,
        // Wave 2: which packs and which framework articles grounded this run.
        packs: packLayer.packs.map((p) => ({
          name: p.displayName,
          version: p.version,
          entries: packLayer.entries.filter((e) => e.packId === p.id).length,
        })),
        packEntries: packLayer.entries.length,
        frameworks: frameworkGrounding ? [...new Set(frameworkGrounding.sources.filter((s) => s.articleId).map((s) => s.frameworkName))] : [],
        frameworkArticles: frameworkGrounding ? frameworkGrounding.sources.filter((s) => s.articleId).length : 0,
        frameworkChars: frameworkGroundingPrompt.length,
        atomChars: atomLayerPrompt ? atomLayerPrompt.length : 0,
        // Wave 4: what the memory gate decided for this run and which atoms
        // (by id) went in — the page and the run artifact both read this.
        atoms: atomLayer
          ? {
              applied: atomLayer.applied,
              reason: atomLayer.reason,
              ids: atomLayer.atoms.map((a) => a.id),
              count: atomLayer.atoms.length,
              mode: atomLayer.gate.mode,
              moduleAtoms: atomLayer.gate.moduleAtoms,
              ratings: atomLayer.gate.ratings,
              thresholds: atomLayer.gate.thresholds,
            }
          : {
              applied: false,
              reason: atomArm === 'holdout' ? 'A/B holdout arm for this run' : 'Memory injection switched off for this session',
              ids: [],
              count: 0,
              mode: 'auto' as const,
              moduleAtoms: 0,
              ratings: 0,
              thresholds: { moduleAtoms: 0, ratings: 0 },
            },
        orgContext: Boolean(orgContextPrompt),
        goalsValues: Boolean(goalsValuesPrompt),
        resumeContext: Boolean(resumeContextPrompt),
        // Wave 4: sizes, not booleans, for the layers that carry memory.
        projectContextChars: projectContextPrompt.length,
        goalsValuesChars: goalsValuesPrompt.length,
        resumeContextChars: resumeContextPrompt.length,
        webSearch: tools.some((t) => t.type === 'web_search_20250305'),
        // What the engine could not do as asked (web search, revelation chain,
        // multi-agent on a non-Claude model; a cut-off answer) — also sent to
        // the page as `notice` frames.
        notices: [] as Array<{ code: string; message: string }>,
      };

      // Log composed prompt length for debugging
      const promptLengthDesc = staticSystemPrompt
        ? `static=${staticSystemPrompt.length} chars (cached) + dynamic=${composedPrompt.length} chars`
        : `${composedPrompt.length} chars`;
      console.log(
        `[ANTON] Prompt: ${promptLengthDesc} | ` +
        `module=${moduleId || 'none'} | creativity=${creativity || 'balanced'} | ` +
        `thinking=${thinking} | formats=${(outputFormats || []).length} | ` +
        `knowledge sources: ${resolved.sourceManifest.join(', ') || 'none'} | ` +
        `context tokens: ~${resolved.tokenEstimate}`
      );

      // Compute cost rates for this model.
      // Known models (in MODEL_REGISTRY) → their real per-1M pricing.
      // Unknown providers must NOT be billed phantom Opus rates ($15/$75) into the
      // ENFORCED global cap (SUM(messages.cost)) + analytics:
      //   - ollama: local models are free → cost 0
      //   - azure:/compat:/other unknowns → cost NULL (honest "we don't know"),
      //     mirroring engagement-session-bridge.ts. NULL is excluded by SUM() so
      //     it neither trips the cap nor pollutes totalCost.
      const hasKnownPricing = !!modelConfig;
      const costIn = modelConfig?.costPer1MInput ?? 0;
      const costOut = modelConfig?.costPer1MOutput ?? 0;

      // A failed run leaves a record too. Every engine reports failure as an SSE
      // `error` frame and returns normally, so the route watches its own stream
      // for that frame and writes a `failed` record once the response is done.
      // ('close' + "onComplete never ran" would misfire: the SDK engines end the
      // response before calling onComplete.)
      if (sessionId) {
        let runErrorSeen = false;
        const writeThrough = res.write.bind(res) as (...args: unknown[]) => boolean;
        res.write = ((...args: unknown[]) => {
          if (!runErrorSeen && isSseErrorFrame(args[0])) runErrorSeen = true;
          return writeThrough(...args);
        }) as typeof res.write;
        res.once('finish', () => {
          if (!runErrorSeen) return;
          void writeRunArtifactV2(db, {
            sessionId: String(sessionId),
            composedPrompt: staticSystemPrompt ? `${staticSystemPrompt}\n\n${composedPrompt}` : composedPrompt,
            ...messageRunRecordFields({ modelRequested: String(selectedModel), status: 'failed' }),
          });
        });
      }

      // The user's monthly token budget (team mode) counts every run: a
      // finished one through runComplete below, one cut short from what the
      // compat adapter recorded (the adapter catch). It used to be charged
      // inside onComplete only — which exists only with a sessionId and runs
      // only when an answer finished — so a run sent with no session, or
      // closed before its last chunk, never counted (review C1/C3).
      const chargeMonthlyUsage = async (inputTokens: number, outputTokens: number): Promise<void> => {
        if (process.env.DEPLOYMENT_MODE !== 'team' || !req.user || req.user.id === 'solo') return;
        const input = Math.max(0, Math.round(inputTokens || 0));
        const output = Math.max(0, Math.round(outputTokens || 0));
        if (input === 0 && output === 0) return;
        try {
          await db.run(`
            INSERT INTO user_monthly_usage (id, user_id, year_month, input_tokens, output_tokens)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, year_month) DO UPDATE SET
              input_tokens = user_monthly_usage.input_tokens + excluded.input_tokens,
              output_tokens = user_monthly_usage.output_tokens + excluded.output_tokens
          `, crypto.randomUUID(), req.user.id, new Date().toISOString().slice(0, 7), input, output);
        } catch {
          // Non-fatal
        }
      };

      // Callback to save assistant message + audit after streaming completes
      const onComplete = sessionId
        ? async (data: { text: string; thinking: string; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreationTokens?: number; rawContentBlocks?: unknown[]; modelServed?: string; engineCostUsd?: number; systemPromptSent?: string; webSources?: Array<{ kind: 'web_search' | 'web_fetch'; query?: string; url?: string; title?: string; resultUrls?: string[]; sha256?: string; charCount?: number; retrievedAt: string; isError?: boolean }>; compatCost?: { usd: number; source: SpendCostSource } }) => {
            // Wave 0: how this run is billed, so a NULL cost reads as "plan usage"
            // or "unknown pricing" rather than "free". A compat run whose
            // endpoint reported what it charged (OpenRouter usage.cost) is
            // 'reported'; one priced from the admin's endpoint prices is 'list'.
            const costBasis: 'list' | 'free' | 'plan' | 'unknown' | 'reported' =
              isSdkEngineModel || isCodexEngineModel ? 'plan'
              : isOllamaModel ? 'free'
              : data.compatCost?.source === 'reported' ? 'reported'
              : hasKnownPricing || data.compatCost ? 'list'
              : 'unknown';
            // Wave 1: content-addressed versions of the prompts this run used —
            // the module prompt (file or the user's override) and the ground
            // prompt — so the audit row names the exact text, not "latest".
            const modulePromptPart = composed.parts.find((p) => p.key === 'layer4_module_prompt');
            const modulePromptVersion = moduleId && modulePromptPart
              ? await ensurePromptVersion(db, String(moduleId), modulePromptPart.text, systemPrompt ? 'user-override' : 'system')
              : null;
            const foundationVersion = await ensurePromptVersion(db, FOUNDATION_PROMPT_ID, foundationPromptText());
            // Build config snapshot first — used in both INSERT and UPDATE below
            const configSnapshot = {
              model: selectedModel,
              // Wave 1: what the run was actually built from, pinned.
              mergedSkills: mergedSkills ?? [],
              moduleInputs: moduleInputs && typeof moduleInputs === 'object' ? moduleInputs : null,
              userTurnSha256: sha256Hex(finalUserMessage),
              modulePromptVersionId: modulePromptVersion?.id ?? null,
              modulePromptVersion: modulePromptVersion?.version ?? null,
              modulePromptSha256: modulePromptPart ? sha256Hex(modulePromptPart.text) : null,
              foundationVersionId: foundationVersion?.id ?? null,
              guardrailApplied: composed.parts.some((p) => p.key === 'layer4c_guardrail'),
              provenanceContract: composed.parts.some((p) => p.key === 'layer7_provenance_contract'),
              // Wave 0: engine, resolved effort and the model the engine actually
              // served (a dated snapshot id where the API/SDK reports one).
              engine: provider,
              effort: resolvedEffort,
              modelServed: data.modelServed ?? null,
              costBasis,
              engineCostUsd: data.engineCostUsd ?? data.compatCost?.usd ?? null,
              thinking: req.body.thinking,
              creativity: req.body.creativity,
              transparencyLevel: req.body.transparencyLevel,
              selectedOutputFormats: outputFormats,
              selectedPersonas,
              selectedSkills,
              knowledgeSources,
              plainTextMode: !!req.body.plainTextMode,
              writingTone: req.body.writingTone || 'professional',
              audience: req.body.audience || null,
              outputLanguage: req.body.outputLanguage || null,
              // Full audit fields
              systemPrompt: (req.body.systemPrompt as string) || null,
              metaCognitiveEnabled: !!req.body.metaCognitiveEnabled,
              multiPerspective: !!req.body.multiPerspective,
              emojiEnabled: !!req.body.emojiEnabled,
              nativeReasoningEnabled: !!req.body.nativeReasoningEnabled,
              structureReference: req.body.structureReference || null,
              multiAgentEnabled: !!req.body.multiAgentEnabled,
              multiAgentTeam: req.body.multiAgentTeam || null,
              multiAgentStyle: req.body.multiAgentStyle || null,
              precision: req.body.precision || null,
              channel: req.body.channel || null,
              // Wave 2: what was actually in the prompt (see contextUsed above),
              // plus (Wave 0) the served model once the engine has reported it.
              contextUsed: { ...contextUsed, modelServed: data.modelServed ?? null },
            };
            // CACHE-03: include cache read/write tokens and compute cache-adjusted cost.
            // Computed BEFORE the message INSERT so the real per-call cost is persisted
            // on the assistant message row — the global budget cap (SUM(messages.cost))
            // and the analytics readers depend on it. (B1 fix: messages.cost was never
            // written, so the cap could never trip and analytics totalCost was always 0.)
            const cacheReadTokens = data.cacheReadTokens || 0;
            const cacheCreationTokens = data.cacheCreationTokens || 0;
            // Known pricing → real cache-adjusted cost. Ollama (free, no modelConfig)
            // → 0. Other unknown providers (azure/compat) → NULL so they never feed
            // the enforced cap or analytics with phantom Opus dollars (Finding #1).
            // A compat run carries its own cost (the endpoint's usage.cost or
            // the admin's prices), so it reaches the monthly cap and analytics
            // instead of the NULL every compat run used to record.
            const estimatedCostUsd: number | null = data.compatCost
              ? data.compatCost.usd
              : computeRunCostUsd({
                  hasKnownPricing,
                  isOllama: isOllamaModel,
                  costPer1MInput: costIn,
                  costPer1MOutput: costOut,
                  inputTokens: data.inputTokens || 0,
                  outputTokens: data.outputTokens || 0,
                  cacheReadTokens,
                  cacheCreationTokens,
                });
            // Item 1.6: the assistant message id is captured so the run artifact
            // (composed prompt + pinned source manifest) can FK to this exact row.
            // (assistantMessageId is minted before dispatch — see the context frame.)
            let messagePersisted = false;
            try {
              await db.run(`INSERT INTO messages (id, session_id, role, content, thinking_content, content_blocks, token_count, cost, model_id, config_snapshot, created_at)
                 VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?)`
              ,
                assistantMessageId,
                sessionId,
                data.text,
                data.thinking || null,
                // Persist full content blocks (with thinking signatures) for multi-turn replay
                data.rawContentBlocks ? JSON.stringify(data.rawContentBlocks) : null,
                data.outputTokens,
                estimatedCostUsd,
                selectedModel,
                JSON.stringify(configSnapshot),
                new Date().toISOString()
              );
              messagePersisted = true;
            } catch {
              // Non-fatal — message was already streamed to user
            }
            // Wave 6: Compliance-as-Code on completion. The seven Work rules
            // (provenance section, placeholders, citations in regulated areas,
            // length floor, model allow-list, unmarked figures, secrets) run in
            // the background against this answer; violations point at the
            // message id. Setting compliance_on_completion (default on).
            // Never throws; only ids and derived facts are stored.
            if (messagePersisted && data.text) {
              void runComplianceOnCompletion(db, {
                sessionId: String(sessionId),
                messageId: assistantMessageId,
                moduleId: moduleId ?? null,
                areaId: areaId ?? null,
                model: selectedModel,
                text: data.text,
                provenanceContract: configSnapshot.provenanceContract === true,
                outputFormats: Array.isArray(outputFormats) ? outputFormats : [],
              });
            }
            // Item 1.6: persist the run artifact — the final composed system
            // prompt exactly as passed to the LLM (closure values reflect any
            // post-composition mutation, e.g. web-search strip / Bing append on
            // non-Anthropic providers) + per-layer summary + pinned sources.
            // Fire-and-forget: writeRunArtifact never throws; failures are logged.
            if (messagePersisted) {
              const fullComposedPrompt = staticSystemPrompt
                ? `${staticSystemPrompt}\n\n${composedPrompt}`
                : composedPrompt;
              // Wave 0: when the engine hands back the exact string it sent
              // (the SDK client rewords the web-search instruction after this
              // route composed the prompt), pin that — not the pre-rewording text.
              const sentPrompt = data.systemPromptSent ?? fullComposedPrompt;
              // Wave 1: every layer the composer assembled, each with its own
              // hash — foundation, profile, style, area, module, guardrail,
              // personas, skills, output format, contract, transparency, docs —
              // preceded by the whole string the engine received.
              const layerSummary = buildLayerSummary({
                composed_full: sentPrompt,
                ...(staticSystemPrompt ? { composed_static_cached: staticSystemPrompt, composed_dynamic: composedPrompt } : {}),
                ...Object.fromEntries(composed.parts.map((p) => [p.key, p.text])),
                // Wave 3.4: the A/B arm rides in the layer summary (entry name
                // carries the arm — entries store name/chars/sha only).
                ...(atomArm ? { [`atom_ab_arm_${atomArm}`]: atomArm } : {}),
              });
              const resolverSources = resolved.sourceDetails && resolved.sourceDetails.length > 0
                ? resolved.sourceDetails
                : resolved.sourceManifest.map((name) => ({ type: 'summary', name, contentHashed: false }));
              // Wave 2: pack entries and framework articles are sources too —
              // each pinned by hash so a reader can tell exactly which
              // regulatory text the answer was grounded in.
              const groundingSources = [
                ...packLayer.entries.map((e) => ({
                  type: 'knowledge_pack_entity',
                  name: `${e.packName} · ${e.refId}`,
                  sha256: sha256Hex(e.text),
                  charCount: e.text.length,
                  retrievedAt: groundingRetrievedAt,
                  contentHashed: true,
                  note: `tier ${e.tier}${typeof e.similarity === 'number' ? ` · score ${e.similarity.toFixed(3)}` : ''}`,
                })),
                ...(frameworkGrounding?.sources ?? [])
                  .filter((s) => s.articleId)
                  .map((s) => ({
                    type: 'framework_article',
                    name: `${s.frameworkName} ${s.articleId}${s.title ? ` — ${s.title}` : ''}`,
                    sha256: s.sha256,
                    charCount: s.chars,
                    retrievedAt: groundingRetrievedAt,
                    contentHashed: Boolean(s.sha256),
                  })),
              ];
              // Wave 2: pages the model searched for or fetched itself on the
              // subscription engine — recorded from the tool events, so a
              // web-grounded answer is no longer "not hashable at resolve time".
              const webSources = (data.webSources ?? []).map((w) => ({
                type: w.kind,
                name: w.kind === 'web_fetch'
                  ? `${w.title ? `${w.title} — ` : ''}${w.url ?? 'fetched page'}`
                  : `search: ${w.query ?? ''}${w.resultUrls && w.resultUrls.length ? ` (${w.resultUrls.length} results)` : ''}`,
                ...(w.url ? { url: w.url } : {}),
                ...(w.sha256 ? { sha256: w.sha256 } : {}),
                ...(typeof w.charCount === 'number' ? { charCount: w.charCount } : {}),
                retrievedAt: w.retrievedAt,
                contentHashed: Boolean(w.sha256),
                ...(w.isError ? { note: 'tool reported an error' } : {}),
              }));
              // Wave 4: the memory atoms that went in are sources too — pinned
              // by id and hash, labelled as memory rather than evidence.
              const atomSources = (atomLayer?.atoms ?? []).map((a) => ({
                type: 'knowledge_atom',
                name: `${a.id}${a.sourceModuleId ? ` · ${a.sourceModuleId}` : ''}`,
                sha256: sha256Hex(a.content),
                charCount: a.content.length,
                retrievedAt: groundingRetrievedAt,
                contentHashed: true,
                note: `memory, not a verified source · ${a.method} · score ${a.score.toFixed(3)}`,
              }));
              const sourceManifest = [...resolverSources, ...groundingSources, ...webSources, ...atomSources];
              void writeRunArtifact(db, {
                messageId: assistantMessageId,
                sessionId,
                composedPrompt: sentPrompt,
                layerSummary,
                sourceManifest,
                ...messageRunRecordFields({
                  modelRequested: String(selectedModel),
                  modelServed: data.modelServed ?? null,
                  inputTokens: data.inputTokens,
                  outputTokens: data.outputTokens,
                  cacheReadTokens: data.cacheReadTokens,
                  cacheCreationTokens: data.cacheCreationTokens,
                  costUsd: estimatedCostUsd,
                  text: data.text,
                  thinking: data.thinking,
                  status: 'completed',
                }),
              });
              // Wave 3.2: embed this output as 'session_output' so "what did we
              // conclude about X in March?" becomes answerable (Search past work
              // on My Work + hybridSearch). Fire-and-forget; gated by the SAME
              // atomCollectionEnabled toggle that gates atom extraction below.
              // Reruns are skipped through that same gate — rerun.ts pins
              // atomCollectionEnabled=false on its dispatched body, and embedding
              // a rerun would store a near-duplicate of the original conclusion
              // under a fresh id, crowding retrieval top-K with copies.
              if (atomCollectionEnabled !== false && data.text && data.text.length >= 200) {
                void embedSessionOutput(db, {
                  messageId: assistantMessageId,
                  sessionId: String(sessionId),
                  content: data.text,
                  moduleId: moduleId ?? null,
                  areaId: areaId ?? null,
                });
              }
            }
            // GOV-02 (Wave 1): the exact, content-addressed version row of the
            // module prompt this run composed — never a "latest row" lookup.
            const systemPromptVersionId: string | undefined = modulePromptVersion?.id;
            // RATE-04: use async audit queue instead of synchronous write
            enqueueAudit({
              sessionId,
              moduleId,
              areaId,
              model: selectedModel,
              // Wave 0: the resolved engine, not the queue's 'anthropic' default —
              // every row used to say anthropic, Mistral and Azure included.
              provider,
              // Wave 0: the resolver's manifest (built-in / uploads / URLs / folders /
              // RAG) — the column was only ever filled by orchestrator heartbeats.
              // Wave 2: plus the packs and frameworks that grounded the run.
              knowledgeSourcesUsed: [
                ...resolved.sourceManifest,
                ...packLayer.packs.map((p) => `pack: ${p.displayName}${p.version ? ` v${p.version}` : ''}`),
                ...(frameworkGrounding ? [...new Set(frameworkGrounding.sources.filter((s) => s.articleId).map((s) => `framework: ${s.frameworkId}`))] : []),
              ],
              thinkingLevel: thinking,
              creativity,
              writingTone: writingTone || 'professional',
              emojiEnabled: !!emojiEnabled,
              structuredReasoning: !!metaCognitiveEnabled,
              transparencyLevel: transparencyLevel || 0,
              inputTokenCount: data.inputTokens || 0,
              outputTokenCount: data.outputTokens || 0,
              cachedTokens: cacheReadTokens,
              cacheCreationTokens,
              // NULL cost (unknown-pricing provider) → undefined in the audit (honest).
              estimatedCostUsd: estimatedCostUsd ?? undefined,
              seed: seed !== undefined ? seed : undefined,
              userId: req.user?.id,
              ragChunks: ragChunks.length > 0 ? JSON.stringify(ragChunks.map(c => ({ citation: c.citation, relevance: c.relevanceScore }))) : undefined,
              systemPromptVersionId,
              atomArm: atomArm ?? undefined,
            });
            // (The per-user monthly usage is charged by runComplete, below —
            // for runs with no session too.)
            // Quality auto-scoring (non-fatal) — always run; fall back to 'open-chat' module.
            // The promise is kept (instead of pure fire-and-forget) so the apprentice
            // progression block below can fold the overall score into quality_avg
            // (B2 fix: nothing ever wrote quality_avg, so promotion past 'guided'
            // was arithmetically impossible). Resolves to null when scoring is
            // skipped (short output) or failed — null means "do not fold".
            // Public demo: after-answer calls are limited (DEMO_POST_ANSWER_CALLS).
            const postAnswer = demoPostAnswerCalls();
            const qualityScorePromise: Promise<number | null> =
              postAnswer === 'all' && data.text && data.text.length > 200
                ? ratchet.scoreOutput({ content: data.text, moduleId: moduleId || 'open-chat', areaId, sessionId, anthropicClient: anthropic })
                    .then((r) => (typeof r?.score?.overall === 'number' && Number.isFinite(r.score.overall) ? r.score.overall : null))
                    .catch(() => null)
                : Promise.resolve(null);
            // Output Transformation — structured extraction (fire-and-forget)
            // Uses a bounded-concurrency queue so a burst of session completions
            // doesn't spawn N parallel Haiku calls. Deduplicates per-session.
            // Missing moduleId falls back to analytic_report (most permissive);
            // threshold lowered to 100 chars to cover short policy outputs.
            if (postAnswer === 'all' && sessionId && data.text && data.text.length > 100) {
              void enqueueExtraction({
                sessionId,
                markdown: data.text,
                moduleId: moduleId ?? null,
                areaId,
                userId: req.user?.id ?? null,
                generationModel: selectedModel,
              });
            }
            // Persist the settings that produced this output so history shows accurate config
            try {
              await db.run('UPDATE sessions SET config = ?, updated_at = ? WHERE id = ?', JSON.stringify(configSnapshot), new Date().toISOString(), sessionId);
            } catch { /* non-fatal */ }
            // Auto-save version snapshot
            if (sessionId && data.text && data.text.length > 100) {
              try {
                const last = await db.get('SELECT MAX(version_number) as max_v FROM versions WHERE entity_type=? AND entity_id=?', 'session', sessionId) as { max_v: number | null };
                await db.run('INSERT INTO versions (entity_type, entity_id, version_number, label, content) VALUES (?,?,?,?,?)', 'session', sessionId, (last?.max_v ?? 0) + 1, `Auto v${(last?.max_v ?? 0) + 1}`, data.text);
              } catch { /* non-fatal */ }
            }
            // Apprentice progression.
            // Finding #6: a rerun is not new practice — rerun.ts re-executes an
            // existing run with a different model in the same session. Counting it
            // would inflate sessions_completed and could trigger an unearned
            // promotion. Skip the whole block for reruns (the quality fold below
            // is part of it, so a rerun also never folds a second model's score).
            if (moduleId && !rerunOf) {
              try {
                const uid = req.user?.id || 'default';
                type ApprenticeRow = { id: string; stage: string; sessions_completed: number; quality_avg: number | null; quality_n: number | null };
                // Finding #6: atomic upsert + increment. The previous JS
                // read-modify-write (newCount = sessions_completed + 1) lost updates
                // under concurrency, and two simultaneous first-runs both hit
                // INSERT ... ON CONFLICT DO NOTHING, dropping a session. A single
                // upsert that increments in SQL and RETURNs the post-increment row
                // is race-free; promotion checks then read the authoritative count.
                const row = await db.get(
                  `INSERT INTO apprentice_profiles (user_id, module_id, area_id, sessions_completed, last_session)
                   VALUES (?, ?, ?, 1, ?)
                   ON CONFLICT (user_id, module_id) DO UPDATE SET
                     sessions_completed = apprentice_profiles.sessions_completed + 1,
                     last_session = excluded.last_session
                   RETURNING id, stage, sessions_completed, quality_avg, quality_n`,
                  uid, moduleId, areaId || null, new Date().toISOString(),
                ) as ApprenticeRow | undefined;
                if (row) {
                  const newCount = row.sessions_completed;
                  const s = row.stage;
                  if (s === 'observer' && newCount >= 3)
                    await db.run("UPDATE apprentice_profiles SET stage='guided',promoted_to_guided=? WHERE id=?", new Date().toISOString(), row.id);
                  else if (s === 'guided' && newCount >= 8 && (row.quality_avg ?? 0) >= 7.0)
                    await db.run("UPDATE apprentice_profiles SET stage='supervised',promoted_to_supervised=? WHERE id=?", new Date().toISOString(), row.id);
                  else if (s === 'supervised' && newCount >= 20 && (row.quality_avg ?? 0) >= 8.0)
                    await db.run("UPDATE apprentice_profiles SET stage='autonomous',promoted_to_autonomous=? WHERE id=?", new Date().toISOString(), row.id);
                }
                // B2: when the quality score for this run resolves, fold it into the
                // running average. quality_n counts only the runs that actually got
                // a score, so a skipped/failed scoring never poisons the average
                // (overall === null → no fold, no quality_n increment). The fold is
                // a single atomic UPDATE, so concurrent sessions cannot lose updates.
                void qualityScorePromise.then(async (overall) => {
                  if (overall === null) return;
                  await db.run(
                    `UPDATE apprentice_profiles
                     SET quality_avg = (COALESCE(quality_avg, 0) * COALESCE(quality_n, 0) + ?) / (COALESCE(quality_n, 0) + 1),
                         quality_n = COALESCE(quality_n, 0) + 1
                     WHERE user_id = ? AND module_id = ?`,
                    overall, uid, moduleId);
                  // Re-check quality-gated promotions with the updated average — the
                  // inline check above ran before this run's score landed.
                  const fresh = await db.get('SELECT * FROM apprentice_profiles WHERE user_id=? AND module_id=?', uid, moduleId) as ApprenticeRow | undefined;
                  if (!fresh) return;
                  if (fresh.stage === 'guided' && fresh.sessions_completed >= 8 && (fresh.quality_avg ?? 0) >= 7.0)
                    await db.run("UPDATE apprentice_profiles SET stage='supervised',promoted_to_supervised=? WHERE id=?", new Date().toISOString(), fresh.id);
                  else if (fresh.stage === 'supervised' && fresh.sessions_completed >= 20 && (fresh.quality_avg ?? 0) >= 8.0)
                    await db.run("UPDATE apprentice_profiles SET stage='autonomous',promoted_to_autonomous=? WHERE id=?", new Date().toISOString(), fresh.id);
                }).catch(() => { /* non-fatal */ });
              } catch { /* non-fatal */ }
            }
            // Wave 4: the session's running conclusion — what was concluded,
            // decided, left open and planned — written by the utility model after
            // every answer into session_snapshots + sessions.summary. The project
            // layer and the resume block read it. Same privacy gate as atoms.
            // Fire-and-forget: it never rejects, and it runs after the engine
            // slot is released (the SDK client releases before onComplete).
            if (postAnswer !== 'none' && atomCollectionEnabled !== false && data.text && data.text.length >= 200) {
              void writeSessionConclusion(db, {
                sessionId: String(sessionId),
                messageId: assistantMessageId,
                userId: req.user?.id || 'default',
                moduleId: moduleId ?? null,
                areaId: areaId ?? null,
                assistantText: data.text,
              });
            }
            // Auto-extract knowledge atoms from this session output (non-blocking fire-and-forget)
            // This populates Knowledge Graph, Intelligence Dashboard, and Pattern Detection
            // Skipped when user disables atom collection (playground / clean-slate mode)
            // Wave 4: module runs only. Open chat produced 32 atoms in six months,
            // every one of them boilerplate that later came back as "evidence".
            if (atomCollectionEnabled !== false && moduleId && data.text && data.text.length > 200) {
              try {
                const workflowId = `module:${moduleId}`;
                const store = await getSessionOutputStore();
                const outputId = await store.storeOutput({
                  executionId: sessionId,
                  workflowId,
                  stepIndex: 0,
                  stepType: 'module_session',
                  areaId: areaId || undefined,
                  moduleId: moduleId || undefined,
                  outputData: { text: data.text },
                  workflowName: moduleId ? `Module: ${moduleId}` : 'General Session',
                  stepName: 'Claude Response',
                  userId: req.user?.id || 'default',
                });
                // 2026-07-17: do NOT extract atoms here. storeOutput already runs
                // the summary→extraction pipeline (output-store.ts
                // queueSummaryGeneration → triggerAtomExtraction), so a second
                // extractAtoms(outputId) call here double-spent the utility LLM on
                // every persisted run AND produced duplicate atoms (extractAtoms
                // is not idempotent per outputId). The single path is output-store.
                void outputId;
              } catch { /* non-fatal */ }
            }
          }
        : undefined;

      // What every engine calls when an answer finished: the monthly usage is
      // charged whether or not the run has a session, then the session's own
      // bookkeeping (onComplete) runs when there is one.
      type RunCompletion = Parameters<NonNullable<typeof onComplete>>[0];
      const runComplete = async (data: RunCompletion): Promise<void> => {
        await chargeMonthlyUsage(data.inputTokens, data.outputTokens);
        if (onComplete) await onComplete(data);
      };

      // A refusal before the model is called. Early progress frames (uploads,
      // local folders) may already have sent the SSE headers; then it is said
      // on the stream, where a JSON reply could no longer go.
      const refuseRun = (status: number, body: { error: string; code: string } & Record<string, unknown>): void => {
        if (!res.headersSent) {
          res.status(status).json(body);
          return;
        }
        res.write(`data: ${JSON.stringify({ type: 'error', message: body.error, code: body.code })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      };

      // ── MULTI-AGENT MODE ──────────────────────────────────────
      // If multi-agent is enabled and provider is Anthropic, run the multi-agent
      // orchestrator instead of standard streaming
      if (multiAgentEnabled && provider === 'anthropic') {
        if (!isApiKeyConfigured()) {
          res.status(500).json({ error: 'Anthropic API key required for multi-agent mode' });
          return;
        }

        console.log(`[MULTI-AGENT] Running ${multiAgentTeam} team in ${multiAgentStyle} mode`);

        try {
          // Get anthropic client
          const anthropic = new (await import('@anthropic-ai/sdk')).default({
            apiKey: process.env.ANTHROPIC_API_KEY!,
          });

          // Combine static and dynamic prompts for multi-agent context
          const fullContext = staticSystemPrompt
            ? `${staticSystemPrompt}\n\n---\n\n${composedPrompt}`
            : composedPrompt;

          // Run multi-agent orchestration
          const result = await runMultiAgent({
            userMessage,
            context: fullContext,
            team: multiAgentTeam as 'compliance' | 'strategic' | 'quality',
            collaborationStyle: multiAgentStyle as 'parallel' | 'debate' | 'consensus',
            anthropic,
          });

          // Return synthesis as non-streaming response
          // (Multi-agent already completed — synthesis is ready)
          res.setHeader('Content-Type', 'application/json');
          res.json({
            content: result.synthesis,
            agentResults: result.agentResults,
            totalExecutionTimeMs: result.totalExecutionTimeMs,
          });

          // Save to database if session exists (the monthly usage is charged either way)
          {
            // Estimate tokens (rough: ~4 chars per token)
            const estimatedOutputTokens = Math.ceil(result.synthesis.length / 4);
            const estimatedInputTokens = Math.ceil(fullContext.length / 4);

            void runComplete({
              text: result.synthesis,
              thinking: '', // Multi-agent doesn't expose thinking
              inputTokens: estimatedInputTokens,
              outputTokens: estimatedOutputTokens,
            });
          }

          return;
        } catch (error) {
          console.error('[MULTI-AGENT] Error:', error);
          res.status(500).json({
            error: safeError(error),
          });
          return;
        }
      }

      // TOKEN-02: pre-flight token validation — reject before calling the API.
      // Model-aware limit (plan 2.15): the same capability-derived budget used
      // for knowledge assembly, so a 32k local model fails fast with a clear
      // message instead of silently truncating a ~900k prompt.
      if (resolved.tokenEstimate > knowledgeBudget) {
        refuseRun(400, {
          error: `Context too large for ${selectedModel}: estimated ~${Math.round(resolved.tokenEstimate / 1000)}k tokens exceeds its ~${Math.round(knowledgeBudget / 1000)}k context budget. ` +
                 `Trim knowledge sources, use Summary mode for online references, or pick a larger-context model.`,
          code: 'CONTEXT_TOO_LARGE',
          tokenEstimate: resolved.tokenEstimate,
          limit: knowledgeBudget,
        });
        return;
      }

      // A compat run: the WHOLE input is held to the window, not only the
      // knowledge documents. The client sends the history, the message and a
      // system-prompt override itself (up to 200 × 500k characters of
      // history), and all of it went to the model — a model that reports a
      // 1.31M window was billed far past the 128k this server caps a compat
      // run at (review C3). The oldest turns are dropped while the input
      // leaves less than the answer's max_tokens of the window; a request
      // still larger than the window itself is refused before anything is
      // sent. (Between the two it goes as it is: the server's own prompt
      // layers can exceed the budget's small allowance for them, and a model
      // with a larger real window answers it.) The system prompt — built
      // here, every client part of it schema-bounded — is counted with the
      // tokenizer the knowledge budget uses; the messages, which the client
      // sends at any size, with the adapter's estimate: linear, never a
      // tokenizer pass over megabytes, and generous on token-dense text.
      let historyTurnsDropped = 0;
      if (provider === 'openai_compatible' && compatModel) {
        const window = await resolveCompatInputWindow(selectedModel, db as DatabaseAdapter);
        const roomForAnswer = window - (compatSentMax ?? COMPAT_WORK_RUN_MAX_TOKENS);
        const systemText = staticSystemPrompt ? `${staticSystemPrompt}\n\n${composedPrompt}` : composedPrompt;
        let inputTokens = estimateTokens(systemText) + estimateCompatInputTokens('', messages as CompatInputMessage[]);
        const dropOldest = (): void => {
          const dropped = messages.shift();
          if (dropped) inputTokens -= estimateCompatInputTokens('', [dropped as CompatInputMessage]);
          historyTurnsDropped++;
        };
        // Never the new user message (the last one) …
        while (inputTokens > roomForAnswer && messages.length > 1) dropOldest();
        // … and the conversation then starts with a user turn, as providers expect.
        while (historyTurnsDropped > 0 && messages.length > 1 && messages[0].role !== 'user') dropOldest();
        if (inputTokens > window) {
          refuseRun(400, {
            error: `This request is too long for ${selectedModel}: about ${Math.round(inputTokens / 1000)}k tokens, more than the ${Math.round(window / 1000)}k this server lets the model take. Shorten the message or the instructions, or remove documents.`,
            code: 'CONTEXT_TOO_LARGE',
            tokenEstimate: inputTokens,
            limit: window,
          });
          return;
        }
      }

      // STREAM-05: per-user concurrent stream limit (max 3)
      const streamUserId = req.user?.id || req.ip || 'anonymous';
      if (!acquireStream(streamUserId)) {
        res.status(429).json({
          error: 'Too many concurrent streams. You have reached the maximum of 3 active streams. Please wait for an existing stream to complete.',
          code: 'STREAM_LIMIT_EXCEEDED',
        });
        return;
      }
      // Release the slot when the response closes (success or error)
      res.on('close', () => releaseStream(streamUserId));
      res.on('finish', () => releaseStream(streamUserId));

      // RATE-02: circuit breaker — fast-fail if Claude API is known to be unhealthy
      if (isCircuitOpen()) {
        res.status(503).json({
          error: 'Claude API is temporarily unavailable due to repeated errors. Please try again in a minute.',
          code: 'CIRCUIT_OPEN',
        });
        return;
      }

      // The "context used" frame goes out before the model call so the page can
      // show what the prompt holds while the answer streams. Headers may not
      // be set yet; every engine branch below sets them only when absent.
      if (!res.headersSent) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
      }
      sendProgress({ type: 'context_used', context: contextUsed });

      // Route to the correct provider adapter
      if (provider === 'anthropic_sdk' || provider === 'openai_codex') {
        // Subscription execution engines — the Claude Agent SDK or Codex SDK
        // subprocess, authenticated by this machine's Claude Code / ChatGPT
        // login (no API key). The Claude engine grants its own WebSearch /
        // WebFetch tools when the run's knowledge mode asked for web search
        // (and rewords the instruction to name them); Codex has no web tools,
        // so its prompt is stripped exactly as the non-Anthropic branch does.
        const sdkWebRun = provider === 'anthropic_sdk' && sdkWebToolsRequested(tools);
        const sdkPrompt = provider === 'openai_codex' ? stripWebSearchInstructions(composedPrompt) : composedPrompt;

        const sdkAbort = new AbortController();
        req.on('close', () => sdkAbort.abort());
        // Runtime spawn adds seconds before first token — same shape as the
        // API path's per-thinking-level ceilings, one notch more generous.
        // These govern TIME TO FIRST TOKEN, which is what they were tuned for.
        const sdkTimeouts: Record<string, number> = {
          quick: 180_000,
          think: 300_000,
          think_hard: 420_000,
          investigate: 600_000,
          plan_first: 600_000,
          deep_investigate: 600_000,
        };
        const stopSdkTimers = armIdleAbort(res, () => sdkAbort.abort(), {
          firstTokenMs: sdkTimeouts[thinking as string] || 420_000,
          // A web run is silent while a page is fetched; give it more idle room.
          ...(sdkWebRun ? { idleMs: 420_000 } : {}),
        });

        const engineStream = provider === 'anthropic_sdk' ? sdkStreamToResponse : codexStreamToResponse;
        try {
          await engineStream(
            {
              model: selectedModel,
              thinking: (thinking || 'think_hard') as 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate',
              system: sdkPrompt,
              staticSystemPrompt,
              messages,
              signal: sdkAbort.signal,
              sourceManifest: resolved.sourceManifest,
              tools: sdkWebRun ? tools : undefined,
            },
            res,
            runComplete,
          );
        } finally {
          stopSdkTimers();
        }
      } else if (provider === 'anthropic') {
        // Use existing Anthropic streaming.
        // staticSystemPrompt is populated only for caching-capable models (Opus/Sonnet);
        // for Haiku it is undefined and claude-client will send a plain single block.
        // 1M context: Opus 4.8 / Sonnet 4.6 = GA (no beta header needed at all).
      // Sonnet 4.5 needs beta header only when context > 200k.
      // The useLongContext flag tells claude-client to add the beta header for Sonnet 4.5.
      const needsBetaForLongContext = !is1MModel && process.env.ANTHROPIC_LONG_CONTEXT_BETA === 'true';
      const useLongContext = needsBetaForLongContext && resolved.tokenEstimate > 200_000;

      // Abort the Anthropic stream if the client disconnects to free API quota and server memory
      const abortController = new AbortController();
      req.on('close', () => abortController.abort());

      // RATE-03: total request timeout — scales with thinking level.
      // Extended thinking can take 2-5+ min before first token (especially with large context).
      const thinkingTimeouts: Record<string, number> = {
        quick: 90_000,
        think: 180_000,
        think_hard: 300_000,
        investigate: 420_000,
        plan_first: 420_000,
        deep_investigate: 600_000,
      };
      const baseTimeout = Number(process.env.CLAUDE_REQUEST_TIMEOUT_MS) || thinkingTimeouts[thinking as string] || 300_000;
      const timeoutMs = Math.max(baseTimeout, thinkingTimeouts[thinking as string] || 300_000);
      // Same idle semantics as the SDK path: this ceiling is a time-to-first-token
      // budget, not a cap on how long a healthy answer may take to write.
      const stopApiTimers = armIdleAbort(res, () => abortController.abort(), { firstTokenMs: timeoutMs });

      try {
      // IRE branch: route to iterative reasoning engine when explicitly enabled
      // or when thinking level is 'deep_investigate'
      const ireThinkingLevel = thinking as string;
      // Wave 5: the phases run through the router, so the subscription engine
      // (anthropic_sdk) is a supported provider — before this the two deepest
      // levels were one call at max effort on the default engine (0 chains).
      const useIRE = (iterativeReasoningEnabled === true || ireThinkingLevel === 'deep_investigate')
        && ireSupportedProvider(provider)
        && ['think_hard', 'investigate', 'plan_first', 'deep_investigate'].includes(ireThinkingLevel);

      if (useIRE) {
        const ireSummary = await runIterativeReasoning(
          {
            thinkingLevel: ireThinkingLevel as 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate',
            model: selectedModel,
            staticSystemPrompt: staticSystemPrompt || composedPrompt,
            dynamicSystemPrompt: staticSystemPrompt ? composedPrompt : '',
            messages,
            tools: tools.length > 0 ? tools : undefined,
            sessionId: sessionId as string | undefined,
            sourceManifest: resolved.sourceManifest,
          },
          res,
          db,
        );
        recordSuccess();

        // Save IRE output to session (was previously skipped — IRE work didn't appear in My Work).
        // onComplete itself quality-scores the synthesis (qualityScorePromise, since W0A),
        // so the previously-separate scoreOutput call here was a DUPLICATE — it produced
        // a second quality_scores row, a double updateBaselineWithWeight, and double utility
        // spend on the SAME synthesis text. Finding #5: scored exactly once via onComplete.
        if (ireSummary.synthesisText) {
          await runComplete({
            text: ireSummary.synthesisText,
            thinking: '',
            inputTokens: ireSummary.totalInputTokens || 0,
            outputTokens: ireSummary.totalOutputTokens || 0,
          });
        } else {
          await chargeMonthlyUsage(ireSummary.totalInputTokens || 0, ireSummary.totalOutputTokens || 0);
        }
        return;
      }

      // Build compaction config for supported models (Opus 4.8 / Sonnet 4.6)
      // Respect the user's preference from Settings — compactionEnabled defaults to true
      const compactionConfig = compactionEnabled !== false
        ? buildCompactionConfig(selectedModel, 'interactive')
        : null;
      const compactionParam = compactionConfig?.enabled
        ? { enabled: true, triggerThreshold: compactionConfig.triggerThreshold, pauseAfterCompaction: compactionConfig.pauseAfterCompaction }
        : undefined;

      await streamToResponse(
          {
            model: selectedModel as 'claude-opus-5-5' | 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001',
            thinking: thinking || 'think_hard',
            system: composedPrompt,
            staticSystemPrompt,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            nativeReasoningEnabled: !!nativeReasoningEnabled,
            useLongContext,
            signal: abortController.signal,
            sourceManifest: resolved.sourceManifest,  // ATTR-05
            compaction: compactionParam,
          },
          res,
          runComplete
        );
        recordSuccess();
      } catch (streamErr: unknown) {
        const status = (streamErr instanceof Error && 'status' in streamErr)
          ? (streamErr as { status?: number }).status
          : undefined;
        recordFailure(status);
        throw streamErr;
      } finally {
        stopApiTimers();
      }
      } else {
        // Non-Anthropic providers: set SSE headers, stream, then finalize
        const precisionLevel: PrecisionLevel = precision || 'balanced';
        const temperature = getTemperature(selectedModel, precisionLevel);
        // A compat endpoint's own ceiling when the admin set one; else room for
        // a long deliverable (reasoning comes on top, clamped by the adapter).
        const maxTokens = provider === 'openai_compatible'
          ? (compatModel?.endpoint.maxOutputTokens ?? COMPAT_WORK_RUN_MAX_TOKENS)
          : (modelConfig?.maxOutputTokens || 8192);

        // Strip Claude-specific web search instructions from system prompt —
        // non-Anthropic models don't have the web_search tool and will hallucinate tool calls
        const webSearchWasRequested = tools.some(t => t.type === 'web_search_20250305');
        composedPrompt = composedPrompt
          .replace(/## WEB SEARCH ENABLED\n[^\n]*Use the web_search tool[^\n]*/g, '')
          .replace(/\n{3,}/g, '\n\n');

        // For ALL non-Anthropic providers: if web search was requested and Bing is
        // configured, pre-search and inject results (Claude uses its native
        // web_search tool on its own branch; everyone else gets Bing grounding).
        let webResultsInjected = false;
        if (webSearchWasRequested) {
          try {
            const { getBingSearchApiKey, searchAndFormat, extractSearchQuery } = await import('../services/bing-search.js');
            const bingKey = await getBingSearchApiKey(db);
            if (bingKey) {
              // Get last user message as search query — its text only, never an image's base64.
              const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
              const queryText = lastUserMsg ? contentText(lastUserMsg.content) : '';
              if (queryText) {
                const searchQuery = extractSearchQuery(queryText);
                const searchResults = await searchAndFormat(searchQuery, bingKey);
                composedPrompt += `\n\n${searchResults}`;
                webResultsInjected = true;
              }
            }
          } catch (bingErr) {
            console.warn('[ANTON] Bing search failed, continuing without web results:', bingErr instanceof Error ? bingErr.message : bingErr);
          }
        }

        // Abort controller for non-Anthropic providers (timeout + client disconnect).
        // The ceilings govern time to first output, as on the Claude branches:
        // a reasoning model writing a long answer is not cut off while it is
        // still streaming. A closed page aborts the call — compat endpoints get
        // the signal, so the generation stops being billed.
        const adapterAbort = new AbortController();
        req.on('close', () => adapterAbort.abort());
        res.on('close', () => { if (!res.writableEnded) adapterAbort.abort(); });
        const adapterTimeoutMs = adapterTimerOverride?.firstTokenMs ?? (ADAPTER_FIRST_TOKEN_MS[thinking as string] || 300_000);

        // Only when absent: the "context used" frame above has already sent them.
        // Writing them again threw ERR_HTTP_HEADERS_SENT, which the outer catch
        // could not answer (headers gone), so every non-Claude run — Ollama,
        // OpenAI, Mistral, Gemini, Azure, compat: — hung after that frame.
        if (!res.headersSent) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          });
        }

        const sendEvent = (event: object) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        };

        // Say what this engine did not do as asked, and record it with the run.
        // The page otherwise shows a web-search tick, a revelation-chain level
        // or multi-agent as if each had happened.
        const notice = (code: string, message: string, recordOnly = false) => {
          contextUsed.notices.push({ code, message });
          if (!recordOnly) sendEvent({ type: 'notice', code, message });
        };
        if (webSearchWasRequested && !webResultsInjected) {
          contextUsed.webSearch = false;
          notice('web_search_unavailable', `Web search is not available on ${selectedModel}, so nothing was searched. The answer uses the model's own knowledge and the sources you provided.`);
          sendEvent({ type: 'context_used', context: contextUsed });
        }
        const ireLevel = String(thinking || '');
        if ((iterativeReasoningEnabled === true || ireLevel === 'deep_investigate')
          && ['think_hard', 'investigate', 'plan_first', 'deep_investigate'].includes(ireLevel)) {
          notice('single_call', `Revelation chains run on Claude only. On ${selectedModel} this level ran as a single call${resolvedEffort ? ` at reasoning effort "${resolvedEffort}"` : ''}.`);
        }
        if (multiAgentEnabled) {
          notice('multi_agent_unavailable', `Multi-agent review runs on Claude only. On ${selectedModel} this answer is a single model call.`);
        }
        if (historyTurnsDropped > 0) {
          notice('history_trimmed', `The ${historyTurnsDropped} oldest message${historyTurnsDropped === 1 ? ' was' : 's were'} left out so the conversation fits ${selectedModel}'s context window.`);
        }

        sendEvent({ type: 'stream_start', messageId: crypto.randomUUID() });

        // Armed only now: armIdleAbort counts every write as a sign of life,
        // so arming it before the frames above swapped this level's
        // time-to-first-token ceiling for the shorter idle window at once — a
        // reasoning phase that streams nothing was cut off (review C9).
        const stopAdapterTimers = armIdleAbort(res, () => adapterAbort.abort(), {
          firstTokenMs: adapterTimeoutMs,
          ...(adapterTimerOverride?.idleMs !== undefined ? { idleMs: adapterTimerOverride.idleMs } : {}),
        });

        try {
          // Non-Anthropic adapters expect plain string content: the text of
          // each message (an image never reaches these — refused up front).
          const plainMessages = messages.map((m) => ({
            role: m.role,
            content: contentText(m.content),
          }));

          let result: { inputTokens: number; outputTokens: number; text: string; thinking?: string };
          let compatResult: OpenAICompatibleStreamResult | null = null;

          if (provider === 'openai') {
            result = await streamOpenAI({
              model: selectedModel,
              system: composedPrompt,
              messages: plainMessages,
              temperature,
              maxTokens,
              nativeReasoningEnabled: !!nativeReasoningEnabled,
              thinkingLevel: thinking as import('../../src/lib/types.js').ThinkingLevel | undefined,
              seed: seed !== undefined ? seed : undefined,
            }, res);
          } else if (provider === 'google') {
            result = await streamGemini({
              model: selectedModel,
              system: composedPrompt,
              messages: plainMessages,
              temperature,
              maxTokens,
              nativeReasoningEnabled: !!nativeReasoningEnabled,
            }, res);
          } else if (provider === 'mistral') {
            result = await streamMistral({
              model: selectedModel,
              system: composedPrompt,
              messages: plainMessages,
              temperature,
              maxTokens,
              nativeReasoningEnabled: !!nativeReasoningEnabled,
              thinkingLevel: thinking,
              seed: seed !== undefined ? seed : undefined,
              signal: adapterAbort.signal,
            }, res);
          } else if (provider === 'azure_openai') {
            // Resolve Azure config from DB
            const deploymentName = selectedModel.replace(/^azure:/, '');
            const azureDep = await db.get(
              'SELECT deployment_name, model_name, is_reasoning_model, config_id FROM azure_openai_deployments WHERE deployment_name = $1 AND is_active = TRUE',
              deploymentName
            ) as { deployment_name: string; model_name: string; is_reasoning_model: boolean; config_id: string } | undefined;
            if (!azureDep) throw new Error(`Azure deployment "${deploymentName}" not found or inactive`);
            const azureCfg = await db.get(
              'SELECT endpoint, api_key_encrypted, api_version FROM azure_openai_config WHERE id = $1 AND is_active = TRUE',
              azureDep.config_id || 'default'
            ) as { endpoint: string; api_key_encrypted: string; api_version: string } | undefined;
            if (!azureCfg) throw new Error('Azure OpenAI not configured');
            const azureConfig: AzureOpenAIConfig = {
              endpoint: azureCfg.endpoint,
              apiKey: decrypt(azureCfg.api_key_encrypted),
              apiVersion: azureCfg.api_version,
              deployment: azureDep.deployment_name,
              isReasoningModel: azureDep.is_reasoning_model,
            };
            result = await streamAzureOpenAI({
              model: azureDep.deployment_name,
              system: composedPrompt,
              messages: plainMessages,
              temperature,
              maxTokens,
              thinkingLevel: thinking as import('../../src/lib/types.js').ThinkingLevel | undefined,
              isReasoningModel: azureDep.is_reasoning_model,
              seed: seed !== undefined ? seed : undefined,
            }, azureConfig, res);
          } else if (provider === 'ollama') {
            // Strip the 'ollama:' prefix to get the bare Ollama model name
            const ollamaModel = selectedModel.replace(/^ollama:/, '');
            result = await streamOllama({
              model: ollamaModel,
              system: composedPrompt,
              messages: plainMessages,
              temperature,
              maxTokens,
              // Capability-aware num_ctx (plan 2.15) — trained window capped at 32k/env
              numCtx: await resolveOllamaNumCtx(selectedModel),
            }, res);
          } else if (provider === 'openai_compatible' && compatModel) {
            // compat:<slug>:<model> — the endpoint resolved (and its model
            // allow-list checked) before the run started. The messages keep
            // their content blocks: an image goes to the model as an image
            // part, when the endpoint says the model reads images.
            compatResult = await streamOpenAICompatible({
              baseUrl: compatModel.endpoint.baseUrl,
              apiKey: compatModel.endpoint.apiKey,
              extraHeaders: compatModel.endpoint.extraHeaders,
              extraBody: compatModel.endpoint.extraBody,
              modelMeta: compatModel.meta,
              maxOutputTokens: compatModel.endpoint.maxOutputTokens,
              pricing: compatModel.pricing,
              model: compatModel.model,
              system: composedPrompt,
              messages: messages as CompatInputMessage[],
              temperature,
              maxTokens,
              thinkingLevel: (thinking || 'think_hard') as import('../../src/lib/types.js').ThinkingLevel,
              userId: req.user?.id ?? null,
              signal: adapterAbort.signal,
              spend: { modelId: selectedModel, db, purpose: 'work-run', sessionId: sessionId ? String(sessionId) : null, role: req.user?.role ?? null },
            }, res);
            result = compatResult;
            if (compatResult.warning) notice('output_truncated', compatResult.warning);
          } else {
            throw new Error(`Unsupported provider: ${provider}`);
          }

          sendEvent({
            type: 'usage',
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            thinkingTokens: compatResult?.reasoningTokens ?? 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
          });
          sendEvent({
            type: 'stream_end',
            contentBlocks: [{ type: 'text', content: result.text }],
          });

          void runComplete({
            text: result.text,
            thinking: result.thinking || '',
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            ...(compatResult && compatResult.costUsd !== null && compatResult.costSource
              ? { compatCost: { usd: compatResult.costUsd, source: compatResult.costSource } }
              : {}),
          });
        } catch (adapterError) {
          // The full error (it can hold an endpoint URL or a provider's own text)
          // goes to the log; the person gets the message written for them, or
          // safeError's (generic in production).
          console.error('[claude] model adapter error:', adapterError instanceof Error ? adapterError.message : String(adapterError));
          // A compat call cut short — the page closed, Stop, a timeout, an
          // error part-way — was still billed. The adapter recorded it in the
          // spend ledger; it counts against the monthly token budget too.
          const unfinished = compatUnfinishedUsageOf(adapterError);
          if (unfinished) await chargeMonthlyUsage(unfinished.inputTokens, unfinished.outputTokens);
          sendEvent({ type: 'error', message: publicErrorMessage(adapterError) });
        } finally {
          stopAdapterTimers();
        }

        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: safeError(error) });
      }
    }
  });

  // POST /api/claude/preview-prompt — returns the fully composed system prompt + token estimate
  router.post('/claude/preview-prompt', async (req, res) => {
    try {
      const {
        model,
        thinking,
        creativity,
        moduleId,
        areaId,
        systemPrompt,
        outputInstruction,
        plainTextMode,
        selectedPersonas,
        selectedSkills,
        multiPerspective,
        metaCognitiveEnabled,
        structureReference,
        referenceOutput,
        transparencyLevel,
        writingTone,
        emojiEnabled,
        audience,
        channel,
        outputLanguage,
        knowledgeSources,
      } = req.body;

      // The preview reads the session's resume snapshot, project and atom
      // feedback exactly as a run does, so it takes the same ownership gate (B2).
      const sessionIdForPreview = typeof req.body.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : undefined;
      if (!(await ensureOwnSession(req, res, sessionIdForPreview))) return;

      // WP-11: Load user profile (the caller's own in team mode — B4)
      const userProfile = await loadLayer0Profile(db, req);

      // Resolve uploaded file IDs (only the caller's own uploads in team mode — B5)
      const uploadedFileIds: string[] = await ownedUploadIds(req, (req.body.uploadedFileIds as string[]) || []);
      const uploadedFilePaths = uploadedFileIds
        .map((id: string) => path.join(UPLOAD_DIR, id))
        .filter((p: string) => p.startsWith(UPLOAD_DIR));

      // Online references: capped as on a run. In demo mode a visitor's
      // preview does not fetch them at all — the preview hands the fetched
      // text back, which made this route a free fetch-and-return proxy on the
      // server's address (no model is called, so no budget or rate limit for
      // model calls applied). The run itself still fetches them.
      const tooManyUrls = onlineReferenceLimitProblem(knowledgeSources);
      if (tooManyUrls) {
        res.status(400).json({ error: tooManyUrls, code: 'TOO_MANY_ONLINE_REFERENCES' });
        return;
      }
      const previewKnowledgeSources = isDemoMode() && req.user?.role !== 'admin'
        ? withoutOnlineReferenceFetch(knowledgeSources)
        : knowledgeSources;

      // Resolve knowledge sources
      const resolved = previewKnowledgeSources
        ? await resolveKnowledgeSources(previewKnowledgeSources as Parameters<typeof resolveKnowledgeSources>[0], uploadedFilePaths)
        : { systemPromptAdditions: '', contextDocuments: '', tools: [], tokenEstimate: 0, sourceManifest: [] };

      // Wave 1: the preview composes the same layers as a run — org context,
      // knowledge packs, memory atoms, goals & values, resume and project
      // context, auto-attached format skills, the guardrail and the provenance
      // contract — so "what will be sent" is what is sent. The previous preview
      // omitted seven of those layers. The atom A/B arm is not drawn here: a
      // preview is not a run.
      const userMessageForPreview =
        typeof req.body.userMessage === 'string' ? req.body.userMessage
        : typeof req.body.message === 'string' ? req.body.message
        : '';
      const previewUserId = (req as { user?: { id?: string } }).user?.id || 'default';
      const [orgContextPrompt, knowledgePackPrompt, goalsValuesPrompt, resumeContextPrompt] = await Promise.all([
        buildOrgContextLayer(db, previewUserId),
        buildKnowledgePackLayer(db, { areaId, moduleId, userMessage: userMessageForPreview }),
        temporalReasoning.buildGoalsValuesLayer(previewUserId, areaId || 'general'),
        sessionIdForPreview ? buildResumeContextLayer(db, sessionIdForPreview) : Promise.resolve(''),
      ]);
      // Owner-scoped like the run's atom layer: the preview returns the prompt
      // text, so an unscoped layer showed other users' atoms in team mode.
      const atomLayerPrompt = req.body.atomInjectionEnabled !== false
        ? (await buildAtomLayerDetailed(db, {
            areaId,
            moduleId,
            userMessage: userMessageForPreview,
            sessionId: sessionIdForPreview ?? null,
            ownerUserId: req.user?.id ?? null,
            teamMode: isTeamMode(),
          })).text
        : '';
      let projectContextPrompt = '';
      if (sessionIdForPreview) {
        try {
          const previewProject = await db.get(
            'SELECT p.id FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.id = ?',
            sessionIdForPreview,
          ) as { id: string } | undefined;
          if (previewProject) {
            projectContextPrompt = (await buildProjectContext(db, {
              projectId: previewProject.id,
              currentSessionId: sessionIdForPreview,
              userId: previewUserId,
              userRole: req.user?.role ?? null,
              teamMode: process.env.DEPLOYMENT_MODE === 'team',
            })).text;
          }
        } catch { /* enrichment only */ }
      }
      // Wave 2: the preview grounds in framework text the same way a run does.
      let previewGrounding = '';
      if (moduleId || areaId) {
        try {
          const previewModule = moduleId ? await getModule(String(moduleId)).catch(() => undefined) : undefined;
          const g = await retrieveGroundingText({
            query: [previewModule?.label, userMessageForPreview].filter(Boolean).join(' '),
            frameworkIds: frameworksForArea(areaId),
            tokenBudget: 3000,
          });
          previewGrounding = g?.text ?? '';
        } catch { previewGrounding = ''; }
      }
      const previewAutoSkills = getAutoAttachSkillIds(Array.isArray(req.body.outputFormats) ? req.body.outputFormats : []);
      const previewSkills = Array.isArray(selectedSkills)
        ? [...new Set([...(selectedSkills as string[]), ...previewAutoSkills])]
        : previewAutoSkills.length > 0 ? previewAutoSkills : undefined;

      const composed = await composeSystemPromptParts({
        moduleId,
        areaId,
        systemPromptOverride: systemPrompt,
        creativity: creativity || 'balanced',
        thinking: thinking || 'think_hard',
        outputInstruction,
        plainTextMode: !!plainTextMode,
        selectedPersonas: Array.isArray(selectedPersonas) ? selectedPersonas : undefined,
        selectedSkills: previewSkills,
        multiPerspective: !!multiPerspective,
        metaCognitiveEnabled: !!metaCognitiveEnabled,
        structureReference,
        referenceOutput: referenceOutput || undefined,
        transparencyLevel: ([0, 1, 2] as number[]).includes(transparencyLevel) ? (transparencyLevel as 0 | 1 | 2) : 0,
        writingTone: writingTone || 'professional',
        emojiEnabled: !!emojiEnabled,
        audience: audience || undefined,
        channel: channel || undefined,
        outputLanguage: outputLanguage || undefined,
        knowledgeSystemAdditions: resolved.systemPromptAdditions,
        knowledgeContextDocuments: resolved.contextDocuments,
        userProfile: userProfile || null,
        orgContextPrompt: orgContextPrompt || undefined,
        knowledgePackPrompt: knowledgePackPrompt || undefined,
        frameworkGroundingPrompt: previewGrounding || undefined,
        atomLayerPrompt: atomLayerPrompt || undefined,
        resumeContextPrompt: resumeContextPrompt || undefined,
        projectContextPrompt: projectContextPrompt || undefined,
        goalsValuesPrompt: goalsValuesPrompt || undefined,
      });
      const composedPrompt = composed.full;

      res.json({
        prompt: composedPrompt,
        // The same estimator the run's context budget uses, not chars/4.
        estimatedTokens: estimateTokens(composedPrompt),
        knowledgeTokenEstimate: resolved.tokenEstimate,
        sourceManifest: resolved.sourceManifest,
        model: model || getEffectiveDefaultModel() || null,
        layers: composed.parts.map((p) => ({ key: p.key, chars: p.text.length, cacheable: p.cacheable })),
        staticChars: composed.staticPart.length,
        dynamicChars: composed.dynamicPart.length,
      });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // GET /api/claude/models — curated picker list. Label + pricing are derived from
  // MODEL_REGISTRY (the single source of truth) so this user-visible surface can
  // never drift from the SoT again (it previously listed stale Haiku $0.80/$4).
  router.get('/claude/models', async (_req, res) => {
    const curated: Array<{ id: string; description: string; recommended?: boolean }> = [
      { id: 'claude-opus-5-5', description: 'Newest Opus. Best for complex analysis, large documents, nuanced reasoning — at a lower price than Opus 5.', recommended: true },
      { id: 'claude-sonnet-5', description: 'Claude 5 workhorse. Near-Opus quality on most work at a fraction of the cost.' },
      { id: 'claude-opus-4-8', description: 'Previous Opus. Complex analysis, large documents, nuanced reasoning.' },
      { id: 'claude-sonnet-4-6', description: 'Fast and highly capable. Excellent for drafting, coding, and structured analysis.' },
      { id: 'claude-sonnet-4-5-20250929', description: 'Balanced speed and quality. Good for drafting, summarising, and routine analysis.' },
      { id: 'claude-haiku-4-5-20251001', description: 'Fastest and most affordable. Best for simple questions and quick lookups.' },
      { id: 'mistral-large-latest', description: 'Mistral flagship. Strong multilingual and reasoning capabilities.' },
      { id: 'mistral-small-latest', description: 'Lightweight Mistral model. Fast and cost-effective for simple tasks.' },
    ];
    res.json(curated.map(({ id, description, recommended }) => {
      const reg = MODEL_REGISTRY[id];
      return {
        id,
        label: reg?.displayName ?? id,
        description,
        ...(recommended ? { recommended: true } : {}),
        costPerMInputTokens: reg?.costPer1MInput ?? 0,
        costPerMOutputTokens: reg?.costPer1MOutput ?? 0,
      };
    }));
  });

  // GET /api/ollama/models — list locally running Ollama models (no auth required for health check)
  router.get('/ollama/models', async (_req, res) => {
    const models = await listOllamaModels();
    res.json({ models });
  });

  // GET /api/ollama/status — health + installed-model count for the Local Models settings panel.
  // (The panel renders available / baseUrl / modelCount / error from this.) Probes /api/tags
  // directly so "unreachable" is distinguishable from "running with 0 models" — listOllamaModels
  // swallows connection errors to [].
  router.get('/ollama/status', async (_req, res) => {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    try {
      const headers: Record<string, string> = {};
      if (process.env.OLLAMA_AUTH_TOKEN) headers['Authorization'] = `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`;
      const r = await fetch(`${baseUrl}/api/tags`, { headers, signal: AbortSignal.timeout(3000) });
      if (!r.ok) {
        res.json({ available: false, baseUrl, modelCount: 0, models: [], error: `Ollama returned HTTP ${r.status}` });
        return;
      }
      const data = (await r.json()) as { models?: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) ?? [];
      res.json({ available: true, baseUrl, modelCount: models.length, models });
    } catch (err) {
      res.json({ available: false, baseUrl, modelCount: 0, models: [], error: safeError(err) });
    }
  });

  // GET /api/claude/models-all — all models from MODEL_REGISTRY with key availability
  router.get('/claude/models-all', async (_req, res) => {
    const models = Object.entries(MODEL_REGISTRY).map(([id, config]) => ({
      id,
      provider: config.provider,
      displayName: config.displayName,
      contextWindow: config.contextWindow,
      maxOutputTokens: config.maxOutputTokens,
      supportsThinking: config.supportsThinking,
      supportsJsonMode: config.supportsJsonMode,
      costPer1MInput: config.costPer1MInput,
      costPer1MOutput: config.costPer1MOutput,
      costTier: config.costTier,
      apiKeyConfigured: isApiKeyAvailable(id),
    }));
    res.json(models);
  });

  // POST /api/claude/message-sync — non-streaming endpoint for MCP and integrations
  // Returns a JSON { content: string } response instead of SSE.
  // Auth-protected — same as /api/claude/message.
  router.post('/claude/message-sync', async (req, res) => {
    try {
      if (!isApiKeyConfigured()) {
        res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
        return;
      }

      const {
        model,
        thinking,
        moduleId,
        areaId,
        systemPrompt,
        outputInstruction,
        userMessage,
        history,
        knowledgeSources,
        creativity,
        selectedPersonas,
        selectedSkills,
        multiPerspective,
        metaCognitiveEnabled,
        structureReference,
        referenceOutput,
        transparencyLevel,
        writingTone,
        emojiEnabled,
        nativeReasoningEnabled: _nativeReasoningEnabled,
        audience,
        channel,
        outputLanguage,
      } = req.body;

      if (await refuseForbiddenModule(req, res, moduleId, areaId)) return;

      if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
        res.status(400).json({ error: 'userMessage is required.' });
        return;
      }

      // Only Anthropic models are supported in sync mode
      const selectedModel = (model as string) || 'claude-sonnet-4-5-20250929';
      const validModels = ['claude-opus-5-5', 'claude-opus-4-8', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'] as const;
      type SyncModel = typeof validModels[number];
      const syncModel: SyncModel = (validModels as readonly string[]).includes(selectedModel)
        ? (selectedModel as SyncModel)
        : 'claude-sonnet-4-5-20250929';

      // Resolve knowledge sources (no file paths for sync/MCP calls)
      const resolved = knowledgeSources
        ? await resolveKnowledgeSources(knowledgeSources, [])
        : { systemPromptAdditions: '', contextDocuments: '', tools: [], tokenEstimate: 0, sourceManifest: [] };

      // WP-11: Load user profile for prompt personalisation (the caller's own in team mode — B4)
      const userProfile = await loadLayer0Profile(db, req);

      // Compose system prompt (non-streaming path uses plain composer — no cache split needed)
      const composedPrompt = await composeSystemPrompt({
        moduleId,
        areaId,
        systemPromptOverride: systemPrompt,
        creativity: creativity || 'balanced',
        thinking: thinking || 'think',
        outputInstruction,
        selectedPersonas: Array.isArray(selectedPersonas) ? selectedPersonas : undefined,
        selectedSkills: Array.isArray(selectedSkills) ? selectedSkills : undefined,
        multiPerspective: !!multiPerspective,
        metaCognitiveEnabled: !!metaCognitiveEnabled,
        structureReference,
        referenceOutput: referenceOutput || undefined,
        transparencyLevel: ([0, 1, 2] as number[]).includes(transparencyLevel) ? (transparencyLevel as 0 | 1 | 2) : 0,
        writingTone: writingTone || 'professional',
        emojiEnabled: !!emojiEnabled,
        audience: audience || undefined,
        channel: channel || undefined,
        outputLanguage: outputLanguage || undefined,
        knowledgeSystemAdditions: resolved.systemPromptAdditions,
        knowledgeContextDocuments: resolved.contextDocuments,
        userProfile: userProfile || null,
      });

      // Build message history
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          if (msg.role && msg.content) {
            messages.push({ role: msg.role as 'user' | 'assistant', content: String(msg.content) });
          }
        }
      }
      messages.push({ role: 'user', content: userMessage });

      const result = await callSync({
        model: syncModel,
        thinking: (thinking || 'think') as 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first',
        system: composedPrompt,
        messages,
      });

      res.json({
        content: result.text,
        thinking: result.thinking,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // POST /api/claude/explain-for — Explain-It-Different: rewrite output for a target audience
  // Streams SSE using the same pattern as /api/claude/message but with a fixed lightweight prompt.
  // Defaults to claude-sonnet-4-5-20250929 (cost-effective for rewriting tasks).
  router.post('/claude/explain-for', async (req, res) => {
    try {
      if (!isApiKeyConfigured()) {
        res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
        return;
      }

      const { content, audience, moduleContext, model } = req.body as {
        content?: string;
        audience?: string;
        moduleContext?: string;
        model?: string;
      };

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        res.status(400).json({ error: 'content is required and must be a non-empty string.' });
        return;
      }

      if (!audience || typeof audience !== 'string') {
        res.status(400).json({ error: 'audience is required.' });
        return;
      }

      if (!isKnownAudience(audience)) {
        res.status(400).json({
          error: `Unknown audience: "${audience}". Valid values: board, regulator, technical, business, non-expert, external-client, media, legal`,
        });
        return;
      }

      // Build the audience-adapted prompt
      const userPrompt = getAudiencePrompt(audience, content, moduleContext);

      // Use Sonnet by default — fast and cost-effective for rewriting tasks
      const selectedModel = (
        ['claude-opus-5-5', 'claude-opus-4-8', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'].includes(model || '')
          ? model
          : 'claude-sonnet-4-5-20250929'
      ) as 'claude-opus-5-5' | 'claude-opus-4-8' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001';

      await streamToResponse(
        {
          model: selectedModel,
          thinking: 'think',
          system: 'You are an expert communication specialist at ANTON, a Financial Crime Prevention consultancy. Your role is to rewrite analysis outputs to suit specific audiences without altering underlying facts. Always produce clean Markdown with clear headings.',
          messages: [{ role: 'user', content: userPrompt }],
        },
        res
      );
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: safeError(error) });
      }
    }
  });

  // POST /api/claude/deliberate — Multi-Model Deliberation Protocol
  // Fans the same prompt to Opus + Sonnet + Haiku in parallel, scores agreement,
  // and streams an Opus-synthesised confidence-weighted response.
  router.post('/claude/deliberate', checkBudget, async (req, res) => {
    try {
      if (!isApiKeyConfigured()) {
        res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
        return;
      }

      const {
        moduleId,
        areaId,
        systemPrompt,
        outputInstruction,
        creativity,
        thinking,
        transparencyLevel,
        userMessage,
        knowledgeSources,
        sessionId,
      } = req.body;

      if (await refuseForbiddenModule(req, res, moduleId, areaId)) return;
      // The synthesis is written into this session below (B2).
      if (!(await ensureOwnSession(req, res, sessionId))) return;

      if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
        res.status(400).json({ error: 'userMessage is required' });
        return;
      }

      // Resolve knowledge sources (same as regular message route; own uploads only in team mode — B5)
      const uploadedFileIds: string[] = await ownedUploadIds(req, (req.body.uploadedFileIds as string[]) || []);
      const uploadedFilePaths = uploadedFileIds
        .map((id: string) => path.join(path.resolve(process.env.UPLOAD_DIR || './uploads'), id))
        .filter((p: string) => p.startsWith(path.resolve(process.env.UPLOAD_DIR || './uploads')));

      const resolved = knowledgeSources
        ? await resolveKnowledgeSources(knowledgeSources, uploadedFilePaths)
        : { systemPromptAdditions: '', contextDocuments: '', tools: [], tokenEstimate: 0, sourceManifest: [] };

      // User profile for personalisation (the caller's own in team mode — B4)
      const userProfile = await loadLayer0Profile(db, req);

      // Compose system prompt (full, non-cached — all 3 panelists share same base)
      const composedPrompt = await composeSystemPrompt({
        moduleId,
        areaId,
        systemPromptOverride: systemPrompt,
        creativity: creativity || 'balanced',
        thinking: thinking || 'think_hard',
        outputInstruction,
        plainTextMode: false,
        transparencyLevel: ([0, 1, 2] as number[]).includes(transparencyLevel) ? (transparencyLevel as 0 | 1 | 2) : 0,
        writingTone: req.body.writingTone || 'professional',
        emojiEnabled: false,
        knowledgeSystemAdditions: resolved.systemPromptAdditions,
        knowledgeContextDocuments: resolved.contextDocuments,
        userProfile: userProfile || null,
      });

      // Set up SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

      send({ type: 'deliberation_start', panelists: DEFAULT_PANELISTS.map((p) => ({ model: p.model, role: p.role, description: p.description })) });

      // Track individual panelist opinions for final event
      const opinions: Array<{ model: string; role: string; description: string; response: string; executionMs: number }> = [];

      const meta = await runDeliberation(
        composedPrompt,
        userMessage,
        DEFAULT_PANELISTS,
        // onModelStart
        (model, role) => send({ type: 'model_start', model, role }),
        // onModelComplete
        (opinion) => {
          opinions.push(opinion);
          send({
            type: 'model_complete',
            model: opinion.model,
            role: opinion.role,
            description: opinion.description,
            executionMs: opinion.executionMs,
            responsePreview: opinion.response.slice(0, 300),
          });
        },
        // onSynthesisChunk
        (chunk) => send({ type: 'text_delta', content: chunk }),
      );

      send({
        type: 'deliberation_complete',
        ...meta,
        opinions: opinions.map((o) => ({ model: o.model, role: o.role, description: o.description, response: o.response, executionMs: o.executionMs })),
      });

      // Persist synthesis to session if sessionId provided
      if (sessionId) {
        try {
          const synthesisText = opinions.length > 0
            ? `[Deliberation — ${meta.confidence} confidence, ${meta.agreementLevel} agreement]\n\n${userMessage}`
            : userMessage;
          await db.run(
            `INSERT INTO messages (id, session_id, role, content, created_at)
             VALUES (?, ?, 'user', ?, ?)
             ON CONFLICT DO NOTHING`
          , crypto.randomUUID(), sessionId, synthesisText, new Date().toISOString());
        } catch { /* non-fatal */ }
      }

      res.write('data: [DONE]\n\n');
      res.end();

    } catch (error) {
      const message = safeError(error);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  });

  // POST /api/claude/verify-citations — WP-32 Citation Verification Layer
  router.post('/claude/verify-citations', async (req, res) => {
    try {
      if (!hasClaudeEngine()) {
        res.status(503).json({ error: NO_CLAUDE_ENGINE_MESSAGE });
        return;
      }

      const { text, sourceManifest } = req.body as { text?: string; sessionId?: string; sourceManifest?: string[] };

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'text is required and must be a non-empty string.' });
        return;
      }

      // ATTR-04: pass source manifest for cross-checking citations against loaded sources
      const safeManifest = Array.isArray(sourceManifest) ? sourceManifest.filter(s => typeof s === 'string') : undefined;
      const citations = await verifyCitations(text, safeManifest);
      res.json({ citations });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // POST /api/modules/smart-search — AI-powered natural-language module finder
  // The server is the source of truth for the catalog: candidates come from the
  // module-loader (full corpus), not from the client. Any client-provided module
  // list is ignored (kept in the body for backwards compatibility only).
  router.post('/modules/smart-search', async (req, res) => {
    // The call below goes through provider-router on the routed utility
    // model, so a server whose configured engine is an OpenAI-compatible
    // endpoint or Ollama can answer it too.
    const configured = getConfiguredProvider();
    if (!hasClaudeEngine() && configured !== 'openai_compatible' && configured !== 'ollama') {
      res.status(503).json({ error: NO_CLAUDE_ENGINE_MESSAGE });
      return;
    }

    const { query } = req.body as { query?: string };

    if (!query?.trim()) {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    try {
      const { getAllModules } = await import('../services/module-loader.js');
      const catalog = await getAllModules();

      // Cheap keyword pre-filter over the full catalog: score each module by
      // query-token matches in id / label / description, keep the top ~150
      // candidates for the Haiku ranking pass.
      const MAX_CANDIDATES = 150;
      const tokens = query.trim().toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3);
      const scored = catalog.map((m, idx) => {
        const id = m.id.toLowerCase();
        const label = (m.label ?? '').toLowerCase();
        const description = (m.description ?? '').toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (id.includes(t)) score += 3;
          if (label.includes(t)) score += 3;
          if (description.includes(t)) score += 1;
        }
        return { m, idx, score };
      });
      // Matches first (best score wins), then catalog order — so when few or no
      // keywords hit, the list is still topped up to MAX_CANDIDATES.
      scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
      const candidates = scored.slice(0, MAX_CANDIDATES).map(s => s.m);

      const moduleList = candidates
        .map(m => `- ${m.id}: ${m.label} — ${(m.description ?? '').slice(0, 160)}`)
        .join('\n');

      // Through provider-router on the routed utility model — this was a raw
      // Anthropic client on the metered key, so Home's "Find the right module"
      // errored on every query on a subscription-only instance.
      const response = await callChat({
        model: await getRoutedUtilityModel(db),
        system: `You are a module recommender for an AI-powered professional workbench called openEXPERT. Given a user's description of what they need help with, identify the 3 most relevant modules. Return ONLY a valid JSON array — no prose, no markdown fences, nothing else.`,
        messages: [{
          role: 'user',
          content: `User need: "${query.trim()}"\n\nAvailable modules:\n${moduleList}\n\nReturn the 3 best-matching modules as a JSON array:\n[{"moduleId":"exact-module-id","label":"Module Label","reason":"One concise sentence explaining why this module fits the user's need."}]`,
        }],
        maxTokens: 512,
        jsonMode: true,
        db,
      });

      const text = response.text.trim() || '[]';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const matches = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

      // Grounding is not enough on its own. This route already puts real candidates in
      // the prompt, but returned the model's answer unchecked — and a model given 40
      // options still occasionally names a 41st that sounds right. A recommendation that
      // 404s is worse than a missing one: it teaches the user the feature is broken.
      const { valid, rejected } = await validateModuleMatches(
        (matches as Array<{ moduleId: string }>).map((m) => ({ ...m, moduleId: String(m?.moduleId ?? '') })),
      );
      if (rejected.length > 0) {
        console.warn(`[modules/recommend] dropped invented id(s): ${rejected.join(', ')}`);
      }
      res.json(valid.slice(0, 3));
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // GET /api/sessions/:sessionId/messages/:messageId/artifacts — item 1.6 read API.
  // Returns the persisted run artifact (composed prompt + layer summary +
  // pinned source manifest) for one assistant message. Ownership check mirrors
  // GET /api/sessions/:id (admins see all; others only their own sessions).
  router.get('/sessions/:sessionId/messages/:messageId/artifacts', async (req, res) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      const whereClause = userRole === 'admin' ? 'WHERE id = ?' : 'WHERE id = ? AND user_id = ?';
      const params = userRole === 'admin' ? [req.params.sessionId] : [req.params.sessionId, userId!];
      const session = await db.get(`SELECT id FROM sessions ${whereClause}`, ...params);
      if (!session) {
        res.status(404).json({ error: 'Session not found or access denied' });
        return;
      }

      const row = await db.get(
        `SELECT id, message_id, session_id, composed_prompt, prompt_sha256, prompt_chars,
                truncated, layer_summary, source_manifest, created_at
         FROM run_artifacts WHERE message_id = ? AND session_id = ?`,
        req.params.messageId, req.params.sessionId
      ) as Record<string, unknown> | undefined;
      if (!row) {
        res.status(404).json({ error: 'No run artifact recorded for this message' });
        return;
      }

      // JSONB columns come back as objects from pg; normalise if a driver returns strings
      const parseMaybe = (v: unknown): unknown => {
        if (typeof v !== 'string') return v;
        try { return JSON.parse(v); } catch { return v; }
      };
      res.json({
        ...row,
        layer_summary: parseMaybe(row.layer_summary),
        source_manifest: parseMaybe(row.source_manifest),
      });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // GET /api/revelation-chains/:chainId — fetch a full revelation chain with steps
  router.get('/revelation-chains/:chainId', async (req, res) => {
    const { chainId } = req.params;
    if (!chainId || typeof chainId !== 'string') {
      res.status(400).json({ error: 'chainId required' });
      return;
    }
    try {
      // Team isolation (B3): a chain carries every phase's thinking and output.
      // It has no owner column of its own, so it belongs to the owner of its
      // session; checked in SQL before the chain is loaded, and a chain that is
      // not the caller's answers the same 404 as a missing one. A chain with no
      // session (Markets consul runs) is therefore admin-only in team mode.
      if (scopesToOwner(req)) {
        const visible = await db.get(
          `SELECT 1 AS ok FROM revelation_chains c
             JOIN sessions s ON s.id = c.session_id
            WHERE c.id = ? AND s.user_id = ?`,
          chainId, req.user?.id ?? '',
        );
        if (!visible) {
          res.status(404).json({ error: 'Revelation chain not found' });
          return;
        }
      }
      const chain = await getRevelationChain(db, chainId);
      if (!chain) {
        res.status(404).json({ error: 'Revelation chain not found' });
        return;
      }
      res.json(chain);
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  return router;
}
