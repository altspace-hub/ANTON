/**
 * market-why-chain-executor.ts
 * Executes why-chain analysis on failed/anomalous predictions.
 * Uses iterative "5 Whys" technique with AI to find root causes.
 *
 * Flow: Load prediction context → Ask "Why did this fail?" → Analyze answer →
 *       Ask deeper "Why?" → Repeat until root cause found (max 5 levels) →
 *       Summarize root cause → Create atoms → Update chain
 */

import type { DatabaseAdapter } from '../db/database.js';
import { createMarketWhyChainsService } from './market-why-chains-service.js';

const MAX_LEVELS = 5;
const ROOT_CAUSE_CONFIDENCE_THRESHOLD = 0.8;

const WHY_CHAIN_SYSTEM_PROMPT = `You are ANTON's market intelligence failure analyst. You investigate why market predictions went wrong using the "5 Whys" root cause analysis technique.

Your goal: Find the REAL root cause, not just surface-level explanations.

Rules:
1. Each level must go DEEPER than the last — don't repeat or rephrase
2. Consider: data quality, assumption errors, timing, external shocks, model blind spots
3. Distinguish between: prediction logic error vs. unforeseeable event vs. data gap
4. Be specific — name exact data points, dates, market events
5. When you've found the root cause, say "ROOT CAUSE IDENTIFIED" and explain what should change

Response format (JSON):
{
  "answer": "Your analysis of why this happened (2-3 paragraphs)",
  "level_type": "symptom" | "mechanism" | "structural" | "root_cause",
  "confidence_root_found": 0.0 to 1.0,
  "next_question": "The deeper Why question to ask next (null if root cause found)",
  "key_insight": "One-sentence summary of this level's finding",
  "blind_spots": ["any analytical blind spots identified"],
  "process_improvements": ["suggestions for improving future predictions"]
}`;

