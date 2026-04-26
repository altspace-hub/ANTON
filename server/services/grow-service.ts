import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface CreateContactInput {
  firstName: string;
  lastName: string;
  title?: string;
  email?: string;
  phone?: string;
  organisationId?: string;
  tags?: string[];
  confidenceScore?: number;
  source?: string;
  notes?: string;
  createdBy?: string;
}

interface UpdateContactInput {
  firstName?: string;
  lastName?: string;
  title?: string;
  email?: string;
  phone?: string;
  organisationId?: string;
  tags?: string[];
  confidenceScore?: number;
  source?: string;
  notes?: string;
  lastContactedAt?: string;
}

interface ContactFilters {
  search?: string;
  orgId?: string;
  limit?: number;
  offset?: number;
}

interface CreateOrganisationInput {
  name: string;
  industry?: string;
  size?: string;
  website?: string;
  headquarters?: string;
  regulatoryContext?: string;
  painPoints?: string;
  annualRevenue?: string;
  employeeCount?: number;
  tags?: string[];
  notes?: string;
}

interface UpdateOrganisationInput {
  name?: string;
  industry?: string;
  size?: string;
  website?: string;
  headquarters?: string;
  regulatoryContext?: string;
  painPoints?: string;
  annualRevenue?: string;
  employeeCount?: number;
  tags?: string[];
  notes?: string;
}

interface OrganisationFilters {
  search?: string;
  limit?: number;
  offset?: number;
}

interface CreateRelationshipInput {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  relationshipType: string;
  strength?: string;
  notes?: string;
}

interface CreateInteractionInput {
  contactId?: string;
  organisationId?: string;
  interactionType: string;
  subject?: string;
  notes?: string;
  sentiment?: string;
  followUpDate?: string;
  followUpAction?: string;
  interactionDate?: string;
}

interface CreateOpportunityInput {
  title: string;
  contactId?: string;
  organisationId?: string;
  stageId?: string;
  value?: number;
  currency?: string;
  probability?: number;
  expectedCloseDate?: string;
  nextAction?: string;
  nextActionDate?: string;
  description?: string;
  tags?: string[];
  createdBy?: string;
}

interface UpdateOpportunityInput {
  title?: string;
  contactId?: string;
  organisationId?: string;
  stageId?: string;
  value?: number;
  currency?: string;
  probability?: number;
  expectedCloseDate?: string;
  nextAction?: string;
  nextActionDate?: string;
  description?: string;
  tags?: string[];
  wonLostReason?: string;
}

