import type { DatabaseAdapter } from '../db/database.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createProjectOrchestratorService(db: DatabaseAdapter) {

  function readPrompt(name: string): string {
    try { return readFileSync(path.join(__dirname, '..', 'prompts', `${name}.md`), 'utf-8'); }
    catch { return `You are an expert project planner. Task: ${name}`; }
  }

  async function generateProjectPlan(projectId: string, goal: string, context?: string) {
    const { callChat, mapModelToProvider } = await import('./provider-router.js');
    const prompt = readPrompt('project-orchestrator');

    const userMessage = `## Project Goal\n${goal}\n\n${context ? `## Context\n${context}` : ''}`;
    const result = await callChat({
      model: mapModelToProvider('claude-sonnet-4-5-20250929'),
      system: prompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
    });

    // Parse <plan> tags
    const planMatch = result.text.match(/<plan>([\s\S]*?)<\/plan>/);
    const planJson = planMatch ? planMatch[1].trim() : result.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    const plan = JSON.parse(planJson) as { approach: string; tasks: Array<{ title: string; description: string; task_type: string; step_order: number; depends_on: number[]; required_capabilities: string[]; estimated_hours: number }> };

    // Get plan version
    const existing = await db.get<{ max_version: number }>(
      'SELECT COALESCE(MAX(plan_version), 0) as max_version FROM community_project_plans WHERE project_id = $1', projectId
    );
    const version = (existing?.max_version ?? 0) + 1;

    const planId = `cplan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const totalHours = plan.tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);

    await db.run(`
      INSERT INTO community_project_plans (id, project_id, plan_version, goal, approach, tasks, estimated_total_hours, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
    `, planId, projectId, version, goal, plan.approach, JSON.stringify(plan.tasks), totalHours);

    // Create project tasks
    for (const task of plan.tasks) {
      const taskId = `cpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(`
        INSERT INTO community_project_tasks (id, project_id, plan_id, title, description, task_type, step_order, depends_on, required_capabilities, estimated_hours)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, taskId, projectId, planId, task.title, task.description, task.task_type || 'deliverable',
         task.step_order, JSON.stringify(task.depends_on || []), JSON.stringify(task.required_capabilities || []),
         task.estimated_hours || 4);
    }

    await logActivity(projectId, null, 'plan_generated', `Plan v${version} generated: ${plan.tasks.length} tasks, ~${totalHours}h estimated`);

    return { planId, approach: plan.approach, taskCount: plan.tasks.length, totalHours };
  }

  async function approvePlan(projectId: string, planId: string) {
    await db.run("UPDATE community_project_plans SET status = 'active', approved_at = NOW() WHERE id = $1", planId);
    await db.run("UPDATE projects SET active_plan_id = $1 WHERE id = $2", planId, projectId);
    await logActivity(projectId, null, 'plan_approved', 'Plan approved and activated');
  }

  async function matchCapabilities(projectId: string) {
    const tasks = await db.all<{ id: string; required_capabilities: string; status: string }>(
      "SELECT id, required_capabilities, status FROM community_project_tasks WHERE project_id = $1 AND status = 'pending'", projectId
    );

    // Get contacts with capability cards
    const contacts = await db.all<{ contact_hash: string; display_name: string; delegation_trust_level: string; avg_task_quality: number }>(
      "SELECT contact_hash, display_name, delegation_trust_level, avg_task_quality FROM community_connections WHERE status = 'accepted'"
    );

    const cards = await db.all<{ card_data: string; is_current: number }>(
      'SELECT card_data, is_current FROM capability_cards WHERE is_current = 1 LIMIT 1'
    );
    const selfCard = cards.length > 0 ? (typeof cards[0].card_data === 'string' ? JSON.parse(cards[0].card_data) : cards[0].card_data) : null;

    const matches: Array<{ taskId: string; taskTitle: string; candidates: Array<{ contactHash: string; name: string; score: number; trustLevel: string }> }> = [];

    for (const task of tasks) {
      const required = typeof task.required_capabilities === 'string' ? JSON.parse(task.required_capabilities) : task.required_capabilities;
      const candidates: Array<{ contactHash: string; name: string; score: number; trustLevel: string }> = [];

      // Self as candidate
      if (selfCard) {
        const selfScore = computeMatchScore(required, selfCard.modules?.map((m: { moduleId: string }) => m.moduleId) ?? [], selfCard.stats?.avgOverallQuality ?? 5, 'pre_approved');
        candidates.push({ contactHash: 'self', name: 'Self (local)', score: selfScore, trustLevel: 'self' });
      }

      // Contacts as candidates
      for (const contact of contacts) {
        const score = computeMatchScore(required, [], Number(contact.avg_task_quality) || 5, contact.delegation_trust_level);
        candidates.push({ contactHash: contact.contact_hash, name: contact.display_name, score, trustLevel: contact.delegation_trust_level });
      }

      candidates.sort((a, b) => b.score - a.score);
      matches.push({ taskId: task.id, taskTitle: '', candidates: candidates.slice(0, 5) });
    }

    return matches;
  }

  function computeMatchScore(required: string[], modules: string[], quality: number, trustLevel: string): number {
    let score = 0;
    // Capability match (0-50 points)
    if (required.length > 0 && modules.length > 0) {
      const matched = required.filter(r => modules.some(m => m.toLowerCase().includes(r.toLowerCase())));
      score += (matched.length / required.length) * 50;
    } else {
      score += 25; // unknown capabilities = middle score
    }
    // Quality (0-30 points)
    score += Math.min(30, (quality / 10) * 30);
    // Trust level (0-20 points)
    const trustScores: Record<string, number> = { manual: 5, suggested: 10, pre_approved: 15, self: 20 };
    score += trustScores[trustLevel] ?? 5;
    return Math.round(score);
  }

  async function assignTask(projectId: string, taskId: string, assignment: { type: 'self' | 'contact'; contactHash?: string; contactName?: string }) {
    if (assignment.type === 'self') {
      await db.run("UPDATE community_project_tasks SET assigned_to = 'self', status = 'assigned', updated_at = NOW() WHERE id = $1", taskId);
      await logActivity(projectId, taskId, 'task_assigned', 'Task assigned to self (local execution)');
    } else if (assignment.contactHash) {
      // Delegate via task delegation service
      const task = await db.get<{ title: string; description: string; required_capabilities: string }>(
        'SELECT title, description, required_capabilities FROM community_project_tasks WHERE id = $1', taskId
      );
      if (!task) throw new Error('Task not found');

      const { createTaskDelegationService } = await import('./task-delegation-service.js');
      const delegationService = await createTaskDelegationService(db);
      const { taskId: delegatedId } = await delegationService.createTaskRequest({
        providerHash: assignment.contactHash,
        title: task.title,
        description: task.description,
        requiredModules: typeof task.required_capabilities === 'string' ? JSON.parse(task.required_capabilities) : task.required_capabilities,
      });

      await db.run(`UPDATE community_project_tasks SET assigned_to = 'contact', assigned_contact_hash = $1,
        assigned_contact_name = $2, delegated_task_id = $3, status = 'assigned', updated_at = NOW() WHERE id = $4`,
        assignment.contactHash, assignment.contactName ?? assignment.contactHash, delegatedId, taskId);
      await logActivity(projectId, taskId, 'task_delegated', `Task delegated to ${assignment.contactName ?? assignment.contactHash}`);
    }
    await updateProgress(projectId);
  }

  async function syncTaskStatuses(projectId: string) {
    const tasks = await db.all<{ id: string; delegated_task_id: string }>(
      "SELECT id, delegated_task_id FROM community_project_tasks WHERE project_id = $1 AND delegated_task_id IS NOT NULL", projectId
    );
    for (const task of tasks) {
      const delegated = await db.get<{ status: string; result_content: string; progress_percent: number }>(
        'SELECT status, result_content, progress_percent FROM community_delegated_tasks WHERE id = $1', task.delegated_task_id
      );
      if (!delegated) continue;
      const statusMap: Record<string, string> = {
        submitted: 'assigned', accepted: 'assigned', in_progress: 'in_progress',
        clarification_needed: 'blocked', completed: 'review', declined: 'failed',
        cancelled: 'cancelled', failed: 'failed',
      };
      const newStatus = statusMap[delegated.status] ?? 'pending';
      await db.run('UPDATE community_project_tasks SET status = $1, result_content = $2, updated_at = NOW() WHERE id = $3',
        newStatus, delegated.result_content ?? null, task.id);
    }
    await updateProgress(projectId);
  }

  async function completeTask(projectId: string, taskId: string, result: { content: string; qualityScore?: number }) {
    await db.run(`UPDATE community_project_tasks SET status = 'completed', result_content = $1,
      result_quality_score = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3`,
      result.content, result.qualityScore ?? null, taskId);
    await logActivity(projectId, taskId, 'task_completed', 'Task completed');
    await updateProgress(projectId);
  }

  async function getProjectDashboard(projectId: string) {
    const project = await db.get('SELECT * FROM projects WHERE id = $1', projectId);
    const plan = await db.get("SELECT * FROM community_project_plans WHERE project_id = $1 AND status IN ('active','draft') ORDER BY plan_version DESC LIMIT 1", projectId);
    const tasks = await db.all('SELECT * FROM community_project_tasks WHERE project_id = $1 ORDER BY step_order ASC', projectId);
    const activity = await db.all('SELECT * FROM community_project_activity WHERE project_id = $1 ORDER BY created_at DESC LIMIT 30', projectId);

    const tasksByStatus: Record<string, number> = {};
    for (const t of tasks) { tasksByStatus[(t as Record<string, unknown>).status as string] = (tasksByStatus[(t as Record<string, unknown>).status as string] || 0) + 1; }

    return { project, plan, tasks, activity, tasksByStatus, totalTasks: tasks.length };
  }

  async function assembleDeliverables(projectId: string): Promise<string> {
    const tasks = await db.all<{ title: string; result_content: string; step_order: number }>(
      "SELECT title, result_content, step_order FROM community_project_tasks WHERE project_id = $1 AND status = 'completed' AND result_content IS NOT NULL ORDER BY step_order",
      projectId
    );
    if (tasks.length === 0) return 'No completed tasks with results to assemble.';

    const project = await db.get<{ name: string; project_goal: string }>(
      'SELECT name, project_goal FROM projects WHERE id = $1', projectId
    );

    const taskResults = tasks.map(t => `### ${t.title}\n\n${t.result_content}`).join('\n\n---\n\n');

    const { callChat, mapModelToProvider } = await import('./provider-router.js');
    const result = await callChat({
      model: mapModelToProvider('claude-sonnet-4-5-20250929'),
      system: 'You are assembling a cohesive project deliverable from individual task results. Create a well-structured document that flows naturally.',
      messages: [{ role: 'user', content: `Project: ${project?.name}\nGoal: ${project?.project_goal}\n\nAssemble these task results into a cohesive deliverable:\n\n${taskResults}` }],
      maxTokens: 8192,
    });

    await logActivity(projectId, null, 'deliverables_assembled', `Assembled ${tasks.length} task results into deliverable`);
    return result.text;
  }

  async function updateProgress(projectId: string) {
    const stats = await db.get<{ total: number; completed: number }>(
      "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed FROM community_project_tasks WHERE project_id = $1",
      projectId
    );
    const progress = stats && Number(stats.total) > 0 ? Math.round((Number(stats.completed) / Number(stats.total)) * 100) : 0;
    await db.run('UPDATE projects SET overall_progress = $1 WHERE id = $2', progress, projectId);
  }

  async function logActivity(projectId: string, taskId: string | null, type: string, summary: string) {
    const id = `cpa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run('INSERT INTO community_project_activity (id, project_id, task_id, activity_type, summary) VALUES ($1, $2, $3, $4, $5)',
      id, projectId, taskId, type, summary);
  }

  async function listCollaborativeProjects() {
    return await db.all("SELECT * FROM projects WHERE project_type = 'collaborative' ORDER BY created_at DESC LIMIT 50");
  }

  async function createCollaborativeProject(params: { name: string; goal: string; description?: string }) {
    const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`INSERT INTO projects (id, name, description, project_goal, project_type, status)
      VALUES ($1, $2, $3, $4, 'collaborative', 'active')`,
      id, params.name, params.description ?? '', params.goal);
    await logActivity(id, null, 'project_created', `Project "${params.name}" created`);
    return id;
  }

  return {
    generateProjectPlan, approvePlan, matchCapabilities, assignTask,
    syncTaskStatuses, completeTask, getProjectDashboard, assembleDeliverables,
    listCollaborativeProjects, createCollaborativeProject,
  };
}
export type ProjectOrchestratorService = Awaited<ReturnType<typeof createProjectOrchestratorService>>;
