# G.17 — Migration History Audit

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.17

**Migrations scanned:** 157 files in `server/db/migrations-pg/`

## 1. Naming consistency

Convention: `NNN_lower_snake_case.sql`.

✅ All migration filenames follow the convention.

## 2. Sequence gaps + duplicate numbers

✅ No duplicate migration numbers.

ℹ️ **9 sequence gap(s)** between 039 and 204:
```
040
041
042
043
044
045
046
047
048
```

Gaps usually mean migrations were renumbered or removed. Acceptable but worth confirming none represent lost work.

## 3. Dropped columns / tables — still referenced?

**Swap patterns excluded:** `DROP COLUMN x; RENAME COLUMN x_new TO x` and
`ALTER TABLE x RENAME TO x_old; CREATE TABLE x ...` are swaps, not real drops —
the name still exists after the migration. Only **real** drops are flagged.

✅ No real drops with stale references.

- Real clean drops (name gone, no refs): **0**
- Swap drops excluded (name reused in same migration): **18**

## 4. Renamed away — old name still referenced?

Swap patterns also excluded here (e.g. `market_data_raw RENAME TO market_data_raw_old; CREATE TABLE market_data_raw`).

✅ No real renames with stale references.

- Real clean renames (old name gone, no refs): **14**
- Swap renames excluded: **4**

## 5. Type changes — manual review needed

ALTER COLUMN TYPE migrations need explicit cast review (downstream code may assume the old type).

Migrations with type changes (review each):
```
056_markets_pg_optimizations.sql:
  200:  ALTER TABLE market_index_holdings ALTER COLUMN weight TYPE NUMERIC(10,6);
  201:  ALTER TABLE market_index_holdings ALTER COLUMN entry_price TYPE NUMERIC(16,6);
  202:  ALTER TABLE market_index_holdings ALTER COLUMN current_price TYPE NUMERIC(16,6);
  203:  ALTER TABLE market_index_holdings ALTER COLUMN unrealized_pnl TYPE NUMERIC(16,6);
  209:  ALTER TABLE market_index_nav_history ALTER COLUMN nav_value TYPE NUMERIC(16,6);
105_fix_timestamp_columns.sql:
  10:  ALTER COLUMN validated_at TYPE TIMESTAMPTZ
  14:  ALTER COLUMN last_calibrated_at TYPE TIMESTAMPTZ
  19:  ALTER COLUMN deadline TYPE TIMESTAMPTZ
106_fix_remaining_text_timestamps.sql:
  8:  ALTER COLUMN completed_at TYPE TIMESTAMPTZ
  12:  ALTER COLUMN completed_at TYPE TIMESTAMPTZ
  16:  ALTER COLUMN completed_at TYPE TIMESTAMPTZ
  20:  ALTER COLUMN last_evaluated_at TYPE TIMESTAMPTZ
  24:  ALTER COLUMN published_at TYPE TIMESTAMPTZ
```

## 6. NOT NULL added to existing columns — backfill check

Adding NOT NULL to a column that may already have NULL data fails on production. The migration should backfill first.

✅ No SET NOT NULL constraints added.

## 7. Tables created but never queried (dead schema)

Tables defined in migrations but never SELECTed / INSERTed / UPDATEd / DELETEd in code.

⚠️ **MEDIUM:** 125 table(s) created but never queried in services/routes:
```
  agent_audit_log
  agent_conversation_telemetry
  agent_directory_listings
  agent_escalations
  agent_handoffs
  agent_knowledge_attachments
  agent_message_timings
  agent_prompt_overlays
  agent_subscriptions
  beehive_capabilities
  beehive_peers
  beehive_quorum_decisions
  beehive_quorum_requests
  beehive_quorum_responses
  beehive_routing_log
  beehive_signal_aggregates
  beehive_signal_attestations
  beehive_signal_inbox
  civic_authorities
  civic_correspondence
  civic_filing_definitions
  civic_filing_enrolments
  civic_filing_events
  civic_process_authorities
  civic_reference_numbers
  coding_artifact_edges
  coding_artifacts
  coding_dependency_audits
  coding_dependency_vulns
  coding_quality_snapshot_breakdown
  coding_quality_snapshots
  coding_review_findings
  coding_review_rules
  coding_session_events
  coding_sessions
  community_abuse_reports
  community_block_list
  community_channel_posts
  community_channel_subscribers
  community_channels
  community_reputation_hints
  diagnostic_case_cross_references
  fc_dunning_attempts
  fc_invoice_lines
  fc_invoice_register
  fc_revenue_shares
  fc_subscription_plans
  fc_subscriptions
  finance_calculator_runs
  finance_goal_templates
  grow_briefing_distribution
  grow_signal_evidence
  life_category_preferences
  lifecycle_event_project_impacts
  market_atoms_2025q1
  market_atoms_2025q2
  market_atoms_2025q3
  market_atoms_2025q4
  market_atoms_2026q1
  market_atoms_2026q2
  market_atoms_2026q3
  market_atoms_2026q4
  market_atoms_2027q1
  market_atoms_2027q2
  market_atoms_2027q3
  market_atoms_2027q4
  market_atoms_default
  market_category_importance
  market_data_raw_2025q1
  market_data_raw_2025q2
  market_data_raw_2025q3
  market_data_raw_2025q4
  market_data_raw_2026q1
  market_data_raw_2026q2
  market_data_raw_2026q3
  market_data_raw_2026q4
  market_data_raw_2027q1
  market_data_raw_2027q2
  market_data_raw_2027q3
  market_data_raw_2027q4
  market_data_raw_default
  market_index_nav_2025h1
  market_index_nav_2025h2
  market_index_nav_2026h1
  market_index_nav_2026h2
  market_index_nav_2027h1
  market_index_nav_2027h2
  market_index_nav_default
  market_patterns_2025h1
  market_patterns_2025h2
  market_patterns_2026h1
  market_patterns_2026h2
  market_patterns_2027h1
  market_patterns_2027h2
  market_patterns_default
  market_schedule_runs
  news_bias_history
  news_bias_nudges
  pathfinder_action_summary
  pathfinder_mode_calibration
  pathfinder_mode_inferences
  pathfinder_proactive_suggestions
  pathfinder_quality_feedback
  pathfinder_search_feedback
  pathfinder_search_followups
  pathfinder_smart_actions
  pathfinder_thread_snapshots
  portal_category_associations
  procure_contract_renewal_events
  procure_criteria_packs
  procure_negotiation_threads
  procure_negotiation_turns
  procure_objections
  procure_scorecard_snapshots
  procure_supplier_risk_events
  school_assessments
  school_assignments
  school_student_progress
  school_teacher_review_queue
  talent_mobility_analytics
  talent_skill_gaps
  talent_team_cvs
  travel_packing_templates
  version_diffs
  video_variants
```

Some may be queried via raw SQL in adapters (acceptable). Some may be partition tables auto-managed by PG. Some may be future-state placeholders. Verify each.

---

## Summary

| Check | Status |
|---|---|
| Total migrations | 157 |
| Filename convention | ✅ clean |
| Duplicate numbers | ✅ none |
| Real drops with stale refs | ✅ none |
| Real renames with stale refs | ✅ none |
| Unqueried tables | 125 |

**Cadence:** run on every migration, plus quarterly + pre-release (per addendum §G.17).
