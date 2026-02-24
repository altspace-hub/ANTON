-- openEXPERT Enhanced Database Schema
-- Complete implementation supporting all 14 transformative features
-- Version 2.0 - February 2026
-- Total: 82 tables across 16 functional groups

-- ============================================================================
-- GROUP 1: CORE SESSION & USER MANAGEMENT (12 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  area_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  user_id TEXT DEFAULT 'default',
  project_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  thinking_content TEXT,
  content_blocks TEXT,
  token_count INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  model_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registered_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  file_count INTEGER DEFAULT 0,
  total_size_bytes INTEGER DEFAULT 0,
  last_indexed TEXT,
  index_status TEXT DEFAULT 'pending' CHECK(index_status IN ('pending', 'indexing', 'complete', 'error')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS module_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER DEFAULT 0,
  user_id TEXT DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(module_id, name, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_id TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'completed')),
  user_id TEXT DEFAULT 'default',
  area_ids TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_sessions (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, session_id)
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
  usage_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  review_mode TEXT NOT NULL CHECK(review_mode IN ('devil', 'systems', 'pragmatist', 'optimist', 'technical')),
  overall_rating TEXT,
  content TEXT NOT NULL,
  feedback_applied INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT,
  email TEXT UNIQUE,
  role TEXT,
  company TEXT,
  industry TEXT,
  expertise TEXT,
  experience_level TEXT,
  communication_preferences TEXT,
  team_context TEXT,
  current_focus TEXT,
  preferences TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  user_id TEXT DEFAULT 'default',
  is_public INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  prompt_instruction TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  author_id TEXT,
  upvotes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS community_modules (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES custom_modules(id) ON DELETE CASCADE,
  author_id TEXT,
  upvotes INTEGER DEFAULT 0,
  downloads INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'flagged')),
  shared_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);

-- ============================================================================
-- GROUP 2: AUTHENTICATION & RBAC (5 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'inactive')),
  email_verified INTEGER DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  resource TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create', 'read', 'update', 'delete', 'execute', 'admin')),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(resource, action)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_by TEXT,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================================
