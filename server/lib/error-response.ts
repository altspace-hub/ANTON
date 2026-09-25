/**
 * Safe error message helper.
 *
 * In production, returns a generic message to avoid leaking implementation
 * details (stack traces, file paths, SQL, etc.) to API consumers.
 * In development / test, returns the actual error message for easier debugging.
 */
export function safeError(err: unknown): string {
  if (process.env.NODE_ENV === 'production') return 'An error occurred';
  return err instanceof Error ? err.message : String(err);
}

/**
 * The message to show for an error written for the person on the other end.
 * An error class that means to be shown sets `publicMessage` — e.g. "Today's
 * AI budget for this demo is used up" — and that is returned in production
 * too, where safeError() would hide it. `message` may keep detail for the logs
 * (an endpoint URL, a provider's own error text). Any other error goes through
 * safeError().
 */
export function publicErrorMessage(err: unknown): string {
  const pub = err && typeof err === 'object' ? (err as { publicMessage?: unknown }).publicMessage : undefined;
  return typeof pub === 'string' && pub ? pub : safeError(err);
}
