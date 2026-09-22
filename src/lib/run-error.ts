/**
 * A failed run is not an answer.
 *
 * useClaude records a failure as an assistant bubble beginning "⚠️ Error:".
 * Until 2026-09-22 the module page treated that bubble as output: the raw
 * provider JSON (request id and all) was offered for .docx/.pdf/.xlsx export,
 * the transform panel, approval and rating, and was saved as an output
 * version. These helpers let every surface tell the two apart, and turn the
 * provider's words into what the person can do about it.
 */
import type { Message } from '@/lib/types';

export const ERROR_BUBBLE_PREFIX = '⚠️ Error:';

export function isErrorMessage(msg: Pick<Message, 'role' | 'content'> | null | undefined): boolean {
  return !!msg && msg.role === 'assistant' && msg.content.startsWith(ERROR_BUBBLE_PREFIX);
}

/** The provider's own sentence out of `400 {"type":"error","error":{"message":"…"}}`, else the raw text. */
function providerMessage(raw: string): string {
  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as { error?: { message?: unknown } | string; message?: unknown };
      const inner = typeof parsed.error === 'object' && parsed.error ? parsed.error.message : parsed.error ?? parsed.message;
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
    } catch { /* not JSON — fall through */ }
  }
  return raw.trim();
}

/** The bubble text for a failed run: what happened, what to do, then the provider's words. */
export function describeRunError(raw: string): string {
  const detail = providerMessage(raw);
  const lower = detail.toLowerCase();
  let advice: string;
  if (lower.includes('credit balance is too low') || lower.includes('insufficient_quota') || lower.includes('billing')) {
    advice = 'The API key for this model has no credit left. Choose a model marked "Subscription" in the model picker, or add credit to the key.';
  } else if (lower.includes('too many requests') || lower.includes('rate limit') || lower.includes('429')) {
    advice = 'Too many requests in a short time. Wait a minute and run again.';
  } else if (lower.includes('api key') && (lower.includes('missing') || lower.includes('not set') || lower.includes('invalid') || lower.includes('add '))) {
    advice = 'This model needs an API key that is not configured. Choose a model marked "Subscription", or add the key in Settings.';
  } else if (lower.includes('sdk') && lower.includes('disabled')) {
    advice = 'The subscription engine is switched off. Turn it on in Settings → Execution engines, or choose another model.';
  } else if (lower.includes('overloaded') || lower.includes('529') || lower.includes('503')) {
    advice = 'The model provider is busy right now. Run again in a moment.';
  } else {
    advice = 'The run did not complete. Nothing was saved as output.';
  }
  return `${ERROR_BUBBLE_PREFIX} ${advice}\n\nDetails: ${detail}`;
}
