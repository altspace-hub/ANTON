/**
 * deep-priority-queue.ts — Pattern H.1
 *
 * Aggregator: parses all docs/audit/deep/*.md outputs, extracts findings,
 * scores each, writes top 20 to docs/audit/deep/_priority-queue.md.
 *
 * Per Addendum 2 §H.1 scoring formula:
 *   - Severity: HIGH=3, MEDIUM=2, LOW=1
 *   - Blast radius: count of files affected (1–N)
 *   - User-facing multiplier: 2x if route or page
 *   - Regulated multiplier: 3x if compliance / audit / regulator-relevant path
 *
 * Output is grouped by (audit, severity) and ranked.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';

interface ParsedFinding {
  audit: string;          // e.g. "G.10 contract-inference"
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  file: string;           // e.g. "server/routes/auth.ts"
  line: number;
  pattern: string;        // e.g. "Forgotten await"
  detail: string;
}

interface ScoredFinding extends ParsedFinding {
  score: number;
  scoreBreakdown: string;
  isUserFacing: boolean;
  isRegulated: boolean;
}

const PROJECT_ROOT = process.cwd();
const DEEP_DIR = join(PROJECT_ROOT, 'docs/audit/deep');

if (!existsSync(DEEP_DIR)) {
  console.error(`Deep audit dir not found: ${DEEP_DIR}`);
  process.exit(1);
}

// ── Audit metadata ───────────────────────────────────────────────────────
// Maps audit filename → display label + pattern code.
const AUDIT_META: Record<string, { code: string; label: string }> = {
  'sensitive-flow.md':       { code: 'G.9',  label: 'Sensitive data flow' },
  'contract-inference.md':   { code: 'G.10', label: 'Contract inference' },
  'db-access.md':            { code: 'G.11', label: 'DB access patterns' },
  'prompt-assembly.md':      { code: 'G.12', label: 'Prompt assembly' },
  'llm-parity.md':           { code: 'G.13', label: 'LLM provider parity' },
  'async-audit.md':          { code: 'G.14', label: 'Async / concurrency' },
  'error-paths.md':          { code: 'G.15', label: 'Error paths' },
  'cost-economics.md':       { code: 'G.16', label: 'Cost & token economics' },
  'migration-history.md':    { code: 'G.17', label: 'Migration history' },
  'dead-code.md':            { code: 'G.18', label: 'Dead code' },
};

// ── Parse a Markdown audit output for findings ─────────────────────────
// Heuristic: look for tables under HIGH / MEDIUM / LOW sections with the
// shape | `file` | line | … |. Falls back to "no findings" sections.

interface SeveritySection {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  rows: string[];
}

function extractSeveritySections(md: string): SeveritySection[] {
  const sections: SeveritySection[] = [];
  let current: SeveritySection | null = null;
  for (const line of md.split('\n')) {
    // ## HIGH …  / ## MEDIUM … / ## LOW …  → start a new section
    const headingMatch = line.match(/^##\s+(HIGH|MEDIUM|LOW)\b/i);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { severity: headingMatch[1].toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW', rows: [] };
      continue;
    }
    // Any other ## heading or `---` separator ends the current section
    if (/^##\s/.test(line) || /^---\s*$/.test(line)) {
      if (current) { sections.push(current); current = null; }
      continue;
    }
    // Inside a section: accumulate table data rows (skip header / separator)
    if (current && /^\|/.test(line)) {
      if (/^\|\s*[-:]+(\s*\|)/.test(line)) continue;      // separator row (--- or :--- etc.)
      if (/^\|\s*File\s*\|/i.test(line)) continue;        // header row
      if (/^\|\s*Severity\s*\|/i.test(line)) continue;    // severity-rollup header (different table)
      if (/^\|\s*Pattern\s*\|/i.test(line)) continue;     // by-pattern header (different table)
      current.rows.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

/**
 * Fallback parser for audits that emit code-block findings instead of tables.
 * Recognises:
 *   - `## N. <Section>` style headings (e.g. error-paths.md "## 1. Silent catches")
 *   - Inferred severity from prose (`**Severity:** HIGH` near the section)
 *   - Code-block lines in grep-style `file/path.ts:123:content` format
 */
