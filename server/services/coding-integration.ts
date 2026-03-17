/**
 * coding-integration.ts
 *
 * Ties coding area outputs to quality scoring, versioning, and knowledge extraction.
 * Follows the factory function pattern used by quality-ratchet and atom-extractor.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import { createQualityRatchet } from './quality-ratchet.js';
import { createAtomExtractor } from './atom-extractor.js';
import { computeDiff, computeStats, buildSemanticSummary } from './version-diff.js';

// ── Types ──────────────────────────────────────────────────────

interface ScoreResult {
  score: {
    overall: number;
    completeness: number;
    accuracy: number;
    structure: number;
    actionability: number;
    citations: number;
  };
  id: string;
  regressionWarning?: string;
}

interface VersionRecord {
  id: number;
  version_number: number;
  label: string | null;
  created_at: string;
  content_length: number;
}

interface SavedVersion {
  id: number;
  version_number: number;
  label: string | null;
}

interface DiffResult {
  chunks: any[];
  stats: any;
  summary: string;
}

// ── Factory ────────────────────────────────────────────────────

export async function createCodingIntegration(db: DatabaseAdapter, anthropicClient?: any) {

  // ── Helpers ────────────────────────────────────────────────────

  async function tableExists(tableName: string): boolean {
    const row = await db.get(
      "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = ?"
    , tableName) as { name: string } | undefined;
    return !!row;
  }

  // ── scoreOutput ────────────────────────────────────────────────

  async function scoreOutput(
    content: string,
    moduleId: string,
    areaId: string = 'coding',
    sessionId?: string
  ): Promise<ScoreResult | null> {
    try {
      const ratchet = await createQualityRatchet(db);
      const result = await ratchet.scoreOutput({
        content,
        moduleId,
        areaId,
        sessionId,
        anthropicClient,
      });
      return result;
    } catch (error) {
      console.error('[coding-integration] scoreOutput error (non-fatal):', error);
      return null;
    }
  }

  // ── saveVersion ────────────────────────────────────────────────

  async function saveVersion(
    entityType: string,
    entityId: string,
    content: string,
    label?: string
  ): SavedVersion {
    // Get current max version_number for this entity
    const maxRow = await db.get(
      'SELECT MAX(version_number) as max_ver FROM versions WHERE entity_type = ? AND entity_id = ?'
    , entityType, entityId) as { max_ver: number | null } | undefined;

    const nextVersion = (maxRow?.max_ver ?? 0) + 1;

    const result = await db.run(
      `INSERT INTO versions (entity_type, entity_id, version_number, label, content)
       VALUES (?, ?, ?, ?, ?)`
    , entityType, entityId, nextVersion, label || null, content);

    return {
      id: Number(result.lastInsertRowid),
      version_number: nextVersion,
      label: label || null,
    };
  }

  // ── getVersionHistory ──────────────────────────────────────────

  async function getVersionHistory(
    entityType: string,
    entityId: string,
    limit: number = 20
  ): VersionRecord[] {
    const rows = await db.all(
      `SELECT id, version_number, label, created_at, LENGTH(content) as content_length
       FROM versions
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY version_number DESC
       LIMIT ?`
    , entityType, entityId, limit) as Array<{
      id: number;
      version_number: number;
      label: string | null;
      created_at: string;
      content_length: number;
    }>;

    return rows;
  }

  // ── diffVersions ──────────────────────────────────────────────

  async function diffVersions(
    entityType: string,
    entityId: string,
    v1: number,
    v2: number
  ): DiffResult | null {
    const version1 = await db.get('SELECT content FROM versions WHERE entity_type = ? AND entity_id = ? AND version_number = ?'
    , entityType, entityId, v1) as { content: string } | undefined;

    const version2 = await db.get(
      'SELECT content FROM versions WHERE entity_type = ? AND entity_id = ? AND version_number = ?'
    , entityType, entityId, v2) as { content: string } | undefined;

    if (!version1 || !version2) {
      return null;
    }

    const oldContent = version1.content;
    const newContent = version2.content;

    const chunks = computeDiff(oldContent, newContent);
    const stats = computeStats(chunks, oldContent, newContent);
    const summary = buildSemanticSummary(stats);

    return { chunks, stats, summary };
  }

  // ── extractKnowledge ──────────────────────────────────────────

  async function extractKnowledge(
    content: string,
    projectId: string,
    phase: string,
    moduleId: string
  ): Promise<void> {
    try {
      // Check if workflow_outputs table exists
      if (!tableExists('workflow_outputs')) {
        console.warn('[coding-integration] workflow_outputs table not found, skipping knowledge extraction');
        return;
      }

      if (!anthropicClient) {
        console.warn('[coding-integration] No Anthropic client provided, skipping knowledge extraction');
        return;
      }

      // Create a minimal workflow_output row for the atom extractor
      const outputId = randomUUID();
      const workflowId = `coding-${projectId}`;
      const executionId = `coding-phase-${phase}`;

      await db.run(`
        INSERT INTO workflow_outputs
          (id, workflow_id, execution_id, step_index, step_type, output_data,
           module_id, area_id, created_by, workflow_name, step_name)
        VALUES (?, ?, ?, 0, 'text', ?, ?, 'coding', 'system', ?, ?)
      `, 
        outputId,
        workflowId,
        executionId,
        JSON.stringify(content),
        moduleId,
        `Coding: ${phase}`,
        `${phase}-output`
      );

      const extractor = await createAtomExtractor(db, anthropicClient);
      await extractor.extractAtoms(outputId);

      console.log(`[coding-integration] Knowledge extracted for project ${projectId}, phase ${phase}`);
    } catch (error) {
      console.error('[coding-integration] extractKnowledge error (non-fatal):', error);
    }
  }

  return { scoreOutput, saveVersion, getVersionHistory, diffVersions, extractKnowledge };
}

export type CodingIntegration = ReturnType<typeof createCodingIntegration>;
