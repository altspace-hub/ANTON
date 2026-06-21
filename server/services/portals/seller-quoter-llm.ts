/**
 * seller-quoter-llm.ts — the production QuoteLLM: a single non-streaming
 * structured call via provider-router.callChat. Kept OUT of seller-quoter.ts so
 * the quoter core stays pure (no provider-router / DB import) and unit-testable
 * with a stub. The handler injects this impl; tests inject a stub.
 *
 * A price quote is a short structured task → default to the cheap Haiku tier
 * (overridable via ANTON_AUTOQUOTE_MODEL). temperature 0 + jsonMode for a
 * deterministic JSON object; the quoter re-validates + clamps everything anyway.
 */
import type { DatabaseAdapter } from '../../db/database.js';
import { callChat, mapModelToProvider } from '../provider-router.js';
import type { QuoteLLM } from './seller-quoter.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export function createCallChatQuoteLLM(db: DatabaseAdapter): QuoteLLM {
  const model = (process.env.ANTON_AUTOQUOTE_MODEL || DEFAULT_MODEL).trim();
  return {
    async propose({ systemPrompt, userPrompt }) {
      const res = await callChat({
        model: mapModelToProvider(model),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 800,
        temperature: 0,
        jsonMode: true,
        db,
      });
      const parsed = extractJson(res.text);
      if (!parsed || typeof parsed.priceFtc !== 'number') {
        throw new Error('auto-quote LLM did not return a priceFtc');
      }
      return {
        priceFtc: parsed.priceFtc,
        ...(typeof parsed.available === 'boolean' ? { available: parsed.available } : {}),
        ...(typeof parsed.note === 'string' ? { note: parsed.note } : {}),
      };
    },
  };
}

/** Parse the first JSON object out of the model's text (tolerates fences/prose). */
function extractJson(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { /* try to slice */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { /* give up */ }
  }
  return null;
}