interface OpportunityFilters {
  stageId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

interface CreateActivityInput {
  opportunityId?: string;
  contactId?: string;
  activityType: string;
  title: string;
  description?: string;
  dueDate?: string;
}

interface UpdateActivityInput {
  title?: string;
  description?: string;
  activityType?: string;
  dueDate?: string;
  status?: string;
}

interface ActivityFilters {
  status?: string;
  limit?: number;
  offset?: number;
}

interface CreateSignalInput {
  signalType: string;
  title: string;
  description?: string;
  source?: string;
  sourceUrl?: string;
  affectedContacts?: string[];
  affectedOrganisations?: string[];
  recommendedAction?: string;
  priority?: string;
}

interface UpdateSignalInput {
  status?: string;
  recommendedAction?: string;
  priority?: string;
}

interface SignalFilters {
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

interface CreateBriefingInput {
  briefingType: string;
  title: string;
  content: string;
  signalsIncluded?: string[];
}

// ── Service ─────────────────────────────────────────────────────────────────

export async function createGrowService(db: DatabaseAdapter) {

  // ── Contacts ──────────────────────────────────────────────────────────

  async function createContact(data: CreateContactInput) {
    const id = randomUUID();
    await db.run(
      `INSERT INTO grow_contacts (id, first_name, last_name, title, email, phone, organisation_id, tags, confidence_score, source, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.firstName,
      data.lastName,
      data.title ?? null,
      data.email ?? null,
      data.phone ?? null,
      data.organisationId ?? null,
      data.tags ?? [],
      data.confidenceScore ?? null,
      data.source ?? null,
      data.notes ?? null,
      data.createdBy ?? 'solo'
    );
    return id;
  }

  async function getContact(id: string) {
    return await db.get(
      `SELECT c.*, o.name AS organisation_name, o.industry AS organisation_industry
       FROM grow_contacts c
       LEFT JOIN grow_organisations o ON c.organisation_id = o.id
       WHERE c.id = ?`,
      id
    );
  }

  async function listContacts(filters?: ContactFilters) {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.search) {
      conditions.push(`(c.first_name ILIKE ? OR c.last_name ILIKE ? OR c.email ILIKE ?)`);
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }
    if (filters?.orgId) {
      conditions.push(`c.organisation_id = ?`);
      params.push(filters.orgId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    return await db.all(
      `SELECT c.*, o.name AS organisation_name
       FROM grow_contacts c
       LEFT JOIN grow_organisations o ON c.organisation_id = o.id
       ${where}
       ORDER BY c.updated_at DESC
       LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
  }

  async function updateContact(id: string, data: UpdateContactInput) {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (data.firstName !== undefined) { sets.push('first_name = ?'); params.push(data.firstName); }
    if (data.lastName !== undefined) { sets.push('last_name = ?'); params.push(data.lastName); }
    if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title); }
    if (data.email !== undefined) { sets.push('email = ?'); params.push(data.email); }
    if (data.phone !== undefined) { sets.push('phone = ?'); params.push(data.phone); }
    if (data.organisationId !== undefined) { sets.push('organisation_id = ?'); params.push(data.organisationId); }
    if (data.tags !== undefined) { sets.push('tags = ?'); params.push(data.tags); }
    if (data.confidenceScore !== undefined) { sets.push('confidence_score = ?'); params.push(data.confidenceScore); }
    if (data.source !== undefined) { sets.push('source = ?'); params.push(data.source); }
    if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes); }
    if (data.lastContactedAt !== undefined) { sets.push('last_contacted_at = ?'); params.push(data.lastContactedAt); }

    if (sets.length === 0) return;

