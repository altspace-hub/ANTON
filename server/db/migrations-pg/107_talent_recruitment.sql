-- Migration 107: Talent Discovery & Recruitment — Full Hiring Pipeline
-- 7 phases: discovery → ad_live → screening → shortlist → interview → offer → closed
-- EU AI Act + Pay Transparency Directive compliance built in

-- ── Campaigns (hiring pipelines) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT,
  hiring_manager TEXT,
  status TEXT NOT NULL DEFAULT 'discovery'
    CHECK (status IN ('discovery', 'ad_live', 'screening', 'shortlist', 'interview', 'offer', 'closed')),
  role_level TEXT CHECK (role_level IN ('entry', 'mid', 'senior', 'lead', 'executive')),
  location TEXT,
  remote_policy TEXT CHECK (remote_policy IN ('onsite', 'hybrid', 'remote', 'flexible')),
  salary_range_min NUMERIC(12,2),
  salary_range_max NUMERIC(12,2),
  salary_currency TEXT DEFAULT 'EUR',
  salary_period TEXT DEFAULT 'annual' CHECK (salary_period IN ('annual', 'monthly', 'hourly')),
  headcount INTEGER DEFAULT 1,
  discovery_document JSONB DEFAULT '{}',
  capability_map JSONB DEFAULT '{}',
  scoring_framework JSONB DEFAULT '{}',
  ad_variants JSONB DEFAULT '[]',
  selected_ad_variant TEXT,
  ad_content TEXT,
  ad_questions JSONB DEFAULT '[]',
  bias_simulation_results JSONB,
  wildcard_threshold NUMERIC(5,2) DEFAULT 55,
  shortlist_threshold NUMERIC(5,2) DEFAULT 75,
  decline_threshold NUMERIC(5,2) DEFAULT 55,
  eu_ai_act_log JSONB DEFAULT '[]',
  created_by TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_campaigns_status ON talent_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_talent_campaigns_created ON talent_campaigns(created_at DESC);

-- ── Team CVs (for capability map analysis) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_team_cvs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  member_name TEXT,
  role_title TEXT,
  cv_text TEXT,
  cv_file_path TEXT,
  skill_profile JSONB DEFAULT '[]',
  experience_years INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_team_cvs_campaign ON talent_team_cvs(campaign_id);

