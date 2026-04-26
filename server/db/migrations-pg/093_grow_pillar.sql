-- Migration 093: Grow Pillar — CRM & Business Development Intelligence
-- Sub-phases: Contacts/Orgs → Pipeline/Opportunities → Intelligence Engine

-- ── Sub-phase 1: Contact & Organisation Management ────────────────────

CREATE TABLE IF NOT EXISTS grow_contacts (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  organisation_id TEXT,
  tags TEXT[] DEFAULT '{}',
  confidence_score NUMERIC(3,2),
  source TEXT,
  notes TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grow_organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT,
  size TEXT CHECK (size IN ('startup', 'small', 'medium', 'large', 'enterprise')),
  website TEXT,
  headquarters TEXT,
  regulatory_context TEXT,
  pain_points TEXT,
  annual_revenue TEXT,
  employee_count INTEGER,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK after both tables exist
ALTER TABLE grow_contacts ADD CONSTRAINT fk_grow_contacts_org
  FOREIGN KEY (organisation_id) REFERENCES grow_organisations(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS grow_relationships (
  id TEXT PRIMARY KEY,
  from_type TEXT NOT NULL CHECK (from_type IN ('contact', 'organisation')),
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL CHECK (to_type IN ('contact', 'organisation')),
  to_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  strength TEXT DEFAULT 'medium' CHECK (strength IN ('weak', 'medium', 'strong')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grow_interactions (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES grow_contacts(id) ON DELETE CASCADE,
  organisation_id TEXT REFERENCES grow_organisations(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('meeting', 'call', 'email', 'event', 'note', 'other')),
  subject TEXT,
  notes TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  follow_up_date TIMESTAMPTZ,
  follow_up_action TEXT,
  interaction_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Sub-phase 2: Pipeline & Opportunities ─────────────────────────────

CREATE TABLE IF NOT EXISTS grow_pipeline_stages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#3498DB',
  is_won BOOLEAN DEFAULT FALSE,
  is_lost BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default pipeline stages
INSERT INTO grow_pipeline_stages (id, name, sort_order, color, is_won, is_lost) VALUES
  ('prospect', 'Prospect', 0, '#3498DB', FALSE, FALSE),
  ('qualified', 'Qualified', 1, '#2DD4A8', FALSE, FALSE),
  ('proposal', 'Proposal', 2, '#F5A623', FALSE, FALSE),
  ('negotiation', 'Negotiation', 3, '#E74C3C', FALSE, FALSE),
  ('won', 'Won', 4, '#27AE60', TRUE, FALSE),
  ('lost', 'Lost', 5, '#E74C3C', FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS grow_opportunities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  contact_id TEXT REFERENCES grow_contacts(id) ON DELETE SET NULL,
  organisation_id TEXT REFERENCES grow_organisations(id) ON DELETE SET NULL,
  stage_id TEXT NOT NULL REFERENCES grow_pipeline_stages(id) DEFAULT 'prospect',
  value NUMERIC(15,2),
  currency TEXT DEFAULT 'USD',
  probability INTEGER DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  next_action TEXT,
  next_action_date TIMESTAMPTZ,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  won_lost_reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grow_activities (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT REFERENCES grow_opportunities(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES grow_contacts(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('follow_up', 'proposal', 'meeting', 'demo', 'negotiation', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Sub-phase 3: Intelligence Engine ──────────────────────────────────

CREATE TABLE IF NOT EXISTS grow_signals (
  id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('news', 'regulatory', 'market', 'relationship', 'engagement', 'custom')),
  title TEXT NOT NULL,
  description TEXT,
  source TEXT,
  source_url TEXT,
  affected_contacts TEXT[] DEFAULT '{}',
  affected_organisations TEXT[] DEFAULT '{}',
  recommended_action TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'actioned', 'dismissed')),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grow_briefings (
  id TEXT PRIMARY KEY,
  briefing_type TEXT NOT NULL CHECK (briefing_type IN ('daily', 'weekly', 'custom')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  signals_included TEXT[] DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_grow_contacts_org ON grow_contacts(organisation_id);
CREATE INDEX IF NOT EXISTS idx_grow_contacts_email ON grow_contacts(email);
CREATE INDEX IF NOT EXISTS idx_grow_relationships_from ON grow_relationships(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_grow_relationships_to ON grow_relationships(to_type, to_id);
CREATE INDEX IF NOT EXISTS idx_grow_interactions_contact ON grow_interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_grow_interactions_date ON grow_interactions(interaction_date);
CREATE INDEX IF NOT EXISTS idx_grow_opportunities_stage ON grow_opportunities(stage_id);
CREATE INDEX IF NOT EXISTS idx_grow_opportunities_org ON grow_opportunities(organisation_id);
CREATE INDEX IF NOT EXISTS idx_grow_opportunities_contact ON grow_opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_grow_activities_opportunity ON grow_activities(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_grow_activities_due ON grow_activities(due_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_grow_signals_type ON grow_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_grow_signals_status ON grow_signals(status) WHERE status IN ('new', 'reviewed');
CREATE INDEX IF NOT EXISTS idx_grow_briefings_type ON grow_briefings(briefing_type);
