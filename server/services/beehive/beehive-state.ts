// ── Beehive Local State Persistence ─────────────────────────────────────────
// Pure data-access layer for Beehive sessions. No business logic, no AAP wire
// protocol — just SQL → typed objects in/out.

import type { DatabaseAdapter } from '../../db/database.js';
import type {
  Hive,
  HiveGovernance,
  HiveParticipant,
  DisclosurePolicy,
  DeliberationRound,
  HiveOutput,
  LocalHiveState,
  HiveStatus,
  HiveContribution,
  ContributionType,
  SharedAtom,
} from './types.js';

interface SessionRow {
  id: string;
  name: string;
  question: string;
  description: string | null;
  type: string;
  status: string;
  governance: unknown;
  created_by: string;
  max_participants: number;
  ttl_hours: number | null;
  current_round: number;
  consensus_temperature: string | number;
  created_at: string;
  concluded_at: string | null;
  updated_at: string;
}

interface ParticipantRow {
  id: number;
  hive_id: string;
  anton_contact_hash: string;
  display_name: string;
  role: string;
  disclosure_policy: unknown;
  invitation_status: string;
  status: string;
  contribution_count: number;
  invited_at: string;
  joined_at: string | null;
  last_active_at: string | null;
}

interface RoundRow {
  id: number;
  hive_id: string;
  round_number: number;
  phase: string;
  summary: string | null;
  consensus_temperature: string | number | null;
  contribution_count: number;
  started_at: string;
  ended_at: string | null;
}

interface ContributionRow {
  id: string;
  hive_id: string;
  round: number;
  contributor_hash: string;
  type: string;
  content: string;
  supporting_atoms: unknown;
  references_contributions: unknown;
  confidence: string | number;
  reasoning_trace: string | null;
  signature: string;
  sequence: string | number;
  created_at: string;
}

interface OutputRow {
  id: string;
  hive_id: string;
  output_type: string;
  synthesis_text: string | null;
  dissents: unknown;
  reasoning_trail: unknown;
  convergence_path: unknown;
  participant_approvals: unknown;
  output_file_path: string | null;
  quality_score: string | number | null;
  created_at: string;
}

function asJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function rowToHive(row: SessionRow): Hive {
  return {
    id: row.id,
    name: row.name,
    question: row.question,
    description: row.description,
    type: row.type as Hive['type'],
    status: row.status as HiveStatus,
    governance: asJson<HiveGovernance>(row.governance, {} as HiveGovernance),
    created_by: row.created_by,
    max_participants: row.max_participants,
    ttl_hours: row.ttl_hours,
    current_round: row.current_round,
    consensus_temperature: asNumber(row.consensus_temperature),
    created_at: row.created_at,
    concluded_at: row.concluded_at,
    updated_at: row.updated_at,
  };
}

function rowToParticipant(row: ParticipantRow): HiveParticipant {
  return {
    id: row.id,
    hive_id: row.hive_id,
    anton_contact_hash: row.anton_contact_hash,
    display_name: row.display_name,
    role: row.role as HiveParticipant['role'],
    disclosure_policy: asJson<DisclosurePolicy>(row.disclosure_policy, {} as DisclosurePolicy),
    invitation_status: row.invitation_status as HiveParticipant['invitation_status'],
    status: row.status as HiveParticipant['status'],
    contribution_count: row.contribution_count,
    invited_at: row.invited_at,
    joined_at: row.joined_at,
    last_active_at: row.last_active_at,
  };
}

