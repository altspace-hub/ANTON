/**
 * deep-async-audit.ts — Pattern G.14 (real implementation)
 *
 * AST-based scan for concurrency hazards in server/services/, server/routes/,
 * and src/ (server-side patterns + frontend hook patterns).
 *
 * Patterns detected:
 *   1. **Forgotten await** — async function called whose Promise is dropped
 *      (HIGH if in critical path / route handler; MEDIUM elsewhere)
 *   2. **Promise.all on fallible list** — `.map(x => fetch/db/llm/...)` followed by
 *      Promise.all means one rejection kills the batch (MEDIUM, suggests allSettled)
 *   3. **Sequential await in for-of loop** — perf opportunity for Promise.all
 *      when iterations are independent (LOW — perf, not correctness)
 *   4. **Leaked setInterval / setTimeout** — timer call without a matching
 *      clear in the same scope (MEDIUM in long-running services)
 *   5. **.then() without .catch()** — promise chain that doesn't handle rejection
 *      (MEDIUM — typically catches go to global handler if missing)
 *
 * Output: Markdown table with file:line citations + severity ranking.
 *
 * Usage: pnpm tsx scripts/audit/deep-async-audit.ts
 *        (called by deep-async-audit.sh)
 */

import {
  Project,
  SyntaxKind,
  type FunctionDeclaration,
  type ArrowFunction,
  type MethodDeclaration,
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
  'src/**/*.ts',
  'src/**/*.tsx',
]);

// Path normalisation: turn absolute → repo-relative
function rel(file: SourceFile): string {
  return file.getFilePath().replace(PROJECT_ROOT.replace(/\\/g, '/'), '').replace(/\\/g, '/').replace(/^\//, '');
}

// Skip generated / vendored / test files
function shouldSkip(file: SourceFile): boolean {
  const p = file.getFilePath();
  return p.includes('node_modules') || p.includes('.test.') || p.includes('/dist/') || p.includes('/build/');
}

// ── Helper: detect "is the call awaited / returned / assigned / chained?" ─

function isCallHandled(call: CallExpression): boolean {
  const parent = call.getParent();
  if (!parent) return true; // top-level expression statement is technically dropped, but rare for our purposes
  const k = parent.getKind();
  if (k === SyntaxKind.AwaitExpression) return true;             // await x()
  if (k === SyntaxKind.ReturnStatement) return true;             // return x()
  if (k === SyntaxKind.ArrowFunction) return true;               // () => x() — implicit return
  if (k === SyntaxKind.VariableDeclaration) return true;         // const r = x()
  if (k === SyntaxKind.PropertyAssignment) return true;          // { r: x() }
  if (k === SyntaxKind.SpreadElement) return true;               // [...x()]
  if (k === SyntaxKind.PropertyAccessExpression) return true;    // x().then(...) chain
  if (k === SyntaxKind.CallExpression) {
    // Used as an argument to another call (e.g. await Promise.all([asyncCall()]))
    const grandparent = (parent as CallExpression).getParent();
    if (grandparent && grandparent.getKind() === SyntaxKind.AwaitExpression) return true;
    return true;
  }
  if (k === SyntaxKind.BinaryExpression) return true;            // const x = y || asyncCall()
  if (k === SyntaxKind.ConditionalExpression) return true;       // cond ? asyncCall() : ...
  if (k === SyntaxKind.ParenthesizedExpression) {
    // Walk one level up to see if the parens are awaited / returned
    const grandparent = parent.getParent();
    if (grandparent) {
      const gk = grandparent.getKind();
      if (gk === SyntaxKind.AwaitExpression || gk === SyntaxKind.ReturnStatement) return true;
    }
  }
  return false;
}

// Best-effort detect "is the called function async" — relies on the symbol's first declaration
// containing the `async` keyword OR returning a Promise type.
function isCalleeAsync(call: CallExpression): boolean {
  try {
    const expr = call.getExpression();
    const sym = expr.getSymbol();
    if (!sym) return false;
    for (const decl of sym.getDeclarations()) {
      const text = decl.getText();
      if (/^\s*(public\s+|private\s+|static\s+)?async\s+/.test(text)) return true;
      if (/^\s*async\s/.test(text)) return true;
      if (/=>\s*Promise</.test(text)) return true;
      if (/:\s*Promise</.test(text)) return true;
      // Method or function declaration with async keyword
      if (decl.getKind() === SyntaxKind.MethodDeclaration || decl.getKind() === SyntaxKind.FunctionDeclaration) {
        const d = decl as FunctionDeclaration | MethodDeclaration;
        try {
          if ('isAsync' in d && typeof d.isAsync === 'function' && d.isAsync()) return true;
        } catch { /* fall through */ }
      }
    }
  } catch { /* ts-morph type resolution can throw on broken declarations */ }
  return false;
}

// Find the nearest enclosing function or arrow scope (to check if we're inside an async ancestor)
function isInAsyncScope(node: Node): boolean {
  let cur: Node | undefined = node.getParent();
  while (cur) {
    const k = cur.getKind();
    if (k === SyntaxKind.FunctionDeclaration || k === SyntaxKind.MethodDeclaration) {
      const f = cur as FunctionDeclaration | MethodDeclaration;
      if ('isAsync' in f && typeof f.isAsync === 'function' && f.isAsync()) return true;
      return false; // Hit a non-async sync function
    }
    if (k === SyntaxKind.ArrowFunction || k === SyntaxKind.FunctionExpression) {
      const text = cur.getText();
      if (/^async\s|=\s*async/.test(text)) return true;
      return false;
    }
    cur = cur.getParent();
  }
  return false;
}

// Severity: HIGH if file is a route or critical-path service
function severityFor(filePath: string, base: 'HIGH' | 'MEDIUM' | 'LOW'): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (base === 'LOW') return 'LOW';
  const isRoute = filePath.includes('server/routes/');
  const isCritical = /orchestrator|prompt-builder|anton-bundler|aap-rollout|credential-vault|agent-processor/.test(filePath);
  if (isRoute || isCritical) return 'HIGH';
  return base;
}

