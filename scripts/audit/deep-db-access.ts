/**
 * deep-db-access.ts — Pattern G.11 (real implementation)
 *
 * Database access pattern audit for ANTON's services + routes.
 * Focuses on cheap, high-signal checks; deep schema-drift validation is
 * deferred (would need a proper SQL parser).
 *
 * Patterns detected:
 *   1. **SELECT \\*** in service / route SQL strings (over-fetch + harder to
 *      maintain when schemas drift)
 *   2. **Missing LIMIT on user-facing queries** (`db.all('SELECT … FROM …')`
 *      in route files without an explicit LIMIT — unbounded result set risk)
 *   3. **N+1 candidates** — `for/forEach` body containing `await db.…`
 *      (sequential per-iteration query)
 *   4. **Direct `pg` import bypass** — services importing from `'pg'`
 *      directly instead of through the `DatabaseAdapter` interface
 *   5. **Unparameterised string concat in SQL** — `db.run(\`… ${var} …\`)`
 *      template-string SQL with non-bind values is SQL-injection risk
 *
 * Output: Markdown table with file:line citations + severity ranking.
 *
 * Usage: pnpm tsx scripts/audit/deep-db-access.ts
 */

import {
  Project,
  SyntaxKind,
  type SourceFile,
  type CallExpression,
  type Node,
} from 'ts-morph';
import { execSync } from 'child_process';

interface Finding {
  file: string;
  line: number;
  pattern: string;
  detail: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

const PROJECT_ROOT = process.cwd();
const findings: Finding[] = [];

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
  skipAddingFilesFromTsConfig: true,
});

project.addSourceFilesAtPaths([
  'server/services/**/*.ts',
  'server/routes/**/*.ts',
]);

function rel(file: SourceFile): string {
  return file.getFilePath().replace(PROJECT_ROOT.replace(/\\/g, '/'), '').replace(/\\/g, '/').replace(/^\//, '');
}

function shouldSkip(file: SourceFile): boolean {
  const p = file.getFilePath();
  return p.includes('node_modules') || p.includes('.test.') || p.includes('/dist/') || p.includes('/build/');
}

function severityFor(filePath: string, base: 'HIGH' | 'MEDIUM' | 'LOW'): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (base === 'LOW') return 'LOW';
  const isRoute = filePath.includes('server/routes/');
  const isCritical = /orchestrator|prompt-builder|anton-bundler|aap-rollout|credential-vault|agent-processor|risk-atlas|evidence-pack/.test(filePath);
  if (isRoute || isCritical) return 'HIGH';
  return base;
}

let scannedCount = 0;

