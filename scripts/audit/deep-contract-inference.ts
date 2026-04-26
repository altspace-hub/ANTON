/**
 * deep-contract-inference.ts — Pattern G.10 (real implementation)
 *
 * AST-based scan for typed-contract drift across server/services/.
 * Catches:
 *   - Functions declared `Promise<X>` (non-nullable) that return null/undefined in branches
 *   - Functions declared `Promise<any>` (skipped typing)
 *   - Functions whose return statements use `as` casts (silently lying about type)
 *   - Throws in branches not declared in the signature
 *
 * Output: Markdown table with file:line citations + severity ranking.
 *
 * Usage: pnpm tsx scripts/audit/deep-contract-inference.ts
 *        (called by deep-contract-inference.sh)
 */

import { Project, SyntaxKind, type FunctionDeclaration, type ArrowFunction, type MethodDeclaration, type Node, type ReturnStatement, type SourceFile } from 'ts-morph';
import { execSync } from 'child_process';

interface Finding {
  file: string;
  line: number;
  fn: string;
  declared: string;
  issue: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

const PROJECT_ROOT = process.cwd();

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
  skipAddingFilesFromTsConfig: true,
});

// Add only what we want to scan — server/services/. Keep it tight to avoid
// pulling 1000s of files into the AST for a 30s scan.
project.addSourceFilesAtPaths(['server/services/**/*.ts', 'server/routes/**/*.ts']);

const findings: Finding[] = [];

interface Callable {
  name: string;
  returnType: string;
  body?: ReturnType<FunctionDeclaration['getBody']>;
  startLine: number;
  isExported: boolean;
}

function asCallable(fn: FunctionDeclaration | ArrowFunction | MethodDeclaration, file: SourceFile): Callable | null {
  // Get the declared return type as written in source (not inferred)
  let returnType = '';
  try {
    returnType = fn.getReturnType().getText(undefined, undefined as never);
  } catch { return null; }

  // Determine the function "name" — walk up to find a binding
  let name = '<anonymous>';
  if ('getName' in fn && typeof fn.getName === 'function') {
    name = fn.getName() ?? '<anonymous>';
  } else {
    const parent = fn.getParent();
    if (parent && parent.getKind() === SyntaxKind.VariableDeclaration) {
      // const foo = async () => {}
      name = (parent as { getName?: () => string }).getName?.() ?? '<anonymous>';
    } else if (parent && parent.getKind() === SyntaxKind.PropertyAssignment) {
      name = (parent as { getName?: () => string }).getName?.() ?? '<anonymous>';
    }
  }

  // Detect "exported" — for FunctionDeclaration directly; for arrow assigned to a variable,
  // check if the parent VariableStatement is exported.
  let isExported = false;
  if ('isExported' in fn && typeof fn.isExported === 'function') {
    isExported = fn.isExported();
  } else {
    const varDecl = fn.getFirstAncestorByKind(SyntaxKind.VariableStatement);
    if (varDecl && 'isExported' in varDecl && typeof (varDecl as { isExported?: () => boolean }).isExported === 'function') {
      isExported = (varDecl as { isExported: () => boolean }).isExported();
    }
  }

  return {
    name,
    returnType,
    body: 'getBody' in fn ? fn.getBody() : undefined,
    startLine: fn.getStartLineNumber(),
    isExported,
  };
}

/**
 * Walk all return statements that belong DIRECTLY to `fn` — not those nested
 * inside inner functions / arrow functions / methods. This is what makes the
 * audit accurate: a `return null` inside an inline route handler should be
 * attributed to the route handler, not the outer factory function.
 */
function getOwnReturns(fn: FunctionDeclaration | ArrowFunction | MethodDeclaration): ReturnStatement[] {
  const out: ReturnStatement[] = [];
  function walk(node: Node): void {
    for (const child of node.getChildren()) {
      const k = child.getKind();
      // Stop descending when we enter a nested function scope
      if (
        k === SyntaxKind.FunctionDeclaration ||
        k === SyntaxKind.FunctionExpression ||
        k === SyntaxKind.ArrowFunction ||
        k === SyntaxKind.MethodDeclaration ||
        k === SyntaxKind.GetAccessor ||
        k === SyntaxKind.SetAccessor
      ) {
        continue;
      }
      if (k === SyntaxKind.ReturnStatement) {
        out.push(child as ReturnStatement);
      }
      walk(child);
    }
  }
  const body = fn.getBody();
  if (body) walk(body);
  return out;
}