// ── Iterate ──────────────────────────────────────────────────────────────

let scannedCount = 0;

for (const sf of project.getSourceFiles()) {
  if (shouldSkip(sf)) continue;
  scannedCount++;
  const filePath = rel(sf);

  // ── Pattern 1: Forgotten await ────────────────────────────────────────
  // Walk top-level ExpressionStatements only (not every nested CallExpression).
  // A "forgotten await" is an async-returning call sitting as a bare statement
  // — no await, no return, no .catch / .finally on the chain.
  for (const stmt of sf.getDescendantsOfKind(SyntaxKind.ExpressionStatement)) {
    if (!isInAsyncScope(stmt)) continue;
    const expr = stmt.getExpression();
    if (expr.getKind() !== SyntaxKind.CallExpression) continue;
    const call = expr as CallExpression;
    if (!isCalleeAsync(call)) continue;

    // Skip chains that explicitly handle rejection
    const chainText = call.getText();
    if (chainText.includes('.catch(') || chainText.includes('.finally(')) continue;
    // .then(success, onRejected) form
    if (/\.then\s*\([^)]*,\s*[^)]*\)/.test(chainText)) continue;

    findings.push({
      file: filePath,
      line: call.getStartLineNumber(),
      pattern: 'Forgotten await',
      detail: `\`${chainText.slice(0, 70).replace(/\n/g, ' ')}${chainText.length > 70 ? '…' : ''}\``,
      severity: severityFor(filePath, 'HIGH'),
    });
  }

  // ── Pattern 2: Promise.all on fallible list ──────────────────────────
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const text = call.getText();
    if (!text.startsWith('Promise.all(')) continue;
    // Look for fetch / db.query / db.run / db.all / db.get / axios / invoke / fc / sendXxx / emit inside the .map of the arg
    if (/\.map\([^)]*=>[^)]*(?:\bfetch\b|\bdb\.|\baxios\b|\binvoke\b|\bcallChat\b|\bsendBundle\b|\bsendToTarget\b|\bemit\b)/s.test(text)) {
      findings.push({
        file: filePath,
        line: call.getStartLineNumber(),
        pattern: 'Promise.all on fallible list',
        detail: 'one rejection kills the whole batch — consider Promise.allSettled',
        severity: severityFor(filePath, 'MEDIUM'),
      });
    }
  }

  // ── Pattern 3: Sequential await in for-of loop ───────────────────────
  for (const loop of sf.getDescendantsOfKind(SyntaxKind.ForOfStatement)) {
    const awaits = loop.getStatement().getDescendantsOfKind(SyntaxKind.AwaitExpression);
    if (awaits.length === 1) {
      // Heuristic for independence: the awaited expression doesn't reference a variable
      // declared in the same loop body before the await
      // Simplest: assume independent unless we see explicit data dependencies.
      // To avoid noise, only flag in services (not routes — routes often have ordering deps).
      if (filePath.includes('server/services/') && !filePath.includes('migrations')) {
        findings.push({
          file: filePath,
          line: loop.getStartLineNumber(),
          pattern: 'Sequential await in loop',
          detail: 'iterations may be independent — check if Promise.all would be safe',
          severity: 'LOW',
        });
      }
    }
  }

  // ── Pattern 4: setInterval without nearby clear ──────────────────────
  // setTimeout fires once — no leak risk; only flag setInterval.
  // Skip when:
  //   - the handle is RETURNED from the function (caller owns clearInterval)
  //   - the handle is assigned to a variable / property / ref (callable from elsewhere)
  //   AND clearInterval(<sameIdent>) appears anywhere in the source file
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression().getText();
    if (expr !== 'setInterval') continue;

    // Skip if the call is an argument to `return`
    const directParent = call.getParent();
    if (directParent && directParent.getKind() === SyntaxKind.ReturnStatement) continue;

    // If the call is assigned to a variable / property — caller may own the handle
    let assignedIdent: string | null = null;
    if (directParent && directParent.getKind() === SyntaxKind.VariableDeclaration) {
      const name = (directParent as { getName: () => string }).getName?.();
      if (name) assignedIdent = name;
    } else if (directParent && directParent.getKind() === SyntaxKind.BinaryExpression) {
      // `xRef.current = setInterval(...)` or `obj.foo = setInterval(...)`
      const lhs = (directParent as { getLeft: () => Node }).getLeft?.();
      if (lhs) assignedIdent = lhs.getText();
    } else if (directParent && directParent.getKind() === SyntaxKind.PropertyAssignment) {
      assignedIdent = '__property__';
    }

    // If we have an assigned identifier, search the FULL FILE for clearInterval(<it>)
    if (assignedIdent) {
      const fileText = sf.getFullText();
      // Try looking for `clearInterval(<ident>)` or `clearInterval(<ident>.something)`
      const escaped = assignedIdent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`clearInterval\\s*\\(\\s*${escaped}\\b`);
      if (re.test(fileText)) continue;
      // Also accept any clearInterval call in the file (broader search — assignedIdent
      // might be a closure-captured variable accessed through a ref)
      if (fileText.includes('clearInterval(')) continue;
    }

    // Find nearest function-scope (ArrowFunction / Function / Method / SourceFile)
    let cur: Node | undefined = call.getParent();
    let inFn: Node | undefined;
    while (cur) {
      const k = cur.getKind();
      if (
        k === SyntaxKind.FunctionDeclaration ||
        k === SyntaxKind.MethodDeclaration ||
        k === SyntaxKind.ArrowFunction ||
        k === SyntaxKind.FunctionExpression ||
        k === SyntaxKind.SourceFile
      ) {
        inFn = cur;
        break;
      }
      cur = cur.getParent();
    }
    if (!inFn) continue;
    if (inFn.getText().includes('clearInterval')) continue;

    findings.push({
      file: filePath,
      line: call.getStartLineNumber(),
      pattern: 'Possibly leaked setInterval',
      detail: 'no matching clearInterval in enclosing scope or file',
      severity: severityFor(filePath, 'MEDIUM'),
    });
  }

  // ── Pattern 5: .then() without .catch() in the same chain ────────────
  // Skip when:
  //   - `void promise.then(...)`  (canonical fire-and-forget)
  //   - `.then()` lives inside `Promise.all/allSettled/race([...])` (the wrapper's
  //     .catch handles all promises in the array)
  //   - the chain has `.then(success, onRejected)` form
  //   - the call sits inside a `try {` block with a `catch` — the try-catch only
  //     helps for awaited promises, but most `.then()` inside try-blocks
  //     suggests the developer is opting in to error handling at a higher level
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
    const propName = (expr as { getName: () => string }).getName();
    if (propName !== 'then') continue;

    // Walk up the chain to the outermost CallExpression
    let chain: Node = call;
    let parent = chain.getParent();
    while (parent && parent.getKind() === SyntaxKind.PropertyAccessExpression) {
      const pp = parent.getParent();
      if (pp && pp.getKind() === SyntaxKind.CallExpression) {
        chain = pp;
        parent = pp.getParent();
      } else break;
    }

    // Skip if outer call is wrapped in `void`
    const outerParent = chain.getParent();
    if (outerParent && outerParent.getKind() === SyntaxKind.VoidExpression) continue;

    // Skip if `.then(success, onRejected)` two-arg form is used
    const callArgs = (call as CallExpression).getArguments();
    if (callArgs.length >= 2) continue;

    // Walk up further: is this chain an ELEMENT of a Promise.all/allSettled/race?
    // The pattern is: <CallExpression Promise.all> ([ <ArrayLiteral> [...promiseChain.then(...)] ])
    let containerCheck: Node | undefined = chain.getParent();
    while (containerCheck) {
      const ck = containerCheck.getKind();
      if (ck === SyntaxKind.ArrayLiteralExpression || ck === SyntaxKind.SpreadElement) {
        // Look for an enclosing Promise.all/allSettled/race CallExpression
        let outer: Node | undefined = containerCheck.getParent();
        while (outer) {
          if (outer.getKind() === SyntaxKind.CallExpression) {
            const callee = (outer as CallExpression).getExpression().getText();
            if (/^Promise\.(all|allSettled|race|any)$/.test(callee)) {
              // Promise.all/allSettled handle rejection at the wrapper level
              break;
            }
          }
          outer = outer.getParent();
        }
        // If we found a Promise.all wrapper, skip this finding
        if (outer && outer.getKind() === SyntaxKind.CallExpression) {
          const callee = (outer as CallExpression).getExpression().getText();
          if (/^Promise\.(all|allSettled|race|any)$/.test(callee)) {
            // Check that the wrapper itself has a .catch downstream OR is awaited / returned
            const wrapperParent = outer.getParent();
            const wrapperIsHandled = wrapperParent && (
              wrapperParent.getKind() === SyntaxKind.AwaitExpression ||
              wrapperParent.getKind() === SyntaxKind.ReturnStatement ||
              wrapperParent.getKind() === SyntaxKind.PropertyAccessExpression ||  // .catch / .then chain
              wrapperParent.getKind() === SyntaxKind.VariableDeclaration
            );
            if (wrapperIsHandled) {
              break;  // out of the while
            }
          }
        }
        break;
      }
      // Stop walking if we hit a function boundary
      if (
        ck === SyntaxKind.FunctionDeclaration ||
        ck === SyntaxKind.MethodDeclaration ||
        ck === SyntaxKind.ArrowFunction ||
        ck === SyntaxKind.FunctionExpression
      ) break;
      containerCheck = containerCheck.getParent();
    }
    // If the loop above broke after recognising a Promise.all wrapper, skip
    if (containerCheck && containerCheck.getKind() === SyntaxKind.ArrayLiteralExpression) {
      let outer: Node | undefined = containerCheck.getParent();
      while (outer) {
        if (outer.getKind() === SyntaxKind.CallExpression) {
          const callee = (outer as CallExpression).getExpression().getText();
          if (/^Promise\.(all|allSettled|race|any)$/.test(callee)) {
            // continue outer for-loop
            break;
          }
        }
        outer = outer.getParent();
      }
      if (outer && outer.getKind() === SyntaxKind.CallExpression) {
        const callee = (outer as CallExpression).getExpression().getText();
        if (/^Promise\.(all|allSettled|race|any)$/.test(callee)) continue;
      }
    }

    const chainText = chain.getText();
    if (chainText.includes('.catch(') || chainText.includes('.finally(')) continue;

    findings.push({
      file: filePath,
      line: call.getStartLineNumber(),
      pattern: '.then() without .catch()',
      detail: 'unhandled rejection if the promise rejects',
      severity: severityFor(filePath, 'MEDIUM'),
    });
  }
}

