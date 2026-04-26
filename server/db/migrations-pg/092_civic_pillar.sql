-- Migration 092: Civic Pillar — Government & Public Institution Navigator
-- Diagnostic flow: Situation → Mapping → Eligibility → Gap → Complete → Track

CREATE TABLE IF NOT EXISTS civic_engagements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal_description TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'general',
  phase TEXT NOT NULL DEFAULT 'situation' CHECK (phase IN ('situation', 'mapping', 'eligibility', 'gap', 'complete', 'track')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  domain TEXT CHECK (domain IN ('permits', 'tax', 'benefits', 'business_registration', 'legal_rights', 'compliance', 'other')),
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('urgent', 'high', 'normal', 'low')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS civic_processes (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES civic_engagements(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  authority TEXT,
  jurisdiction TEXT,
  description TEXT,
  sequence_order INTEGER DEFAULT 0,
  estimated_duration TEXT,
  fees TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'eligible', 'ineligible', 'in_progress', 'completed', 'blocked')),
  prerequisites TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS civic_eligibility_checks (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES civic_engagements(id) ON DELETE CASCADE,
  process_id TEXT NOT NULL REFERENCES civic_processes(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  met BOOLEAN,
  notes TEXT,
  source TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS civic_documents (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES civic_engagements(id) ON DELETE CASCADE,
  process_id TEXT REFERENCES civic_processes(id) ON DELETE SET NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('required', 'generated', 'submitted', 'received', 'template')),
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'submitted', 'approved', 'rejected')),
  file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS civic_submissions (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES civic_engagements(id) ON DELETE CASCADE,
  process_id TEXT NOT NULL REFERENCES civic_processes(id) ON DELETE CASCADE,
  submission_type TEXT NOT NULL,
  submitted_to TEXT,
  submitted_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  reference_number TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'acknowledged', 'processing', 'approved', 'rejected', 'appeal')),
  response_notes TEXT,
  next_action TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS civic_knowledge_packs (
  id TEXT PRIMARY KEY,
  jurisdiction TEXT NOT NULL,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB DEFAULT '{}',
  version TEXT DEFAULT '1.0',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_civic_engagements_status ON civic_engagements(status);
CREATE INDEX IF NOT EXISTS idx_civic_engagements_domain ON civic_engagements(domain);
CREATE INDEX IF NOT EXISTS idx_civic_processes_engagement ON civic_processes(engagement_id);
CREATE INDEX IF NOT EXISTS idx_civic_eligibility_engagement ON civic_eligibility_checks(engagement_id);
CREATE INDEX IF NOT EXISTS idx_civic_eligibility_process ON civic_eligibility_checks(process_id);
CREATE INDEX IF NOT EXISTS idx_civic_documents_engagement ON civic_documents(engagement_id);
CREATE INDEX IF NOT EXISTS idx_civic_submissions_engagement ON civic_submissions(engagement_id);
CREATE INDEX IF NOT EXISTS idx_civic_submissions_deadline ON civic_submissions(deadline) WHERE status NOT IN ('approved', 'rejected');
CREATE INDEX IF NOT EXISTS idx_civic_knowledge_packs_jurisdiction ON civic_knowledge_packs(jurisdiction, domain);
