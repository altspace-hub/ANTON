/**
 * intent-router.ts
 * Two-pass query classification: keyword matching → LLM fallback → default.
 * Resolves user queries to ANTON areas/modules for the companion app.
 */

import type { DatabaseAdapter } from '../db/database.js';

export interface IntentResolution {
  areaId: string | null;
  moduleId: string | null;
  suggestedPersonaId?: string;
  confidence: number;
  reasoning?: string;
}

interface IntentCategory {
  id: string;
  name: string;
  description: string | null;
  allowed_areas: string[];
  allowed_modules: string[];
  default_module_id: string | null;
  persona_id: string | null;
  priority: number;
}

// ── Keyword patterns for fast matching ───────────────────────────────────────
// Maps keywords to { areaId, moduleId } — populated from AREAS/MODULES constants
const KEYWORD_MAP: Array<{ keywords: string[]; areaId: string; moduleId: string }> = [
  // FCP
  { keywords: ['aml', 'anti-money', 'laundering', 'kyc', 'know your customer', 'due diligence', 'sanctions'], areaId: 'fcp', moduleId: 'fcp-compliance' },
  { keywords: ['fraud', 'financial crime', 'suspicious', 'sar', 'str'], areaId: 'fcp', moduleId: 'fcp-fraud' },
  // Legal
  { keywords: ['legal', 'law', 'regulation', 'statute', 'contract', 'clause', 'liability'], areaId: 'legal', moduleId: 'legal-analysis' },
  { keywords: ['gdpr', 'privacy', 'data protection', 'consent'], areaId: 'legal', moduleId: 'legal-privacy' },
  // Consulting
  { keywords: ['strategy', 'consulting', 'advisory', 'business plan', 'market entry'], areaId: 'consulting', moduleId: 'consulting-strategy' },
  // Risk
  { keywords: ['risk', 'risk assessment', 'risk management', 'mitigation'], areaId: 'risk', moduleId: 'risk-assessment' },
  // Education
  { keywords: ['homework', 'study', 'lesson', 'exam', 'school', 'student', 'teacher', 'curriculum'], areaId: 'education', moduleId: 'education-tutor' },
  // Healthcare
  { keywords: ['health', 'medical', 'patient', 'clinical', 'diagnosis', 'treatment'], areaId: 'healthcare', moduleId: 'healthcare-assist' },
  // HR
  { keywords: ['hr', 'human resources', 'hiring', 'recruitment', 'employee', 'onboarding'], areaId: 'hr', moduleId: 'hr-recruitment' },
  // Finance
  { keywords: ['budget', 'accounting', 'financial', 'tax', 'invoice', 'expense'], areaId: 'accounting', moduleId: 'accounting-analysis' },
];

