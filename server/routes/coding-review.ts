import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import { createCodingReviewEngine } from '../services/coding-review-engine.js';
import { createCodingIntegration } from '../services/coding-integration.js';

export async function createCodingReviewRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const reviewEngine = await createCodingReviewEngine(db);

  // POST /api/coding/review — Start new code review session
  router.post('/coding/review', async (req, res) => {
    try {
      const {
        source_type, code, source_path, source_url,
        explanation_level = 'medium', review_lenses = [], security_mode,
        session_id, project_id, files,
      } = req.body;

      if (!source_type) {
        return res.status(400).json({ error: 'source_type is required' });
      }
      if (source_type === 'paste' && !code) {
        return res.status(400).json({ error: 'code is required for paste source type' });
      }

      // Build file list for hashing — either from explicit files array or single code paste
      const fileList: Array<{ path: string; content: string }> = [];
      if (files && Array.isArray(files)) {
        fileList.push(...files);
      } else if (code) {
        fileList.push({ path: source_path || 'pasted-code', content: code });
      }

      const fileHashes = reviewEngine.computeFileHashes(fileList);

      const id = randomUUID();
      await db.run(`
        INSERT INTO code_review_sessions (
          id, session_id, project_id, source_type, source_path, source_url,
          explanation_level, review_lenses, security_mode, file_hashes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, session_id || null, project_id || null, source_type,
        source_path || null, source_url || null,
        explanation_level, JSON.stringify(review_lenses), security_mode || null,
        JSON.stringify(fileHashes),);

      // Build the review prompt for the frontend to send through /api/claude/message
      const lensPersonas = review_lenses.map((lens: string) => reviewEngine.mapLensToPersona(lens));
      const lensNames = review_lenses.length > 0 ? review_lenses.join(', ') : 'developer';

      const codeBlocks = fileList.map(f =>
        `### File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``
      ).join('\n\n');

      const reviewPrompt = [
        `## Code Review Request`,
        ``,
        `**Review lenses:** ${lensNames}`,
        `**Explanation depth:** ${explanation_level}`,
        security_mode ? `**Security framework:** ${security_mode}` : '',
        ``,
        `Please perform a thorough code review of the following code through each requested lens.`,
        ``,
        codeBlocks,
      ].filter(Boolean).join('\n');

      const systemPromptOverride = buildSystemPromptOverride(review_lenses, explanation_level, security_mode);

      res.json({
        id,
        reviewPrompt,
        systemPromptOverride,
        moduleId: 'code-review-explain',
        areaId: 'coding',
        source_type,
        explanation_level,
        review_lenses,
        security_mode,
        file_count: fileList.length,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[coding-review] Create error:', error);
      res.status(500).json({ error: 'Failed to create review session' });
    }
  });

  // GET /api/coding/review/:id — Get review session
  router.get('/coding/review/:id', async (req, res) => {
    try {
      const row = await db.get('SELECT * FROM code_review_sessions WHERE id = ?', req.params.id);
      if (!row) return res.status(404).json({ error: 'Review session not found' });

      const session = parseReviewSession(row);
      res.json(session);
    } catch (error) {
      console.error('[coding-review] Get error:', error);
      res.status(500).json({ error: 'Failed to get review session' });
    }
  });

  // GET /api/coding/review/sessions — List review sessions
  router.get('/coding/review/sessions', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const rows = await db.all(`
        SELECT * FROM code_review_sessions
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, limit, offset);

      const total = await db.get('SELECT COUNT(*) as c FROM code_review_sessions') as { c: number };

      res.json({
        sessions: rows.map(parseReviewSession),
        total: total.c,
        limit,
        offset,
      });
    } catch (error) {
      console.error('[coding-review] List error:', error);
      res.status(500).json({ error: 'Failed to list review sessions' });
    }
  });

  // POST /api/coding/review/diff — Diff-aware re-review
  router.post('/coding/review/diff', async (req, res) => {
    try {
      const { previous_session_id, code, source_path, source_url, review_lenses, files } = req.body;

      if (!previous_session_id) {
        return res.status(400).json({ error: 'previous_session_id is required' });
      }


      if (!previous) return res.status(404).json({ error: 'Previous session not found' });

      const prevParsed = parseReviewSession(previous);
      const oldHashes = prevParsed.file_hashes || {};

      // Build file list from new code
      const fileList: Array<{ path: string; content: string }> = [];
      if (files && Array.isArray(files)) {
        fileList.push(...files);
      } else if (code) {
        fileList.push({ path: source_path || prevParsed.source_path || 'pasted-code', content: code });
      }

      const newHashes = reviewEngine.computeFileHashes(fileList);
      const changes = reviewEngine.detectChanges(oldHashes, newHashes);

      const id = randomUUID();
      const effectiveLenses = review_lenses || prevParsed.review_lenses;

      await db.run(`
        INSERT INTO code_review_sessions (
          id, source_type, source_path, source_url, explanation_level,
          review_lenses, security_mode, previous_session_id, is_diff_review,
          file_hashes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `, 
        id, prevParsed.source_type,
        source_path || prevParsed.source_path || null,
        source_url || prevParsed.source_url || null,
        prevParsed.explanation_level,
        JSON.stringify(effectiveLenses),
        prevParsed.security_mode || null,
        previous_session_id,
        JSON.stringify(newHashes),
      );

      // Build diff-focused review prompt — only include changed/added files
      const changedFiles = fileList.filter(f =>
        changes.added.includes(f.path) || changes.modified.includes(f.path)
      );

      const changeSummaryText = [
        changes.added.length > 0 ? `**Added files (${changes.added.length}):** ${changes.added.join(', ')}` : '',
        changes.modified.length > 0 ? `**Modified files (${changes.modified.length}):** ${changes.modified.join(', ')}` : '',
        changes.deleted.length > 0 ? `**Deleted files (${changes.deleted.length}):** ${changes.deleted.join(', ')}` : '',
        changes.unchanged.length > 0 ? `**Unchanged files (${changes.unchanged.length}):** ${changes.unchanged.join(', ')}` : '',
      ].filter(Boolean).join('\n');

      const codeBlocks = changedFiles.map(f =>
        `### File: ${f.path} (${changes.added.includes(f.path) ? 'NEW' : 'MODIFIED'})\n\`\`\`\n${f.content}\n\`\`\``
      ).join('\n\n');

      const reviewPrompt = [
        `## Diff-Aware Code Re-Review`,
        ``,
        `This is a follow-up review of code that has changed since the previous review session.`,
        `Focus your analysis on the changes — new and modified files. Flag any issues that the changes introduce or fail to address from prior findings.`,
        ``,
        `### Change Summary`,
        changeSummaryText,
        ``,
        `**Review lenses:** ${effectiveLenses.join(', ')}`,
        `**Explanation depth:** ${prevParsed.explanation_level}`,
        prevParsed.security_mode ? `**Security framework:** ${prevParsed.security_mode}` : '',
        ``,
        changedFiles.length > 0 ? codeBlocks : '_No changed file contents provided — review based on change summary above._',
      ].filter(Boolean).join('\n');

      const systemPromptOverride = buildSystemPromptOverride(effectiveLenses, prevParsed.explanation_level, prevParsed.security_mode);

      res.json({
        id,
        previous_session_id,
        is_diff_review: true,
        reviewPrompt,
        systemPromptOverride,
        moduleId: 'code-review-explain',
        areaId: 'coding',
        change_summary: {
          added: changes.added.length,
          modified: changes.modified.length,
          deleted: changes.deleted.length,
          unchanged: changes.unchanged.length,
        },
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[coding-review] Diff error:', error);
      res.status(500).json({ error: 'Failed to create diff review' });
    }
  });

  // POST /api/coding/review/dependencies — Dependency/supply chain audit
  router.post('/coding/review/dependencies', async (req, res) => {
    try {
      const { manifest, ecosystem, lock_file, session_id, project_id } = req.body;

      if (!manifest || !ecosystem) {
        return res.status(400).json({ error: 'manifest and ecosystem are required' });
      }

      const reviewId = randomUUID();
      await db.run(`
        INSERT INTO code_review_sessions (id, source_type, review_lenses, session_id, project_id)
        VALUES (?, 'paste', '["dependency_audit"]', ?, ?)
      `, reviewId, session_id || null, project_id || null);

      // Build dependency audit prompt for the frontend to send through /api/claude/message
      const lockFileSection = lock_file
        ? `\n### Lock File Contents\n\`\`\`\n${lock_file}\n\`\`\``
        : '';

      const reviewPrompt = [
        `## Dependency & Supply Chain Audit`,
        ``,
        `**Ecosystem:** ${ecosystem}`,
        ``,
        `Perform a thorough dependency audit of the following package manifest. For each dependency:`,
        ``,
        `1. **Known vulnerabilities** — identify any known CVEs or security advisories`,
        `2. **License compatibility** — flag any licenses that may conflict with commercial use or each other`,
        `3. **Maintenance status** — assess whether the package is actively maintained (recent releases, open issues, contributors)`,
        `4. **Version currency** — note if the pinned version is significantly behind the latest stable release`,
        `5. **Transitive risk** — flag dependencies that pull in a large or risky transitive dependency tree`,
        `6. **Recommendation** — for each dependency: keep, update, replace, or remove with rationale`,
        ``,
        `### Package Manifest`,
        `\`\`\``,
        manifest,
        `\`\`\``,
        lockFileSection,
        ``,
        `Produce a structured table of findings and an overall risk summary.`,
      ].filter(Boolean).join('\n');

      const systemPromptOverride = [
        `You are a software supply chain security expert performing a dependency audit.`,
        `Analyze the provided package manifest for the ${ecosystem} ecosystem.`,
        `Be thorough about known vulnerabilities, license risks, and maintenance concerns.`,
        `Use severity indicators: 🔴 Critical | 🟠 Important | 🟡 Suggestion | 🟢 Healthy`,
        `Provide actionable recommendations for each dependency.`,
      ].join('\n');

      res.json({
        id: reviewId,
        reviewPrompt,
        systemPromptOverride,
        moduleId: 'code-review-explain',
        areaId: 'coding',
        ecosystem,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[coding-review] Dependency audit error:', error);
      res.status(500).json({ error: 'Failed to create dependency audit' });
    }
  });

  // POST /api/coding/review/feature-search — Search codebase for feature
  router.post('/coding/review/feature-search', async (req, res) => {
    try {
      const { query, source_path } = req.body;
      if (!query) return res.status(400).json({ error: 'query is required' });

      // Feature search returns a session ID for tracking
      const id = randomUUID();
      await db.run(`
        INSERT INTO code_review_sessions (id, source_type, source_path, review_lenses)
        VALUES (?, 'directory', ?, '["developer"]')
      `, id, source_path || null);

      res.json({ id, query, status: 'created' });
    } catch (error) {
      console.error('[coding-review] Feature search error:', error);
      res.status(500).json({ error: 'Failed to create feature search' });
    }
  });

  // POST /api/coding/review/:id/findings — Save findings after Claude responds
  router.post('/coding/review/:id/findings', async (req, res) => {
    try {
      const { id } = req.params;
      const { findings, tokens_consumed } = req.body;


      if (!existing) {
        return res.status(404).json({ error: 'Review session not found' });
      }

      if (!findings || typeof findings !== 'object') {
        return res.status(400).json({ error: 'findings object is required' });
      }

      const tokensData = tokens_consumed && typeof tokens_consumed === 'object'
        ? {
            input: tokens_consumed.input || 0,
            output: tokens_consumed.output || 0,
            cost_usd: tokens_consumed.cost_usd || 0,
          }
        : { input: 0, output: 0, cost_usd: 0 };

      reviewEngine.updateFindings(id, findings, tokensData);

      // Fire-and-forget quality scoring — don't block the response
      try {
        const findingsContent = typeof findings === 'string' ? findings : JSON.stringify(findings);
        const integration = await createCodingIntegration(db);
        integration.scoreOutput(findingsContent, 'code-review-explain', 'coding', id).catch(() => {});
      } catch { /* scoring failure should never break the main flow */ }

      res.json({ id, status: 'findings_saved' });
    } catch (error) {
      console.error('[coding-review] Save findings error:', error);
      res.status(500).json({ error: 'Failed to save findings' });
    }
  });

  return router;
}

/**
 * Build a system prompt override tailored to the selected review lenses,
 * explanation level, and optional security framework.
 */
function buildSystemPromptOverride(
  reviewLenses: string[],
  explanationLevel: string,
  securityMode?: string | null,
): string {
  const lensInstructions: Record<string, string> = {
    developer: [
      '**Developer Quality:** Assess code clarity, readability, maintainability, design patterns,',
      'error handling, test coverage, performance, naming conventions, and code organization.',
    ].join(' '),
    security: [
      '**Security:** Assess input validation, authentication/authorization, injection vulnerabilities',
      '(SQL, XSS, command injection), sensitive data exposure, cryptographic implementation,',
      'and OWASP Top 10 coverage.',
    ].join(' '),
    compliance: [
      '**Compliance:** Assess data privacy and GDPR considerations, audit trail and logging adequacy,',
      'access control and least privilege, data retention and deletion, and regulatory reporting capabilities.',
    ].join(' '),
    product: [
      '**Product Alignment:** Assess feature completeness, user experience implications,',
      'edge case handling, accessibility considerations, and end-user performance impact.',
    ].join(' '),
    architecture: [
      '**Architecture:** Assess component responsibility and separation of concerns, coupling and cohesion,',
      'scalability, dependency management, API design quality, and database schema appropriateness.',
    ].join(' '),
    dependency_audit: [
      '**Dependency Audit:** Assess known vulnerabilities (CVEs), license compatibility,',
      'maintenance status, update recency, and transitive dependency risks.',
    ].join(' '),
  };

  const depthMap: Record<string, string> = {
    high: 'Provide a high-level overview. Be concise — focus on the most important findings only.',
    medium: 'Provide medium-detail analysis. Cover key findings with enough context to act on them.',
    deep: 'Provide a deep-dive analysis. Be exhaustive — include line references, code examples, and detailed rationale for every finding.',
  };

  const sections: string[] = [
    'You are an expert code reviewer performing a multi-lens analysis.',
    '',
    '## Explanation Depth',
    depthMap[explanationLevel] || depthMap['medium'],
    '',
    '## Review Lenses',
    'Review the provided code through each of the following lenses:',
    '',
  ];

  const activeLenses = reviewLenses.length > 0 ? reviewLenses : ['developer'];
  for (const lens of activeLenses) {
    if (lensInstructions[lens]) {
      sections.push(`- ${lensInstructions[lens]}`);
    }
  }

  if (securityMode) {
    const frameworkMap: Record<string, string> = {
      vulnerability: 'Focus the security lens specifically on vulnerability scanning — CVEs, CWEs, and known exploit patterns.',
      nist_csf: 'Apply the NIST Cybersecurity Framework (CSF) to the security assessment. Map findings to CSF functions: Identify, Protect, Detect, Respond, Recover.',
      iso_27001: 'Apply ISO 27001 controls to the security assessment. Map findings to relevant Annex A controls.',
      dora: 'Apply the EU Digital Operational Resilience Act (DORA) framework. Assess ICT risk management, incident reporting, and third-party risk.',
    };
    if (frameworkMap[securityMode]) {
      sections.push('');
      sections.push('## Security Framework');
      sections.push(frameworkMap[securityMode]);
    }
  }

  sections.push('');
  sections.push('## Output Format');
  sections.push('For each lens, structure findings as:');
  sections.push('1. **Critical Issues** (must fix) — security vulnerabilities, data loss risks, compliance violations');
  sections.push('2. **Important Issues** (should fix) — performance problems, maintainability concerns, missing tests');
  sections.push('3. **Suggestions** (nice to have) — style improvements, optimization opportunities');
  sections.push('4. **Strengths** — well-implemented aspects worth noting');
  sections.push('');
  sections.push('Use severity indicators: 🔴 Critical | 🟠 Important | 🟡 Suggestion | 🟢 Strength');
  sections.push('Provide specific line references and code examples for each finding.');

  return sections.join('\n');
}

function parseReviewSession(row: any) {
  return {
    ...row,
    review_lenses: JSON.parse(row.review_lenses || '[]'),
    file_hashes: JSON.parse(row.file_hashes || '{}'),
    findings_summary: JSON.parse(row.findings_summary || '{}'),
    tokens_consumed: JSON.parse(row.tokens_consumed || '{"input":0,"output":0,"cost_usd":0}'),
    is_diff_review: !!row.is_diff_review,
  };
}
