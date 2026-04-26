/**
 * deep-cost-economics.ts — Pattern G.16 (real implementation)
 *
 * Cost & token economics audit. Catches the highest-leverage cost risks
 * for an LLM-driven product:
 *
 *   1. **Unauthed routes that invoke an LLM** (cost amplification surface
 *      for abuse — single API key, unauthenticated trigger)
 *   2. **Mission auto-execution without spend caps** (Phase-3/4 autonomy
 *      with no per-day or per-mission budget cap = "your AI burned $50k overnight")
 *   3. **Workflow recursion without termination guard** (workflow that
 *      schedules itself can run forever)
 *   4. **IRE invocation without iteration ceiling** (deep iterative
 *      reasoning loop with no max-depth)
 *   5. **Routes that invoke LLM in a loop without per-request cap**
 *
 * NOT detected (would need runtime data):
 *   - Cache hit rate
 *   - Per-route cost projection vs rate-card
 *   - Cost-tier mismatches (Opus where Haiku suffices)
 *
 * Output: Markdown table with file:line citations.
 */

import {
  Project,
  SyntaxKind,
  type SourceFile,
  type CallExpression,
} from 'ts-morph';
import { readFileSync, existsSync } from 'fs';
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

// Read server/index.ts (the route mounter) so we can detect mount-level
// auth / rate-limit middleware (e.g. `app.use('/api/claude/message', claudeLimiter)`).
let indexContent = '';
try { indexContent = readFileSync(`${PROJECT_ROOT}/server/index.ts`, 'utf-8'); } catch { /* no-op */ }

/** Map a route filename to the mount-level middleware applied to it in index.ts. */
function hasMountLevelGuardForFile(routeFile: string): boolean {
  if (!indexContent) return false;
  // Heuristic: extract base name like `claude` from `server/routes/claude.ts`
  const baseMatch = routeFile.match(/server\/routes\/([a-z0-9_-]+)\.ts$/);
  if (!baseMatch) return false;
  const base = baseMatch[1];
  // Look for any `app.use('/api/<base>...', ratelimit/auth)` line
  const lineRe = new RegExp(`app\\.use\\([^)]*['\"]/api/${base}[/'\"]?[^)]*?(?:Limiter|Auth|requireAuth|authMiddleware|claudeLimiter)`, 'm');
  return lineRe.test(indexContent);
}

