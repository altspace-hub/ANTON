-- Migration 047: Pathfinder enrichment — domain context, quality scoring
-- Adds columns for query enrichment, area/module context, and source quality indicators

-- Add context columns to searches
ALTER TABLE pathfinder_searches ADD COLUMN enriched_query TEXT;
ALTER TABLE pathfinder_searches ADD COLUMN active_area_id TEXT;
ALTER TABLE pathfinder_searches ADD COLUMN active_module_id TEXT;
ALTER TABLE pathfinder_searches ADD COLUMN context_snapshot TEXT;  -- JSON: user profile, knowledge config

-- Add search mode column
ALTER TABLE pathfinder_searches ADD COLUMN search_mode TEXT DEFAULT 'knowledge';

-- Add quality scoring columns to sources
ALTER TABLE pathfinder_sources ADD COLUMN quality_score REAL DEFAULT 0;
ALTER TABLE pathfinder_sources ADD COLUMN consensus_score REAL DEFAULT 0;
ALTER TABLE pathfinder_sources ADD COLUMN final_rank INTEGER DEFAULT 0;
