import { Router } from 'express';
import path from 'path';
import type { DatabaseAdapter } from '../db/database.js';

import { streamToResponse, isApiKeyConfigured, callSync, getClient } from '../services/claude-client.js';
import { runIterativeReasoning, getRevelationChain } from '../services/iterative-reasoning.js';
import { runDeliberation, DEFAULT_PANELISTS } from '../services/deliberation-engine.js';
import { createAtomExtractor } from '../services/atom-extractor.js';
import { createOutputStore } from '../services/output-store.js';
import { composeSystemPrompt, composeSystemPromptSplit } from '../services/prompt-composer.js';
import { buildOrgContextLayer, buildResumeContextLayer, buildKnowledgePackLayer, buildAtomLayer } from '../services/prompt-builder.js';
import { resolveKnowledgeSources } from '../services/knowledge-resolver.js';
import type { ResolvedKnowledge } from '../../src/lib/types.js';
import { resolveContextBudget, resolveOllamaNumCtx } from '../services/context-budget.js';
import { runMultiAgent } from '../services/multi-agent-orchestrator.js';
import { writeAuditEntry } from '../services/auditLogger.js';
import { safeError } from '../lib/error-response.js';
import { MODEL_REGISTRY, getModelConfig, getTemperature, isApiKeyAvailable } from '../types/modelAdapter.js';
import type { PrecisionLevel } from '../types/modelAdapter.js';
import { streamOpenAI } from '../services/adapters/openaiAdapter.js';
import { streamGemini } from '../services/adapters/geminiAdapter.js';
import { streamMistral } from '../services/adapters/mistralAdapter.js';
import { streamOllama, listOllamaModels } from '../services/adapters/ollamaAdapter.js';
import { streamAzureOpenAI } from '../services/adapters/azureOpenaiAdapter.js';
import type { AzureOpenAIConfig } from '../services/adapters/azureOpenaiAdapter.js';
import { streamOpenAICompatible } from '../services/adapters/openaiCompatibleAdapter.js';
import { resolveCustomEndpoint } from './custom-model-endpoints.js';
import { decrypt } from '../services/credential-vault.js';
import { verifyCitations } from '../services/citation-verifier.js';
import { getAutoAttachSkillIds } from '../services/skills-manager.js';
import { isKnownAudience, getAudiencePrompt } from '../services/audience-adapter.js';
import { createBudgetMiddleware } from '../middleware/budget.js';
import { semanticSearch } from '../services/semantic-search.js';
import { createQualityRatchet } from '../services/quality-ratchet.js';
import { getEffectiveDefaultModel } from '../services/default-model-store.js';
import { getAreaDefaultModelSync } from '../services/area-default-model-store.js';
import { validate } from '../lib/validate.js';
import { ClaudeMessageSchema } from '../lib/schemas.js';
import { acquireStream, releaseStream } from '../services/stream-limiter.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../services/circuit-breaker.js';
import { enqueueAudit } from '../services/audit-queue.js';
import { buildCompactionConfig, buildContextManagementParam } from '../services/compaction-manager.js';
import { createTemporalReasoningService } from '../services/temporal-reasoning.js';
import { writeRunArtifact, buildLayerSummary, sha256Hex } from '../services/run-artifact-writer.js';
import { assignAtomArm, isAtomAbEnabled, isExperimentSubject, resolveFinalArm } from '../services/atom-ab.js';
import { embedSessionOutput } from '../services/session-output-embedder.js';
import { getAnthropicUtilityModel } from '../services/utility-model.js';
import { computeRunCostUsd } from '../services/run-cost.js';

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');