function rel(file: SourceFile): string {
  return file.getFilePath().replace(PROJECT_ROOT.replace(/\\/g, '/'), '').replace(/\\/g, '/').replace(/^\//, '');
}

function shouldSkip(file: SourceFile): boolean {
  const p = file.getFilePath();
  return p.includes('node_modules') || p.includes('.test.') || p.includes('/dist/') || p.includes('/build/');
}

// LLM-invocation symbol patterns. Match the project's known unified clients +
// raw provider SDKs.
const LLM_CALL_PATTERNS = [
  /\bunifiedLlmClient\b/,
  /\bunified-llm-client\b/,
  /\bclaudeClient\b/,
  /\bclaude-client\b/,
  /\binvokeLLM\b/,
  /\bcallChat\b/,
  /\bstreamChat\b/,
  /\banthropic\.messages\.create\b/,
  /\banthropic\.completions\.create\b/,
  /\bopenai\.chat\.completions\b/,
  /\bopenai\.completions\b/,
  /\.invokeWith\(/,             // adapters
  /\.callWith\(/,
  /\.chatStream\(/,
  /\bcreateClaude\(/,
];

const AUTH_PATTERNS = [
  /\brequireAuth\b/,
  /\bauthMiddleware\b/,
  /\bensureAtlas\w*Access\b/,
  /\bensureAuthenticated\b/,
  /\brequireAdmin\b/,
  /\bcsrfProtection\b/,
  /\breq\.user\??\.\w+/,                     // inline `req.user.id` check is a soft auth gate
  /\bgetUserId\s*\(\s*req\s*\)/,             // helper that throws if no user
];

// A rate-limit mount (not full auth, but does cap cost amplification)
const RATE_LIMIT_PATTERNS = [
  /\brateLimit\b/,
  /\brateLimiter\b/,
  /\bclaudeLimiter\b/,
  /\bexpress-rate-limit\b/,
  /\bllmRateLimit\b/,
];

const SPEND_CAP_PATTERNS = [
  /\bspend_?cap\b/i,
  /\bmax_?cost\b/i,
  /\bcost_?limit\b/i,
  /\btoken_?budget\b/i,
  /\bbudget_?max\b/i,
  /\bmax_?budget\b/i,
  /\bcheckSpending\b/,
  /\bdaily_?limit\b/i,
  /\brequire_?approval_?above\b/i,
];

let scannedCount = 0;

for (const sf of project.getSourceFiles()) {
  if (shouldSkip(sf)) continue;
  scannedCount++;
  const filePath = rel(sf);
  const fileText = sf.getFullText();
  const isRoute = filePath.includes('server/routes/');
  const isMissionService = filePath.includes('server/services/missions/');

  // ── Pattern 1: Unauthed routes that invoke LLM ─────────────────────────
  if (isRoute) {
    const hasLlmCall = LLM_CALL_PATTERNS.some(re => re.test(fileText));
    const hasAuth = AUTH_PATTERNS.some(re => re.test(fileText));
    const hasFileLevelRateLimit = RATE_LIMIT_PATTERNS.some(re => re.test(fileText));
    const hasMountLevelGuard = hasMountLevelGuardForFile(filePath);

    if (hasLlmCall && !hasAuth && !hasFileLevelRateLimit && !hasMountLevelGuard) {
      // Find the first LLM call line for citation
      let firstLlmLine = 1;
      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const text = call.getText();
        if (LLM_CALL_PATTERNS.some(re => re.test(text))) {
          firstLlmLine = call.getStartLineNumber();
          break;
        }
      }
      findings.push({
        file: filePath,
        line: firstLlmLine,
        pattern: 'Unauthed route invokes LLM',
        detail: 'no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface',
        severity: 'HIGH',
      });
    } else if (hasLlmCall && !hasAuth && (hasFileLevelRateLimit || hasMountLevelGuard)) {
      // Cost is rate-capped but identity isn't checked — still worth surfacing as MEDIUM
      findings.push({
        file: filePath,
        line: 1,
        pattern: 'LLM route guarded only by rate limit',
        detail: 'rate-limited but no auth — bounded blast radius, but still a public LLM endpoint',
        severity: 'MEDIUM',
      });
    }
  }

  // ── Pattern 2: Mission auto-execution without spend cap ────────────────
  if (isMissionService) {
    const hasAutoExec = /\bauto_?execute\b/i.test(fileText) || /\bautoExecute\b/.test(fileText) || /\borchestrator_?phase\b/i.test(fileText);
    const hasSpendCap = SPEND_CAP_PATTERNS.some(re => re.test(fileText));
    if (hasAutoExec && !hasSpendCap) {
      findings.push({
        file: filePath,
        line: 1,
        pattern: 'Mission auto-execution without spend cap',
        detail: 'autoExecute / orchestrator_phase referenced but no spend_cap / max_cost / token_budget guard found',
        severity: 'HIGH',
      });
    }
  }

  // ── Pattern 3: Workflow recursion without termination guard ────────────
  // Heuristic: file references workflow scheduling AND calls itself indirectly
  // Look for `scheduleWorkflow` / `workflow.run` / `enqueue` patterns near the
  // top-level function definitions. If the same function name is also
  // *invoked* in the file, that's a self-scheduling pattern. Add this as
  // a low-confidence MEDIUM for now.
  const isWorkflowEngine = /workflow|scheduler|cron/i.test(filePath);
  if (isWorkflowEngine) {
    if (/\bscheduleNext\b|\bscheduleSelf\b|\benqueueAgain\b/.test(fileText)) {
      // Look for terminate / max_runs / iteration_count guards
      if (!/\bmax_?runs\b|\biteration_?count\b|\bmax_?iter\b|\bterminate\b/i.test(fileText)) {
        findings.push({
          file: filePath,
          line: 1,
          pattern: 'Workflow self-scheduling without iteration guard',
          detail: 'scheduleNext/scheduleSelf referenced but no max_runs / iteration_count / terminate guard',
          severity: 'MEDIUM',
        });
      }
    }
  }

  // ── Pattern 4: IRE depth without ceiling ───────────────────────────────
  // IRE (iterative reasoning engine) — look for invocations whose options
  // don't include max_depth / max_iter
  if (/iterative-reasoning|ire-engine|iterative_reasoning/i.test(fileText)) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const text = call.getText();
      if (!/\b(runIRE|invokeIRE|iterativeReason|runIterative)\b/.test(text)) continue;
      if (!/max_?depth|max_?iter|maxIterations|max_?steps/i.test(text)) {
        findings.push({
          file: filePath,
          line: call.getStartLineNumber(),
          pattern: 'IRE invocation without max_depth ceiling',
          detail: 'iterative reasoning called without explicit iteration cap',
          severity: 'HIGH',
        });
      }
    }
  }

  // ── Pattern 5: LLM invocation inside a loop without per-call cap ───────
  for (const loop of sf.getDescendantsOfKind(SyntaxKind.ForOfStatement)
    .concat(sf.getDescendantsOfKind(SyntaxKind.ForStatement))
    .concat(sf.getDescendantsOfKind(SyntaxKind.WhileStatement))
  ) {
    const body = loop.getStatement().getText();
    if (LLM_CALL_PATTERNS.some(re => re.test(body))) {
      // Check if there's a budget / cap reference in the loop body
      if (!SPEND_CAP_PATTERNS.some(re => re.test(body)) && !/\bmaxTokens\b|\bmax_tokens\b/.test(body)) {
        findings.push({
          file: filePath,
          line: loop.getStartLineNumber(),
          pattern: 'LLM call in loop without explicit cap',
          detail: 'loop body invokes LLM without an iteration-aware budget guard — fan-out cost risk',
          severity: isRoute ? 'HIGH' : 'MEDIUM',
        });
      }
    }
  }
}

// ── Output ────────────────────────────────────────────────────────────

const date = new Date().toISOString().slice(0, 10);
const sha = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; } })();