interface CodeBlockFinding {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  file: string;
  line: number;
  pattern: string;
  detail: string;
}

function extractCodeBlockFindings(md: string, defaultPattern: string): CodeBlockFinding[] {
  const out: CodeBlockFinding[] = [];
  const lines = md.split('\n');
  let currentSectionTitle = '';
  let currentSeverity: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Numbered or named section heading: `## 1. Silent catches`, `## Stack-trace leakage`, etc.
    const sectionMatch = line.match(/^##\s+(\d+\.\s+)?(.+?)\s*$/);
    if (sectionMatch && !inCodeBlock) {
      currentSectionTitle = sectionMatch[2];
      // Reset severity to MEDIUM at each section; it'll get refined by the next prose line
      currentSeverity = 'MEDIUM';
      // Look ahead a few lines for severity hints in the prose
      for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
        const probe = lines[j];
        if (/^##\s/.test(probe)) break;
        const sevHint = probe.match(/\*\*Severity:\*\*\s+(HIGH|MEDIUM|LOW)\b/i);
        if (sevHint) {
          currentSeverity = sevHint[1].toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW';
          break;
        }
        // Phrases like "HIGH if in critical path" — interpret as HIGH-eligible
        if (/severity:.*HIGH\b/i.test(probe)) { currentSeverity = 'HIGH'; break; }
      }
      continue;
    }
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock) continue;
    // Match grep-style `file:lineno:content` or `file:lineno`
    // File path can have slashes, dots, hyphens, underscores. Line must be all-digits.
    const grepMatch = line.match(/^([\w./@\-]+\.[a-z]+):(\d+)(?::(.*))?$/);
    if (!grepMatch) continue;
    const file = grepMatch[1];
    const lineNum = parseInt(grepMatch[2], 10);
    if (isNaN(lineNum)) continue;
    // Only count it if the file path looks plausibly like a project file
    if (!file.startsWith('server/') && !file.startsWith('src/') && !file.startsWith('scripts/') && !file.startsWith('docs/') && !file.startsWith('tests/')) {
      // Could still be a project file (root-level config); allow but mark generically
      if (!/^[a-z][\w./-]+\.(ts|tsx|js|sql|md|json|sh)$/.test(file)) continue;
    }
    const detail = (grepMatch[3] ?? '').trim().slice(0, 100);
    out.push({
      severity: currentSeverity,
      file,
      line: lineNum,
      pattern: currentSectionTitle || defaultPattern,
      detail,
    });
  }
  return out;
}

