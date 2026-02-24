import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'workbench.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema_enhanced.sql');

console.log('🗄️  openEXPERT Enhanced Database Initialization');
console.log('================================================\n');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`✅ Created data directory: ${dataDir}`);
}

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(`✅ Connected to database: ${DB_PATH}`);
console.log(`✅ WAL mode enabled`);
console.log(`✅ Foreign keys enabled\n`);

// Read and execute schema
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

console.log('✅ Database schema created (82 tables)\n');

// Seed data for RBAC (roles and permissions)
console.log('🌱 Seeding RBAC data...');

const roles = [
  { id: 'admin', name: 'Administrator', description: 'Full system access including user management and system configuration', is_system: 1 },
  { id: 'analyst', name: 'Analyst', description: 'Full access to all modules, workflows, and intelligence features', is_system: 1 },
  { id: 'user', name: 'User', description: 'Standard access to modules and personal workspace', is_system: 1 },
];

const insertRole = db.prepare('INSERT OR IGNORE INTO roles (id, name, description, is_system) VALUES (?, ?, ?, ?)');
for (const role of roles) {
  insertRole.run(role.id, role.name, role.description, role.is_system);
}
console.log(`✅ Created ${roles.length} default roles`);

// Permissions matrix
const permissions = [
  // Module permissions
  { id: 'module.execute', resource: 'module', action: 'execute', description: 'Execute AI modules' },
  { id: 'module.create', resource: 'module', action: 'create', description: 'Create custom modules' },
  { id: 'module.update', resource: 'module', action: 'update', description: 'Update custom modules' },
  { id: 'module.delete', resource: 'module', action: 'delete', description: 'Delete custom modules' },

  // Session permissions
  { id: 'session.read', resource: 'session', action: 'read', description: 'View sessions' },
  { id: 'session.create', resource: 'session', action: 'create', description: 'Create new sessions' },
  { id: 'session.update', resource: 'session', action: 'update', description: 'Update sessions' },
  { id: 'session.delete', resource: 'session', action: 'delete', description: 'Delete sessions' },

  // Project permissions
  { id: 'project.read', resource: 'project', action: 'read', description: 'View projects' },
  { id: 'project.create', resource: 'project', action: 'create', description: 'Create projects' },
  { id: 'project.update', resource: 'project', action: 'update', description: 'Update projects' },
  { id: 'project.delete', resource: 'project', action: 'delete', description: 'Delete projects' },

  // Workflow permissions
  { id: 'workflow.read', resource: 'workflow', action: 'read', description: 'View workflows' },
  { id: 'workflow.create', resource: 'workflow', action: 'create', description: 'Create workflows' },
  { id: 'workflow.execute', resource: 'workflow', action: 'execute', description: 'Execute workflows' },
  { id: 'workflow.delete', resource: 'workflow', action: 'delete', description: 'Delete workflows' },

  // Intelligence permissions
  { id: 'intelligence.read', resource: 'intelligence', action: 'read', description: 'View intelligence dashboards' },
  { id: 'intelligence.patterns', resource: 'intelligence', action: 'read', description: 'Access pattern detection' },
  { id: 'intelligence.knowledge_graph', resource: 'intelligence', action: 'read', description: 'Access knowledge graph' },

  // Admin permissions
  { id: 'user.admin', resource: 'user', action: 'admin', description: 'Manage users' },
  { id: 'role.admin', resource: 'role', action: 'admin', description: 'Manage roles and permissions' },
  { id: 'system.admin', resource: 'system', action: 'admin', description: 'System administration' },
  { id: 'audit.read', resource: 'audit', action: 'read', description: 'View audit logs' },
  { id: 'security.admin', resource: 'security', action: 'admin', description: 'Security configuration' },
  { id: 'budget.admin', resource: 'budget', action: 'admin', description: 'Manage budgets and limits' },
];

const insertPermission = db.prepare('INSERT OR IGNORE INTO permissions (id, resource, action, description) VALUES (?, ?, ?, ?)');
for (const perm of permissions) {
  insertPermission.run(perm.id, perm.resource, perm.action, perm.description);
}
console.log(`✅ Created ${permissions.length} permissions`);

// Assign permissions to roles
const rolePermissions = {
  admin: permissions.map(p => p.id), // All permissions
  analyst: [
    'module.execute', 'module.create', 'module.update', 'module.delete',
    'session.read', 'session.create', 'session.update', 'session.delete',
    'project.read', 'project.create', 'project.update', 'project.delete',
    'workflow.read', 'workflow.create', 'workflow.execute', 'workflow.delete',
    'intelligence.read', 'intelligence.patterns', 'intelligence.knowledge_graph',
  ],
  user: [
    'module.execute',
    'session.read', 'session.create', 'session.update', 'session.delete',
    'project.read', 'project.create', 'project.update',
    'workflow.read', 'workflow.execute',
    'intelligence.read',
  ],
};