console.log(`# G.16 — Cost & Token Economics Audit (real)`);
console.log('');
console.log(`**Generated:** ${date} UTC`);
console.log(`**Commit:** \`${sha}\``);
console.log(`**Pattern:** G.16`);
console.log(`**Scanned:** ${scannedCount} TS files (server/services/, server/routes/)`);
console.log(`**Findings:** ${findings.length}`);
console.log('');
console.log('> The headline risk: a single missing cap on Phase 4 autonomous mission execution');
console.log('> is "your AI agent burned $50,000 in one weekend." This audit catches:');
console.log('> 1) routes that trigger LLM calls without auth (cost-amplification abuse surface),');
console.log('> 2) mission auto-execution without spend caps,');
console.log('> 3) workflow recursion without termination guards,');
console.log('> 4) IRE invocations without iteration ceilings,');
console.log('> 5) LLM calls inside loops without per-iteration cost guards.');
console.log('');
console.log('NOT detected (require runtime data): cache hit rates, per-route cost projection,');
console.log('cost-tier mismatches (Opus where Haiku suffices).');
console.log('');

if (findings.length === 0) {
  console.log('✅ No cost-economics findings.');
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
  console.log('## HIGH — drop-everything risks');
  console.log('');
  tablize(bySeverity.HIGH, 60);
}

if (bySeverity.MEDIUM.length > 0) {
  console.log('## MEDIUM');
  console.log('');
  tablize(bySeverity.MEDIUM, 40);
}

console.log('---');
console.log('');
console.log('**Cadence (per addendum §G.16):** monthly + pre-release + after any new auto-execution feature.');
console.log('');
console.log('**Acceptance:**');
console.log('- HIGH: drop-everything fix. Unauthed LLM routes need requireAuth or rate-limit middleware.');
console.log('- HIGH: missing spend cap on auto-execution → wire `checkSpending(amount)` before each LLM call.');
console.log('- MEDIUM: workflow recursion / loop-LLM patterns — add max_runs guard or per-call cost-tracking.');
