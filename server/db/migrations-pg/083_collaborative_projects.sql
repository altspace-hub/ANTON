-- Migration 083: Collaborative Project Workspace

-- Project Plans (AI-generated execution plans)
CREATE TABLE IF NOT EXISTS community_project_plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  plan_version INTEGER DEFAULT 1,
  goal TEXT NOT NULL,
  approach TEXT NOT NULL,
  tasks JSONB NOT NULL,
  capability_matches JSONB DEFAULT '{}',
  estimated_total_hours DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','active','completed','cancelled')),
  created_by TEXT NOT NULL DEFAULT 'default',
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_plans_project ON community_project_plans(project_id, plan_version DESC);

-- Project Tasks (linked to delegated tasks)
CREATE TABLE IF NOT EXISTS community_project_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'deliverable',
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_to TEXT DEFAULT 'self',
  assigned_contact_hash TEXT,
  assigned_contact_name TEXT,
  delegated_task_id TEXT,
  depends_on JSONB DEFAULT '[]',
  step_order INTEGER NOT NULL DEFAULT 0,
  required_capabilities JSONB DEFAULT '[]',
  estimated_hours DOUBLE PRECISION,
  result_content TEXT,
  result_artifacts JSONB DEFAULT '[]',
  result_quality_score DOUBLE PRECISION,
  review_notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON community_project_tasks(project_id, step_order);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON community_project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_plan ON community_project_tasks(plan_id);

-- Activity Feed
CREATE TABLE IF NOT EXISTS community_project_activity (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  activity_type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'anton',
  summary TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_activity_project ON community_project_activity(project_id, created_at DESC);

-- Extend projects table for collaborative features
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_goal TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'standard';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS active_plan_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS overall_progress INTEGER DEFAULT 0;