export function createIntentRouter(db: DatabaseAdapter) {

  /**
   * Pass 1: Keyword matching against query text.
   * Returns confidence 0.0 – 1.0 based on keyword match density.
   */
  function keywordMatch(query: string, allowedAreas: string[], allowedModules: string[]): IntentResolution | null {
    const lowerQuery = query.toLowerCase();
    let bestMatch: { areaId: string; moduleId: string; score: number } | null = null;

    for (const entry of KEYWORD_MAP) {
      // Filter by org's allowed areas/modules if specified
      if (allowedAreas.length > 0 && !allowedAreas.includes(entry.areaId)) continue;
      if (allowedModules.length > 0 && !allowedModules.includes(entry.moduleId)) continue;

      const matchCount = entry.keywords.filter(kw => lowerQuery.includes(kw)).length;
      if (matchCount === 0) continue;

      const score = matchCount / entry.keywords.length;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { areaId: entry.areaId, moduleId: entry.moduleId, score };
      }
    }

    if (bestMatch && bestMatch.score >= 0.3) {
      return {
        areaId: bestMatch.areaId,
        moduleId: bestMatch.moduleId,
        confidence: Math.min(bestMatch.score * 1.2, 0.95), // Scale up slightly, cap at 0.95
      };
    }

    return null;
  }

  /**
   * Pass 2: LLM classification (Haiku — fast, cheap).
   * Only called if keyword confidence < 0.7.
   */
  async function llmClassify(
    query: string,
    intents: IntentCategory[]
  ): Promise<IntentResolution> {
    try {
      const { sendRequest } = await import('./unified-llm-client.js');
      const { getRoutedUtilityModelSync } = await import('./utility-model.js');

      const intentDescriptions = intents.map(i =>
        `- ${i.name}: ${i.description || 'No description'}. Areas: ${i.allowed_areas.join(', ') || 'any'}. Modules: ${i.allowed_modules.join(', ') || 'any'}.`
      ).join('\n');

      const result = await sendRequest({
        // Configured utility model, provider-routed (review 3.8) —
        // classification works on non-Anthropic installs too.
        model: getRoutedUtilityModelSync() as import('../../src/lib/types.js').ModelId,
        thinking: 'quick' as import('../../src/lib/types.js').ThinkingLevel,
        system: `You are an intent classifier. Given a user query and a list of available intent categories, output JSON: { "intentName": "<best match name>", "areaId": "<area or null>", "moduleId": "<module or null>", "confidence": <0.0-1.0>, "reasoning": "<brief>" }. If nothing matches well, set confidence below 0.3.`,
        messages: [
          {
            role: 'user',
            content: `Query: "${query}"\n\nAvailable intents:\n${intentDescriptions}\n\nClassify this query. Respond with JSON only.`,
          },
        ],
      });

      const parsed = JSON.parse(result.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());

      // Find the matching intent to get area/module info
      const matched = intents.find(i => i.name === parsed.intentName);

      return {
        areaId: parsed.areaId || matched?.allowed_areas[0] || null,
        moduleId: parsed.moduleId || matched?.allowed_modules[0] || null,
        suggestedPersonaId: matched?.persona_id || undefined,
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning,
      };
    } catch (err) {
      console.error('[intent-router] LLM classification failed:', err);
      return { areaId: null, moduleId: null, confidence: 0, reasoning: 'LLM classification failed' };
    }
  }

  /**
   * Resolve a query to an area/module using two-pass classification.
   */
  async function resolveIntent(
    query: string,
    orgId: string,
    explicitIntentId?: string
  ): Promise<IntentResolution & { intentCategoryId?: string }> {
    // Load org's intent categories
    const intents = await db.all<{
      id: string;
      name: string;
      description: string | null;
      allowed_areas: string | string[];
      allowed_modules: string | string[];
      default_module_id: string | null;
      persona_id: string | null;
      priority: number;
    }>(
      'SELECT id, name, description, allowed_areas, allowed_modules, default_module_id, persona_id, priority FROM org_intent_categories WHERE org_id = $1 AND is_active = TRUE ORDER BY priority DESC',
      orgId
    );

    const parsedIntents: IntentCategory[] = intents.map(i => ({
      ...i,
      allowed_areas: typeof i.allowed_areas === 'string' ? JSON.parse(i.allowed_areas) : (i.allowed_areas || []),
      allowed_modules: typeof i.allowed_modules === 'string' ? JSON.parse(i.allowed_modules) : (i.allowed_modules || []),
    }));

    // If explicit intent specified, use it directly
    if (explicitIntentId) {
      const intent = parsedIntents.find(i => i.id === explicitIntentId);
      if (intent) {
        return {
          areaId: intent.allowed_areas[0] || null,
          moduleId: intent.default_module_id || intent.allowed_modules[0] || null,
          suggestedPersonaId: intent.persona_id || undefined,
          confidence: 1.0,
          intentCategoryId: intent.id,
        };
      }
    }

    // Collect all allowed areas/modules across intents
    const allAllowedAreas = [...new Set(parsedIntents.flatMap(i => i.allowed_areas))];
    const allAllowedModules = [...new Set(parsedIntents.flatMap(i => i.allowed_modules))];

    // Pass 1: Keyword matching
    const keywordResult = keywordMatch(query, allAllowedAreas, allAllowedModules);
    if (keywordResult && keywordResult.confidence >= 0.7) {
      // Find which intent category this belongs to
      const matchedIntent = parsedIntents.find(i =>
        (i.allowed_areas.length === 0 || i.allowed_areas.includes(keywordResult.areaId!)) &&
        (i.allowed_modules.length === 0 || i.allowed_modules.includes(keywordResult.moduleId!))
      );
      return {
        ...keywordResult,
        suggestedPersonaId: matchedIntent?.persona_id || undefined,
        intentCategoryId: matchedIntent?.id,
      };
    }

    // Pass 2: LLM classification (if intents are configured)
    if (parsedIntents.length > 0) {
      const llmResult = await llmClassify(query, parsedIntents);
      if (llmResult.confidence >= 0.3) {
        const matchedIntent = parsedIntents.find(i =>
          (i.allowed_areas.length === 0 || (llmResult.areaId && i.allowed_areas.includes(llmResult.areaId))) ||
          (i.allowed_modules.length === 0 || (llmResult.moduleId && i.allowed_modules.includes(llmResult.moduleId)))
        );
        return {
          ...llmResult,
          intentCategoryId: matchedIntent?.id,
        };
      }
    }

    // Fallback: use first intent's default, or Brief Me mode
    const defaultIntent = parsedIntents[0];
    return {
      areaId: defaultIntent?.allowed_areas[0] || null,
      moduleId: defaultIntent?.default_module_id || null,
      suggestedPersonaId: defaultIntent?.persona_id || undefined,
      confidence: 0.1,
      reasoning: 'Fallback — no confident match',
      intentCategoryId: defaultIntent?.id,
    };
  }

  return { resolveIntent, keywordMatch };
}
