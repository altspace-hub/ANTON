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
