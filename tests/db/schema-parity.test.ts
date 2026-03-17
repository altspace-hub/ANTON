import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SCHEMA_PATH = path.resolve('server/db/schema.postgresql.sql');

describe('PostgreSQL schema parity', () => {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');

  it('schema file exists and is non-empty', () => {
    expect(schema.length).toBeGreaterThan(1000);
  });

  it('contains no SQLite-isms', () => {
    // No AUTOINCREMENT (PG uses SERIAL)
    expect(schema).not.toMatch(/\bAUTOINCREMENT\b/i);

    // No datetime('now') — should use NOW()
    expect(schema).not.toMatch(/datetime\s*\(\s*'now'\s*\)/i);

    // No sqlite_master references
    expect(schema).not.toMatch(/sqlite_master/i);

    // No PRAGMA statements
    expect(schema).not.toMatch(/\bPRAGMA\b/i);

    // No randomblob — should use gen_random_bytes
    expect(schema).not.toMatch(/randomblob/i);

    // No FTS5 virtual tables
    expect(schema).not.toMatch(/USING\s+fts5/i);
  });

  it('uses PostgreSQL-specific features', () => {
    // Uses SERIAL for auto-increment
    expect(schema).toMatch(/\bSERIAL\b/i);

    // Uses NOW() for timestamps
    expect(schema).toMatch(/\bNOW\(\)/i);

    // Uses TIMESTAMPTZ
    expect(schema).toMatch(/\bTIMESTAMPTZ\b/i);

    // Uses DOUBLE PRECISION instead of REAL
    expect(schema).toMatch(/\bDOUBLE PRECISION\b/i);

    // Uses gen_random_bytes for random IDs
    expect(schema).toMatch(/gen_random_bytes/i);

    // Uses pgcrypto extension
    expect(schema).toMatch(/CREATE EXTENSION.*pgcrypto/i);

    // Uses tsvector for FTS
    expect(schema).toMatch(/\btsvector\b/i);

    // Uses GIN index
    expect(schema).toMatch(/USING GIN/i);
  });

  describe('table count', () => {
    const tableMatches = schema.match(/CREATE TABLE IF NOT EXISTS/gi) || [];

    it('has at least 151 tables', () => {
      expect(tableMatches.length).toBeGreaterThanOrEqual(151);
    });
  });

  describe('index count', () => {
    const indexMatches = schema.match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/gi) || [];

    it('has at least 260 indexes', () => {
      expect(indexMatches.length).toBeGreaterThanOrEqual(260);
    });
  });

  describe('required tables present', () => {
    const requiredTables = [
      // Core
      'sessions', 'messages', 'users', 'user_sessions', 'user_profiles',
      // Knowledge
      'knowledge_atoms', 'knowledge_collections', 'rag_documents', 'rag_chunks',
      // Orchestrator
      'orchestrator_config', 'orchestrator_briefings', 'orchestrator_proposals',
      'orchestrator_executions', 'orchestrator_reasoning_trails',
      // Pathfinder (new in v0.7.0)
      'pathfinder_searches', 'pathfinder_sources', 'pathfinder_threads',
      'pathfinder_documents', 'pathfinder_followups', 'pathfinder_suggestions',
      // Compaction (new in v0.7.0)
      'compaction_events',
      // School
      'school_classes', 'teacher_assignments', 'assignment_submissions',
      'teacher_personas', 'student_growth_profiles',
      // Engagements
      'engagements', 'engagement_workstreams', 'engagement_deliverables',
      // Compliance
      'compliance_rules', 'rule_executions', 'rule_violations',
      // Schema management
      'schema_migrations',
    ];

    for (const table of requiredTables) {
      it(`includes ${table}`, () => {
        const regex = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i');
        expect(schema).toMatch(regex);
      });
    }
  });

  describe('FTS infrastructure', () => {
    it('has tsvector column on knowledge_atoms', () => {
      expect(schema).toMatch(/search_vector\s+tsvector/i);
    });

    it('has GIN index on search_vector', () => {
      expect(schema).toMatch(/USING GIN\s*\(search_vector\)/i);
    });

    it('has trigger function for search_vector updates', () => {
      expect(schema).toMatch(/knowledge_atoms_search_vector_update/i);
    });

    it('has trigger on knowledge_atoms', () => {
      expect(schema).toMatch(/CREATE TRIGGER.*trg_knowledge_atoms_search_vector/i);
    });
  });
});
