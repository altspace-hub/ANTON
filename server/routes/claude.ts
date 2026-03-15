import { Router } from 'express';
import path from 'path';
import type Database from 'better-sqlite3';
import { streamToResponse, isApiKeyConfigured, callSync, getClient } from '../services/claude-client.js';
import { runIterativeReasoning, getRevelationChain } from '../services/iterative-reasoning.js';
import { runDeliberation, DEFAULT_PANELISTS } from '../services/deliberation-engine.js';
import { createAtomExtractor } from '../services/atom-extractor.js';
import { createOutputStore } from '../services/output-store.js';
import { composeSystemPrompt, composeSystemPromptSplit } from '../services/prompt-composer.js';
import { buildOrgContextLayer, buildResumeContextLayer, buildKnowledgePackLayer, buildAtomLayer } from '../services/prompt-builder.js';
import { resolveKnowledgeSources } from '../services/knowledge-resolver.js';
import { runMultiAgent } from '../services/multi-agent-orchestrator.js';
import { writeAuditEntry } from '../services/auditLogger.js';
import { safeError } from '../lib/error-response.js';
import { MODEL_REGISTRY, getModelConfig, getTemperature, isApiKeyAvailable } from '../types/modelAdapter.js';
import type { PrecisionLevel } from '../types/modelAdapter.js';
import { streamOpenAI } from '../services/adapters/openaiAdapter.js';
import { streamGemini } from '../services/adapters/geminiAdapter.js';
import { streamMistral } from '../services/adapters/mistralAdapter.js';
import { streamOllama, listOllamaModels } from '../services/adapters/ollamaAdapter.js';
import { verifyCitations } from '../services/citation-verifier.js';
import { getAutoAttachSkillIds } from '../services/skills-manager.js';
import { isKnownAudience, getAudiencePrompt } from '../services/audience-adapter.js';
import { createBudgetMiddleware } from '../middleware/budget.js';
import { semanticSearch } from '../services/semantic-search.js';
import { createQualityRatchet } from '../services/quality-ratchet.js';
import { validate } from '../lib/validate.js';
import { ClaudeMessageSchema } from '../lib/schemas.js';
import { acquireStream, releaseStream } from '../services/stream-limiter.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../services/circuit-breaker.js';
import { enqueueAudit } from '../services/audit-queue.js';
import { buildCompactionConfig, buildContextManagementParam } from '../services/compaction-manager.js';

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');