export async function createWhyChainExecutor(db: DatabaseAdapter) {
  const whyChainsService = await createMarketWhyChainsService(db);

  /**
   * Execute a single why-chain to completion.
   * Iteratively asks "Why?" until root cause is found or max depth reached.
   */
  async function executeChain(chainId: string): Promise<{
    success: boolean;
    levels: number;
    rootCauseFound: boolean;
    summary: string;
  }> {
    // Load chain with linked prediction
    const chain = await db.get<{
      id: string; prediction_id: string; investigation_id: string;
      title: string; num_levels: number; status: string;
    }>('SELECT * FROM market_why_chains WHERE id = $1', chainId);

    if (!chain || chain.status === 'completed') {
      return { success: false, levels: 0, rootCauseFound: false, summary: 'Chain not found or already completed' };
    }

    // Load the failed prediction
    const prediction = await db.get<{
      title: string; description: string; target_symbol: string;
      predicted_direction: string; predicted_outcome: string; predicted_value: number;
      confidence: number; actual_outcome: string; actual_value: number;
      time_horizon_days: number; key_assumptions: string;
    }>('SELECT * FROM market_predictions WHERE id = $1', chain.prediction_id);

    if (!prediction) {
      return { success: false, levels: 0, rootCauseFound: false, summary: 'Prediction not found' };
    }

    // Load related atoms for context
    const relatedAtoms = await db.all<{ content: string; category: string; confidence: number }>(
      `SELECT a.content, a.category, a.confidence
       FROM market_atoms a
       JOIN market_atom_entity_links l ON l.atom_id = a.id
       JOIN market_entities e ON e.id = l.entity_id
       WHERE e.symbol = $1
       ORDER BY a.created_at DESC LIMIT 10`,
      prediction.target_symbol || ''
    );

    // Build initial context
    const predictionContext = [
      `PREDICTION: ${prediction.title}`,
      `Symbol: ${prediction.target_symbol || 'N/A'}`,
      `Direction: ${prediction.predicted_direction || 'N/A'}`,
      `Predicted outcome: ${prediction.predicted_outcome || 'N/A'}`,
      `Predicted value: ${prediction.predicted_value || 'N/A'}`,
      `Confidence: ${prediction.confidence}`,
      `Actual outcome: ${prediction.actual_outcome || 'Unknown'}`,
      `Actual value: ${prediction.actual_value || 'Unknown'}`,
      `Time horizon: ${prediction.time_horizon_days} days`,
      `Description: ${prediction.description}`,
      '',
      `RELATED INTELLIGENCE (${relatedAtoms.length} recent atoms):`,
      ...relatedAtoms.slice(0, 5).map(a => `- [${a.category}] ${a.content.slice(0, 150)}`),
    ].join('\n');

    console.log(`[why-chain] Executing chain ${chainId} for prediction: ${prediction.title}`);

    // Iterative "Why?" loop
    let currentQuestion = `Why did this prediction fail? The prediction "${prediction.title}" (confidence ${prediction.confidence}) was marked incorrect.\n\n${predictionContext}`;
    let levelsCompleted = 0;
    let rootCauseFound = false;
    let allInsights: string[] = [];
    let allBlindSpots: string[] = [];
    let allImprovements: string[] = [];

    for (let level = 1; level <= MAX_LEVELS; level++) {
      try {
        // Use streamToHandler to get the response — dispatches by model id
        // across providers, including the sdk:/codex: subscription engines.
        const { streamToHandler } = await import('./unified-llm-client.js');
        const { getMarketsModel } = await import('./markets-model-store.js');
        const whyChainModel = await getMarketsModel(db);

        const result = await new Promise<{ text: string }>((resolve, reject) => {
          let text = '';
          streamToHandler(
            {
              model: whyChainModel as import('../../src/lib/types.js').ModelId,
              thinking: 'think' as import('../../src/lib/types.js').ThinkingLevel,
              system: WHY_CHAIN_SYSTEM_PROMPT,
              messages: [{ role: 'user', content: currentQuestion }],
              maxTokens: 2000,
            },
            (event) => {
              const evt = event as Record<string, unknown>;
              if (evt.type === 'content_block_delta') {
                const delta = evt.delta as Record<string, unknown>;
                if (delta?.type === 'text_delta' && delta.text) text += delta.text;
              }
            },
            (completion) => { resolve({ text: completion.text || text }); }
          ).catch(reject);
        });

        console.log(`[why-chain] Level ${level} AI response: ${result.text.length} chars`);

        // Parse AI response
        let parsed: {
          answer: string;
          level_type: string;
          confidence_root_found: number;
          next_question: string | null;
          key_insight: string;
          blind_spots: string[];
          process_improvements: string[];
        };

        try {
          const cleaned = result.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleaned);
        } catch {
          // If JSON parsing fails, treat the whole response as the answer
          parsed = {
            answer: result.text,
            level_type: level >= 4 ? 'root_cause' : 'symptom',
            confidence_root_found: level >= 4 ? 0.8 : 0.3,
            next_question: null,
            key_insight: result.text.slice(0, 100),
            blind_spots: [],
            process_improvements: [],
          };
        }

        // Record this level
        await whyChainsService.addLevel(chainId, {
          question: currentQuestion.slice(0, 2000),
          answer: parsed.answer,
          levelType: parsed.level_type,
          evidenceAtoms: relatedAtoms.slice(0, 3).map((_, i) => `atom_${i}`),
        });

        levelsCompleted = level;
        allInsights.push(parsed.key_insight || '');
        allBlindSpots.push(...(parsed.blind_spots || []));
        allImprovements.push(...(parsed.process_improvements || []));

        console.log(`[why-chain] Level ${level}: ${parsed.level_type} (root confidence: ${parsed.confidence_root_found})`);

        // Check if root cause found
        if (parsed.confidence_root_found >= ROOT_CAUSE_CONFIDENCE_THRESHOLD || parsed.level_type === 'root_cause' || !parsed.next_question) {
          rootCauseFound = true;

          // Complete the chain
          await whyChainsService.completeChain(chainId, {
            rootCauseType: parsed.level_type,
            rootCauseDescription: parsed.answer,
            rootCauseSummary: parsed.key_insight,
            impactAssessment: `Prediction "${prediction.title}" failed due to: ${parsed.key_insight}`,
            systemicImpact: allImprovements.length > 0 ? allImprovements.join('; ') : null,
            blindSpotsIdentified: [...new Set(allBlindSpots)],
            processImprovements: [...new Set(allImprovements)],
          } as Parameters<typeof whyChainsService.completeChain>[1]);

          console.log(`[why-chain] Root cause found at level ${level}: ${parsed.key_insight}`);
          break;
        }

        // Prepare next level question
        currentQuestion = `Previous analysis: "${parsed.answer}"\n\nGoing deeper: ${parsed.next_question}\n\nPrediction context: ${prediction.title} (${prediction.target_symbol}, confidence ${prediction.confidence})`;
      } catch (err) {
        console.error(`[why-chain] Level ${level} failed:`, err instanceof Error ? err.message : err);
        break;
      }
    }

    // If we hit max levels without root cause, complete anyway
    if (!rootCauseFound && levelsCompleted > 0) {
      await whyChainsService.completeChain(chainId, {
        rootCauseType: 'inconclusive',
        rootCauseDescription: 'Max analysis depth reached without definitive root cause',
        rootCauseSummary: allInsights.join(' → '),
        blindSpotsIdentified: [...new Set(allBlindSpots)],
        processImprovements: [...new Set(allImprovements)],
      } as Parameters<typeof whyChainsService.completeChain>[1]);
    }

    const summary = rootCauseFound
      ? `Root cause found at level ${levelsCompleted}: ${allInsights[allInsights.length - 1]}`
      : `Analysis reached ${levelsCompleted} levels without definitive root cause`;

    return { success: true, levels: levelsCompleted, rootCauseFound, summary };
  }

  /**
   * Execute all pending why-chains.
   */
  async function executeAllPending(): Promise<{ executed: number; results: Array<{ chainId: string; success: boolean; summary: string }> }> {
    // Cap per run: each chain burns up to MAX_LEVELS LLM calls, and the
    // weekend validation pass can queue dozens of chains at once. The rest
    // stay pending and drain on subsequent runs.
    const pending = await db.all<{ id: string }>(
      "SELECT id FROM market_why_chains WHERE status = 'in_progress' AND num_levels = 0 ORDER BY created_at ASC LIMIT 10"
    );

    console.log(`[why-chain] Found ${pending.length} pending chains to execute (capped at 10/run)`);

    const results: Array<{ chainId: string; success: boolean; summary: string }> = [];

    for (const chain of pending) {
      const result = await executeChain(chain.id);
      results.push({ chainId: chain.id, success: result.success, summary: result.summary });

      // Brief pause between chains to avoid API rate limits
      if (pending.length > 1) await new Promise(r => setTimeout(r, 2000));
    }

    return { executed: results.length, results };
  }

  return { executeChain, executeAllPending };
}
