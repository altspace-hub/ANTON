# ANTON Missions — Database Architecture Decision: PostgreSQL Schema Separation

**Version:** 1.0.0  
**Date:** April 17, 2026  
**Author:** Daniel Bardun / Claude (Strategic Partner)  
**Status:** Architecture Decision Record (ADR)  
**Applies to:** All Missions spec documents (base spec, addendum, and future extensions)

---

## Decision

ANTON Missions requires **PostgreSQL** as its database. There is no fallback to any other database engine. Mission-specific tables live in a dedicated `missions` schema within the same PostgreSQL instance as the platform core. Shared platform tables remain in the `public` schema. Foreign keys work across schemas. A single database connection serves both.

This is the target architecture from day one. PostgreSQL features (schema separation, native partitioning, triggers, JSONB, row-level security) are used fully — not avoided for compatibility with other engines.

---

## Rationale

1. **Logical separation without operational overhead.** One database instance, one connection string, one backup procedure, one migration runner — but clean namespace boundaries between platform core and mission subsystem.

2. **Cross-schema intelligence preserved.** Foreign keys from `missions.knowledge_atoms_missions` to `public.knowledge_atoms` work natively. The 5-layer intelligence funnel, Apprentice Model, and Compliance-as-Code can query across both schemas without synchronisation layers.

3. **Independent lifecycle management.** Mission tables can have different retention policies, vacuum schedules, and index strategies without affecting the core platform tables. `missions.activity_log` can be partitioned by month while `public.sessions` stays simple.

4. **Future physical separation is clean.** If enterprise deployments need to move the missions schema to a separate database (for performance isolation, different storage tiers, or regulatory data residency), the schema boundary makes that migration well-defined. All cross-schema references are known and documented.

