// ── PostgreSQL Database Initialization ────────────────────────────────────────
// Equivalent of init.ts for PostgreSQL. Creates the schema, runs PG-specific
// migrations, and seeds all default data.

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

import { PostgresAdapter } from './adapters/postgresql-adapter.js';
import type { DatabaseAdapter } from './database.js';
import { runMigrationsPg } from './run-migrations-pg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Initialize a PostgreSQL database for ANTON.
 *
 * 1. Creates a PostgresAdapter using the connection string.
 * 2. Executes the full schema from schema.postgresql.sql.
 * 3. Runs PG-specific migrations from migrations-pg/ (and compatible generic ones).
 * 4. Seeds all default data matching what SQLite init.ts seeds.
 * 5. Backfills tsvector search_vector for any existing knowledge_atoms rows.
 *
 * @param connectionString - PostgreSQL connection URI (e.g., postgresql://user:pass@host:5432/dbname)
 * @returns The initialized DatabaseAdapter
 */
export async function initPostgresDatabase(connectionString: string): Promise<DatabaseAdapter> {
  const db = new PostgresAdapter({ connectionString });

  // ── 1. Execute PostgreSQL schema ──────────────────────────────────────────
  const schemaPath = path.join(__dirname, 'schema.postgresql.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`PostgreSQL schema file not found: ${schemaPath}`);
  }
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  await db.exec(schema);
  console.log('[pg-init] Schema executed');

  // ── 2. Run PG-specific migrations ────────────────────────────────────────
  await runMigrationsPg(db);
  console.log('[pg-init] Migrations complete');

  // ── 3. Seed default data ─────────────────────────────────────────────────

  // 3a. Default user profile
  await db.run("INSERT INTO user_profiles (id) VALUES ('default') ON CONFLICT DO NOTHING");

  // 3b. Default knowledge collections
  const collectionsExist = await db.get<{ c: number }>(
    'SELECT COUNT(*) as c FROM knowledge_collections'
  );
  if (!collectionsExist || collectionsExist.c === 0) {
    await db.run(`INSERT INTO knowledge_collections (id, name, display_name, description, icon, color, created_by) VALUES
      ('regulations', 'regulations', 'Regulations & Laws', 'EU/national regulations, directives, legal frameworks', 'Scale', '#3498DB', 'system'),
      ('client-docs', 'client-docs', 'Client Documents', 'Client policies, procedures, internal documents', 'Briefcase', '#2DD4A8', 'system'),
      ('templates', 'templates', 'Templates & Examples', 'Best-practice templates, past deliverables, examples', 'FileText', '#F5A623', 'system')
    `);
    console.log('[pg-init] Seeded 3 default knowledge collections');
  }

  // 3c. Default app_settings
  await db.run("INSERT INTO app_settings (key, value) VALUES ('monthly_budget_cap', '0') ON CONFLICT DO NOTHING");

  // 3d. Default radar_settings
  await db.run("INSERT INTO radar_settings (key, value) VALUES ('auto_scan_enabled', '0') ON CONFLICT (key) DO NOTHING");
  await db.run("INSERT INTO radar_settings (key, value) VALUES ('auto_scan_interval_hours', '24') ON CONFLICT (key) DO NOTHING");
  await db.run("INSERT INTO radar_settings (key, value) VALUES ('auto_scan_cron', '') ON CONFLICT (key) DO NOTHING");

  // 3e. Default data connectors
  await db.run(`INSERT INTO data_connectors (id, connector_type, display_name, status, api_key_set) VALUES
    ('roaring-default', 'roaring', 'Roaring — Nordic Entity Registry', 'mock', 0),
    ('dowjones-default', 'dowjones', 'Dow Jones Risk & Compliance', 'mock', 0)
    ON CONFLICT DO NOTHING`);

  // 3f. Default orchestrator_config and orchestrator_stage
  await db.run("INSERT INTO orchestrator_config (id) VALUES ('default') ON CONFLICT DO NOTHING");
  await db.run("INSERT INTO orchestrator_stage (id) VALUES ('default') ON CONFLICT DO NOTHING");

  // 3g. Default radar sources
  const radarSourcesExist = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM radar_sources');
  if (!radarSourcesExist || radarSourcesExist.c === 0) {
    await db.run(`INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords) VALUES
      ('src_eba', 'European Banking Authority', 'https://www.eba.europa.eu/sites/default/documents/files/document_library/Publications/Guidelines/feed.xml', 'rss', 24, '["fcp","legal","banking"]', '["AML","CFT","capital","liquidity","governance"]'),
      ('src_esma', 'ESMA News', 'https://www.esma.europa.eu/press-news/esma-news', 'web_page', 24, '["legal","investment"]', '["MiFID","EMIR","MAR","sustainable finance"]'),
      ('src_fatf', 'FATF Publications', 'https://www.fatf-gafi.org/en/publications.html', 'web_page', 168, '["fcp"]', '["money laundering","terrorist financing","FATF","recommendation"]'),
      ('src_amla', 'EU AML/CFT Publications', 'https://eur-lex.europa.eu/search.html?scope=EURLEX&type=quick&lang=en&SUBDOM_INIT=LEGAL_SOURCES&DTS_SUBDOM=LEGAL_SOURCES', 'eur_lex', 24, '["fcp","legal"]', '["anti-money laundering","AMLA","AMLR","financial crime"]'),
      ('src_ecb', 'ECB Banking Supervision', 'https://www.bankingsupervision.europa.eu/press/publications/rss.xml', 'rss', 24, '["banking","risk"]', '["supervision","capital","stress test","SREP"]')
      ON CONFLICT DO NOTHING`);
    console.log('[pg-init] Seeded 5 default radar sources');
  }

  // 3g-2. PE/VC Innovation Radar sources
  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_techcrunch', 'TechCrunch', 'https://techcrunch.com/feed/', 'rss', 12, '[\"pe-vc\",\"startups\"]', '[\"funding\",\"startup\",\"Series A\",\"Series B\",\"acquisition\",\"IPO\"]', 'pe-vc') ON CONFLICT DO NOTHING");
  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_arxiv_cs', 'arXiv (CS/AI)', 'https://arxiv.org/rss/cs.AI', 'rss', 24, '[\"pe-vc\",\"data-analytics\"]', '[\"AI\",\"machine learning\",\"LLM\",\"deep learning\",\"breakthrough\"]', 'pe-vc') ON CONFLICT DO NOTHING");
  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_sec_edgar', 'SEC EDGAR (Filings)', 'https://efts.sec.gov/LATEST/search-index?q=%22S-1%22&dateRange=custom&startdt=2024-01-01&forms=S-1,F-1', 'web_page', 24, '[\"pe-vc\",\"investment\"]', '[\"S-1\",\"F-1\",\"IPO\",\"prospectus\",\"public offering\"]', 'pe-vc') ON CONFLICT DO NOTHING");
  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_hackernews', 'Hacker News', 'https://news.ycombinator.com/rss', 'rss', 6, '[\"pe-vc\",\"software-eng\"]', '[\"funding\",\"launch\",\"acquired\",\"raised\",\"Series\",\"YC\"]', 'pe-vc') ON CONFLICT DO NOTHING");
  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_eu_ai_act', 'EU AI Act Tracker', 'https://www.europarl.europa.eu/topics/en/article/20230601STO93804/eu-ai-act-first-regulation-on-artificial-intelligence', 'web_page', 168, '[\"pe-vc\",\"legal\",\"fcp\"]', '[\"AI Act\",\"AI regulation\",\"GPAI\",\"artificial intelligence regulation\"]', 'pe-vc') ON CONFLICT DO NOTHING");
  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_crunchbase_news', 'Crunchbase News', 'https://news.crunchbase.com/feed/', 'rss', 12, '[\"pe-vc\"]', '[\"funding\",\"investment\",\"venture\",\"Series\",\"unicorn\",\"acquisition\",\"exit\"]', 'pe-vc') ON CONFLICT DO NOTHING");
  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_the_information', 'The Information', 'https://www.theinformation.com', 'web_page', 24, '[\"pe-vc\",\"startups\"]', '[\"startup\",\"venture\",\"funding\",\"IPO\",\"tech\",\"enterprise\"]', 'pe-vc') ON CONFLICT DO NOTHING");

  // 3h. Compliance rules
  const complianceRulesExist = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM compliance_rules');
  if (!complianceRulesExist || complianceRulesExist.c === 0) {
    await db.run(`INSERT INTO compliance_rules (rule_code, title, description, category, severity, regulatory_source, rule_logic, active, auto_remediate) VALUES
      ('TOKEN_LIMIT_001', 'Token Count Threshold', 'Ensure API calls do not exceed maximum token limits to prevent cost overruns and performance issues', 'operational', 'high', 'Internal Policy', '{"type":"threshold","config":{"field":"input_token_count","operator":">","threshold":900000,"warningThreshold":750000}}', 1, 0),
      ('OUTPUT_QUALITY_001', 'No TODO/FIXME in Production', 'Production outputs must not contain development markers like TODO or FIXME', 'data_quality', 'medium', 'Quality Standards', '{"type":"pattern","config":{"field":"output_text","pattern":"\\\\b(TODO|FIXME|XXX|HACK)\\\\b","flags":"gi"}}', 1, 0),
      ('MODEL_WHITELIST_001', 'Approved Models Only', 'Only allow use of approved Claude models for compliance work', 'governance', 'critical', 'Data Governance Policy', '{"type":"lookup","config":{"field":"model","allowedValues":["claude-opus-4-7","claude-sonnet-4-6","claude-sonnet-4-5-20250929"]}}', 1, 0),
      ('CITATION_REQ_001', 'Citation Requirement', 'All regulatory analysis must include citations and must not contain quality markers', 'data_quality', 'high', 'AMLR Art. 8', '{"type":"composite","config":{"operator":"AND","rules":[{"type":"pattern","config":{"field":"output_text","pattern":"\\\\[.*?\\\\]|Art\\\\.|Section|Regulation","flags":"i"}},{"type":"pattern","config":{"field":"output_text","pattern":"\\\\b(TODO|FIXME)\\\\b","flags":"gi"}}]}}', 1, 0),
      ('TRANSPARENCY_001', 'Minimum Transparency Level', 'Sessions must use adequate transparency for audit trail', 'governance', 'medium', 'Internal Audit Requirements', '{"type":"threshold","config":{"field":"transparency_level","operator":">=","threshold":1}}', 1, 0),
      ('DATA_SOURCE_001', 'Knowledge Source Validation', 'Ensure at least one knowledge source is configured for compliance modules', 'data_quality', 'high', 'Quality Framework', '{"type":"threshold","config":{"field":"knowledge_sources_count","operator":">","threshold":0}}', 1, 0),
      ('REVIEW_CYCLE_001', 'Mandatory Review for High-Risk', 'Critical outputs must undergo human review before finalization', 'governance', 'critical', 'Risk Management Policy', '{"type":"lookup","config":{"field":"review_status","allowedValues":["reviewed","approved"]}}', 1, 0),
      ('SESSION_LENGTH_001', 'Session Output Length Warning', 'Warn when session output exceeds typical report length', 'operational', 'low', 'Best Practices', '{"type":"threshold","config":{"field":"output_word_count","operator":">","threshold":10000,"warningThreshold":7500}}', 1, 0),
      ('PROMPT_AUDIT_001', 'Prompt Logging Required', 'All prompts sent to LLMs must be logged in the audit trail for compliance and reproducibility', 'governance', 'high', 'Internal Audit Requirements', '{"type":"threshold","config":{"field":"audit_log_count","operator":">","threshold":0}}', 1, 0),
      ('COST_LIMIT_001', 'Session Cost Limit', 'Individual sessions must not exceed cost threshold without review', 'operational', 'high', 'Budget Policy', '{"type":"threshold","config":{"field":"estimated_cost_usd","operator":">","threshold":50,"warningThreshold":25}}', 1, 0),
      ('EXPORT_REVIEW_001', 'Export Review Required', 'All exports of compliance documents must be reviewed before distribution', 'governance', 'medium', 'Document Control Policy', '{"type":"lookup","config":{"field":"export_review_status","allowedValues":["reviewed","approved"]}}', 1, 0),
      ('DATA_RETENTION_001', 'Data Retention Compliance', 'Session data must comply with configured retention periods', 'data_quality', 'medium', 'Data Retention Policy', '{"type":"threshold","config":{"field":"session_age_days","operator":"<=","threshold":365}}', 1, 0)
    `);
    console.log('[pg-init] Seeded compliance rules');
  }

  // 3i. Default tool profiles
  const toolProfilesExist = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM tool_profiles');
  if (!toolProfilesExist || toolProfilesExist.c === 0) {
    await db.run(`INSERT INTO tool_profiles (id, tool_name, display_name, primary_filename, structure_template, tone_guidelines, formatting_rules, special_directives, is_default) VALUES
      ('tp-claude-code', 'claude-code', 'Claude Code', 'CLAUDE.md',
       '{"sections":["PROJECT IDENTITY","TECH STACK","PROJECT STRUCTURE","ARCHITECTURE DECISIONS","IMPLEMENTATION ORDER","CODING STANDARDS","TESTING STRATEGY","DOMAIN REQUIREMENTS"]}',
       'Imperative tone. Direct instructions. No hedging. Write as commands Claude Code must follow.',
       'Use ## for major sections, ### for subsections. Numbered steps for sequences. Code blocks for examples. Bold for emphasis.',
       'Include filesystem-aware directives. Reference specific file paths. Use CLAUDE.md as the primary instruction file.',
       1),
      ('tp-codex', 'codex', 'OpenAI Codex CLI', 'INSTRUCTIONS.md',
       '{"sections":["OVERVIEW","TASK BLOCKS","INPUT SPECS","OUTPUT SPECS","CONSTRAINTS","TESTING","EXAMPLES"]}',
       'Task-oriented blocks. Each block is a self-contained instruction. Clear input/output specifications.',
       'Use # for the title, ## for task blocks. Each task block has: Goal, Input, Output, Constraints. Use bullet points for lists.',
       'Structure as discrete task blocks. Each block should be independently executable. Include explicit input/output specifications.',
       1),
      ('tp-mistral-code', 'mistral-code', 'Mistral Code', 'PROJECT.md',
       '{"sections":["PROJECT OVERVIEW","GOALS","ARCHITECTURE","IMPLEMENTATION GUIDE","QUALITY STANDARDS","DOMAIN CONTEXT"]}',
       'Adaptable structure. Combine high-level goals with specific implementation guidance. Professional but accessible.',
       'Use # for title, ## for sections. Mix prose with structured lists. Include code examples where helpful.',
       'Balance between high-level guidance and specific instructions. Include context about why decisions were made.',
       1)
    `);
    console.log('[pg-init] Seeded 3 default tool profiles');
  }

  // 3j. Default skill packs
  const skillPacksExist = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM skill_packs');
  if (!skillPacksExist || skillPacksExist.c === 0) {
    await db.run(`INSERT INTO skill_packs (id, name, description, target_role, target_industry, modules, getting_started, is_default, created_by) VALUES
      (
        'pack-mlro',
        'MLRO / Compliance Officer Pack',
        'A complete toolkit for Money Laundering Reporting Officers and compliance professionals working in AML/CFT, sanctions, and regulatory implementation. Pre-configured for AMLR, EBA guidelines, and Nordic/European financial institutions.',
        'MLRO / Compliance Officer',
        'Financial Services',
        '["aml-risk-assessment","gap-analysis","policy-document","sanctions-screening","investigation-support"]',
        'Start with the Gap Analysis module to assess your current AML/CFT framework against AMLR requirements. Use the Risk Assessment module to produce your Business-Wide Risk Assessment. Generate compliant policies with the Document Creation module.',
        1,
        'system'
      ),
      (
        'pack-startup',
        'Startup Founder Pack',
        'Designed for founders navigating regulatory obligations, investor communications, and strategic decision-making. Covers compliance basics, risk assessment, and stakeholder reporting.',
        'Startup Founder / CEO',
        'Technology / Startup',
        '["regulatory-monitor","document-creation","risk-assessment","training-content"]',
        'Begin with the Regulatory Monitor to understand your compliance obligations. Use the Document Creation module to draft your first compliance policies. Run a Risk Assessment to identify your key exposure areas.',
        1,
        'system'
      ),
      (
        'pack-hr',
        'HR Business Partner Pack',
        'Tailored for HR professionals managing employment compliance, training obligations, whistleblower frameworks, and workforce risk. Includes tools for policy drafting and training content creation.',
        'HR Business Partner / CHRO',
        'Human Resources',
        '["document-creation","training-content","investigation-support","risk-assessment"]',
        'Use the Document Creation module to update HR policies for current regulatory requirements. Create training materials with the Training Content module for employee onboarding and compliance awareness. Use Investigation Support for structured HR investigations.',
        1,
        'system'
      ),
      (
        'pack-audit',
        'Audit Engagement Pack',
        'Built for internal and external auditors conducting compliance audits, gap assessments, and control testing. Pre-configured for structured findings reports, RACI matrices, and audit action plans.',
        'Internal / External Auditor',
        'Audit & Assurance',
        '["gap-analysis","investigation-support","risk-assessment","data-management"]',
        'Start with the Gap Analysis module to scope the audit and identify control deficiencies. Use Investigation Support to structure findings and root cause analysis. Generate action plans and tracking matrices with the Risk Assessment module.',
        1,
        'system'
      ),
      (
        'pack-pm',
        'Project Delivery Pack',
        'For project managers and programme leads delivering regulatory change, compliance transformation, or technology implementation projects. Focused on planning, RACI, milestone tracking, and stakeholder communication.',
        'Project Manager / Programme Lead',
        'Regulatory Change / Transformation',
        '["gap-analysis","document-creation","regulatory-monitor","risk-assessment","training-content"]',
        'Use Gap Analysis to define the scope and baseline of your regulatory change programme. Create project plans and RACI matrices with the Document Creation module. Monitor regulatory developments with the Regulatory Monitor and assess change impact with Risk Assessment.',
        1,
        'system'
      )
    `);
    console.log('[pg-init] Seeded 5 default skill packs');
  }

  // 3k. Default teacher personas
  const almaExists = await db.get<{ id: string }>("SELECT id FROM teacher_personas WHERE id = 'alma'");
  if (!almaExists) {
    const almaTierAdaptations = JSON.stringify({
      T1: "Very simple language, stories about real-world counting and measuring, lots of emoji, 'Let\u2019s figure this out together!'",
      T2: "Socratic questioning, 'What do you think happens if...?', builds from concrete to abstract",
      T3: 'More direct, connects maths to real applications, exam technique focus',
      T4: 'Collegial, academic tone, discusses proof strategies and mathematical elegance',
    });
    await db.run(
      `INSERT INTO teacher_personas (id, name, specialisation, teaching_style, personality, tier_adaptations, prompt_template)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      'alma',
      'Alma',
      'Mathematics',
      'Patient, methodical, step-by-step. Uses visual analogies and concrete examples before abstract notation.',
      'Warm, encouraging. Celebrates small wins. Never makes a student feel stupid for not knowing something.',
      almaTierAdaptations,
      `You are Alma, a mathematics teacher. Your approach:

- You are patient and methodical. You never rush.
- You always start from what the student already knows.
- You use concrete examples before abstract notation.
- When a student gets stuck, you don't just repeat the explanation — you try a completely different approach (visual, numerical, real-world example).
- You celebrate progress: "Great thinking!" "You're getting it!"
- You check understanding by asking the student to explain back to you.
- If the student makes a mistake, you're curious about it: "Interesting — what made you think that?" Find the misconception, don't just correct the error.
- You connect new topics to things the student has already mastered.
- You speak Swedish with the student unless they write in another language.`
    );
    console.log('[pg-init] Seeded Alma teacher persona');
  }

  const oscarExists = await db.get<{ id: string }>("SELECT id FROM teacher_personas WHERE id = 'oscar'");
  if (!oscarExists) {
    const oscarTierAdaptations = JSON.stringify({
      T2: 'Accessible physiology, personal relevance, connects PE to everyday body experience',
      T3: 'Sport science depth, training periodization, VO\u2082 max, mental health and exercise research',
    });
    await db.run(
      `INSERT INTO teacher_personas (id, name, specialisation, teaching_style, personality, tier_adaptations, prompt_template)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      'oscar',
      'Oscar',
      'Sports, Health & Physical Education',
      'High-energy, motivational sports coach who connects physical activity to science and academic wellbeing.',
      'Energetic, direct, evidence-based. No body shaming. Celebrates effort and capacity. Cites real sport science.',
      oscarTierAdaptations,
      'You are Oscar, a sports coach and health educator. Link physical activity to science and wellbeing. Cite real sport science research. Never shame students about body or fitness level. Respond in Swedish by default.'
    );
    console.log('[pg-init] Seeded Oscar teacher persona');
  }

  const noraExists = await db.get<{ id: string }>("SELECT id FROM teacher_personas WHERE id = 'nora'");
  if (!noraExists) {
    const noraTierAdaptations = JSON.stringify({
      T3: 'Descriptive stats, probability, hypothesis testing, regression, real datasets from SCB/WHO/Gapminder',
      T4: 'Advanced statistical inference, Bayesian reasoning, research methodology, R/Python for data analysis',
    });
    await db.run(
      `INSERT INTO teacher_personas (id, name, specialisation, teaching_style, personality, tier_adaptations, prompt_template)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      'nora',
      'Nora',
      'Statistics & Data Science',
      'Analytical educator who always starts with real datasets and visualisation before calculation.',
      'Precise, curious about real-world patterns, comfortable with uncertainty. Treats "inconclusive" as a valid answer.',
      noraTierAdaptations,
      'You are Nora, a statistics and data science educator. Always start with the research question and real data before calculation. Respond in Swedish by default.'
    );
    console.log('[pg-init] Seeded Nora teacher persona');
  }

  const lindstromExists = await db.get<{ id: string }>("SELECT id FROM teacher_personas WHERE id = 'professor-lindstrom'");
  if (!lindstromExists) {
    const lindstromTierAdaptations = JSON.stringify({
      T4: 'Socratic examination of arguments, research question formulation, literature review, academic writing, thesis support',
    });
    await db.run(
      `INSERT INTO teacher_personas (id, name, specialisation, teaching_style, personality, tier_adaptations, prompt_template)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      'professor-lindstrom',
      'Professor Lindstr\u00f6m',
      'University-Level Academic Scholarship',
      'Socratic seminar method, research methodology, academic writing. Only for Tier 4 university students.',
      'Rigorous, collegial, intellectually demanding. Models intellectual modesty. Challenges weak arguments respectfully.',
      lindstromTierAdaptations,
      'You are Professor Lindstr\u00f6m, a senior academic for university-level students only (T4). Use Socratic seminar method. Respond in English by default at T4; Swedish if relevant. Never appear at T1\u2013T3.'
    );
    console.log('[pg-init] Seeded Professor Lindstr\u00f6m teacher persona');
  }

  // 3l. Event-driven workflow definitions
  const eventWfCount = await db.get<{ c: number }>(
    "SELECT COUNT(*) as c FROM workflow_definitions WHERE id LIKE 'wfd-event-%'"
  );
  if (!eventWfCount || eventWfCount.c === 0) {
    try {
      await db.run(
        `INSERT INTO workflow_definitions (id, name, description, trigger_type, steps, config, status, user_id)
         VALUES ($1, $2, $3, 'event', $4, $5, 'active', 'system')
         ON CONFLICT DO NOTHING`,
        'wfd-event-code-review',
        'Continuous Code Review',
        'Triggered on git push. Runs an AI review, posts findings, and alerts Slack on critical issues.',
        JSON.stringify([
          { type: 'llm', name: 'AI Code Review', config: { prompt: 'Review the changed files for bugs, security issues, and code quality. Be concise and actionable.' } },
          { type: 'conditional', name: 'Critical Issues?', config: { condition: 'findings.critical > 0' } },
          { type: 'messaging_notification', name: 'Alert Slack', config: { channel: '#code-review', message: 'Critical issues found' } },
        ]),
        JSON.stringify({ event_sources: ['git_push'] }),
      );

      await db.run(
        `INSERT INTO workflow_definitions (id, name, description, trigger_type, steps, config, status, user_id)
         VALUES ($1, $2, $3, 'event', $4, $5, 'active', 'system')
         ON CONFLICT DO NOTHING`,
        'wfd-event-incident-response',
        'Incident Response Escalation',
        'Triggered by compliance rule violations. Classifies severity, generates a report, and escalates.',
        JSON.stringify([
          { type: 'llm', name: 'Classify Incident', config: { prompt: 'Classify this compliance violation by severity and suggest immediate actions.' } },
          { type: 'llm', name: 'Generate Incident Report', config: { prompt: 'Write a concise incident report: what happened, impact, immediate actions, and remediation.' } },
          { type: 'messaging_notification', name: 'Notify Compliance Team', config: { channel: '#compliance-incidents', message: 'New compliance incident detected' } },
        ]),
        JSON.stringify({ event_sources: ['compliance_rules'] }),
      );

      await db.run(
        `INSERT INTO workflow_definitions (id, name, description, trigger_type, steps, config, status, user_id)
         VALUES ($1, $2, $3, 'event', $4, $5, 'active', 'system')
         ON CONFLICT DO NOTHING`,
        'wfd-event-regulatory-change',
        'Regulatory Change Auto-Response',
        'Triggered when Regulatory Radar scores a high-relevance item. Produces briefing and impact assessment.',
        JSON.stringify([
          { type: 'llm', name: 'Regulatory Briefing', config: { prompt: 'Write a briefing: what changed, why it matters, and who is affected.' } },
          { type: 'llm', name: 'Impact Assessment', config: { prompt: 'Assess impact across: regulatory perimeter, operations, technology, timeline, and budget.' } },
          { type: 'export', name: 'Save as PDF', config: { format: 'pdf', filename: 'regulatory-change' } },
        ]),
        JSON.stringify({ event_sources: ['regulatory_radar'] }),
      );

      await db.run(
        `INSERT INTO workflow_definitions (id, name, description, trigger_type, steps, config, status, user_id)
         VALUES ($1, $2, $3, 'event', $4, $5, 'active', 'system')
         ON CONFLICT DO NOTHING`,
        'wfd-event-compliance-violation',
        'Compliance Violation Escalation',
        'Triggered by critical/high severity violations. Generates remediation guidance and escalates for approval.',
        JSON.stringify([
          { type: 'llm', name: 'Remediation Guidance', config: { prompt: 'Provide root cause analysis, immediate remediation steps, and long-term controls.' } },
          { type: 'approval', name: 'Compliance Officer Review', config: { approvers: ['compliance-lead'], timeout_hours: 24 } },
          { type: 'messaging_notification', name: 'Confirmation Notice', config: { channel: '#compliance', message: 'Violation reviewed and remediation approved' } },
        ]),
        JSON.stringify({ event_sources: ['compliance_rules'] }),
      );

      await db.run(
        `INSERT INTO workflow_definitions (id, name, description, trigger_type, steps, config, status, user_id)
         VALUES ($1, $2, $3, 'event', $4, $5, 'active', 'system')
         ON CONFLICT DO NOTHING`,
        'wfd-event-client-doc-intake',
        'Client Document Intake',
        'Triggered via webhook when client uploads documents. Extracts key data, runs quality checks, queues for review.',
        JSON.stringify([
          { type: 'extract', name: 'Extract Document Data', config: { fields: ['entity_name', 'document_type', 'date', 'jurisdiction'] } },
          { type: 'llm', name: 'Quality & Completeness Check', config: { prompt: 'Check this document for completeness, consistency, and red flags. List any missing required fields.' } },
          { type: 'review', name: 'Queue for Analyst Review', config: { queue: 'document-review', priority: 'normal' } },
        ]),
        JSON.stringify({ event_sources: ['webhook'] }),
      );

      console.log('[pg-init] Seeded 5 event-driven workflow definitions');
    } catch (e) {
      console.warn('[pg-init] Event workflow seeding skipped (safe to ignore):', e);
    }
  }

  // 3m. Default deadline labels
  await db.exec(`INSERT INTO deadline_labels (id, name, color) VALUES
    ('lbl-regulatory', 'Regulatory', '#E74C3C'),
    ('lbl-client', 'Client', '#3498DB'),
    ('lbl-internal', 'Internal', '#27AE60'),
    ('lbl-urgent', 'Urgent', '#F5A623')
    ON CONFLICT DO NOTHING`);

  // 3n. Default workflow templates
  const wftCount = await db.get<{ c: number }>(
    'SELECT COUNT(*) as c FROM workflow_templates WHERE is_default = 1'
  );
  if (!wftCount || wftCount.c === 0) {
    try {
      await db.run(
        `INSERT INTO workflow_templates (id, name, description, category, steps, is_default, created_by) VALUES
          (
            'wft-analysis-board',
            'Analysis -> Board Report',
            'Run a detailed analysis then package findings into a board-ready report.',
            'reporting',
            '["Run gap or risk analysis","Review and refine key findings","Generate executive summary","Export as board-ready PDF or DOCX"]',
            1,
            'system'
          ),
          (
            'wft-gap-remediation',
            'Gap Analysis -> Remediation -> Tracking',
            'Identify compliance gaps, plan remediation actions, and track progress to closure.',
            'compliance',
            '["Conduct AMLR gap analysis against current state","Prioritise gaps by severity and effort","Create remediation action plan with owners and deadlines","Track closure status and verify completion"]',
            1,
            'system'
          ),
          (
            'wft-research-publish',
            'Research -> Draft -> Review -> Publish',
            'Research a regulatory topic, draft a document, run a peer review, and publish the final version.',
            'document',
            '["Research regulatory topic using Claude knowledge and web search","Draft policy or guidance document","Peer review and quality check","Incorporate feedback and publish final version"]',
            1,
            'system'
          )
        ON CONFLICT DO NOTHING`
      );
      console.log('[pg-init] Seeded 3 default workflow templates');
    } catch (e) {
      console.warn('[pg-init] Workflow templates seeding skipped (safe to ignore):', e);
    }
  }

  // 3o. ANTON capabilities and approaches (migration 026 data)
  const capabilitiesExist = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM anton_capabilities');
  if (!capabilitiesExist || capabilitiesExist.c === 0) {
    await db.exec(`INSERT INTO anton_capabilities VALUES
  ('cap-gap-analysis', 'module', 'AMLR Gap Analysis',
   'Assess an organisation against AMLR 2024/1624 requirements. Identifies gaps, scores each article, and produces a prioritised remediation plan.',
   'fcp', '["aml","amlr","gap","compliance","assessment","regulation"]',
   '/module/gap-analysis', 'gap-analysis',
   '["Entity type","Jurisdiction","Customer segments","Focus articles","Known concerns","Client documents"]',
   '["Gap scoring matrix (Excel)","Executive summary","Action plan with owners + deadlines"]',
   'deep', '["AMLR readiness assessment","Gap to compliance","Regulatory gap analysis","Pre-AMLA preparation"]', 1, NOW()),

  ('cap-gap-assessor', 'tool', 'Compliance Gap Assessor Wizard',
   'Step-by-step 8-phase wizard: select framework (AMLR, DORA, ISO 27001, Wolfsberg), scope articles, run AI assessment, produce capability view, board summary, and implementation roadmap.',
   'fcp', '["gap","assessor","wizard","framework","dora","iso27001","wolfsberg","amlr"]',
   '/gap-assessment', NULL,
   '["Framework selection","Scope (article/control selection)","Organisational context","Supporting documents"]',
   '["Article-by-article findings","Capability heatmap","Board summary","Implementation roadmap"]',
   'deep', '["Structured gap assessment","Framework compliance check","Board-ready compliance report"]', 1, NOW()),

  ('cap-counsels-desk', 'tool', 'Counsel''s Desk Legal Research',
   'AI-powered legal research workspace. Eight interaction modes: regulatory deep-dive, hypothetical testing, regulation comparison, case-law explorer, legal opinion drafting, gap-spotter, comparative jurisdiction, rapid risk.',
   'legal', '["legal","counsel","research","opinion","irac","regulation","law","brief"]',
   '/counsels-desk', NULL,
   '["Legal question or topic","Relevant jurisdiction","Expert role selection","Mode selection"]',
   '["Legal opinion (IRAC)","Regulatory analysis","Case-law summary","Comparative jurisdiction brief"]',
   'medium', '["Legal research","Draft legal opinion","Regulatory interpretation","Hypothetical scenario testing"]', 1, NOW()),

  ('cap-doc-creation', 'module', 'Compliance Document Creation',
   'Generate AML policies, KYC procedures, TM policies, SAR procedures, sanctions policies, training programmes, and board reports using structured AI drafting.',
   'fcp', '["document","policy","aml","kyc","tml","sar","sanctions","training","board","governance"]',
   '/module/document-creation', 'document-creation',
   '["Document type","Jurisdiction","Entity type","Existing policies (optional)","Branding requirements"]',
   '["Draft policy document (Word)","Procedure document","Training material","Board report"]',
   'medium', '["Draft AML policy","Create KYC procedures","Write board report","Update compliance manual"]', 1, NOW()),

  ('cap-sanctions-advisory', 'module', 'Sanctions Advisory',
   'Sanctions regime briefings, EBA Guidelines implementation, screening assessment, policy review, de-risking analysis, and incident response guidance.',
   'fcp', '["sanctions","ofac","eu","un","screening","derisking","incident","advisory"]',
   '/module/sanctions-advisory', 'sanctions-advisory',
   '["Regime or jurisdiction","Specific question or scenario","Current screening setup","Policy documents (optional)"]',
   '["Sanctions regime briefing","Implementation checklist","Screening gap analysis","Incident response plan"]',
   'medium', '["Sanctions screening review","EU sanctions implementation","De-risking analysis","Sanctions incident response"]', 1, NOW()),

  ('cap-risk-assessment', 'module', 'Risk Assessment Support',
   'BWRA (Business-Wide Risk Assessment) support: 5-dimension scoring framework, inherent and residual risk analysis, maturity assessment across AML dimensions.',
   'fcp', '["risk","bwra","assessment","maturity","inherent","residual","ml","tf"]',
   '/module/risk-assessment', 'risk-assessment',
   '["Entity type","Business lines","Customer segments","Product/service mix","Geographic exposure"]',
   '["BWRA scoring matrix","Maturity assessment","Detailed findings","Risk appetite statement"]',
   'deep', '["Business-wide risk assessment","AML risk scoring","Maturity assessment","Risk appetite review"]', 1, NOW()),

  ('cap-reg-monitor', 'module', 'Regulatory Monitor',
   'Monitor and analyse regulatory developments. Paste URLs, upload regulatory text, or describe new developments for impact analysis and briefing.',
   'fcp', '["regulatory","monitor","horizon","scanning","impact","briefing","change"]',
   '/module/regulatory-monitor', 'regulatory-monitor',
   '["Regulatory development (URL, text, or description)","Business lines affected"]',
   '["Quick briefing","Impact assessment","Stakeholder communication"]',
   'quick', '["Regulatory change analysis","Impact assessment","Horizon scanning","Briefing"]', 1, NOW()),

  ('cap-training-content', 'module', 'Training Content Creator',
   'Create AML/CFT training materials for board, compliance, front-line staff, relationship managers, or operations. Scenario-based, role-specific content.',
   'fcp', '["training","content","learning","aml","staff","board","elearning","scenario"]',
   '/module/training-content', 'training-content',
   '["Target audience","Topics to cover","Format preference","Existing materials (optional)"]',
   '["Training module","Case studies","Knowledge check questions","Facilitator guide"]',
   'medium', '["AML training content","Staff awareness material","Board training","Compliance e-learning"]', 1, NOW()),

  ('cap-investigation', 'module', 'Investigation & Case Support',
   'Structure suspicious activity investigations: 5-phase framework, typology library, SAR narrative drafting, network mapping guidance, information gap checklist.',
   'fcp', '["investigation","sar","suspicious","alert","case","typology","transaction","narrative"]',
   '/module/investigation-support', 'investigation-support',
   '["Alert or case description","Transaction data","Customer profile","Known typologies"]',
   '["Investigation framework","SAR narrative draft","Network map guide","Escalation memo"]',
   'deep', '["SAR investigation","Suspicious activity review","Case narrative","Alert triage"]', 1, NOW()),

  ('cap-data-management', 'module', 'AMLA Data Management',
   'Data readiness assessment for AMLA/GoAML requirements. Maps data domains, scores readiness, produces gap analysis and 3-phase roadmap.',
   'fcp', '["data","amla","goaml","readiness","governance","quality","dora","reporting"]',
   '/module/data-management', 'data-management',
   '["Data inventory (optional)","Current reporting setup","AMLA target requirements","IT architecture (optional)"]',
   '["Data readiness scorecard","AMLA gap analysis","3-phase roadmap","Action plan"]',
   'deep', '["AMLA data gap analysis","GoAML readiness","Data governance review","Reporting data quality"]', 1, NOW()),

  ('cap-open-chat', 'interaction', 'Open Chat / Prompt',
   'Free-form conversation with Claude using any thinking level, model, creativity setting, knowledge sources, and output format. Maximum flexibility.',
   'general', '["chat","prompt","open","free","conversation","custom","general"]',
   '/prompt', NULL,
   '["Any question or task"]',
   '["Any format — selected by user before running"]',
   'quick', '["Ad-hoc analysis","Quick question","Custom prompt","Free-form research"]', 1, NOW()),

  ('cap-brief-me', 'interaction', 'Brief Me',
   'Get a structured briefing on any topic, regulation, or situation. One-page format: context, key points, so-what, recommended actions.',
   'general', '["brief","summary","briefing","overview","quick","one-page"]',
   '/brief', NULL,
   '["Topic, document, or situation to brief on"]',
   '["Structured briefing document"]',
   'quick', '["Quick briefing","Executive summary","Topic overview","Situation brief"]', 1, NOW()),

  ('cap-workflow', 'workflow', 'Workflow Engine',
   'Build and run automated multi-step workflows: LLM steps, human approval gates, conditional routing, Slack/Teams notifications, export, data extraction.',
   'general', '["workflow","automation","multi-step","approval","pipeline","process"]',
   '/workflows', NULL,
   '["Workflow definition","Trigger configuration","Step sequence"]',
   '["Workflow execution report","Notifications sent","Documents generated","Approvals processed"]',
   'medium', '["Process automation","Document pipeline","Approval workflow","Recurring analysis"]', 1, NOW()),

  ('cap-orchestrator', 'tool', 'ANTON Orchestrator',
   'Strategic intelligence layer. Monitors all platform signals, generates briefings when thresholds exceeded, proposes actions at 4 trust stages.',
   'general', '["orchestrator","signals","briefing","autonomous","strategic","intelligence"]',
   '/orchestrator', NULL,
   '["Platform signals (automatic)"]',
   '["Briefings","Proposals","Action tracking"]',
   'deep', '["Platform-wide intelligence","Autonomous briefing","Strategic overview","Signal monitoring"]', 1, NOW()),

  ('cap-dj-screening', 'tool', 'Dow Jones Risk & Compliance Screening',
   'Screen individuals and entities against Dow Jones Risk & Compliance database. Covers PEP lists, sanctions lists, adverse media, and watch lists. Instant risk profile generation.',
   'fcp', '["screening","pep","sanctions","dow jones","risk","adverse media","kyc","cdd","watchlist"]',
   '/dj-screening', NULL,
   '["Entity name","Date of birth or incorporation date (optional)","Country"]',
   '["Risk profile","PEP status","Sanctions matches","Adverse media findings"]',
   'quick', '["KYC screening","PEP check","Sanctions screening","CDD entity verification","Onboarding risk check"]', 1, NOW()),

  ('cap-roaring', 'tool', 'Roaring Entity Registry Search',
   'Search Swedish and Nordic company registry (Roaring) for corporate structure, beneficial ownership, directors, and financial information. Essential for CDD on Nordic entities.',
   'fcp', '["roaring","company","registry","sweden","nordic","beneficial ownership","ubo","directors","corporate","cdd"]',
   '/roaring', NULL,
   '["Company name or registration number","Country (Sweden/Nordic)"]',
   '["Company profile","Directors and officers","Beneficial ownership","Financial summary","Risk indicators"]',
   'quick', '["Nordic UBO lookup","Swedish company registry","CDD entity research","Corporate structure mapping","Beneficial ownership verification"]', 1, NOW()),

  ('cap-radar', 'tool', 'Regulatory Horizon Radar',
   'Automated regulatory change monitoring. Tracks EBA, ESMA, AMLA, European Commission, national regulators, and FATF. Scores relevance, generates briefings, sends alerts.',
   'fcp', '["regulatory","radar","horizon","monitor","eba","esma","amla","fatf","change","alert","scanning","upcoming"]',
   '/radar', NULL,
   '["Keywords or focus areas","Regulator sources","Alert thresholds"]',
   '["Regulatory intelligence feed","Relevance-scored items","Impact briefings","Compliance calendar"]',
   'quick', '["Regulatory monitoring","Horizon scanning","EBA/ESMA alerts","Upcoming regulatory changes","FATF updates"]', 1, NOW()),

  ('cap-sanctions-module', 'module', 'Sanctions Advisory Module',
   'Full sanctions advisory coverage: regime briefings, EBA Guidelines implementation guide, screening programme assessment, sanctions policy review, de-risking analysis, and incident response.',
   'fcp', '["sanctions","ofac","eu","un","ofsi","screening","derisking","advisory","regime","incident","correspondent"]',
   '/module/sanctions-advisory', 'sanctions-advisory',
   '["Sanctions regime or jurisdiction","Specific question","Current screening configuration","Policy documents (optional)"]',
   '["Sanctions regime briefing","Implementation guide","Screening gap analysis","Policy review","Incident response plan"]',
   'medium', '["EU sanctions implementation","OFAC compliance","De-risking assessment","Sanctions incident response","Correspondent banking review"]', 1, NOW()),

  ('cap-wolfsberg-cbddq', 'tool', 'Wolfsberg CBDDQ Assessment',
   'Assess correspondent banking due diligence questionnaire (Wolfsberg CBDDQ) completion. Reviews responses for completeness, flags gaps, and compares against Wolfsberg Group standards.',
   'fcp', '["wolfsberg","cbddq","correspondent","banking","due diligence","questionnaire","standards","correspondent banking"]',
   '/gap-assessment', NULL,
   '["Completed or partial CBDDQ","Correspondent bank profile"]',
   '["CBDDQ gap analysis","Wolfsberg compliance assessment","Remediation recommendations"]',
   'medium', '["CBDDQ completion","Correspondent bank review","De-risking assessment","Wolfsberg standards compliance"]', 1, NOW())
  ON CONFLICT DO NOTHING`);
    console.log('[pg-init] Seeded 24 ANTON capabilities');
  }

  // Approaches
  const approachesExist = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM anton_approaches');
  if (!approachesExist || approachesExist.c === 0) {
    await db.exec(`INSERT INTO anton_approaches VALUES
  ('app-amlr-readiness', 'AMLR Readiness Assessment',
   'Run a structured AMLR gap analysis + board-ready output package',
   'Use the Gap Assessor wizard to assess your organisation against AMLR 2024/1624. ANTON will work through each article group, score compliance, identify gaps, and produce a capability heatmap, board summary, and implementation roadmap.',
   '["amlr","aml","gap","compliance","readiness","assessment","regulation 2024"]',
   '["cap-gap-assessor"]',
   '[{"step":1,"name":"Select AMLR framework","capability_id":"cap-gap-assessor","description":"Open Gap Assessor wizard and select AMLR 2024/1624"},{"step":2,"name":"Define scope","description":"Select relevant article groups and provide organisational context"},{"step":3,"name":"Run AI assessment","description":"ANTON assesses each article group — typically 10-20 minutes"},{"step":4,"name":"Review findings","description":"Review gap findings, capability heatmap, and board summary"},{"step":5,"name":"Export deliverables","description":"Download board summary, roadmap, and scoring matrix"}]',
   'deep', 'Board-ready AMLR gap assessment: capability heatmap, scored articles, implementation roadmap',
   '["Entity type (bank, PSP, fund manager, etc.)","Jurisdiction","Key customer segments"]',
   0.65, 0, 0, NULL, 1, NOW()),

  ('app-quick-legal', 'Quick Legal Research',
   'Get a legal opinion or regulatory interpretation in minutes',
   'Open Counsel''s Desk in the appropriate mode (deep-dive, opinion, or rapid-risk). ANTON acts as your chosen expert role and produces a structured legal analysis with citations.',
   '["legal","opinion","research","interpretation","counsel","regulatory","law","advice"]',
   '["cap-counsels-desk"]',
   '[{"step":1,"name":"Open Counsel''s Desk","capability_id":"cap-counsels-desk","description":"Select interaction mode and expert role"},{"step":2,"name":"Pose legal question","description":"Describe your question, jurisdiction, and context"},{"step":3,"name":"Review legal analysis","description":"ANTON produces IRAC-structured analysis with citations"},{"step":4,"name":"Pin key findings","description":"Pin important findings for later reference"}]',
   'medium', 'Structured legal analysis with citations, applicable law, and recommended actions',
   '["Legal question or scenario","Relevant jurisdiction","Any specific regulations to consider"]',
   0.60, 0, 0, NULL, 1, NOW()),

  ('app-compliance-doc', 'Draft Compliance Document',
   'Generate a professional compliance document (policy, procedure, or board report)',
   'Use the Document Creation module to draft any compliance document. ANTON applies the appropriate template and regulatory framework for your document type and jurisdiction.',
   '["document","policy","procedure","draft","write","create","aml","kyc","board","report"]',
   '["cap-doc-creation"]',
   '[{"step":1,"name":"Select document type","capability_id":"cap-doc-creation","description":"Choose: AML Policy, KYC Procedures, TM Policy, SAR Procedures, Sanctions Policy, Board Report, Training Programme"},{"step":2,"name":"Provide context","description":"Entity type, jurisdiction, customer segments, any existing documents"},{"step":3,"name":"Generate draft","description":"ANTON generates full document with appropriate structure"},{"step":4,"name":"Review and export","description":"Edit in conversation, then export as Word or PDF"}]',
   'medium', 'Complete draft compliance document ready for review and adaptation',
   '["Document type","Entity name","Jurisdiction","Customer segments"]',
   0.65, 0, 0, NULL, 1, NOW()),

  ('app-sar-investigation', 'SAR Investigation Support',
   'Structure a suspicious activity investigation and draft the SAR narrative',
   'Use the Investigation Support module to work through the 5-phase investigation framework. ANTON helps with typology matching, network mapping, and drafts the SAR narrative.',
   '["sar","suspicious","alert","investigation","case","transaction","aml","fraud","narrative"]',
   '["cap-investigation"]',
   '[{"step":1,"name":"Describe the alert","capability_id":"cap-investigation","description":"Paste transaction data, customer profile, and alert reason"},{"step":2,"name":"Typology analysis","description":"ANTON matches to known ML/TF typologies and counter-hypotheses"},{"step":3,"name":"Build investigation","description":"Work through 5-phase framework: predicate, layering, placement, integration, beneficiary"},{"step":4,"name":"Draft SAR narrative","description":"ANTON drafts a structured SAR narrative ready for filing"},{"step":5,"name":"Export report","description":"Export investigation memo and SAR draft"}]',
   'deep', 'Structured investigation memo, typology analysis, and SAR narrative draft',
   '["Alert description or case summary","Transaction data","Customer profile details"]',
   0.70, 0, 0, NULL, 1, NOW()),

  ('app-risk-assessment', 'Business-Wide Risk Assessment',
   'Run a full BWRA with 5-dimension scoring and maturity analysis',
   'Use the Risk Assessment module to build a Business-Wide Risk Assessment. ANTON applies the 5-dimension framework (Customers, Products/Services, Delivery Channels, Geographies, Transactions) with inherent and residual scoring.',
   '["risk","bwra","assessment","maturity","scoring","ml","tf","inherent","residual"]',
   '["cap-risk-assessment"]',
   '[{"step":1,"name":"Define entity","capability_id":"cap-risk-assessment","description":"Entity type, business lines, customer segments, geographies"},{"step":2,"name":"Dimension scoring","description":"ANTON scores each dimension: Customers, Products, Channels, Geographies, Transactions"},{"step":3,"name":"Inherent / residual analysis","description":"Map controls against inherent risk to calculate residual risk"},{"step":4,"name":"Maturity assessment","description":"Score AML control maturity across 10 dimensions"},{"step":5,"name":"Generate outputs","description":"Maturity assessment Excel, detailed findings, board summary"}]',
   'deep', 'Scored BWRA, maturity assessment Excel, detailed findings, board-ready summary',
   '["Entity type","Business lines","Customer segments","Geographic markets","Products and services"]',
   0.65, 0, 0, NULL, 1, NOW()),

  ('app-regulatory-briefing', 'Regulatory Change Briefing',
   'Analyse a regulatory development and produce a quick briefing + impact assessment',
   'Use the Regulatory Monitor module. Paste the URL, upload the document, or describe the change. ANTON produces a one-page briefing (What -> So What -> Now What) and a full impact assessment.',
   '["regulatory","briefing","change","impact","horizon","new regulation","update","guidance"]',
   '["cap-reg-monitor"]',
   '[{"step":1,"name":"Input the regulatory change","capability_id":"cap-reg-monitor","description":"Paste URL, upload PDF, or describe the regulatory development"},{"step":2,"name":"Select business lines","description":"Identify which parts of the organisation are affected"},{"step":3,"name":"Generate briefing","description":"ANTON produces one-page briefing: What, So What, Now What"},{"step":4,"name":"Impact assessment","description":"5-dimension impact: regulatory, operational, technology, people, financial"},{"step":5,"name":"Export","description":"Download as Word or PDF for stakeholder distribution"}]',
   'quick', 'One-page briefing + full impact assessment ready for stakeholder distribution',
   '["Regulatory development (URL, file, or description)"]',
   0.60, 0, 0, NULL, 1, NOW()),

  ('app-training-module', 'Create Training Content',
   'Build an AML/CFT training module for a specific audience',
   'Use the Training Content Creator to build scenario-based training material. Select audience (board, compliance, front-line, RMs, operations), topics, and format. ANTON generates objectives, scenarios, red flags, and knowledge checks.',
   '["training","content","aml","staff","board","learning","awareness","scenario","elearning"]',
   '["cap-training-content"]',
   '[{"step":1,"name":"Define audience and topics","capability_id":"cap-training-content","description":"Select audience type and key AML/CFT topics to cover"},{"step":2,"name":"Format selection","description":"Choose format: slide outline, facilitator guide, e-learning script, quiz"},{"step":3,"name":"Generate content","description":"ANTON creates learning objectives, scenarios, red flags, and knowledge checks"},{"step":4,"name":"Export","description":"Download as Word for adaptation"}]',
   'medium', 'Complete training module: objectives, scenarios, red flags, knowledge checks',
   '["Target audience","Topics to cover","Existing training gaps (optional)"]',
   0.60, 0, 0, NULL, 1, NOW()),

  ('app-dora-gap', 'DORA Gap Assessment',
   'Assess ICT risk management and operational resilience against DORA requirements',
   'Use the Gap Assessor wizard with DORA framework. ANTON evaluates all 73 articles across ICT governance, risk management, incident reporting, resilience testing, and third-party risk.',
   '["dora","ict","resilience","operational","technology","cyber","incident","third-party"]',
   '["cap-gap-assessor"]',
   '[{"step":1,"name":"Select DORA framework","capability_id":"cap-gap-assessor","description":"Open Gap Assessor and select DORA (Digital Operational Resilience Act)"},{"step":2,"name":"Scope by chapter","description":"Select relevant chapters: ICT governance, risk management, incident reporting, etc."},{"step":3,"name":"Run AI assessment","description":"ANTON assesses each article with your context"},{"step":4,"name":"Review and export","description":"Capability heatmap, board summary, implementation roadmap"}]',
   'deep', 'DORA readiness assessment: scored articles, capability heatmap, implementation roadmap',
   '["Organisation type","ICT infrastructure overview","Current resilience measures (optional)"]',
   0.65, 0, 0, NULL, 1, NOW()),

  ('app-sanctions-review', 'Sanctions Programme Review',
   'Review and strengthen a sanctions compliance programme end-to-end',
   'Use the Sanctions Advisory module to assess the current sanctions programme against EBA Guidelines and regulatory expectations. Covers screening, governance, policy, training, and incident management.',
   '["sanctions","screening","programme","review","compliance","ofac","eu","efsi","policy","controls"]',
   '["cap-sanctions-module"]',
   '[{"step":1,"name":"Describe current programme","capability_id":"cap-sanctions-module","description":"Provide details of current screening setup, governance, and policies"},{"step":2,"name":"Regime scope analysis","description":"Identify which sanctions regimes apply (EU, OFAC, OFSI, UN, etc.)"},{"step":3,"name":"Gap assessment","description":"ANTON reviews against EBA Guidelines on sanctions — highlights gaps"},{"step":4,"name":"Policy review","description":"Review screening policy, escalation procedures, and governance"},{"step":5,"name":"Recommendations","description":"Prioritised action plan with quick wins and longer-term improvements"}]',
   'deep', 'Sanctions programme gap analysis, EBA Guidelines assessment, prioritised remediation plan',
   '["Current screening vendor/tool","Jurisdictions covered","Recent regulatory findings (if any)"]',
   0.65, 0, 0, NULL, 1, NOW()),

  ('app-kyc-cdd-refresh', 'KYC/CDD Periodic Review Planning',
   'Design or improve a periodic CDD review programme',
   'Use Document Creation and Risk Assessment modules to design a risk-based periodic review schedule. ANTON produces a CDD policy framework, risk-tiering criteria, review triggers, and operational procedures.',
   '["kyc","cdd","periodic","review","refresh","due diligence","risk-based","customer","remediation"]',
   '["cap-risk-assessment","cap-doc-creation"]',
   '[{"step":1,"name":"Define customer base","capability_id":"cap-risk-assessment","description":"Entity types, risk tiers, geographic spread, volume estimates"},{"step":2,"name":"Risk-tier framework","description":"ANTON scores customer segments and proposes review frequency by tier"},{"step":3,"name":"Design review triggers","description":"Event-driven triggers: change of ownership, adverse news, transaction anomalies"},{"step":4,"name":"Draft CDD procedures","capability_id":"cap-doc-creation","description":"KYC/CDD periodic review procedures document"},{"step":5,"name":"Operational model","description":"Team structure, workflow, tooling requirements, SLA estimates"}]',
   'medium', 'Risk-tiered periodic review schedule, CDD procedures, operational model',
   '["Customer segments and volumes","Current review approach (if any)","Regulatory requirements"]',
   0.60, 0, 0, NULL, 1, NOW())
  ON CONFLICT DO NOTHING`);
    console.log('[pg-init] Seeded 10 ANTON approaches');
  }

  // 3p. Mark all legacy migrations as applied in schema_migrations
  // so the migration runner doesn't try to re-run them.
  const LEGACY_MIGRATIONS = [
    '001_add_embeddings_to_checkpoints',
    '002_pattern_scheduler_tables',
    '003_strategic_improvements',
    '003b_add_session_note',
    '004_quality_reasoning',
    '004b_radar_cron_schedule',
    '005_notifications',
    '006_add_knowledge_packs',
    '020_data_partnerships',
    '021_orchestrator',
    '022_orchestrator_phase2',
    '023_orchestrator_reasoning_trails',
    '023b_orchestrator_trail_enrichment',
    '024_orchestrator_demo_patterns',
    '025_orchestrator_meta_learning',
    '026_anton_self_knowledge',
    '027_task_execution_engine',
    '028_performance_indexes',
    '029_knowledge_pack_governance',
    '030_governance_audit_tables',
    '031_audit_prompt_version',
    '032_model_policy',
    '033_user_isolation',
    '034_session_exports',
    '035_soft_delete_is_archived',
    '036_mfa_totp',
    '037_human_oversight',
    '038_post_market_monitoring',
    '039_knowledge_atoms_fts_pg',
    '040_regulatory_feed',
    '041_lore_ledger',
    '042_iterative_reasoning',
    '043_gap_iterations',
    '044_retrieval_feedback',
    '045_atom_relationships',
    '046_pathfinder',
    '047_pathfinder_enrichment',
    '048_compaction_events',
  ];

  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const id of LEGACY_MIGRATIONS) {
    try {
      await db.run('INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING', id);
    } catch (_e) {
      // Ignore — already applied
    }
  }
  console.log(`[pg-init] Marked ${LEGACY_MIGRATIONS.length} legacy migrations as applied`);

  // 3q. Solo user (needed for FK constraints in solo mode)
  const soloUserExists = await db.get<{ id: string }>("SELECT id FROM users WHERE id = 'solo'");
  if (!soloUserExists) {
    await db.run(
      `INSERT INTO users (id, username, password_hash, role, display_name, monthly_token_budget, budget_alert_threshold, created_at)
       VALUES ('solo', 'solo', '', 'admin', 'Solo User', 0, 0.8, NOW())
       ON CONFLICT DO NOTHING`
    );
    console.log('[pg-init] Created solo user for single-user mode');
  }

  // 3r. Seed admin user on first launch (team mode only)
  if (process.env.DEPLOYMENT_MODE === 'team') {
    const adminExists = await db.get<{ id: string }>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (!adminExists) {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      let generatedPassword = '';
      for (let i = 0; i < 8; i++) generatedPassword += chars[Math.floor(Math.random() * chars.length)];
      const hash = bcrypt.hashSync(generatedPassword, 10);
      const adminId = randomUUID();
      await db.run(
        'INSERT INTO users (id, username, password_hash, role, display_name) VALUES ($1, $2, $3, $4, $5)',
        adminId, 'admin', hash, 'admin', 'Administrator'
      );
      const DB_PATH = process.env.DB_PATH || './data/workbench.sqlite';
      const credentialsPath = path.resolve(path.dirname(DB_PATH), 'initial-credentials.txt');
      const credentialsContent = [
        'openEXPERT \u2014 Initial Admin Credentials',
        '=======================================',
        'Username: admin',
        `Password: ${generatedPassword}`,
        '',
        'DELETE THIS FILE after your first login and change the password.',
        `Generated: ${new Date().toISOString()}`,
      ].join('\n');
      fs.writeFileSync(credentialsPath, credentialsContent, { encoding: 'utf-8', mode: 0o600 });
      console.log('\u2713 Admin account created. Credentials written to data/initial-credentials.txt (delete after first login).');
    }
  }

  // ── 4. Backfill tsvector search_vector for existing knowledge_atoms ──────
  try {
    const nullVectorCount = await db.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM knowledge_atoms WHERE search_vector IS NULL'
    );
    if (nullVectorCount && nullVectorCount.c > 0) {
      await db.exec(
        "UPDATE knowledge_atoms SET search_vector = to_tsvector('english', COALESCE(content, '')) WHERE search_vector IS NULL"
      );
      console.log(`[pg-init] Backfilled search_vector for ${nullVectorCount.c} knowledge_atoms rows`);
    }
  } catch (e) {
    // search_vector column may not exist yet if schema didn't include it
    console.warn('[pg-init] search_vector backfill skipped (safe to ignore):', e);
  }

  console.log(`[pg-init] PostgreSQL database initialized (${connectionString.replace(/:[^:@]+@/, ':***@')})`);
  return db;
}