function parseRow(row: string): { file: string; line: number; pattern: string; detail: string } | null {
  // Match | `file/path.ts` | 123 | Pattern | detail |
  // or    | `file/path.ts` | 123 | `fn` | declared | issue |
  const cells = row.split('|').slice(1, -1).map(c => c.trim());
  if (cells.length < 3) return null;
  const fileMatch = cells[0].match(/^`([^`]+)`$/);
  if (!fileMatch) return null;
  const file = fileMatch[1];
  const line = parseInt(cells[1], 10);
  if (isNaN(line)) return null;
  // Pattern: column 3 if 4-cell row (file|line|pattern|detail), or "function" for contract-inference
  const pattern = (cells[2] || '').replace(/^`|`$/g, '');
  // Detail: everything after column 3, joined with " · "
  const detail = cells.slice(3).join(' · ').trim();
  return { file, line, pattern, detail };
}

// ── Scoring ─────────────────────────────────────────────────────────────

function isUserFacing(filePath: string): boolean {
  return filePath.includes('server/routes/')
    || filePath.includes('src/pages/')
    || filePath.includes('src/app/pages/')        // companion app pages
    || filePath.includes('src/features/')         // feature surfaces
    || filePath.includes('src/components/')       // shared user-visible components
    || filePath.includes('src/App.tsx');
}

function isRegulated(filePath: string): boolean {
  // Compliance / audit / regulator-relevant code paths.
  // Long terms can be substring-matched; short acronyms (sar, str, cdd, edd, kyc, fcp, aml)
  // need word boundaries — without them, `str` matches `Orche{str}ation`, `cdd` matches
  // `Add{cdd}` etc. The `\b` requires a non-word boundary on each side, which lines up
  // with directory separators and case transitions in path segments.
  return /risk-atlas|sanctions|gdpr|evidence-pack|credential-vault|audit|compliance|beneficial[-_]owner/i.test(filePath)
    || /\b(fcp|aml|sar|str|cdd|edd|kyc)\b/i.test(filePath)
    || /[/_\-](fcp|aml|sar|str|cdd|edd|kyc)[/_\-.]/i.test(filePath);
}

function score(f: ParsedFinding, blastRadius: number): { score: number; breakdown: string; userFacing: boolean; regulated: boolean } {
  const sevWeight = f.severity === 'HIGH' ? 3 : f.severity === 'MEDIUM' ? 2 : 1;
  const userFacing = isUserFacing(f.file);
  const regulated = isRegulated(f.file);
  const userMul = userFacing ? 2 : 1;
  const regMul = regulated ? 3 : 1;
  const s = sevWeight * Math.min(blastRadius, 50) * userMul * regMul;
  const parts = [`sev=${sevWeight}`, `blast=${Math.min(blastRadius, 50)}`];
  if (userFacing) parts.push('userFacing×2');
  if (regulated) parts.push('regulated×3');
  return { score: s, breakdown: parts.join(' · '), userFacing, regulated };
}

// ── Run ─────────────────────────────────────────────────────────────────

const auditFiles = readdirSync(DEEP_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));

const allFindings: ParsedFinding[] = [];
const auditCounts: Record<string, { high: number; medium: number; low: number; status: string }> = {};

for (const auditFile of auditFiles) {
  const meta = AUDIT_META[auditFile];
  if (!meta) continue;
  const md = readFileSync(join(DEEP_DIR, auditFile), 'utf-8');

  // Detect stub state — stubs print "STUB — TODO" near the top
  const isStub = /\(STUB — TODO\)|\bStatus:\*\*\s*Skeleton only/i.test(md);

  if (isStub) {
    auditCounts[`${meta.code} ${meta.label}`] = { high: 0, medium: 0, low: 0, status: 'STUB' };
    continue;
  }

  const sections = extractSeveritySections(md);
  let high = 0, medium = 0, low = 0;
  let parsedFromTables = 0;
  for (const s of sections) {
    for (const row of s.rows) {
      const parsed = parseRow(row);
      if (!parsed) continue;
      parsedFromTables++;
      allFindings.push({
        audit: `${meta.code} ${meta.label}`,
        severity: s.severity,
        file: parsed.file,
        line: parsed.line,
        pattern: parsed.pattern,
        detail: parsed.detail,
      });
      if (s.severity === 'HIGH') high++;
      else if (s.severity === 'MEDIUM') medium++;
      else low++;
    }
  }

  // Fallback: audits like G.15 emit findings as `file:line:content` lines
  // inside fenced code blocks under "## N. Section name" headings. If the
  // table-mode parser yielded nothing, try the code-block parser.
  if (parsedFromTables === 0) {
    const cbFindings = extractCodeBlockFindings(md, meta.label);
    for (const cf of cbFindings) {
      allFindings.push({
        audit: `${meta.code} ${meta.label}`,
        severity: cf.severity,
        file: cf.file,
        line: cf.line,
        pattern: cf.pattern,
        detail: cf.detail,
      });
      if (cf.severity === 'HIGH') high++;
      else if (cf.severity === 'MEDIUM') medium++;
      else low++;
    }
  }

  auditCounts[`${meta.code} ${meta.label}`] = { high, medium, low, status: 'real' };
}

// ── Dedup by (file, pattern) → one row, with callsite count + first line ─
// Without this, 22 identical-pattern findings on engagements.ts:logChange
// fill ranks 1-20 and obscure cross-file leverage.
interface DedupedFinding extends ParsedFinding {
  callsiteCount: number;     // how many findings collapsed into this row
  firstLine: number;         // first occurrence
  blastRadius: number;       // distinct files affected by this (audit, pattern) tuple
}

const groupKey = (f: ParsedFinding) => `${f.audit}\0${f.file}\0${f.pattern}`;
const groups = new Map<string, ParsedFinding[]>();
for (const f of allFindings) {
  const key = groupKey(f);
  const arr = groups.get(key);
  if (arr) arr.push(f); else groups.set(key, [f]);
}

// blast_radius now = distinct files affected by this (audit, pattern)
const patternFileSpread = new Map<string, Set<string>>();
for (const f of allFindings) {
  const k = `${f.audit}\0${f.pattern}`;
  let set = patternFileSpread.get(k);
  if (!set) { set = new Set(); patternFileSpread.set(k, set); }
  set.add(f.file);
}

const deduped: DedupedFinding[] = [];
for (const [, group] of groups) {
  group.sort((a, b) => a.line - b.line);
  const first = group[0];
  const k = `${first.audit}\0${first.pattern}`;
  deduped.push({
    ...first,
    callsiteCount: group.length,
    firstLine: first.line,
    blastRadius: patternFileSpread.get(k)?.size ?? 1,
  });
}

const scored: (ScoredFinding & { callsiteCount: number; blastRadius: number })[] = deduped.map(f => {
  // Score: severity × callsite-count × user-facing × regulated.
  // The callsite-count substitutes for the old "lines on same file" blast,
  // because dedup collapsed those — now scoring over the actual fan-out.
  const sc = score(f, f.callsiteCount);
  return {
    ...f,
    score: sc.score,
    scoreBreakdown: sc.breakdown.replace(`blast=${Math.min(f.callsiteCount, 50)}`, `callsites=${f.callsiteCount} · spread=${f.blastRadius}`),
    isUserFacing: sc.userFacing,
    isRegulated: sc.regulated,
  };
});

scored.sort((a, b) => b.score - a.score);

// ── Output ──────────────────────────────────────────────────────────────

const date = new Date().toISOString().slice(0, 10);
const sha = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; } })();

console.log('# Priority Queue (H.1)');
console.log('');
console.log(`**Generated:** ${date} UTC`);
console.log(`**Commit:** \`${sha}\``);
console.log(`**Aggregates:** ${Object.keys(auditCounts).length} audits in \`docs/audit/deep/\``);
console.log('');
console.log('Scoring formula (per Addendum 2 §H.1, with dedup applied):');
console.log('');
console.log('```');
console.log('Findings are deduplicated by (audit, file, pattern) — many lines of');
console.log('the same pattern in the same file collapse into ONE queue entry');
console.log('with a callsite count.');
console.log('');
console.log('score = severity × min(callsites, 50) × user_facing × regulated');
console.log('  severity:        HIGH=3 | MEDIUM=2 | LOW=1');
console.log('  callsites:       lines collapsed into this entry (capped at 50)');
console.log('  user_facing:     ×2 if server/routes/, src/pages/, src/app/pages/, src/features/, src/components/, App.tsx');
console.log('  regulated:       ×3 if risk-atlas|fcp|aml|sanctions|gdpr|evidence-pack|credential-vault|audit|compliance|kyc');
console.log('  spread (informational): distinct files affected by this (audit, pattern) tuple');
console.log('```');
console.log('');