    sets.push('updated_at = NOW()');
    await db.run(
      `UPDATE grow_contacts SET ${sets.join(', ')} WHERE id = ?`,
      ...params, id
    );
  }

  async function deleteContact(id: string) {
    await db.run('DELETE FROM grow_contacts WHERE id = ?', id);
  }

  // ── Organisations ─────────────────────────────────────────────────────

  async function createOrganisation(data: CreateOrganisationInput) {
    const id = randomUUID();
    await db.run(
      `INSERT INTO grow_organisations (id, name, industry, size, website, headquarters, regulatory_context, pain_points, annual_revenue, employee_count, tags, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.name,
      data.industry ?? null,
      data.size ?? null,
      data.website ?? null,
      data.headquarters ?? null,
      data.regulatoryContext ?? null,
      data.painPoints ?? null,
      data.annualRevenue ?? null,
      data.employeeCount ?? null,
      data.tags ?? [],
      data.notes ?? null
    );
    return id;
  }

  async function getOrganisation(id: string) {
    const org = await db.get(
      `SELECT o.*,
              (SELECT COUNT(*) FROM grow_contacts WHERE organisation_id = o.id) AS contact_count
       FROM grow_organisations o
       WHERE o.id = ?`,
      id
    );
    return org;
  }

  async function listOrganisations(filters?: OrganisationFilters) {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.search) {
      conditions.push(`(o.name ILIKE ? OR o.industry ILIKE ?)`);
      const term = `%${filters.search}%`;
      params.push(term, term);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    return await db.all(
      `SELECT o.*,
              (SELECT COUNT(*) FROM grow_contacts WHERE organisation_id = o.id) AS contact_count
       FROM grow_organisations o
       ${where}
       ORDER BY o.updated_at DESC
       LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
  }

  async function updateOrganisation(id: string, data: UpdateOrganisationInput) {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
    if (data.industry !== undefined) { sets.push('industry = ?'); params.push(data.industry); }
    if (data.size !== undefined) { sets.push('size = ?'); params.push(data.size); }
    if (data.website !== undefined) { sets.push('website = ?'); params.push(data.website); }
    if (data.headquarters !== undefined) { sets.push('headquarters = ?'); params.push(data.headquarters); }
    if (data.regulatoryContext !== undefined) { sets.push('regulatory_context = ?'); params.push(data.regulatoryContext); }
    if (data.painPoints !== undefined) { sets.push('pain_points = ?'); params.push(data.painPoints); }
    if (data.annualRevenue !== undefined) { sets.push('annual_revenue = ?'); params.push(data.annualRevenue); }
    if (data.employeeCount !== undefined) { sets.push('employee_count = ?'); params.push(data.employeeCount); }
    if (data.tags !== undefined) { sets.push('tags = ?'); params.push(data.tags); }
    if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes); }

    if (sets.length === 0) return;

    sets.push('updated_at = NOW()');
    await db.run(
      `UPDATE grow_organisations SET ${sets.join(', ')} WHERE id = ?`,
      ...params, id
    );
  }

  async function deleteOrganisation(id: string) {
    await db.run('DELETE FROM grow_organisations WHERE id = ?', id);
  }

  // ── Relationships ─────────────────────────────────────────────────────

  async function createRelationship(data: CreateRelationshipInput) {
    const id = randomUUID();
    await db.run(
      `INSERT INTO grow_relationships (id, from_type, from_id, to_type, to_id, relationship_type, strength, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.fromType,
      data.fromId,
      data.toType,
      data.toId,
      data.relationshipType,
      data.strength ?? 'medium',
      data.notes ?? null
    );
    return id;
  }

  async function listRelationships(entityType: string, entityId: string) {
    return await db.all(
      `SELECT * FROM grow_relationships
       WHERE (from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?)
       ORDER BY created_at DESC`,
      entityType, entityId, entityType, entityId
    );
  }

  async function deleteRelationship(id: string) {
    await db.run('DELETE FROM grow_relationships WHERE id = ?', id);
  }

  // ── Interactions ──────────────────────────────────────────────────────

  async function createInteraction(data: CreateInteractionInput) {
    const id = randomUUID();
    await db.run(
      `INSERT INTO grow_interactions (id, contact_id, organisation_id, interaction_type, subject, notes, sentiment, follow_up_date, follow_up_action, interaction_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.contactId ?? null,
      data.organisationId ?? null,
      data.interactionType,
      data.subject ?? null,
      data.notes ?? null,
      data.sentiment ?? null,
      data.followUpDate ?? null,
      data.followUpAction ?? null,
      data.interactionDate ?? new Date().toISOString()
    );

    // Update last_contacted_at on the contact
    if (data.contactId) {
      await db.run(
        `UPDATE grow_contacts SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = ?`,
        data.contactId
      );
    }

    return id;
  }

  async function listInteractions(contactId?: string, orgId?: string) {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (contactId) {
      conditions.push('i.contact_id = ?');
      params.push(contactId);
    }
    if (orgId) {
      conditions.push('i.organisation_id = ?');
      params.push(orgId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return await db.all(
      `SELECT i.*,
              c.first_name AS contact_first_name, c.last_name AS contact_last_name,
              o.name AS organisation_name
       FROM grow_interactions i
       LEFT JOIN grow_contacts c ON i.contact_id = c.id
       LEFT JOIN grow_organisations o ON i.organisation_id = o.id
       ${where}
       ORDER BY i.interaction_date DESC
       LIMIT 200`,
      ...params
    );
  }

  async function getInteraction(id: string) {
    return await db.get(
      `SELECT i.*,
              c.first_name AS contact_first_name, c.last_name AS contact_last_name,
              o.name AS organisation_name
       FROM grow_interactions i
       LEFT JOIN grow_contacts c ON i.contact_id = c.id
       LEFT JOIN grow_organisations o ON i.organisation_id = o.id
       WHERE i.id = ?`,
      id
    );
  }

  // ── Pipeline ──────────────────────────────────────────────────────────

  async function listPipelineStages() {
    return await db.all(
      `SELECT * FROM grow_pipeline_stages ORDER BY sort_order ASC`
    );
  }

  async function createOpportunity(data: CreateOpportunityInput) {
    const id = randomUUID();
    await db.run(
      `INSERT INTO grow_opportunities (id, title, contact_id, organisation_id, stage_id, value, currency, probability, expected_close_date, next_action, next_action_date, description, tags, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.title,
      data.contactId ?? null,
      data.organisationId ?? null,
      data.stageId ?? 'prospect',
      data.value ?? null,
      data.currency ?? 'USD',
      data.probability ?? 50,
      data.expectedCloseDate ?? null,
      data.nextAction ?? null,
      data.nextActionDate ?? null,
      data.description ?? null,
      data.tags ?? [],
      data.createdBy ?? 'solo'
    );
    return id;
  }

  async function getOpportunity(id: string) {
    return await db.get(
      `SELECT op.*,
              c.first_name AS contact_first_name, c.last_name AS contact_last_name, c.email AS contact_email,
              o.name AS organisation_name,
              ps.name AS stage_name, ps.color AS stage_color
       FROM grow_opportunities op
       LEFT JOIN grow_contacts c ON op.contact_id = c.id
       LEFT JOIN grow_organisations o ON op.organisation_id = o.id
       LEFT JOIN grow_pipeline_stages ps ON op.stage_id = ps.id
       WHERE op.id = ?`,
      id
    );
  }

  async function listOpportunities(filters?: OpportunityFilters) {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.stageId) {
      conditions.push('op.stage_id = ?');
      params.push(filters.stageId);
    }
    if (filters?.search) {
      conditions.push(`(op.title ILIKE ? OR o.name ILIKE ?)`);
      const term = `%${filters.search}%`;
      params.push(term, term);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    return await db.all(
      `SELECT op.*,
              c.first_name AS contact_first_name, c.last_name AS contact_last_name,
              o.name AS organisation_name,
              ps.name AS stage_name, ps.color AS stage_color
       FROM grow_opportunities op
       LEFT JOIN grow_contacts c ON op.contact_id = c.id
       LEFT JOIN grow_organisations o ON op.organisation_id = o.id
       LEFT JOIN grow_pipeline_stages ps ON op.stage_id = ps.id
       ${where}
       ORDER BY op.updated_at DESC
       LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
  }

  async function updateOpportunity(id: string, data: UpdateOpportunityInput) {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title); }
    if (data.contactId !== undefined) { sets.push('contact_id = ?'); params.push(data.contactId); }
    if (data.organisationId !== undefined) { sets.push('organisation_id = ?'); params.push(data.organisationId); }
    if (data.stageId !== undefined) { sets.push('stage_id = ?'); params.push(data.stageId); }
    if (data.value !== undefined) { sets.push('value = ?'); params.push(data.value); }
    if (data.currency !== undefined) { sets.push('currency = ?'); params.push(data.currency); }
    if (data.probability !== undefined) { sets.push('probability = ?'); params.push(data.probability); }
    if (data.expectedCloseDate !== undefined) { sets.push('expected_close_date = ?'); params.push(data.expectedCloseDate); }
    if (data.nextAction !== undefined) { sets.push('next_action = ?'); params.push(data.nextAction); }
    if (data.nextActionDate !== undefined) { sets.push('next_action_date = ?'); params.push(data.nextActionDate); }
    if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description); }
    if (data.tags !== undefined) { sets.push('tags = ?'); params.push(data.tags); }
    if (data.wonLostReason !== undefined) { sets.push('won_lost_reason = ?'); params.push(data.wonLostReason); }

    if (sets.length === 0) return;

    sets.push('updated_at = NOW()');
    await db.run(
      `UPDATE grow_opportunities SET ${sets.join(', ')} WHERE id = ?`,
      ...params, id
    );
  }

  async function moveOpportunity(id: string, stageId: string) {
    await db.run(
      `UPDATE grow_opportunities SET stage_id = ?, updated_at = NOW() WHERE id = ?`,
      stageId, id
    );
  }

  async function getPipelineSummary() {
    return await db.all(
      `SELECT ps.id, ps.name, ps.color, ps.sort_order, ps.is_won, ps.is_lost,
              COUNT(op.id) AS opportunity_count,
              COALESCE(SUM(op.value), 0) AS total_value,
              COALESCE(AVG(op.probability), 0) AS avg_probability
       FROM grow_pipeline_stages ps
       LEFT JOIN grow_opportunities op ON op.stage_id = ps.id
       GROUP BY ps.id, ps.name, ps.color, ps.sort_order, ps.is_won, ps.is_lost
       ORDER BY ps.sort_order ASC`
    );
  }

  // ── Activities ────────────────────────────────────────────────────────

  async function createActivity(data: CreateActivityInput) {
    const id = randomUUID();
    await db.run(
      `INSERT INTO grow_activities (id, opportunity_id, contact_id, activity_type, title, description, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.opportunityId ?? null,
      data.contactId ?? null,
      data.activityType,
      data.title,
      data.description ?? null,
      data.dueDate ?? null
    );
    return id;
  }

  async function listActivities(opportunityId?: string, filters?: ActivityFilters) {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opportunityId) {
      conditions.push('a.opportunity_id = ?');
      params.push(opportunityId);
    }
    if (filters?.status) {
      conditions.push('a.status = ?');
      params.push(filters.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    return await db.all(
      `SELECT a.*,
              c.first_name AS contact_first_name, c.last_name AS contact_last_name,
              op.title AS opportunity_title
       FROM grow_activities a
       LEFT JOIN grow_contacts c ON a.contact_id = c.id
       LEFT JOIN grow_opportunities op ON a.opportunity_id = op.id
       ${where}
       ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC
       LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
  }

  async function updateActivity(id: string, data: UpdateActivityInput) {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title); }
    if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description); }
    if (data.activityType !== undefined) { sets.push('activity_type = ?'); params.push(data.activityType); }
    if (data.dueDate !== undefined) { sets.push('due_date = ?'); params.push(data.dueDate); }
    if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status); }

    if (sets.length === 0) return;

    await db.run(
      `UPDATE grow_activities SET ${sets.join(', ')} WHERE id = ?`,
      ...params, id
    );
  }

  async function completeActivity(id: string) {
    await db.run(
      `UPDATE grow_activities SET status = 'completed', completed_at = NOW() WHERE id = ?`,
      id
    );
  }

  // ── Intelligence: Signals ─────────────────────────────────────────────

  async function createSignal(data: CreateSignalInput) {
    const id = randomUUID();
    await db.run(
      `INSERT INTO grow_signals (id, signal_type, title, description, source, source_url, affected_contacts, affected_organisations, recommended_action, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.signalType,
      data.title,
      data.description ?? null,
      data.source ?? null,
      data.sourceUrl ?? null,
      data.affectedContacts ?? [],
      data.affectedOrganisations ?? [],
      data.recommendedAction ?? null,
      data.priority ?? 'medium'
    );
    return id;
  }

  async function listSignals(filters?: SignalFilters) {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.type) {
      conditions.push('signal_type = ?');
      params.push(filters.type);
    }
    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    return await db.all(
      `SELECT * FROM grow_signals
       ${where}
       ORDER BY
         CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
         detected_at DESC
       LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
  }

  async function updateSignal(id: string, data: UpdateSignalInput) {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status); }
    if (data.recommendedAction !== undefined) { sets.push('recommended_action = ?'); params.push(data.recommendedAction); }
    if (data.priority !== undefined) { sets.push('priority = ?'); params.push(data.priority); }

    if (sets.length === 0) return;

    await db.run(
      `UPDATE grow_signals SET ${sets.join(', ')} WHERE id = ?`,
      ...params, id
    );
  }

  // ── Intelligence: Briefings ───────────────────────────────────────────

  async function createBriefing(data: CreateBriefingInput) {
    const id = randomUUID();
    await db.run(
      `INSERT INTO grow_briefings (id, briefing_type, title, content, signals_included)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      data.briefingType,
      data.title,
      data.content,
      data.signalsIncluded ?? []
    );
    return id;
  }

  async function listBriefings(type?: string) {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (type) {
      conditions.push('briefing_type = ?');
      params.push(type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return await db.all(
      `SELECT * FROM grow_briefings ${where} ORDER BY generated_at DESC LIMIT 50`,
      ...params
    );
  }

  async function getBriefing(id: string) {
    return await db.get('SELECT * FROM grow_briefings WHERE id = ?', id);
  }

  // ── Dashboard Stats ──────────────────────────────────────────────────

  async function getDashboardStats() {
    const [contacts, organisations, opportunities, openSignals, activities, recentInteractions] = await Promise.all([
      db.get('SELECT COUNT(*) AS count FROM grow_contacts') as Promise<{ count: number } | undefined>,
      db.get('SELECT COUNT(*) AS count FROM grow_organisations') as Promise<{ count: number } | undefined>,
      db.get(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(value), 0) AS total_value,
                COALESCE(AVG(probability), 0) AS avg_probability
         FROM grow_opportunities
         WHERE stage_id NOT IN (SELECT id FROM grow_pipeline_stages WHERE is_won = TRUE OR is_lost = TRUE)`
      ) as Promise<{ count: number; total_value: number; avg_probability: number } | undefined>,
      db.get(
        `SELECT COUNT(*) AS count FROM grow_signals WHERE status IN ('new', 'reviewed')`
      ) as Promise<{ count: number } | undefined>,
      db.get(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'pending' AND due_date < NOW()) AS overdue
         FROM grow_activities WHERE status = 'pending'`
      ) as Promise<{ total: number; overdue: number } | undefined>,
      db.get(
        `SELECT COUNT(*) AS count FROM grow_interactions WHERE interaction_date > NOW() - INTERVAL '7 days'`
      ) as Promise<{ count: number } | undefined>,
    ]);

    return {
      contacts: contacts?.count ?? 0,
      organisations: organisations?.count ?? 0,
      openOpportunities: opportunities?.count ?? 0,
      pipelineValue: opportunities?.total_value ?? 0,
      avgProbability: opportunities?.avg_probability ?? 0,
      openSignals: openSignals?.count ?? 0,
      pendingActivities: activities?.total ?? 0,
      overdueActivities: activities?.overdue ?? 0,
      recentInteractions: recentInteractions?.count ?? 0,
    };
  }

  return {
    // Contacts
    createContact,
    getContact,
    listContacts,
    updateContact,
    deleteContact,
    // Organisations
    createOrganisation,
    getOrganisation,
    listOrganisations,
    updateOrganisation,
    deleteOrganisation,
    // Relationships
    createRelationship,
    listRelationships,
    deleteRelationship,
    // Interactions
    createInteraction,
    listInteractions,
    getInteraction,
    // Pipeline
    listPipelineStages,
    createOpportunity,
    getOpportunity,
    listOpportunities,
    updateOpportunity,
    moveOpportunity,
    getPipelineSummary,
    // Activities
    createActivity,
    listActivities,
    updateActivity,
    completeActivity,
    // Intelligence
    createSignal,
    listSignals,
    updateSignal,
    createBriefing,
    listBriefings,
    getBriefing,
    // Dashboard
    getDashboardStats,
  };
}

export type GrowService = Awaited<ReturnType<typeof createGrowService>>;
