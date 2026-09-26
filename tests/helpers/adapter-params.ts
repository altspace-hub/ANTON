/**
 * adapter-params.ts — the parameter list a fake database should see, read the
 * way the real adapter reads it (server/db/adapters/postgresql-adapter.ts):
 * one array argument is the whole list, otherwise the arguments are.
 *
 * Call sites pass a variable number of values as one array
 * (`db.all(sql, [userId, ...ids])`) because CodeQL cannot place spread values
 * and reports them as SQL injection. A fake that reads `...params` directly
 * would see a single array there.
 */
export function adapterParams(params: unknown[]): unknown[] {
  return params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
}
