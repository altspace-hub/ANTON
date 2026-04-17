// ── Missions — Grow CRM Bridge (spec v2 §13.3) ────────────────────────────
//
// Sales-style missions write CRM records (contacts, opportunities, signals)
// directly to the Grow tables instead of duplicating them in
// mission_data_rows. The `mission_id` column on each Grow table (added in
// migration 122) lets us filter "what did this mission produce" later
// without scraping created_by strings.
//
// The bridge is invoked from the mission executor when a task output has
// `output_type` ∈ { 'grow_lead', 'grow_opportunity', 'grow_signal' }.

import type { DatabaseAdapter } from '../../db/database.js';
import { randomUUID } from 'crypto';

export interface LeadInput {
  firstName: string;
  lastName: string;
  title?: string;
  email?: string;
  phone?: string;
  organisation?: { name: string; industry?: string; website?: string; size?: 'startup' | 'small' | 'medium' | 'large' | 'enterprise' };
  tags?: string[];
  source?: string;
  notes?: string;
  confidenceScore?: number;        // 0..1
}

export interface OpportunityInput {
  title: string;
  contactId?: string;              // existing grow_contacts.id
  organisationId?: string;         // existing grow_organisations.id
  stageId?: string;                // defaults to 'prospect'
  value?: number;
  currency?: string;
  probability?: number;            // 0..100
  expectedCloseDate?: string;      // YYYY-MM-DD
  description?: string;
  nextAction?: string;
  nextActionDate?: string;         // ISO timestamp
  tags?: string[];
}

export interface SignalInput {
  signalType: 'news' | 'regulatory' | 'market' | 'relationship' | 'engagement' | 'custom';
  title: string;
  description?: string;
  source?: string;
  sourceUrl?: string;
  affectedContacts?: string[];
  affectedOrganisations?: string[];
  recommendedAction?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
}

export interface MissionGrowOutputs {
  contacts: Array<{ id: string; first_name: string; last_name: string; email: string | null; organisation_id: string | null; created_at: string }>;
  opportunities: Array<{ id: string; title: string; stage_id: string; value: string | number | null; currency: string | null; created_at: string }>;
  signals: Array<{ id: string; signal_type: string; title: string; priority: string | null; status: string | null; detected_at: string }>;
}