const insertRolePermission = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
for (const [roleId, permIds] of Object.entries(rolePermissions)) {
  for (const permId of permIds) {
    insertRolePermission.run(roleId, permId);
  }
}
console.log(`✅ Assigned permissions to roles\n`);

// Seed compliance rules (8 initial rules)
console.log('🌱 Seeding compliance rules...');

const complianceRules = [
  {
    id: crypto.randomUUID(),
    rule_name: 'Customer Due Diligence Completeness',
    description: 'All CDD outputs must include: customer identification, risk assessment, and ongoing monitoring plan',
    rule_type: 'completeness',
    severity: 'error',
    regulation_reference: 'AMLR Article 13',
    rule_logic: JSON.stringify({
      check: 'output_contains',
      required_sections: ['customer identification', 'risk assessment', 'monitoring plan'],
    }),
  },
  {
    id: crypto.randomUUID(),
    rule_name: 'Risk Score Threshold',
    description: 'Customer risk scores must be between 0-100 with documented methodology',
    rule_type: 'validation',
    severity: 'error',
    regulation_reference: 'AMLR Article 8',
    rule_logic: JSON.stringify({
      check: 'numeric_range',
      field: 'risk_score',
      min: 0,
      max: 100,
      require_methodology: true,
    }),
  },
  {
    id: crypto.randomUUID(),
    rule_name: 'Transaction Monitoring Rule Documentation',
    description: 'All TM rules must document: rationale, threshold, calibration basis, and review frequency',
    rule_type: 'documentation',
    severity: 'warning',
    regulation_reference: 'EBA Guidelines on Risk Factors',
    rule_logic: JSON.stringify({
      check: 'tm_rule_completeness',
      required_fields: ['rationale', 'threshold', 'calibration', 'review_frequency'],
    }),
  },
  {
    id: crypto.randomUUID(),
    rule_name: 'Sanctions Screening Timeliness',
    description: 'Sanctions screening outputs must include screening timestamp and match against latest lists',
    rule_type: 'timeliness',
    severity: 'critical',
    regulation_reference: 'EU Sanctions Regulations',
    rule_logic: JSON.stringify({
      check: 'timestamp_recency',
      max_age_hours: 24,
      require_list_version: true,
    }),
  },
  {
    id: crypto.randomUUID(),
    rule_name: 'BWRA Geographic Coverage',
    description: 'Business-Wide Risk Assessment must cover all jurisdictions of operation',
    rule_type: 'completeness',
    severity: 'error',
    regulation_reference: 'AMLR Article 8',
    rule_logic: JSON.stringify({
      check: 'geography_coverage',
      require_all_jurisdictions: true,
    }),
  },
  {
    id: crypto.randomUUID(),
    rule_name: 'Policy Version Control',
    description: 'All policy documents must include version number, approval date, and next review date',
    rule_type: 'documentation',
    severity: 'warning',
    regulation_reference: 'General Governance Requirement',
    rule_logic: JSON.stringify({
      check: 'policy_metadata',
      required_fields: ['version', 'approval_date', 'review_date'],
    }),
  },
  {
    id: crypto.randomUUID(),
    rule_name: 'Citation Requirement',
    description: 'Regulatory analysis outputs must cite specific articles, paragraphs, or guidance sections',
    rule_type: 'validation',
    severity: 'warning',
    regulation_reference: 'Quality Standard',
    rule_logic: JSON.stringify({
      check: 'citation_count',
      min_citations: 3,
    }),
  },
  {
    id: crypto.randomUUID(),
    rule_name: 'Dual Approval - High Risk',
    description: 'High-risk customer approvals require dual authorization',
    rule_type: 'approval',
    severity: 'critical',
    regulation_reference: 'AMLR Article 18',
    rule_logic: JSON.stringify({
      check: 'approval_count',
      min_approvals: 2,
      trigger_condition: { risk_level: 'high' },
    }),
  },
];

