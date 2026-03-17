/**
 * session-resume.ts
 * Session Resume service — creates and retrieves rich session snapshots
 * for first-class resume functionality. Injects resume context as prompt
 * layer 4a when continuing a session.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';


export interface SessionSnapshot {
  id: string;
  session_id: string;
  snapshot_type: 'auto' | 'manual' | 'pause' | 'checkpoint';
  title: string | null;
  summary: string;
  key_decisions: string[];
  open_questions: string[];
  next_steps: string[];
  context_state: Record<string, unknown>;
  token_count: number;
  user_id: string;
  created_at: string;
}

interface RawSnapshotRow {
  id: string;
  session_id: string;
  snapshot_type: string;
  title: string | null;
  summary: string;
  key_decisions: string;
  open_questions: string;
  next_steps: string;
  context_state: string;
  token_count: number;
  user_id: string;
  created_at: string;
}

function parseSnapshot(row: RawSnapshotRow): SessionSnapshot {
  return {
    ...row,
    snapshot_type: row.snapshot_type as SessionSnapshot['snapshot_type'],
    key_decisions: JSON.parse(row.key_decisions || '[]'),
    open_questions: JSON.parse(row.open_questions || '[]'),
    next_steps: JSON.parse(row.next_steps || '[]'),
    context_state: JSON.parse(row.context_state || '{}'),
  };
}

export interface CreateSnapshotInput {
  session_id: string;
  snapshot_type?: SessionSnapshot['snapshot_type'];
  title?: string;
  summary: string;
  key_decisions?: string[];
  open_questions?: string[];
  next_steps?: string[];
  context_state?: Record<string, unknown>;
  token_count?: number;
  user_id?: string;
}

export async function createSessionResumeService(db: DatabaseAdapter) {
  /**
   * Create a snapshot of the current session state.
   */
  async function createSnapshot(input: CreateSnapshotInput): Promise<SessionSnapshot> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO session_snapshots
        (id, session_id, snapshot_type, title, summary, key_decisions, open_questions, next_steps, context_state, token_count, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      input.session_id,
      input.snapshot_type ?? 'auto',
      input.title ?? null,
      input.summary,
      JSON.stringify(input.key_decisions ?? []),
      JSON.stringify(input.open_questions ?? []),
      JSON.stringify(input.next_steps ?? []),
      JSON.stringify(input.context_state ?? {}),
      input.token_count ?? 0,
      input.user_id ?? 'default',
      now,
    );

    return (await getSnapshot(id))!;
  }

  /**
   * Get the most recent snapshot for a session.
   */
  async function getLatestSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
    const row = await db.get(`
      SELECT * FROM session_snapshots
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, sessionId) as RawSnapshotRow | undefined;

    return row ? parseSnapshot(row) : null;
  }

  /**
   * Get a specific snapshot by ID.
   */
  async function getSnapshot(snapshotId: string): Promise<SessionSnapshot | null> {
    const row = await db.get('SELECT * FROM session_snapshots WHERE id = ?', snapshotId) as RawSnapshotRow | undefined;
    return row ? parseSnapshot(row) : null;
  }

  /**
   * List all snapshots for a session, most recent first.
   */
  async function listSnapshots(sessionId: string, limit = 10): Promise<SessionSnapshot[]> {
    const rows = await db.all(`
      SELECT * FROM session_snapshots
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, sessionId, limit) as RawSnapshotRow[];

    return rows.map(parseSnapshot);
  }

  /**
   * Delete a snapshot.
   */
  async function deleteSnapshot(snapshotId: string): Promise<boolean> {
    const result = await db.run('DELETE FROM session_snapshots WHERE id = ?', snapshotId);
    return result.changes > 0;
  }

  /**
   * Build prompt layer 4a: Resume Context.
   * Injected into the system prompt when resuming a session.
   */
  function buildResumeContext(snapshot: SessionSnapshot): string {
    const lines: string[] = ['## SESSION RESUME CONTEXT'];
    lines.push(`This session was paused. Here is a structured summary to restore full context:\n`);
    lines.push(`**Session Summary:** ${snapshot.summary}`);

    if (snapshot.key_decisions.length > 0) {
      lines.push(`\n**Key Decisions Made:**`);
      snapshot.key_decisions.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
    }

    if (snapshot.open_questions.length > 0) {
      lines.push(`\n**Open Questions (not yet resolved):**`);
      snapshot.open_questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
    }

    if (snapshot.next_steps.length > 0) {
      lines.push(`\n**Planned Next Steps:**`);
      snapshot.next_steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    }

    lines.push(`\nContinue from where the session left off. Do not repeat work already completed. Reference the above context where relevant.`);

    return lines.join('\n');
  }

  /**
   * Auto-generate a snapshot by analysing session messages.
   * Used when user pauses or session auto-saves.
   */
  async function autoGenerateSnapshot(
    sessionId: string,
    userId: string,
    claudeClient?: { complete: (prompt: string, model: string) => Promise<string> },
  ): Promise<SessionSnapshot> {
    // Get last 10 assistant messages to summarise
    const messages = await db.all(`
      SELECT role, content FROM messages
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, sessionId) as Array<{ role: string; content: string }>;

    const messageText = messages
      .reverse()
      .map((m) => `[${m.role}]: ${m.content.slice(0, 500)}`)
      .join('\n\n');

    let summary = 'Session in progress.';
    const key_decisions: string[] = [];
    const open_questions: string[] = [];
    const next_steps: string[] = [];

    // If Claude client available, generate rich summary
    if (claudeClient && messageText.length > 100) {
      try {
        const prompt = `Analyse this conversation and extract:
1. A 2-3 sentence summary of what was accomplished
2. Up to 5 key decisions made
3. Up to 5 open questions not yet resolved
4. Up to 5 planned next steps

Respond as JSON: {"summary":"...","key_decisions":[],"open_questions":[],"next_steps":[]}

Conversation:
${messageText}`;

        const response = await claudeClient.complete(prompt, 'claude-haiku-4-5-20251001');
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          summary = parsed.summary || summary;
          key_decisions.push(...(parsed.key_decisions || []));
          open_questions.push(...(parsed.open_questions || []));
          next_steps.push(...(parsed.next_steps || []));
        }
      } catch {
        // Fall back to simple summary
        summary = `Session with ${messages.length} messages.`;
      }
    } else if (messageText.length > 0) {
      // Simple fallback: use last assistant message snippet
      const lastAssistant = messages.findLast((m) => m.role === 'assistant');
      if (lastAssistant) {
        summary = lastAssistant.content.slice(0, 300).trim();
      }
    }

    return createSnapshot({
      session_id: sessionId,
      snapshot_type: 'auto',
      summary,
      key_decisions,
      open_questions,
      next_steps,
      user_id: userId,
    });
  }

  return {
    createSnapshot,
    getLatestSnapshot,
    getSnapshot,
    listSnapshots,
    deleteSnapshot,
    buildResumeContext,
    autoGenerateSnapshot,
  };
}
