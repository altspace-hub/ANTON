import Database from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || './data/workbench.sqlite';

export function initDatabase(): Database.Database {
  const dbDir = path.dirname(DB_PATH);
  fs.ensureDirSync(dbDir);

  const db = new Database(DB_PATH);

  // Enable WAL mode and foreign keys
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  // Safe column migrations — SQLite doesn't support IF NOT EXISTS on ALTER TABLE
  const existingCols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const colNames = existingCols.map((c) => c.name);
  if (!colNames.includes('project_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN project_id TEXT REFERENCES projects(id)');
  }

  // Add workspace_path column to projects table
  const projectsCols = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
  const projectsColNames = projectsCols.map((c) => c.name);
  if (!projectsColNames.includes('workspace_path')) {
    db.exec('ALTER TABLE projects ADD COLUMN workspace_path TEXT');
    console.log('[db] Added workspace_path column to projects table');
  }

  // C5: Add share_token + shared_at columns to sessions
  if (!colNames.includes('share_token')) {
    db.exec('ALTER TABLE sessions ADD COLUMN share_token TEXT');
  }
  if (!colNames.includes('shared_at')) {
    db.exec('ALTER TABLE sessions ADD COLUMN shared_at DATETIME');
  }

  // 2.4: Add user_id column to sessions (session isolation per user)
  if (!colNames.includes('user_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
  }

  // D2: Add isSharedWithCommunity column to custom_modules
  const customModuleCols = db.prepare("PRAGMA table_info(custom_modules)").all() as Array<{ name: string }>;
  const customModuleColNames = customModuleCols.map((c) => c.name);
  if (!customModuleColNames.includes('is_shared_with_community')) {
    db.exec('ALTER TABLE custom_modules ADD COLUMN is_shared_with_community INTEGER DEFAULT 0');
  }

  // Check if audit_log table exists
  const auditTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'").all();
  if (auditTables.length === 0) {
    db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      session_id TEXT,
      module_id TEXT,
      area_id TEXT,
      model TEXT,
      provider TEXT DEFAULT 'anthropic',
      thinking_level TEXT,
      creativity TEXT,
      writing_tone TEXT DEFAULT 'professional',
      emoji_enabled INTEGER DEFAULT 0,
      structured_reasoning INTEGER DEFAULT 0,
      transparency_level INTEGER DEFAULT 0,
      knowledge_sources_used TEXT,
      input_token_count INTEGER DEFAULT 0,
      output_token_count INTEGER DEFAULT 0,
      cached_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0,
      response_status TEXT DEFAULT 'completed',
      review_status TEXT DEFAULT 'draft',
      reviewed_by TEXT,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      seed INTEGER
    )`);
  }

  // Add note column for session annotations
  if (!colNames.includes('note')) {
    db.exec('ALTER TABLE sessions ADD COLUMN note TEXT');
  }

  // Human review workflow: add review columns to sessions
  if (!colNames.includes('review_status')) {
    db.exec("ALTER TABLE sessions ADD COLUMN review_status TEXT DEFAULT 'draft'");
  }
  if (!colNames.includes('reviewed_by')) {
    db.exec('ALTER TABLE sessions ADD COLUMN reviewed_by TEXT');
  }
  if (!colNames.includes('reviewed_at')) {
    db.exec('ALTER TABLE sessions ADD COLUMN reviewed_at DATETIME');
  }

  // Add seed column to audit_log for reproducible outputs (GPT/Mistral only)
  const auditLogCols = db.prepare("PRAGMA table_info(audit_log)").all() as Array<{ name: string }>;
  const auditLogColNames = auditLogCols.map((c) => c.name);
  if (!auditLogColNames.includes('seed')) {
    db.exec('ALTER TABLE audit_log ADD COLUMN seed INTEGER');
  }
  // Add cache token columns for prompt caching metrics (Claude only)
  if (!auditLogColNames.includes('cached_tokens')) {
    db.exec('ALTER TABLE audit_log ADD COLUMN cached_tokens INTEGER DEFAULT 0');
  }
  if (!auditLogColNames.includes('cache_creation_tokens')) {
    db.exec('ALTER TABLE audit_log ADD COLUMN cache_creation_tokens INTEGER DEFAULT 0');
  }
  // Add RAG chunks column for RAG integration tracking (Phase 4)
  if (!auditLogColNames.includes('rag_chunks')) {
    db.exec('ALTER TABLE audit_log ADD COLUMN rag_chunks TEXT');
  }

  // Session toggles table (Writing Tone, Emoji, Structured Reasoning)
  const sessionTogglesCols = db.prepare("PRAGMA table_info(session_toggles)").all() as Array<{ name: string }>;
  if (sessionTogglesCols.length === 0) {
    db.exec(`CREATE TABLE IF NOT EXISTS session_toggles (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      structured_reasoning INTEGER DEFAULT 0,
      writing_tone TEXT DEFAULT 'professional',
      emoji_enabled INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  // WP-11: Add new user_profile columns (display_name, role_title, organisation, jurisdiction, output_language, org_size, focus_areas)
  const profileCols = db.prepare("PRAGMA table_info(user_profiles)").all() as Array<{ name: string }>;
  const profileColNames = profileCols.map((c) => c.name);
  if (!profileColNames.includes('display_name')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN display_name TEXT DEFAULT ''");
  }
  if (!profileColNames.includes('role_title')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN role_title TEXT DEFAULT ''");
  }
  if (!profileColNames.includes('organisation')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN organisation TEXT DEFAULT ''");
  }
  if (!profileColNames.includes('jurisdiction')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN jurisdiction TEXT DEFAULT ''");
  }
  if (!profileColNames.includes('output_language')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN output_language TEXT DEFAULT 'en'");
  }
  if (!profileColNames.includes('org_size')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN org_size TEXT DEFAULT 'mid-market'");
  }
  if (!profileColNames.includes('focus_areas')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN focus_areas TEXT DEFAULT '[]'");
  }

  // Sprint 5: Add hourly_rate_eur for ROI calculations
  if (!profileColNames.includes('hourly_rate_eur')) {
    db.exec('ALTER TABLE user_profiles ADD COLUMN hourly_rate_eur INTEGER DEFAULT 250');
  }

  // Brand style config (JSON: fonts, colors, palette)
  if (!profileColNames.includes('brand_config')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN brand_config TEXT DEFAULT NULL");
  }

  // Ensure the default profile row exists
  db.exec("INSERT OR IGNORE INTO user_profiles (id) VALUES ('default')");

  // ── RAG tables (BM25 retrieval) ─────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    folder_path TEXT NOT NULL,
    document_name TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    token_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS chunk_terms (
    chunk_id TEXT NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    freq REAL NOT NULL,
    PRIMARY KEY (chunk_id, term)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS indexed_folders (
    folder_path TEXT PRIMARY KEY,
    document_count INTEGER DEFAULT 0,
    chunk_count INTEGER DEFAULT 0,
    last_indexed DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'ready'
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_folder ON document_chunks(folder_path)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_terms_term ON chunk_terms(term)`);

  // ── Knowledge Collections (Vector RAG) ──────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS knowledge_collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'FolderOpen',
    color TEXT DEFAULT '#2DD4A8',
    watch_directories TEXT DEFAULT '[]',
    auto_index INTEGER DEFAULT 0,
    metadata_schema TEXT DEFAULT '{}',
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS rag_documents (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES knowledge_collections(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    chunk_count INTEGER DEFAULT 0,
    metadata TEXT,
    uploaded_by TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    indexed_at DATETIME,
    index_status TEXT DEFAULT 'pending' CHECK(index_status IN ('pending', 'indexing', 'indexed', 'failed'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS rag_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    chroma_id TEXT NOT NULL,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_rag_docs_collection ON rag_documents(collection_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rag_docs_status ON rag_documents(index_status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_chunks(document_id)`);

  // Seed default collections
  const collectionsExist = db.prepare("SELECT COUNT(*) as c FROM knowledge_collections").get() as { c: number };
  if (collectionsExist.c === 0) {
    db.prepare(`INSERT INTO knowledge_collections (id, name, display_name, description, icon, color, created_by) VALUES
      ('regulations', 'regulations', 'Regulations & Laws', 'EU/national regulations, directives, legal frameworks', 'Scale', '#3498DB', 'system'),
      ('client-docs', 'client-docs', 'Client Documents', 'Client policies, procedures, internal documents', 'Briefcase', '#2DD4A8', 'system'),
      ('templates', 'templates', 'Templates & Examples', 'Best-practice templates, past deliverables, examples', 'FileText', '#F5A623', 'system')
    `).run();
  }

  // Brand Templates — uploaded .docx/.pptx company templates for branded exports
  db.exec(`CREATE TABLE IF NOT EXISTS brand_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('docx', 'pptx')),
    file_path TEXT NOT NULL,
    file_size INTEGER,
    user_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Auth tables (team mode) ──────────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'analyst',
    display_name TEXT,
    monthly_token_budget INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS user_monthly_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_month TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    UNIQUE(user_id, year_month)
  )`);

  // E1: Add email column to users table (for password reset)
  const userCols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const userColNames = userCols.map((c) => c.name);
  if (!userColNames.includes('email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  }

  // E4: Add role column to users table (RBAC). Default 'user' for new installs.
  // Existing installs already have role defined in the CREATE TABLE above (default 'analyst').
  if (!userColNames.includes('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }

  // 2.7: Add budget alert threshold column to users table
  if (!userColNames.includes('budget_alert_threshold')) {
    db.exec('ALTER TABLE users ADD COLUMN budget_alert_threshold REAL DEFAULT 0.8');
  }

  // E1: Password reset tokens table
  db.exec(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // E5: App settings table — key/value store for global configuration
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  // Seed default monthly_budget_cap (0 = unlimited)
  db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('monthly_budget_cap', '0')").run();

  // E11: Workflow schedules table
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_run_at DATETIME,
    next_run_at DATETIME,
    run_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add workflow_definition column to workflow_schedules for headless execution
  const schedCols = db.prepare("PRAGMA table_info(workflow_schedules)").all() as Array<{ name: string }>;
  const schedColNames = schedCols.map((c) => c.name);
  if (!schedColNames.includes('workflow_definition')) {
    db.exec('ALTER TABLE workflow_schedules ADD COLUMN workflow_definition TEXT');
  }

  // Version History table
  db.exec(`CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    label TEXT,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_versions_entity ON versions(entity_type, entity_id)`);

  // ── Connection Framework tables ──────────────────────────────────────────────

  db.exec(`CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('database', 'api', 'filesystem', 'email', 'script_library', 'channel_bridge')),
    config JSON NOT NULL,
    permissions JSON NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL,
    approved_by TEXT,
    approved_at DATETIME,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'disabled', 'error')),
    last_tested DATETIME,
    last_test_result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migration: expand connections type CHECK to include 'channel_bridge' (safe, idempotent)
  const connTypeSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='connections'").get() as { sql: string } | undefined)?.sql ?? '';
  if (!connTypeSql.includes("'channel_bridge'")) {
    try {
      // Wrap in a transaction so a crash mid-migration doesn't leave the DB in a partial state
      db.transaction(() => {
        db.exec(`CREATE TABLE connections_v2 (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('database', 'api', 'filesystem', 'email', 'script_library', 'channel_bridge')),
          config JSON NOT NULL,
          permissions JSON NOT NULL DEFAULT '[]',
          created_by TEXT NOT NULL,
          approved_by TEXT,
          approved_at DATETIME,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'disabled', 'error')),
          last_tested DATETIME,
          last_test_result TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.exec(`INSERT INTO connections_v2 SELECT * FROM connections`);
        db.exec(`DROP TABLE connections`);
        db.exec(`ALTER TABLE connections_v2 RENAME TO connections`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status)`);
      })();
      console.log('[db] Migrated connections table: added channel_bridge type support');
    } catch (migErr) {
      console.error('[db] connections migration error (non-fatal):', migErr);
    }
  }

  db.exec(`CREATE TABLE IF NOT EXISTS scripts (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    description TEXT,
    language TEXT NOT NULL CHECK(language IN ('python', 'bash', 'r', 'powershell', 'node')),
    script_path TEXT NOT NULL,
    parameters JSON,
    expected_outputs JSON,
    max_runtime_seconds INTEGER DEFAULT 300,
    memory_limit_mb INTEGER DEFAULT 1024,
    sandbox INTEGER DEFAULT 1,
    network_access INTEGER DEFAULT 0,
    file_hash TEXT,
    version TEXT DEFAULT '1.0.0',
    approved_by TEXT,
    approved_at DATETIME,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS connection_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id TEXT NOT NULL,
    execution_id TEXT,
    action TEXT NOT NULL,
    details JSON,
    result_summary TEXT,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_by TEXT NOT NULL
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_conn_audit_connection ON connection_audit_log(connection_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_conn_audit_executed ON connection_audit_log(executed_at DESC)`);

  // ── Knowledge Foundation tables ────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_outputs (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    step_type TEXT NOT NULL,
    area_id TEXT,
    module_id TEXT,
    connection_id TEXT,
    output_data JSON NOT NULL,
    output_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    step_name TEXT NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_outputs_area ON workflow_outputs(area_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_outputs_module ON workflow_outputs(module_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_outputs_workflow ON workflow_outputs(workflow_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_outputs_created ON workflow_outputs(created_at)`);

  db.exec(`CREATE TABLE IF NOT EXISTS checkpoint_decisions (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    ai_recommendation TEXT,
    ai_confidence REAL,
    human_decision TEXT NOT NULL,
    human_reasoning TEXT,
    is_override INTEGER DEFAULT 0,
    override_category TEXT,
    context_snapshot JSON,
    decided_by TEXT NOT NULL,
    decided_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_workflow ON checkpoint_decisions(workflow_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_override ON checkpoint_decisions(is_override)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_date ON checkpoint_decisions(decided_at)`);

  db.exec(`CREATE TABLE IF NOT EXISTS knowledge_atoms (
    id TEXT PRIMARY KEY,
    source_output_id TEXT REFERENCES workflow_outputs(id),
    source_workflow_id TEXT NOT NULL,
    source_execution_id TEXT NOT NULL,
    source_area_id TEXT,
    source_module_id TEXT,
    content TEXT NOT NULL,
    atom_type TEXT NOT NULL,
    confidence REAL DEFAULT 0.8,
    category TEXT NOT NULL,
    subcategory TEXT,
    sentiment TEXT,
    temporal_type TEXT,
    entities JSON,
    tags JSON,
    valid_from DATETIME,
    valid_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    superseded_by TEXT,
    is_active INTEGER DEFAULT 1
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_atoms_category ON knowledge_atoms(category)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_atoms_type ON knowledge_atoms(atom_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_atoms_active ON knowledge_atoms(is_active, created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_atoms_workflow ON knowledge_atoms(source_workflow_id)`);

  db.exec(`CREATE TABLE IF NOT EXISTS knowledge_entity_refs (
    atom_id TEXT NOT NULL REFERENCES knowledge_atoms(id),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_name TEXT,
    relationship TEXT,
    PRIMARY KEY (atom_id, entity_type, entity_id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entity_refs_entity ON knowledge_entity_refs(entity_type, entity_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entity_refs_atom ON knowledge_entity_refs(atom_id)`);

  db.exec(`CREATE TABLE IF NOT EXISTS entity_aliases (
    entity_type TEXT NOT NULL,
    primary_id TEXT NOT NULL,
    alias_id TEXT NOT NULL,
    alias_source TEXT,
    PRIMARY KEY (entity_type, alias_id)
  )`);

  // ── Knowledge Graph tables (Layer 3) ─────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS entity_nodes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    interaction_count INTEGER DEFAULT 0,
    related_areas JSON DEFAULT '[]',
    metadata JSON,
    UNIQUE(entity_type, entity_id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS entity_relationships (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    strength REAL DEFAULT 1.0,
    first_observed DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_observed DATETIME DEFAULT CURRENT_TIMESTAMP,
    observation_count INTEGER DEFAULT 1,
    supporting_atoms JSON DEFAULT '[]',
    FOREIGN KEY (source_type, source_id) REFERENCES entity_nodes(entity_type, entity_id),
    FOREIGN KEY (target_type, target_id) REFERENCES entity_nodes(entity_type, entity_id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS entity_merge_log (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    entity_type TEXT NOT NULL,
    merged_from TEXT NOT NULL,
    merged_into TEXT NOT NULL,
    merge_reason TEXT,
    merged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    merged_by TEXT
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_entity_nodes_type ON entity_nodes(entity_type, last_seen DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entity_relationships_source ON entity_relationships(source_type, source_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entity_relationships_target ON entity_relationships(target_type, target_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entity_relationships_type ON entity_relationships(relationship_type)`);

  // ── Compliance-as-Code tables ─────────────────────────────────────────────

  db.exec(`CREATE TABLE IF NOT EXISTS compliance_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    regulatory_source TEXT,
    rule_logic TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    auto_remediate INTEGER DEFAULT 0,
    remediation_steps TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK(category IN ('kyc', 'transaction_monitoring', 'sanctions', 'reporting', 'governance', 'data_quality', 'operational')),
    CHECK(severity IN ('critical', 'high', 'medium', 'low'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS rule_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL REFERENCES compliance_rules(id),
    execution_context TEXT,
    result TEXT NOT NULL,
    findings TEXT,
    auto_remediated INTEGER DEFAULT 0,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK(result IN ('pass', 'fail', 'warning', 'error'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS rule_violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL REFERENCES compliance_rules(id),
    execution_id INTEGER NOT NULL REFERENCES rule_executions(id),
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    affected_entity TEXT,
    remediation_status TEXT DEFAULT 'open',
    remediated_at DATETIME,
    remediated_by TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK(severity IN ('critical', 'high', 'medium', 'low')),
    CHECK(remediation_status IN ('open', 'remediated', 'accepted_risk', 'false_positive'))
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_compliance_rules_category ON compliance_rules(category, active)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rule_executions_rule ON rule_executions(rule_id, executed_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rule_violations_status ON rule_violations(remediation_status, severity)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rule_violations_rule ON rule_violations(rule_id)`);

  // Seed compliance rules on first launch
  const complianceRulesExist = db.prepare("SELECT COUNT(*) as c FROM compliance_rules").get() as { c: number };
  if (complianceRulesExist.c === 0) {
    db.prepare(`INSERT INTO compliance_rules (rule_code, title, description, category, severity, regulatory_source, rule_logic, active, auto_remediate) VALUES
      ('TOKEN_LIMIT_001', 'Token Count Threshold', 'Ensure API calls do not exceed maximum token limits to prevent cost overruns and performance issues', 'operational', 'high', 'Internal Policy', '{"type":"threshold","config":{"field":"input_token_count","operator":">","threshold":180000,"warningThreshold":150000}}', 1, 0),
      ('OUTPUT_QUALITY_001', 'No TODO/FIXME in Production', 'Production outputs must not contain development markers like TODO or FIXME', 'data_quality', 'medium', 'Quality Standards', '{"type":"pattern","config":{"field":"output_text","pattern":"\\\\b(TODO|FIXME|XXX|HACK)\\\\b","flags":"gi"}}', 1, 0),
      ('MODEL_WHITELIST_001', 'Approved Models Only', 'Only allow use of approved Claude models for compliance work', 'governance', 'critical', 'Data Governance Policy', '{"type":"lookup","config":{"field":"model","allowedValues":["claude-opus-4-6","claude-sonnet-4-5-20250929"]}}', 1, 0),
      ('CITATION_REQ_001', 'Citation Requirement', 'All regulatory analysis must include citations and must not contain quality markers', 'data_quality', 'high', 'AMLR Art. 8', '{"type":"composite","config":{"operator":"AND","rules":[{"type":"pattern","config":{"field":"output_text","pattern":"\\\\[.*?\\\\]|Art\\\\.|Section|Regulation","flags":"i"}},{"type":"pattern","config":{"field":"output_text","pattern":"\\\\b(TODO|FIXME)\\\\b","flags":"gi"}}]}}', 1, 0),
      ('TRANSPARENCY_001', 'Minimum Transparency Level', 'Sessions must use adequate transparency for audit trail', 'governance', 'medium', 'Internal Audit Requirements', '{"type":"threshold","config":{"field":"transparency_level","operator":">=","threshold":1}}', 1, 0),
      ('DATA_SOURCE_001', 'Knowledge Source Validation', 'Ensure at least one knowledge source is configured for compliance modules', 'data_quality', 'high', 'Quality Framework', '{"type":"threshold","config":{"field":"knowledge_sources_count","operator":">","threshold":0}}', 1, 0),
      ('REVIEW_CYCLE_001', 'Mandatory Review for High-Risk', 'Critical outputs must undergo human review before finalization', 'governance', 'critical', 'Risk Management Policy', '{"type":"lookup","config":{"field":"review_status","allowedValues":["reviewed","approved"]}}', 1, 0),
      ('SESSION_LENGTH_001', 'Session Output Length Warning', 'Warn when session output exceeds typical report length', 'operational', 'low', 'Best Practices', '{"type":"threshold","config":{"field":"output_word_count","operator":">","threshold":10000,"warningThreshold":7500}}', 1, 0)
    `).run();
  }

  // ── Time Intelligence tables ─────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS deadlines (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATETIME NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_ref TEXT,
    category TEXT DEFAULT 'internal',
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
    depends_on JSON DEFAULT '[]',
    blocks JSON DEFAULT '[]',
    preparation_days INTEGER DEFAULT 0,
    review_days INTEGER DEFAULT 0,
    buffer_days INTEGER DEFAULT 2,
    earliest_start DATETIME,
    owner_id TEXT,
    team_ids JSON DEFAULT '[]',
    status TEXT DEFAULT 'upcoming' CHECK(status IN ('upcoming','in_progress','review','completed','overdue','at_risk')),
    completed_at DATETIME,
    is_recurring INTEGER DEFAULT 0,
    recurrence_rule TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deadlines_due ON deadlines(due_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deadlines_status ON deadlines(status, priority)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deadlines_owner ON deadlines(owner_id)`);

  // Safe migration: add new columns to deadlines table
  const deadlineColumns = db.prepare("PRAGMA table_info(deadlines)").all() as Array<{ name: string }>;
  const deadlineColNames = new Set(deadlineColumns.map(c => c.name));

  if (!deadlineColNames.has('parent_id')) {
    db.exec("ALTER TABLE deadlines ADD COLUMN parent_id TEXT");
  }
  if (!deadlineColNames.has('project_id')) {
    db.exec("ALTER TABLE deadlines ADD COLUMN project_id TEXT");
  }
  if (!deadlineColNames.has('labels')) {
    db.exec("ALTER TABLE deadlines ADD COLUMN labels JSON DEFAULT '[]'");
  }
  if (!deadlineColNames.has('assigned_to')) {
    db.exec("ALTER TABLE deadlines ADD COLUMN assigned_to JSON DEFAULT '[]'");
  }
  if (!deadlineColNames.has('effort_hours')) {
    db.exec("ALTER TABLE deadlines ADD COLUMN effort_hours REAL");
  }
  if (!deadlineColNames.has('sort_order')) {
    db.exec("ALTER TABLE deadlines ADD COLUMN sort_order INTEGER DEFAULT 0");
  }
  if (!deadlineColNames.has('kanban_column')) {
    db.exec("ALTER TABLE deadlines ADD COLUMN kanban_column TEXT DEFAULT 'backlog'");
  }
  if (!deadlineColNames.has('notes')) {
    db.exec("ALTER TABLE deadlines ADD COLUMN notes TEXT");
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_deadlines_parent ON deadlines(parent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deadlines_project ON deadlines(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deadlines_kanban ON deadlines(kanban_column, sort_order)`);

  // Deadline reminders table
  db.exec(`CREATE TABLE IF NOT EXISTS deadline_reminders (
    id TEXT PRIMARY KEY,
    deadline_id TEXT NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
    remind_days_before INTEGER NOT NULL DEFAULT 1,
    remind_via TEXT NOT NULL DEFAULT 'email',
    email_address TEXT,
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reminder_deadline ON deadline_reminders(deadline_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reminder_unsent ON deadline_reminders(sent_at, deadline_id)`);

  // Deadline labels table
  db.exec(`CREATE TABLE IF NOT EXISTS deadline_labels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#2DD4A8',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed default labels
  db.exec(`INSERT OR IGNORE INTO deadline_labels (id, name, color) VALUES
    ('lbl-regulatory', 'Regulatory', '#E74C3C'),
    ('lbl-client', 'Client', '#3498DB'),
    ('lbl-internal', 'Internal', '#27AE60'),
    ('lbl-urgent', 'Urgent', '#F5A623')`);

  // Deadline comments table
  db.exec(`CREATE TABLE IF NOT EXISTS deadline_comments (
    id TEXT PRIMARY KEY,
    deadline_id TEXT NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
    user_id TEXT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_deadline ON deadline_comments(deadline_id)`);

  db.exec(`CREATE TABLE IF NOT EXISTS work_rhythms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    frequency TEXT NOT NULL,
    anchor_expression TEXT NOT NULL,
    typical_duration_days INTEGER,
    typical_effort_hours REAL,
    source TEXT DEFAULT 'manual',
    associated_workflows JSON DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Regulatory Radar tables ──────────────────────────────────────────────────

  db.exec(`CREATE TABLE IF NOT EXISTS radar_sources (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    display_name TEXT NOT NULL,
    url TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('rss','web_page','eur_lex','api')),
    fetch_interval_hours REAL DEFAULT 24,
    last_fetched DATETIME,
    last_fetch_status TEXT,
    areas JSON DEFAULT '[]',
    keywords JSON DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS radar_items (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    source_id TEXT NOT NULL,
    external_id TEXT,
    title TEXT NOT NULL,
    summary TEXT,
    full_text TEXT,
    url TEXT,
    published_at DATETIME,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    item_type TEXT DEFAULT 'publication' CHECK(item_type IN ('consultation','regulation','guideline','enforcement','speech','report','publication')),
    status TEXT DEFAULT 'new' CHECK(status IN ('new','reviewed','actioned','dismissed','archived')),
    relevance_score REAL DEFAULT 0.5,
    urgency_score REAL DEFAULT 0.5,
    impact_areas JSON DEFAULT '[]',
    tags JSON DEFAULT '[]',
    ai_summary TEXT,
    ai_scored INTEGER DEFAULT 0,
    dismissed_by TEXT,
    dismissed_at DATETIME,
    FOREIGN KEY (source_id) REFERENCES radar_sources(id) ON DELETE CASCADE,
    UNIQUE(source_id, external_id)
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_radar_items_source ON radar_items(source_id, fetched_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_radar_items_status ON radar_items(status, relevance_score DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_radar_items_published ON radar_items(published_at DESC)`);

  // Seed default regulatory sources
  const radarSourcesExist = db.prepare("SELECT COUNT(*) as c FROM radar_sources").get() as { c: number };
  if (radarSourcesExist.c === 0) {
    db.prepare(`INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords) VALUES
      ('src_eba', 'European Banking Authority', 'https://www.eba.europa.eu/sites/default/documents/files/document_library/Publications/Guidelines/feed.xml', 'rss', 24, '["fcp","legal","banking"]', '["AML","CFT","capital","liquidity","governance"]'),
      ('src_esma', 'ESMA News', 'https://www.esma.europa.eu/press-news/esma-news', 'web_page', 24, '["legal","investment"]', '["MiFID","EMIR","MAR","sustainable finance"]'),
      ('src_fatf', 'FATF Publications', 'https://www.fatf-gafi.org/en/publications.html', 'web_page', 168, '["fcp"]', '["money laundering","terrorist financing","FATF","recommendation"]'),
      ('src_amla', 'EU AML/CFT Publications', 'https://eur-lex.europa.eu/search.html?scope=EURLEX&type=quick&lang=en&SUBDOM_INIT=LEGAL_SOURCES&DTS_SUBDOM=LEGAL_SOURCES', 'eur_lex', 24, '["fcp","legal"]', '["anti-money laundering","AMLA","AMLR","financial crime"]'),
      ('src_ecb', 'ECB Banking Supervision', 'https://www.bankingsupervision.europa.eu/press/publications/rss.xml', 'rss', 24, '["banking","risk"]', '["supervision","capital","stress test","SREP"]')
    `).run();
  }

  // ── Radar Settings (key/value) ──────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS radar_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.prepare("INSERT OR IGNORE INTO radar_settings (key, value) VALUES ('auto_scan_enabled', '0')").run();
  db.prepare("INSERT OR IGNORE INTO radar_settings (key, value) VALUES ('auto_scan_interval_hours', '24')").run();
  db.prepare("INSERT OR IGNORE INTO radar_settings (key, value) VALUES ('auto_scan_cron', '')").run();

  // ── Notifications table ──────────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'solo',
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at)');

  // ── Workflow Runs table (for tracking scheduled execution history) ────────
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    trigger_source TEXT,
    status TEXT DEFAULT 'running' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    current_step INTEGER DEFAULT 0,
    error_message TEXT,
    user_id TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status)');

  // ── Radar: add category columns (safe migration) ──────────────────────────
  const radarSourceCols = db.prepare("PRAGMA table_info(radar_sources)").all() as Array<{ name: string }>;
  const radarSourceColNames = radarSourceCols.map(c => c.name);
  if (!radarSourceColNames.includes('category')) {
    db.exec("ALTER TABLE radar_sources ADD COLUMN category TEXT DEFAULT 'regulatory'");
    console.log('[db] Added category column to radar_sources');
  }

  const radarItemCols = db.prepare("PRAGMA table_info(radar_items)").all() as Array<{ name: string }>;
  const radarItemColNames = radarItemCols.map(c => c.name);
  if (!radarItemColNames.includes('category')) {
    db.exec("ALTER TABLE radar_items ADD COLUMN category TEXT DEFAULT 'regulatory'");
    console.log('[db] Added category column to radar_items');
  }
  if (!radarItemColNames.includes('subcategory')) {
    db.exec('ALTER TABLE radar_items ADD COLUMN subcategory TEXT DEFAULT NULL');
    console.log('[db] Added subcategory column to radar_items');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_radar_items_category ON radar_items(category)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_radar_sources_category ON radar_sources(category)');

  // ── Project Files table ───────────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    extension TEXT,
    uploaded_by TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id)');

  // Add project_id to registered_folders
  const regFolderCols = db.prepare("PRAGMA table_info(registered_folders)").all() as Array<{ name: string }>;
  const regFolderColNames = regFolderCols.map(c => c.name);
  if (!regFolderColNames.includes('project_id')) {
    db.exec('ALTER TABLE registered_folders ADD COLUMN project_id TEXT DEFAULT NULL');
    console.log('[db] Added project_id column to registered_folders');
  }

  // ── Project Collaboration tables ──────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS project_members (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member','viewer')),
    added_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id)');

  db.exec(`CREATE TABLE IF NOT EXISTS project_invitations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    invited_by TEXT,
    token TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','expired','revoked')),
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_invitations_email ON project_invitations(email)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_invitations_token ON project_invitations(token)');

  db.exec(`CREATE TABLE IF NOT EXISTS project_notes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT,
    user_name TEXT,
    content TEXT NOT NULL,
    note_type TEXT DEFAULT 'note' CHECK(note_type IN ('note','update','milestone')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_notes_project ON project_notes(project_id, created_at DESC)');

  // ── Discovery Mode tables ─────────────────────────────────────────────────────

  db.exec(`CREATE TABLE IF NOT EXISTS discovery_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    tier TEXT NOT NULL CHECK(tier IN ('lite','standard','professional','expert')),
    state JSON NOT NULL DEFAULT '{}',
    status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed','abandoned')),
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    output_id TEXT,
    autosave_version INTEGER DEFAULT 0,
    schema_version INTEGER DEFAULT 1
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_discovery_sessions_user ON discovery_sessions(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_discovery_sessions_status ON discovery_sessions(status)');

  db.exec(`CREATE TABLE IF NOT EXISTS discovery_outputs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES discovery_sessions(id) ON DELETE CASCADE,
    tier TEXT NOT NULL,
    title TEXT,
    content_md TEXT,
    module_matches JSON,
    action_plan JSON,
    metrics JSON,
    non_ai_findings JSON,
    executive_briefing TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    exported_formats JSON DEFAULT '[]'
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_discovery_outputs_session ON discovery_outputs(session_id)');

  db.exec(`CREATE TABLE IF NOT EXISTS discovery_followups (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES discovery_sessions(id) ON DELETE CASCADE,
    scheduled_date DATE,
    type TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','completed','skipped')),
    follow_up_notes TEXT,
    progress_data JSON,
    modules_tried JSON,
    user_feedback JSON
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_discovery_followups_date ON discovery_followups(scheduled_date, status)');

  // ── Quality Ratchet tables ───────────────────────────────────────────────────

  db.exec(`CREATE TABLE IF NOT EXISTS quality_scores (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    session_id TEXT,
    module_id TEXT NOT NULL,
    area_id TEXT,
    content_hash TEXT NOT NULL,
    score_overall REAL NOT NULL,
    score_completeness REAL,
    score_accuracy REAL,
    score_structure REAL,
    score_actionability REAL,
    score_citations REAL,
    word_count INTEGER,
    scored_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    scored_by TEXT DEFAULT 'system',
    model_used TEXT,
    notes TEXT
  )`);
  // Ensure score_reasoning column exists (added post-v0.5 — safe to run on any DB)
  const qsCols = (db.pragma('table_info(quality_scores)') as any[]).map((c: any) => c.name);
  if (!qsCols.includes('score_reasoning')) {
    db.exec(`ALTER TABLE quality_scores ADD COLUMN score_reasoning TEXT DEFAULT NULL`);
  }

  db.exec(`CREATE TABLE IF NOT EXISTS quality_baselines (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    module_id TEXT NOT NULL UNIQUE,
    baseline_score REAL NOT NULL,
    sample_size INTEGER DEFAULT 1,
    established_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_quality_scores_module ON quality_scores(module_id, scored_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quality_baselines_module ON quality_baselines(module_id)`);

  // ── Pattern Detection tables (Layer 4) ───────────────────────────────────────

  db.exec(`CREATE TABLE IF NOT EXISTS detected_patterns (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    pattern_type TEXT NOT NULL CHECK(pattern_type IN ('temporal_correlation','entity_convergence','cascade','trend_divergence','gap')),
    pattern_subtype TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT DEFAULT 'info' CHECK(severity IN ('critical','warning','info','positive')),
    confidence REAL DEFAULT 0.5,
    supporting_data JSON NOT NULL,
    affected_entities JSON DEFAULT '[]',
    affected_workflows JSON DEFAULT '[]',
    affected_areas JSON DEFAULT '[]',
    first_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
    detection_count INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','investigating','resolved','dismissed')),
    resolved_at DATETIME,
    resolved_by TEXT,
    resolution_notes TEXT
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS pattern_detectors_state (
    detector_id TEXT PRIMARY KEY,
    last_run DATETIME,
    next_run DATETIME,
    run_count INTEGER DEFAULT 0,
    config JSON,
    enabled INTEGER DEFAULT 1
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_detected_patterns_type ON detected_patterns(pattern_type, status, last_detected DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_detected_patterns_severity ON detected_patterns(severity, status)`);

  // ── Coding Area tables ────────────────────────────────────────────────────

  db.exec(`CREATE TABLE IF NOT EXISTS coding_projects (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    tier TEXT NOT NULL DEFAULT 'large' CHECK(tier IN ('lite','medium','large')),
    status TEXT NOT NULL DEFAULT 'discovery' CHECK(status IN (
      'onboarding','discovery','architecture','estimation','planning',
      'implementation','testing','operational_readiness','completed','paused','archived'
    )),
    directory_path TEXT,
    git_initialized INTEGER DEFAULT 0,
    discovery_summary TEXT,
    architecture_summary TEXT,
    baseline_summary TEXT,
    tech_stack TEXT DEFAULT '[]',
    expert_panels TEXT DEFAULT '[]',
    cost_estimate TEXT DEFAULT '{}',
    cost_actual TEXT DEFAULT '{"total_input_tokens":0,"total_output_tokens":0,"total_cost_usd":0,"by_phase":{}}',
    environment_status TEXT DEFAULT 'pending' CHECK(environment_status IN ('pending','in_progress','verified','failed')),
    environment_mode TEXT CHECK(environment_mode IN ('auto','guided','handoff','docker')),
    current_phase INTEGER DEFAULT 0,
    current_release_id TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_projects_project ON coding_projects(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_projects_status ON coding_projects(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_projects_tier ON coding_projects(tier)`);

  db.exec(`CREATE TABLE IF NOT EXISTS coding_releases (
    id TEXT PRIMARY KEY,
    coding_project_id TEXT NOT NULL REFERENCES coding_projects(id) ON DELETE CASCADE,
    release_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    scope TEXT,
    status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','testing','review','completed','cancelled')),
    acceptance_criteria TEXT DEFAULT '[]',
    test_plan TEXT DEFAULT '{}',
    complexity_estimate TEXT DEFAULT '{}',
    complexity_actual TEXT DEFAULT '{}',
    milestone_date TEXT,
    deadline_id TEXT,
    git_branch TEXT,
    review_required_personas TEXT DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_releases_project ON coding_releases(coding_project_id, release_number)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_releases_status ON coding_releases(status)`);

  db.exec(`CREATE TABLE IF NOT EXISTS coding_tasks (
    id TEXT PRIMARY KEY,
    coding_release_id TEXT NOT NULL REFERENCES coding_releases(id) ON DELETE CASCADE,
    coding_project_id TEXT NOT NULL REFERENCES coding_projects(id) ON DELETE CASCADE,
    task_number TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','planned','in_progress','review','testing','completed','blocked','cancelled')),
    assigned_role TEXT,
    complexity_band TEXT DEFAULT 'medium' CHECK(complexity_band IN ('small','medium','large')),
    acceptance_criteria TEXT DEFAULT '[]',
    execution_plan TEXT,
    progress_log TEXT DEFAULT '[]',
    completion_record TEXT,
    completion_notes TEXT,
    review_status TEXT DEFAULT 'pending' CHECK(review_status IN ('pending','in_review','approved','rejected','skipped')),
    git_commit_hash TEXT,
    git_branch TEXT,
    depends_on TEXT DEFAULT '[]',
    blocks TEXT DEFAULT '[]',
    file_manifest TEXT DEFAULT '{}',
    test_results TEXT,
    tokens_consumed TEXT DEFAULT '{"input":0,"output":0,"cost_usd":0}',
    sort_order INTEGER DEFAULT 0,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_tasks_release ON coding_tasks(coding_release_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_tasks_project ON coding_tasks(coding_project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_tasks_status ON coding_tasks(status)`);

  db.exec(`CREATE TABLE IF NOT EXISTS coding_reviews (
    id TEXT PRIMARY KEY,
    coding_project_id TEXT NOT NULL REFERENCES coding_projects(id) ON DELETE CASCADE,
    coding_release_id TEXT,
    coding_task_id TEXT,
    reviewer_persona_id TEXT NOT NULL,
    review_type TEXT NOT NULL CHECK(review_type IN ('architecture','security','compliance','product','technical','goal_alignment','operational')),
    verdict TEXT CHECK(verdict IN ('endorse','flag','dissent')),
    findings TEXT,
    recommendations TEXT,
    severity_summary TEXT DEFAULT '{}',
    is_mandatory INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','overdue','skipped')),
    review_requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    review_completed_at DATETIME,
    escalation_sent_at DATETIME,
    workflow_execution_id TEXT,
    tokens_consumed TEXT DEFAULT '{"input":0,"output":0,"cost_usd":0}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_reviews_project ON coding_reviews(coding_project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_reviews_release ON coding_reviews(coding_release_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_reviews_task ON coding_reviews(coding_task_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_reviews_status ON coding_reviews(status)`);

  db.exec(`CREATE TABLE IF NOT EXISTS coding_test_runs (
    id TEXT PRIMARY KEY,
    coding_project_id TEXT NOT NULL REFERENCES coding_projects(id) ON DELETE CASCADE,
    coding_release_id TEXT,
    coding_task_id TEXT,
    test_type TEXT NOT NULL CHECK(test_type IN ('unit','integration','regression','acceptance','security','performance')),
    test_suite_name TEXT,
    results TEXT DEFAULT '{}',
    pass_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    skip_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    duration_ms INTEGER,
    ci_compatible INTEGER DEFAULT 0,
    workflow_execution_id TEXT,
    run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    run_by TEXT DEFAULT 'system'
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_test_runs_project ON coding_test_runs(coding_project_id, run_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_test_runs_release ON coding_test_runs(coding_release_id)`);

  db.exec(`CREATE TABLE IF NOT EXISTS code_review_sessions (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('paste','directory','repository')),
    source_path TEXT,
    source_url TEXT,
    explanation_level TEXT DEFAULT 'medium' CHECK(explanation_level IN ('high','medium','deep')),
    review_lenses TEXT DEFAULT '[]',
    security_mode TEXT CHECK(security_mode IN ('vulnerability','pentest_planning','red_blue_team','nist_csf','iso_27001','dora')),
    file_hashes TEXT DEFAULT '{}',
    findings_summary TEXT DEFAULT '{}',
    previous_session_id TEXT,
    is_diff_review INTEGER DEFAULT 0,
    diff_summary TEXT,
    tokens_consumed TEXT DEFAULT '{"input":0,"output":0,"cost_usd":0}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_code_review_sessions_session ON code_review_sessions(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_code_review_sessions_source ON code_review_sessions(source_path)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_code_review_sessions_prev ON code_review_sessions(previous_session_id)`);

  db.exec(`CREATE TABLE IF NOT EXISTS coding_tech_debt (
    id TEXT PRIMARY KEY,
    coding_project_id TEXT NOT NULL REFERENCES coding_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    rationale TEXT,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
    owner TEXT,
    target_release_id TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','accepted_risk','deferred')),
    source TEXT DEFAULT 'implementation' CHECK(source IN ('phase_0','implementation','review','alignment_check','manual')),
    source_task_id TEXT,
    resolved_at DATETIME,
    resolution_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_tech_debt_project ON coding_tech_debt(coding_project_id, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_tech_debt_severity ON coding_tech_debt(severity, status)`);

  db.exec(`CREATE TABLE IF NOT EXISTS coding_changes (
    id TEXT PRIMARY KEY,
    coding_project_id TEXT NOT NULL REFERENCES coding_projects(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL CHECK(change_type IN ('task','release','goal','architecture','stack')),
    change_level TEXT NOT NULL CHECK(change_level IN ('task','release','project')),
    title TEXT NOT NULL,
    rationale TEXT,
    initiated_by TEXT,
    original_state TEXT DEFAULT '{}',
    revised_state TEXT DEFAULT '{}',
    impact_assessment TEXT DEFAULT '{}',
    affected_release_ids TEXT DEFAULT '[]',
    affected_task_ids TEXT DEFAULT '[]',
    stakeholder_notifications TEXT DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','implemented','rejected')),
    cost_delta TEXT,
    approved_by TEXT,
    approved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_changes_project ON coding_changes(coding_project_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_changes_status ON coding_changes(status)`);

  db.exec(`CREATE TABLE IF NOT EXISTS coding_dependencies (
    id TEXT PRIMARY KEY,
    code_review_session_id TEXT REFERENCES code_review_sessions(id) ON DELETE CASCADE,
    coding_project_id TEXT REFERENCES coding_projects(id) ON DELETE CASCADE,
    package_name TEXT NOT NULL,
    current_version TEXT,
    latest_version TEXT,
    ecosystem TEXT NOT NULL CHECK(ecosystem IN ('npm','pypi','cargo','maven','gradle','nuget','go','gem','composer','other')),
    vulnerability_count INTEGER DEFAULT 0,
    vulnerability_details TEXT DEFAULT '[]',
    licence TEXT,
    licence_risk TEXT CHECK(licence_risk IN ('none','low','medium','high','critical')),
    last_updated TEXT,
    maintenance_status TEXT CHECK(maintenance_status IN ('active','maintained','minimal','abandoned','unknown')),
    is_direct INTEGER DEFAULT 1,
    recommendation TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_deps_review ON coding_dependencies(code_review_session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_deps_project ON coding_dependencies(coding_project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coding_deps_vuln ON coding_dependencies(vulnerability_count DESC)`);

  // ── Apprentice Model tables ───────────────────────────────────────────────────

  db.exec(`CREATE TABLE IF NOT EXISTS apprentice_profiles (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    user_id TEXT NOT NULL DEFAULT 'default',
    module_id TEXT NOT NULL,
    area_id TEXT,
    stage TEXT DEFAULT 'observer' CHECK(stage IN ('observer','guided','supervised','autonomous')),
    sessions_completed INTEGER DEFAULT 0,
    quality_avg REAL,
    last_session DATETIME,
    promoted_to_guided DATETIME,
    promoted_to_supervised DATETIME,
    promoted_to_autonomous DATETIME,
    UNIQUE(user_id, module_id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS apprentice_observations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    user_id TEXT NOT NULL DEFAULT 'default',
    module_id TEXT NOT NULL,
    session_id TEXT,
    observation_type TEXT CHECK(observation_type IN ('config_choice','prompt_edit','output_quality','follow_up','export')),
    observation_data JSON,
    observed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Collaborative Canvas tables ──────────────────────────────────────────────

  // workflow_executions — lightweight persistence for canvas FK references
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    workflow_name TEXT NOT NULL DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','paused','completed','failed','aborted')),
    created_by TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS step_assignments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    execution_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    assigned_to TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_at DATETIME,
    sla_hours REAL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','overdue','reassigned')),
    started_at DATETIME,
    completed_at DATETIME,
    notes TEXT,
    FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS parallel_reviews (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    execution_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    reviewer TEXT NOT NULL,
    review_status TEXT DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected','abstained')),
    review_comment TEXT,
    reviewed_at DATETIME,
    required_for_consensus INTEGER DEFAULT 1,
    FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS canvas_comments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    execution_id TEXT NOT NULL,
    step_index INTEGER,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    comment_type TEXT DEFAULT 'comment' CHECK(comment_type IN ('comment','suggestion','concern','approval')),
    resolved INTEGER DEFAULT 0,
    resolved_by TEXT,
    resolved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_step_assignments_execution ON step_assignments(execution_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_step_assignments_user ON step_assignments(assigned_to, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_parallel_reviews_execution ON parallel_reviews(execution_id, step_index)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_canvas_comments_execution ON canvas_comments(execution_id)`);

  // ── Instruction Builder tables ──────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS instruction_builder_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'discovery' CHECK(status IN ('discovery','architecture','review','generated','completed')),
    target_tool TEXT NOT NULL CHECK(target_tool IN ('claude-code','codex','mistral-code')),
    vision_goals TEXT,
    discovery_notes TEXT,
    architecture_proposal TEXT,
    tool_profile_id TEXT,
    review_cycle_count INTEGER DEFAULT 0,
    coding_project_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ib_projects_status ON instruction_builder_projects(status)`);

  db.exec(`CREATE TABLE IF NOT EXISTS instruction_files (
    id TEXT PRIMARY KEY,
    instruction_builder_project_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK(file_type IN ('primary','supplementary')),
    target_tool TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    content TEXT NOT NULL,
    content_hash TEXT,
    review_status TEXT DEFAULT 'draft' CHECK(review_status IN ('draft','reviewed','approved')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (instruction_builder_project_id) REFERENCES instruction_builder_projects(id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_instruction_files_project ON instruction_files(instruction_builder_project_id)`);

  db.exec(`CREATE TABLE IF NOT EXISTS tool_profiles (
    id TEXT PRIMARY KEY,
    tool_name TEXT NOT NULL CHECK(tool_name IN ('claude-code','codex','mistral-code')),
    display_name TEXT NOT NULL,
    primary_filename TEXT NOT NULL,
    structure_template TEXT,
    tone_guidelines TEXT,
    formatting_rules TEXT,
    special_directives TEXT,
    is_default INTEGER DEFAULT 0,
    user_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tool_profiles_tool ON tool_profiles(tool_name)`);

  // Seed default tool profiles
  const toolProfilesExist = db.prepare("SELECT COUNT(*) as c FROM tool_profiles").get() as { c: number };
  if (toolProfilesExist.c === 0) {
    db.prepare(`INSERT INTO tool_profiles (id, tool_name, display_name, primary_filename, structure_template, tone_guidelines, formatting_rules, special_directives, is_default) VALUES
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
    `).run();
  }

  // ── Alignment Reviewer tables ─────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS alignment_reviews (
    id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    review_date TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'ingesting' CHECK(status IN ('ingesting','goals-set','analysing','reviewed','steering-generated')),
    project_state_summary TEXT,
    goals_reference TEXT,
    alignment_report TEXT,
    overall_status TEXT CHECK(overall_status IN ('on-track','partially-aligned','off-track')),
    instruction_builder_project_id TEXT,
    target_tool TEXT CHECK(target_tool IN ('claude-code','codex','mistral-code')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alignment_reviews_status ON alignment_reviews(status)`);

  db.exec(`CREATE TABLE IF NOT EXISTS alignment_dimensions (
    id TEXT PRIMARY KEY,
    alignment_review_id TEXT NOT NULL,
    dimension_name TEXT NOT NULL CHECK(dimension_name IN ('feature-completeness','architecture','domain-compliance','tech-health','security','goal-drift')),
    status TEXT NOT NULL CHECK(status IN ('green','amber','red')),
    findings TEXT,
    recommendations TEXT,
    reviewer_persona TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (alignment_review_id) REFERENCES alignment_reviews(id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alignment_dimensions_review ON alignment_dimensions(alignment_review_id)`);

  db.exec(`CREATE TABLE IF NOT EXISTS steering_instructions (
    id TEXT PRIMARY KEY,
    alignment_review_id TEXT NOT NULL,
    target_tool TEXT NOT NULL,
    instruction_type TEXT NOT NULL CHECK(instruction_type IN ('correction','continuation','refactoring','plan-update')),
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    review_status TEXT DEFAULT 'draft' CHECK(review_status IN ('draft','reviewed','approved')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (alignment_review_id) REFERENCES alignment_reviews(id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_steering_instructions_review ON steering_instructions(alignment_review_id)`);

  // Performance indexes — safe to add multiple times (IF NOT EXISTS)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_session ON audit_log(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_monthly_user ON user_monthly_usage(user_id, year_month)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunk_terms_term ON chunk_terms(term)`);

  // 2.4: Add user_id to audit_log table
  const auditLogCols2 = db.prepare("PRAGMA table_info(audit_log)").all() as Array<{ name: string }>;
  const auditLogColNames2 = auditLogCols2.map((c) => c.name);
  if (!auditLogColNames2.includes('user_id')) {
    db.exec('ALTER TABLE audit_log ADD COLUMN user_id TEXT REFERENCES users(id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id)');
  }

  // 2.4: Add user_id to workflow_executions table
  const workflowExecCols = db.prepare("PRAGMA table_info(workflow_executions)").all() as Array<{ name: string }>;
  const workflowExecColNames = workflowExecCols.map((c) => c.name);
  if (!workflowExecColNames.includes('user_id')) {
    db.exec('ALTER TABLE workflow_executions ADD COLUMN user_id TEXT REFERENCES users(id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_executions_user_id ON workflow_executions(user_id)');
  }

  // Seed solo user (needed for FK constraint on sessions.user_id in solo mode)
  const soloUserExists = db.prepare("SELECT id FROM users WHERE id = 'solo'").get();
  if (!soloUserExists) {
    db.prepare("INSERT INTO users (id, username, password_hash, role, display_name) VALUES ('solo', 'solo', '', 'admin', 'Solo User')").run();
    console.log('[db] Created solo user for single-user mode');
  }

  // Seed admin user on first launch (team mode only)
  if (process.env.DEPLOYMENT_MODE === 'team') {
    const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    if (!adminExists) {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      let generatedPassword = '';
      for (let i = 0; i < 8; i++) generatedPassword += chars[Math.floor(Math.random() * chars.length)];
      const hash = bcrypt.hashSync(generatedPassword, 10);
      const adminId = randomUUID();
      db.prepare('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)').run(
        adminId, 'admin', hash, 'admin', 'Administrator'
      );
      const credentialsPath = path.resolve(path.dirname(DB_PATH), 'initial-credentials.txt');
      const credentialsContent = [
        'openEXPERT — Initial Admin Credentials',
        '=======================================',
        'Username: admin',
        `Password: ${generatedPassword}`,
        '',
        'DELETE THIS FILE after your first login and change the password.',
        `Generated: ${new Date().toISOString()}`,
      ].join('\n');
      fs.writeFileSync(credentialsPath, credentialsContent, { encoding: 'utf-8', mode: 0o600 });
      console.log('✓ Admin account created. Credentials written to data/initial-credentials.txt (delete after first login).');
    }
  }

  // Presentations table — stores expert consultation results + generated PPTX metadata
  db.exec(`CREATE TABLE IF NOT EXISTS presentations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled Presentation',
    purpose TEXT DEFAULT '',
    audience TEXT DEFAULT '',
    core_message TEXT DEFAULT '',
    style TEXT DEFAULT 'dark-professional',
    slide_count INTEGER DEFAULT 8,
    time_minutes INTEGER DEFAULT 15,
    brief TEXT DEFAULT '{}',
    conversation TEXT DEFAULT '[]',
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','generating','ready','failed')),
    file_path TEXT,
    filename TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_presentations_created ON presentations(created_at DESC)`);

  // Phase A: Knowledge Library — shared named corpora registry
  const knowledgeLibraryTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_library'").all();
  if (knowledgeLibraryTables.length === 0) {
    db.exec(`CREATE TABLE IF NOT EXISTS knowledge_library (
      id        TEXT PRIMARY KEY,
      label     TEXT NOT NULL,
      path      TEXT NOT NULL,
      category  TEXT DEFAULT 'other',
      recursive INTEGER NOT NULL DEFAULT 1,
      file_filter TEXT,
      description TEXT,
      indexed_at TEXT,
      file_count INTEGER DEFAULT 0,
      word_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    console.log('[db] Created knowledge_library table');
  }

  // User feedback table — ties consultant ratings back to quality ratchet baselines
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS output_feedback (
      id               TEXT PRIMARY KEY,
      session_id       TEXT,
      quality_score_id TEXT,
      module_id        TEXT NOT NULL,
      area_id          TEXT,
      rating           INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment          TEXT,
      user_id          TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_output_feedback_module  ON output_feedback(module_id, created_at DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_output_feedback_session ON output_feedback(session_id)`);
  } catch (e) {
    console.warn('[db] output_feedback table already exists or migration failed (safe to ignore):', e);
  }

  // ── Skill Packs (Wave 2.2) ────────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS skill_packs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    target_role TEXT,
    target_industry TEXT,
    modules TEXT NOT NULL DEFAULT '[]',
    workflow_template TEXT,
    persona_configs TEXT,
    skills_attached TEXT,
    quality_baselines TEXT,
    getting_started TEXT,
    is_default INTEGER DEFAULT 0,
    created_by TEXT DEFAULT 'system',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Seed default skill packs on first launch
  const skillPacksExist = db.prepare("SELECT COUNT(*) as c FROM skill_packs").get() as { c: number };
  if (skillPacksExist.c === 0) {
    db.prepare(`INSERT INTO skill_packs (id, name, description, target_role, target_industry, modules, getting_started, is_default, created_by) VALUES
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
    `).run();
    console.log('[db] Seeded 5 default skill packs');
  }

  // Wave 2.3: Workflow templates table
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      steps TEXT NOT NULL DEFAULT '[]',
      is_default INTEGER DEFAULT 0,
      created_by TEXT DEFAULT 'system',
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // Seed 3 default templates only when none exist yet
    const wftCount = db.prepare("SELECT COUNT(*) as c FROM workflow_templates WHERE is_default = 1").get() as { c: number };
    if (wftCount.c === 0) {
      db.prepare(
        `INSERT OR IGNORE INTO workflow_templates (id, name, description, category, steps, is_default, created_by) VALUES
          (
            'wft-analysis-board',
            'Analysis → Board Report',
            'Run a detailed analysis then package findings into a board-ready report.',
            'reporting',
            '["Run gap or risk analysis","Review and refine key findings","Generate executive summary","Export as board-ready PDF or DOCX"]',
            1,
            'system'
          ),
          (
            'wft-gap-remediation',
            'Gap Analysis → Remediation → Tracking',
            'Identify compliance gaps, plan remediation actions, and track progress to closure.',
            'compliance',
            '["Conduct AMLR gap analysis against current state","Prioritise gaps by severity and effort","Create remediation action plan with owners and deadlines","Track closure status and verify completion"]',
            1,
            'system'
          ),
          (
            'wft-research-publish',
            'Research → Draft → Review → Publish',
            'Research a regulatory topic, draft a document, run a peer review, and publish the final version.',
            'document',
            '["Research regulatory topic using Claude knowledge and web search","Draft policy or guidance document","Peer review and quality check","Incorporate feedback and publish final version"]',
            1,
            'system'
          )`
      ).run();
      console.log('[db] Seeded 3 default workflow_templates');
    }
  } catch (e) {
    console.warn('[db] workflow_templates table already exists or seed failed (safe to ignore):', e);
  }

  // ── Engagement Task tables ────────────────────────────────────────────────
  try {
    // Core engagement record
    db.exec(`CREATE TABLE IF NOT EXISTS engagements (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      engagement_type TEXT NOT NULL DEFAULT 'full' CHECK (engagement_type IN ('full', 'lite')),
      status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN (
        'setup', 'scope_agreement', 'client_intelligence', 'resource_collection',
        'configuration', 'workstream_planning', 'execution', 'review', 'quality_gate', 'completed', 'archived'
      )),
      your_organisation TEXT,
      client_name TEXT,
      domain_areas TEXT DEFAULT '[]',
      engagement_brief TEXT DEFAULT '{}',
      quality_blueprint TEXT DEFAULT '{}',
      thinking_level TEXT DEFAULT 'think_hard',
      expert_panel TEXT DEFAULT '[]',
      review_modes TEXT DEFAULT '[]',
      knowledge_config TEXT DEFAULT '{}',
      scope_confirmed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_documents (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL CHECK (document_type IN (
        'engagement_letter', 'project_plan', 'good_example'
      )),
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      extracted_content TEXT,
      extraction_summary TEXT DEFAULT '{}',
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_workstreams (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      expert_panel TEXT DEFAULT '[]',
      thinking_level TEXT,
      timeline_start TEXT,
      timeline_end TEXT,
      execution_status TEXT DEFAULT 'pending' CHECK (execution_status IN (
        'pending', 'blocked', 'ready', 'executing', 'review', 'completed'
      )),
      dependencies TEXT DEFAULT '[]',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_scope_items (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      workstream_id TEXT REFERENCES engagement_workstreams(id),
      deliverable_ids TEXT DEFAULT '[]',
      methodology TEXT DEFAULT '[]',
      dependencies TEXT DEFAULT '[]',
      status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'modified', 'added', 'removed')),
      original_text TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_resources (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      workstream_id TEXT REFERENCES engagement_workstreams(id),
      category TEXT NOT NULL CHECK (category IN (
        'documents', 'meetings', 'regulations', 'data', 'code', 'good_example', 'other'
      )),
      title TEXT NOT NULL,
      file_path TEXT,
      url TEXT,
      extracted_content TEXT,
      extraction_summary TEXT,
      relevance_tags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'uploaded' CHECK (status IN (
        'uploaded', 'processing', 'reviewed', 'not_available', 'coming_later'
      )),
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_resource_categories (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      workstream_id TEXT REFERENCES engagement_workstreams(id),
      category TEXT NOT NULL,
      status TEXT DEFAULT 'available' CHECK (status IN ('available', 'coming_later', 'not_available')),
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_deliverables (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      format TEXT,
      description TEXT,
      scope_item_ids TEXT DEFAULT '[]',
      quality_standard TEXT,
      delivery_date TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'draft', 'review', 'approved', 'delivered'
      )),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_iterations (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      workstream_id TEXT REFERENCES engagement_workstreams(id),
      iteration_number INTEGER NOT NULL,
      output_content TEXT,
      confidence_assessment TEXT DEFAULT '{}',
      gap_analysis TEXT DEFAULT '[]',
      scope_creep_flags TEXT DEFAULT '[]',
      resources_used TEXT DEFAULT '[]',
      expert_reviews TEXT DEFAULT '{}',
      quality_scores TEXT DEFAULT '{}',
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'superseded')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_boundaries (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      boundary_type TEXT NOT NULL CHECK (boundary_type IN ('assumption', 'exclusion', 'limitation', 'risk')),
      description TEXT NOT NULL,
      source TEXT,
      original_text TEXT,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'removed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_client_intelligence (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      client_name TEXT NOT NULL,
      division_department TEXT,
      region_jurisdiction TEXT,
      products_in_scope TEXT DEFAULT '[]',
      scale_indicators TEXT DEFAULT '{}',
      regulatory_supervisors TEXT DEFAULT '[]',
      recent_regulatory_history TEXT DEFAULT '[]',
      peer_comparators TEXT DEFAULT '[]',
      business_model_description TEXT,
      technology_landscape TEXT DEFAULT '{}',
      organisational_context TEXT,
      engagement_trigger TEXT,
      client_maturity_signal TEXT,
      sensitivities TEXT,
      online_research_authorised INTEGER DEFAULT 0,
      source_channels TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_stakeholders (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT,
      organisation TEXT,
      contact_info TEXT,
      sign_off_authority TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_changelog (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      phase TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    // Indexes
    db.exec(`CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements(status, created_at DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_engagements_client ON engagements(client_name)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_engagement_docs_eng ON engagement_documents(engagement_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_engagement_ws_eng ON engagement_workstreams(engagement_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_engagement_scope_eng ON engagement_scope_items(engagement_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_engagement_resources_eng ON engagement_resources(engagement_id, category)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_engagement_iterations_ws ON engagement_iterations(workstream_id, iteration_number)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_engagement_changelog_eng ON engagement_changelog(engagement_id, created_at DESC)`);

    console.log('[db] Engagement Task tables created/verified');
  } catch (e) {
    console.warn('[db] Engagement tables migration error (non-fatal):', e);
  }

  // Safe column additions — ALTER TABLE fails silently if column already exists
  try { db.exec(`ALTER TABLE engagement_stakeholders ADD COLUMN stakeholder_type TEXT DEFAULT 'client_contact'`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE engagement_stakeholders ADD COLUMN expertise_areas TEXT DEFAULT '[]'`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE engagement_stakeholders ADD COLUMN notes TEXT`); } catch { /* already exists */ }

  // ── Peer Benchmarks + Quality Gate + Expert Config migrations ────────────────
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS engagement_peer_benchmarks (
      id               TEXT PRIMARY KEY,
      engagement_id    TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      benchmark_type   TEXT NOT NULL CHECK(benchmark_type IN ('web_search', 'internal')),
      source_engagement_id TEXT,
      anonymized_label TEXT NOT NULL,
      domain           TEXT,
      scope_similarity TEXT,
      maturity_data    TEXT DEFAULT '{}',
      key_findings     TEXT DEFAULT '[]',
      search_query     TEXT,
      raw_content      TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS engagement_quality_gates (
      id                  TEXT PRIMARY KEY,
      engagement_id       TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      iteration_id        TEXT,
      scope_completeness  TEXT DEFAULT '{}',
      blueprint_alignment TEXT DEFAULT '{}',
      cross_consistency   TEXT DEFAULT '{}',
      assumptions_section TEXT,
      executive_summary   TEXT,
      expert_reviews      TEXT DEFAULT '{}',
      overall_score       REAL,
      release_ready       INTEGER DEFAULT 0,
      blockers            TEXT DEFAULT '[]',
      status              TEXT DEFAULT 'pending',
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_peer_benchmarks_eng ON engagement_peer_benchmarks(engagement_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_quality_gates_eng   ON engagement_quality_gates(engagement_id, created_at DESC)`);

    console.log('[db] Peer benchmarks + Quality Gate tables created/verified');
  } catch (e) {
    console.warn('[db] Peer/QG migration error (non-fatal):', e);
  }

  // Safe column additions for engagements table
  try { db.exec(`ALTER TABLE engagements ADD COLUMN enable_as_benchmark INTEGER DEFAULT 0`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE engagements ADD COLUMN knowledge_config TEXT DEFAULT '{}'`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE engagements ADD COLUMN workstream_plan_confirmed INTEGER DEFAULT 0`); } catch { /* already exists */ }

  // Safe column addition: thinking_content on engagement_iterations
  try { db.exec(`ALTER TABLE engagement_iterations ADD COLUMN thinking_content TEXT`); } catch { /* already exists */ }

  // Safe column addition: RAG directory for large document sets (engagement resources)
  try { db.exec(`ALTER TABLE engagements ADD COLUMN rag_directory_path TEXT`); } catch { /* already exists */ }

  // Safe migration: add user_id ownership to engagements (team mode isolation)
  try { db.exec(`ALTER TABLE engagements ADD COLUMN user_id TEXT REFERENCES users(id)`); } catch { /* already exists */ }
  try { db.exec(`UPDATE engagements SET user_id = 'solo' WHERE user_id IS NULL`); } catch { /* safe */ }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_engagements_user ON engagements(user_id)`); } catch { /* already exists */ }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_engagements_project ON engagements(project_id)`); } catch { /* already exists */ }

  console.log(`Database initialized at ${DB_PATH}`);
  return db;
}

// Run directly if called as script
if (process.argv[1] && (process.argv[1].endsWith('init.ts') || process.argv[1].endsWith('init.js'))) {
  const db = initDatabase();
  db.close();
  console.log('Database setup complete.');
}

export default initDatabase;
