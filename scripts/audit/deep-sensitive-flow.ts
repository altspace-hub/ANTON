/**
 * deep-sensitive-flow.ts — Pattern G.9 (real implementation)
 *
 * Sensitive-data flow tracing — finds places where PII / credentials /
 * regulated data may leak into:
 *   - Logs (console / pino / logger)
 *   - LLM prompts (system messages, user messages)
 *   - HTTP response bodies (cross-tenant leak risk if response shape unfiltered)
 *   - .anton bundle exports (consent gate may be missing)
 *   - AAP / external transport (TLS + signing presumed; verify)
 *
 * Uses a static taxonomy of sensitive identifiers + AST scanning. Doesn't
 * trace data-flow across function boundaries — produces CANDIDATES that
 * a human verifies. False-positive rate is real; the goal is high recall.
 *
 * Output: Markdown table with file:line citations + severity.
 */

import {
  Project,
  SyntaxKind,
  type SourceFile,
  type CallExpression,
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

// Sensitive-field taxonomy. Three buckets:
//   - CREDENTIAL: anything that could be replayed or used to impersonate
//   - PII: personal identifiers
//   - REGULATED: AML / FCP / compliance-relevant data
const CREDENTIAL_FIELDS = [
  'api_key', 'apikey', 'api_secret', 'secret_key', 'access_token', 'refresh_token',
  'session_token', 'auth_token', 'bearer_token', 'jwt', 'password', 'passwd',
  'private_key', 'privkey', 'private_key_encrypted', 'priv_hex',
  'client_secret', 'webhook_secret', 'signing_secret',
];

const PII_FIELDS = [
  'email', 'phone', 'phone_number', 'mobile', 'address', 'street_address',
  'date_of_birth', 'dob', 'birthdate', 'ssn', 'social_security_number',
  'passport', 'passport_number', 'national_id', 'tax_id', 'tin',
  'first_name', 'last_name', 'full_name', 'legal_name',
  'ip_address', 'device_id',
];

const REGULATED_FIELDS = [
  'beneficial_owner', 'beneficial_owner_data', 'ubo',
  'sar_data', 'str_data', 'cdd_data', 'edd_data', 'kyc_data',
  'salary', 'salary_history', 'compensation', 'aspiration',
  'medical_history', 'diagnosis', 'mental_health',
  'sanctioned', 'pep_status', 'sanction_match',
];

const ALL_SENSITIVE = [...CREDENTIAL_FIELDS, ...PII_FIELDS, ...REGULATED_FIELDS];
const SENSITIVE_RE = new RegExp(`\\b(${ALL_SENSITIVE.join('|')})\\b`, 'i');

// What categorises a field. For severity weighting.
function classify(name: string): 'credential' | 'pii' | 'regulated' | 'unknown' {
  const lc = name.toLowerCase();
  if (CREDENTIAL_FIELDS.some(f => lc.includes(f))) return 'credential';
  if (REGULATED_FIELDS.some(f => lc.includes(f))) return 'regulated';
  if (PII_FIELDS.some(f => lc.includes(f))) return 'pii';
  return 'unknown';
}

function severityForLeak(category: 'credential' | 'pii' | 'regulated' | 'unknown'): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (category === 'credential' || category === 'regulated') return 'HIGH';
  if (category === 'pii') return 'MEDIUM';
  return 'LOW';
}

let scannedCount = 0;

