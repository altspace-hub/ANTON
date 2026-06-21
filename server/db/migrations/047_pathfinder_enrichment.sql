-- Migration 047: Pathfinder enrichment — domain context, quality scoring
-- Adds columns for query enrichment, area/module context, and source quality indicators

-- Add context columns to searches
ALTER TABLE pathfinder_searches ADD COLUMN IF NOT EXISTS enriched_query TEXT;
ALTER TABLE pathfinder_searches ADD COLUMN IF NOT EXISTS active_area_id TEXT;
ALTER TABLE pathfinder_searches ADD COLUMN IF NOT EXISTS active_module_id TEXT;
ALTER TABLE pathfinder_searches ADD COLUMN IF NOT EXISTS context_snapshot TEXT;  -- JSON: user profile, knowledge config

-- Add search mode column
ALTER TABLE pathfinder_searches ADD COLUMN IF NOT EXISTS search_mode TEXT DEFAULT 'knowledge';

-- Add quality scoring columns to sources
ALTER TABLE pathfinder_sources ADD COLUMN IF NOT EXISTS quality_score REAL DEFAULT 0;
ALTER TABLE pathfinder_sources ADD COLUMN IF NOT EXISTS consensus_score REAL DEFAULT 0;
ALTER TABLE pathfinder_sources ADD COLUMN IF NOT EXISTS final_rank INTEGER DEFAULT 0;