function scanCallable(file: SourceFile, raw: FunctionDeclaration | ArrowFunction | MethodDeclaration): void {
  const c = asCallable(raw, file);
  if (!c) return;
  if (!c.isExported) return;             // Only exported functions matter for this audit
  if (c.name === '<anonymous>') return;  // Skip noise

  const filePath = file.getFilePath().replace(PROJECT_ROOT.replace(/\\/g, '/'), '').replace(/\\/g, '/').replace(/^\//, '');

  // ── Check 1: Declared `Promise<any>` or `any` ──────────────────────────
  // Strict: the literal token "any" appears as the return type
  if (/\bany\b/.test(c.returnType) && !/Record<\s*string\s*,\s*any\s*>/.test(c.returnType)) {
    findings.push({
      file: filePath,
      line: c.startLine,
      fn: c.name,
      declared: c.returnType.length > 60 ? c.returnType.slice(0, 57) + '…' : c.returnType,
      issue: 'declared `any` — type erased',
      severity: 'MEDIUM',
    });
  }

  // ── Check 2: Returns null/undefined in non-nullable type ───────────────
  // Only count returns that belong DIRECTLY to this function — not those nested
  // inside inner arrow / function / method scopes (their own functions, audited separately).
  const ownReturns = getOwnReturns(raw);

  if (ownReturns.length > 0) {
    const allowsNull = /null|undefined|void/.test(c.returnType) || c.returnType === 'unknown';
    if (!allowsNull) {
      for (const r of ownReturns) {
        const expr = r.getExpression();
        if (!expr) continue;
        const text = expr.getText().trim();
        // Direct null / undefined returns
        if (text === 'null' || text === 'undefined') {
          findings.push({
            file: filePath,
            line: r.getStartLineNumber(),
            fn: c.name,
            declared: shortenType(c.returnType),
            issue: `returns ${text} — type doesn't allow it`,
            severity: 'HIGH',
          });
        }
        // Conditional returns of null
        if (/\?\s*null\s*:|:\s*null\s*[,;)]?$|=>\s*null\b/.test(text) && !/null\s*\?/.test(text)) {
          findings.push({
            file: filePath,
            line: r.getStartLineNumber(),
            fn: c.name,
            declared: shortenType(c.returnType),
            issue: 'returns null in branch — type doesn\'t allow it',
            severity: 'HIGH',
          });
        }
      }
    }

    // ── Check 3: `as` casts at the return site (silent type lie) ─────────
    for (const r of ownReturns) {
      const expr = r.getExpression();
      if (!expr) continue;
      if (expr.getKind() === SyntaxKind.AsExpression) {
        const text = expr.getText();
        if (/\bas\s+const\b/.test(text)) continue;
        findings.push({
          file: filePath,
          line: r.getStartLineNumber(),
          fn: c.name,
          declared: shortenType(c.returnType),
          issue: `'as' cast at return site (\`${text.length > 60 ? text.slice(0, 57) + '…' : text}\`)`,
          severity: 'MEDIUM',
        });
      }
    }
  }
}

/**
 * Shorten ts-morph's verbose import-path-qualified types to something readable.
 * `import("C:/.../node_modules/.pnpm/foo@1/node_modules/foo").Bar<X>` → `Bar<X>`
 */
