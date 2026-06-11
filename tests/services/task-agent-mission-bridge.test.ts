/**
 * task-agent-mission-bridge.test.ts — Wave 5.1 linkage round-trip.
 *
 * Live-PG test (same pattern as engagement-session-bridge.test.ts):
 * requires DATABASE_URL (env or .env); skips otherwise. NO LLM calls —
 * compile is pure, briefMissionWithGraph persists deterministically, and
 * the deliverable mapping reads back live rows.
 *
 * Exercises:
 *   1. anton_tasks row + approach → compileTaskToMission → createMission
 *      (check_in) → briefMissionWithGraph → approvePlanAndStart
 *   2. linkage columns both directions (migration 231, applied
 *      idempotently in beforeAll)
 *   3. status mapping (summarizeLinkedMission) against live rows
 *   4. completion → buildMissionDeliverable produces SharedStepRecords
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const DATABASE_URL = resolveDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

describeOrSkip('Task Agent ↔ Missions bridge (5.1) — linkage round-trip', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let controller: import('../../server/services/missions/mission-controller.js').MissionController;

  const suffix = randomUUID().slice(0, 8);
  const taskId = `bridge-task-${suffix}`;
  const approachId = `bridge-approach-${suffix}`;
  const userId = `bridge-user-${suffix}`;
  let missionId: string | null = null;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    // Migration 231 is idempotent (IF NOT EXISTS) — apply so the suite is
    // self-sufficient on DBs that haven't migrated yet.
    const migration = readFileSync(
      join(process.cwd(), 'server', 'db', 'migrations-pg', '231_task_agent_mission_bridge.sql'),
      'utf8',
    );
    await db.exec(migration);

    const { createMissionController } = await import('../../server/services/missions/mission-controller.js');
    controller = createMissionController(db);

    // missions.missions.created_by → users(id) FK
    await db.run(
      `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', 'analyst')`,
      userId, userId);

    await db.run(
      `INSERT INTO anton_approaches
        (id, name, summary, description, task_pattern, capability_ids, execution_steps, effort, outcome, required_inputs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      approachId, 'Bridge Test Approach', 'summary', 'description',
      '["bridge","test"]', '[]',
      JSON.stringify([
        { step: 1, name: 'Analyse inputs', description: 'First analysis' },
        { step: 2, name: 'Draft deliverable', description: 'Write it up' },
      ]),
      'medium', 'A bridged deliverable', '[]',
    );

    await db.run(
      `INSERT INTO anton_tasks
        (id, user_id, title, description, status, source, priority, chosen_approach_id, intake_answers, intake_ready)
       VALUES (?, 'default', ?, ?, 'clarifying', 'manual', 'high', ?, ?, 1)`,
      taskId, 'Bridge test task', 'Round-trip the bridge.', approachId,
      JSON.stringify({ entity: 'TestCo', jurisdiction: 'SE' }),
    );
  }, 60_000);

  afterAll(async () => {
    try {
      if (missionId) await db.run('DELETE FROM missions.missions WHERE id = ?', missionId); // cascades tasks/deps/activity/decisions
      await db.run('DELETE FROM anton_tasks WHERE id = ?', taskId);
      await db.run('DELETE FROM anton_approaches WHERE id = ?', approachId);
      await db.run('DELETE FROM users WHERE id = ?', userId);
    } finally {
      await db.close();
    }
  });

  it('compiles the task + approach and persists the mission graph with both linkage columns', async () => {
    const { compileTaskToMission } = await import('../../server/services/task-agent-mission-compiler.js');

    const compiled = compileTaskToMission({
      task: { id: taskId, title: 'Bridge test task', description: 'Round-trip the bridge.', priority: 'high' },
      approach: {
        id: approachId,
        name: 'Bridge Test Approach',
        outcome: 'A bridged deliverable',
        execution_steps: [
          { step: 1, name: 'Analyse inputs', description: 'First analysis' },
          { step: 2, name: 'Draft deliverable', description: 'Write it up' },
        ],
      },
      intakeAnswers: { entity: 'TestCo', jurisdiction: 'SE' },
      attachedFiles: [],
    });

    const mission = await controller.createMission({
      title: compiled.mission.title,
      objective: compiled.mission.objective,
      success_criteria: compiled.mission.success_criteria,
      context: compiled.mission.context || undefined,
      autonomy_level: compiled.mission.autonomy_level,
      priority: compiled.mission.priority,
    }, userId);
    missionId = mission.id;
    expect(mission.autonomy_level).toBe('check_in');
    expect(mission.priority).toBe('high');

    // Linkage both directions (migration 231)
    await db.run('UPDATE missions.missions SET source_task_id=? WHERE id=?', taskId, mission.id);
    await db.run('UPDATE anton_tasks SET linked_mission_id=?, status=? WHERE id=?', mission.id, 'executing', taskId);

    const briefed = await controller.briefMissionWithGraph(mission.id, compiled.graph, 'test compile');
    expect(briefed.mission.status).toBe('briefed');
    // llm, checkpoint, llm
    expect(briefed.tasks.map(t => t.task_type)).toEqual(['llm', 'checkpoint', 'llm']);
    // Linear dependency chain persisted
    const deps = await controller.state.listDependencies(mission.id);
    expect(deps).toHaveLength(2);

    const started = await controller.approvePlanAndStart(mission.id);
    expect(started.status).toBe('active');

    // Round-trip: read the link back from both sides
    const missionRow = await db.get<{ source_task_id: string | null }>(
      'SELECT source_task_id FROM missions.missions WHERE id = ?', mission.id);
    expect(missionRow?.source_task_id).toBe(taskId);
    const taskRow = await db.get<{ linked_mission_id: string | null; status: string }>(
      'SELECT linked_mission_id, status FROM anton_tasks WHERE id = ?', taskId);
    expect(taskRow?.linked_mission_id).toBe(mission.id);
    expect(taskRow?.status).toBe('executing');
  }, 30_000);

  it('summarizeLinkedMission maps live mission state into the Task Agent view', async () => {
    const { summarizeLinkedMission } = await import('../../server/services/task-agent-mission-compiler.js');
    const mission = await controller.state.getMission(missionId!);
    const tasks = await controller.state.listTasks(missionId!);
    const summary = summarizeLinkedMission(mission!, tasks);
    expect(summary.id).toBe(missionId);
    expect(summary.status).toBe('active');
    expect(summary.total_tasks).toBe(3);
    expect(summary.completed_tasks).toBe(0);
    expect(summary.progress_pct).toBe(0);
  });

  it('on completion, buildMissionDeliverable yields SharedStepRecords from the llm tasks only', async () => {
    const { buildMissionDeliverable, summarizeLinkedMission } =
      await import('../../server/services/task-agent-mission-compiler.js');

    // Simulate the runner finishing the mission (no LLM in tests).
    const tasks = await controller.state.listTasks(missionId!);
    for (const t of tasks) {
      if (t.task_type === 'llm') {
        await controller.state.recordTaskOutput(t.id, {
          full: `# Output of ${t.title}\nReal content.`,
          summary: t.title,
          provider: 'test', model: 'test', tier: 'execution',
          tokens: 10, durationSeconds: 1, quality: 8.7,
        });
      } else {
        await controller.state.updateTaskStatus(t.id, 'completed', { completedAt: new Date().toISOString() });
      }
    }
    await controller.state.updateMissionStatus(missionId!, 'completed', { completedAt: new Date().toISOString() });

    const finalTasks = await controller.state.listTasks(missionId!);
    const summary = summarizeLinkedMission((await controller.state.getMission(missionId!))!, finalTasks);
    expect(summary.status).toBe('completed');
    expect(summary.progress_pct).toBe(100);

    const { deliverableText, stepRecords } = buildMissionDeliverable(finalTasks);
    expect(stepRecords).toHaveLength(2); // checkpoint excluded
    expect(stepRecords.map(r => r.name)).toEqual(['Analyse inputs', 'Draft deliverable']);
    expect(stepRecords[0].source).toBe('mission');
    expect(stepRecords[0].quality_score).toBe(8.7);
    expect(stepRecords[0].mission_task_id).toMatch(/^t_/);
    expect(deliverableText).toContain('## Step 1: Analyse inputs');
    expect(deliverableText).toContain('Real content.');
  }, 30_000);
});
