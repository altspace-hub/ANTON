-- 234_orchestrator_heartbeat_spend_gate.sql
-- The Wave-3 orchestrator spend gate writes orchestrator_heartbeats.action_taken
-- = 'spend_gate_paused' when it pauses LLM briefing generation, but the original
-- CHECK constraint (migration 021 / schema.postgresql.sql) only allowed
-- 'none','briefing_generated','alert_sent' — so every paused heartbeat failed with
-- a 23514 check_violation and the heartbeat row was never recorded.
-- Widen the constraint to include the new value. Idempotent.

ALTER TABLE orchestrator_heartbeats
  DROP CONSTRAINT IF EXISTS orchestrator_heartbeats_action_taken_check;

ALTER TABLE orchestrator_heartbeats
  ADD CONSTRAINT orchestrator_heartbeats_action_taken_check
  CHECK (action_taken IN ('none','briefing_generated','alert_sent','spend_gate_paused'));