// ── Audit status table ──────────────────────────────────────────────────
console.log('## Audit status');
console.log('');
console.log('| Pattern | Status | HIGH | MEDIUM | LOW |');
console.log('|---|---|---|---|---|');
for (const [audit, counts] of Object.entries(auditCounts).sort()) {
  console.log(`| ${audit} | ${counts.status} | ${counts.high} | ${counts.medium} | ${counts.low} |`);
}
const totalHigh = Object.values(auditCounts).reduce((a, c) => a + c.high, 0);
const totalMedium = Object.values(auditCounts).reduce((a, c) => a + c.medium, 0);
const totalLow = Object.values(auditCounts).reduce((a, c) => a + c.low, 0);
console.log(`| **TOTAL** | — | **${totalHigh}** | **${totalMedium}** | **${totalLow}** |`);
console.log('');

if (scored.length === 0) {
  console.log('## ✅ No findings to triage');
  console.log('');
  console.log('Either every audit is a stub, or no audit produced parseable findings.');
  console.log('');
  console.log('**Action:** ship more deep audits (G.9 / G.11 / G.12 / G.13 / G.16) to populate the queue.');
  process.exit(0);
}

// ── Top 20 findings ─────────────────────────────────────────────────────
console.log('## Top 20 ranked findings (deduplicated)');
console.log('');
console.log('| Rank | Score | Audit | Severity | File | Callsites | First line | Pattern | Detail | Score breakdown |');
console.log('|---|---|---|---|---|---|---|---|---|---|');

