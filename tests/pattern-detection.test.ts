/**
 * Pattern Detection Engine Tests
 *
 * Tests for Layer 4: Pattern Detection algorithms
 */

import Database from 'better-sqlite3';
import { createPatternDetection } from '../server/services/pattern-detection.js';

describe('Pattern Detection Engine', () => {
  let db: Database.Database;
  let patternDetection: ReturnType<typeof createPatternDetection>;

  beforeAll(() => {
    // Create in-memory test database
    db = new Database(':memory:');

    // Create required tables
    db.exec(`
      CREATE TABLE knowledge_atoms (
        id TEXT PRIMARY KEY,
        source_output_id TEXT,
        source_workflow_id TEXT NOT NULL,
        source_execution_id TEXT NOT NULL,
        source_area_id TEXT,
        source_module_id TEXT,
        content TEXT NOT NULL,
        atom_type TEXT NOT NULL,
        confidence REAL DEFAULT 0.8,
        category TEXT NOT NULL,
        subcategory TEXT,
        sentiment TEXT,
        temporal_type TEXT,
        entities JSON,
        tags JSON,
        valid_from DATETIME,
        valid_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        superseded_by TEXT,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE knowledge_entity_refs (
        atom_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_name TEXT,
        relationship TEXT,
        PRIMARY KEY (atom_id, entity_type, entity_id)
      );

      CREATE TABLE workflow_outputs (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        step_type TEXT NOT NULL,
        area_id TEXT,
        module_id TEXT,
        connection_id TEXT,
        output_data JSON NOT NULL,
        output_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT NOT NULL,
        workflow_name TEXT NOT NULL,
        step_name TEXT NOT NULL
      );

      CREATE TABLE checkpoint_decisions (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        ai_recommendation TEXT,
        ai_confidence REAL,
        human_decision TEXT NOT NULL,
        human_reasoning TEXT,
        is_override INTEGER DEFAULT 0,
        override_category TEXT,
        context_snapshot JSON,
        decided_by TEXT NOT NULL,
        decided_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE quality_scores (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        module_id TEXT NOT NULL,
        area_id TEXT,
        content_hash TEXT NOT NULL,
        score_overall REAL NOT NULL,
        score_completeness REAL,
        score_accuracy REAL,
        score_structure REAL,
        score_actionability REAL,
        score_citations REAL,
        word_count INTEGER,
        scored_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        scored_by TEXT DEFAULT 'system',
        model_used TEXT,
        notes TEXT
      );

      CREATE TABLE detected_patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        pattern_subtype TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT DEFAULT 'info',
        confidence REAL DEFAULT 0.5,
        supporting_data JSON NOT NULL,
        affected_entities JSON DEFAULT '[]',
        affected_workflows JSON DEFAULT '[]',
        affected_areas JSON DEFAULT '[]',
        first_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
        detection_count INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        resolved_at DATETIME,
        resolved_by TEXT,
        resolution_notes TEXT
      );

      CREATE TABLE pattern_detectors_state (
        detector_id TEXT PRIMARY KEY,
        last_run DATETIME,
        next_run DATETIME,
        run_count INTEGER DEFAULT 0,
        config JSON,
        enabled INTEGER DEFAULT 1
      );
    `);

    patternDetection = createPatternDetection(db);
  });

  afterAll(() => {
    db.close();
  });

  test('should initialize pattern detection service', () => {
    expect(patternDetection).toBeDefined();
    expect(patternDetection.runAllDetectors).toBeInstanceOf(Function);
    expect(patternDetection.getPatterns).toBeInstanceOf(Function);
  });

  test('should run all detectors without errors', () => {
    const result = patternDetection.runAllDetectors();
    expect(result).toBeDefined();
    expect(result.patternsDetected).toBeGreaterThanOrEqual(0);
    expect(result.patternsStored).toBeGreaterThanOrEqual(0);
  });

  test('should retrieve patterns with filters', () => {
    const patterns = patternDetection.getPatterns({ status: 'active' });
    expect(Array.isArray(patterns)).toBe(true);
  });

  test('should update pattern status', () => {
    // First, create a test pattern
    const testPattern = {
      pattern_type: 'gap',
      pattern_subtype: 'test',
      title: 'Test Pattern',
      description: 'Test pattern for status update',
      severity: 'info',
      confidence: 0.8,
      supporting_data: JSON.stringify({ test: true }),
    };

    db.prepare(`
      INSERT INTO detected_patterns
        (id, pattern_type, pattern_subtype, title, description, severity, confidence, supporting_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'test_pattern_1',
      testPattern.pattern_type,
      testPattern.pattern_subtype,
      testPattern.title,
      testPattern.description,
      testPattern.severity,
      testPattern.confidence,
      testPattern.supporting_data
    );

    // Update status
    patternDetection.updatePatternStatus('test_pattern_1', 'resolved', 'test_user', 'Test resolution');

    // Verify
    const updated = db.prepare('SELECT * FROM detected_patterns WHERE id = ?').get('test_pattern_1') as any;
    expect(updated.status).toBe('resolved');
    expect(updated.resolved_by).toBe('test_user');
    expect(updated.resolution_notes).toBe('Test resolution');
  });

  test('should get detector state', () => {
    const state = patternDetection.getDetectorState();
    // State might be null if never run, or an object if run
    if (state) {
      expect(state.detector_id).toBe('all');
    }
  });
});
