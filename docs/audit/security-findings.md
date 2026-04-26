# Security Findings

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** F.2 (investigation only — triage, do NOT auto-fix)

## 1. Possible hard-coded secrets

Patterns like `api_key = 'foo'` or `password = "bar"` in non-test code.

```
server/routes/auth.ts:75:      res.json({ user: { id: 'solo', username: 'solo', role: 'admin' }, token: 'solo-mode' });
```

## 2. Routes with no obvious auth/rate-limit middleware

Each route file should reference at least one of: `requireAuth`, `ensureAuth`,
`rateLimit`, `getAuthHeader`. Files missing all four are flagged. Some are
intentionally public (visitor surfaces); audit each.

```
admin.ts
agents.ts
ai-assist.ts
alignment-reviewer.ts
analytics.ts
app-gateway.ts
apprentice.ts
atlas.ts
audit-trail.ts
audit.ts
auth.ts
azure-openai.ts
batch.ts
canvas.ts
civic.ts
claude.ts
coding-large.ts
coding-review.ts
coding-scripts.ts
coding.ts
collections.ts
commands.ts
community-projects.ts
community-signing.ts
community.ts
```

## 3. Rate-limit coverage

**Routes:** 155 · **Routes referencing rate-limit:** 5 (5/155 ≈ 3%)

## 4. `shell: true` in spawn (CLAUDE.md anti-pattern)

```
server/connections/script-adapter.ts:94:      // No shell: true to avoid shell injection
```

## 5. SQL string concatenation

CLAUDE.md mandates parameterised queries only. Detect potential string-concat SQL.

```
server/db/adapters/postgresql-adapter.ts:16: * "real-world" or "datetime contexts" inside seed INSERTs or UPDATE values.
server/db/adapters/postgresql-adapter.ts:66:  // INSERT OR IGNORE INTO → INSERT INTO ... ON CONFLICT DO NOTHING
server/db/adapters/postgresql-adapter.ts:67:  out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
server/db/adapters/postgresql-adapter.ts:68:  // We'll append ON CONFLICT DO NOTHING at the end of INSERT statements that had OR IGNORE
server/db/adapters/postgresql-adapter.ts:69:  if (/INSERT\s+INTO/i.test(sql) && /OR\s+IGNORE/i.test(sql)) {
server/db/adapters/postgresql-adapter.ts:82:  // INSERT OR REPLACE INTO table (col1, col2, ...) VALUES (...)
server/db/adapters/postgresql-adapter.ts:83:  // → INSERT INTO table (col1, col2, ...) VALUES (...) ON CONFLICT (col1) DO UPDATE SET col2=EXCLUDED.col2, ...
server/db/adapters/postgresql-adapter.ts:85:  const replaceMatch = out.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
server/db/adapters/postgresql-adapter.ts:91:    out = out.replace(/INSERT\s+OR\s+REPLACE\s+INTO/i, 'INSERT INTO');
server/db/adapters/postgresql-adapter.ts:94:    const onConflict = ` ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateSet}`;
server/db/adapters/postgresql-adapter.ts:266:    // Auto-add RETURNING * for INSERT statements that don't already have it
server/db/adapters/postgresql-adapter.ts:268:    const isInsert = /^\s*INSERT\s/i.test(pgSql);
server/db/adapters/postgresql-adapter.ts:346:    const isInsert = /^\s*INSERT\s/i.test(pgSql);
server/db/adapters/sqlite-adapter.ts:25:      // Forgive callers that pass INSERT/UPDATE/DELETE to .get() —
server/db/adapters/sqlite-adapter.ts:40:      // Forgive callers that pass INSERT/UPDATE/DELETE to .all() —
(none found)
```

## What to do

Each finding is a flag, not a fix. Triage with the team:

- 🔴 **Hard-coded secret** → rotate immediately + move to env / vault.
- 🟡 **Auth-less route** → confirm intentional (visitor surface) or add auth middleware.
- 🟡 **Low rate-limit coverage** → add a default rate-limit at the global router.
- 🔴 **`shell: true`** → rewrite using `execFile` with arg array.
- 🔴 **Concatenated SQL** → rewrite as parameterised query.

## Cadence

Quarterly via `pnpm run anton:investigate -- --pattern security`.