export function createClaudeRoutes(db: Database.Database, anthropic?: any) {
  const router = Router();
  const checkBudget = createBudgetMiddleware(db);
  const ratchet = createQualityRatchet(db);

  // Lazy knowledge pipeline instances — shared across requests, initialised on first use
  let _atomExtractor: ReturnType<typeof createAtomExtractor> | null = null;
  let _outputStore: ReturnType<typeof createOutputStore> | null = null;
  function getAtomExtractor() {
    if (!_atomExtractor) _atomExtractor = createAtomExtractor(db, getClient());
    return _atomExtractor;
  }
  function getSessionOutputStore() {
    if (!_outputStore) _outputStore = createOutputStore(db);
    return _outputStore;
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
      } = req.body;

      // MGOV-01/02: Apply compliance_policy + model allowlist checks
      let policyModel = (model as string) || 'claude-opus-4-6';
      if (moduleId) {
        try {
          // enforce_model override (server-side); enforce_thinking/creativity served to client via GET /api/compliance-policy/:moduleId
          const policy = db.prepare(
            'SELECT enforce_model FROM compliance_policy WHERE module_id = ?'
          ).get(moduleId) as { enforce_model: string | null } | undefined;
          if (policy?.enforce_model) policyModel = policy.enforce_model;

          // MGOV-02: per-user model allowlist (team mode only)
          if (process.env.DEPLOYMENT_MODE === 'team' && req.user && req.user.id !== 'solo') {
            const userAllowlistCount = (db.prepare('SELECT COUNT(*) as c FROM model_allowed WHERE user_id = ?').get(req.user.id) as { c: number }).c;
            if (userAllowlistCount > 0) {
              const allowed = (db.prepare('SELECT COUNT(*) as c FROM model_allowed WHERE user_id = ? AND model_id = ?').get(req.user.id, policyModel) as { c: number }).c;
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
      const modelConfig = isOllamaModel ? undefined : getModelConfig(selectedModel);
      const provider = isOllamaModel ? 'ollama' : (modelConfig?.provider || 'anthropic');

      if (provider === 'anthropic') {
        if (!isApiKeyConfigured()) {
          res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
          return;
        }
      } else if (provider !== 'ollama' && !isApiKeyAvailable(selectedModel)) {
        const keyName = modelConfig?.requiresApiKey || 'API_KEY';
        res.status(500).json({ error: `${keyName} not configured. Add it in Settings or your .env file.` });
        return;
      }

      // Budget cap check (team mode only)
      if (process.env.DEPLOYMENT_MODE === 'team' && req.user && req.user.id !== 'solo') {
        const budgetRow = db.prepare('SELECT monthly_token_budget FROM users WHERE id = ?').get(req.user.id) as { monthly_token_budget: number } | undefined;
        const budget = budgetRow?.monthly_token_budget ?? 0;
        if (budget > 0) {
          const yearMonth = new Date().toISOString().slice(0, 7);
          const usageRow = db.prepare(
            'SELECT COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) as total FROM user_monthly_usage WHERE user_id = ? AND year_month = ?'
          ).get(req.user.id, yearMonth) as { total: number } | undefined;
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
        const settingRow = db.prepare("SELECT value FROM app_settings WHERE key = 'monthly_budget_cap'").get() as { value: string } | undefined;
        const capFromDb = settingRow ? parseFloat(settingRow.value) : NaN;
        const capFromEnv = parseFloat(process.env.MONTHLY_BUDGET_CAP || '0');
        const globalCap = !isNaN(capFromDb) ? capFromDb : capFromEnv;
        if (globalCap > 0) {
          const capMonth = new Date().toISOString().slice(0, 7);
          const capSpentRow = db.prepare(
            `SELECT COALESCE(SUM(cost), 0) as total FROM messages WHERE strftime('%Y-%m', created_at) = ?`
          ).get(capMonth) as { total: number };
          const capSpent = capSpentRow.total ?? 0;
          if (capSpent >= globalCap) {
            res.status(402).json({ error: 'Monthly budget cap reached', spent: capSpent, cap: globalCap });
            return;
          }
        }
      }

      // Save user message to DB before streaming starts
      if (sessionId && userMessage) {
        try {
          db.prepare(
            `INSERT OR IGNORE INTO messages (id, session_id, role, content, created_at)
             VALUES (?, ?, 'user', ?, ?)`
          ).run(crypto.randomUUID(), sessionId, userMessage, new Date().toISOString());

          // Update session timestamp
          db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`)
            .run(new Date().toISOString(), sessionId);
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
          const stored = db.prepare(
            `SELECT content, content_blocks FROM messages
             WHERE session_id = ? AND role = 'assistant' AND content_blocks IS NOT NULL`
          ).all(sessionId) as Array<{ content: string; content_blocks: string }>;
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
      const userProfile = db
        .prepare('SELECT * FROM user_profiles WHERE id = ?')
        .get('default') as Record<string, string | null> | undefined;

      const uploadedFilePaths = documentFileIds
        .map((id) => path.join(UPLOAD_DIR, id))
        .filter((p) => {
          // Security: ensure the resolved path is within UPLOAD_DIR
          const ok = p.startsWith(UPLOAD_DIR);
          if (!ok) console.warn(`[claude] Rejected path (outside UPLOAD_DIR): ${p}`);
          return ok;
        });

      // 1M context: Opus 4.6 and Sonnet 4.6 have 1M at GA pricing (no beta header needed).
      // For these models, always use the full 800k knowledge budget.
      // For Sonnet 4.5 with beta, or when ANTHROPIC_LONG_CONTEXT_BETA is set, also enable.
      const is1MModel = model === 'claude-opus-4-6' || model === 'claude-sonnet-4-6';
      const longContextBetaEnabled = is1MModel || process.env.ANTHROPIC_LONG_CONTEXT_BETA === 'true';
      const knowledgeBudget = longContextBetaEnabled ? 800_000 : undefined;

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
      const resolved = knowledgeSources
        ? await resolveKnowledgeSources(knowledgeSources, uploadedFilePaths, { contextBudget: knowledgeBudget })
        : { systemPromptAdditions: '', contextDocuments: '', tools: [], tokenEstimate: 0, sourceManifest: [] };

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
          const results = await semanticSearch(db as Database.Database, {
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
          const identityRow = db.prepare("SELECT * FROM fund_identity WHERE id = 'default'").get() as Record<string, string | null> | undefined;
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
            const tmplRow = db.prepare(
              "SELECT template_content, section_order, style_notes FROM ic_memo_templates WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1"
            ).get() as { template_content: string; section_order: string; style_notes: string } | undefined;

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
          const identityRow = db.prepare("SELECT profile_data FROM business_identity WHERE id = 'default'").get() as { profile_data: string } | undefined;
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
              const tmplRow = db.prepare("SELECT template_data FROM document_templates WHERE document_type = ? AND is_default = 1 LIMIT 1").get(docType) as
                | { template_data: string }
                | undefined;
              if (tmplRow) {
                try { templateData = JSON.parse(tmplRow.template_data); } catch { /* ignore */ }
              }
            }

            let patternData: unknown = null;
            if (processType) {
              const ptnRow = db.prepare("SELECT pattern_data FROM process_patterns WHERE process_type = ? ORDER BY updated_at DESC LIMIT 1").get(processType) as
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
      // For Anthropic models that support prompt caching (Opus 4.6, Sonnet 4.5) we use
      // the split variant so the stable static layers (Foundation + Area Context + Module
      // Prompt) can be marked with cache_control and cached by Anthropic between API calls,
      // reducing costs ~90% on those tokens. Dynamic layers (output format instructions,
      // knowledge additions, reference documents, etc.) are sent in a second uncached block.
      // Pre-build strategic improvement layers (non-fatal — empty string if DB table missing)
      const orgContextPrompt = buildOrgContextLayer(db, (req as any).user?.id || 'default');
      const resumeContextPrompt = sessionId ? buildResumeContextLayer(db, String(sessionId)) : '';
      const knowledgePackPrompt = buildKnowledgePackLayer(db);
      const atomLayerPrompt = atomInjectionEnabled !== false ? await buildAtomLayer(db, areaId, moduleId, userMessage, sessionId ? String(sessionId) : null) : '';

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
      } as const;

      // Use the split composer for Anthropic models (supports caching); plain for others.
      const isCachingModel =
        provider === 'anthropic' &&
        (selectedModel === 'claude-opus-4-6' || selectedModel === 'claude-sonnet-4-6' || selectedModel === 'claude-sonnet-4-5-20250929');

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

      // Compute cost rates for this model
      const costIn = modelConfig?.costPer1MInput || 15;
      const costOut = modelConfig?.costPer1MOutput || 75;

      // Callback to save assistant message + audit after streaming completes
      const onComplete = sessionId
        ? (data: { text: string; thinking: string; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreationTokens?: number; rawContentBlocks?: unknown[] }) => {
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
            try {
              db.prepare(
                `INSERT INTO messages (id, session_id, role, content, thinking_content, content_blocks, token_count, model_id, config_snapshot, created_at)
                 VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?)`
              ).run(
                crypto.randomUUID(),
                sessionId,
                data.text,
                data.thinking || null,
                // Persist full content blocks (with thinking signatures) for multi-turn replay
                data.rawContentBlocks ? JSON.stringify(data.rawContentBlocks) : null,
                data.outputTokens,
                selectedModel,
                JSON.stringify(configSnapshot),
                new Date().toISOString()
              );
            } catch {
              // Non-fatal — message was already streamed to user
            }
            // GOV-02: look up current system_prompt version for this module
            let systemPromptVersionId: string | undefined;
            if (moduleId) {
              try {
                const spRow = db.prepare(
                  `SELECT id FROM system_prompts WHERE module_id = ? AND deprecated_at IS NULL ORDER BY created_at DESC LIMIT 1`
                ).get(moduleId) as { id: string } | undefined;
                systemPromptVersionId = spRow?.id;
              } catch { /* non-fatal */ }
            }
            // CACHE-03: include cache read/write tokens and compute cache-adjusted cost
            const cacheReadTokens = data.cacheReadTokens || 0;
            const cacheCreationTokens = data.cacheCreationTokens || 0;
            // Cache read is ~10% of input rate; cache write is ~125% of input rate
            const billableInputTokens = (data.inputTokens || 0) - cacheReadTokens - cacheCreationTokens;
            const estimatedCostUsd = (
              Math.max(0, billableInputTokens) * costIn +
              cacheReadTokens * (costIn * 0.10) +
              cacheCreationTokens * (costIn * 1.25) +
              (data.outputTokens || 0) * costOut
            ) / 1_000_000;
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
              estimatedCostUsd,
              seed: seed !== undefined ? seed : undefined,
              userId: req.user?.id,
              ragChunks: ragChunks.length > 0 ? JSON.stringify(ragChunks.map(c => ({ citation: c.citation, relevance: c.relevanceScore }))) : undefined,
              systemPromptVersionId,
            });
            // Update per-user monthly usage (team mode only)
            if (process.env.DEPLOYMENT_MODE === 'team' && req.user && req.user.id !== 'solo') {
              try {
                const yearMonth = new Date().toISOString().slice(0, 7);
                const usageId = crypto.randomUUID();
                db.prepare(`
                  INSERT INTO user_monthly_usage (id, user_id, year_month, input_tokens, output_tokens)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(user_id, year_month) DO UPDATE SET
                    input_tokens = input_tokens + excluded.input_tokens,
                    output_tokens = output_tokens + excluded.output_tokens
                `).run(usageId, req.user.id, yearMonth, data.inputTokens || 0, data.outputTokens || 0);
              } catch {
                // Non-fatal
              }
            }
            // Quality auto-scoring (non-fatal fire-and-forget) — always run; fall back to 'open-chat' module
            if (data.text && data.text.length > 200) {
              ratchet.scoreOutput({ content: data.text, moduleId: moduleId || 'open-chat', areaId, sessionId, anthropicClient: anthropic })
                .catch(() => {});
            }
            // Persist the settings that produced this output so history shows accurate config
            try {
              db.prepare('UPDATE sessions SET config = ?, updated_at = ? WHERE id = ?')
                .run(JSON.stringify(configSnapshot), new Date().toISOString(), sessionId);
            } catch { /* non-fatal */ }
            // Auto-save version snapshot
            if (sessionId && data.text && data.text.length > 100) {
              try {
                const last = db.prepare('SELECT MAX(version_number) as max_v FROM versions WHERE entity_type=? AND entity_id=?')
                  .get('session', sessionId) as { max_v: number | null };
                db.prepare('INSERT INTO versions (entity_type, entity_id, version_number, label, content) VALUES (?,?,?,?,?)')
                  .run('session', sessionId, (last?.max_v ?? 0) + 1, `Auto v${(last?.max_v ?? 0) + 1}`, data.text);
              } catch { /* non-fatal */ }
            }
            // Apprentice progression
            if (moduleId) {
              try {
                const uid = req.user?.id || 'default';
                const p = db.prepare('SELECT * FROM apprentice_profiles WHERE user_id=? AND module_id=?')
                  .get(uid, moduleId) as any;
                if (!p) {
                  db.prepare('INSERT OR IGNORE INTO apprentice_profiles (user_id,module_id,area_id,sessions_completed,last_session) VALUES (?,?,?,1,?)')
                    .run(uid, moduleId, areaId || null, new Date().toISOString());
                } else {
                  const newCount = p.sessions_completed + 1;
                  db.prepare('UPDATE apprentice_profiles SET sessions_completed=?,last_session=? WHERE id=?')
                    .run(newCount, new Date().toISOString(), p.id);
                  const s = p.stage;
                  if (s === 'observer' && newCount >= 3)
                    db.prepare("UPDATE apprentice_profiles SET stage='guided',promoted_to_guided=? WHERE id=?").run(new Date().toISOString(), p.id);
                  else if (s === 'guided' && newCount >= 8 && (p.quality_avg ?? 0) >= 7.0)
                    db.prepare("UPDATE apprentice_profiles SET stage='supervised',promoted_to_supervised=? WHERE id=?").run(new Date().toISOString(), p.id);
                  else if (s === 'supervised' && newCount >= 20 && (p.quality_avg ?? 0) >= 8.0)
                    db.prepare("UPDATE apprentice_profiles SET stage='autonomous',promoted_to_autonomous=? WHERE id=?").run(new Date().toISOString(), p.id);
                }
              } catch { /* non-fatal */ }
            }
            // Auto-extract knowledge atoms from this session output (non-blocking fire-and-forget)
            // This populates Knowledge Graph, Intelligence Dashboard, and Pattern Detection
            // Skipped when user disables atom collection (playground / clean-slate mode)
            if (atomCollectionEnabled !== false && data.text && data.text.length > 200) {
              try {
                const workflowId = `module:${moduleId || 'general'}`;
                const outputId = getSessionOutputStore().storeOutput({
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
                getAtomExtractor().extractAtoms(outputId).catch(() => {});
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

      // TOKEN-02: pre-flight token validation — reject before calling Claude API
      // Dynamic limit: Opus/Sonnet 4.6 = 900k (1M - 100k output reserve), Haiku = 180k, others = 128k
      const MAX_CONTEXT_TOKENS = Number(process.env.MAX_CONTEXT_TOKENS) || 900_000;
      if (resolved.tokenEstimate > MAX_CONTEXT_TOKENS) {
        res.status(400).json({
          error: `Context too large: estimated ${resolved.tokenEstimate.toLocaleString()} tokens exceeds the ${MAX_CONTEXT_TOKENS.toLocaleString()} token limit. ` +
                 `Reduce the number of loaded documents, use Summary mode for online references, or deselect some knowledge sources.`,
          code: 'CONTEXT_TOO_LARGE',
          tokenEstimate: resolved.tokenEstimate,
          limit: MAX_CONTEXT_TOKENS,
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
        // 1M context: Opus 4.6 / Sonnet 4.6 = GA (no beta header needed at all).
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

        // Save IRE output to session (was previously skipped — IRE work didn't appear in My Work)
        if (onComplete && ireSummary.synthesisText) {
          onComplete({
            text: ireSummary.synthesisText,
            thinking: '',
            inputTokens: ireSummary.totalInputTokens || 0,
            outputTokens: ireSummary.totalOutputTokens || 0,
          });
        }

        // Quality auto-scoring for IRE outputs (fire-and-forget)
        if (ireSummary.synthesisText && ireSummary.synthesisText.length > 200) {
          ratchet.scoreOutput({
            content: ireSummary.synthesisText,
            moduleId: moduleId || 'open-chat',
            areaId,
            sessionId,
            anthropicClient: anthropic || getClient(),
          }).catch(() => {});
        }
        return;
      }

      // Build compaction config for supported models (Opus 4.6 / Sonnet 4.6)
      // Respect the user's preference from Settings — compactionEnabled defaults to true
      const compactionConfig = compactionEnabled !== false
        ? buildCompactionConfig(selectedModel, 'interactive')
        : null;
      const compactionParam = compactionConfig?.enabled
        ? { enabled: true, triggerThreshold: compactionConfig.triggerThreshold, pauseAfterCompaction: compactionConfig.pauseAfterCompaction }
        : undefined;

      await streamToResponse(
          {
            model: selectedModel as 'claude-opus-4-6' | 'claude-sonnet-4-6' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001',
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
          } else if (provider === 'ollama') {
            // Strip the 'ollama:' prefix to get the bare Ollama model name
            const ollamaModel = selectedModel.replace(/^ollama:/, '');
            result = await streamOllama({ model: ollamaModel, system: composedPrompt, messages: plainMessages, temperature, maxTokens }, res);
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
      const userProfile = db
        .prepare('SELECT * FROM user_profiles WHERE id = ?')
        .get('default') as Record<string, string | null> | undefined;

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
        model: model || 'claude-opus-4-6',
      });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // GET /api/claude/models — available models with metadata (legacy, Anthropic-only)
  router.get('/claude/models', (_req, res) => {
    res.json([
      {
        id: 'claude-opus-4-6',
        label: 'Claude Opus 4.6',
        description: 'Most capable. Best for complex analysis, large documents, nuanced reasoning.',
        recommended: true,
        costPerMInputTokens: 5,
        costPerMOutputTokens: 25,
      },
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        description: 'Fast and highly capable. Excellent for drafting, coding, and structured analysis.',
        costPerMInputTokens: 3,
        costPerMOutputTokens: 15,
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        label: 'Claude Sonnet 4.5',
        description: 'Balanced speed and quality. Good for drafting, summarising, and routine analysis.',
        costPerMInputTokens: 3,
        costPerMOutputTokens: 15,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        label: 'Claude Haiku 4.5',
        description: 'Fastest and most affordable. Best for simple questions and quick lookups.',
        costPerMInputTokens: 0.80,
        costPerMOutputTokens: 4,
      },
      {
        id: 'mistral-large-latest',
        label: 'Mistral Large',
        description: 'Mistral flagship. Strong multilingual and reasoning capabilities.',
        costPerMInputTokens: 0.50,
        costPerMOutputTokens: 1.50,
      },
      {
        id: 'mistral-small-latest',
        label: 'Mistral Small',
        description: 'Lightweight Mistral model. Fast and cost-effective for simple tasks.',
        costPerMInputTokens: 0.10,
        costPerMOutputTokens: 0.30,
      },
    ]);
  });

  // GET /api/ollama/models — list locally running Ollama models (no auth required for health check)
  router.get('/ollama/models', async (_req, res) => {
    const models = await listOllamaModels();
    res.json({ models });
  });

  // GET /api/claude/models-all — all models from MODEL_REGISTRY with key availability
  router.get('/claude/models-all', (_req, res) => {
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
      const validModels = ['claude-opus-4-6', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'] as const;
      type SyncModel = typeof validModels[number];
      const syncModel: SyncModel = (validModels as readonly string[]).includes(selectedModel)
        ? (selectedModel as SyncModel)
        : 'claude-sonnet-4-5-20250929';

      // Resolve knowledge sources (no file paths for sync/MCP calls)
      const resolved = knowledgeSources
        ? await resolveKnowledgeSources(knowledgeSources, [])
        : { systemPromptAdditions: '', contextDocuments: '', tools: [], tokenEstimate: 0, sourceManifest: [] };

      // WP-11: Load user profile for prompt personalisation
      const userProfile = db
        .prepare('SELECT * FROM user_profiles WHERE id = ?')
        .get('default') as Record<string, string | null> | undefined;

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
        ['claude-opus-4-6', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'].includes(model || '')
          ? model
          : 'claude-sonnet-4-5-20250929'
      ) as 'claude-opus-4-6' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001';

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
      const userProfile = db
        .prepare('SELECT * FROM user_profiles WHERE id = ?')
        .get('default') as Record<string, string | null> | undefined;

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
          db.prepare(
            `INSERT OR IGNORE INTO messages (id, session_id, role, content, created_at)
             VALUES (?, ?, 'user', ?, ?)`
          ).run(crypto.randomUUID(), sessionId, synthesisText, new Date().toISOString());
        } catch { /* non-fatal */ }
      }

      res.write('data: [DONE]\n\n');
      res.end();

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
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
  router.post('/modules/smart-search', async (req, res) => {
    if (!isApiKeyConfigured()) {
      res.status(503).json({ error: 'API key not configured' });
      return;
    }

    const { query, modules } = req.body as {
      query?: string;
      modules?: Array<{ id: string; label: string; description: string }>;
    };

    if (!query?.trim() || !Array.isArray(modules) || modules.length === 0) {
      res.status(400).json({ error: 'query and modules are required' });
      return;
    }

    try {
      const client = getClient();
      const moduleList = modules
        .slice(0, 120)
        .map(m => `- ${m.id}: ${m.label} — ${m.description}`)
        .join('\n');

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
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

  // GET /api/revelation-chains/:chainId — fetch a full revelation chain with steps
  router.get('/revelation-chains/:chainId', (req, res) => {
    const { chainId } = req.params;
    if (!chainId || typeof chainId !== 'string') {
      res.status(400).json({ error: 'chainId required' });
      return;
    }
    const chain = getRevelationChain(db, chainId);
    if (!chain) {
      res.status(404).json({ error: 'Revelation chain not found' });
      return;
    }
    res.json(chain);
  });

  return router;
}