const top = scored.slice(0, 20);
for (let i = 0; i < top.length; i++) {
  const f = top[i];
  const sevBadge = f.severity === 'HIGH' ? '🔴 HIGH' : f.severity === 'MEDIUM' ? '🟡 MEDIUM' : '🟢 LOW';
  const detailShort = f.detail.length > 50 ? f.detail.slice(0, 47) + '…' : f.detail;
  const callsiteCell = f.callsiteCount > 1 ? `**${f.callsiteCount}×**` : '1';
  console.log(`| ${i + 1} | ${f.score} | ${f.audit} | ${sevBadge} | \`${f.file}\` | ${callsiteCell} | ${f.line} | ${f.pattern} | ${detailShort} | ${f.scoreBreakdown} |`);
}
console.log('');

// ── Top files (most-touched) ────────────────────────────────────────────
console.log('## Files with most findings (across all audits)');
console.log('');
console.log('| File | Total findings | Score sum |');
console.log('|---|---|---|');
const fileScoreMap = new Map<string, number>();
const fileFindingCount = new Map<string, number>();
for (const f of scored) {
  fileScoreMap.set(f.file, (fileScoreMap.get(f.file) ?? 0) + f.score);
  fileFindingCount.set(f.file, (fileFindingCount.get(f.file) ?? 0) + f.callsiteCount);
}
const topFiles = [...fileScoreMap.entries()]
  .map(([file, scoreSum]) => ({ file, scoreSum, count: fileFindingCount.get(file) ?? 0 }))
  .sort((a, b) => b.scoreSum - a.scoreSum)
  .slice(0, 15);
for (const { file, scoreSum, count } of topFiles) {
  console.log(`| \`${file}\` | ${count} | ${scoreSum} |`);
}
console.log('');

// ── Per-pattern breakdown ───────────────────────────────────────────────
console.log('## Findings by pattern');
console.log('');
const patternCounts = new Map<string, number>();
for (const f of scored) {
  const key = `${f.audit} — ${f.pattern}`;
  patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
}
console.log('| Audit · Pattern | Count |');
console.log('|---|---|');
for (const [k, n] of [...patternCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`| ${k} | ${n} |`);
}
console.log('');

// ── Footer ──────────────────────────────────────────────────────────────
console.log('---');
console.log('');
console.log('## How to use this queue');
console.log('');
console.log('1. **Triage top-N by score.** The top 20 are the highest-leverage fixes (severity × blast × user-facing × regulated).');
console.log('2. **Pick 3-5 to ship per cycle.** Each fix gets a PR linked to a proposal in `docs/audit/deep/proposals/<finding-id>.md`.');
console.log('3. **After the fix lands, re-run the relevant audit** to confirm the finding cleared.');
console.log('4. **Re-run this queue weekly** to surface drift.');
console.log('');
console.log('Per Addendum 2 §H.3 — this is the engine that turns deep-audit findings into continuous improvement work.');
