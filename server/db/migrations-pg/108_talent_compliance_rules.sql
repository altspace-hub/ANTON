-- Migration 108: Talent Recruitment — EU AI Act + Pay Transparency compliance rules
-- Seeds compliance_rules with recruitment-specific enforcement rules

INSERT INTO compliance_rules (rule_code, title, description, category, severity, regulatory_source, rule_logic, active, auto_remediate)
VALUES
  ('EUAIA-RECRUIT-001',
   'Human oversight required for automated candidate rejection',
   'EU AI Act Art. 14 requires human oversight for high-risk AI systems. Automated rejection of candidates must include a documented human decision.',
   'governance', 'critical', 'EU AI Act 2024/1689 Art. 14',
   '{"type": "lookup", "table": "talent_human_decisions", "condition": "decline_approval_must_exist_for_rejected_candidates"}',
   1, 0),

  ('EUAIA-RECRUIT-002',
   'Bias audit required before shortlist finalization',
   'EU AI Act Art. 9 requires risk management including bias detection. At least one bias audit assessment must exist before shortlisting.',
   'governance', 'high', 'EU AI Act 2024/1689 Art. 9',
   '{"type": "threshold", "table": "talent_assessments", "condition": "bias_auditor_count_must_be_positive_before_shortlist"}',
   1, 0),

  ('EUAIA-RECRUIT-003',
   'Candidate informed of AI-assisted assessment',
   'EU AI Act Art. 13 requires transparency. All assessed candidates must receive an AI disclosure communication.',
   'governance', 'high', 'EU AI Act 2024/1689 Art. 13',
   '{"type": "pattern", "table": "talent_communications", "condition": "ai_disclosure_comm_must_exist_for_assessed_candidates"}',
   1, 0),

  ('EUAIA-RECRUIT-004',
   'AI assessment reasoning must be logged',
   'EU AI Act Art. 12 requires record-keeping. All primary AI assessments must include a reasoning trace.',
   'governance', 'high', 'EU AI Act 2024/1689 Art. 12',
   '{"type": "threshold", "table": "talent_assessments", "condition": "reasoning_must_not_be_null_for_primary_assessments"}',
   1, 0),

  ('EUPT-RECRUIT-001',
   'Salary range must be published in job advertisement',
   'EU Pay Transparency Directive 2023/970 Art. 5 requires salary range disclosure in job postings before interview.',
   'governance', 'high', 'EU Pay Transparency Directive 2023/970 Art. 5',
   '{"type": "threshold", "table": "talent_campaigns", "condition": "salary_range_min_and_max_must_be_set_when_status_beyond_discovery"}',
   1, 0),

  ('EUPT-RECRUIT-002',
   'Salary history must not be requested from candidates',
   'EU Pay Transparency Directive 2023/970 Art. 5(2) prohibits employers from asking about current or previous salary.',
   'governance', 'critical', 'EU Pay Transparency Directive 2023/970 Art. 5(2)',
   '{"type": "pattern", "table": "talent_interview_plans", "condition": "questions_must_not_reference_salary_history"}',
   1, 0)

ON CONFLICT (rule_code) DO NOTHING;
