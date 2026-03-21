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
    serviceListingId?: string; paymentFtc?: number;
  }): Promise<{ taskId: string; mailId: string; paymentQuote?: { serviceListingId: string; amountFtc: number; pricingModel: string; qualityLinkedTerms: Record<string, unknown> | null; budgetStatus: string } }> {
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

    // ── Quote generation: match required modules to service listings ──
    let paymentQuote: { serviceListingId: string; amountFtc: number; pricingModel: string; qualityLinkedTerms: Record<string, unknown> | null; budgetStatus: string } | undefined;
    let serviceListingId: string | null = params.serviceListingId ?? null;
    let paymentAmountFtc: number | null = params.paymentFtc ?? null;
    let paymentStatus = 'none';
    let qualityLinkedTerms: Record<string, unknown> | null = null;
    let paymentTerms: Record<string, unknown> | null = null;

    try {
      // Match to service listing: explicit ID or auto-match by required modules
      let listing: Record<string, unknown> | undefined;
      if (serviceListingId) {
        listing = await db.get('SELECT * FROM fc_service_listings WHERE id = ? AND is_active = TRUE', serviceListingId) as Record<string, unknown> | undefined;
      } else if (params.requiredModules && params.requiredModules.length > 0) {
        const placeholders = params.requiredModules.map(() => '?').join(',');
        listing = await db.get(
          `SELECT * FROM fc_service_listings WHERE module_id IN (${placeholders}) AND is_active = TRUE ORDER BY avg_quality_score DESC LIMIT 1`,
          ...params.requiredModules
        ) as Record<string, unknown> | undefined;
      }

      if (listing) {
        serviceListingId = String(listing.id);
        const priceFtc = Number(listing.price_ftc);
        const pricingModel = String(listing.pricing_model ?? 'fixed');
        paymentAmountFtc = params.paymentFtc ?? priceFtc;

        paymentTerms = {
          serviceListingId, pricingModel, quotedFtc: priceFtc,
          maxTurnaroundHours: listing.max_turnaround_hours,
        };

        if (pricingModel === 'quality_linked') {
          qualityLinkedTerms = {
            fullThreshold: Number(listing.quality_threshold_full ?? 8.0),
            fullPayFtc: priceFtc,
            partialThreshold: Number(listing.quality_threshold_partial ?? 6.0),
            partialPayFtc: priceFtc * (Number(listing.partial_pay_percent ?? 50) / 100),
            partialPayPercent: Number(listing.partial_pay_percent ?? 50),
          };
        }

        // Check budget
        let budgetStatus = 'unchecked';
        try {
          const { createFCBudgetService } = await import('./fc-budget-service.js');
          const budgetService = await createFCBudgetService(db);
          const check = await budgetService.checkSpending(paymentAmountFtc);
          budgetStatus = check.result; // 'approved' | 'requires_approval' | 'blocked'
          paymentStatus = check.result === 'approved' ? 'pending' :
                          check.result === 'requires_approval' ? 'pending' : 'none';
        } catch { budgetStatus = 'unchecked'; }

        paymentQuote = { serviceListingId, amountFtc: paymentAmountFtc, pricingModel, qualityLinkedTerms, budgetStatus };
      }
    } catch (quoteErr) {
      console.error('[task-delegation] Quote generation failed (non-blocking):', quoteErr instanceof Error ? quoteErr.message : quoteErr);
    }

    // Create task record
    await db.run(`
      INSERT INTO community_delegated_tasks (id, requester_hash, provider_hash, direction,
        title, description, required_modules, context, urgency, deadline, mail_id, requester_capability_card,
        service_listing_id, payment_amount_ftc, payment_status, payment_terms, quality_linked_terms)
      VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, taskId, senderHash, params.providerHash,
       params.title, params.description,
       JSON.stringify(params.requiredModules ?? []),
       params.context ?? null,
       params.urgency ?? 'normal',
       params.deadline ?? null, mailId,
       JSON.stringify(card),
       serviceListingId, paymentAmountFtc, paymentStatus,
       paymentTerms ? JSON.stringify(paymentTerms) : null,
       qualityLinkedTerms ? JSON.stringify(qualityLinkedTerms) : null);

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

    // D3: Signed trail entry — mandatory (blocks task state change on failure)
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_created', content: `Task created: ${params.title}`, metadata: { providerHash: params.providerHash, urgency: params.urgency } });
    } catch (trailErr) {
      console.error(`[trail] Failed to record trail entry for task:`, trailErr instanceof Error ? trailErr.message : trailErr);
      throw new Error('Task state change blocked: failed to record audit trail entry');
    }

    return { taskId, mailId, paymentQuote };
  }

  async function acceptTask(taskId: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'accepted', accepted_at = NOW(), updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'status_change', 'Task accepted');
    // D3: Signed trail entry — mandatory (blocks task state change on failure)
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_accepted', content: 'Task accepted by provider' });
    } catch (trailErr) {
      console.error(`[trail] Failed to record trail entry for task:`, trailErr instanceof Error ? trailErr.message : trailErr);
      throw new Error('Task state change blocked: failed to record audit trail entry');
    }
  }

  async function declineTask(taskId: string, reason?: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'declined', updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'status_change', reason ?? 'Task declined');
    // D3: Signed trail entry — mandatory (blocks task state change on failure)
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_declined', content: reason ?? 'Task declined' });
    } catch (trailErr) {
      console.error(`[trail] Failed to record trail entry for task:`, trailErr instanceof Error ? trailErr.message : trailErr);
      throw new Error('Task state change blocked: failed to record audit trail entry');
    }
  }

  async function startTask(taskId: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'in_progress', started_at = NOW(), updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'status_change', 'Work started');
    // D3: Signed trail entry — mandatory (blocks task state change on failure)
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_started', content: 'Work started on task' });
    } catch (trailErr) {
      console.error(`[trail] Failed to record trail entry for task:`, trailErr instanceof Error ? trailErr.message : trailErr);
      throw new Error('Task state change blocked: failed to record audit trail entry');
    }
  }

  async function updateProgress(taskId: string, percent: number, currentStep?: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET progress_percent = ?, current_step = ?, updated_at = NOW() WHERE id = ?",
      percent, currentStep ?? null, taskId
    );
    await addTaskMessage(taskId, 'progress_update', `Progress: ${percent}%${currentStep ? ` — ${currentStep}` : ''}`);
    // D3: Signed trail entry — mandatory (blocks task state change on failure)
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'progress_update', content: `Progress: ${percent}%${currentStep ? ` — ${currentStep}` : ''}`, metadata: { percent, currentStep } });
    } catch (trailErr) {
      console.error(`[trail] Failed to record trail entry for task:`, trailErr instanceof Error ? trailErr.message : trailErr);
      throw new Error('Task state change blocked: failed to record audit trail entry');
    }
  }

  async function requestClarification(taskId: string, question: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'clarification_needed', updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'clarification_request', question);
    // D3: Signed trail entry — mandatory (blocks task state change on failure)
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'clarification_requested', content: question });
    } catch (trailErr) {
      console.error(`[trail] Failed to record trail entry for task:`, trailErr instanceof Error ? trailErr.message : trailErr);
      throw new Error('Task state change blocked: failed to record audit trail entry');
    }
  }

  async function respondToClarification(taskId: string, answer: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'in_progress', updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'clarification_response', answer);
    // D3: Signed trail entry — mandatory (blocks task state change on failure)
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'clarification_responded', content: answer });
    } catch (trailErr) {
      console.error(`[trail] Failed to record trail entry for task:`, trailErr instanceof Error ? trailErr.message : trailErr);
      throw new Error('Task state change blocked: failed to record audit trail entry');
    }
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
    // D3: Signed trail entry — mandatory (blocks task state change on failure)
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_completed', content: 'Task completed', metadata: { hasArtifacts: (result.artifacts ?? []).length > 0 } });
    } catch (trailErr) {
      console.error(`[trail] Failed to record trail entry for task:`, trailErr instanceof Error ? trailErr.message : trailErr);
      throw new Error('Task state change blocked: failed to record audit trail entry');
    }
  }

  async function rateTask(taskId: string, qualityScore: number): Promise<{ paymentProcessed?: boolean; paymentFtc?: number; paymentTxId?: string }> {
    await db.run(
      "UPDATE community_delegated_tasks SET result_quality_score = ?, updated_at = NOW() WHERE id = ?",
      qualityScore, taskId
    );

    // Update avg quality on connection
    const task = await db.get<{ provider_hash: string; quality_linked_terms: string | null; service_listing_id: string | null; payment_status: string }>(
      'SELECT provider_hash, quality_linked_terms, service_listing_id, payment_status FROM community_delegated_tasks WHERE id = ?', taskId
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

      // Quality-based payment settlement
      if (task.quality_linked_terms && task.payment_status !== 'paid') {
        try {
          const terms = JSON.parse(task.quality_linked_terms) as {
            fullThreshold: number; fullPayFtc: number;
            partialThreshold: number; partialPayFtc: number;
          };

          let finalPayment = 0;
          if (qualityScore >= terms.fullThreshold) {
            finalPayment = terms.fullPayFtc;
          } else if (qualityScore >= terms.partialThreshold) {
            finalPayment = terms.partialPayFtc;
          }
          // Below partial threshold: no payment

          if (finalPayment > 0) {
            // Process payment via gateway
            const { createFCGatewayService } = await import('./fc-gateway-service.js');
            const gateway = await createFCGatewayService(db);
            const txResult = await gateway.processPayment({
              contactHash: task.provider_hash,
              amount: finalPayment,
              purpose: 'OTHR',
              nature: 'task-completion',
              goal: taskId,
            });

            const txId = typeof txResult === 'object' && txResult !== null ? (txResult as Record<string, unknown>).txId : null;
            await db.run(
              "UPDATE community_delegated_tasks SET payment_amount_ftc = ?, payment_status = 'paid', payment_tx_id = ?, updated_at = NOW() WHERE id = ?",
              finalPayment, txId ? String(txId) : null, taskId
            );

            // Update service listing stats
            if (task.service_listing_id) {
              const { createFCMarketplaceService } = await import('./fc-marketplace-service.js');
              const marketplace = await createFCMarketplaceService(db);
              await marketplace.recordCompletion(task.service_listing_id, qualityScore, finalPayment);
            }

            return { paymentProcessed: true, paymentFtc: finalPayment, paymentTxId: txId ? String(txId) : undefined };
          } else {
            await db.run(
              "UPDATE community_delegated_tasks SET payment_amount_ftc = 0, payment_status = 'paid', updated_at = NOW() WHERE id = ?",
              taskId
            );
          }
        } catch (payErr) {
          console.error('[task-delegation] Quality-based payment failed:', payErr instanceof Error ? payErr.message : payErr);
          await db.run(
            "UPDATE community_delegated_tasks SET payment_status = 'failed', updated_at = NOW() WHERE id = ?",
            taskId
          );
        }
      }
    }
    return {};
  }

  async function cancelTask(taskId: string, reason?: string): Promise<void> {
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'cancelled', updated_at = NOW() WHERE id = ?", taskId
    );
    await addTaskMessage(taskId, 'status_change', reason ?? 'Task cancelled');
    // D3: Signed trail entry — mandatory (blocks task state change on failure)
    try {
      await signingService.createTrailEntry({ taskId, entryType: 'task_cancelled', content: reason ?? 'Task cancelled' });
    } catch (trailErr) {
      console.error(`[trail] Failed to record trail entry for task:`, trailErr instanceof Error ? trailErr.message : trailErr);
      throw new Error('Task state change blocked: failed to record audit trail entry');
    }
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