// ── Output Markdown ────────────────────────────────────────────────────

const date = new Date().toISOString().slice(0, 10);
const sha = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; } })();

console.log(`# G.14 — Async / Concurrency Audit (real)`);
console.log('');
console.log(`**Generated:** ${date} UTC`);
console.log(`**Commit:** \`${sha}\``);
console.log(`**Pattern:** G.14`);
console.log(`**Scanned:** ${scannedCount} TS/TSX files (server/services/, server/routes/, src/)`);
console.log(`**Findings:** ${findings.length}`);
console.log('');
console.log('> JavaScript concurrency bugs are non-deterministic and hard to reproduce.');
console.log('> HIGH = in route or critical-path service (orchestrator / prompt-builder / AAP / bundle / vault / agent).');
console.log('> MEDIUM = elsewhere in services. LOW = performance-only (sequential awaits in service loops).');
console.log('');

if (findings.length === 0) {
  console.log('✅ No async / concurrency findings.');
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
  console.log('Async hazards in user-facing routes or core services. Highest investigation priority.');
  console.log('');
  tablize(bySeverity.HIGH, 60);
}

if (bySeverity.MEDIUM.length > 0) {
  console.log('## MEDIUM — service-layer findings');
  console.log('');
  tablize(bySeverity.MEDIUM, 60);
}

if (bySeverity.LOW.length > 0) {
  console.log('## LOW — performance opportunities');
  console.log('');
  console.log('Sequential awaits in service loops. May be intentional (data dependencies) or could be parallelised. Verify.');
  console.log('');
  tablize(bySeverity.LOW, 30);
}

// Top files
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
console.log('**Cadence (per addendum §G.14):** weekly + per-PR on changed files; pre-release mandatory.');
console.log('');
console.log('**Acceptance:**');
console.log('- HIGH findings warrant a PR — either add the missing await / catch / clearInterval, or document why the bare call is safe.');
console.log('- MEDIUM findings go to the H.1 priority queue for triage.');
console.log('- LOW findings are perf opportunities; only worth fixing if the loop is a hot path.');