for (const sf of project.getSourceFiles()) {
  if (shouldSkip(sf)) continue;
  scannedCount++;
  const filePath = rel(sf);

  // ── Pattern 1: Sensitive data in logs ──────────────────────────────────
  // console.log/warn/error/info/debug or logger.X with arg containing a
  // sensitive identifier.
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    const isLogCall = /^(console\.(log|warn|error|info|debug|trace)|log\.(info|warn|error|debug|trace|fatal)|logger\.(info|warn|error|debug|trace|fatal))$/.test(exprText);
    if (!isLogCall) continue;
    const args = (call as CallExpression).getArguments();
    for (const arg of args) {
      const argText = arg.getText();
      const m = argText.match(SENSITIVE_RE);
      if (!m) continue;
      // Skip if the arg is JUST a string literal that mentions the field name in passing
      // ("[auth] Login attempt for user") — but flag if it INTERPOLATES the value
      // Heuristic: if the arg is a template literal AND contains ${var-with-sensitive-name}, flag
      // OR if the arg is a property access ending in a sensitive field, flag
      const k = arg.getKind();
      let isInterpolation = false;
      if (k === SyntaxKind.TemplateExpression) {
        // ${...} containing a sensitive name
        const spans = arg.getDescendantsOfKind(SyntaxKind.TemplateSpan);
        for (const s of spans) {
          if (SENSITIVE_RE.test(s.getText())) { isInterpolation = true; break; }
        }
      } else if (k === SyntaxKind.PropertyAccessExpression || k === SyntaxKind.ElementAccessExpression) {
        // Direct logging of `obj.api_key`
        isInterpolation = true;
      } else if (k === SyntaxKind.Identifier) {
        // Bare identifier with a sensitive name
        if (SENSITIVE_RE.test(argText)) isInterpolation = true;
      } else if (k === SyntaxKind.ObjectLiteralExpression) {
        // { api_key, ... } shorthand — sensitive value being logged
        isInterpolation = true;
      } else if (k === SyntaxKind.SpreadElement) {
        // Spread of an object containing sensitive fields — could leak
        isInterpolation = true;
      }
      if (!isInterpolation) continue;
      const sensitiveName = m[1];
      const cat = classify(sensitiveName);
      findings.push({
        file: filePath,
        line: call.getStartLineNumber(),
        pattern: `Sensitive value in log (${cat})`,
        detail: `\`${exprText}\` arg references \`${sensitiveName}\` — verify redaction`,
        severity: severityForLeak(cat),
      });
      break;  // one finding per call
    }
  }

  // ── Pattern 2: Sensitive value in HTTP response body ──────────────────
  // res.json(...) or res.send(...) where the arg references a sensitive field
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    if (!/^res\.(json|send)$/.test(exprText)) continue;
    const args = (call as CallExpression).getArguments();
    if (args.length === 0) continue;
    const argText = args[0].getText();
    const m = argText.match(SENSITIVE_RE);
    if (!m) continue;
    // Only flag if the field looks like it's being put INTO the response
    // (object literal / shorthand / spread of full row)
    const k = args[0].getKind();
    let possibleLeak = false;
    if (k === SyntaxKind.ObjectLiteralExpression) {
      // Check property assignments
      const props = args[0].getDescendantsOfKind(SyntaxKind.PropertyAssignment).concat(args[0].getDescendantsOfKind(SyntaxKind.ShorthandPropertyAssignment));
      for (const p of props) {
        if (SENSITIVE_RE.test(p.getText())) { possibleLeak = true; break; }
      }
    } else if (k === SyntaxKind.SpreadElement || k === SyntaxKind.Identifier) {
      possibleLeak = true;
    }
    if (!possibleLeak) continue;
    const sensitiveName = m[1];
    const cat = classify(sensitiveName);
    // Credentials in HTTP response body = HIGH always
    findings.push({
      file: filePath,
      line: call.getStartLineNumber(),
      pattern: `Sensitive value in HTTP response (${cat})`,
      detail: `\`${exprText}\` body references \`${sensitiveName}\` — verify field is intended public`,
      severity: severityForLeak(cat),
    });
  }

  // ── Pattern 3: Sensitive value in LLM prompt ──────────────────────────
  // messages.push({ role, content: `... ${sensitive} ...` })
  // OR system: `... ${sensitive} ...`
  // Look for messages/system string assignments containing sensitive interpolation
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    if (!/(\bmessages\.push|\bcallChat|\bstreamChat|\.create\b)/.test(exprText)) continue;
    const args = (call as CallExpression).getArguments();
    for (const arg of args) {
      // Walk inside object literals + template strings
      const text = arg.getText();
      if (!SENSITIVE_RE.test(text)) continue;
      // Ignore if the sensitive name is in a property KEY (description) but not in a value
      // Heuristic: look for template literal interpolation
      const templates = arg.getDescendantsOfKind(SyntaxKind.TemplateExpression);
      let interpolated = false;
      for (const t of templates) {
        const spans = t.getDescendantsOfKind(SyntaxKind.TemplateSpan);
        for (const s of spans) {
          if (SENSITIVE_RE.test(s.getText())) { interpolated = true; break; }
        }
        if (interpolated) break;
      }
      if (!interpolated) continue;
      const m = text.match(SENSITIVE_RE);
      if (!m) continue;
      const cat = classify(m[1]);
      findings.push({
        file: filePath,
        line: call.getStartLineNumber(),
        pattern: `Sensitive value in LLM call (${cat})`,
        detail: `\`${exprText}\` interpolates \`${m[1]}\` into prompt — verify redaction`,
        severity: severityForLeak(cat),
      });
      break;
    }
  }
}