export async function createClaudeRoutes(db: DatabaseAdapter, anthropic?: any) {
  const router = Router();
  const checkBudget = await createBudgetMiddleware(db);
  const ratchet = await createQualityRatchet(db);
  const temporalReasoning = await createTemporalReasoningService(db);

  // Lazy knowledge pipeline instances — shared across requests, initialised on first use
  let _atomExtractor: Awaited<ReturnType<typeof createAtomExtractor>> | null = null;
  let _outputStore: Awaited<ReturnType<typeof createOutputStore>> | null = null;
  async function getAtomExtractor() {
    if (!_atomExtractor) _atomExtractor = await createAtomExtractor(db, getClient());
    return _atomExtractor;
  }
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
        'claude-opus-4-8';
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
      const modelConfig = (isOllamaModel || isAzureModel || isCompatModel) ? undefined : await getModelConfig(selectedModel, db);
      const provider = isOllamaModel ? 'ollama' : isAzureModel ? 'azure_openai' : isCompatModel ? 'openai_compatible' : (modelConfig?.provider || 'anthropic');

      if (provider === 'anthropic') {
        if (!isApiKeyConfigured()) {
          res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
          return;
        }
      } else if (provider === 'azure_openai') {
        // Azure credentials are stored in DB, not env vars — validated at stream time
      } else if (provider === 'openai_compatible') {
        // Credentials live in the custom_model_endpoints table — validated at stream time
      } else if (provider !== 'ollama' && !isApiKeyAvailable(selectedModel)) {
        const keyName = modelConfig?.requiresApiKey || 'API_KEY';
        res.status(500).json({ error: `${keyName} not configured. Add it in Settings or your .env file.` });
        return;
      }

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
      let finalUserMessage = userMessage;
      if (moduleInputs && typeof moduleInputs === 'object' && Object.keys(moduleInputs as object).length > 0) {
        const inputLines = Object.entries(moduleInputs as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
          .map(([k, v]) => {
            const label = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            const value = Array.isArray(v) ? (v as unknown[]).join(', ') : String(v);
            return `- **${label}:** ${value}`;
          });
        if (inputLines.length > 0) {
          finalUserMessage = `## Module Settings\n${inputLines.join('\n')}\n\n---\n\n${userMessage}`;
        }
      }
      // Resolve uploaded file IDs → absolute paths in the uploads directory
      // The client sends file IDs (filenames) from the /api/files/upload response.
      const uploadedFileIds: string[] = (req.body.uploadedFileIds as string[]) || [];
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
            console.error(`[claude] Failed to read image ${id}:`, imgErr);
          }
        }
        contentBlocks.push({ type: 'text', text: finalUserMessage });
        messages.push({ role: 'user', content: contentBlocks });
      } else {
        messages.push({ role: 'user', content: finalUserMessage });
      }

      // WP-11: Load user profile for Layer 0 prompt personalisation
      const userProfile = await db.get('SELECT * FROM user_profiles WHERE id = ?', 'default') as Record<string, string | null> | undefined;

      const uploadedFilePaths = documentFileIds
        .map((id) => path.join(UPLOAD_DIR, id))
        .filter((p) => {
          // Security: ensure the resolved path is within UPLOAD_DIR
          const ok = p.startsWith(UPLOAD_DIR);
          if (!ok) console.warn(`[claude] Rejected path (outside UPLOAD_DIR): ${p}`);
          return ok;
        });

      // Capability-aware knowledge budget (plan 2.15): derived from the
      // session model's real context window — 800k for 1M-context Claude
      // (unchanged), ~104k for Mistral Large, the trained window for
      // ollama:* (via /api/show), the per-endpoint setting for compat:*.
      // Previously every non-1M model silently got the ~892k default.
      const is1MModel = model === 'claude-opus-4-8' || model === 'claude-sonnet-4-6';
      const knowledgeBudget = await resolveContextBudget(model, db as DatabaseAdapter);

      // TOKEN-03: Emit SSE progress events during context assembly when local folders are involved.
      // Set SSE headers early so we can stream progress before the Claude API call starts.
      const hasLocalFolders = !!(knowledgeSources as any)?.modes?.localFolder?.enabled &&
        ((knowledgeSources as any)?.modes?.localFolder?.folderPaths?.length ?? 0) > 0;
      const hasUploadedFiles = uploadedFilePaths.length > 0 || imageFileIds.length > 0;
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
        ? await resolveKnowledgeSources(knowledgeSources, uploadedFilePaths, { contextBudget: knowledgeBudget })
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
          });

          ragChunks = results;

          if (results.length > 0) {
            ragContext = '\n\n## RETRIEVED KNOWLEDGE FROM KNOWLEDGE BASE\n\n';
            ragContext += `I have retrieved ${results.length} relevant chunks from your knowledge base to help answer this question. Use these as reference material and cite them when applicable.\n\n`;

            results.forEach((result, idx) => {
              const chunkText = `### Source ${idx + 1}: ${result.citation}\n` +
                `Relevance: ${(result.relevanceScore * 100).toFixed(1)}%\n` +
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
      const orgContextPrompt = await buildOrgContextLayer(db, (req as any).user?.id || 'default');
      const resumeContextPrompt = sessionId ? await buildResumeContextLayer(db, String(sessionId)) : '';
      const knowledgePackPrompt = await buildKnowledgePackLayer(db, { areaId, moduleId, userMessage });
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
      if (
        userMessageId && // type narrowing — the predicate also checks it
        isExperimentSubject({ isRerun: !!rerunOf, atomInjectionOn, sessionId, userMessageId }) &&
        await isAtomAbEnabled(db)
      ) {
        atomArm = assignAtomArm(userMessageId);
      }
      const atomLayerPrompt = atomInjectionOn && atomArm !== 'holdout'
        ? await buildAtomLayer(db, areaId, moduleId, userMessage, sessionId ? String(sessionId) : null)
        : '';
      // Finding #9: drop an 'injected' arm whose atom layer came back empty so the
      // A/B experiment is not biased toward "atoms don't help" by runs that never
      // actually injected anything. resolveFinalArm leaves 'holdout'/null as-is.
      atomArm = resolveFinalArm(atomArm, atomLayerPrompt);
      const goalsValuesPrompt = await temporalReasoning.buildGoalsValuesLayer(
        (req as any).user?.id || 'default',
        areaId || 'finance'
      );

      const promptComposerConfig = {
        moduleId,
        areaId,
        systemPromptOverride: systemPrompt,
        creativity: creativity || 'balanced',
        thinking: thinking || 'think_hard',
        outputInstruction,
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
        atomLayerPrompt: atomLayerPrompt || undefined,
        resumeContextPrompt: resumeContextPrompt || undefined,
        goalsValuesPrompt: goalsValuesPrompt || undefined,
      } as const;

      // Use the split composer for Anthropic models (supports caching); plain for others.
      const isCachingModel =
        provider === 'anthropic' &&
        (selectedModel === 'claude-opus-4-8' || selectedModel === 'claude-sonnet-4-6' || selectedModel === 'claude-sonnet-4-5-20250929');

      let composedPrompt: string;
      let staticSystemPrompt: string | undefined;

      if (isCachingModel) {
        const split = await composeSystemPromptSplit(promptComposerConfig);
        composedPrompt = split.dynamicPart;   // dynamic portion → system string in StreamConfig
        staticSystemPrompt = split.staticPart; // static portion → cached block
      } else {
        composedPrompt = await composeSystemPrompt(promptComposerConfig);
        staticSystemPrompt = undefined;
      }

      // Merge tools from knowledge resolver (web search) with any request-level tools
      const tools = resolved.tools as Array<{ type: string; name: string }>;

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

      // Callback to save assistant message + audit after streaming completes
      const onComplete = sessionId
        ? async (data: { text: string; thinking: string; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreationTokens?: number; rawContentBlocks?: unknown[] }) => {
            // Build config snapshot first — used in both INSERT and UPDATE below
            const configSnapshot = {
              model: selectedModel,
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
            const estimatedCostUsd: number | null = computeRunCostUsd({
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
            const assistantMessageId = crypto.randomUUID();
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
            // Item 1.6: persist the run artifact — the final composed system
            // prompt exactly as passed to the LLM (closure values reflect any
            // post-composition mutation, e.g. web-search strip / Bing append on
            // non-Anthropic providers) + per-layer summary + pinned sources.
            // Fire-and-forget: writeRunArtifact never throws; failures are logged.
            if (messagePersisted) {
              const fullComposedPrompt = staticSystemPrompt
                ? `${staticSystemPrompt}\n\n${composedPrompt}`
                : composedPrompt;
              const layerSummary = buildLayerSummary({
                'composed_static_layers_1_3_cached': staticSystemPrompt ?? '',
                [staticSystemPrompt ? 'composed_dynamic' : 'composed_full']: composedPrompt,
                'layer2a_org_context': orgContextPrompt,
                'layer2b_knowledge_pack': knowledgePackPrompt,
                'layer4a_resume_context': resumeContextPrompt,
                'layer6_atoms': atomLayerPrompt,
                'goals_values': goalsValuesPrompt,
                'business_context': businessContext ?? '',
                'layer6_knowledge_system_additions': resolved.systemPromptAdditions,
                'layer6_reference_documents': resolved.contextDocuments,
                // Wave 3.4: the A/B arm rides in the layer summary (entry name
                // carries the arm — entries store name/chars/sha only).
                ...(atomArm ? { [`atom_ab_arm_${atomArm}`]: atomArm } : {}),
              });
              const sourceManifest = resolved.sourceDetails && resolved.sourceDetails.length > 0
                ? resolved.sourceDetails
                : resolved.sourceManifest.map((name) => ({ type: 'summary', name, contentHashed: false }));
              void writeRunArtifact(db, {
                messageId: assistantMessageId,
                sessionId,
                composedPrompt: fullComposedPrompt,
                layerSummary,
                sourceManifest,
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
            // GOV-02: look up current system_prompt version for this module
            let systemPromptVersionId: string | undefined;
            if (moduleId) {
              try {
                const spRow = await db.get(`SELECT id FROM system_prompts WHERE module_id = ? AND deprecated_at IS NULL ORDER BY created_at DESC LIMIT 1`
                , moduleId) as { id: string } | undefined;
                systemPromptVersionId = spRow?.id;
              } catch { /* non-fatal */ }
            }
            // RATE-04: use async audit queue instead of synchronous write
            enqueueAudit({
              sessionId,
              moduleId,
              areaId,
              model: selectedModel,
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
            // Update per-user monthly usage (team mode only)
            if (process.env.DEPLOYMENT_MODE === 'team' && req.user && req.user.id !== 'solo') {
              try {
                const yearMonth = new Date().toISOString().slice(0, 7);
                const usageId = crypto.randomUUID();
                await db.run(`
                  INSERT INTO user_monthly_usage (id, user_id, year_month, input_tokens, output_tokens)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(user_id, year_month) DO UPDATE SET
                    input_tokens = input_tokens + excluded.input_tokens,
                    output_tokens = output_tokens + excluded.output_tokens
                `, usageId, req.user.id, yearMonth, data.inputTokens || 0, data.outputTokens || 0);
              } catch {
                // Non-fatal
              }
            }
            // Quality auto-scoring (non-fatal) — always run; fall back to 'open-chat' module.
            // The promise is kept (instead of pure fire-and-forget) so the apprentice
            // progression block below can fold the overall score into quality_avg
            // (B2 fix: nothing ever wrote quality_avg, so promotion past 'guided'
            // was arithmetically impossible). Resolves to null when scoring is
            // skipped (short output) or failed — null means "do not fold".
            const qualityScorePromise: Promise<number | null> =
              data.text && data.text.length > 200
                ? ratchet.scoreOutput({ content: data.text, moduleId: moduleId || 'open-chat', areaId, sessionId, anthropicClient: anthropic })
                    .then((r) => (typeof r?.score?.overall === 'number' && Number.isFinite(r.score.overall) ? r.score.overall : null))
                    .catch(() => null)
                : Promise.resolve(null);
            // Output Transformation — structured extraction (fire-and-forget)
            // Uses a bounded-concurrency queue so a burst of session completions
            // doesn't spawn N parallel Haiku calls. Deduplicates per-session.
            // Missing moduleId falls back to analytic_report (most permissive);
            // threshold lowered to 100 chars to cover short policy outputs.
            if (sessionId && data.text && data.text.length > 100) {
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
            // Auto-extract knowledge atoms from this session output (non-blocking fire-and-forget)
            // This populates Knowledge Graph, Intelligence Dashboard, and Pattern Detection
            // Skipped when user disables atom collection (playground / clean-slate mode)
            if (atomCollectionEnabled !== false && data.text && data.text.length > 200) {
              try {
                const workflowId = `module:${moduleId || 'general'}`;
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
                const extractor = await getAtomExtractor();
                extractor.extractAtoms(outputId).catch(() => {});
              } catch { /* non-fatal */ }
            }
          }
        : undefined;

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

          // Save to database if session exists
          if (sessionId && onComplete) {
            // Estimate tokens (rough: ~4 chars per token)
            const estimatedOutputTokens = Math.ceil(result.synthesis.length / 4);
            const estimatedInputTokens = Math.ceil(fullContext.length / 4);

            onComplete({
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
        res.status(400).json({
          error: `Context too large for ${model}: estimated ~${Math.round(resolved.tokenEstimate / 1000)}k tokens exceeds its ~${Math.round(knowledgeBudget / 1000)}k context budget. ` +
                 `Trim knowledge sources, use Summary mode for online references, or pick a larger-context model.`,
          code: 'CONTEXT_TOO_LARGE',
          tokenEstimate: resolved.tokenEstimate,
          limit: knowledgeBudget,
        });
        return;
      }

      // STREAM-05: per-user concurrent stream limit (max 3)
      const streamUserId = (req as any).user?.id || req.ip || 'anonymous';
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

      // Route to the correct provider adapter
      if (provider === 'anthropic') {
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
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
      res.on('close', () => clearTimeout(timeoutId));
      res.on('finish', () => clearTimeout(timeoutId));

      try {
      // IRE branch: route to iterative reasoning engine when explicitly enabled
      // or when thinking level is 'deep_investigate'
      const ireThinkingLevel = thinking as string;
      const useIRE = (iterativeReasoningEnabled === true || ireThinkingLevel === 'deep_investigate')
        && provider === 'anthropic'
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
        if (onComplete && ireSummary.synthesisText) {
          await onComplete({
            text: ireSummary.synthesisText,
            thinking: '',
            inputTokens: ireSummary.totalInputTokens || 0,
            outputTokens: ireSummary.totalOutputTokens || 0,
          });
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
            model: selectedModel as 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001',
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
          onComplete
        );
        recordSuccess();
      } catch (streamErr: unknown) {
        const status = (streamErr instanceof Error && 'status' in streamErr)
          ? (streamErr as { status?: number }).status
          : undefined;
        recordFailure(status);
        throw streamErr;
      } finally {
        clearTimeout(timeoutId);
      }
      } else {
        // Non-Anthropic providers: set SSE headers, stream, then finalize
        const precisionLevel: PrecisionLevel = precision || 'balanced';
        const temperature = getTemperature(selectedModel, precisionLevel);
        const maxTokens = modelConfig?.maxOutputTokens || 8192;

        // Strip Claude-specific web search instructions from system prompt —
        // non-Anthropic models don't have the web_search tool and will hallucinate tool calls
        const webSearchWasRequested = tools.some(t => t.type === 'web_search_20250305');
        composedPrompt = composedPrompt
          .replace(/## WEB SEARCH ENABLED\n[^\n]*Use the web_search tool[^\n]*/g, '')
          .replace(/\n{3,}/g, '\n\n');

        // For ALL non-Anthropic providers: if web search was requested and Bing is
        // configured, pre-search and inject results (Claude uses its native
        // web_search tool on its own branch; everyone else gets Bing grounding).
        if (webSearchWasRequested) {
          try {
            const { getBingSearchApiKey, searchAndFormat, extractSearchQuery } = await import('../services/bing-search.js');
            const bingKey = await getBingSearchApiKey(db);
            if (bingKey) {
              // Get last user message as search query
              const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
              const queryText = lastUserMsg
                ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content))
                : '';
              if (queryText) {
                const searchQuery = extractSearchQuery(queryText);
                const searchResults = await searchAndFormat(searchQuery, bingKey);
                composedPrompt += `\n\n${searchResults}`;
              }
            }
          } catch (bingErr) {
            console.warn('[ANTON] Bing search failed, continuing without web results:', bingErr instanceof Error ? bingErr.message : bingErr);
          }
        }

        // Abort controller for non-Anthropic providers (timeout + client disconnect)
        const adapterAbort = new AbortController();
        req.on('close', () => adapterAbort.abort());
        const adapterTimeouts: Record<string, number> = { quick: 90_000, think: 180_000, think_hard: 300_000, investigate: 420_000, plan_first: 420_000, deep_investigate: 600_000 };
        const adapterTimeoutMs = adapterTimeouts[thinking as string] || 300_000;
        const adapterTimeoutId = setTimeout(() => adapterAbort.abort(), adapterTimeoutMs);
        res.on('close', () => clearTimeout(adapterTimeoutId));
        res.on('finish', () => clearTimeout(adapterTimeoutId));

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        const sendEvent = (event: object) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        };

        sendEvent({ type: 'stream_start', messageId: crypto.randomUUID() });

        try {
          // Non-Anthropic adapters expect plain string content; normalize multi-block messages
          const plainMessages = messages.map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          }));

          let result: { inputTokens: number; outputTokens: number; text: string };

          if (provider === 'openai') {
            result = await streamOpenAI({
              model: selectedModel,
              system: composedPrompt,
              messages: plainMessages,
              temperature,
              maxTokens,
              nativeReasoningEnabled: !!nativeReasoningEnabled,
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
          } else if (provider === 'openai_compatible') {
            // compat:<slug>:<model> — resolve the user's configured OpenAI-compatible endpoint
            const slug = selectedModel.split(':')[1];
            if (!slug) throw new Error(`Invalid compat model id: ${selectedModel} (expected compat:<slug>:<model>)`);
            const endpoint = await resolveCustomEndpoint(db, slug);
            if (!endpoint) throw new Error(`No enabled custom model endpoint with slug "${slug}". Add one in Settings → Local & cost-effective models.`);
            const bareModel = selectedModel.split(':').slice(2).join(':');
            if (!bareModel) throw new Error(`Invalid compat model id: ${selectedModel} (expected compat:<slug>:<model>)`);
            result = await streamOpenAICompatible({
              baseUrl: endpoint.baseUrl,
              apiKey: endpoint.apiKey,
              extraHeaders: endpoint.extraHeaders,
              model: bareModel,
              system: composedPrompt,
              messages: plainMessages,
              temperature,
              maxTokens,
            }, res);
          } else {
            throw new Error(`Unsupported provider: ${provider}`);
          }

          sendEvent({
            type: 'usage',
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            thinkingTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
          });
          sendEvent({
            type: 'stream_end',
            contentBlocks: [{ type: 'text', content: result.text }],
          });

          if (onComplete) {
            onComplete({ text: result.text, thinking: (result as { thinking?: string }).thinking || '', inputTokens: result.inputTokens, outputTokens: result.outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0 });
          }
        } catch (adapterError) {
          const errMsg = adapterError instanceof Error ? adapterError.message : 'Unknown adapter error';
          sendEvent({ type: 'error', message: errMsg });
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

      // WP-11: Load user profile
      const userProfile = await db.get('SELECT * FROM user_profiles WHERE id = ?', 'default') as Record<string, string | null> | undefined;

      // Resolve uploaded file IDs
      const uploadedFileIds: string[] = (req.body.uploadedFileIds as string[]) || [];
      const uploadedFilePaths = uploadedFileIds
        .map((id: string) => path.join(UPLOAD_DIR, id))
        .filter((p: string) => p.startsWith(UPLOAD_DIR));

      // Resolve knowledge sources
      const resolved = knowledgeSources
        ? await resolveKnowledgeSources(knowledgeSources, uploadedFilePaths)
        : { systemPromptAdditions: '', contextDocuments: '', tools: [], tokenEstimate: 0, sourceManifest: [] };

      // Compose the full system prompt
      const composedPrompt = await composeSystemPrompt({
        moduleId,
        areaId,
        systemPromptOverride: systemPrompt,
        creativity: creativity || 'balanced',
        thinking: thinking || 'think_hard',
        outputInstruction,
        plainTextMode: !!plainTextMode,
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

      // Estimate tokens (~4 chars per token)
      const estimatedTokens = Math.ceil(composedPrompt.length / 4);

      res.json({
        prompt: composedPrompt,
        estimatedTokens,
        knowledgeTokenEstimate: resolved.tokenEstimate,
        sourceManifest: resolved.sourceManifest,
        model: model || 'claude-opus-4-8',
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
      { id: 'claude-opus-4-8', description: 'Most capable. Best for complex analysis, large documents, nuanced reasoning.', recommended: true },
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

      if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
        res.status(400).json({ error: 'userMessage is required.' });
        return;
      }

      // Only Anthropic models are supported in sync mode
      const selectedModel = (model as string) || 'claude-sonnet-4-5-20250929';
      const validModels = ['claude-opus-4-8', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'] as const;
      type SyncModel = typeof validModels[number];
      const syncModel: SyncModel = (validModels as readonly string[]).includes(selectedModel)
        ? (selectedModel as SyncModel)
        : 'claude-sonnet-4-5-20250929';

      // Resolve knowledge sources (no file paths for sync/MCP calls)
      const resolved = knowledgeSources
        ? await resolveKnowledgeSources(knowledgeSources, [])
        : { systemPromptAdditions: '', contextDocuments: '', tools: [], tokenEstimate: 0, sourceManifest: [] };

      // WP-11: Load user profile for prompt personalisation
      const userProfile = await db.get('SELECT * FROM user_profiles WHERE id = ?', 'default') as Record<string, string | null> | undefined;

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
        ['claude-opus-4-8', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'].includes(model || '')
          ? model
          : 'claude-sonnet-4-5-20250929'
      ) as 'claude-opus-4-8' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001';

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

      if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
        res.status(400).json({ error: 'userMessage is required' });
        return;
      }

      // Resolve knowledge sources (same as regular message route)
      const uploadedFileIds: string[] = (req.body.uploadedFileIds as string[]) || [];
      const uploadedFilePaths = uploadedFileIds
        .map((id: string) => path.join(path.resolve(process.env.UPLOAD_DIR || './uploads'), id))
        .filter((p: string) => p.startsWith(path.resolve(process.env.UPLOAD_DIR || './uploads')));

      const resolved = knowledgeSources
        ? await resolveKnowledgeSources(knowledgeSources, uploadedFilePaths)
        : { systemPromptAdditions: '', contextDocuments: '', tools: [], tokenEstimate: 0, sourceManifest: [] };

      // User profile for personalisation
      const userProfile = await db.get('SELECT * FROM user_profiles WHERE id = ?', 'default') as Record<string, string | null> | undefined;

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
      if (!isApiKeyConfigured()) {
        res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
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
    if (!isApiKeyConfigured()) {
      res.status(503).json({ error: 'API key not configured' });
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

      const client = getClient();
      const moduleList = candidates
        .map(m => `- ${m.id}: ${m.label} — ${(m.description ?? '').slice(0, 160)}`)
        .join('\n');

      const response = await client.messages.create({
        // Wave 3.8: raw-Anthropic site — honours a Claude utility override,
        // falls back to the default Haiku for non-Anthropic utility models.
        model: await getAnthropicUtilityModel(db),
        max_tokens: 512,
        system: `You are a module recommender for an AI-powered professional workbench called openEXPERT. Given a user's description of what they need help with, identify the 3 most relevant modules. Return ONLY a valid JSON array — no prose, no markdown fences, nothing else.`,
        messages: [{
          role: 'user',
          content: `User need: "${query.trim()}"\n\nAvailable modules:\n${moduleList}\n\nReturn the 3 best-matching modules as a JSON array:\n[{"moduleId":"exact-module-id","label":"Module Label","reason":"One concise sentence explaining why this module fits the user's need."}]`,
        }],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '[]';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const matches = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      res.json(matches.slice(0, 3));
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
    const chain = await getRevelationChain(db, chainId);
    if (!chain) {
      res.status(404).json({ error: 'Revelation chain not found' });
      return;
    }
    res.json(chain);
  });

  return router;
}