const insertRule = db.prepare(`
  INSERT INTO compliance_rules (id, rule_name, description, rule_type, severity, regulation_reference, rule_logic)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

for (const rule of complianceRules) {
  insertRule.run(
    rule.id,
    rule.rule_name,
    rule.description,
    rule.rule_type,
    rule.severity,
    rule.regulation_reference,
    rule.rule_logic
  );
}
console.log(`✅ Created ${complianceRules.length} compliance rules\n`);

// Seed detector configs (5 pattern detectors)
console.log('🌱 Seeding pattern detector configs...');

const detectorConfigs = [
  {
    id: 'temporal-correlation',
    detector_type: 'temporal_correlation',
    enabled: 1,
    sensitivity: 0.7,
    threshold: 0.6,
    lookback_days: 30,
    config: JSON.stringify({
      min_occurrences: 3,
      time_window_hours: 72,
      correlation_types: ['same_entity', 'same_topic', 'same_regulation'],
    }),
  },
  {
    id: 'entity-convergence',
    detector_type: 'entity_convergence',
    enabled: 1,
    sensitivity: 0.75,
    threshold: 0.7,
    lookback_days: 60,
    config: JSON.stringify({
      min_entities: 2,
      convergence_threshold: 5,
      entity_types: ['client', 'regulation', 'control'],
    }),
  },
  {
    id: 'cascade-detection',
    detector_type: 'cascade',
    enabled: 1,
    sensitivity: 0.8,
    threshold: 0.75,
    lookback_days: 90,
    config: JSON.stringify({
      min_chain_length: 3,
      max_gap_days: 14,
    }),
  },
  {
    id: 'trend-divergence',
    detector_type: 'trend_divergence',
    enabled: 1,
    sensitivity: 0.65,
    threshold: 0.5,
    lookback_days: 180,
    config: JSON.stringify({
      baseline_period_days: 90,
      divergence_std_dev: 2.0,
    }),
  },
  {
    id: 'gap-detection',
    detector_type: 'gap_detection',
    enabled: 1,
    sensitivity: 0.7,
    threshold: 0.6,
    lookback_days: 365,
    config: JSON.stringify({
      coverage_requirements: ['all_regulations', 'all_geographies', 'all_products'],
      alert_on_missing: true,
    }),
  },
];

const insertDetector = db.prepare(`
  INSERT INTO detector_configs (id, detector_type, enabled, sensitivity, threshold, lookback_days, config)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

for (const detector of detectorConfigs) {
  insertDetector.run(
    detector.id,
    detector.detector_type,
    detector.enabled,
    detector.sensitivity,
    detector.threshold,
    detector.lookback_days,
    detector.config
  );
}
console.log(`✅ Created ${detectorConfigs.length} pattern detector configurations\n`);

// Seed default user profile
console.log('🌱 Seeding default user profile...');

const defaultProfile = {
  id: 'default',
  name: 'openEXPERT User',
  role: 'Compliance Professional',
  preferences: JSON.stringify({
    theme: 'dark',
    language: 'en',
    default_model: 'claude-opus-4-6',
    default_thinking: 'think_hard',
    default_creativity: 'balanced',
  }),
};

db.prepare(`
  INSERT OR REPLACE INTO user_profiles (id, name, role, preferences)
  VALUES (?, ?, ?, ?)
`).run(defaultProfile.id, defaultProfile.name, defaultProfile.role, defaultProfile.preferences);

console.log(`✅ Created default user profile\n`);

// Database statistics
const tables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all();

const indexes = db.prepare(`
  SELECT COUNT(*) as count FROM sqlite_master
  WHERE type='index' AND name NOT LIKE 'sqlite_%'
`).get() as { count: number };

console.log('📊 Database Statistics');
console.log('================================================');
console.log(`Total Tables: ${tables.length}`);
console.log(`Total Indexes: ${indexes.count}`);
console.log(`Database Size: ${(fs.statSync(DB_PATH).size / 1024).toFixed(2)} KB`);
console.log(`Database Path: ${DB_PATH}\n`);

console.log('✅ Database initialization complete!');
console.log('================================================\n');

console.log('📋 Table Groups:');
console.log('  • Core Session & User Management: 13 tables');
console.log('  • Authentication & RBAC: 5 tables');
console.log('  • Security & Audit: 4 tables');
console.log('  • Institutional Memory: 4 tables');
console.log('  • Cross-Workflow Intelligence: 4 tables');
console.log('  • Knowledge Graph: 5 tables');
console.log('  • Pattern Detection: 5 tables');
console.log('  • Quality Ratchet: 4 tables');
console.log('  • Apprentice Model: 4 tables');
console.log('  • Time Intelligence: 4 tables');
console.log('  • Regulatory Radar: 5 tables');
console.log('  • Compliance-as-Code: 4 tables');
console.log('  • Workflow Automation: 4 tables');
console.log('  • Output Versioning: 2 tables');
console.log('  • Collaborative Canvas: 4 tables');
console.log('  • Budget & Cost Management: 3 tables\n');

console.log('🔐 RBAC Setup:');
console.log(`  • Roles: ${roles.length} (admin, analyst, user)`);
console.log(`  • Permissions: ${permissions.length}`);
console.log('  • admin: Full system access (all permissions)');
console.log('  • analyst: Full module + intelligence access');
console.log('  • user: Standard module access\n');

console.log('📜 Compliance Rules: 8 seeded rules');
console.log('🔍 Pattern Detectors: 5 configured detectors\n');

console.log('🚀 Ready to start openEXPERT!');

db.close();