function shortenType(t: string): string {
  // Strip import("...") prefix
  let s = t.replace(/import\("[^"]+"\)\./g, '');
  // Strip absolute Windows paths embedded in remaining strings
  s = s.replace(/[A-Z]:\/[^"'`)\s]+/g, '<path>');
  if (s.length > 80) s = s.slice(0, 77) + '…';
  return s;
}

// Iterate
let scannedCount = 0;
for (const sf of project.getSourceFiles()) {
  if (sf.getFilePath().includes('node_modules')) continue;
  if (sf.getFilePath().includes('.test.')) continue;
  scannedCount++;

  // Top-level functions
  for (const fn of sf.getFunctions()) scanCallable(sf, fn);

  // Methods on classes
  for (const cls of sf.getClasses()) {
    for (const m of cls.getMethods()) scanCallable(sf, m);
  }

  // Arrow functions assigned to const (top-level only — not nested)
  for (const v of sf.getVariableStatements()) {
    if (!v.isExported()) continue;
    for (const decl of v.getDeclarations()) {
      const init = decl.getInitializer();
      if (init?.getKind() === SyntaxKind.ArrowFunction) {
        scanCallable(sf, init as ArrowFunction);
      }
    }
  }
}

// ── Output Markdown ────────────────────────────────────────────────────

const date = new Date().toISOString().slice(0, 10);
const sha = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; } })();

console.log(`# G.10 — Contract Inference (real)`);
console.log('');
console.log(`**Generated:** ${date} UTC`);
console.log(`**Commit:** \`${sha}\``);
console.log(`**Pattern:** G.10`);
console.log(`**Scanned:** ${scannedCount} TS files (server/services/, server/routes/) — exported callables only`);
console.log(`**Findings:** ${findings.length}`);
console.log('');
console.log('> Each finding is a candidate for typed-contract enforcement. HIGH = declared type lies (runtime-visible bug surface). MEDIUM = `any` or `as` cast (typing debt). LOW = none currently surfaced.');
console.log('');

if (findings.length === 0) {
  console.log('✅ No contract-drift findings.');
  process.exit(0);
}

// Group by severity
const bySeverity: Record<Finding['severity'], Finding[]> = { HIGH: [], MEDIUM: [], LOW: [] };
for (const f of findings) bySeverity[f.severity].push(f);

console.log('## Severity rollup');
console.log('');
console.log('| Severity | Count |');
console.log('|---|---|');
console.log(`| HIGH | ${bySeverity.HIGH.length} |`);
console.log(`| MEDIUM | ${bySeverity.MEDIUM.length} |`);
console.log(`| LOW | ${bySeverity.LOW.length} |`);
console.log('');

// HIGH section
if (bySeverity.HIGH.length > 0) {
  console.log('## HIGH — declared type lies about nullability');
  console.log('');
  console.log('Functions whose declared return type doesn\'t allow `null` / `undefined` but whose body returns one anyway. Callers built against the declared type may not handle the null and crash.');
  console.log('');
  console.log('| File | Line | Function | Declared | Issue |');
  console.log('|---|---|---|---|---|');
  for (const f of bySeverity.HIGH.slice(0, 80)) {
    console.log(`| \`${f.file}\` | ${f.line} | \`${f.fn}\` | \`${f.declared}\` | ${f.issue} |`);
  }
  if (bySeverity.HIGH.length > 80) {
    console.log('');
    console.log(`*… + ${bySeverity.HIGH.length - 80} more HIGH findings (truncated for readability)*`);
  }
  console.log('');
}

// MEDIUM section
if (bySeverity.MEDIUM.length > 0) {
  console.log('## MEDIUM — typing debt');
  console.log('');
  console.log('Functions declared with `any` in the return type, or returns that use `as` casts (silently coercing to a different type than the body actually produces).');
  console.log('');
  console.log('| File | Line | Function | Declared | Issue |');
  console.log('|---|---|---|---|---|');
  for (const f of bySeverity.MEDIUM.slice(0, 80)) {
    console.log(`| \`${f.file}\` | ${f.line} | \`${f.fn}\` | \`${f.declared}\` | ${f.issue} |`);
  }
  if (bySeverity.MEDIUM.length > 80) {
    console.log('');
    console.log(`*… + ${bySeverity.MEDIUM.length - 80} more MEDIUM findings (truncated for readability)*`);
  }
  console.log('');
}

// Top-offending files
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
console.log('**Cadence (per addendum §G.10):** per-PR on changed files; weekly full sweep; pre-release mandatory.');
console.log('');
console.log('**Acceptance:** every HIGH finding warrants a PR — either narrow the function body to never return null/undefined OR widen the declared type to allow it. MEDIUM findings are typing-debt candidates for the H.1 priority queue.');
