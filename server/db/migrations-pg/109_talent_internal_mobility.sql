-- Migration 109: Talent Internal Mobility & Aspiration Profiles
-- Default-ON aspiration profiles with privacy-by-design RBAC.
-- Matching engine, skill gaps, and aggregate HR analytics.

-- ── Aspiration Profiles (default-on, opt-out) ────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_aspiration_profiles (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'opted_out', 'content_deleted')),
  onboarding_conversation_completed BOOLEAN DEFAULT FALSE,
  cv_content TEXT,
  current_skills JSONB DEFAULT '[]',
  unused_skills JSONB DEFAULT '[]',
  developing_skills JSONB DEFAULT '[]',
  role_satisfaction JSONB DEFAULT '{}',
  energisers JSONB DEFAULT '[]',
  aspirations JSONB DEFAULT '{}',
  career_direction TEXT CHECK (career_direction IN (
    'specialise', 'generalise', 'management', 'technical_lead', 'domain_change', 'entrepreneurial'
  )),
  dream_project TEXT,
  working_style_preferences JSONB DEFAULT '{}',
  location_preferences JSONB DEFAULT '{}',
  change_readiness TEXT DEFAULT 'curious'
    CHECK (change_readiness IN ('actively_looking', 'open_to_opportunities', 'curious', 'happy_staying')),
  profile_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (profile_visibility IN ('private', 'matched')),
  employee_current_role TEXT,
  current_department TEXT,
  last_conversation_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_aspiration_employee ON talent_aspiration_profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_talent_aspiration_status ON talent_aspiration_profiles(status);
CREATE INDEX IF NOT EXISTS idx_talent_aspiration_dept ON talent_aspiration_profiles(current_department);
CREATE INDEX IF NOT EXISTS idx_talent_aspiration_readiness ON talent_aspiration_profiles(change_readiness);

-- ── Skill Gaps ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_skill_gaps (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES talent_aspiration_profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  current_level INTEGER CHECK (current_level BETWEEN 1 AND 5),
  target_level INTEGER CHECK (target_level BETWEEN 1 AND 5),
  gap_severity TEXT CHECK (gap_severity IN ('minor', 'moderate', 'significant')),
  development_suggestion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_skill_gaps_profile ON talent_skill_gaps(profile_id);

-- ── Internal Matches ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_internal_matches (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES talent_aspiration_profiles(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  match_score NUMERIC(5,2),
  match_dimensions JSONB DEFAULT '{}',
  match_reasoning TEXT,
  considerations TEXT,
  gap_analysis JSONB DEFAULT '{}',
  development_path TEXT,
  status TEXT DEFAULT 'surfaced'
    CHECK (status IN ('surfaced', 'viewed', 'interested', 'withdrawn', 'not_interested', 'saved', 'hired')),
  expressed_interest_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_talent_internal_matches_profile ON talent_internal_matches(profile_id);
CREATE INDEX IF NOT EXISTS idx_talent_internal_matches_campaign ON talent_internal_matches(campaign_id);
CREATE INDEX IF NOT EXISTS idx_talent_internal_matches_status ON talent_internal_matches(status);

-- ── Mobility Analytics (aggregate only, min group size 5) ────────────────────

CREATE TABLE IF NOT EXISTS talent_mobility_analytics (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  metric_type TEXT NOT NULL
    CHECK (metric_type IN ('profile_activity', 'change_readiness', 'skill_demand',
                           'skill_supply', 'aspiration_gap', 'flow_pattern',
                           'internal_fill_rate', 'retention_impact')),
  department TEXT,
  metric_data JSONB NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_mobility_period ON talent_mobility_analytics(period);
CREATE INDEX IF NOT EXISTS idx_talent_mobility_type ON talent_mobility_analytics(metric_type);

-- ── Internal Applications ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_internal_applications (
  id TEXT PRIMARY KEY,
  aspiration_profile_id TEXT NOT NULL REFERENCES talent_aspiration_profiles(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  candidate_id TEXT REFERENCES talent_candidates(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'interest_expressed'
    CHECK (status IN ('interest_expressed', 'in_conversation', 'formal_assessment',
                      'selected', 'not_selected', 'withdrawn')),
  hiring_manager_notes TEXT,
  transition_plan JSONB,
  current_manager_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_internal_app_profile ON talent_internal_applications(aspiration_profile_id);
CREATE INDEX IF NOT EXISTS idx_talent_internal_app_campaign ON talent_internal_applications(campaign_id);