-- ── Candidates ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_candidates (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT DEFAULT 'direct'
    CHECK (source IN ('direct', 'referral', 'agency', 'internal', 'ad_response', 'other')),
  cv_text TEXT,
  cv_file_path TEXT,
  cv_structured JSONB DEFAULT '{}',
  cv_format TEXT DEFAULT 'traditional' CHECK (cv_format IN ('traditional', 'anton_bundle')),
  cv_parse_confidence TEXT CHECK (cv_parse_confidence IN ('structured', 'parsed')),
  question_responses JSONB DEFAULT '[]',
  followup_responses JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'screening', 'assessed', 'followup_sent', 'followup_received',
                      'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  composite_score NUMERIC(5,2),
  is_internal BOOLEAN DEFAULT FALSE,
  is_wildcard BOOLEAN DEFAULT FALSE,
  wildcard_reasoning TEXT,
  aspiration_profile_id TEXT,
  dashboard_token TEXT UNIQUE,
  outcome_message TEXT,
  outcome_sent_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_candidates_campaign ON talent_candidates(campaign_id);
CREATE INDEX IF NOT EXISTS idx_talent_candidates_status ON talent_candidates(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_talent_candidates_internal ON talent_candidates(is_internal) WHERE is_internal = TRUE;
CREATE INDEX IF NOT EXISTS idx_talent_candidates_token ON talent_candidates(dashboard_token) WHERE dashboard_token IS NOT NULL;

-- ── Assessments (per-candidate, per-model) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_assessments (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES talent_candidates(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  assessor_type TEXT NOT NULL CHECK (assessor_type IN ('primary', 'bias_auditor')),
  model_used TEXT,
  dimension_scores JSONB DEFAULT '[]',
  composite_score NUMERIC(5,2),
  composite_percentage NUMERIC(5,2),
  reasoning TEXT,
  thinking_trace TEXT,
  confidence NUMERIC(3,2),
  wild_card_flag BOOLEAN DEFAULT FALSE,
  wild_card_reasoning TEXT,
  wild_card_discovery_link TEXT,
  uncertainties JSONB DEFAULT '[]',
  bias_findings JSONB DEFAULT '[]',
  framework_drift_check JSONB,
  assessment_phase TEXT DEFAULT 'initial'
    CHECK (assessment_phase IN ('initial', 'post_followup', 'final')),
  transparency_level INTEGER DEFAULT 1,
  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_assessments_candidate ON talent_assessments(candidate_id);
CREATE INDEX IF NOT EXISTS idx_talent_assessments_campaign ON talent_assessments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_talent_assessments_type ON talent_assessments(assessor_type);

-- ── Scoring Dimensions (configurable per campaign) ───────────────────────────

CREATE TABLE IF NOT EXISTS talent_scoring_dimensions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  weight NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  category TEXT DEFAULT 'custom'
    CHECK (category IN ('technical', 'experience', 'education', 'team_complementarity',
                        'problem_solving', 'leadership', 'growth_potential', 'cultural', 'custom')),
  knockout_minimum INTEGER,
  evaluation_guide TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_scoring_dims_campaign ON talent_scoring_dimensions(campaign_id);

-- ── Follow-up Questions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_followup_questions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES talent_candidates(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_rationale TEXT,
  maps_to_dimensions JSONB DEFAULT '[]',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  modified_text TEXT,
  status TEXT DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'sent', 'answered', 'skipped')),
  sent_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_followup_candidate ON talent_followup_questions(candidate_id);

-- ── Communications ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_communications (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES talent_candidates(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  comm_type TEXT NOT NULL
    CHECK (comm_type IN ('acknowledgement', 'status_update', 'followup_invite', 'interview_invite',
                         'rejection', 'offer', 'ai_disclosure', 'custom')),
  subject TEXT,
  body TEXT,
  channel TEXT DEFAULT 'portal' CHECK (channel IN ('email', 'portal', 'manual')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'failed')),
  approved_by TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_comms_candidate ON talent_communications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_talent_comms_campaign ON talent_communications(campaign_id);

-- ── Interview Plans ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_interview_plans (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  candidate_id TEXT REFERENCES talent_candidates(id) ON DELETE SET NULL,
  round INTEGER NOT NULL DEFAULT 1,
  interview_type TEXT CHECK (interview_type IN ('phone_screen', 'technical', 'behavioral',
                                                 'case_study', 'panel', 'final')),
  focus_areas JSONB DEFAULT '[]',
  questions JSONB DEFAULT '[]',
  evaluation_criteria JSONB DEFAULT '[]',
  candidate_summary TEXT,
  gap_filling_notes TEXT,
  red_flags_to_probe TEXT,
  notes TEXT,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 60,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'scheduled', 'completed', 'cancelled')),
  outcome TEXT CHECK (outcome IN ('advance', 'hold', 'reject')),
  outcome_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_interview_campaign ON talent_interview_plans(campaign_id);
CREATE INDEX IF NOT EXISTS idx_talent_interview_candidate ON talent_interview_plans(candidate_id);

-- ── Shortlists (versioned) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_shortlists (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Primary Shortlist',
  version INTEGER NOT NULL DEFAULT 1,
  candidate_ids JSONB DEFAULT '[]',
  rationale TEXT,
  comparative_analysis JSONB DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_shortlists_campaign ON talent_shortlists(campaign_id);

-- ── Audit Trail (EU AI Act Art. 12 — mandatory logging) ─────────────────────

CREATE TABLE IF NOT EXISTS talent_audit_trail (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  candidate_id TEXT REFERENCES talent_candidates(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  action_detail TEXT,
  actor TEXT NOT NULL DEFAULT 'system',
  actor_role TEXT,
  ai_model TEXT,
  ai_reasoning_hash TEXT,
  eu_ai_act_category TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_audit_campaign ON talent_audit_trail(campaign_id);
CREATE INDEX IF NOT EXISTS idx_talent_audit_candidate ON talent_audit_trail(candidate_id);
CREATE INDEX IF NOT EXISTS idx_talent_audit_created ON talent_audit_trail(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_talent_audit_action ON talent_audit_trail(action);

-- ── Human Decisions (EU AI Act Art. 14 — human oversight log) ────────────────

CREATE TABLE IF NOT EXISTS talent_human_decisions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  candidate_id TEXT REFERENCES talent_candidates(id) ON DELETE SET NULL,
  context_type TEXT NOT NULL
    CHECK (context_type IN ('ad_approval', 'framework_adjustment', 'followup_approval',
                            'shortlist_override', 'ranking_override', 'decline_approval',
                            'wildcard_decision', 'bias_override')),
  decision TEXT NOT NULL,
  reasoning TEXT,
  previous_state JSONB,
  new_state JSONB,
  decided_by TEXT NOT NULL,
  decided_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_decisions_campaign ON talent_human_decisions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_talent_decisions_type ON talent_human_decisions(context_type);
