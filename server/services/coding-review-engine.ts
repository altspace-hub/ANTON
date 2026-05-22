import type { DatabaseAdapter } from '../db/database.js';
import { createHash, randomUUID } from 'crypto';

// ── Types ──────────────────────────────────────────────────

export type ReviewLens = 'developer' | 'security' | 'compliance' | 'product' | 'architecture' | 'dependency_audit';
export type ExplanationLevel = 'high' | 'medium' | 'deep';
export type SecurityMode = 'vulnerability' | 'pentest_planning' | 'red_blue_team' | 'nist_csf' | 'iso_27001' | 'dora';

export interface StartReviewConfig {
  sourceType: 'paste' | 'directory' | 'repository';
  code: string;
  files?: Array<{ path: string; content: string }>;
  sourcePath?: string;
  sourceUrl?: string;
  explanationLevel?: ExplanationLevel;
  reviewLenses?: ReviewLens[];
  securityMode?: SecurityMode;
  sessionId?: string;
  projectId?: string;
}

export interface StartReviewResult {
  reviewSessionId: string;
  systemPromptOverride: string;
  userMessage: string;
  suggestedThinking: string;
  suggestedCreativity: 'strict' | 'balanced' | 'creative';
  suggestedPersonas: string[];
}

export interface ReviewSessionRow {
  id: string;
  session_id: string | null;
  project_id: string | null;
  source_type: string;
  source_path: string | null;
  source_url: string | null;
  explanation_level: string;
  review_lenses: string[];
  security_mode: string | null;
  file_hashes: Record<string, string>;
  findings_summary: Record<string, unknown>;
  previous_session_id: string | null;
  is_diff_review: boolean;
  diff_summary: string | null;
  tokens_consumed: { input: number; output: number; cost_usd: number };
  created_at: string;
  updated_at: string;
}