for (const sf of project.getSourceFiles()) {
  if (shouldSkip(sf)) continue;
  scannedCount++;
  const filePath = rel(sf);
  const isRoute = filePath.includes('server/routes/');

  // ── Pattern 4: direct `pg` import bypass ────────────────────────────────
  // Services + routes should use the DatabaseAdapter passed in via createXxx(db);
  // direct `import pg from 'pg'` or `from 'pg'` is a layering violation.
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (spec === 'pg' || spec === 'pg-pool' || spec === 'better-sqlite3') {
      findings.push({
        file: filePath,
        line: imp.getStartLineNumber(),
        pattern: 'Direct pg / sqlite import bypass',
        detail: `imports from \`'${spec}'\` instead of using DatabaseAdapter`,
        severity: severityFor(filePath, 'LOW'),
      });
    }
  }

  // ── Patterns 1, 2, 3, 5: walk db method calls ──────────────────────────
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
    const callText = expr.getText();
    // Match db.run, db.all, db.get, db.exec — and the same on `database`, `txDb`, `client` etc.
    const dbMethodMatch = callText.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(run|all|get|exec|query)$/);
    if (!dbMethodMatch) continue;
    const receiver = dbMethodMatch[1];
    const method = dbMethodMatch[2];
    // Skip non-db receivers — common false positives
    const lcReceiver = receiver.toLowerCase();
    if (!/^(db|database|txdb|client|conn|connection|pg|adapter)$/i.test(lcReceiver)) continue;

    // Get first argument (the SQL string)
    const args = (call as CallExpression).getArguments();
    if (args.length === 0) continue;
    const firstArg = args[0];
    let sql = '';

    // Handle template literals + string literals
    if (firstArg.getKind() === SyntaxKind.StringLiteral || firstArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
      sql = firstArg.getText().slice(1, -1);  // strip quotes
    } else if (firstArg.getKind() === SyntaxKind.TemplateExpression) {
      // Template with interpolations
      sql = firstArg.getText();
      // Look for unescaped ${var} BEFORE we strip them, to detect SQL-injection risk
      // A safe template uses `?` bind params, not direct interpolation of identifiers
      const interpolations = firstArg.getDescendantsOfKind(SyntaxKind.TemplateSpan);
      // Check if any interpolation looks like a column-name / table-name interpolation (high risk)
      // vs just constant SQL fragment building (lower risk)
      // Heuristic: if interpolation expression text contains a function call result or `req.`, it's likely user-controlled
      let hasUserControlledInterpolation = false;
      for (const span of interpolations) {
        const spanText = span.getText();
        // ${req.body.…}, ${req.query.…}, ${req.params.…} — direct injection
        if (/\$\{[^}]*\breq\.(body|query|params)/.test(spanText)) {
          hasUserControlledInterpolation = true;
          break;
        }
      }
      if (hasUserControlledInterpolation && (method === 'run' || method === 'exec' || method === 'query' || method === 'all' || method === 'get')) {
        findings.push({
          file: filePath,
          line: call.getStartLineNumber(),
          pattern: 'SQL injection risk (user-controlled interpolation)',
          detail: `\`${receiver}.${method}\` with template-literal SQL containing \`req.body/query/params\` interpolation`,
          severity: severityFor(filePath, 'HIGH'),
        });
      }
      // Continue with the rest of the SQL checks on the template text (with interpolations included)
    } else {
      // Variable reference — can't analyse statically
      continue;
    }

    const sqlUpper = sql.toUpperCase();

    // ── Pattern 1: SELECT * ──────────────────────────────────────────────
    if (/\bSELECT\s+\*\b/i.test(sql)) {
      findings.push({
        file: filePath,
        line: call.getStartLineNumber(),
        pattern: 'SELECT *',
        detail: 'over-fetches columns; brittle when schema changes',
        severity: severityFor(filePath, isRoute ? 'MEDIUM' : 'LOW'),
      });
    }

    // ── Pattern 2: missing LIMIT on user-facing query ────────────────────
    // Only flag for SELECT in route files; only when method is `all` (multi-row)
    if (
      isRoute &&
      method === 'all' &&
      /\bSELECT\b/i.test(sqlUpper) &&
      !/\bLIMIT\s+\??\d*/i.test(sqlUpper) &&
      !/\bCOUNT\s*\(/i.test(sqlUpper) &&         // aggregations are fine
      !/\bSUM\s*\(/i.test(sqlUpper) &&
      !/\bMAX\s*\(/i.test(sqlUpper) &&
      !/\bMIN\s*\(/i.test(sqlUpper) &&
      !/\bAVG\s*\(/i.test(sqlUpper)
    ) {
      findings.push({
        file: filePath,
        line: call.getStartLineNumber(),
        pattern: 'Missing LIMIT on user-facing query',
        detail: '`db.all(SELECT …)` without LIMIT — unbounded result set on a route',
        severity: severityFor(filePath, 'MEDIUM'),
      });
    }
  }

  // ── Pattern 3: N+1 candidates — for/forEach with await db.* inside ─────
  for (const loop of sf.getDescendantsOfKind(SyntaxKind.ForOfStatement)
    .concat(sf.getDescendantsOfKind(SyntaxKind.ForStatement))
    .concat(sf.getDescendantsOfKind(SyntaxKind.ForInStatement))
  ) {
    const body = loop.getStatement();
    const bodyText = body.getText();
    // Look for `await db.` / `await database.` / etc inside the loop body
    if (/\bawait\s+(db|database|txdb|client|conn|connection|pg|adapter)\.(run|all|get|exec|query)\b/i.test(bodyText)) {
      findings.push({
        file: filePath,
        line: loop.getStartLineNumber(),
        pattern: 'N+1 query candidate',
        detail: 'loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead)',
        severity: severityFor(filePath, 'MEDIUM'),
      });
    }
  }
}

// ── Output Markdown ────────────────────────────────────────────────────

const date = new Date().toISOString().slice(0, 10);
const sha = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; } })();