-- GROUP 3: SECURITY & AUDIT (4 tables - extended from original 2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  user_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL,
  failure_reason TEXT,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK(event_type IN ('failed_login', 'unauthorized_access', 'budget_exceeded', 'rate_limit', 'suspicious_activity', 'invalid_input', 'ssrf_attempt', 'xss_attempt', 'sql_injection', 'privilege_escalation')),
  user_id TEXT,
  ip_address TEXT,
  details TEXT,
  severity TEXT DEFAULT 'medium' CHECK(severity IN ('low', 'medium', 'high', 'critical')),
  resolved INTEGER DEFAULT 0,
  resolved_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  old_value TEXT,
  new_value TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  request_size_bytes INTEGER,
  response_size_bytes INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- GROUP 4: INSTITUTIONAL MEMORY (4 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS checkpoint_decisions (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  checkpoint_type TEXT NOT NULL CHECK(checkpoint_type IN ('interpretation', 'judgement', 'approach', 'assumption', 'conclusion')),
  decision_text TEXT NOT NULL,
  context TEXT,
  reasoning TEXT,
  confidence REAL DEFAULT 0.8,
  user_id TEXT DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS decision_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoint_decisions(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('created', 'referenced', 'overridden', 'confirmed')),
  session_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS decision_similarities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoint_decisions(id) ON DELETE CASCADE,
  similar_checkpoint_id TEXT NOT NULL REFERENCES checkpoint_decisions(id) ON DELETE CASCADE,
  similarity_score REAL NOT NULL,
  context_overlap TEXT,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(checkpoint_id != similar_checkpoint_id)
);

CREATE TABLE IF NOT EXISTS memory_feedback (
  id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoint_decisions(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK(feedback_type IN ('helpful', 'irrelevant', 'outdated', 'incorrect')),
  user_id TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- GROUP 5: CROSS-WORKFLOW INTELLIGENCE - KNOWLEDGE ATOMS (4 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_atoms (
  id TEXT PRIMARY KEY,
  atom_type TEXT NOT NULL CHECK(atom_type IN ('fact', 'insight', 'conclusion', 'finding', 'recommendation', 'definition', 'relationship')),
  content TEXT NOT NULL,
  context TEXT,
  confidence REAL DEFAULT 0.8,
  user_id TEXT DEFAULT 'default',
  area_id TEXT,
  module_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS atom_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atom_id TEXT NOT NULL REFERENCES knowledge_atoms(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('llm_output', 'user_input', 'document', 'url', 'manual')),
  source_reference TEXT,
  extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS atom_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atom_id TEXT NOT NULL REFERENCES knowledge_atoms(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  tag_type TEXT DEFAULT 'auto' CHECK(tag_type IN ('auto', 'manual')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(atom_id, tag)
);

CREATE TABLE IF NOT EXISTS atom_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_atom_id TEXT NOT NULL REFERENCES knowledge_atoms(id) ON DELETE CASCADE,
  to_atom_id TEXT NOT NULL REFERENCES knowledge_atoms(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK(relationship_type IN ('supports', 'contradicts', 'extends', 'requires', 'caused_by', 'related_to')),
  strength REAL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(from_atom_id != to_atom_id)
);

-- ============================================================================
-- GROUP 6: KNOWLEDGE GRAPH (5 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS entity_nodes (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('client', 'regulation', 'control', 'risk', 'person', 'system', 'product', 'geography', 'organization', 'process', 'document')),
  name TEXT NOT NULL,
  description TEXT,
  canonical_name TEXT,
  attributes TEXT DEFAULT '{}',
  importance_score REAL DEFAULT 0.5,
  mention_count INTEGER DEFAULT 1,
  user_id TEXT DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_relationships (
  id TEXT PRIMARY KEY,
  from_entity_id TEXT NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  to_entity_id TEXT NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK(relationship_type IN ('mentioned_with', 'precedes', 'caused', 'requires', 'contradicts', 'supports', 'implements', 'reports_to', 'owns', 'part_of')),
  strength REAL DEFAULT 0.5,
  context TEXT,
  co_occurrence_count INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(from_entity_id != to_entity_id)
);

CREATE TABLE IF NOT EXISTS entity_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  mention_text TEXT NOT NULL,
  context_before TEXT,
  context_after TEXT,
  mentioned_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_merge_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merged_entity_id TEXT NOT NULL,
  kept_entity_id TEXT NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  merge_reason TEXT,
  merged_by TEXT,
  merged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_type TEXT DEFAULT 'manual' CHECK(alias_type IN ('manual', 'auto', 'acronym', 'translation')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entity_id, alias)
);

-- ============================================================================
-- GROUP 7: PATTERN DETECTION (5 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS detected_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL CHECK(pattern_type IN ('temporal_correlation', 'entity_convergence', 'cascade', 'trend_divergence', 'gap_detection')),
  title TEXT NOT NULL,
  description TEXT,
  confidence REAL NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK(severity IN ('low', 'medium', 'high', 'critical')),
  evidence TEXT,
  affected_entities TEXT DEFAULT '[]',
  affected_sessions TEXT DEFAULT '[]',
  status TEXT DEFAULT 'new' CHECK(status IN ('new', 'investigating', 'resolved', 'dismissed')),
  user_id TEXT DEFAULT 'default',
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pattern_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_id TEXT NOT NULL REFERENCES detected_patterns(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('detected', 'status_changed', 'commented', 'resolved', 'dismissed')),
  old_value TEXT,
  new_value TEXT,
  user_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS detector_configs (
  id TEXT PRIMARY KEY,
  detector_type TEXT NOT NULL UNIQUE CHECK(detector_type IN ('temporal_correlation', 'entity_convergence', 'cascade', 'trend_divergence', 'gap_detection')),
  enabled INTEGER DEFAULT 1,
  sensitivity REAL DEFAULT 0.7,
  threshold REAL DEFAULT 0.5,
  lookback_days INTEGER DEFAULT 30,
  config TEXT DEFAULT '{}',
  last_run_at TEXT,
  next_run_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pattern_resolutions (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL REFERENCES detected_patterns(id) ON DELETE CASCADE,
  resolution_type TEXT NOT NULL CHECK(resolution_type IN ('false_positive', 'acknowledged', 'action_taken', 'requires_escalation', 'duplicate')),
  resolution_notes TEXT,
  action_items TEXT DEFAULT '[]',
  resolved_by TEXT,
  resolved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pattern_alerts (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL REFERENCES detected_patterns(id) ON DELETE CASCADE,
  user_id TEXT,
  alert_channel TEXT NOT NULL CHECK(alert_channel IN ('in_app', 'email', 'webhook')),
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT,
  dismissed_at TEXT
);

-- ============================================================================
-- GROUP 8: QUALITY RATCHET (4 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS quality_baselines (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  completeness_score REAL DEFAULT 0,
  accuracy_score REAL DEFAULT 0,
  structure_score REAL DEFAULT 0,
  actionability_score REAL DEFAULT 0,
  citations_score REAL DEFAULT 0,
  overall_score REAL DEFAULT 0,
  evidence TEXT,
  user_id TEXT DEFAULT 'default',
  set_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quality_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  completeness_score REAL DEFAULT 0,
  accuracy_score REAL DEFAULT 0,
  structure_score REAL DEFAULT 0,
  actionability_score REAL DEFAULT 0,
  citations_score REAL DEFAULT 0,
  overall_score REAL DEFAULT 0,
  delta_from_baseline REAL,
  notes TEXT,
  scored_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quality_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  baseline_id TEXT REFERENCES quality_baselines(id),
  score_id INTEGER REFERENCES quality_scores(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('baseline_set', 'score_calculated', 'threshold_breached', 'improvement_detected', 'deterioration_detected')),
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quality_alerts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('below_baseline', 'significant_drop', 'persistent_low', 'improvement')),
  severity TEXT DEFAULT 'medium' CHECK(severity IN ('low', 'medium', 'high')),
  message TEXT NOT NULL,
  dismissed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  dismissed_at TEXT
);

-- ============================================================================
-- GROUP 9: APPRENTICE MODEL (4 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS apprentice_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id TEXT NOT NULL,
  user_id TEXT DEFAULT 'default',
  current_stage TEXT NOT NULL CHECK(current_stage IN ('observer', 'guided', 'supervised', 'autonomous')) DEFAULT 'observer',
  sessions_completed INTEGER DEFAULT 0,
  successful_outputs INTEGER DEFAULT 0,
  override_count INTEGER DEFAULT 0,
  avg_confidence REAL DEFAULT 0,
  last_stage_change TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(module_id, user_id)
);

CREATE TABLE IF NOT EXISTS apprentice_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stage_id INTEGER NOT NULL REFERENCES apprentice_stages(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  previous_stage TEXT,
  new_stage TEXT,
  reason TEXT,
  metrics TEXT DEFAULT '{}',
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS apprentice_confidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  stage_id INTEGER REFERENCES apprentice_stages(id),
  confidence_score REAL NOT NULL,
  reasoning TEXT,
  user_feedback TEXT CHECK(user_feedback IN ('accepted', 'rejected', 'modified')),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS override_log (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  stage_id INTEGER REFERENCES apprentice_stages(id),
  original_output TEXT NOT NULL,
  override_output TEXT NOT NULL,
  override_reason TEXT,
  learning_feedback TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- GROUP 10: TIME INTELLIGENCE (4 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deadlines (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  deadline_type TEXT NOT NULL CHECK(deadline_type IN ('regulatory', 'project', 'milestone', 'consultation', 'implementation')),
  due_date TEXT NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'in_progress', 'completed', 'missed', 'cancelled')),
  regulation_reference TEXT,
  area_id TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  assigned_to TEXT,
  user_id TEXT DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS capacity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  user_id TEXT,
  team_id TEXT,
  planned_hours REAL DEFAULT 0,
  actual_hours REAL DEFAULT 0,
  utilization_percent REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_estimates (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  module_id TEXT,
  estimated_hours REAL NOT NULL,
  actual_hours REAL,
  complexity_factors TEXT DEFAULT '{}',
  accuracy_score REAL,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS deadline_alerts (
  id TEXT PRIMARY KEY,
  deadline_id TEXT NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('upcoming', 'overdue', 'critical', 'reminder')),
  alert_date TEXT NOT NULL,
  sent INTEGER DEFAULT 0,
  sent_at TEXT,
  dismissed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- GROUP 11: REGULATORY RADAR (5 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS radar_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  item_type TEXT NOT NULL CHECK(item_type IN ('regulation', 'consultation', 'guideline', 'announcement', 'enforcement', 'case_law')),
  jurisdiction TEXT,
  topic_tags TEXT DEFAULT '[]',
  publication_date TEXT,
  effective_date TEXT,
  summary TEXT,
  full_text TEXT,
  status TEXT DEFAULT 'monitored' CHECK(status IN ('monitored', 'under_review', 'actioned', 'dismissed')),
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
  user_id TEXT DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS radar_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription_type TEXT NOT NULL CHECK(subscription_type IN ('jurisdiction', 'topic', 'source', 'keyword')),
  subscription_value TEXT NOT NULL,
  alert_frequency TEXT DEFAULT 'daily' CHECK(alert_frequency IN ('real_time', 'daily', 'weekly', 'monthly')),
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, subscription_type, subscription_value)
);

CREATE TABLE IF NOT EXISTS regulatory_changes (
  id TEXT PRIMARY KEY,
  radar_item_id TEXT NOT NULL REFERENCES radar_items(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK(change_type IN ('new_requirement', 'amendment', 'repeal', 'deadline_change', 'guidance_update')),
  previous_text TEXT,
  new_text TEXT,
  impact_assessment TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS radar_alerts (
  id TEXT PRIMARY KEY,
  radar_item_id TEXT NOT NULL REFERENCES radar_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  alert_reason TEXT,
  sent INTEGER DEFAULT 0,
  sent_at TEXT,
  read INTEGER DEFAULT 0,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS radar_actions (
  id TEXT PRIMARY KEY,
  radar_item_id TEXT NOT NULL REFERENCES radar_items(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK(action_type IN ('impact_assessed', 'project_created', 'deadline_set', 'dismissed', 'escalated')),
  action_details TEXT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  deadline_id TEXT REFERENCES deadlines(id) ON DELETE SET NULL,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- GROUP 12: COMPLIANCE-AS-CODE (4 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_rules (
  id TEXT PRIMARY KEY,
  rule_name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('validation', 'threshold', 'completeness', 'consistency', 'timeliness', 'approval', 'segregation', 'documentation')),
  severity TEXT DEFAULT 'medium' CHECK(severity IN ('info', 'warning', 'error', 'critical')),
  regulation_reference TEXT,
  rule_logic TEXT NOT NULL,
  parameters TEXT DEFAULT '{}',
  enabled INTEGER DEFAULT 1,
  user_id TEXT DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rule_violations (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  violation_type TEXT NOT NULL,
  details TEXT,
  evidence TEXT,
  severity TEXT DEFAULT 'medium' CHECK(severity IN ('info', 'warning', 'error', 'critical')),
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'acknowledged', 'resolved', 'exempted')),
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS rule_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK(change_type IN ('created', 'updated', 'enabled', 'disabled', 'deleted')),
  previous_version TEXT,
  new_version TEXT,
  changed_by TEXT,
  change_reason TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rule_exemptions (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
  violation_id TEXT REFERENCES rule_violations(id) ON DELETE CASCADE,
  exemption_reason TEXT NOT NULL,
  approved_by TEXT,
  valid_until TEXT,
  conditions TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);

-- ============================================================================
-- GROUP 13: WORKFLOW AUTOMATION (4 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manual', 'scheduled', 'event', 'api')),
  steps TEXT NOT NULL DEFAULT '[]',
  config TEXT DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'draft')),
  user_id TEXT DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  trigger_source TEXT,
  status TEXT DEFAULT 'running' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  current_step INTEGER DEFAULT 0,
  error_message TEXT,
  user_id TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL CHECK(step_type IN ('llm', 'wait', 'approval', 'email', 'webhook', 'extract', 'transform', 'conditional', 'parallel', 'loop', 'export', 'review')),
  step_config TEXT DEFAULT '{}',
  input_data TEXT,
  output_data TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS workflow_schedules (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  schedule_type TEXT NOT NULL CHECK(schedule_type IN ('once', 'daily', 'weekly', 'monthly', 'cron')),
  schedule_config TEXT NOT NULL DEFAULT '{}',
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- GROUP 14: OUTPUT VERSIONING (2 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS output_versions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  is_current INTEGER DEFAULT 0,
  user_id TEXT DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, version_number)
);

CREATE TABLE IF NOT EXISTS version_diffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  from_version_id TEXT NOT NULL REFERENCES output_versions(id) ON DELETE CASCADE,
  to_version_id TEXT NOT NULL REFERENCES output_versions(id) ON DELETE CASCADE,
  diff_text TEXT,
  change_summary TEXT,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- GROUP 15: COLLABORATIVE CANVAS (4 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS canvas_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  canvas_type TEXT DEFAULT 'general' CHECK(canvas_type IN ('general', 'review', 'brainstorm', 'planning')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'completed')),
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS canvas_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canvas_id TEXT NOT NULL REFERENCES canvas_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'reviewer', 'viewer')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT,
  UNIQUE(canvas_id, user_id)
);

CREATE TABLE IF NOT EXISTS canvas_comments (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvas_sessions(id) ON DELETE CASCADE,
  parent_comment_id TEXT REFERENCES canvas_comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  comment_type TEXT DEFAULT 'comment' CHECK(comment_type IN ('comment', 'suggestion', 'approval', 'rejection', 'question')),
  position TEXT,
  resolved INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS canvas_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canvas_id TEXT NOT NULL REFERENCES canvas_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK(change_type IN ('content_added', 'content_removed', 'content_modified', 'comment_added', 'participant_added', 'status_changed')),
  change_details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- GROUP 16: BUDGET & COST MANAGEMENT (3 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS budget_limits (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  team_id TEXT,
  limit_type TEXT NOT NULL CHECK(limit_type IN ('daily', 'weekly', 'monthly', 'total')),
  limit_amount REAL NOT NULL,
  current_spend REAL DEFAULT 0,
  alert_threshold REAL DEFAULT 0.8,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cost_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usage_alerts (
  id TEXT PRIMARY KEY,
  budget_limit_id TEXT NOT NULL REFERENCES budget_limits(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('threshold_reached', 'limit_exceeded', 'unusual_spike')),
  threshold_percent REAL,
  current_spend REAL,
  message TEXT,
  sent INTEGER DEFAULT 0,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Core tables
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_module ON sessions(module_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_area ON sessions(area_id);
CREATE INDEX IF NOT EXISTS idx_custom_modules_area ON custom_modules(area);
CREATE INDEX IF NOT EXISTS idx_custom_modules_user ON custom_modules(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_session ON reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_project_sessions_project ON project_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_sessions_session ON project_sessions(session_id);

-- Authentication & RBAC
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

-- Security & Audit
CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_user ON api_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_requests_endpoint ON api_requests(endpoint, created_at DESC);

-- Institutional Memory
CREATE INDEX IF NOT EXISTS idx_checkpoint_decisions_session ON checkpoint_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_decisions_user ON checkpoint_decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_decisions_type ON checkpoint_decisions(checkpoint_type);
CREATE INDEX IF NOT EXISTS idx_decision_history_checkpoint ON decision_history(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_decision_similarities_checkpoint ON decision_similarities(checkpoint_id);

-- Knowledge Atoms
CREATE INDEX IF NOT EXISTS idx_knowledge_atoms_type ON knowledge_atoms(atom_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_atoms_user ON knowledge_atoms(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_atoms_area ON knowledge_atoms(area_id);
CREATE INDEX IF NOT EXISTS idx_atom_sources_atom ON atom_sources(atom_id);
CREATE INDEX IF NOT EXISTS idx_atom_sources_session ON atom_sources(session_id);
CREATE INDEX IF NOT EXISTS idx_atom_tags_atom ON atom_tags(atom_id);
CREATE INDEX IF NOT EXISTS idx_atom_tags_tag ON atom_tags(tag);

-- Knowledge Graph
CREATE INDEX IF NOT EXISTS idx_entity_nodes_type ON entity_nodes(entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_name ON entity_nodes(name);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_importance ON entity_nodes(importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_from ON entity_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_to ON entity_relationships(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_type ON entity_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity ON entity_mentions(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_session ON entity_mentions(session_id);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_entity ON entity_aliases(entity_id);

-- Pattern Detection
CREATE INDEX IF NOT EXISTS idx_detected_patterns_type ON detected_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_detected_patterns_status ON detected_patterns(status);
CREATE INDEX IF NOT EXISTS idx_detected_patterns_severity ON detected_patterns(severity);
CREATE INDEX IF NOT EXISTS idx_detected_patterns_user ON detected_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_pattern_history_pattern ON pattern_history(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_resolutions_pattern ON pattern_resolutions(pattern_id);

-- Quality Ratchet
CREATE INDEX IF NOT EXISTS idx_quality_baselines_session ON quality_baselines(session_id);
CREATE INDEX IF NOT EXISTS idx_quality_baselines_module ON quality_baselines(module_id);
CREATE INDEX IF NOT EXISTS idx_quality_scores_session ON quality_scores(session_id);
CREATE INDEX IF NOT EXISTS idx_quality_history_session ON quality_history(session_id);

-- Apprentice Model
CREATE INDEX IF NOT EXISTS idx_apprentice_stages_module_user ON apprentice_stages(module_id, user_id);
CREATE INDEX IF NOT EXISTS idx_apprentice_history_stage ON apprentice_history(stage_id);
CREATE INDEX IF NOT EXISTS idx_apprentice_confidence_session ON apprentice_confidence(session_id);

-- Time Intelligence
CREATE INDEX IF NOT EXISTS idx_deadlines_due_date ON deadlines(due_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_status ON deadlines(status);
CREATE INDEX IF NOT EXISTS idx_deadlines_user ON deadlines(user_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_project ON deadlines(project_id);
CREATE INDEX IF NOT EXISTS idx_capacity_log_period ON capacity_log(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_deadline_alerts_deadline ON deadline_alerts(deadline_id);

-- Regulatory Radar
CREATE INDEX IF NOT EXISTS idx_radar_items_type ON radar_items(item_type);
CREATE INDEX IF NOT EXISTS idx_radar_items_status ON radar_items(status);
CREATE INDEX IF NOT EXISTS idx_radar_items_pub_date ON radar_items(publication_date DESC);
CREATE INDEX IF NOT EXISTS idx_radar_subscriptions_user ON radar_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_radar_alerts_user ON radar_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_radar_actions_item ON radar_actions(radar_item_id);

-- Compliance-as-Code
CREATE INDEX IF NOT EXISTS idx_compliance_rules_type ON compliance_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_enabled ON compliance_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_rule_violations_rule ON rule_violations(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_violations_session ON rule_violations(session_id);
CREATE INDEX IF NOT EXISTS idx_rule_violations_status ON rule_violations(status);

-- Workflow Automation
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_user ON workflow_definitions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_run ON workflow_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_schedules_workflow ON workflow_schedules(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_schedules_next_run ON workflow_schedules(next_run_at);

-- Output Versioning
CREATE INDEX IF NOT EXISTS idx_output_versions_session ON output_versions(session_id);
CREATE INDEX IF NOT EXISTS idx_output_versions_current ON output_versions(is_current);
CREATE INDEX IF NOT EXISTS idx_version_diffs_session ON version_diffs(session_id);

-- Collaborative Canvas
CREATE INDEX IF NOT EXISTS idx_canvas_sessions_project ON canvas_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_canvas_sessions_owner ON canvas_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_canvas_participants_canvas ON canvas_participants(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_participants_user ON canvas_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_comments_canvas ON canvas_comments(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_comments_user ON canvas_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_changes_canvas ON canvas_changes(canvas_id);

-- Budget & Cost Management
CREATE INDEX IF NOT EXISTS idx_budget_limits_user ON budget_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_user ON cost_tracking(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_session ON cost_tracking(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_budget ON usage_alerts(budget_limit_id);