export async function createCodingReviewEngine(db: DatabaseAdapter) {
  /**
   * Map review lenses to persona IDs for prompt composition
   */
  function mapLensToPersona(lens: string): { personaId: string; areaContext?: string } {
    const mapping: Record<string, { personaId: string; areaContext?: string }> = {
      developer: { personaId: 'senior-engineer', areaContext: 'software-eng' },
      security: { personaId: 'cyber-expert', areaContext: 'cyber' },
      compliance: { personaId: 'fcp-expert', areaContext: 'fcp' },
      product: { personaId: 'product-manager' },
      architecture: { personaId: 'solutions-architect', areaContext: 'software-eng' },
      dependency_audit: { personaId: 'cyber-expert', areaContext: 'software-eng' },
    };
    return mapping[lens] || { personaId: 'senior-engineer' };
  }

  /**
   * Compute file hashes for diff detection
   */
  function computeFileHashes(files: Array<{ path: string; content: string }>): Record<string, string> {
    const hashes: Record<string, string> = {};
    for (const file of files) {
      hashes[file.path] = createHash('sha256').update(file.content).digest('hex');
    }
    return hashes;
  }

  /**
   * Compare file hashes to detect changes
   */
  function detectChanges(
    oldHashes: Record<string, string>,
    newHashes: Record<string, string>,
  ): { added: string[]; modified: string[]; deleted: string[]; unchanged: string[] } {
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    const unchanged: string[] = [];

    for (const [path, hash] of Object.entries(newHashes)) {
      if (!(path in oldHashes)) added.push(path);
      else if (oldHashes[path] !== hash) modified.push(path);
      else unchanged.push(path);
    }

    for (const path of Object.keys(oldHashes)) {
      if (!(path in newHashes)) deleted.push(path);
    }

    return { added, modified, deleted, unchanged };
  }

  /**
   * Update review session with findings
   */
  async function updateFindings(sessionId: string, findings: Record<string, unknown>, tokensConsumed: { input: number; output: number; cost_usd: number }) {
    await db.run(`
      UPDATE code_review_sessions
      SET findings_summary = ?, tokens_consumed = ?, updated_at = NOW()
      WHERE id = ?
    `, JSON.stringify(findings), JSON.stringify(tokensConsumed), sessionId);
  }

  /**
   * Store dependency audit results
   */
  async function storeDependencies(
    sessionId: string,
    projectId: string | null,
    dependencies: Array<{
      package_name: string;
      current_version?: string;
      latest_version?: string;
      ecosystem: string;
      vulnerability_count?: number;
      vulnerability_details?: unknown[];
      licence?: string;
      licence_risk?: string;
      maintenance_status?: string;
      is_direct?: boolean;
      recommendation?: string;
    }>,
  ) {
    for (const dep of dependencies) {
      await db.run(`
        INSERT INTO coding_dependencies (
          id, code_review_session_id, coding_project_id, package_name,
          current_version, latest_version, ecosystem, vulnerability_count,
          vulnerability_details, licence, licence_risk, maintenance_status,
          is_direct, recommendation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        randomUUID(),
        sessionId,
        projectId,
        dep.package_name,
        dep.current_version || null,
        dep.latest_version || null,
        dep.ecosystem,
        dep.vulnerability_count || 0,
        JSON.stringify(dep.vulnerability_details || []),
        dep.licence || null,
        dep.licence_risk || null,
        dep.maintenance_status || null,
        dep.is_direct !== false ? 1 : 0,
        dep.recommendation || null,
      );
    }
  }

  // ── Lens → Prompt Instruction Mapping ────────────────────

  const LENS_INSTRUCTIONS: Record<ReviewLens, { heading: string; instruction: string }> = {
    developer: {
      heading: 'CODE QUALITY & ENGINEERING',
      instruction: `Analyse the code from a senior software engineer perspective. Focus on:
- **Naming & readability:** Are names descriptive and consistent? Is the code self-documenting?
- **Error handling:** Are errors caught, logged, and handled gracefully? Are edge cases covered?
- **DRY & duplication:** Is there repeated logic that should be extracted?
- **SOLID principles:** Single responsibility, open/closed, Liskov substitution, interface segregation, dependency inversion.
- **Test coverage:** Are there tests? Are critical paths covered? Are mocks/stubs appropriate?
- **Performance:** Obvious N+1 queries, unnecessary re-renders, memory leaks, blocking I/O.
- **Code organisation:** File structure, module boundaries, import hygiene.
Rate each finding: CRITICAL / HIGH / MEDIUM / LOW / INFO.`,
    },
    security: {
      heading: 'SECURITY ANALYSIS',
      instruction: `Analyse the code from a cybersecurity expert perspective. Apply the OWASP Top 10 (2021) framework. Focus on:
- **Injection:** SQL injection, XSS, command injection, template injection, LDAP injection.
- **Broken authentication:** Weak credential storage, missing MFA checks, session fixation.
- **Sensitive data exposure:** Hardcoded secrets, PII in logs, unencrypted storage, missing redaction.
- **Broken access control:** Missing authorisation checks, IDOR, privilege escalation paths.
- **Security misconfiguration:** Debug mode, default credentials, overly permissive CORS, missing headers.
- **Cryptographic issues:** Weak algorithms (MD5/SHA1 for passwords), missing salt, predictable IVs.
- **Insecure dependencies:** Known vulnerable packages, outdated libraries.
- **Logging & monitoring:** Missing audit trails, insufficient security event logging.
For each vulnerability, provide: severity (CRITICAL/HIGH/MEDIUM/LOW), OWASP category, CWE ID where applicable, exploitation scenario, and remediation code.`,
    },
    compliance: {
      heading: 'COMPLIANCE & DATA PRIVACY',
      instruction: `Analyse the code from a regulatory compliance perspective. Focus on:
- **GDPR compliance:** Data minimisation, purpose limitation, consent handling, right-to-erasure support, data portability, DPIA triggers.
- **Audit logging:** Are all data access and mutations logged with who/what/when? Is the audit trail tamper-evident?
- **Access controls:** RBAC/ABAC implementation, principle of least privilege, separation of duties.
- **Data retention:** Are retention policies enforced in code? Can data be purged per policy?
- **Data classification:** Is PII identified and handled differently? Are data categories (special, financial, health) treated appropriately?
- **Cross-border transfer:** Are data residency requirements respected? Are transfer mechanisms (SCCs, adequacy) reflected?
- **Record-keeping:** Does the system maintain processing records as required by Art. 30 GDPR?
For each finding, reference the applicable regulation article/section.`,
    },
    product: {
      heading: 'PRODUCT & UX IMPLICATIONS',
      instruction: `Analyse the code from a product manager perspective. Focus on:
- **Feature completeness:** Does the implementation match the apparent intent? Are there missing states or flows?
- **Edge cases & error states:** What happens with empty data, concurrent users, network failures, maximum input sizes?
- **User experience:** Are loading states handled? Are error messages user-friendly? Is the happy path clear?
- **Accessibility (a11y):** ARIA labels, keyboard navigation, screen reader support, colour contrast, focus management.
- **Internationalisation (i18n):** Hardcoded strings, date/number formatting, RTL support considerations.
- **Analytics & observability:** Are key user actions tracked? Can product decisions be data-driven from this code?
- **Backward compatibility:** Will this break existing users, APIs, or data?
Prioritise findings by user impact: BLOCKING / MAJOR / MINOR / ENHANCEMENT.`,
    },
    architecture: {
      heading: 'ARCHITECTURE & DESIGN',
      instruction: `Analyse the code from a solutions architect perspective. Focus on:
- **Coupling & cohesion:** Are modules loosely coupled? Do classes/modules have clear, single responsibilities?
- **Scalability:** Will this design handle 10x/100x load? Are there bottlenecks (single DB, synchronous chains)?
- **API design:** RESTful conventions, consistent error responses, versioning, pagination, rate limiting.
- **Dependency management:** Are external dependencies well-isolated? Can they be swapped? Is there dependency injection?
- **Data model:** Normalisation, indexing strategy, migration path, schema evolution.
- **Patterns & anti-patterns:** Identify design patterns used (and misused). Flag god objects, circular dependencies, deep inheritance.
- **Resilience:** Circuit breakers, retries, timeouts, graceful degradation, idempotency.
- **Observability:** Structured logging, metrics endpoints, distributed tracing hooks.
For each finding, provide the architectural principle violated and a concrete refactoring suggestion.`,
    },
    dependency_audit: {
      heading: 'DEPENDENCY & SUPPLY CHAIN AUDIT',
      instruction: `Analyse the project dependencies from a software supply chain security perspective. Focus on:
- **Known vulnerabilities (CVEs):** Identify packages with known security advisories. Reference CVE IDs where possible.
- **Licence compatibility:** Flag copyleft (GPL, AGPL) licences in proprietary codebases. Identify licence conflicts.
- **Maintenance status:** Flag abandoned packages (no updates >2 years), single-maintainer risk, low download counts.
- **Version currency:** How far behind latest are the pinned versions? Are there major version upgrades available?
- **Transitive risk:** Are there deeply nested dependencies with known issues?
- **Alternatives:** For problematic dependencies, suggest well-maintained alternatives.
- **Lock file integrity:** Is the lock file present and consistent with the manifest?
Present findings as a table: Package | Current | Latest | Vulnerabilities | Licence | Maintenance | Risk | Recommendation.`,
    },
  };

  // ── Explanation Level Instructions ─────────────────────

  const EXPLANATION_LEVEL_INSTRUCTIONS: Record<ExplanationLevel, string> = {
    high: `## EXPLANATION LEVEL: EXECUTIVE OVERVIEW
Provide a concise, high-level summary (1-2 pages equivalent). Focus on:
- Overall code health assessment (RAG rating)
- Top 3-5 critical findings only
- One-paragraph risk summary
- Key recommendations (bullet points)
Do NOT include line-by-line analysis or code examples. This is for stakeholders who need the headline, not the details.`,

    medium: `## EXPLANATION LEVEL: STANDARD REVIEW
Provide a thorough but focused review (3-5 pages equivalent). For each finding:
- Clear title and severity rating
- Brief explanation of the issue
- A short code snippet showing the problem (where applicable)
- Recommended fix with code example
- Impact if not addressed
Group findings by severity, then by lens/category.`,

    deep: `## EXPLANATION LEVEL: DEEP ANALYSIS
Provide an exhaustive, line-by-line analysis (5+ pages). For each finding:
- Detailed explanation of the issue, including WHY it is a problem
- The exact code location (file path, function name, line reference)
- Code snippet showing the problematic code
- Step-by-step exploitation/failure scenario (for security/reliability issues)
- Detailed remediation with before/after code examples
- Links to relevant documentation, CWE entries, or best-practice guides
- Impact assessment: security, performance, maintainability, and business risk
Also include:
- An overall architecture diagram description
- Dependency graph observations
- Suggestions for automated tooling (linters, SAST, DAST) to catch similar issues
- A prioritised remediation roadmap`,
  };

  // ── Security Mode Framework Instructions ───────────────

  const SECURITY_MODE_INSTRUCTIONS: Record<SecurityMode, string> = {
    vulnerability: `## SECURITY FRAMEWORK: VULNERABILITY ASSESSMENT
Apply a structured vulnerability assessment methodology:
- Map all attack surfaces (inputs, outputs, authentication boundaries, data stores)
- For each surface, enumerate potential vulnerability classes (OWASP Top 10 + CWE Top 25)
- Rate each vulnerability: CVSS-like severity, exploitability, business impact
- Provide proof-of-concept exploitation scenarios where applicable
- Prioritise by risk = likelihood x impact`,

    pentest_planning: `## SECURITY FRAMEWORK: PENETRATION TEST PLANNING
Structure your analysis as a penetration test plan:
1. **Scope definition:** What is in/out of scope based on the code provided
2. **Reconnaissance findings:** What can be inferred about the system from the code
3. **Attack surface mapping:** Entry points, trust boundaries, data flows
4. **Test cases:** Specific tests to execute, grouped by OWASP category
5. **Tools & techniques:** Recommended tools for each test (Burp Suite, SQLMap, etc.)
6. **Risk assessment:** Expected findings and their potential business impact
This is a planning document, not an execution report.`,

    red_blue_team: `## SECURITY FRAMEWORK: RED TEAM / BLUE TEAM ANALYSIS
Structure your analysis in two parts:

### RED TEAM (Attacker Perspective)
- Identify attack chains (sequences of vulnerabilities that together achieve compromise)
- Map lateral movement paths through the codebase
- Identify persistence mechanisms an attacker could establish
- Estimate time-to-compromise for each attack chain

### BLUE TEAM (Defender Perspective)
- Identify detection opportunities for each attack chain
- Assess logging coverage: what attacks would be visible vs. invisible
- Recommend monitoring rules and alerts
- Propose defence-in-depth controls for each attack surface`,

    nist_csf: `## SECURITY FRAMEWORK: NIST CYBERSECURITY FRAMEWORK (CSF 2.0)
Map findings to the six NIST CSF functions:
1. **GOVERN (GV):** Governance controls, risk management strategy, supply chain risk
2. **IDENTIFY (ID):** Asset management, risk assessment, business environment
3. **PROTECT (PR):** Access control, data security, information protection, platform security
4. **DETECT (DE):** Anomaly detection, continuous monitoring, adverse event analysis
5. **RESPOND (RS):** Incident management, analysis, mitigation, reporting
6. **RECOVER (RC):** Recovery planning, improvements, communications

For each finding, reference the specific NIST CSF subcategory (e.g., PR.AC-1, DE.CM-3).
Provide a maturity rating per function: Tier 1 (Partial) through Tier 4 (Adaptive).`,

    iso_27001: `## SECURITY FRAMEWORK: ISO 27001:2022
Map findings to ISO 27001:2022 Annex A controls:
- **A.5:** Organisational controls (policies, roles, threat intelligence)
- **A.6:** People controls (screening, awareness, remote working)
- **A.7:** Physical controls (where code reveals physical assumptions)
- **A.8:** Technological controls (authentication, cryptography, secure coding, logging, network security)

For each finding, reference the specific Annex A control number.
Assess the current implementation maturity and the gap to conformity.
Highlight controls that are completely absent vs. partially implemented.`,

    dora: `## SECURITY FRAMEWORK: DORA (Digital Operational Resilience Act)
Map findings to DORA requirements for financial entities:
- **ICT Risk Management (Art. 5-16):** Risk identification, protection, detection, response, recovery, learning
- **ICT Incident Reporting (Art. 17-23):** Classification, reporting capabilities, incident handling
- **Digital Operational Resilience Testing (Art. 24-27):** Testing programme, advanced testing (TLPT)
- **ICT Third-Party Risk (Art. 28-44):** Vendor management, concentration risk, subcontracting
- **Information Sharing (Art. 45):** Threat intelligence sharing capabilities

For each finding, reference the specific DORA article.
This is especially critical for financial institutions — flag any findings that would be regulatory non-compliance.`,
  };

  // ── Core Prompt Builder ────────────────────────────────

  /**
   * Assembles a structured code review system prompt from selected lenses,
   * explanation level, and optional security mode.
   * This becomes the `systemPromptOverride` sent to the prompt composer pipeline.
   */
  function buildReviewSystemPrompt(
    lenses: ReviewLens[],
    explanationLevel: ExplanationLevel,
    securityMode?: SecurityMode,
  ): string {
    const parts: string[] = [];

    // Identity and mission
    parts.push(`# CODE REVIEW — MULTI-LENS ANALYSIS

You are conducting a professional code review. Your analysis must be precise, evidence-based, and actionable. Every finding must reference specific code and provide a concrete remediation path.

## REVIEW STRUCTURE
- Begin with an **Overall Assessment** section: 1-paragraph health summary, overall RAG rating (RED/AMBER/GREEN), and a findings count by severity.
- Then present findings grouped by review lens.
- End with a **Prioritised Remediation Roadmap** (top 10 actions, ordered by risk-adjusted effort).`);

    // Explanation level
    parts.push(EXPLANATION_LEVEL_INSTRUCTIONS[explanationLevel]);

    // Lens-specific sections
    if (lenses.length > 0) {
      parts.push('## REVIEW LENSES\nAnalyse the code through each of the following perspectives:\n');
      for (const lens of lenses) {
        const lensConfig = LENS_INSTRUCTIONS[lens];
        if (lensConfig) {
          parts.push(`### ${lensConfig.heading}\n${lensConfig.instruction}`);
        }
      }
    }

    // Security framework overlay (applies on top of the security lens)
    if (securityMode) {
      parts.push(SECURITY_MODE_INSTRUCTIONS[securityMode]);
    }

    // Output structure
    parts.push(`## OUTPUT FORMAT
Structure your response as Markdown with the following hierarchy:
1. **Overall Assessment** — RAG rating, summary, severity counts
2. **Findings by Lens** — one H2 section per active lens
   - Each finding: title, severity badge, description, code reference, remediation
3. **Prioritised Remediation Roadmap** — table: Priority | Finding | Effort | Impact | Owner suggestion
4. **Appendix** (deep mode only) — tooling recommendations, further reading

Use severity badges: \`🔴 CRITICAL\`, \`🟠 HIGH\`, \`🟡 MEDIUM\`, \`🔵 LOW\`, \`⚪ INFO\`.`);

    return parts.join('\n\n---\n\n');
  }

  /**
   * Builds the user message for a code review request.
   * Contains the code to review with file path annotations.
   */
  function buildReviewUserMessage(
    code: string,
    files?: Array<{ path: string; content: string }>,
  ): string {
    const parts: string[] = [];
    parts.push('Please review the following code:\n');

    if (files && files.length > 0) {
      for (const file of files) {
        parts.push(`### File: \`${file.path}\`\n\`\`\`\n${file.content}\n\`\`\``);
      }
    } else if (code) {
      parts.push(`\`\`\`\n${code}\n\`\`\``);
    }

    return parts.join('\n\n');
  }

  // ── startReview ────────────────────────────────────────

  /**
   * Creates a code_review_sessions record, computes file hashes, and returns
   * the composed review prompt configuration for the frontend to send to
   * POST /api/claude/message.
   */
  async function startReview(config: StartReviewConfig): Promise<StartReviewResult> {
    const {
      sourceType,
      code,
      files,
      sourcePath,
      sourceUrl,
      explanationLevel = 'medium',
      reviewLenses = ['developer'],
      securityMode,
      sessionId,
      projectId,
    } = config;

    // Compute file hashes for diff detection on re-review
    const fileList = files && files.length > 0
      ? files
      : [{ path: 'pasted-code', content: code }];
    const fileHashes = computeFileHashes(fileList);

    // Create the DB record
    const reviewSessionId = randomUUID();
    await db.run(`
      INSERT INTO code_review_sessions (
        id, session_id, project_id, source_type, source_path, source_url,
        explanation_level, review_lenses, security_mode, file_hashes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, reviewSessionId,
      sessionId || null,
      projectId || null,
      sourceType,
      sourcePath || null,
      sourceUrl || null,
      explanationLevel,
      JSON.stringify(reviewLenses),
      securityMode || null,
      JSON.stringify(fileHashes),);

    // Build the system prompt override for the review
    const systemPromptOverride = buildReviewSystemPrompt(
      reviewLenses,
      explanationLevel,
      securityMode,
    );

    // Build the user message containing the code
    const userMessage = buildReviewUserMessage(code, files);

    // Determine suggested personas from lenses
    const suggestedPersonas = reviewLenses.map(lens => mapLensToPersona(lens).personaId);
    // Deduplicate
    const uniquePersonas = Array.from(new Set(suggestedPersonas));

    // Determine thinking level based on explanation depth and lens count
    let suggestedThinking: string;
    if (explanationLevel === 'deep' || reviewLenses.length >= 4) {
      suggestedThinking = 'investigate';
    } else if (explanationLevel === 'medium' || reviewLenses.length >= 2) {
      suggestedThinking = 'think_hard';
    } else {
      suggestedThinking = 'think';
    }

    // Security and compliance lenses always need strict creativity
    const hasStrictLens = reviewLenses.some(l => l === 'security' || l === 'compliance');
    const suggestedCreativity: 'strict' | 'balanced' | 'creative' = hasStrictLens ? 'strict' : 'balanced';

    return {
      reviewSessionId,
      systemPromptOverride,
      userMessage,
      suggestedThinking,
      suggestedCreativity,
      suggestedPersonas: uniquePersonas,
    };
  }

  // ── buildReviewPrompt (standalone) ─────────────────────

  /**
   * Builds a review prompt without creating a DB session.
   * Useful when the frontend needs the prompt text for preview or manual sending.
   */
  function buildReviewPrompt(
    lenses: ReviewLens[],
    explanationLevel: ExplanationLevel,
    securityMode: SecurityMode | undefined,
    code: string,
    files?: Array<{ path: string; content: string }>,
  ): { systemPrompt: string; userMessage: string } {
    return {
      systemPrompt: buildReviewSystemPrompt(lenses, explanationLevel, securityMode),
      userMessage: buildReviewUserMessage(code, files),
    };
  }

  // ── buildDiffReviewPrompt ──────────────────────────────

  /**
   * Builds a diff-focused review prompt that references a previous review
   * and focuses analysis on changed/new files.
   */
  function buildDiffReviewPrompt(
    previousFindings: Record<string, unknown>,
    changes: { added: string[]; modified: string[]; deleted: string[]; unchanged: string[] },
    code: string,
    files?: Array<{ path: string; content: string }>,
    lenses?: ReviewLens[],
    explanationLevel?: ExplanationLevel,
    securityMode?: SecurityMode,
  ): { systemPrompt: string; userMessage: string } {
    const effectiveLenses = lenses || ['developer'];
    const effectiveLevel = explanationLevel || 'medium';

    // Build the base review system prompt
    const baseSystemPrompt = buildReviewSystemPrompt(effectiveLenses, effectiveLevel, securityMode);

    // Add diff-specific instructions
    const diffInstructions = `
---

## DIFF REVIEW MODE — INCREMENTAL ANALYSIS

This is a **re-review** of previously reviewed code. Focus your analysis on what has CHANGED.

### Change Summary
- **New files (${changes.added.length}):** ${changes.added.length > 0 ? changes.added.map(f => '`' + f + '`').join(', ') : 'None'}
- **Modified files (${changes.modified.length}):** ${changes.modified.length > 0 ? changes.modified.map(f => '`' + f + '`').join(', ') : 'None'}
- **Deleted files (${changes.deleted.length}):** ${changes.deleted.length > 0 ? changes.deleted.map(f => '`' + f + '`').join(', ') : 'None'}
- **Unchanged files (${changes.unchanged.length}):** Reviewed previously — only re-examine if changes elsewhere affect them.

### Previous Review Findings
The previous review produced the following findings summary:
\`\`\`json
${JSON.stringify(previousFindings, null, 2)}
\`\`\`

### Your Tasks
1. **New & modified files:** Conduct a full review per the active lenses.
2. **Regression check:** Have any previous findings been RESOLVED by the changes? Mark them.
3. **New issues introduced:** Have the changes introduced NEW issues not present before?
4. **Deleted file impact:** Do file deletions break any dependencies or remove necessary functionality?
5. **Cross-file impact:** Do changes in modified files affect the behaviour of unchanged files?

### Output Structure
1. **Change Impact Summary** — What changed and the overall effect on code health (improved/degraded/neutral)
2. **Resolved Findings** — Previous findings that are now fixed
3. **New Findings** — Issues introduced by the changes
4. **Persistent Findings** — Issues from the previous review that remain unaddressed
5. **Updated Remediation Roadmap** — Revised priorities based on current state`;

    const systemPrompt = baseSystemPrompt + diffInstructions;

    // Build user message
    const userParts: string[] = [];
    userParts.push('Please review the following updated code (this is a diff re-review):\n');

    if (files && files.length > 0) {
      // Annotate files with their change status
      for (const file of files) {
        let changeTag = '(unchanged)';
        if (changes.added.includes(file.path)) changeTag = '🆕 NEW';
        else if (changes.modified.includes(file.path)) changeTag = '📝 MODIFIED';

        userParts.push(`### File: \`${file.path}\` ${changeTag}\n\`\`\`\n${file.content}\n\`\`\``);
      }
    } else if (code) {
      userParts.push(`\`\`\`\n${code}\n\`\`\``);
    }

    return {
      systemPrompt,
      userMessage: userParts.join('\n\n'),
    };
  }

  // ── buildDependencyAuditPrompt ─────────────────────────

  /**
   * Builds a dependency audit prompt for supply chain analysis.
   * Asks Claude to analyse packages for CVEs, licence risks, and maintenance status.
   */
  function buildDependencyAuditPrompt(
    manifest: string,
    ecosystem: string,
    lockFile?: string,
  ): { systemPrompt: string; userMessage: string } {
    const systemPrompt = `# DEPENDENCY & SUPPLY CHAIN AUDIT

You are a software supply chain security expert conducting a thorough dependency audit.

## YOUR MISSION
Analyse the provided package manifest (and lock file if available) for security, licence, and maintenance risks.

## ANALYSIS FRAMEWORK

### 1. Vulnerability Assessment
For each dependency:
- Check for known CVEs and security advisories based on your knowledge
- Assess severity using CVSS scoring where applicable
- Note if the vulnerability affects the specific version in use
- Flag transitive dependency vulnerabilities

### 2. Licence Compliance
- Identify the licence of each dependency
- Flag copyleft licences (GPL, AGPL, LGPL) in potentially proprietary contexts
- Identify licence conflicts between dependencies
- Rate licence risk: NONE / LOW / MEDIUM / HIGH / CRITICAL

### 3. Maintenance Health
For each dependency, assess:
- **Active:** Regular releases, responsive to issues, multiple maintainers
- **Maintained:** Occasional updates, security patches applied
- **Minimal:** Rare updates, may respond to critical issues
- **Abandoned:** No updates >2 years, unresponsive maintainers, archived repos
- **Unknown:** Cannot determine maintenance status

### 4. Version Currency
- Compare current pinned version against latest available
- Flag major version gaps (>1 major version behind)
- Identify dependencies with breaking changes in newer versions

### 5. Supply Chain Risk
- Single-maintainer packages (bus factor = 1)
- Typosquatting risk (similarly named malicious packages)
- Dependency depth (deeply nested transitive chains)
- Package size anomalies

## OUTPUT FORMAT

### Summary Table
| # | Package | Current | Latest | Vulns | Licence | Licence Risk | Maintenance | Overall Risk | Action |
|---|---------|---------|--------|-------|---------|-------------|-------------|-------------|--------|

### Detailed Findings
For each HIGH or CRITICAL risk dependency, provide:
- Full vulnerability details with CVE IDs
- Licence implications
- Recommended alternative packages
- Migration path/effort estimate

### Risk Summary
- Total dependencies analysed
- Risk distribution: CRITICAL / HIGH / MEDIUM / LOW / CLEAN
- Top 3 urgent actions
- Ecosystem health score (A-F)`;

    const userParts: string[] = [];
    userParts.push(`## Ecosystem: ${ecosystem}\n`);
    userParts.push(`### Package Manifest\n\`\`\`\n${manifest}\n\`\`\``);

    if (lockFile) {
      // Lock files can be very large — include a truncated version
      const truncatedLock = lockFile.length > 50000
        ? lockFile.substring(0, 50000) + '\n\n... (lock file truncated at 50,000 characters)'
        : lockFile;
      userParts.push(`### Lock File\n\`\`\`\n${truncatedLock}\n\`\`\``);
    }

    userParts.push('\nPlease conduct a thorough dependency audit of the above manifest.');

    return {
      systemPrompt,
      userMessage: userParts.join('\n\n'),
    };
  }

  // ── getReviewSession ───────────────────────────────────

  /**
   * Returns a parsed review session from the DB, or null if not found.
   */
  async function getReviewSession(id: string): Promise<ReviewSessionRow | null> {
    const row = await db.get('SELECT * FROM code_review_sessions WHERE id = ?', id) as any;

    if (!row) return null;

    return {
      id: row.id as string,
      session_id: row.session_id as string | null,
      project_id: row.project_id as string | null,
      source_type: row.source_type as string,
      source_path: row.source_path as string | null,
      source_url: row.source_url as string | null,
      explanation_level: row.explanation_level as string,
      review_lenses: JSON.parse((row.review_lenses as string) || '[]'),
      security_mode: row.security_mode as string | null,
      file_hashes: JSON.parse((row.file_hashes as string) || '{}'),
      findings_summary: JSON.parse((row.findings_summary as string) || '{}'),
      previous_session_id: row.previous_session_id as string | null,
      is_diff_review: !!(row.is_diff_review as number),
      diff_summary: row.diff_summary as string | null,
      tokens_consumed: JSON.parse((row.tokens_consumed as string) || '{"input":0,"output":0,"cost_usd":0}'),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  // ── listReviewSessions ─────────────────────────────────

  /**
   * Returns a paginated list of review sessions.
   */
  async function listReviewSessions(
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ sessions: ReviewSessionRow[]; total: number }> {


    const total = ((await db.get('SELECT COUNT(*) as c FROM code_review_sessions')) as { c: number } | undefined)?.c ?? 0;

    const rows = await db.all(
      'SELECT * FROM code_review_sessions ORDER BY created_at DESC LIMIT ? OFFSET ?',
      limit,
      offset,
    ) as any[];

    const sessions = rows.map((row: any) => ({
      id: row.id as string,
      session_id: row.session_id as string | null,
      project_id: row.project_id as string | null,
      source_type: row.source_type as string,
      source_path: row.source_path as string | null,
      source_url: row.source_url as string | null,
      explanation_level: row.explanation_level as string,
      review_lenses: JSON.parse((row.review_lenses as string) || '[]'),
      security_mode: row.security_mode as string | null,
      file_hashes: JSON.parse((row.file_hashes as string) || '{}'),
      findings_summary: JSON.parse((row.findings_summary as string) || '{}'),
      previous_session_id: row.previous_session_id as string | null,
      is_diff_review: !!(row.is_diff_review as number),
      diff_summary: row.diff_summary as string | null,
      tokens_consumed: JSON.parse((row.tokens_consumed as string) || '{"input":0,"output":0,"cost_usd":0}'),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    }));

    return { sessions, total };
  }

  return {
    mapLensToPersona,
    computeFileHashes,
    detectChanges,
    updateFindings,
    storeDependencies,
    // New methods
    startReview,
    buildReviewPrompt,
    buildDiffReviewPrompt,
    buildDependencyAuditPrompt,
    getReviewSession,
    listReviewSessions,
    // Expose for testing/reuse
    buildReviewSystemPrompt,
    buildReviewUserMessage,
    LENS_INSTRUCTIONS,
    EXPLANATION_LEVEL_INSTRUCTIONS,
    SECURITY_MODE_INSTRUCTIONS,
  };
}
