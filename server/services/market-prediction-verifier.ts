/**
 * market-prediction-verifier.ts
 * Auto-verifies expired predictions against actual market data.
 *
 * Verification strategies:
 * - Directional: compare predicted_direction with actual price movement
 * - Price target: compare predicted_value with actual price
 * - Binary/event: use LLM to verify against recent atoms and news
 *
 * Predictions are verified, Brier scored, and feedback records created.
 */

import type { DatabaseAdapter } from '../db/database.js';

interface ExpiredPrediction {
  id: string;
  title: string;
  prediction_type: string;
  target_symbol: string | null;
  predicted_direction: string | null;
  predicted_outcome: string;
  predicted_value: number | null;
  confidence: number;
  deadline: string;
  created_at: string;
  thesis_id: string | null;
}

interface VerificationResult {
  predictionId: string;
  wasCorrect: boolean;
  actualOutcome: string;
  actualValue: number | null;
  method: 'auto_price' | 'auto_llm' | 'unverifiable';
  verificationConfidence: number;
  explanation: string;
  gradedScore?: number; // 0.0-1.0 grading curve (partial credit for close predictions)
}

export async function createPredictionVerifier(db: DatabaseAdapter) {

  /**
   * Find all active predictions past their deadline.
   */
  async function findExpired(): Promise<ExpiredPrediction[]> {
    const today = new Date().toISOString().split('T')[0];
    return db.all<ExpiredPrediction>(`
      SELECT id, title, prediction_type, target_symbol, predicted_direction,
             predicted_outcome, predicted_value, confidence, deadline, created_at, thesis_id
      FROM market_predictions
      WHERE status = 'active'
        AND deadline IS NOT NULL
        AND deadline < $1
      ORDER BY deadline ASC
    `, today);
  }

  /**
   * Find predictions expiring within the next N days (for visibility/logging).
   */
  async function findNearExpiry(daysAhead = 2): Promise<ExpiredPrediction[]> {
    const today = new Date().toISOString().split('T')[0];
    const future = new Date(Date.now() + daysAhead * 86400000).toISOString().split('T')[0];
    return db.all<ExpiredPrediction>(`
      SELECT id, title, prediction_type, target_symbol, predicted_direction,
             predicted_outcome, predicted_value, confidence, deadline, created_at, thesis_id
      FROM market_predictions
      WHERE status = 'active' AND deadline IS NOT NULL
        AND deadline >= $1 AND deadline <= $2
      ORDER BY deadline ASC
    `, today, future);
  }

  /**
   * Get price at a specific date (or closest available).
   */
  async function getPriceAtDate(symbol: string, date: string): Promise<number | null> {
    const row = await db.get<{ close: number }>(
      `SELECT close FROM market_price_normalized
       WHERE symbol = $1 AND price_date <= $2
       ORDER BY price_date DESC LIMIT 1`,
      symbol, date
    );
    return row?.close ?? null;
  }

  /**
   * Get the latest available price for a symbol.
   */
  async function getLatestPrice(symbol: string): Promise<number | null> {
    const row = await db.get<{ close: number }>(
      `SELECT close FROM market_price_normalized
       WHERE symbol = $1
       ORDER BY price_date DESC LIMIT 1`,
      symbol
    );
    return row?.close ?? null;
  }

  /**
   * Verify a directional prediction (up/down/flat) against actual price movement.
   */
  async function verifyDirectional(pred: ExpiredPrediction): Promise<VerificationResult> {
    if (!pred.target_symbol || !pred.predicted_direction) {
      return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'Unverifiable — no symbol or direction', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: 'Missing target symbol or predicted direction' };
    }

    // Get price at prediction creation and at deadline
    const startPrice = await getPriceAtDate(pred.target_symbol, new Date(pred.created_at).toISOString().split('T')[0]);
    const endPrice = await getPriceAtDate(pred.target_symbol, pred.deadline);

    if (!startPrice || !endPrice) {
      return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'Unverifiable — no price data', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: `No price data for ${pred.target_symbol} at ${new Date(pred.created_at).toISOString().split('T')[0]} or ${pred.deadline}` };
    }

    const pctChange = ((endPrice - startPrice) / startPrice) * 100;
    const absPctChange = Math.abs(pctChange);
    const flatThreshold = 1.5; // ±1.5% considered "flat" (was 3% — too aggressive)

    let actualDirection: string;
    if (pctChange > flatThreshold) actualDirection = 'up';
    else if (pctChange < -flatThreshold) actualDirection = 'down';
    else actualDirection = 'flat';

    // Grading curve: directional predictions get partial/full credit
    // instead of binary correct/wrong
    let wasCorrect: boolean;
    let gradedScore: number; // 0.0 to 1.0

    if (pred.predicted_direction === 'flat') {
      // Flat prediction: correct if within threshold
      wasCorrect = actualDirection === 'flat';
      gradedScore = wasCorrect ? 1.0 : (absPctChange < 3 ? 0.5 : 0.0);
    } else {
      // Directional prediction (up/down)
      const directionCorrect = (pred.predicted_direction === 'up' && pctChange > 0)
                            || (pred.predicted_direction === 'down' && pctChange < 0);
      const strongMove = absPctChange > flatThreshold;

      if (directionCorrect && strongMove) {
        // Clear correct direction + beyond threshold
        wasCorrect = true;
        gradedScore = 1.0;
      } else if (directionCorrect && !strongMove) {
        // Correct direction but small move (within flat zone)
        // Partial credit — direction was right, magnitude was weak
        wasCorrect = true;
        gradedScore = 0.7;
      } else if (!directionCorrect && absPctChange <= flatThreshold) {
        // Wrong direction but move was negligible (essentially flat)
        // Slight penalty — call was wrong but barely
        wasCorrect = false;
        gradedScore = 0.3;
      } else {
        // Wrong direction with clear move
        wasCorrect = false;
        gradedScore = 0.0;
      }
    }

    const explanation = `${pred.target_symbol}: ${startPrice.toFixed(2)} → ${endPrice.toFixed(2)} (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%). Predicted: ${pred.predicted_direction}, Actual: ${actualDirection}. Grade: ${(gradedScore * 100).toFixed(0)}%`;

    return {
      predictionId: pred.id,
      wasCorrect,
      actualOutcome: `${actualDirection} (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%)`,
      actualValue: endPrice,
      method: 'auto_price',
      verificationConfidence: 0.9,
      explanation,
      gradedScore, // Used for Brier score calculation
    };
  }

  /**
   * Verify a price target prediction.
   */
  async function verifyPriceTarget(pred: ExpiredPrediction): Promise<VerificationResult> {
    if (!pred.target_symbol || !pred.predicted_value) {
      return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'Unverifiable', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: 'Missing symbol or target value' };
    }

    const actualPrice = await getPriceAtDate(pred.target_symbol, pred.deadline);
    if (!actualPrice) {
      return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'No price data', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: `No price data for ${pred.target_symbol}` };
    }

    const errorPct = Math.abs((actualPrice - pred.predicted_value) / pred.predicted_value) * 100;
    const wasCorrect = errorPct <= 10; // Within 10% = correct

    return {
      predictionId: pred.id,
      wasCorrect,
      actualOutcome: `Actual: $${actualPrice.toFixed(2)} vs predicted: $${pred.predicted_value.toFixed(2)} (${errorPct.toFixed(1)}% error)`,
      actualValue: actualPrice,
      method: 'auto_price',
      verificationConfidence: 0.9,
      explanation: `Price target ${wasCorrect ? 'hit' : 'missed'}: predicted $${pred.predicted_value.toFixed(2)}, actual $${actualPrice.toFixed(2)} (${errorPct.toFixed(1)}% off)`,
    };
  }

  /**
   * Verify a binary/event prediction using LLM against recent atoms.
   */
  async function verifyBinary(pred: ExpiredPrediction): Promise<VerificationResult> {
    try {
      // Gather recent atoms about the entity
      const recentAtoms = await db.all<{ content: string }>(
        `SELECT a.content FROM market_atoms a
         JOIN market_atom_entity_links l ON l.atom_id = a.id
         JOIN market_entities e ON e.id = l.entity_id
         WHERE e.symbol = $1 AND a.created_at > $2
         ORDER BY a.created_at DESC LIMIT 15`,
        pred.target_symbol || '', pred.created_at
      );

      if (recentAtoms.length === 0) {
        return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'Unverifiable — no recent data', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: 'No recent atoms to verify against' };
      }

      const { streamToHandler } = await import('./unified-llm-client.js');

      const context = [
        `PREDICTION: "${pred.title}"`,
        `Predicted outcome: ${pred.predicted_outcome}`,
        `Deadline: ${pred.deadline}`,
        `Symbol: ${pred.target_symbol || 'N/A'}`,
        '',
        `RECENT MARKET INTELLIGENCE (${recentAtoms.length} atoms):`,
        ...recentAtoms.map(a => `- ${a.content.slice(0, 200)}`),
      ].join('\n');

      const result = await new Promise<{ text: string }>((resolve, reject) => {
        let text = '';
        streamToHandler(
          {
            model: 'claude-haiku-4-5-20251001' as import('../../src/lib/types.js').ModelId,
            thinking: 'quick' as import('../../src/lib/types.js').ThinkingLevel,
            system: 'You verify market predictions. Given a prediction and recent market data, determine if the prediction was correct. Respond ONLY with JSON: { "wasCorrect": true/false, "actualOutcome": "brief description", "explanation": "1-2 sentences", "verificationConfidence": 0.0-1.0 }',
            messages: [{ role: 'user', content: context }],
            maxTokens: 500,
          },
          (event) => {
            const evt = event as Record<string, unknown>;
            if (evt.type === 'content_block_delta') {
              const delta = evt.delta as Record<string, unknown>;
              if (delta?.type === 'text_delta' && delta.text) text += delta.text;
            }
          },
          (completion) => resolve({ text: completion.text || text })
        ).catch(reject);
      });

      const cleaned = result.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        predictionId: pred.id,
        wasCorrect: !!parsed.wasCorrect,
        actualOutcome: parsed.actualOutcome || 'LLM-verified',
        actualValue: null,
        method: 'auto_llm',
        verificationConfidence: parsed.verificationConfidence || 0.6,
        explanation: parsed.explanation || 'Verified via AI analysis of recent market data',
      };
    } catch (err) {
      console.error(`[verifier] Binary verification failed for ${pred.id}:`, err);
      return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'Verification failed', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: 'AI verification failed' };
    }
  }

  /**
   * Verify a single prediction using the appropriate strategy.
   */
  async function verifyPrediction(pred: ExpiredPrediction): Promise<VerificationResult> {
    switch (pred.prediction_type) {
      case 'directional':
        return verifyDirectional(pred);
      case 'price_target':
        return verifyPriceTarget(pred);
      case 'binary':
      case 'event':
        return verifyBinary(pred);
      default:
        // Try directional first (most common), then binary
        if (pred.predicted_direction) return verifyDirectional(pred);
        return verifyBinary(pred);
    }
  }

  /**
   * Run auto-verification on all expired predictions.
   */
  async function runAutoVerification(): Promise<{
    verified: number;
    unverifiable: number;
    correct: number;
    incorrect: number;
    results: VerificationResult[];
  }> {
    const expired = await findExpired();
    console.log(`[verifier] Found ${expired.length} expired predictions to verify`);

    const results: VerificationResult[] = [];
    let verified = 0, unverifiable = 0, correct = 0, incorrect = 0;

    for (const pred of expired) {
      const result = await verifyPrediction(pred);
      results.push(result);

      if (result.method === 'unverifiable') {
        unverifiable++;
        // Mark as unverifiable so we don't retry every night
        await db.run(
          `UPDATE market_predictions SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          pred.id
        );
        continue;
      }

      // Apply the verification — use graded score for better calibration
      const predicted = pred.confidence;
      const actual = result.gradedScore ?? (result.wasCorrect ? 1 : 0);
      const brierScore = (predicted - actual) ** 2;

      await db.run(`
        UPDATE market_predictions SET
          actual_outcome = $1, actual_value = $2, was_correct = $3,
          brier_score = $4, status = 'validated', validated_at = NOW(), updated_at = NOW()
        WHERE id = $5
      `, result.actualOutcome, result.actualValue, result.wasCorrect ? 1 : 0, brierScore, pred.id);

      // Create feedback record
      await db.run(`
        INSERT INTO market_prediction_feedback (prediction_id, feedback_type, predicted_value, actual_value,
                                                 accuracy_score, explanation, lessons_learned)
        VALUES ($1, 'auto_verification', $2, $3, $4, $5, $6)
      `, pred.id, pred.predicted_value, result.actualValue,
         1 - brierScore, `[${result.method}] ${result.explanation}`, null);

      verified++;
      if (result.wasCorrect) correct++;
      else incorrect++;

      // Update parent thesis confidence based on prediction outcome
      if (pred.thesis_id) {
        try {
          const thesis = await db.get<{ confidence: number }>(
            'SELECT confidence FROM market_theses WHERE id = ?', pred.thesis_id
          );
          if (thesis) {
            // Blend: correct predictions boost confidence, wrong ones reduce it
            const factor = result.wasCorrect ? 1.1 : 0.8;
            const newConf = Math.max(0.05, Math.min(0.95, thesis.confidence * factor));
            await db.run(
              'UPDATE market_theses SET confidence = ?, updated_at = NOW() WHERE id = ?',
              newConf, pred.thesis_id
            );
            // Auto-invalidate thesis if confidence drops below 0.15
            if (newConf < 0.15) {
              await db.run(
                "UPDATE market_theses SET status = 'invalidated', updated_at = NOW() WHERE id = ? AND status IN ('active', 'monitoring')",
                pred.thesis_id
              );
              console.log(`[verifier] Thesis ${pred.thesis_id} auto-invalidated (confidence dropped to ${newConf.toFixed(2)})`);
            }
          }
        } catch { /* non-fatal */ }
      }

      console.log(`[verifier] ${pred.target_symbol || '?'} "${pred.title}" → ${result.wasCorrect ? 'CORRECT' : 'WRONG'} (${result.method})`);

      // Brief pause between verifications
      if (expired.length > 3) await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`[verifier] Done: ${verified} verified (${correct} correct, ${incorrect} wrong), ${unverifiable} unverifiable`);
    return { verified, unverifiable, correct, incorrect, results };
  }

  return { findExpired, findNearExpiry, verifyPrediction, runAutoVerification };
}