function rowToRound(row: RoundRow): DeliberationRound {
  return {
    id: row.id,
    hive_id: row.hive_id,
    round_number: row.round_number,
    phase: row.phase as DeliberationRound['phase'],
    summary: row.summary,
    consensus_temperature: row.consensus_temperature == null ? null : asNumber(row.consensus_temperature),
    contribution_count: row.contribution_count,
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}

function rowToContribution(row: ContributionRow): HiveContribution {
  return {
    id: row.id,
    hive_id: row.hive_id,
    round: row.round,
    contributor_hash: row.contributor_hash,
    type: row.type as ContributionType,
    content: row.content,
    supporting_atoms: asJson<SharedAtom[]>(row.supporting_atoms, []),
    references_contributions: asJson<string[]>(row.references_contributions, []),
    confidence: asNumber(row.confidence, 0.5),
    reasoning_trace: row.reasoning_trace,
    signature: row.signature,
    sequence: asNumber(row.sequence),
    created_at: row.created_at,
  };
}

function rowToOutput(row: OutputRow): HiveOutput {
  return {
    id: row.id,
    hive_id: row.hive_id,
    output_type: row.output_type as HiveOutput['output_type'],
    synthesis_text: row.synthesis_text,
    dissents: asJson<HiveOutput['dissents']>(row.dissents, []),
    reasoning_trail: asJson<HiveOutput['reasoning_trail']>(row.reasoning_trail, []),
    convergence_path: asJson<HiveOutput['convergence_path']>(row.convergence_path, []),
    participant_approvals: asJson<HiveOutput['participant_approvals']>(row.participant_approvals, {}),
    output_file_path: row.output_file_path,
    quality_score: row.quality_score == null ? null : asNumber(row.quality_score),
    created_at: row.created_at,
  };
}

export function createBeehiveState(db: DatabaseAdapter) {

  async function insertHive(hive: Hive): Promise<void> {
    await db.run(
      `INSERT INTO beehive_sessions
        (id, name, question, description, type, status, governance,
         created_by, max_participants, ttl_hours, current_round, consensus_temperature,
         created_at, concluded_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      hive.id, hive.name, hive.question, hive.description, hive.type, hive.status,
      JSON.stringify(hive.governance), hive.created_by, hive.max_participants,
      hive.ttl_hours, hive.current_round, hive.consensus_temperature,
      hive.created_at, hive.concluded_at, hive.updated_at,
    );
  }

  async function getHive(id: string): Promise<Hive | null> {
    const row = await db.get<SessionRow>('SELECT * FROM beehive_sessions WHERE id = ?', id);
    return row ? rowToHive(row) : null;
  }

  async function listHives(filter?: { status?: HiveStatus | HiveStatus[]; createdBy?: string; limit?: number }): Promise<Hive[]> {
    const where: string[] = [];
    const args: unknown[] = [];
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      const placeholders = statuses.map(() => '?').join(', ');
      where.push(`status IN (${placeholders})`);
      args.push(...statuses);
    }
    if (filter?.createdBy) {
      where.push('created_by = ?');
      args.push(filter.createdBy);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    args.push(filter?.limit ?? 100);
    const rows = await db.all<SessionRow>(
      `SELECT * FROM beehive_sessions ${whereSql} ORDER BY created_at DESC LIMIT ?`,
      ...args,
    );
    return rows.map(rowToHive);
  }

  async function updateHiveStatus(id: string, status: HiveStatus, concludedAt?: string): Promise<void> {
    if (concludedAt) {
      await db.run(
        `UPDATE beehive_sessions SET status = ?, concluded_at = ?, updated_at = NOW() WHERE id = ?`,
        status, concludedAt, id,
      );
    } else {
      await db.run(
        `UPDATE beehive_sessions SET status = ?, updated_at = NOW() WHERE id = ?`,
        status, id,
      );
    }
  }

  async function updateConsensusTemperature(id: string, temperature: number, currentRound?: number): Promise<void> {
    if (currentRound !== undefined) {
      await db.run(
        `UPDATE beehive_sessions SET consensus_temperature = ?, current_round = ?, updated_at = NOW() WHERE id = ?`,
        temperature, currentRound, id,
      );
    } else {
      await db.run(
        `UPDATE beehive_sessions SET consensus_temperature = ?, updated_at = NOW() WHERE id = ?`,
        temperature, id,
      );
    }
  }

  async function addParticipant(hiveId: string, p: Omit<HiveParticipant, 'id' | 'hive_id' | 'invited_at' | 'joined_at' | 'last_active_at' | 'contribution_count'> & { joinedAt?: string }): Promise<HiveParticipant> {
    await db.run(
      `INSERT INTO beehive_participants
        (hive_id, anton_contact_hash, display_name, role, disclosure_policy,
         invitation_status, status, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      hiveId, p.anton_contact_hash, p.display_name, p.role,
      JSON.stringify(p.disclosure_policy), p.invitation_status, p.status, p.joinedAt ?? null,
    );
    const row = await db.get<ParticipantRow>(
      `SELECT * FROM beehive_participants WHERE hive_id = ? AND anton_contact_hash = ?`,
      hiveId, p.anton_contact_hash,
    );
    if (!row) throw new Error('Failed to load inserted participant');
    return rowToParticipant(row);
  }

  async function getParticipant(hiveId: string, contactHash: string): Promise<HiveParticipant | null> {
    const row = await db.get<ParticipantRow>(
      `SELECT * FROM beehive_participants WHERE hive_id = ? AND anton_contact_hash = ?`,
      hiveId, contactHash,
    );
    return row ? rowToParticipant(row) : null;
  }

  async function listParticipants(hiveId: string): Promise<HiveParticipant[]> {
    const rows = await db.all<ParticipantRow>(
      `SELECT * FROM beehive_participants WHERE hive_id = ? ORDER BY invited_at ASC`,
      hiveId,
    );
    return rows.map(rowToParticipant);
  }

  async function updateParticipantStatus(
    hiveId: string,
    contactHash: string,
    fields: { invitation_status?: HiveParticipant['invitation_status']; status?: HiveParticipant['status']; disclosure_policy?: DisclosurePolicy; joined_at?: string | null },
  ): Promise<void> {
    const sets: string[] = [];
    const args: unknown[] = [];
    if (fields.invitation_status !== undefined) { sets.push('invitation_status = ?'); args.push(fields.invitation_status); }
    if (fields.status !== undefined) { sets.push('status = ?'); args.push(fields.status); }
    if (fields.disclosure_policy !== undefined) { sets.push('disclosure_policy = ?'); args.push(JSON.stringify(fields.disclosure_policy)); }
    if (fields.joined_at !== undefined) { sets.push('joined_at = ?'); args.push(fields.joined_at); }
    if (sets.length === 0) return;
    sets.push('last_active_at = NOW()');
    args.push(hiveId, contactHash);
    await db.run(
      `UPDATE beehive_participants SET ${sets.join(', ')} WHERE hive_id = ? AND anton_contact_hash = ?`,
      ...args,
    );
  }

  async function listRounds(hiveId: string): Promise<DeliberationRound[]> {
    const rows = await db.all<RoundRow>(
      `SELECT * FROM beehive_rounds WHERE hive_id = ? ORDER BY round_number ASC`,
      hiveId,
    );
    return rows.map(rowToRound);
  }

  async function countContributions(hiveId: string): Promise<number> {
    const row = await db.get<{ c: number | string }>(
      `SELECT COUNT(*)::int AS c FROM beehive_contributions WHERE hive_id = ?`,
      hiveId,
    );
    return asNumber(row?.c ?? 0);
  }

  async function getOutput(hiveId: string): Promise<HiveOutput | null> {
    const row = await db.get<OutputRow>(
      `SELECT * FROM beehive_outputs WHERE hive_id = ?`,
      hiveId,
    );
    return row ? rowToOutput(row) : null;
  }

  async function loadFullState(hiveId: string): Promise<LocalHiveState | null> {
    const hive = await getHive(hiveId);
    if (!hive) return null;
    const [participants, rounds, contributions_count, output] = await Promise.all([
      listParticipants(hiveId),
      listRounds(hiveId),
      countContributions(hiveId),
      getOutput(hiveId),
    ]);
    return { hive, participants, rounds, contributions_count, output };
  }

  return {
    insertHive,
    getHive,
    listHives,
    updateHiveStatus,
    updateConsensusTemperature,
    addParticipant,
    getParticipant,
    listParticipants,
    updateParticipantStatus,
    listRounds,
    countContributions,
    getOutput,
    loadFullState,
    rowToContribution, // exported so future deliberation service can hydrate
  };
}

export type BeehiveState = ReturnType<typeof createBeehiveState>;
