-- ============================================================================
-- ANTON by openEXPERT — PostgreSQL Schema (Complete)
-- Generated from: schema.sql + init.ts + migrations 001-048
-- All tables in FINAL state (base + all migrations merged).
-- ============================================================================

-- Requires: PostgreSQL 14+ with pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- GROUP 1: CORE USER & AUTH TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'analyst',
  display_name TEXT,
  email TEXT,
  monthly_token_budget INTEGER DEFAULT 0,
  budget_alert_threshold DOUBLE PRECISION DEFAULT 0.8,
  school_role TEXT DEFAULT NULL,
  education_tier TEXT DEFAULT NULL,
  guardian_invite_code TEXT,
  mfa_enabled INTEGER DEFAULT 0 NOT NULL,
  mfa_secret TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_monthly_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  UNIQUE(user_id, year_month)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT,
  role TEXT,
  company TEXT,
  industry TEXT,
  expertise TEXT,
  experience_level TEXT,
  communication_preferences TEXT,
  team_context TEXT,
  current_focus TEXT,
  display_name TEXT DEFAULT '',
  role_title TEXT DEFAULT '',
  organisation TEXT DEFAULT '',
  jurisdiction TEXT DEFAULT '',
  output_language TEXT DEFAULT 'en',
  org_size TEXT DEFAULT 'mid-market',
  focus_areas TEXT DEFAULT '[]',
  hourly_rate_eur INTEGER DEFAULT 250,
  brand_config TEXT DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  ip_address TEXT,
  success INTEGER NOT NULL,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_events (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK(event_type IN ('failed_login','unauthorized_access','budget_exceeded','rate_limit','suspicious_activity','invalid_input','ssrf_attempt')),
  user_id TEXT,
  ip_address TEXT,
  details TEXT,
  severity TEXT DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mfa_pending (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(16), 'hex'),
  user_id TEXT NOT NULL UNIQUE,
  secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- GROUP 2: PROJECTS & SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_id TEXT,
  status TEXT DEFAULT 'active',
  workspace_path TEXT,
  user_id TEXT NOT NULL DEFAULT 'default',
  org_id TEXT NOT NULL DEFAULT 'default',
  is_archived INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  project_id TEXT REFERENCES projects(id),
  share_token TEXT,
  shared_at TIMESTAMPTZ,
  user_id TEXT REFERENCES users(id),
  note TEXT,
  review_status TEXT DEFAULT 'draft',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  org_id TEXT NOT NULL DEFAULT 'default',
  is_archived INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  thinking_content TEXT,
  content_blocks TEXT,
  token_count INTEGER,
  cost DOUBLE PRECISION,
  config_snapshot TEXT DEFAULT NULL,
  model_id TEXT DEFAULT NULL,
  org_id TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_toggles (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  structured_reasoning INTEGER DEFAULT 0,
  writing_tone TEXT DEFAULT 'professional',
  emoji_enabled INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 3: MODULE CONFIGS, SKILLS, REVIEWS, CUSTOM MODULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS module_configs (
  id SERIAL PRIMARY KEY,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER DEFAULT 0,
  user_id TEXT NOT NULL DEFAULT 'default',
  org_id TEXT NOT NULL DEFAULT 'default',
  is_archived INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(module_id, name)
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT DEFAULT '1.0.0',
  author TEXT DEFAULT 'openEXPERT',
  category TEXT,
  prompt TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  user_id TEXT NOT NULL DEFAULT 'default',
  org_id TEXT NOT NULL DEFAULT 'default',
  is_archived INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  review_mode TEXT NOT NULL,
  overall_rating TEXT,
  content TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'default',
  org_id TEXT NOT NULL DEFAULT 'default',
  is_archived INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'Puzzle',
  area TEXT DEFAULT 'custom',
  system_prompt TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}',
  is_shared_with_community INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  prompt_instruction TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- GROUP 4: REGISTERED FOLDERS & RAG
-- ============================================================================

CREATE TABLE IF NOT EXISTS registered_folders (
  id SERIAL PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  file_count INTEGER DEFAULT 0,
  last_indexed TEXT,
  project_id TEXT DEFAULT NULL,
  user_id TEXT NOT NULL DEFAULT 'default',
  org_id TEXT NOT NULL DEFAULT 'default',
  is_archived INTEGER DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  folder_path TEXT NOT NULL,
  document_name TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  token_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunk_terms (
  chunk_id TEXT NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  freq DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (chunk_id, term)
);

CREATE TABLE IF NOT EXISTS indexed_folders (
  folder_path TEXT PRIMARY KEY,
  document_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  last_indexed TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'ready'
);

CREATE TABLE IF NOT EXISTS knowledge_collections (
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES knowledge_collections(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  chunk_count INTEGER DEFAULT 0,
  metadata TEXT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  indexed_at TIMESTAMPTZ,
  index_status TEXT DEFAULT 'pending' CHECK(index_status IN ('pending','indexing','indexed','failed'))
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  chroma_id TEXT NOT NULL,
  metadata TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_library (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  path TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  recursive INTEGER NOT NULL DEFAULT 1,
  file_filter TEXT,
  description TEXT,
  indexed_at TEXT,
  file_count INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  content_text TEXT NOT NULL,
  embedding TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimension INTEGER NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_type, content_id, embedding_model)
);

-- ============================================================================
-- GROUP 5: DATASETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  schema TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  size_bytes INTEGER,
  created_by TEXT NOT NULL,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  workflow_id TEXT,
  source_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TEXT,
  last_accessed_at TEXT,
  access_count INTEGER DEFAULT 0,
  storage_type TEXT DEFAULT 'sqlite',
  storage_path TEXT NOT NULL
);

-- ============================================================================
-- GROUP 6: LEGAL RESEARCH & GAP ASSESSMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_research_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'deep-dive',
  expert_role TEXT DEFAULT 'eu-regulatory-lawyer',
  research_questions TEXT DEFAULT '[]',
  pinned_findings TEXT DEFAULT '[]',
  citations TEXT DEFAULT '[]',
  active_knowledge_packs TEXT DEFAULT '[]',
  user_id TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gap_assessments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  frameworks TEXT NOT NULL DEFAULT '[]',
  scope_config TEXT NOT NULL DEFAULT '{}',
  context_config TEXT NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','assessing','scoring','synthesising','complete','paused')),
  current_step INTEGER DEFAULT 1,
  article_scores TEXT DEFAULT '{}',
  capability_view TEXT,
  board_summary TEXT,
  roadmap TEXT,
  session_id TEXT,
  user_id TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gap_findings (
  id SERIAL PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES gap_assessments(id) ON DELETE CASCADE,
  framework TEXT NOT NULL,
  article_id TEXT NOT NULL,
  article_title TEXT,
  requirement TEXT,
  current_state TEXT,
  score TEXT CHECK(score IN ('red','amber','yellow','green')),
  numeric_score INTEGER DEFAULT 0,
  priority TEXT CHECK(priority IN ('critical','high','medium','low')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gap_iterations (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES gap_assessments(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'complete',
  context_snapshot TEXT NOT NULL DEFAULT '{}',
  evidence_summary TEXT,
  findings_snapshot TEXT NOT NULL DEFAULT '[]',
  capability_snapshot TEXT,
  board_snapshot TEXT,
  roadmap_snapshot TEXT,
  score_summary TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'default'
);

-- ============================================================================
-- GROUP 7: AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
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
  estimated_cost_usd DOUBLE PRECISION DEFAULT 0,
  response_status TEXT DEFAULT 'completed',
  review_status TEXT DEFAULT 'draft',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  seed INTEGER,
  system_prompt_version_id TEXT,
  user_id TEXT,
  rag_chunks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 8: GOVERNANCE & PROMPT VERSIONING
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_prompts (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  module_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'system',
  effective_date TEXT NOT NULL DEFAULT CURRENT_DATE,
  deprecated_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_snapshots (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL CHECK(snapshot_type IN ('auto','manual','pause','checkpoint')),
  title TEXT,
  summary TEXT NOT NULL,
  key_decisions TEXT DEFAULT '[]',
  open_questions TEXT DEFAULT '[]',
  next_steps TEXT DEFAULT '[]',
  context_state TEXT DEFAULT '{}',
  token_count INTEGER DEFAULT 0,
  user_id TEXT DEFAULT 'default',
  -- GOV-03 fields (session completion config snapshot)
  module_id TEXT,
  model_id TEXT,
  thinking_level TEXT,
  creativity TEXT,
  output_formats TEXT DEFAULT '[]',
  knowledge_config TEXT DEFAULT '{}',
  system_prompt_hash TEXT,
  system_prompt_version_id TEXT,
  token_input INTEGER,
  token_output INTEGER,
  snapshotted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id)
);

CREATE TABLE IF NOT EXISTS prompt_audit (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  module_id TEXT NOT NULL,
  session_id TEXT,
  original_hash TEXT NOT NULL,
  edited_hash TEXT NOT NULL,
  original_length INTEGER,
  edited_length INTEGER,
  edited_by TEXT NOT NULL DEFAULT 'user',
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_allowed (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  model_id TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, model_id)
);

CREATE TABLE IF NOT EXISTS compliance_policy (
  id SERIAL PRIMARY KEY,
  module_id TEXT NOT NULL UNIQUE,
  enforce_model TEXT,
  enforce_thinking TEXT,
  enforce_creativity TEXT,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_exports (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(16), 'hex'),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  module_id TEXT,
  format TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exported_by TEXT
);

CREATE TABLE IF NOT EXISTS human_oversight_reviews (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'default',
  reviewer_name TEXT NOT NULL,
  reviewer_role TEXT,
  attestation TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('approved','requires_amendment','rejected')),
  notes TEXT,
  export_blocked INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_market_events (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  session_id TEXT,
  module_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('quality_rating','reversal','amendment','complaint','incident')),
  severity TEXT CHECK (severity IN ('low','medium','high','critical')),
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5),
  description TEXT NOT NULL,
  corrective_action TEXT,
  metadata TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- GROUP 9: KNOWLEDGE GRAPH & ENTITY TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  description TEXT,
  jurisdiction TEXT,
  regulatory_area TEXT,
  regulation_ids TEXT DEFAULT '[]',
  author TEXT,
  publisher TEXT,
  tier INTEGER DEFAULT 2 CHECK(tier IN (1,2,3)),
  entity_count INTEGER DEFAULT 0,
  relationship_count INTEGER DEFAULT 0,
  alias_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'installed' CHECK(status IN ('installed','active','deactivated','error')),
  manifest TEXT NOT NULL DEFAULT '{}',
  file_hash TEXT,
  effective_date TEXT,
  source_url TEXT,
  validated_by TEXT,
  content_confirmed INTEGER NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TEXT,
  deactivated_at TEXT,
  user_id TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE IF NOT EXISTS entity_nodes (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  interaction_count INTEGER DEFAULT 0,
  related_areas TEXT DEFAULT '[]',
  metadata TEXT,
  source TEXT NOT NULL DEFAULT 'workflow' CHECK(source IN ('workflow','pack','manual')),
  pack_id TEXT REFERENCES knowledge_packs(id) ON DELETE SET NULL,
  UNIQUE(entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS entity_relationships (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  strength DOUBLE PRECISION DEFAULT 1.0,
  first_observed TIMESTAMPTZ DEFAULT NOW(),
  last_observed TIMESTAMPTZ DEFAULT NOW(),
  observation_count INTEGER DEFAULT 1,
  supporting_atoms TEXT DEFAULT '[]',
  description TEXT,
  metadata TEXT,
  source TEXT NOT NULL DEFAULT 'workflow' CHECK(source IN ('workflow','pack','manual')),
  pack_id TEXT REFERENCES knowledge_packs(id) ON DELETE SET NULL,
  FOREIGN KEY (source_type, source_id) REFERENCES entity_nodes(entity_type, entity_id),
  FOREIGN KEY (target_type, target_id) REFERENCES entity_nodes(entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS entity_merge_log (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  entity_type TEXT NOT NULL,
  merged_from TEXT NOT NULL,
  merged_into TEXT NOT NULL,
  merge_reason TEXT,
  merged_at TIMESTAMPTZ DEFAULT NOW(),
  merged_by TEXT
);

CREATE TABLE IF NOT EXISTS entity_aliases (
  entity_type TEXT NOT NULL,
  primary_id TEXT NOT NULL,
  alias_id TEXT NOT NULL,
  alias_source TEXT,
  pack_id TEXT REFERENCES knowledge_packs(id) ON DELETE SET NULL,
  PRIMARY KEY (entity_type, alias_id)
);

-- ============================================================================
-- GROUP 10: KNOWLEDGE ATOMS & FTS (tsvector replaces FTS5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_atoms (
  id TEXT PRIMARY KEY,
  source_output_id TEXT,
  source_workflow_id TEXT NOT NULL,
  source_execution_id TEXT NOT NULL,
  source_area_id TEXT,
  source_module_id TEXT,
  content TEXT NOT NULL,
  atom_type TEXT NOT NULL,
  confidence DOUBLE PRECISION DEFAULT 0.8,
  category TEXT NOT NULL,
  subcategory TEXT,
  sentiment TEXT,
  temporal_type TEXT,
  entities TEXT,
  tags TEXT,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  superseded_by TEXT,
  is_active INTEGER DEFAULT 1,
  -- PostgreSQL tsvector column replaces SQLite FTS5 virtual table
  search_vector tsvector
  -- ANTON Studio Phase 4 (migration 239) adds coding_project_id + atom_origin
  -- via ALTER below — AFTER coding_projects is defined (it's created later in
  -- this file, so the FK cannot be declared inline here).
);

CREATE TABLE IF NOT EXISTS knowledge_entity_refs (
  atom_id TEXT NOT NULL REFERENCES knowledge_atoms(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  relationship TEXT,
  PRIMARY KEY (atom_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS atom_relationships (
  id SERIAL PRIMARY KEY,
  from_atom_id TEXT NOT NULL,
  to_atom_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK(relationship_type IN ('supports','contradicts','extends','requires','caused_by','related_to')),
  strength DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retrieval_feedback (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  atom_id TEXT NOT NULL,
  retrieval_method TEXT NOT NULL DEFAULT 'hybrid',
  retrieval_score DOUBLE PRECISION,
  injected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  was_relevant INTEGER
);

-- ============================================================================
-- GROUP 11: COMPLIANCE-AS-CODE
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_rules (
  id SERIAL PRIMARY KEY,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK(category IN ('kyc','transaction_monitoring','sanctions','reporting','governance','data_quality','operational')),
  CHECK(severity IN ('critical','high','medium','low'))
);

CREATE TABLE IF NOT EXISTS rule_executions (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL REFERENCES compliance_rules(id),
  execution_context TEXT,
  result TEXT NOT NULL,
  findings TEXT,
  auto_remediated INTEGER DEFAULT 0,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK(result IN ('pass','fail','warning','error'))
);

CREATE TABLE IF NOT EXISTS rule_violations (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL REFERENCES compliance_rules(id),
  execution_id INTEGER NOT NULL REFERENCES rule_executions(id),
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_entity TEXT,
  remediation_status TEXT DEFAULT 'open',
  remediated_at TIMESTAMPTZ,
  remediated_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK(severity IN ('critical','high','medium','low')),
  CHECK(remediation_status IN ('open','remediated','accepted_risk','false_positive'))
);

-- ============================================================================
-- GROUP 12: WORKFLOW DEFINITIONS & EXECUTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manual','scheduled','event','api')),
  steps TEXT NOT NULL DEFAULT '[]',
  config TEXT DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','draft')),
  user_id TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  trigger_source TEXT,
  status TEXT DEFAULT 'running' CHECK(status IN ('pending','running','completed','failed','cancelled')),
  current_step INTEGER DEFAULT 0,
  error_message TEXT,
  user_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS workflow_schedules (
  id SERIAL PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  workflow_definition TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_name TEXT NOT NULL DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','paused','completed','failed','aborted')),
  created_by TEXT,
  user_id TEXT REFERENCES users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workflow_outputs (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  area_id TEXT,
  module_id TEXT,
  connection_id TEXT,
  output_data TEXT NOT NULL,
  output_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  step_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  steps TEXT NOT NULL DEFAULT '[]',
  is_default INTEGER DEFAULT 0,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkpoint_decisions (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  ai_recommendation TEXT,
  ai_confidence DOUBLE PRECISION,
  human_decision TEXT NOT NULL,
  human_reasoning TEXT,
  is_override INTEGER DEFAULT 0,
  override_category TEXT,
  context_snapshot TEXT,
  decided_by TEXT NOT NULL,
  decided_at TIMESTAMPTZ DEFAULT NOW(),
  embedding TEXT DEFAULT NULL,
  user_feedback INTEGER DEFAULT NULL CHECK(user_feedback IN (-1, 1)),
  feedback_at TEXT DEFAULT NULL,
  cluster_id TEXT DEFAULT NULL,
  cluster_name TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS decision_clusters (
  id TEXT PRIMARY KEY,
  cluster_name TEXT NOT NULL,
  workflow_id TEXT,
  representative_decision TEXT NOT NULL,
  decision_count INTEGER DEFAULT 0,
  avg_confidence DOUBLE PRECISION DEFAULT 0.0,
  positive_feedback_count INTEGER DEFAULT 0,
  negative_feedback_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS step_assignments (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  execution_id TEXT NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  assigned_to TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  sla_hours DOUBLE PRECISION,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','overdue','reassigned')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS parallel_reviews (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  execution_id TEXT NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  reviewer TEXT NOT NULL,
  review_status TEXT DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected','abstained')),
  review_comment TEXT,
  reviewed_at TIMESTAMPTZ,
  required_for_consensus INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS canvas_comments (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  execution_id TEXT NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_index INTEGER,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  comment_type TEXT DEFAULT 'comment' CHECK(comment_type IN ('comment','suggestion','concern','approval')),
  resolved INTEGER DEFAULT 0,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 13: TIME INTELLIGENCE (DEADLINES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deadlines (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  category TEXT DEFAULT 'internal',
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
  depends_on TEXT DEFAULT '[]',
  blocks TEXT DEFAULT '[]',
  preparation_days INTEGER DEFAULT 0,
  review_days INTEGER DEFAULT 0,
  buffer_days INTEGER DEFAULT 2,
  earliest_start TIMESTAMPTZ,
  owner_id TEXT,
  team_ids TEXT DEFAULT '[]',
  status TEXT DEFAULT 'upcoming' CHECK(status IN ('upcoming','in_progress','review','completed','overdue','at_risk')),
  completed_at TIMESTAMPTZ,
  is_recurring INTEGER DEFAULT 0,
  recurrence_rule TEXT,
  parent_id TEXT,
  project_id TEXT,
  labels TEXT DEFAULT '[]',
  assigned_to TEXT DEFAULT '[]',
  effort_hours DOUBLE PRECISION,
  sort_order INTEGER DEFAULT 0,
  kanban_column TEXT DEFAULT 'backlog',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deadline_reminders (
  id TEXT PRIMARY KEY,
  deadline_id TEXT NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  remind_days_before INTEGER NOT NULL DEFAULT 1,
  remind_via TEXT NOT NULL DEFAULT 'email',
  email_address TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deadline_labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#2DD4A8',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deadline_comments (
  id TEXT PRIMARY KEY,
  deadline_id TEXT NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  user_id TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_rhythms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL,
  anchor_expression TEXT NOT NULL,
  typical_duration_days INTEGER,
  typical_effort_hours DOUBLE PRECISION,
  source TEXT DEFAULT 'manual',
  associated_workflows TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 14: REGULATORY RADAR
-- ============================================================================

CREATE TABLE IF NOT EXISTS radar_sources (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  display_name TEXT NOT NULL,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('rss','web_page','eur_lex','api')),
  fetch_interval_hours DOUBLE PRECISION DEFAULT 24,
  last_fetched TIMESTAMPTZ,
  last_fetch_status TEXT,
  areas TEXT DEFAULT '[]',
  keywords TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  category TEXT DEFAULT 'regulatory',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS radar_items (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  source_id TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  full_text TEXT,
  url TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  item_type TEXT DEFAULT 'publication' CHECK(item_type IN (
    'consultation','regulation','guideline','enforcement','speech','report','publication',
    'technology','sector','company_signal','funding_round','exit_event','macro_trend','patent','research_paper'
  )),
  status TEXT DEFAULT 'new' CHECK(status IN ('new','reviewed','actioned','dismissed','archived')),
  relevance_score DOUBLE PRECISION DEFAULT 0.5,
  urgency_score DOUBLE PRECISION DEFAULT 0.5,
  impact_areas TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  ai_summary TEXT,
  ai_scored INTEGER DEFAULT 0,
  dismissed_by TEXT,
  dismissed_at TIMESTAMPTZ,
  category TEXT DEFAULT 'regulatory',
  subcategory TEXT DEFAULT NULL,
  FOREIGN KEY (source_id) REFERENCES radar_sources(id) ON DELETE CASCADE,
  UNIQUE(source_id, external_id)
);

CREATE TABLE IF NOT EXISTS radar_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regulatory_feed_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'eu',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, source_id)
);

CREATE TABLE IF NOT EXISTS regulatory_feed_digests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  period_from TEXT,
  period_to TEXT,
  token_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- GROUP 15: NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'solo',
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 16: CONNECTIONS & SCRIPTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('database','api','filesystem','email','script_library','channel_bridge','messaging')),
  config TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','active','disabled','error')),
  last_tested TIMESTAMPTZ,
  last_test_result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  language TEXT NOT NULL CHECK(language IN ('python','bash','r','powershell','node')),
  script_path TEXT NOT NULL,
  parameters TEXT,
  expected_outputs TEXT,
  max_runtime_seconds INTEGER DEFAULT 300,
  memory_limit_mb INTEGER DEFAULT 1024,
  sandbox INTEGER DEFAULT 1,
  network_access INTEGER DEFAULT 0,
  file_hash TEXT,
  version TEXT DEFAULT '1.0.0',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connection_audit_log (
  id SERIAL PRIMARY KEY,
  connection_id TEXT NOT NULL,
  execution_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  result_summary TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  executed_by TEXT NOT NULL
);

-- ============================================================================
-- GROUP 17: PROJECT FILES & COLLABORATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_files (
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member','viewer')),
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_invitations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by TEXT,
  token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','expired','revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT,
  user_name TEXT,
  content TEXT NOT NULL,
  note_type TEXT DEFAULT 'note' CHECK(note_type IN ('note','update','milestone')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 18: ENGAGEMENT WORKSPACE
-- ============================================================================

CREATE TABLE IF NOT EXISTS engagements (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  engagement_type TEXT NOT NULL DEFAULT 'full' CHECK (engagement_type IN ('full','lite')),
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN (
    'setup','scope_agreement','client_intelligence','resource_collection',
    'configuration','workstream_planning','execution','review','quality_gate','completed','archived'
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
  enable_as_benchmark INTEGER DEFAULT 0,
  workstream_plan_confirmed INTEGER DEFAULT 0,
  rag_directory_path TEXT,
  user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_documents (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('engagement_letter','project_plan','good_example')),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extracted_content TEXT,
  extraction_summary TEXT DEFAULT '{}',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_workstreams (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  expert_panel TEXT DEFAULT '[]',
  thinking_level TEXT,
  timeline_start TEXT,
  timeline_end TEXT,
  execution_status TEXT DEFAULT 'pending' CHECK (execution_status IN (
    'pending','blocked','ready','executing','review','completed'
  )),
  dependencies TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_scope_items (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  workstream_id TEXT REFERENCES engagement_workstreams(id),
  deliverable_ids TEXT DEFAULT '[]',
  methodology TEXT DEFAULT '[]',
  dependencies TEXT DEFAULT '[]',
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed','modified','added','removed')),
  original_text TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_resources (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  workstream_id TEXT REFERENCES engagement_workstreams(id),
  category TEXT NOT NULL CHECK (category IN ('documents','meetings','regulations','data','code','good_example','other')),
  title TEXT NOT NULL,
  file_path TEXT,
  url TEXT,
  extracted_content TEXT,
  extraction_summary TEXT,
  relevance_tags TEXT DEFAULT '[]',
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded','processing','reviewed','not_available','coming_later')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_resource_categories (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  workstream_id TEXT REFERENCES engagement_workstreams(id),
  category TEXT NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available','coming_later','not_available')),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_deliverables (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  format TEXT,
  description TEXT,
  scope_item_ids TEXT DEFAULT '[]',
  quality_standard TEXT,
  delivery_date TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','draft','review','approved','delivered')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_iterations (
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
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','reviewed','approved','superseded')),
  thinking_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_boundaries (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  boundary_type TEXT NOT NULL CHECK (boundary_type IN ('assumption','exclusion','limitation','risk')),
  description TEXT NOT NULL,
  source TEXT,
  original_text TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','resolved','removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_client_intelligence (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_stakeholders (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  organisation TEXT,
  contact_info TEXT,
  sign_off_authority TEXT DEFAULT '[]',
  stakeholder_type TEXT DEFAULT 'client_contact',
  expertise_areas TEXT DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_changelog (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_peer_benchmarks (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  benchmark_type TEXT NOT NULL CHECK(benchmark_type IN ('web_search','internal')),
  source_engagement_id TEXT,
  anonymized_label TEXT NOT NULL,
  domain TEXT,
  scope_similarity TEXT,
  maturity_data TEXT DEFAULT '{}',
  key_findings TEXT DEFAULT '[]',
  search_query TEXT,
  raw_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_quality_gates (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  iteration_id TEXT,
  scope_completeness TEXT DEFAULT '{}',
  blueprint_alignment TEXT DEFAULT '{}',
  cross_consistency TEXT DEFAULT '{}',
  assumptions_section TEXT,
  executive_summary TEXT,
  expert_reviews TEXT DEFAULT '{}',
  overall_score DOUBLE PRECISION,
  release_ready INTEGER DEFAULT 0,
  blockers TEXT DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- GROUP 19: DISCOVERY MODE
-- ============================================================================

CREATE TABLE IF NOT EXISTS discovery_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  tier TEXT NOT NULL CHECK(tier IN ('lite','standard','professional','expert')),
  state TEXT NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed','abandoned')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  output_id TEXT,
  autosave_version INTEGER DEFAULT 0,
  schema_version INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS discovery_outputs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES discovery_sessions(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  title TEXT,
  content_md TEXT,
  module_matches TEXT,
  action_plan TEXT,
  metrics TEXT,
  non_ai_findings TEXT,
  executive_briefing TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  exported_formats TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS discovery_followups (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES discovery_sessions(id) ON DELETE CASCADE,
  scheduled_date DATE,
  type TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','completed','skipped')),
  follow_up_notes TEXT,
  progress_data TEXT,
  modules_tried TEXT,
  user_feedback TEXT
);

-- ============================================================================
-- GROUP 20: QUALITY RATCHET & PATTERN DETECTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS quality_scores (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  session_id TEXT,
  module_id TEXT NOT NULL,
  area_id TEXT,
  content_hash TEXT NOT NULL,
  score_overall DOUBLE PRECISION NOT NULL,
  score_completeness DOUBLE PRECISION,
  score_accuracy DOUBLE PRECISION,
  score_structure DOUBLE PRECISION,
  score_actionability DOUBLE PRECISION,
  score_citations DOUBLE PRECISION,
  word_count INTEGER,
  score_reasoning TEXT DEFAULT NULL,
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  scored_by TEXT DEFAULT 'system',
  model_used TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS quality_baselines (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  module_id TEXT NOT NULL UNIQUE,
  baseline_score DOUBLE PRECISION NOT NULL,
  sample_size INTEGER DEFAULT 1,
  established_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS output_feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  quality_score_id TEXT,
  module_id TEXT NOT NULL,
  area_id TEXT,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detected_patterns (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  pattern_type TEXT NOT NULL CHECK(pattern_type IN ('temporal_correlation','entity_convergence','cascade','trend_divergence','gap')),
  pattern_subtype TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK(severity IN ('critical','warning','info','positive')),
  confidence DOUBLE PRECISION DEFAULT 0.5,
  supporting_data TEXT NOT NULL,
  affected_entities TEXT DEFAULT '[]',
  affected_workflows TEXT DEFAULT '[]',
  affected_areas TEXT DEFAULT '[]',
  first_detected TIMESTAMPTZ DEFAULT NOW(),
  last_detected TIMESTAMPTZ DEFAULT NOW(),
  detection_count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','investigating','resolved','dismissed')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS pattern_detectors_state (
  detector_id TEXT PRIMARY KEY,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  config TEXT,
  enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pattern_scheduler_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER DEFAULT 1,
  cron_expression TEXT NOT NULL DEFAULT '0 */6 * * *',
  detector_types TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pattern_detection_runs (
  id SERIAL PRIMARY KEY,
  run_time TEXT NOT NULL,
  patterns_detected INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success','error')),
  error_message TEXT,
  is_manual INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 21: CODING AREA
-- ============================================================================

CREATE TABLE IF NOT EXISTS coding_projects (
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ANTON Studio Phase 4 (migration 239): PROJECT SCOPE TAG on knowledge_atoms.
-- Added here (after coding_projects exists) because knowledge_atoms is defined
-- earlier in this file, so the FK cannot be declared inline at its CREATE TABLE.
-- ON DELETE SET NULL: deleting a project keeps its learned atoms as general
-- knowledge; they simply lose the project scope tag.
ALTER TABLE knowledge_atoms
  ADD COLUMN IF NOT EXISTS coding_project_id TEXT
    REFERENCES coding_projects(id) ON DELETE SET NULL;
ALTER TABLE knowledge_atoms
  ADD COLUMN IF NOT EXISTS atom_origin TEXT;
CREATE INDEX IF NOT EXISTS idx_knowledge_atoms_coding_project
  ON knowledge_atoms (coding_project_id)
  WHERE coding_project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS coding_releases (
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coding_tasks (
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
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coding_reviews (
  id TEXT PRIMARY KEY,
  coding_project_id TEXT NOT NULL REFERENCES coding_projects(id) ON DELETE CASCADE,
  coding_release_id TEXT,
  coding_task_id TEXT,
  reviewer_persona_id TEXT NOT NULL,
  review_type TEXT NOT NULL CHECK(review_type IN ('architecture','security','compliance','product','technical','goal_alignment','operational','project_management','design','ux','devsecops','business','engineering')),
  -- ANTON Studio core-team panel (migration 236): which gate this expert row belongs to.
  gate TEXT CHECK(gate IN ('start','build','testing','finish')),
  verdict TEXT CHECK(verdict IN ('endorse','flag','dissent')),
  findings TEXT,
  recommendations TEXT,
  severity_summary TEXT DEFAULT '{}',
  is_mandatory INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','overdue','skipped')),
  review_requested_at TIMESTAMPTZ DEFAULT NOW(),
  review_completed_at TIMESTAMPTZ,
  escalation_sent_at TIMESTAMPTZ,
  workflow_execution_id TEXT,
  tokens_consumed TEXT DEFAULT '{"input":0,"output":0,"cost_usd":0}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ANTON Studio core-team panel (migration 236): the PANEL-LEVEL record.
-- panel_verdict + blocking are CODE-COMPUTED (worst-of rollup / mandatory-role
-- dissent) — the LLM never sets them. UNIQUE(project,gate) = the live gate state.
CREATE TABLE IF NOT EXISTS coding_panel_decisions (
  id TEXT PRIMARY KEY,
  coding_project_id TEXT NOT NULL REFERENCES coding_projects(id) ON DELETE CASCADE,
  gate TEXT NOT NULL CHECK(gate IN ('start','build','testing','finish')),
  panel_verdict TEXT NOT NULL CHECK(panel_verdict IN ('endorse','flag','dissent')),
  blocking BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL DEFAULT 'fast' CHECK(mode IN ('fast','balanced','thorough')),
  verdict_json JSONB NOT NULL,
  model TEXT,
  chair_model TEXT,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (coding_project_id, gate)
);

CREATE TABLE IF NOT EXISTS coding_test_runs (
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
  run_at TIMESTAMPTZ DEFAULT NOW(),
  run_by TEXT DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS code_review_sessions (
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coding_tech_debt (
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
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coding_changes (
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
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coding_dependencies (
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 22: APPRENTICE MODEL
-- ============================================================================

CREATE TABLE IF NOT EXISTS apprentice_profiles (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  user_id TEXT NOT NULL DEFAULT 'default',
  module_id TEXT NOT NULL,
  area_id TEXT,
  stage TEXT DEFAULT 'observer' CHECK(stage IN ('observer','guided','supervised','autonomous')),
  sessions_completed INTEGER DEFAULT 0,
  quality_avg DOUBLE PRECISION,
  last_session TIMESTAMPTZ,
  promoted_to_guided TIMESTAMPTZ,
  promoted_to_supervised TIMESTAMPTZ,
  promoted_to_autonomous TIMESTAMPTZ,
  UNIQUE(user_id, module_id)
);

CREATE TABLE IF NOT EXISTS apprentice_observations (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  user_id TEXT NOT NULL DEFAULT 'default',
  module_id TEXT NOT NULL,
  session_id TEXT,
  observation_type TEXT CHECK(observation_type IN ('config_choice','prompt_edit','output_quality','follow_up','export')),
  observation_data TEXT,
  observed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 23: INSTRUCTION BUILDER & ALIGNMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS tool_profiles (
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instruction_builder_projects (
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instruction_files (
  id TEXT PRIMARY KEY,
  instruction_builder_project_id TEXT NOT NULL REFERENCES instruction_builder_projects(id),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('primary','supplementary')),
  target_tool TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  content TEXT NOT NULL,
  content_hash TEXT,
  review_status TEXT DEFAULT 'draft' CHECK(review_status IN ('draft','reviewed','approved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alignment_reviews (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  review_date TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'ingesting' CHECK(status IN ('ingesting','goals-set','analysing','reviewed','steering-generated')),
  project_state_summary TEXT,
  goals_reference TEXT,
  alignment_report TEXT,
  overall_status TEXT CHECK(overall_status IN ('on-track','partially-aligned','off-track')),
  instruction_builder_project_id TEXT,
  target_tool TEXT CHECK(target_tool IN ('claude-code','codex','mistral-code')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alignment_dimensions (
  id TEXT PRIMARY KEY,
  alignment_review_id TEXT NOT NULL REFERENCES alignment_reviews(id),
  dimension_name TEXT NOT NULL CHECK(dimension_name IN ('feature-completeness','architecture','domain-compliance','tech-health','security','goal-drift')),
  status TEXT NOT NULL CHECK(status IN ('green','amber','red')),
  findings TEXT,
  recommendations TEXT,
  reviewer_persona TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS steering_instructions (
  id TEXT PRIMARY KEY,
  alignment_review_id TEXT NOT NULL REFERENCES alignment_reviews(id),
  target_tool TEXT NOT NULL,
  instruction_type TEXT NOT NULL CHECK(instruction_type IN ('correction','continuation','refactoring','plan-update')),
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  review_status TEXT DEFAULT 'draft' CHECK(review_status IN ('draft','reviewed','approved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 24: DATA PARTNERSHIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_connectors (
  id TEXT PRIMARY KEY,
  connector_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT DEFAULT 'mock',
  api_key_set INTEGER DEFAULT 0,
  last_successful_call TEXT,
  total_calls INTEGER DEFAULT 0,
  config TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entity_screens (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  entity_name TEXT NOT NULL,
  org_number TEXT,
  connector TEXT NOT NULL,
  result TEXT NOT NULL,
  risk_score TEXT,
  hit_count INTEGER DEFAULT 0,
  screened_at TIMESTAMPTZ DEFAULT NOW(),
  cached_until TEXT
);

CREATE TABLE IF NOT EXISTS entity_monitoring (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  connector TEXT NOT NULL,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  last_alert TEXT,
  alert_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id TEXT PRIMARY KEY,
  entity_monitoring_id TEXT NOT NULL REFERENCES entity_monitoring(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged INTEGER DEFAULT 0
);

-- ============================================================================
-- GROUP 25: ORCHESTRATOR
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestrator_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  org_id TEXT,
  heartbeat_enabled INTEGER NOT NULL DEFAULT 1,
  heartbeat_interval_minutes INTEGER NOT NULL DEFAULT 30,
  briefing_schedule TEXT NOT NULL DEFAULT 'daily' CHECK(briefing_schedule IN ('manual','daily','weekly')),
  briefing_time TEXT NOT NULL DEFAULT '08:00',
  radar_urgency_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  quality_decline_threshold DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  deadline_alert_days INTEGER NOT NULL DEFAULT 14,
  heartbeat_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  briefing_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  planning_model TEXT NOT NULL DEFAULT 'claude-opus-4-8',
  orchestrator_paused INTEGER NOT NULL DEFAULT 0,
  paused_at TEXT,
  paused_by TEXT,
  fully_disabled INTEGER NOT NULL DEFAULT 0,
  reasoning_transparency_level INTEGER NOT NULL DEFAULT 1,
  demo_state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orchestrator_stage (
  id TEXT PRIMARY KEY DEFAULT 'default',
  org_id TEXT,
  current_stage INTEGER NOT NULL DEFAULT 1 CHECK(current_stage BETWEEN 1 AND 4),
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_briefings INTEGER NOT NULL DEFAULT 0,
  total_proposals INTEGER NOT NULL DEFAULT 0,
  proposals_rated INTEGER NOT NULL DEFAULT 0,
  proposals_good_or_relevant INTEGER NOT NULL DEFAULT 0,
  proposals_irrelevant_or_wrong INTEGER NOT NULL DEFAULT 0,
  plans_approved INTEGER NOT NULL DEFAULT 0,
  plans_modified INTEGER NOT NULL DEFAULT 0,
  plans_rejected INTEGER NOT NULL DEFAULT 0,
  executions_completed INTEGER NOT NULL DEFAULT 0,
  executions_failed INTEGER NOT NULL DEFAULT 0,
  avg_quality_score DOUBLE PRECISION,
  auto_executions INTEGER NOT NULL DEFAULT 0,
  auto_overrides INTEGER NOT NULL DEFAULT 0,
  stage_history TEXT NOT NULL DEFAULT '[]',
  last_progression_check TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orchestrator_heartbeats (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signals_checked INTEGER NOT NULL DEFAULT 0,
  signals_significant INTEGER NOT NULL DEFAULT 0,
  action_taken TEXT NOT NULL DEFAULT 'none' CHECK(action_taken IN ('none','briefing_generated','alert_sent','spend_gate_paused')),
  duration_ms INTEGER,
  error_message TEXT,
  status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok','error'))
);

CREATE TABLE IF NOT EXISTS orchestrator_briefings (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  user_id TEXT NOT NULL DEFAULT 'solo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period TEXT NOT NULL DEFAULT 'daily' CHECK(period IN ('heartbeat','daily','weekly','on_demand')),
  signals_read INTEGER NOT NULL DEFAULT 0,
  proposals_count INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  signals_data TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read','actioned','dismissed'))
);

CREATE TABLE IF NOT EXISTS orchestrator_proposals (
  id TEXT PRIMARY KEY,
  briefing_id TEXT REFERENCES orchestrator_briefings(id) ON DELETE CASCADE,
  org_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signal_source TEXT NOT NULL CHECK(signal_source IN (
    'radar','deadline','quality','pattern','workflow','assignment',
    'compliance','apprentice','knowledge_graph','proactive','task_agent'
  )),
  signal_id TEXT,
  signal_summary TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN (
    'workflow_trigger','workflow_chain','quality_intervention',
    'deadline_action','pattern_suggestion','maintenance'
  )),
  proposed_action TEXT NOT NULL,
  workflow_plan TEXT,
  confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.5 CHECK(confidence_score BETWEEN 0 AND 1),
  urgency_score DOUBLE PRECISION NOT NULL DEFAULT 0.5 CHECK(urgency_score BETWEEN 0 AND 1),
  rationale TEXT NOT NULL,
  estimated_effort TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','modified','rejected','auto_executed','expired')),
  human_rating TEXT CHECK(human_rating IN ('good_catch','relevant','low_priority','irrelevant','wrong')),
  human_feedback TEXT,
  decided_at TEXT,
  decided_by TEXT
);

CREATE TABLE IF NOT EXISTS orchestrator_executions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES orchestrator_proposals(id),
  workflow_run_id TEXT,
  org_id TEXT,
  initiated_by TEXT NOT NULL DEFAULT 'human_approved' CHECK(initiated_by IN ('human_approved','auto_executed')),
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome TEXT CHECK(outcome IN ('success','partial','failed','escalated','cancelled')),
  completed_at TEXT,
  quality_assessment TEXT,
  chain_triggered INTEGER NOT NULL DEFAULT 0,
  chained_from_execution_id TEXT REFERENCES orchestrator_executions(id),
  chained_to_execution_id TEXT REFERENCES orchestrator_executions(id),
  human_satisfaction TEXT CHECK(human_satisfaction IN ('excellent','satisfactory','needs_improvement','unsatisfactory')),
  human_notes TEXT
);

CREATE TABLE IF NOT EXISTS orchestrator_reasoning_trails (
  id TEXT PRIMARY KEY,
  heartbeat_id TEXT,
  briefing_id TEXT,
  proposal_id TEXT,
  execution_id TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'heartbeat' CHECK(trigger_type IN ('heartbeat','on_demand','approval','rejection','auto_execution','chain')),
  transparency_level INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','failed','abandoned')),
  narrative_summary TEXT,
  total_entries INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  workspace_file_path TEXT,
  total_reasoning_tokens INTEGER DEFAULT 0,
  total_reasoning_cost_usd DOUBLE PRECISION DEFAULT 0,
  proposal_ids TEXT DEFAULT '[]',
  execution_ids TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS orchestrator_reasoning_entries (
  id TEXT PRIMARY KEY,
  trail_id TEXT NOT NULL REFERENCES orchestrator_reasoning_trails(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK(entry_type IN (
    'signal_detection','signal_assessment','context_gathering',
    'proposal_reasoning','module_selection','input_configuration',
    'execution_decision','quality_assessment','chain_reasoning',
    'escalation_reasoning','pattern_recognition','pdp_alignment',
    'completion_summary'
  )),
  sequence_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  thinking_content TEXT,
  confidence DOUBLE PRECISION,
  duration_ms INTEGER,
  metadata TEXT,
  evidence TEXT DEFAULT '{}',
  model_used TEXT,
  tokens_used INTEGER,
  cost_usd DOUBLE PRECISION,
  proposal_id TEXT,
  execution_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orchestrator_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  detection_criteria TEXT NOT NULL,
  suggested_action TEXT,
  confidence_threshold DOUBLE PRECISION DEFAULT 0.7,
  auto_execute INTEGER DEFAULT 0,
  executions_count INTEGER DEFAULT 0,
  last_detected_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orchestrator_pattern_detections (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL REFERENCES orchestrator_patterns(id),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  signal_data TEXT,
  proposal_id TEXT,
  auto_executed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orchestrator_meta_learning (
  id TEXT PRIMARY KEY,
  learning_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  signal_context TEXT,
  human_decision TEXT,
  outcome TEXT,
  quality_score DOUBLE PRECISION,
  lesson TEXT,
  applied INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orchestrator_stage_demotions (
  id TEXT PRIMARY KEY,
  from_stage INTEGER NOT NULL,
  to_stage INTEGER NOT NULL,
  reason TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  triggered_by TEXT DEFAULT 'system',
  demoted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orchestrator_workflow_chains (
  id TEXT PRIMARY KEY,
  trigger_execution_id TEXT NOT NULL,
  chained_workflow_id TEXT NOT NULL,
  chain_depth INTEGER DEFAULT 1,
  chain_reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TEXT
);

-- ============================================================================
-- GROUP 26: ANTON SELF-KNOWLEDGE & TASK AGENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS anton_capabilities (
  id TEXT PRIMARY KEY,
  capability_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  area TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  route TEXT,
  module_id TEXT,
  typical_inputs TEXT,
  typical_outputs TEXT,
  effort_estimate TEXT DEFAULT 'medium',
  use_cases TEXT NOT NULL DEFAULT '[]',
  active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anton_approaches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  task_pattern TEXT NOT NULL,
  capability_ids TEXT NOT NULL,
  execution_steps TEXT NOT NULL,
  effort TEXT DEFAULT 'medium',
  outcome TEXT NOT NULL,
  required_inputs TEXT DEFAULT '[]',
  confidence_threshold DOUBLE PRECISION DEFAULT 0.6,
  times_used INTEGER DEFAULT 0,
  times_completed INTEGER DEFAULT 0,
  avg_quality_score DOUBLE PRECISION,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anton_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'intake',
  source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  priority TEXT DEFAULT 'normal',
  conversation TEXT NOT NULL DEFAULT '[]',
  proposals TEXT DEFAULT '[]',
  chosen_approach_id TEXT REFERENCES anton_approaches(id),
  chosen_approach_config TEXT,
  clarifying_questions TEXT DEFAULT '[]',
  clarifying_answers TEXT DEFAULT '[]',
  execution_run_ids TEXT DEFAULT '[]',
  execution_summary TEXT,
  intake_answers TEXT DEFAULT '{}',
  execution_results TEXT DEFAULT '[]',
  current_step INTEGER DEFAULT 0,
  intake_ready INTEGER DEFAULT 0,
  task_files TEXT DEFAULT '[]',
  active_knowledge_packs TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  due_date TEXT,
  completed_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 27: STRATEGIC IMPROVEMENTS (Migration 003)
-- ============================================================================

CREATE TABLE IF NOT EXISTS proactive_insights (
  id TEXT PRIMARY KEY,
  insight_type TEXT NOT NULL CHECK(insight_type IN ('pattern','gap','conflict','opportunity','risk','trend')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK(severity IN ('info','low','medium','high','critical')),
  source_session_ids TEXT DEFAULT '[]',
  source_atom_ids TEXT DEFAULT '[]',
  area_id TEXT,
  module_id TEXT,
  user_id TEXT DEFAULT 'default',
  dismissed INTEGER DEFAULT 0,
  dismissed_at TEXT,
  read INTEGER DEFAULT 0,
  read_at TEXT,
  action_taken TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS org_context (
  id TEXT PRIMARY KEY DEFAULT 'default',
  org_name TEXT,
  org_type TEXT,
  jurisdiction TEXT,
  regulatory_perimeter TEXT DEFAULT '[]',
  risk_appetite TEXT,
  key_systems TEXT DEFAULT '[]',
  key_relationships TEXT DEFAULT '[]',
  current_priorities TEXT DEFAULT '[]',
  regulatory_calendar TEXT DEFAULT '[]',
  preferred_language TEXT DEFAULT 'en',
  custom_context TEXT,
  user_id TEXT DEFAULT 'default',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_context_history (
  id SERIAL PRIMARY KEY,
  org_context_id TEXT NOT NULL REFERENCES org_context(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS continuity_profiles (
  id TEXT PRIMARY KEY,
  profile_name TEXT NOT NULL,
  role TEXT NOT NULL,
  area_ids TEXT DEFAULT '[]',
  expertise_summary TEXT,
  active_projects TEXT DEFAULT '[]',
  key_decisions TEXT DEFAULT '[]',
  critical_knowledge TEXT,
  handover_notes TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','transitioning','archived')),
  user_id TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_triggers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('webhook','git_push','slack_event','teams_event','mcp_event','internal')),
  workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  endpoint_path TEXT NOT NULL UNIQUE,
  auth_config TEXT NOT NULL DEFAULT '{}',
  filter_config TEXT DEFAULT '{}',
  payload_mapping TEXT DEFAULT '{}',
  rate_limit_max INTEGER DEFAULT 60,
  rate_limit_window_seconds INTEGER DEFAULT 60,
  cooldown_seconds INTEGER DEFAULT 300,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','error')),
  user_id TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  trigger_id TEXT NOT NULL REFERENCES webhook_triggers(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK(status IN ('received','validated','filtered_out','rate_limited','deduplicated','triggered','failed')),
  payload TEXT,
  mapped_variables TEXT,
  dedup_signature TEXT,
  workflow_run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
  error_message TEXT,
  processing_ms INTEGER
);

CREATE TABLE IF NOT EXISTS webhook_trigger_metrics (
  id SERIAL PRIMARY KEY,
  trigger_id TEXT NOT NULL REFERENCES webhook_triggers(id) ON DELETE CASCADE,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  events_received INTEGER DEFAULT 0,
  events_triggered INTEGER DEFAULT 0,
  events_filtered INTEGER DEFAULT 0,
  events_rate_limited INTEGER DEFAULT 0,
  events_failed INTEGER DEFAULT 0,
  avg_processing_ms DOUBLE PRECISION DEFAULT 0
);

-- ============================================================================
-- GROUP 28: SCHOOL MODE
-- ============================================================================

CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  curriculum_id TEXT,
  default_model TEXT DEFAULT 'claude-sonnet-4-5-20250929',
  content_filter_tier TEXT DEFAULT 'T2',
  settings TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS school_classes (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  teacher_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  education_tier TEXT NOT NULL,
  curriculum_doc_id TEXT,
  study_plan TEXT DEFAULT '{}',
  assistance_levels TEXT DEFAULT '{"homework":"L1","self_study":"L2","exam_practice":"L3","reference":"L4"}',
  default_teacher_persona TEXT DEFAULT 'alma',
  web_search_enabled INTEGER DEFAULT 1,
  settings TEXT DEFAULT '{}',
  class_code TEXT,
  curriculum_id TEXT DEFAULT 'lgr22',
  default_assistance_level TEXT DEFAULT 'L2',
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_enrollments (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES school_classes(id),
  student_user_id TEXT NOT NULL REFERENCES users(id),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active',
  UNIQUE(class_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS guardian_student_links (
  id TEXT PRIMARY KEY,
  guardian_user_id TEXT NOT NULL REFERENCES users(id),
  student_user_id TEXT NOT NULL REFERENCES users(id),
  relationship TEXT DEFAULT 'guardian',
  permissions TEXT DEFAULT 'view_progress',
  status TEXT DEFAULT 'active',
  linked_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guardian_user_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS student_progress (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT NOT NULL REFERENCES school_classes(id),
  subject_id TEXT NOT NULL,
  current_block TEXT,
  blocks_data TEXT DEFAULT '[]',
  skills_data TEXT DEFAULT '{}',
  blooms_data TEXT DEFAULT '{"knowledge":0,"application":0,"analysis":0,"evaluation":0,"creation":0,"metacognition":0}',
  overall_progress_pct INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_user_id, class_id)
);

CREATE TABLE IF NOT EXISTS assessment_results (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT REFERENCES school_classes(id),
  assessment_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  topic TEXT,
  score_pct INTEGER,
  blooms_levels TEXT DEFAULT '[]',
  details TEXT DEFAULT '{}',
  ai_feedback TEXT,
  duration_seconds INTEGER,
  assistance_level TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS laxhjalp_sessions (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT REFERENCES school_classes(id),
  subject_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  stuck_point TEXT,
  resolution_approach TEXT,
  status TEXT DEFAULT 'stuck',
  phases_completed TEXT DEFAULT '[]',
  duration_seconds INTEGER,
  session_id TEXT REFERENCES sessions(id),
  module_id TEXT,
  resolved INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_growth_profiles (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  stage TEXT DEFAULT 'S1',
  session_count INTEGER DEFAULT 0,
  preferred_explanation_style TEXT,
  learning_speed TEXT DEFAULT '{}',
  error_patterns TEXT DEFAULT '{}',
  motivation_triggers TEXT DEFAULT '{}',
  attention_patterns TEXT DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id TEXT PRIMARY KEY,
  teacher_user_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT REFERENCES school_classes(id),
  title TEXT NOT NULL,
  description TEXT,
  assignment_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  topic TEXT,
  assistance_level TEXT DEFAULT 'L1',
  time_limit_minutes INTEGER,
  retakes_allowed INTEGER DEFAULT 0,
  due_date TIMESTAMPTZ,
  content TEXT NOT NULL DEFAULT '{}',
  rubric TEXT DEFAULT '{}',
  knowledge_sources TEXT DEFAULT '[]',
  anton_bundle_id TEXT,
  questions TEXT DEFAULT '[]',
  total_marks INTEGER DEFAULT 0,
  assistance_level_override TEXT,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES teacher_assignments(id),
  student_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'not_started',
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  score_pct INTEGER,
  ai_grade TEXT DEFAULT '{}',
  teacher_grade TEXT DEFAULT '{}',
  feedback TEXT,
  learning_evidence_log TEXT DEFAULT '{}',
  audit_anton_bundle_id TEXT,
  answers TEXT DEFAULT '{}',
  teacher_feedback TEXT,
  ai_feedback TEXT,
  graded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS curricula (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  curriculum_name TEXT NOT NULL,
  curriculum_authority TEXT,
  source_url TEXT,
  school_structure TEXT DEFAULT '{}',
  grading_system TEXT DEFAULT '{}',
  term_structure TEXT DEFAULT '{}',
  subjects TEXT DEFAULT '{}',
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialisation TEXT NOT NULL,
  teaching_style TEXT,
  personality TEXT,
  tier_adaptations TEXT DEFAULT '{}',
  expertise_depth TEXT,
  cultural_context TEXT,
  prompt_template TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP 29: CREATIVE / LORE LEDGER & ITERATIVE REASONING
-- ============================================================================

CREATE TABLE IF NOT EXISTS lore_ledger_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  project_id TEXT,
  entry_type TEXT NOT NULL DEFAULT 'character',
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  properties TEXT NOT NULL DEFAULT '{}',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revelation_chains (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  message_id TEXT,
  thinking_level TEXT NOT NULL,
  phase_count INTEGER NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  synthesis_quality_score DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revelation_steps (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES revelation_chains(id) ON DELETE CASCADE,
  session_id TEXT,
  phase_index INTEGER NOT NULL,
  phase_name TEXT NOT NULL,
  thinking_content TEXT NOT NULL DEFAULT '',
  output_content TEXT NOT NULL DEFAULT '',
  confidence_score DOUBLE PRECISION,
  revision_needed INTEGER,
  next_action TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- GROUP 30: PATHFINDER SEARCH
-- ============================================================================

CREATE TABLE IF NOT EXISTS pathfinder_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'solo',
  title TEXT NOT NULL DEFAULT 'New Thread',
  pinned INTEGER DEFAULT 0,
  document_ids TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pathfinder_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'solo',
  thread_id TEXT,
  query TEXT NOT NULL,
  depth TEXT NOT NULL DEFAULT 'quick',
  synthesis TEXT,
  thinking TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  model_results TEXT,
  web_sources TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd DOUBLE PRECISION DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  document_ids TEXT,
  enriched_query TEXT,
  active_area_id TEXT,
  active_module_id TEXT,
  context_snapshot TEXT,
  search_mode TEXT DEFAULT 'knowledge',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pathfinder_sources (
  id TEXT PRIMARY KEY,
  search_id TEXT NOT NULL REFERENCES pathfinder_searches(id) ON DELETE CASCADE,
  url TEXT,
  title TEXT,
  snippet TEXT,
  source_type TEXT NOT NULL DEFAULT 'web',
  model_id TEXT,
  relevance_score DOUBLE PRECISION DEFAULT 0,
  quality_score DOUBLE PRECISION DEFAULT 0,
  consensus_score DOUBLE PRECISION DEFAULT 0,
  final_rank INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pathfinder_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'solo',
  thread_id TEXT REFERENCES pathfinder_threads(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER DEFAULT 0,
  mime_type TEXT,
  extracted_text TEXT,
  word_count INTEGER DEFAULT 0,
  token_estimate INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pathfinder_followups (
  id TEXT PRIMARY KEY,
  search_id TEXT NOT NULL REFERENCES pathfinder_searches(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  thinking TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pathfinder_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'solo',
  query TEXT NOT NULL,
  context TEXT,
  dismissed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TEXT
);

-- ============================================================================
-- GROUP 31: MISCELLANEOUS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS versions (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  label TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brand_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('docx','pptx')),
  file_path TEXT NOT NULL,
  file_size INTEGER,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_identity (
  id TEXT PRIMARY KEY DEFAULT 'default',
  profile_data TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_templates (
  id TEXT PRIMARY KEY,
  document_type TEXT NOT NULL,
  name TEXT NOT NULL,
  template_data TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER DEFAULT 0,
  source_examples TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_patterns (
  id TEXT PRIMARY KEY,
  process_type TEXT NOT NULL,
  name TEXT NOT NULL,
  pattern_data TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pattern_learning_log (
  id SERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  patterns_extracted TEXT DEFAULT '{}',
  user_confirmed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fund_identity (
  id TEXT PRIMARY KEY DEFAULT 'default',
  fund_name TEXT,
  fund_type TEXT,
  geography_focus TEXT,
  sector_focus TEXT,
  typical_check_size TEXT,
  investment_style_notes TEXT,
  partner_name TEXT,
  firm_website TEXT,
  currency TEXT DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ic_memo_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  memo_type TEXT NOT NULL,
  template_content TEXT NOT NULL,
  section_order TEXT,
  style_notes TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS presentations (
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skill_packs (
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compaction_events (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  compaction_number INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  trigger_threshold INTEGER NOT NULL,
  input_tokens_at_trigger INTEGER,
  tokens_after_compaction INTEGER,
  tokens_saved INTEGER,
  estimated_cost_saved_usd DOUBLE PRECISION,
  session_type TEXT DEFAULT 'interactive',
  summary_preview TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Sessions & Messages
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_session_role ON messages(session_id, role, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_org ON messages(org_id);
CREATE INDEX IF NOT EXISTS idx_sessions_module ON sessions(module_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_updated ON sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_module ON sessions(user_id, module_id);
CREATE INDEX IF NOT EXISTS idx_sessions_org ON sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(is_archived);

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(is_archived);

-- Reviews
CREATE INDEX IF NOT EXISTS idx_reviews_session ON reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

-- Custom Modules
CREATE INDEX IF NOT EXISTS idx_custom_modules_area ON custom_modules(area);

-- Module Configs
CREATE INDEX IF NOT EXISTS idx_module_configs_user ON module_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_module_configs_archived ON module_configs(is_archived);

-- Skills
CREATE INDEX IF NOT EXISTS idx_skills_user ON skills(user_id);

-- Registered Folders
CREATE INDEX IF NOT EXISTS idx_registered_folders_user ON registered_folders(user_id);

-- Login Attempts & Security
CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mfa_pending_user ON mfa_pending(user_id);

-- Datasets
CREATE INDEX IF NOT EXISTS idx_datasets_session ON datasets(session_id);
CREATE INDEX IF NOT EXISTS idx_datasets_expires ON datasets(expires_at);
CREATE INDEX IF NOT EXISTS idx_datasets_created_by ON datasets(created_by);
CREATE INDEX IF NOT EXISTS idx_datasets_name ON datasets(name);

-- Legal Research
CREATE INDEX IF NOT EXISTS idx_legal_sessions_user ON legal_research_sessions(user_id, updated_at DESC);

-- Gap Assessment
CREATE INDEX IF NOT EXISTS idx_gap_assessments_user ON gap_assessments(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gap_assessments_status ON gap_assessments(status);
CREATE INDEX IF NOT EXISTS idx_gap_findings_assessment ON gap_findings(assessment_id);
CREATE INDEX IF NOT EXISTS idx_gap_findings_framework ON gap_findings(assessment_id, framework);
CREATE INDEX IF NOT EXISTS idx_gap_iterations_assessment ON gap_iterations(assessment_id, iteration_number);

-- Audit Log
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_session ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_module_created ON audit_log(module_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_prompt_version ON audit_log(system_prompt_version_id);

-- Governance
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_prompts_active ON system_prompts(module_id, version);
CREATE INDEX IF NOT EXISTS idx_system_prompts_module ON system_prompts(module_id, deprecated_at);
CREATE INDEX IF NOT EXISTS idx_session_snapshots_session ON session_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_session_snapshots_module ON session_snapshots(module_id, snapshotted_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_snapshots_type ON session_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_session_snapshots_created ON session_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_audit_module ON prompt_audit(module_id, edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_audit_session ON prompt_audit(session_id);
CREATE INDEX IF NOT EXISTS idx_model_allowed_user ON model_allowed(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_policy_module ON compliance_policy(module_id);
CREATE INDEX IF NOT EXISTS idx_session_exports_session ON session_exports(session_id, exported_at DESC);

-- Human Oversight & Post-Market
CREATE INDEX IF NOT EXISTS idx_human_oversight_session ON human_oversight_reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_human_oversight_user ON human_oversight_reviews(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_human_oversight_module ON human_oversight_reviews(module_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmm_user_date ON post_market_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmm_module ON post_market_events(module_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmm_session ON post_market_events(session_id);

-- RAG & Knowledge
CREATE INDEX IF NOT EXISTS idx_chunks_folder ON document_chunks(folder_path);
CREATE INDEX IF NOT EXISTS idx_chunks_folder_doc ON document_chunks(folder_path, document_name);
CREATE INDEX IF NOT EXISTS idx_terms_term ON chunk_terms(term);
CREATE INDEX IF NOT EXISTS idx_chunk_terms_term ON chunk_terms(term);
CREATE INDEX IF NOT EXISTS idx_rag_docs_collection ON rag_documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_rag_docs_status ON rag_documents(index_status);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_collections_name ON knowledge_collections(name);
CREATE INDEX IF NOT EXISTS idx_embeddings_content ON embeddings(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(embedding_model);
CREATE INDEX IF NOT EXISTS idx_embeddings_type ON embeddings(content_type);

-- Knowledge Graph
CREATE INDEX IF NOT EXISTS idx_knowledge_packs_status ON knowledge_packs(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_packs_user ON knowledge_packs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_packs_area ON knowledge_packs(regulatory_area);
CREATE INDEX IF NOT EXISTS idx_knowledge_packs_area_status ON knowledge_packs(regulatory_area, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_packs_effective_date ON knowledge_packs(effective_date);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_type ON entity_nodes(entity_type, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_source ON entity_nodes(source);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_pack ON entity_nodes(pack_id);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_pack_type ON entity_nodes(pack_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_source ON entity_relationships(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_target ON entity_relationships(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_type ON entity_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_pack ON entity_relationships(pack_id);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_pack ON entity_aliases(pack_id);

-- Knowledge Atoms
CREATE INDEX IF NOT EXISTS idx_atoms_category ON knowledge_atoms(category);
CREATE INDEX IF NOT EXISTS idx_atoms_type ON knowledge_atoms(atom_type);
CREATE INDEX IF NOT EXISTS idx_atoms_active ON knowledge_atoms(is_active, created_at);
CREATE INDEX IF NOT EXISTS idx_atoms_workflow ON knowledge_atoms(source_workflow_id);
CREATE INDEX IF NOT EXISTS idx_entity_refs_entity ON knowledge_entity_refs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_refs_atom ON knowledge_entity_refs(atom_id);
CREATE INDEX IF NOT EXISTS idx_atom_rel_from ON atom_relationships(from_atom_id);
CREATE INDEX IF NOT EXISTS idx_atom_rel_to ON atom_relationships(to_atom_id);
CREATE INDEX IF NOT EXISTS idx_atom_rel_type ON atom_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_session ON retrieval_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_atom ON retrieval_feedback(atom_id);

-- Compliance-as-Code
CREATE INDEX IF NOT EXISTS idx_compliance_rules_category ON compliance_rules(category, active);
CREATE INDEX IF NOT EXISTS idx_rule_executions_rule ON rule_executions(rule_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_violations_status ON rule_violations(remediation_status, severity);
CREATE INDEX IF NOT EXISTS idx_rule_violations_rule ON rule_violations(rule_id);

-- Workflows
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_user ON workflow_definitions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_user_id ON workflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_outputs_area ON workflow_outputs(area_id);
CREATE INDEX IF NOT EXISTS idx_outputs_module ON workflow_outputs(module_id);
CREATE INDEX IF NOT EXISTS idx_outputs_workflow ON workflow_outputs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_outputs_created ON workflow_outputs(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_workflow ON checkpoint_decisions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_decisions_override ON checkpoint_decisions(is_override);
CREATE INDEX IF NOT EXISTS idx_decisions_date ON checkpoint_decisions(decided_at);
CREATE INDEX IF NOT EXISTS idx_checkpoint_workflow_step ON checkpoint_decisions(workflow_id, step_index);
CREATE INDEX IF NOT EXISTS idx_checkpoint_decided_at ON checkpoint_decisions(decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkpoint_decided_by ON checkpoint_decisions(decided_by);
CREATE INDEX IF NOT EXISTS idx_cluster_workflow ON decision_clusters(workflow_id);
CREATE INDEX IF NOT EXISTS idx_cluster_updated ON decision_clusters(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_step_assignments_execution ON step_assignments(execution_id);
CREATE INDEX IF NOT EXISTS idx_step_assignments_user ON step_assignments(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_parallel_reviews_execution ON parallel_reviews(execution_id, step_index);
CREATE INDEX IF NOT EXISTS idx_canvas_comments_execution ON canvas_comments(execution_id);

-- User Monthly Usage
CREATE INDEX IF NOT EXISTS idx_user_monthly_user ON user_monthly_usage(user_id, year_month);

-- Deadlines
CREATE INDEX IF NOT EXISTS idx_deadlines_due ON deadlines(due_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_status ON deadlines(status, priority);
CREATE INDEX IF NOT EXISTS idx_deadlines_owner ON deadlines(owner_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_parent ON deadlines(parent_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_project ON deadlines(project_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_kanban ON deadlines(kanban_column, sort_order);
CREATE INDEX IF NOT EXISTS idx_reminder_deadline ON deadline_reminders(deadline_id);
CREATE INDEX IF NOT EXISTS idx_reminder_unsent ON deadline_reminders(sent_at, deadline_id);
CREATE INDEX IF NOT EXISTS idx_comments_deadline ON deadline_comments(deadline_id);

-- Radar
CREATE INDEX IF NOT EXISTS idx_radar_items_source ON radar_items(source_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_items_status ON radar_items(status, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_radar_items_published ON radar_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_items_category ON radar_items(category);
CREATE INDEX IF NOT EXISTS idx_radar_sources_category ON radar_sources(category);
CREATE INDEX IF NOT EXISTS idx_rfs_user ON regulatory_feed_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_rfd_user ON regulatory_feed_digests(user_id, created_at);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);

-- Connections
CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status);
CREATE INDEX IF NOT EXISTS idx_conn_audit_connection ON connection_audit_log(connection_id);
CREATE INDEX IF NOT EXISTS idx_conn_audit_executed ON connection_audit_log(executed_at DESC);

-- Project Files & Collaboration
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_invitations_email ON project_invitations(email);
CREATE INDEX IF NOT EXISTS idx_project_invitations_token ON project_invitations(token);
CREATE INDEX IF NOT EXISTS idx_project_notes_project ON project_notes(project_id, created_at DESC);

-- Engagements
CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagements_client ON engagements(client_name);
CREATE INDEX IF NOT EXISTS idx_engagements_user ON engagements(user_id);
CREATE INDEX IF NOT EXISTS idx_engagements_project ON engagements(project_id);
CREATE INDEX IF NOT EXISTS idx_engagement_docs_eng ON engagement_documents(engagement_id);
CREATE INDEX IF NOT EXISTS idx_engagement_ws_eng ON engagement_workstreams(engagement_id);
CREATE INDEX IF NOT EXISTS idx_engagement_scope_eng ON engagement_scope_items(engagement_id);
CREATE INDEX IF NOT EXISTS idx_engagement_resources_eng ON engagement_resources(engagement_id, category);
CREATE INDEX IF NOT EXISTS idx_engagement_iterations_ws ON engagement_iterations(workstream_id, iteration_number);
CREATE INDEX IF NOT EXISTS idx_engagement_changelog_eng ON engagement_changelog(engagement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_peer_benchmarks_eng ON engagement_peer_benchmarks(engagement_id);
CREATE INDEX IF NOT EXISTS idx_quality_gates_eng ON engagement_quality_gates(engagement_id, created_at DESC);

-- Discovery
CREATE INDEX IF NOT EXISTS idx_discovery_sessions_user ON discovery_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_discovery_sessions_status ON discovery_sessions(status);
CREATE INDEX IF NOT EXISTS idx_discovery_outputs_session ON discovery_outputs(session_id);
CREATE INDEX IF NOT EXISTS idx_discovery_followups_date ON discovery_followups(scheduled_date, status);

-- Quality
CREATE INDEX IF NOT EXISTS idx_quality_scores_module ON quality_scores(module_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_baselines_module ON quality_baselines(module_id);
CREATE INDEX IF NOT EXISTS idx_output_feedback_module ON output_feedback(module_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_output_feedback_session ON output_feedback(session_id);

-- Pattern Detection
CREATE INDEX IF NOT EXISTS idx_detected_patterns_type ON detected_patterns(pattern_type, status, last_detected DESC);
CREATE INDEX IF NOT EXISTS idx_detected_patterns_severity ON detected_patterns(severity, status);
CREATE INDEX IF NOT EXISTS idx_detection_runs_time ON pattern_detection_runs(run_time DESC);
CREATE INDEX IF NOT EXISTS idx_detection_runs_status ON pattern_detection_runs(status);

-- Coding
CREATE INDEX IF NOT EXISTS idx_coding_projects_project ON coding_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_coding_projects_status ON coding_projects(status);
CREATE INDEX IF NOT EXISTS idx_coding_projects_tier ON coding_projects(tier);
CREATE INDEX IF NOT EXISTS idx_coding_releases_project ON coding_releases(coding_project_id, release_number);
CREATE INDEX IF NOT EXISTS idx_coding_releases_status ON coding_releases(status);
CREATE INDEX IF NOT EXISTS idx_coding_tasks_release ON coding_tasks(coding_release_id);
CREATE INDEX IF NOT EXISTS idx_coding_tasks_project ON coding_tasks(coding_project_id);
CREATE INDEX IF NOT EXISTS idx_coding_tasks_status ON coding_tasks(status);
CREATE INDEX IF NOT EXISTS idx_coding_reviews_project ON coding_reviews(coding_project_id);
CREATE INDEX IF NOT EXISTS idx_coding_reviews_release ON coding_reviews(coding_release_id);
CREATE INDEX IF NOT EXISTS idx_coding_reviews_task ON coding_reviews(coding_task_id);
CREATE INDEX IF NOT EXISTS idx_coding_reviews_status ON coding_reviews(status);
CREATE INDEX IF NOT EXISTS idx_coding_test_runs_project ON coding_test_runs(coding_project_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_coding_test_runs_release ON coding_test_runs(coding_release_id);
CREATE INDEX IF NOT EXISTS idx_code_review_sessions_session ON code_review_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_code_review_sessions_source ON code_review_sessions(source_path);
CREATE INDEX IF NOT EXISTS idx_code_review_sessions_prev ON code_review_sessions(previous_session_id);
CREATE INDEX IF NOT EXISTS idx_coding_tech_debt_project ON coding_tech_debt(coding_project_id, status);
CREATE INDEX IF NOT EXISTS idx_coding_tech_debt_severity ON coding_tech_debt(severity, status);
CREATE INDEX IF NOT EXISTS idx_coding_changes_project ON coding_changes(coding_project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coding_changes_status ON coding_changes(status);
CREATE INDEX IF NOT EXISTS idx_coding_deps_review ON coding_dependencies(code_review_session_id);
CREATE INDEX IF NOT EXISTS idx_coding_deps_project ON coding_dependencies(coding_project_id);
CREATE INDEX IF NOT EXISTS idx_coding_deps_vuln ON coding_dependencies(vulnerability_count DESC);

-- Instruction Builder & Alignment
CREATE INDEX IF NOT EXISTS idx_ib_projects_status ON instruction_builder_projects(status);
CREATE INDEX IF NOT EXISTS idx_instruction_files_project ON instruction_files(instruction_builder_project_id);
CREATE INDEX IF NOT EXISTS idx_tool_profiles_tool ON tool_profiles(tool_name);
CREATE INDEX IF NOT EXISTS idx_alignment_reviews_status ON alignment_reviews(status);
CREATE INDEX IF NOT EXISTS idx_alignment_dimensions_review ON alignment_dimensions(alignment_review_id);
CREATE INDEX IF NOT EXISTS idx_steering_instructions_review ON steering_instructions(alignment_review_id);

-- Data Partnerships
CREATE INDEX IF NOT EXISTS idx_entity_screens_connector ON entity_screens(connector);
CREATE INDEX IF NOT EXISTS idx_entity_screens_org_number ON entity_screens(org_number);
CREATE INDEX IF NOT EXISTS idx_entity_screens_cache_lookup ON entity_screens(org_number, connector, cached_until);
CREATE INDEX IF NOT EXISTS idx_entity_screens_screened_at ON entity_screens(screened_at);
CREATE INDEX IF NOT EXISTS idx_entity_monitoring_status ON entity_monitoring(connector, status);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_entity ON monitoring_alerts(entity_monitoring_id);

-- Orchestrator
CREATE INDEX IF NOT EXISTS idx_orch_heartbeats_ran_at ON orchestrator_heartbeats(ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_briefings_created ON orchestrator_briefings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_briefings_status ON orchestrator_briefings(status, user_id);
CREATE INDEX IF NOT EXISTS idx_orch_proposals_briefing ON orchestrator_proposals(briefing_id);
CREATE INDEX IF NOT EXISTS idx_orch_proposals_status ON orchestrator_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_proposals_source ON orchestrator_proposals(signal_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_executions_proposal ON orchestrator_executions(proposal_id);
CREATE INDEX IF NOT EXISTS idx_orch_executions_initiated ON orchestrator_executions(initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_trails_heartbeat ON orchestrator_reasoning_trails(heartbeat_id);
CREATE INDEX IF NOT EXISTS idx_orch_trails_briefing ON orchestrator_reasoning_trails(briefing_id);
CREATE INDEX IF NOT EXISTS idx_orch_trails_proposal ON orchestrator_reasoning_trails(proposal_id);
CREATE INDEX IF NOT EXISTS idx_orch_trails_created ON orchestrator_reasoning_trails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_entries_trail ON orchestrator_reasoning_entries(trail_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_orch_entries_proposal ON orchestrator_reasoning_entries(proposal_id);
CREATE INDEX IF NOT EXISTS idx_orch_entries_execution ON orchestrator_reasoning_entries(execution_id);
CREATE INDEX IF NOT EXISTS idx_orch_entries_type ON orchestrator_reasoning_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_pattern_detections_pattern ON orchestrator_pattern_detections(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_detections_at ON orchestrator_pattern_detections(detected_at);
CREATE INDEX IF NOT EXISTS idx_meta_learning_type ON orchestrator_meta_learning(learning_type);
CREATE INDEX IF NOT EXISTS idx_meta_learning_source ON orchestrator_meta_learning(source_id);
CREATE INDEX IF NOT EXISTS idx_chain_trigger ON orchestrator_workflow_chains(trigger_execution_id);

-- ANTON Task Agent
CREATE INDEX IF NOT EXISTS idx_anton_tasks_user_status ON anton_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_anton_tasks_created ON anton_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anton_approaches_confidence ON anton_approaches(confidence_threshold);
CREATE INDEX IF NOT EXISTS idx_anton_capabilities_area ON anton_capabilities(area);

-- Strategic Improvements
CREATE INDEX IF NOT EXISTS idx_proactive_insights_user ON proactive_insights(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_insights_type ON proactive_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_proactive_insights_severity ON proactive_insights(severity);
CREATE INDEX IF NOT EXISTS idx_proactive_insights_dismissed ON proactive_insights(dismissed);
CREATE INDEX IF NOT EXISTS idx_proactive_insights_active ON proactive_insights(user_id, dismissed, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_context_history_ctx ON org_context_history(org_context_id);
CREATE INDEX IF NOT EXISTS idx_continuity_profiles_user ON continuity_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_continuity_profiles_status ON continuity_profiles(status);
CREATE INDEX IF NOT EXISTS idx_continuity_profiles_user_status ON continuity_profiles(user_id, status);

-- Webhook Triggers
CREATE INDEX IF NOT EXISTS idx_webhook_triggers_workflow ON webhook_triggers(workflow_id);
CREATE INDEX IF NOT EXISTS idx_webhook_triggers_status ON webhook_triggers(status);
CREATE INDEX IF NOT EXISTS idx_webhook_triggers_type ON webhook_triggers(trigger_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_trigger ON webhook_events(trigger_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_dedup ON webhook_events(trigger_id, dedup_signature);
CREATE INDEX IF NOT EXISTS idx_webhook_events_rate_limit ON webhook_events(trigger_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_metrics_trigger ON webhook_trigger_metrics(trigger_id, window_start DESC);

-- School Mode
CREATE INDEX IF NOT EXISTS idx_school_classes_teacher ON school_classes(teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON class_enrollments(student_user_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_user ON student_progress(student_user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_results_user ON assessment_results(student_user_id);
CREATE INDEX IF NOT EXISTS idx_laxhjalp_user ON laxhjalp_sessions(student_user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON teacher_assignments(teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions(student_user_id);

-- Creative & Lore
CREATE INDEX IF NOT EXISTS idx_lore_user ON lore_ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_lore_project ON lore_ledger_entries(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_lore_session ON lore_ledger_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_lore_type ON lore_ledger_entries(user_id, entry_type);
CREATE INDEX IF NOT EXISTS idx_rev_chains_session ON revelation_chains(session_id);
CREATE INDEX IF NOT EXISTS idx_rev_chains_created ON revelation_chains(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rev_steps_chain ON revelation_steps(chain_id, phase_index);
CREATE INDEX IF NOT EXISTS idx_rev_steps_session ON revelation_steps(session_id);

-- Pathfinder
CREATE INDEX IF NOT EXISTS idx_pathfinder_searches_user ON pathfinder_searches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pathfinder_searches_thread ON pathfinder_searches(thread_id);
CREATE INDEX IF NOT EXISTS idx_pathfinder_sources_search ON pathfinder_sources(search_id);
CREATE INDEX IF NOT EXISTS idx_pathfinder_threads_user ON pathfinder_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pathfinder_documents_thread ON pathfinder_documents(thread_id);
CREATE INDEX IF NOT EXISTS idx_pathfinder_followups_search ON pathfinder_followups(search_id);
CREATE INDEX IF NOT EXISTS idx_pathfinder_suggestions_user ON pathfinder_suggestions(user_id, dismissed, expires_at);

-- Versions
CREATE INDEX IF NOT EXISTS idx_versions_entity ON versions(entity_type, entity_id);

-- Misc
CREATE INDEX IF NOT EXISTS idx_presentations_created ON presentations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_templates_type ON document_templates(document_type, is_default);
CREATE INDEX IF NOT EXISTS idx_process_patterns_type ON process_patterns(process_type);
CREATE INDEX IF NOT EXISTS idx_ic_templates_type ON ic_memo_templates(memo_type, is_default);
CREATE INDEX IF NOT EXISTS idx_compaction_events_session ON compaction_events(session_id);
CREATE INDEX IF NOT EXISTS idx_compaction_events_created ON compaction_events(created_at);

-- ============================================================================
-- FTS: tsvector GIN index + trigger (replaces SQLite FTS5 virtual table)
-- ============================================================================

-- GIN index on the tsvector column for fast full-text search
CREATE INDEX IF NOT EXISTS idx_knowledge_atoms_search ON knowledge_atoms USING GIN(search_vector);

-- Trigger function: keeps search_vector in sync with content column
CREATE OR REPLACE FUNCTION knowledge_atoms_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists, then create (PostgreSQL has no CREATE OR REPLACE TRIGGER before v14)
DROP TRIGGER IF EXISTS trg_knowledge_atoms_search_vector ON knowledge_atoms;
CREATE TRIGGER trg_knowledge_atoms_search_vector
  BEFORE INSERT OR UPDATE OF content ON knowledge_atoms
  FOR EACH ROW
  EXECUTE FUNCTION knowledge_atoms_search_vector_update();

-- Partial index for tasks with due dates (matches SQLite filtered index)
CREATE INDEX IF NOT EXISTS idx_anton_tasks_due_date ON anton_tasks(due_date) WHERE due_date IS NOT NULL;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