console.log(`# G.11 — Database Access Pattern Audit (real)`);
console.log('');
console.log(`**Generated:** ${date} UTC`);
console.log(`**Commit:** \`${sha}\``);
console.log(`**Pattern:** G.11`);
console.log(`**Scanned:** ${scannedCount} TS files (server/services/, server/routes/)`);
console.log(`**Findings:** ${findings.length}`);
console.log('');
console.log('> Catches schema-fragility (SELECT \\*), unbounded result sets (missing LIMIT on user-facing queries),');
console.log('> N+1 query patterns, direct DB-driver imports that bypass the adapter, and SQL-injection-risk');
console.log('> template literals with user-controlled interpolation.');
console.log('');

if (findings.length === 0) {
  console.log('✅ No db-access findings.');
  process.exit(0);
}

const bySeverity: Record<Finding['severity'], Finding[]> = { HIGH: [], MEDIUM: [], LOW: [] };
for (const f of findings) bySeverity[f.severity].push(f);

const byPattern: Record<string, number> = {};
for (const f of findings) byPattern[f.pattern] = (byPattern[f.pattern] ?? 0) + 1;

console.log('## Severity rollup');
console.log('');
console.log('| Severity | Count |');
console.log('|---|---|');
console.log(`| HIGH | ${bySeverity.HIGH.length} |`);
console.log(`| MEDIUM | ${bySeverity.MEDIUM.length} |`);
console.log(`| LOW | ${bySeverity.LOW.length} |`);
console.log('');

console.log('## By pattern');
console.log('');
console.log('| Pattern | Count |');
console.log('|---|---|');
for (const [p, n] of Object.entries(byPattern).sort((a, b) => b[1] - a[1])) {
  console.log(`| ${p} | ${n} |`);
}
console.log('');

function tablize(rows: Finding[], cap: number): void {
  console.log('| File | Line | Pattern | Detail |');
  console.log('|---|---|---|---|');
  for (const f of rows.slice(0, cap)) {
    console.log(`| \`${f.file}\` | ${f.line} | ${f.pattern} | ${f.detail} |`);
  }
  if (rows.length > cap) {
    console.log('');
    console.log(`*… + ${rows.length - cap} more (truncated)*`);
  }
  console.log('');
}

if (bySeverity.HIGH.length > 0) {
  console.log('## HIGH — route / critical-path findings');
  console.log('');
  tablize(bySeverity.HIGH, 60);
}

if (bySeverity.MEDIUM.length > 0) {
  console.log('## MEDIUM — service-layer findings');
  console.log('');
  tablize(bySeverity.MEDIUM, 60);
}

if (bySeverity.LOW.length > 0) {
  console.log('## LOW — non-critical');
  console.log('');
  tablize(bySeverity.LOW, 30);
}

const fileCounts = new Map<string, number>();
for (const f of findings) fileCounts.set(f.file, (fileCounts.get(f.file) ?? 0) + 1);
const topFiles = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('## Top files by finding count');
console.log('');
console.log('| File | Findings |');
console.log('|---|---|');
for (const [f, n] of topFiles) {
  console.log(`| \`${f}\` | ${n} |`);
}
console.log('');

console.log('---');
console.log('');
console.log('**Cadence (per addendum §G.11):** per-migration mandatory; weekly + pre-release.');
console.log('');
console.log('**Acceptance:**');
console.log('- HIGH: SQL injection risk (user-controlled interpolation) — drop-everything fix.');
console.log('- HIGH (route): SELECT * + missing LIMIT in routes — explicit columns + LIMIT N.');
console.log('- MEDIUM: N+1 candidates — replace with `IN (?,?,?)` or `WHERE id = ANY($1)`.');
console.log('- LOW: direct `pg` imports — refactor through DatabaseAdapter when touching the file.');
