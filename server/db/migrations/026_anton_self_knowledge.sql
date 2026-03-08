-- Migration 026: ANTON Self-Knowledge DB + Task Agent
-- ANTON needs structured knowledge about its own capabilities, workflows, and
-- approach templates so it can propose concrete execution paths when given a task.

-- ── Table 1: anton_capabilities ────────────────────────────────────────────
-- Every module, workflow type, tool, or feature ANTON can invoke
CREATE TABLE IF NOT EXISTS anton_capabilities (
  id TEXT PRIMARY KEY,
  capability_type TEXT NOT NULL,   -- 'module', 'workflow', 'tool', 'interaction'
  name TEXT NOT NULL,
  description TEXT NOT NULL,       -- What this capability does (user-readable)
  area TEXT,                       -- e.g. 'fcp', 'legal', 'pe-vc', 'general'
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array of searchable tags
  route TEXT,                      -- Frontend route when applicable (e.g. '/module/gap-analysis')
  module_id TEXT,                  -- Links to MODULES constant when capability_type='module'
  typical_inputs TEXT,             -- JSON: what information is needed to use this
  typical_outputs TEXT,            -- JSON: what this produces
  effort_estimate TEXT DEFAULT 'medium', -- 'quick' | 'medium' | 'deep'
  use_cases TEXT NOT NULL DEFAULT '[]',  -- JSON array of use-case strings
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── Table 2: anton_approaches ──────────────────────────────────────────────
-- Reusable approach templates that ANTON proposes when it receives a task.
-- Each approach links one or more capabilities in a logical execution path.
CREATE TABLE IF NOT EXISTS anton_approaches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,            -- One-line pitch ("Run AMLR gap analysis + board report")
  description TEXT NOT NULL,        -- Detailed what-this-approach-does
  task_pattern TEXT NOT NULL,       -- Keywords/pattern this approach matches (JSON array)
  capability_ids TEXT NOT NULL,     -- JSON array of capability IDs in execution order
  execution_steps TEXT NOT NULL,    -- JSON array of step objects {name, capability_id, config}
  effort TEXT DEFAULT 'medium',     -- 'quick' | 'medium' | 'deep'
  outcome TEXT NOT NULL,            -- What the user gets at the end
  required_inputs TEXT DEFAULT '[]', -- JSON: what the user must provide first
  confidence_threshold REAL DEFAULT 0.6, -- Min task-match confidence to propose this
  times_used INTEGER DEFAULT 0,
  times_completed INTEGER DEFAULT 0,
  avg_quality_score REAL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── Table 3: anton_tasks ───────────────────────────────────────────────────
-- Persistent task queue — tracks every task from intake to completion.
CREATE TABLE IF NOT EXISTS anton_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'intake',
  -- Status lifecycle: intake → proposing → awaiting_selection → clarifying
  --                   → executing → completed | cancelled | failed
  source TEXT NOT NULL DEFAULT 'manual',
  -- Source: 'manual' | 'jira' | 'slack' | 'standup' | 'email' | 'webhook'
  source_ref TEXT,                  -- e.g. Jira ticket ID, Slack thread URL
  priority TEXT DEFAULT 'normal',   -- 'low' | 'normal' | 'high' | 'urgent'

  -- Conversation: array of {role, content, timestamp} messages
  conversation TEXT NOT NULL DEFAULT '[]',

  -- ANTON's proposals (set after proposing phase)
  proposals TEXT DEFAULT '[]',      -- JSON array of approach IDs + rationale

  -- Chosen approach (set after selection)
  chosen_approach_id TEXT REFERENCES anton_approaches(id),
  chosen_approach_config TEXT,      -- JSON: user-provided inputs for the approach

  -- Clarifying questions ANTON needs answered
  clarifying_questions TEXT DEFAULT '[]',
  clarifying_answers TEXT DEFAULT '[]',

  -- Execution linkage
  execution_run_ids TEXT DEFAULT '[]',   -- JSON: workflow_run IDs or session IDs created
  execution_summary TEXT,                -- Final summary once done

  -- Metadata
  tags TEXT DEFAULT '[]',
  due_date TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_anton_tasks_user_status ON anton_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_anton_tasks_created ON anton_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anton_tasks_due_date ON anton_tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anton_approaches_confidence ON anton_approaches(confidence_threshold);
CREATE INDEX IF NOT EXISTS idx_anton_capabilities_area ON anton_capabilities(area);

-- ── Seed: Core FCP capability registry ────────────────────────────────────
INSERT OR IGNORE INTO anton_capabilities VALUES
  ('cap-gap-analysis', 'module', 'AMLR Gap Analysis',
   'Assess an organisation against AMLR 2024/1624 requirements. Identifies gaps, scores each article, and produces a prioritised remediation plan.',
   'fcp', '["aml","amlr","gap","compliance","assessment","regulation"]',
   '/module/gap-analysis', 'gap-analysis',
   '["Entity type","Jurisdiction","Customer segments","Focus articles","Known concerns","Client documents"]',
   '["Gap scoring matrix (Excel)","Executive summary","Action plan with owners + deadlines"]',
   'deep', '["AMLR readiness assessment","Gap to compliance","Regulatory gap analysis","Pre-AMLA preparation"]', 1, datetime('now')),

  ('cap-gap-assessor', 'tool', 'Compliance Gap Assessor Wizard',
   'Step-by-step 8-phase wizard: select framework (AMLR, DORA, ISO 27001, Wolfsberg), scope articles, run AI assessment, produce capability view, board summary, and implementation roadmap.',
   'fcp', '["gap","assessor","wizard","framework","dora","iso27001","wolfsberg","amlr"]',
   '/gap-assessment', NULL,
   '["Framework selection","Scope (article/control selection)","Organisational context","Supporting documents"]',
   '["Article-by-article findings","Capability heatmap","Board summary","Implementation roadmap"]',
   'deep', '["Structured gap assessment","Framework compliance check","Board-ready compliance report"]', 1, datetime('now')),

  ('cap-counsels-desk', 'tool', 'Counsel''s Desk Legal Research',
   'AI-powered legal research workspace. Eight interaction modes: regulatory deep-dive, hypothetical testing, regulation comparison, case-law explorer, legal opinion drafting, gap-spotter, comparative jurisdiction, rapid risk.',
   'legal', '["legal","counsel","research","opinion","irac","regulation","law","brief"]',
   '/counsels-desk', NULL,
   '["Legal question or topic","Relevant jurisdiction","Expert role selection","Mode selection"]',
   '["Legal opinion (IRAC)","Regulatory analysis","Case-law summary","Comparative jurisdiction brief"]',
   'medium', '["Legal research","Draft legal opinion","Regulatory interpretation","Hypothetical scenario testing"]', 1, datetime('now')),

  ('cap-doc-creation', 'module', 'Compliance Document Creation',
   'Generate AML policies, KYC procedures, TM policies, SAR procedures, sanctions policies, training programmes, and board reports using structured AI drafting.',
   'fcp', '["document","policy","aml","kyc","tml","sar","sanctions","training","board","governance"]',
   '/module/document-creation', 'document-creation',
   '["Document type","Jurisdiction","Entity type","Existing policies (optional)","Branding requirements"]',
   '["Draft policy document (Word)","Procedure document","Training material","Board report"]',
   'medium', '["Draft AML policy","Create KYC procedures","Write board report","Update compliance manual"]', 1, datetime('now')),

  ('cap-sanctions-advisory', 'module', 'Sanctions Advisory',
   'Sanctions regime briefings, EBA Guidelines implementation, screening assessment, policy review, de-risking analysis, and incident response guidance.',
   'fcp', '["sanctions","ofac","eu","un","screening","derisking","incident","advisory"]',
   '/module/sanctions-advisory', 'sanctions-advisory',
   '["Regime or jurisdiction","Specific question or scenario","Current screening setup","Policy documents (optional)"]',
   '["Sanctions regime briefing","Implementation checklist","Screening gap analysis","Incident response plan"]',
   'medium', '["Sanctions screening review","EU sanctions implementation","De-risking analysis","Sanctions incident response"]', 1, datetime('now')),

  ('cap-risk-assessment', 'module', 'Risk Assessment Support',
   'BWRA (Business-Wide Risk Assessment) support: 5-dimension scoring framework, inherent and residual risk analysis, maturity assessment across AML dimensions.',
   'fcp', '["risk","bwra","assessment","maturity","inherent","residual","ml","tf"]',
   '/module/risk-assessment', 'risk-assessment',
   '["Entity type","Business lines","Customer segments","Product/service mix","Geographic exposure"]',
   '["BWRA scoring matrix","Maturity assessment","Detailed findings","Risk appetite statement"]',
   'deep', '["Business-wide risk assessment","AML risk scoring","Maturity assessment","Risk appetite review"]', 1, datetime('now')),

  ('cap-reg-monitor', 'module', 'Regulatory Monitor',
   'Monitor and analyse regulatory developments. Paste URLs, upload regulatory text, or describe new developments for impact analysis and briefing.',
   'fcp', '["regulatory","monitor","horizon","scanning","impact","briefing","change"]',
   '/module/regulatory-monitor', 'regulatory-monitor',
   '["Regulatory development (URL, text, or description)","Business lines affected"]',
   '["Quick briefing","Impact assessment","Stakeholder communication"]',
   'quick', '["Regulatory change analysis","Impact assessment","Horizon scanning","Briefing"]', 1, datetime('now')),

  ('cap-training-content', 'module', 'Training Content Creator',
   'Create AML/CFT training materials for board, compliance, front-line staff, relationship managers, or operations. Scenario-based, role-specific content.',
   'fcp', '["training","content","learning","aml","staff","board","elearning","scenario"]',
   '/module/training-content', 'training-content',
   '["Target audience","Topics to cover","Format preference","Existing materials (optional)"]',
   '["Training module","Case studies","Knowledge check questions","Facilitator guide"]',
   'medium', '["AML training content","Staff awareness material","Board training","Compliance e-learning"]', 1, datetime('now')),

  ('cap-investigation', 'module', 'Investigation & Case Support',
   'Structure suspicious activity investigations: 5-phase framework, typology library, SAR narrative drafting, network mapping guidance, information gap checklist.',
   'fcp', '["investigation","sar","suspicious","alert","case","typology","transaction","narrative"]',
   '/module/investigation-support', 'investigation-support',
   '["Alert or case description","Transaction data","Customer profile","Known typologies"]',
   '["Investigation framework","SAR narrative draft","Network map guide","Escalation memo"]',
   'deep', '["SAR investigation","Suspicious activity review","Case narrative","Alert triage"]', 1, datetime('now')),

  ('cap-data-management', 'module', 'AMLA Data Management',
   'Data readiness assessment for AMLA/GoAML requirements. Maps data domains, scores readiness, produces gap analysis and 3-phase roadmap.',
   'fcp', '["data","amla","goaml","readiness","governance","quality","dora","reporting"]',
   '/module/data-management', 'data-management',
   '["Data inventory (optional)","Current reporting setup","AMLA target requirements","IT architecture (optional)"]',
   '["Data readiness scorecard","AMLA gap analysis","3-phase roadmap","Action plan"]',
   'deep', '["AMLA data gap analysis","GoAML readiness","Data governance review","Reporting data quality"]', 1, datetime('now')),

  ('cap-open-chat', 'interaction', 'Open Chat / Prompt',
   'Free-form conversation with Claude using any thinking level, model, creativity setting, knowledge sources, and output format. Maximum flexibility.',
   'general', '["chat","prompt","open","free","conversation","custom","general"]',
   '/prompt', NULL,
   '["Any question or task"]',
   '["Any format — selected by user before running"]',
   'quick', '["Ad-hoc analysis","Quick question","Custom prompt","Free-form research"]', 1, datetime('now')),

  ('cap-brief-me', 'interaction', 'Brief Me',
   'Get a structured briefing on any topic, regulation, or situation. One-page format: context, key points, so-what, recommended actions.',
   'general', '["brief","summary","briefing","overview","quick","one-page"]',
   '/brief', NULL,
   '["Topic, document, or situation to brief on"]',
   '["Structured briefing document"]',
   'quick', '["Quick briefing","Executive summary","Topic overview","Situation brief"]', 1, datetime('now')),

  ('cap-workflow', 'workflow', 'Workflow Engine',
   'Build and run automated multi-step workflows: LLM steps, human approval gates, conditional routing, Slack/Teams notifications, export, data extraction.',
   'general', '["workflow","automation","multi-step","approval","pipeline","process"]',
   '/workflows', NULL,
   '["Workflow definition","Trigger configuration","Step sequence"]',
   '["Workflow execution report","Notifications sent","Documents generated","Approvals processed"]',
   'medium', '["Process automation","Document pipeline","Approval workflow","Recurring analysis"]', 1, datetime('now')),

  ('cap-orchestrator', 'tool', 'ANTON Orchestrator',
   'Strategic intelligence layer. Monitors all platform signals, generates briefings when thresholds exceeded, proposes actions at 4 trust stages.',
   'general', '["orchestrator","signals","briefing","autonomous","strategic","intelligence"]',
   '/orchestrator', NULL,
   '["Platform signals (automatic)"]',
   '["Briefings","Proposals","Action tracking"]',
   'deep', '["Platform-wide intelligence","Autonomous briefing","Strategic overview","Signal monitoring"]', 1, datetime('now')),

  ('cap-dj-screening', 'tool', 'Dow Jones Risk & Compliance Screening',
   'Screen individuals and entities against Dow Jones Risk & Compliance database. Covers PEP lists, sanctions lists, adverse media, and watch lists. Instant risk profile generation.',
   'fcp', '["screening","pep","sanctions","dow jones","risk","adverse media","kyc","cdd","watchlist"]',
   '/dj-screening', NULL,
   '["Entity name","Date of birth or incorporation date (optional)","Country"]',
   '["Risk profile","PEP status","Sanctions matches","Adverse media findings"]',
   'quick', '["KYC screening","PEP check","Sanctions screening","CDD entity verification","Onboarding risk check"]', 1, datetime('now')),

  ('cap-roaring', 'tool', 'Roaring Entity Registry Search',
   'Search Swedish and Nordic company registry (Roaring) for corporate structure, beneficial ownership, directors, and financial information. Essential for CDD on Nordic entities.',
   'fcp', '["roaring","company","registry","sweden","nordic","beneficial ownership","ubo","directors","corporate","cdd"]',
   '/roaring', NULL,
   '["Company name or registration number","Country (Sweden/Nordic)"]',
   '["Company profile","Directors and officers","Beneficial ownership","Financial summary","Risk indicators"]',
   'quick', '["Nordic UBO lookup","Swedish company registry","CDD entity research","Corporate structure mapping","Beneficial ownership verification"]', 1, datetime('now')),

  ('cap-radar', 'tool', 'Regulatory Horizon Radar',
   'Automated regulatory change monitoring. Tracks EBA, ESMA, AMLA, European Commission, national regulators, and FATF. Scores relevance, generates briefings, sends alerts.',
   'fcp', '["regulatory","radar","horizon","monitor","eba","esma","amla","fatf","change","alert","scanning","upcoming"]',
   '/radar', NULL,
   '["Keywords or focus areas","Regulator sources","Alert thresholds"]',
   '["Regulatory intelligence feed","Relevance-scored items","Impact briefings","Compliance calendar"]',
   'quick', '["Regulatory monitoring","Horizon scanning","EBA/ESMA alerts","Upcoming regulatory changes","FATF updates"]', 1, datetime('now')),

  ('cap-sanctions-module', 'module', 'Sanctions Advisory Module',
   'Full sanctions advisory coverage: regime briefings, EBA Guidelines implementation guide, screening programme assessment, sanctions policy review, de-risking analysis, and incident response.',
   'fcp', '["sanctions","ofac","eu","un","ofsi","screening","derisking","advisory","regime","incident","correspondent"]',
   '/module/sanctions-advisory', 'sanctions-advisory',
   '["Sanctions regime or jurisdiction","Specific question","Current screening configuration","Policy documents (optional)"]',
   '["Sanctions regime briefing","Implementation guide","Screening gap analysis","Policy review","Incident response plan"]',
   'medium', '["EU sanctions implementation","OFAC compliance","De-risking assessment","Sanctions incident response","Correspondent banking review"]', 1, datetime('now')),

  ('cap-wolfsberg-cbddq', 'tool', 'Wolfsberg CBDDQ Assessment',
   'Assess correspondent banking due diligence questionnaire (Wolfsberg CBDDQ) completion. Reviews responses for completeness, flags gaps, and compares against Wolfsberg Group standards.',
   'fcp', '["wolfsberg","cbddq","correspondent","banking","due diligence","questionnaire","standards","correspondent banking"]',
   '/gap-assessment', NULL,
   '["Completed or partial CBDDQ","Correspondent bank profile"]',
   '["CBDDQ gap analysis","Wolfsberg compliance assessment","Remediation recommendations"]',
   'medium', '["CBDDQ completion","Correspondent bank review","De-risking assessment","Wolfsberg standards compliance"]', 1, datetime('now'));

-- ── Seed: Core approach templates ──────────────────────────────────────────
INSERT OR IGNORE INTO anton_approaches VALUES
  ('app-amlr-readiness', 'AMLR Readiness Assessment',
   'Run a structured AMLR gap analysis + board-ready output package',
   'Use the Gap Assessor wizard to assess your organisation against AMLR 2024/1624. ANTON will work through each article group, score compliance, identify gaps, and produce a capability heatmap, board summary, and implementation roadmap.',
   '["amlr","aml","gap","compliance","readiness","assessment","regulation 2024"]',
   '["cap-gap-assessor"]',
   '[{"step":1,"name":"Select AMLR framework","capability_id":"cap-gap-assessor","description":"Open Gap Assessor wizard and select AMLR 2024/1624"},{"step":2,"name":"Define scope","description":"Select relevant article groups and provide organisational context"},{"step":3,"name":"Run AI assessment","description":"ANTON assesses each article group — typically 10-20 minutes"},{"step":4,"name":"Review findings","description":"Review gap findings, capability heatmap, and board summary"},{"step":5,"name":"Export deliverables","description":"Download board summary, roadmap, and scoring matrix"}]',
   'deep', 'Board-ready AMLR gap assessment: capability heatmap, scored articles, implementation roadmap',
   '["Entity type (bank, PSP, fund manager, etc.)","Jurisdiction","Key customer segments"]',
   0.65, 0, 0, NULL, 1, datetime('now')),

  ('app-quick-legal', 'Quick Legal Research',
   'Get a legal opinion or regulatory interpretation in minutes',
   'Open Counsel''s Desk in the appropriate mode (deep-dive, opinion, or rapid-risk). ANTON acts as your chosen expert role and produces a structured legal analysis with citations.',
   '["legal","opinion","research","interpretation","counsel","regulatory","law","advice"]',
   '["cap-counsels-desk"]',
   '[{"step":1,"name":"Open Counsel''s Desk","capability_id":"cap-counsels-desk","description":"Select interaction mode and expert role"},{"step":2,"name":"Pose legal question","description":"Describe your question, jurisdiction, and context"},{"step":3,"name":"Review legal analysis","description":"ANTON produces IRAC-structured analysis with citations"},{"step":4,"name":"Pin key findings","description":"Pin important findings for later reference"}]',
   'medium', 'Structured legal analysis with citations, applicable law, and recommended actions',
   '["Legal question or scenario","Relevant jurisdiction","Any specific regulations to consider"]',
   0.60, 0, 0, NULL, 1, datetime('now')),

  ('app-compliance-doc', 'Draft Compliance Document',
   'Generate a professional compliance document (policy, procedure, or board report)',
   'Use the Document Creation module to draft any compliance document. ANTON applies the appropriate template and regulatory framework for your document type and jurisdiction.',
   '["document","policy","procedure","draft","write","create","aml","kyc","board","report"]',
   '["cap-doc-creation"]',
   '[{"step":1,"name":"Select document type","capability_id":"cap-doc-creation","description":"Choose: AML Policy, KYC Procedures, TM Policy, SAR Procedures, Sanctions Policy, Board Report, Training Programme"},{"step":2,"name":"Provide context","description":"Entity type, jurisdiction, customer segments, any existing documents"},{"step":3,"name":"Generate draft","description":"ANTON generates full document with appropriate structure"},{"step":4,"name":"Review and export","description":"Edit in conversation, then export as Word or PDF"}]',
   'medium', 'Complete draft compliance document ready for review and adaptation',
   '["Document type","Entity name","Jurisdiction","Customer segments"]',
   0.65, 0, 0, NULL, 1, datetime('now')),

  ('app-sar-investigation', 'SAR Investigation Support',
   'Structure a suspicious activity investigation and draft the SAR narrative',
   'Use the Investigation Support module to work through the 5-phase investigation framework. ANTON helps with typology matching, network mapping, and drafts the SAR narrative.',
   '["sar","suspicious","alert","investigation","case","transaction","aml","fraud","narrative"]',
   '["cap-investigation"]',
   '[{"step":1,"name":"Describe the alert","capability_id":"cap-investigation","description":"Paste transaction data, customer profile, and alert reason"},{"step":2,"name":"Typology analysis","description":"ANTON matches to known ML/TF typologies and counter-hypotheses"},{"step":3,"name":"Build investigation","description":"Work through 5-phase framework: predicate, layering, placement, integration, beneficiary"},{"step":4,"name":"Draft SAR narrative","description":"ANTON drafts a structured SAR narrative ready for filing"},{"step":5,"name":"Export report","description":"Export investigation memo and SAR draft"}]',
   'deep', 'Structured investigation memo, typology analysis, and SAR narrative draft',
   '["Alert description or case summary","Transaction data","Customer profile details"]',
   0.70, 0, 0, NULL, 1, datetime('now')),

  ('app-risk-assessment', 'Business-Wide Risk Assessment',
   'Run a full BWRA with 5-dimension scoring and maturity analysis',
   'Use the Risk Assessment module to build a Business-Wide Risk Assessment. ANTON applies the 5-dimension framework (Customers, Products/Services, Delivery Channels, Geographies, Transactions) with inherent and residual scoring.',
   '["risk","bwra","assessment","maturity","scoring","ml","tf","inherent","residual"]',
   '["cap-risk-assessment"]',
   '[{"step":1,"name":"Define entity","capability_id":"cap-risk-assessment","description":"Entity type, business lines, customer segments, geographies"},{"step":2,"name":"Dimension scoring","description":"ANTON scores each dimension: Customers, Products, Channels, Geographies, Transactions"},{"step":3,"name":"Inherent / residual analysis","description":"Map controls against inherent risk to calculate residual risk"},{"step":4,"name":"Maturity assessment","description":"Score AML control maturity across 10 dimensions"},{"step":5,"name":"Generate outputs","description":"Maturity assessment Excel, detailed findings, board summary"}]',
   'deep', 'Scored BWRA, maturity assessment Excel, detailed findings, board-ready summary',
   '["Entity type","Business lines","Customer segments","Geographic markets","Products and services"]',
   0.65, 0, 0, NULL, 1, datetime('now')),

  ('app-regulatory-briefing', 'Regulatory Change Briefing',
   'Analyse a regulatory development and produce a quick briefing + impact assessment',
   'Use the Regulatory Monitor module. Paste the URL, upload the document, or describe the change. ANTON produces a one-page briefing (What → So What → Now What) and a full impact assessment.',
   '["regulatory","briefing","change","impact","horizon","new regulation","update","guidance"]',
   '["cap-reg-monitor"]',
   '[{"step":1,"name":"Input the regulatory change","capability_id":"cap-reg-monitor","description":"Paste URL, upload PDF, or describe the regulatory development"},{"step":2,"name":"Select business lines","description":"Identify which parts of the organisation are affected"},{"step":3,"name":"Generate briefing","description":"ANTON produces one-page briefing: What, So What, Now What"},{"step":4,"name":"Impact assessment","description":"5-dimension impact: regulatory, operational, technology, people, financial"},{"step":5,"name":"Export","description":"Download as Word or PDF for stakeholder distribution"}]',
   'quick', 'One-page briefing + full impact assessment ready for stakeholder distribution',
   '["Regulatory development (URL, file, or description)"]',
   0.60, 0, 0, NULL, 1, datetime('now')),

  ('app-training-module', 'Create Training Content',
   'Build an AML/CFT training module for a specific audience',
   'Use the Training Content Creator to build scenario-based training material. Select audience (board, compliance, front-line, RMs, operations), topics, and format. ANTON generates objectives, scenarios, red flags, and knowledge checks.',
   '["training","content","aml","staff","board","learning","awareness","scenario","elearning"]',
   '["cap-training-content"]',
   '[{"step":1,"name":"Define audience and topics","capability_id":"cap-training-content","description":"Select audience type and key AML/CFT topics to cover"},{"step":2,"name":"Format selection","description":"Choose format: slide outline, facilitator guide, e-learning script, quiz"},{"step":3,"name":"Generate content","description":"ANTON creates learning objectives, scenarios, red flags, and knowledge checks"},{"step":4,"name":"Export","description":"Download as Word for adaptation"}]',
   'medium', 'Complete training module: objectives, scenarios, red flags, knowledge checks',
   '["Target audience","Topics to cover","Existing training gaps (optional)"]',
   0.60, 0, 0, NULL, 1, datetime('now')),

  ('app-dora-gap', 'DORA Gap Assessment',
   'Assess ICT risk management and operational resilience against DORA requirements',
   'Use the Gap Assessor wizard with DORA framework. ANTON evaluates all 73 articles across ICT governance, risk management, incident reporting, resilience testing, and third-party risk.',
   '["dora","ict","resilience","operational","technology","cyber","incident","third-party"]',
   '["cap-gap-assessor"]',
   '[{"step":1,"name":"Select DORA framework","capability_id":"cap-gap-assessor","description":"Open Gap Assessor and select DORA (Digital Operational Resilience Act)"},{"step":2,"name":"Scope by chapter","description":"Select relevant chapters: ICT governance, risk management, incident reporting, etc."},{"step":3,"name":"Run AI assessment","description":"ANTON assesses each article with your context"},{"step":4,"name":"Review and export","description":"Capability heatmap, board summary, implementation roadmap"}]',
   'deep', 'DORA readiness assessment: scored articles, capability heatmap, implementation roadmap',
   '["Organisation type","ICT infrastructure overview","Current resilience measures (optional)"]',
   0.65, 0, 0, NULL, 1, datetime('now')),

  ('app-sanctions-review', 'Sanctions Programme Review',
   'Review and strengthen a sanctions compliance programme end-to-end',
   'Use the Sanctions Advisory module to assess the current sanctions programme against EBA Guidelines and regulatory expectations. Covers screening, governance, policy, training, and incident management.',
   '["sanctions","screening","programme","review","compliance","ofac","eu","efsi","policy","controls"]',
   '["cap-sanctions-module"]',
   '[{"step":1,"name":"Describe current programme","capability_id":"cap-sanctions-module","description":"Provide details of current screening setup, governance, and policies"},{"step":2,"name":"Regime scope analysis","description":"Identify which sanctions regimes apply (EU, OFAC, OFSI, UN, etc.)"},{"step":3,"name":"Gap assessment","description":"ANTON reviews against EBA Guidelines on sanctions — highlights gaps"},{"step":4,"name":"Policy review","description":"Review screening policy, escalation procedures, and governance"},{"step":5,"name":"Recommendations","description":"Prioritised action plan with quick wins and longer-term improvements"}]',
   'deep', 'Sanctions programme gap analysis, EBA Guidelines assessment, prioritised remediation plan',
   '["Current screening vendor/tool","Jurisdictions covered","Recent regulatory findings (if any)"]',
   0.65, 0, 0, NULL, 1, datetime('now')),

  ('app-kyc-cdd-refresh', 'KYC/CDD Periodic Review Planning',
   'Design or improve a periodic CDD review programme',
   'Use Document Creation and Risk Assessment modules to design a risk-based periodic review schedule. ANTON produces a CDD policy framework, risk-tiering criteria, review triggers, and operational procedures.',
   '["kyc","cdd","periodic","review","refresh","due diligence","risk-based","customer","remediation"]',
   '["cap-risk-assessment","cap-doc-creation"]',
   '[{"step":1,"name":"Define customer base","capability_id":"cap-risk-assessment","description":"Entity types, risk tiers, geographic spread, volume estimates"},{"step":2,"name":"Risk-tier framework","description":"ANTON scores customer segments and proposes review frequency by tier"},{"step":3,"name":"Design review triggers","description":"Event-driven triggers: change of ownership, adverse news, transaction anomalies"},{"step":4,"name":"Draft CDD procedures","capability_id":"cap-doc-creation","description":"KYC/CDD periodic review procedures document"},{"step":5,"name":"Operational model","description":"Team structure, workflow, tooling requirements, SLA estimates"}]',
   'medium', 'Risk-tiered periodic review schedule, CDD procedures, operational model',
   '["Customer segments and volumes","Current review approach (if any)","Regulatory requirements"]',
   0.60, 0, 0, NULL, 1, datetime('now'));
