import type { DatabaseAdapter } from '../db/database.js';

export async function createTaskDelegationService(db: DatabaseAdapter) {

  // D3: Signed reasoning trails (best-effort)
  const { createSigningService } = await import('./community-signing-service.js');
  const signingService = await createSigningService(db);

  // D6: Delegation compliance engine
  const { createDelegationComplianceService } = await import('./delegation-compliance-service.js');
  const complianceService = await createDelegationComplianceService(db);

  async function createTaskRequest(params: {
    providerHash: string; title: string; description: string;
    requiredModules?: string[]; context?: string; urgency?: string; deadline?: string;
  }): Promise<{ taskId: string; mailId: string }> {
    // D6: Compliance check — blocks task creation if rules violated
    const complianceResult = await complianceService.evaluateCompliance('outbound', {
      title: params.title, description: params.description,
      contactHash: params.providerHash, requiredModules: params.requiredModules,
    });
    if (!complianceResult.allowed) {
      throw new Error(`Delegation blocked by compliance rules: ${complianceResult.blockedBy.join(', ')}`);
    }

    const identity = await db.get<{ contact_hash: string; display_name: string }>(
      'SELECT contact_hash, display_name FROM community_identity LIMIT 1'
    );
    const senderHash = identity?.contact_hash ?? 'self';

    // Validate connection
    const conn = await db.get<{ id: string }>(
      "SELECT id FROM community_connections WHERE contact_hash = ? AND status = 'accepted'",
      params.providerHash
    );
    if (!conn) throw new Error(`No active connection with ${params.providerHash}`);

    // Get capability card
    const { createCapabilityCardGenerator } = await import('./capability-card-generator.js');
    const cardGen = await createCapabilityCardGenerator(db);
    const card = await cardGen.getOrRefreshCard();

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mailId = `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create task record
    await db.run(`
      INSERT INTO community_delegated_tasks (id, requester_hash, provider_hash, direction,
        title, description, required_modules, context, urgency, deadline, mail_id, requester_capability_card)
      VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?)
    `, taskId, senderHash, params.providerHash,
       params.title, params.description,
       JSON.stringify(params.requiredModules ?? []),
       params.context ?? null,
       params.urgency ?? 'normal',
       params.deadline ?? null, mailId,
       JSON.stringify(card));

    // Send via community_mail
    await db.run(`
      INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, folder, message_type, payload)
      VALUES (?, ?, ?, ?, ?, 'sent', 'task_request', ?)
    `, mailId, senderHash, JSON.stringify([params.providerHash]),
       `[Task] ${params.title}`, params.description,
       JSON.stringify({ taskId, title: params.title, description: params.description,
         requiredModules: params.requiredModules, context: params.context,
         urgency: params.urgency, deadline: params.deadline,
         requesterCard: card }));

    // Increment counter
    await db.run("UPDATE community_connections SET tasks_delegated = COALESCE(tasks_delegated, 0) + 1 WHERE contact_hash = ?", params.providerHash);

    // D3: Trail entry — best-effort
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_created', content: `Task created: ${params.title}`, metadata: { providerHash: params.providerHash, urgency: params.urgency } });
    } catch { /* trail signing is best-effort */ }

    return { taskId, mailId };
  }

  async function acceptTask(taskId: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'accepted', accepted_at = NOW(), updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'status_change', 'Task accepted');
    // D3: Trail entry — best-effort
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_accepted', content: 'Task accepted by provider' });
    } catch { /* trail signing is best-effort */ }
  }

  async function declineTask(taskId: string, reason?: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'declined', updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'status_change', reason ?? 'Task declined');
    // D3: Trail entry — best-effort
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_declined', content: reason ?? 'Task declined' });
    } catch { /* trail signing is best-effort */ }
  }

  async function startTask(taskId: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'in_progress', started_at = NOW(), updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'status_change', 'Work started');
    // D3: Trail entry — best-effort
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_started', content: 'Work started on task' });
    } catch { /* trail signing is best-effort */ }
  }

  async function updateProgress(taskId: string, percent: number, currentStep?: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET progress_percent = ?, current_step = ?, updated_at = NOW() WHERE id = ?",
      percent, currentStep ?? null, taskId
    );
    await addTaskMessage(taskId, 'progress_update', `Progress: ${percent}%${currentStep ? ` — ${currentStep}` : ''}`);
    // D3: Trail entry — best-effort
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'progress_update', content: `Progress: ${percent}%${currentStep ? ` — ${currentStep}` : ''}`, metadata: { percent, currentStep } });
    } catch { /* trail signing is best-effort */ }
  }

  async function requestClarification(taskId: string, question: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'clarification_needed', updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'clarification_request', question);
    // D3: Trail entry — best-effort
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'clarification_requested', content: question });
    } catch { /* trail signing is best-effort */ }
  }

  async function respondToClarification(taskId: string, answer: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'in_progress', updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'clarification_response', answer);
    // D3: Trail entry — best-effort
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'clarification_responded', content: answer });
    } catch { /* trail signing is best-effort */ }
  }

  async function completeTask(taskId: string, result: { content: string; artifacts?: Array<{ type: string; name: string; content: string }> }): Promise<void> {
    await db.run(`
      UPDATE community_delegated_tasks
      SET status = 'completed', completed_at = NOW(), updated_at = NOW(),
          result_content = ?, result_artifacts = ?, progress_percent = 100
      WHERE id = ?
    `, result.content, JSON.stringify(result.artifacts ?? []), taskId);

    // Update connection stats
    const task = await db.get<{ provider_hash: string }>(
      'SELECT provider_hash FROM community_delegated_tasks WHERE id = ?', taskId
    );
    if (task) {
      await db.run(
        "UPDATE community_connections SET tasks_completed = COALESCE(tasks_completed, 0) + 1 WHERE contact_hash = ?",
        task.provider_hash
      );
    }

    await addTaskMessage(taskId, 'status_change', 'Task completed');
    // D3: Trail entry — best-effort
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_completed', content: 'Task completed', metadata: { hasArtifacts: (result.artifacts ?? []).length > 0 } });
    } catch { /* trail signing is best-effort */ }
  }

  async function rateTask(taskId: string, qualityScore: number): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET result_quality_score = ?, updated_at = NOW() WHERE id = ?",
      qualityScore, taskId
    );

    // Update avg quality on connection
    const task = await db.get<{ provider_hash: string }>(
      'SELECT provider_hash FROM community_delegated_tasks WHERE id = ?', taskId
    );
    if (task) {
      const avgQ = await db.get<{ avg: number }>(
        "SELECT AVG(result_quality_score) as avg FROM community_delegated_tasks WHERE provider_hash = ? AND result_quality_score IS NOT NULL",
        task.provider_hash
      );
      if (avgQ) {
        await db.run(
          "UPDATE community_connections SET avg_task_quality = ? WHERE contact_hash = ?",
          Number(avgQ.avg), task.provider_hash
        );
      }
    }
  }

  async function cancelTask(taskId: string, reason?: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'cancelled', updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'status_change', reason ?? 'Task cancelled');
    // D3: Trail entry — best-effort
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_cancelled', content: reason ?? 'Task cancelled' });
    } catch { /* trail signing is best-effort */ }
  }

  async function getTask(taskId: string) {
    const task = await db.get('SELECT * FROM community_delegated_tasks WHERE id = ?', taskId);
    const messages = await db.all(
      'SELECT * FROM community_task_messages WHERE task_id = ? ORDER BY created_at ASC', taskId
    );
    return { task, messages };
  }

  async function listTasks(filters?: { direction?: string; status?: string; limit?: number }) {
    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    if (filters?.direction) { where += ' AND direction = ?'; params.push(filters.direction); }
    if (filters?.status) { where += ' AND status = ?'; params.push(filters.status); }
    params.push(filters?.limit ?? 50);
    return await db.all(
      `SELECT * FROM community_delegated_tasks ${where} ORDER BY created_at DESC LIMIT ?`, ...params
    );
  }

  async function getTaskStats() {
    const stats = await db.all<{ direction: string; status: string; count: number }>(
      "SELECT direction, status, COUNT(*) as count FROM community_delegated_tasks GROUP BY direction, status"
    );
    const pending = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM community_delegated_tasks WHERE direction = 'inbound' AND status = 'submitted'"
    );
    return { breakdown: stats, pendingInbound: Number(pending?.count) || 0 };
  }

  // Helper
  async function addTaskMessage(taskId: string, type: string, content: string, metadata?: Record<string, unknown>) {
    const identity = await db.get<{ contact_hash: string }>(
      'SELECT contact_hash FROM community_identity LIMIT 1'
    );
    const id = `tm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO community_task_messages (id, task_id, sender_hash, message_type, content, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `, id, taskId, identity?.contact_hash ?? 'self', type, content, JSON.stringify(metadata ?? {}));
  }

  return {
    createTaskRequest, acceptTask, declineTask, startTask,
    updateProgress, requestClarification, respondToClarification,
    completeTask, rateTask, cancelTask,
    getTask, listTasks, getTaskStats,
  };
}

export type TaskDelegationService = Awaited<ReturnType<typeof createTaskDelegationService>>;