5. **Permission scoping.** PostgreSQL roles can be granted schema-level permissions. A future multi-tenant setup could restrict certain roles to `public` only (no mission access) or `missions` only (worker processes that don't need platform config).

---

## Schema Layout

```
┌─ PostgreSQL Database: anton ──────────────────────────────────┐
│                                                                │
│  ┌─ Schema: public ────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  PLATFORM CORE (existing tables)                         │  │
│  │  ├── users, roles, permissions, user_roles               │  │
│  │  ├── sessions, messages, outputs                         │  │
│  │  ├── knowledge_atoms, atom_sources, atom_tags             │  │
│  │  ├── entity_nodes, entity_relationships                  │  │
│  │  ├── apprentice_stages, apprentice_history                │  │
│  │  ├── compliance_rules, rule_violations                    │  │
│  │  ├── quality_scores                                       │  │
│  │  ├── workflows, workflow_schedules                        │  │
│  │  ├── canvas_sessions, canvas_participants                 │  │
│  │  ├── deadlines, deadline_alerts                           │  │
│  │  ├── radar_items, radar_subscriptions                     │  │
│  │  ├── connections, connection_audit_log                     │  │
│  │  ├── audit_log                                            │  │
│  │  └── ... (all existing 82+ tables)                        │  │
│  │                                                          │  │
│  │  SHARED TABLES (used by both core and missions)          │  │
│  │  ├── knowledge_atoms  ← missions write here too          │  │
│  │  ├── entity_nodes     ← missions contribute entities     │  │
│  │  ├── audit_log        ← missions log here too            │  │
│  │  └── compliance_rules ← missions are checked against     │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ Schema: missions ──────────────────────────────────────┐  │
│  │                                                          │  │
│  │  MISSION CORE                                            │  │
│  │  ├── missions                                            │  │
│  │  ├── mission_tasks                                       │  │
│  │  ├── mission_task_dependencies                            │  │
│  │  ├── mission_activity                                    │  │
│  │  ├── mission_decisions                                   │  │
│  │  ├── mission_templates                                   │  │
│  │  ├── mission_type_autonomy                               │  │
│  │  ├── mission_type_autonomy_history                       │  │
│  │  ├── mission_tracks                                      │  │
│  │  ├── mission_scheduled_tasks                              │  │
│  │  ├── mission_event_queue                                  │  │
│  │  └── mission_deliveries                                  │  │
│  │                                                          │  │
│  │  ACTION LAYER                                            │  │
│  │  ├── credential_vault                                    │  │
│  │  ├── credential_access_log                                │  │
│  │  ├── browser_sessions                                    │  │
│  │  ├── browser_actions                                     │  │
│  │  ├── service_packs                                       │  │
│  │  └── service_pack_health                                 │  │
│  │                                                          │  │
│  │  MISSION DATA                                            │  │
│  │  ├── mission_data_tables                                 │  │
│  │  ├── mission_data_rows                                   │  │
│  │  ├── mission_document_intake                              │  │
│  │  ├── web_snapshots                                       │  │
│  │  ├── web_snapshot_diffs                                  │  │
│  │  └── document_templates                                  │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Cross-Schema References

These are the explicit cross-schema foreign key relationships. All other references stay within their own schema.

| missions schema table | Column | References | public schema table |
|---|---|---|---|
| `missions.missions` | `created_by` | → | `public.users(id)` |
| `missions.credential_vault` | `created_by` | → | `public.users(id)` |
| `missions.mission_decisions` | — | writes to → | `public.audit_log` (via service call, not FK) |
| `missions.mission_tasks` | — | invokes → | `public.compliance_rules` (via service call) |
| `missions.mission_tasks` | — | produces → | `public.knowledge_atoms` (atoms with mission_id tag) |
| `missions.mission_tasks` | — | contributes → | `public.entity_nodes` (knowledge graph entities) |
| `missions.missions` | — | checked against → | `public.apprentice_stages` (trust level lookup) |
| `missions.mission_templates` | — | may reference → | `public.workflows` (for template-based task graphs) |

**Direction of dependency:** The `missions` schema depends on `public`, never the reverse. The `public` schema has zero awareness of the `missions` schema. This means the core platform works identically with or without missions — the missions schema is a pure extension.

**Knowledge atoms:** Missions write atoms to `public.knowledge_atoms` (not to a missions-schema copy). This is intentional — atoms from missions and from interactive sessions must be queryable together for the intelligence funnel to work. The `mission_id` and `mission_scope` columns (added to `public.knowledge_atoms`) tag which atoms came from missions.

---

## Implementation for Claude Code

### Schema Creation

```sql
-- Run once during database initialisation (after public schema exists)
CREATE SCHEMA IF NOT EXISTS missions;

-- Grant usage to application role
GRANT USAGE ON SCHEMA missions TO anton_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA missions TO anton_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA missions GRANT ALL ON TABLES TO anton_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA missions GRANT USAGE, SELECT ON SEQUENCES TO anton_app;

-- Set default search path for the application role
ALTER ROLE anton_app SET search_path TO public, missions;
```

**PostgreSQL-native types:** All mission tables should use PostgreSQL-native types where beneficial:
- `JSONB` instead of `TEXT DEFAULT '{}'` for structured JSON columns (better indexing, querying, validation)
- `TIMESTAMPTZ` instead of `DATETIME` (timezone-aware timestamps)
- `BIGSERIAL` for high-growth auto-increment columns (mission_activity, browser_actions)
- `UUID` for primary keys where globally unique IDs are needed (mission IDs that may cross instances via AAP)
- PostgreSQL `ENUM` types for frequently queried status columns

### Table Creation Pattern

All mission tables must be created with the `missions.` prefix:

```sql
-- CORRECT: explicit schema
CREATE TABLE missions.missions (
    id TEXT PRIMARY KEY,
    ...
);

-- WRONG: no schema prefix (would land in public)
CREATE TABLE missions (
    id TEXT PRIMARY KEY,
    ...
);
```

### Cross-Schema Foreign Keys

```sql
-- missions schema table referencing public schema
CREATE TABLE missions.missions (
    id TEXT PRIMARY KEY,
    ...
    created_by TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES public.users(id)
);
```

### Application Code Pattern

Services that operate on mission data use fully qualified schema names or set the search path:

```typescript
// server/services/mission-controller.ts

// Option A: Fully qualified table names (use for cross-schema queries)
const user = await db.query('SELECT * FROM public.users WHERE id = $1', [userId]);
const mission = await db.query('SELECT * FROM missions.missions WHERE id = $1', [missionId]);

// Option B: Set search path per service (preferred for cleaner code within missions)
class MissionController {
  constructor(private db: Pool) {}
  
  private async withMissionSchema<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    await client.query("SET search_path TO missions, public");
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  
  async getMission(id: string): Promise<Mission> {
    return this.withMissionSchema(async (client) => {
      // "missions" resolves to missions.missions
      // "users" resolves to public.users (fallback in search path)
      const result = await client.query(
        'SELECT m.*, u.username as created_by_name FROM missions m JOIN users u ON m.created_by = u.id WHERE m.id = $1',
        [id]
      );
      return result.rows[0];
    });
  }
}
```

**Convention:** Use Option A (fully qualified) for any query that touches both schemas. Use Option B (search path) for services that primarily live in the missions schema. Always be explicit — never assume which schema an unqualified name resolves to in cross-schema contexts.

### Migration Scripts

Mission schema migrations should be separate files from public schema migrations, with a clear naming convention:

```
server/migrations/
  ├── public/
  │   ├── 001_initial_schema.sql
  │   ├── 002_add_knowledge_atoms_mission_columns.sql   ← adds mission_id to public table
  │   └── ...
  └── missions/
      ├── 001_create_missions_schema.sql
      ├── 002_mission_core_tables.sql
      ├── 003_action_layer_tables.sql
      ├── 004_mission_data_tables.sql
      └── ...
```

The migration runner processes `public/` first, then `missions/`, ensuring dependencies are met.

### Database Initialisation Flow

```
1. Connect to PostgreSQL (verify version >= 14 for native partitioning)
2. CREATE DATABASE anton (if not exists)
3. Run public schema migrations (existing platform tables)
4. CREATE SCHEMA IF NOT EXISTS missions
5. Run missions schema migrations (mission core, action layer, mission data)
6. Add cross-schema columns to public tables (knowledge_atoms.mission_id, etc.)
7. Create cross-schema foreign keys
8. Create indexes on both schemas
9. Install pg_partman extension (if available, for automated partition management)
10. Create initial partitions for mission_activity and browser_actions
11. Register built-in mission templates and service packs
```

**PostgreSQL version requirement:** 14+ (for native declarative partitioning with improved performance). Version 16+ recommended for improved JSONB performance used heavily in mission config storage.

---

## Retention & Growth Management

### Table Growth Estimates

| Table | Growth Pattern | Estimated Rows/Month (active use) | Retention Policy |
|---|---|---|---|
| `missions.missions` | Slow (one per mission) | 5-20 | Permanent |
| `missions.mission_tasks` | Moderate (10-50 per mission) | 50-1,000 | Permanent |
| `missions.mission_activity` | Fast (10-100 per task) | 5,000-50,000 | **90 days active, then archive** |
| `missions.mission_decisions` | Moderate (1-5 per task) | 50-500 | Permanent (audit requirement) |
| `missions.browser_actions` | Fast (5-50 per browser session) | 1,000-20,000 | **30 days, then summary only** |
| `missions.web_snapshots` | Moderate (1 per monitored URL per check) | 200-2,000 | **Text: 180 days. Screenshots: 30 days** |
| `missions.mission_data_rows` | Variable (depends on use case) | 100-50,000 | Mission lifetime (deleted with mission) |
| `missions.mission_event_queue` | Fast (depends on inbound volume) | 500-10,000 | **7 days after processing** |
| `missions.credential_access_log` | Moderate | 100-1,000 | **1 year (compliance)** |

### Partitioning Strategy

For the highest-growth tables, use PostgreSQL native partitioning:

```sql
-- mission_activity: partition by month
CREATE TABLE missions.mission_activity (
    id BIGSERIAL,
    mission_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    activity_type TEXT NOT NULL,
    description TEXT,
    details JSONB DEFAULT '{}',
    tokens_consumed INTEGER DEFAULT 0,
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create partitions (automated via cron or pg_partman extension)
CREATE TABLE missions.mission_activity_2026_04 PARTITION OF missions.mission_activity
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE missions.mission_activity_2026_05 PARTITION OF missions.mission_activity
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- browser_actions: same pattern
CREATE TABLE missions.browser_actions (
    id BIGSERIAL,
    session_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    action_type TEXT NOT NULL,
    ...
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);
```

**Partition management:** Use `pg_partman` extension (if available) or a scheduled task that creates next month's partition and drops/archives partitions older than the retention period.

### Row Limits on Structured Storage

```sql
-- Enforce max rows per mission data table
CREATE OR REPLACE FUNCTION missions.check_data_row_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
    max_rows INTEGER := 10000;  -- default limit
BEGIN
    SELECT COUNT(*) INTO current_count 
    FROM missions.mission_data_rows 
    WHERE table_id = NEW.table_id;
    
    IF current_count >= max_rows THEN
        RAISE EXCEPTION 'Mission data table row limit exceeded (% rows). Increase limit or archive old data.', max_rows;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_data_row_limit
    BEFORE INSERT ON missions.mission_data_rows
    FOR EACH ROW EXECUTE FUNCTION missions.check_data_row_limit();
```

### Automated Cleanup Service

```typescript
// server/services/mission-cleanup.ts
// Runs daily via CRON

class MissionCleanupService {
  async runDailyCleanup(): Promise<CleanupReport> {
    const report = new CleanupReport();
    
    // 1. Archive old activity logs (>90 days)
    report.activityArchived = await this.archiveOldActivity(90);
    
    // 2. Purge processed events (>7 days)
    report.eventsPurged = await this.purgeProcessedEvents(7);
    
    // 3. Delete old browser screenshots (>30 days, keep action log text)
    report.screenshotsDeleted = await this.cleanupScreenshots(30);
    
    // 4. Summarise and purge old web snapshots (>180 days text, >30 days screenshots)
    report.snapshotsPurged = await this.cleanupSnapshots({ text: 180, screenshots: 30 });
    
    // 5. Vacuum tables after bulk deletions
    await this.vacuumMissionsSchema();
    
    return report;
  }
}
```

---

## Filesystem Layout (Non-Database Storage)

Some mission data belongs on the filesystem, not in the database:

```
data/
  ├── missions/
  │   ├── screenshots/          ← browser action screenshots
  │   │   └── {mission_id}/
  │   │       └── {task_id}/
  │   │           ├── {action_id}_before.png
  │   │           └── {action_id}_after.png
  │   ├── snapshots/            ← web monitor screenshots
  │   │   └── {mission_id}/
  │   │       └── {url_hash}_{timestamp}.png
  │   ├── documents/            ← intake pipeline downloaded files
  │   │   └── {mission_id}/
  │   │       └── {intake_id}_{filename}
  │   ├── deliverables/         ← generated output files (DOCX, XLSX, PPTX, PDF)
  │   │   └── {mission_id}/
  │   │       └── {task_id}_{filename}
  │   └── templates/            ← document assembly templates
  │       ├── regulatory/
  │       ├── consulting/
  │       └── custom/
```

**Cleanup:** The `MissionCleanupService` handles filesystem cleanup alongside database cleanup. Screenshot retention matches the database retention policy.

---

## Summary of Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database engine | PostgreSQL only | Full feature utilisation — schemas, partitioning, triggers, JSONB, row-level security. No dual-engine abstraction overhead. |
| Database instance | Single instance | Cross-intelligence value, operational simplicity |
| Schema separation | Yes — `missions` schema from day one | Clean namespace, future physical separation path, permission scoping |
| Knowledge atoms | Stay in `public` schema | Cross-session intelligence must work seamlessly |
| Cross-schema pattern | Foreign keys + explicit qualified names | Type-safe, auditable, migrateable |
| High-growth tables | PostgreSQL partitioning by month | Performance at scale, clean retention management |
| Structured storage limits | 10,000 rows per table (configurable) | Prevent runaway data accumulation |
| Screenshots/files | Filesystem, not database | Binary blobs don't belong in PostgreSQL |
| Retention | Table-specific policies, automated daily cleanup | Growth management without manual intervention |

---

**This ADR supersedes any conflicting table creation patterns in the base spec and addendum. All `CREATE TABLE` statements in those documents should be prefixed with `missions.` when implemented.**

---

**END OF ARCHITECTURE DECISION RECORD**