export function createMissionGrowBridge(db: DatabaseAdapter) {
  const newId = (prefix: string): string => `${prefix}_${randomUUID().slice(0, 12)}`;

  // ── Lead capture (contact + optional organisation) ─────────────────────

  async function recordLead(missionId: string, taskId: string | null, input: LeadInput): Promise<{ contact_id: string; organisation_id: string | null }> {
    if (!input.firstName?.trim() || !input.lastName?.trim()) {
      throw new Error('Lead requires firstName and lastName');
    }

    let organisationId: string | null = null;
    if (input.organisation?.name) {
      // Idempotent on (name) — if an org with the same name already exists,
      // reuse it rather than creating duplicates.
      const existing = await db.get<{ id: string }>(
        `SELECT id FROM grow_organisations WHERE LOWER(name) = LOWER(?) LIMIT 1`,
        input.organisation.name,
      );
      if (existing) {
        organisationId = existing.id;
      } else {
        organisationId = newId('grow_org');
        await db.run(
          `INSERT INTO grow_organisations (id, name, industry, website, size)
           VALUES (?, ?, ?, ?, ?)`,
          organisationId, input.organisation.name,
          input.organisation.industry ?? null, input.organisation.website ?? null,
          input.organisation.size ?? null,
        );
      }
    }

    const contactId = newId('grow_contact');
    await db.run(
      `INSERT INTO grow_contacts
        (id, first_name, last_name, title, email, phone, organisation_id, tags, confidence_score, source, notes, created_by, mission_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      contactId,
      input.firstName.trim(), input.lastName.trim(),
      input.title ?? null, input.email ?? null, input.phone ?? null,
      organisationId,
      input.tags ?? [],
      input.confidenceScore ?? null,
      input.source ?? `mission:${missionId}`,
      input.notes ?? null,
      `mission:${missionId}`,
      missionId,
    );

    await logActivity(missionId, taskId, 'grow_lead_captured',
      `Lead captured: ${input.firstName} ${input.lastName}${input.organisation?.name ? ` @ ${input.organisation.name}` : ''}`,
      { contact_id: contactId, organisation_id: organisationId },
    );

    return { contact_id: contactId, organisation_id: organisationId };
  }

  // ── Opportunity creation ────────────────────────────────────────────────

  async function recordOpportunity(missionId: string, taskId: string | null, input: OpportunityInput): Promise<{ opportunity_id: string }> {
    if (!input.title?.trim()) throw new Error('Opportunity requires title');
    const oppId = newId('grow_opp');
    await db.run(
      `INSERT INTO grow_opportunities
        (id, title, contact_id, organisation_id, stage_id, value, currency, probability,
         expected_close_date, description, next_action, next_action_date, tags, created_by, mission_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      oppId, input.title.trim(),
      input.contactId ?? null, input.organisationId ?? null,
      input.stageId ?? 'prospect',
      input.value ?? null, input.currency ?? 'USD',
      input.probability ?? 50,
      input.expectedCloseDate ?? null,
      input.description ?? null,
      input.nextAction ?? null, input.nextActionDate ?? null,
      input.tags ?? [],
      `mission:${missionId}`,
      missionId,
    );
    await logActivity(missionId, taskId, 'grow_opportunity_created',
      `Opportunity created: ${input.title}${input.value != null ? ` (${input.value} ${input.currency ?? 'USD'})` : ''}`,
      { opportunity_id: oppId, stage_id: input.stageId ?? 'prospect' },
    );
    return { opportunity_id: oppId };
  }

  // ── Signal capture ──────────────────────────────────────────────────────

  async function recordSignal(missionId: string, taskId: string | null, input: SignalInput): Promise<{ signal_id: string }> {
    if (!input.title?.trim()) throw new Error('Signal requires title');
    const signalId = newId('grow_sig');
    await db.run(
      `INSERT INTO grow_signals
        (id, signal_type, title, description, source, source_url,
         affected_contacts, affected_organisations, recommended_action, priority, mission_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      signalId, input.signalType, input.title.trim(),
      input.description ?? null, input.source ?? null, input.sourceUrl ?? null,
      input.affectedContacts ?? [], input.affectedOrganisations ?? [],
      input.recommendedAction ?? null,
      input.priority ?? 'medium',
      missionId,
    );
    await logActivity(missionId, taskId, 'grow_signal_recorded',
      `Signal: ${input.title} [${input.signalType}, ${input.priority ?? 'medium'}]`,
      { signal_id: signalId, signal_type: input.signalType },
    );
    return { signal_id: signalId };
  }

  // ── Listing ─────────────────────────────────────────────────────────────

  async function listMissionGrowOutputs(missionId: string): Promise<MissionGrowOutputs> {
    const [contacts, opportunities, signals] = await Promise.all([
      db.all<{ id: string; first_name: string; last_name: string; email: string | null; organisation_id: string | null; created_at: string }>(
        `SELECT id, first_name, last_name, email, organisation_id, created_at
         FROM grow_contacts WHERE mission_id = ? ORDER BY created_at DESC`,
        missionId,
      ),
      db.all<{ id: string; title: string; stage_id: string; value: string | number | null; currency: string | null; created_at: string }>(
        `SELECT id, title, stage_id, value, currency, created_at
         FROM grow_opportunities WHERE mission_id = ? ORDER BY created_at DESC`,
        missionId,
      ),
      db.all<{ id: string; signal_type: string; title: string; priority: string | null; status: string | null; detected_at: string }>(
        `SELECT id, signal_type, title, priority, status, detected_at
         FROM grow_signals WHERE mission_id = ? ORDER BY detected_at DESC`,
        missionId,
      ),
    ]);
    return { contacts, opportunities, signals };
  }

  // ── Helper ──────────────────────────────────────────────────────────────

  async function logActivity(missionId: string, taskId: string | null, type: string, description: string, details: Record<string, unknown>): Promise<void> {
    await db.run(
      `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details)
       VALUES (?, ?, ?, ?, ?)`,
      missionId, taskId, type, description, JSON.stringify(details),
    );
  }

  return { recordLead, recordOpportunity, recordSignal, listMissionGrowOutputs };
}

export type MissionGrowBridge = ReturnType<typeof createMissionGrowBridge>;