// ── Output ────────────────────────────────────────────────────────────

const date = new Date().toISOString().slice(0, 10);
const sha = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; } })();

console.log(`# G.9 — Sensitive Data Flow Audit (real)`);
console.log('');
console.log(`**Generated:** ${date} UTC`);
console.log(`**Commit:** \`${sha}\``);
console.log(`**Pattern:** G.9`);
console.log(`**Scanned:** ${scannedCount} TS files (server/services/, server/routes/)`);
console.log(`**Findings:** ${findings.length}`);
console.log('');
console.log('> Static-taxonomy scan for PII / credential / regulated identifiers reaching:');
console.log('> - Logs (console.* / logger.*)');
console.log('> - HTTP response bodies (res.json / res.send)');
console.log('> - LLM prompts (messages.push / callChat / streamChat)');
console.log('>');
console.log('> **Severity weighting:** credential / regulated leak = HIGH; PII = MEDIUM; unknown = LOW.');
console.log('>');
console.log('> Each finding is a CANDIDATE — the audit doesn\'t trace data-flow across function');
console.log('> boundaries. False positives expected. Human triage required.');
console.log('');
console.log('**Sensitive identifier taxonomy:**');
console.log('');
console.log(`- **${CREDENTIAL_FIELDS.length} credential fields:** ${CREDENTIAL_FIELDS.slice(0, 8).join(', ')}, …`);
console.log(`- **${PII_FIELDS.length} PII fields:** ${PII_FIELDS.slice(0, 8).join(', ')}, …`);
console.log(`- **${REGULATED_FIELDS.length} regulated fields:** ${REGULATED_FIELDS.slice(0, 8).join(', ')}, …`);
console.log('');

if (findings.length === 0) {
  console.log('✅ No sensitive-flow findings.');
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
  console.log('## HIGH — credential / regulated data candidates');
  console.log('');
  console.log('Investigate first. Each is a candidate for credential leak / regulated-data exposure.');
  console.log('');
  tablize(bySeverity.HIGH, 50);
}

if (bySeverity.MEDIUM.length > 0) {
  console.log('## MEDIUM — PII candidates');
  console.log('');
  tablize(bySeverity.MEDIUM, 40);
}

if (bySeverity.LOW.length > 0) {
  console.log('## LOW — unclassified sensitive-named identifiers');
  console.log('');
  tablize(bySeverity.LOW, 20);
}

console.log('---');
console.log('');
console.log('**Cadence (per addendum §G.9):** pre-release mandatory; quarterly; on every new pillar.');
console.log('');
console.log('**Acceptance:**');
console.log('- HIGH: triage every credential / regulated finding before pre-release.');
console.log('- MEDIUM: triage PII findings before any GDPR / EU AI Act review.');
console.log('- Each verified finding gets a fix (redaction / hashing / removal) OR a documented exception.');
