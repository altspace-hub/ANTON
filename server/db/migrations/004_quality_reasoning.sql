-- Add score_reasoning column to store Haiku's strengths/weaknesses/suggestion as JSON
ALTER TABLE quality_scores ADD COLUMN IF NOT EXISTS score_reasoning TEXT DEFAULT NULL;
