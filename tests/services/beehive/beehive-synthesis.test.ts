/**
 * beehive-synthesis.test.ts — pure-function tests for the synthesis-stage
 * helpers (collectDissents, computeApprovals, buildConvergencePath).
 *
 * The full createBeehiveSynthesis() makes LLM calls; these helpers are
 * the deterministic core that drives the final synthesis output.
 */

import { describe, it, expect } from 'vitest';
import {
  collectDissents,
  computeApprovals,
  buildConvergencePath,
} from '../../../server/services/beehive/beehive-synthesis.js';
import type {
  HiveContribution,
  HiveParticipant,
  DeliberationRound,
} from '../../../server/services/beehive/types.js';

function makeContribution(over: Partial<HiveContribution> & Pick<HiveContribution, 'type' | 'contributor_hash' | 'content'>): HiveContribution {
  return {
    id: over.id ?? 'c_' + Math.random().toString(36).slice(2),
    hive_id: over.hive_id ?? 'h1',
    round: over.round ?? 1,
    contributor_hash: over.contributor_hash,
    type: over.type,
    content: over.content,
    confidence: over.confidence ?? 0.7,
    references_atoms: over.references_atoms ?? [],
    references_contributions: over.references_contributions ?? [],
    signature: over.signature ?? 'sig',
    created_at: over.created_at ?? new Date().toISOString(),
  };
}

function makeParticipant(over: Partial<HiveParticipant> & Pick<HiveParticipant, 'anton_contact_hash'>): HiveParticipant {
  return {
    id: over.id ?? 'p_' + Math.random().toString(36).slice(2),
    hive_id: over.hive_id ?? 'h1',
    anton_contact_hash: over.anton_contact_hash,
    display_name: over.display_name ?? `User ${over.anton_contact_hash.slice(-4)}`,
    role: over.role ?? 'participant',
    invitation_status: over.invitation_status ?? 'joined',
    status: over.status ?? 'active',
    joined_at: over.joined_at ?? null,
    left_at: over.left_at ?? null,
  };
}

function makeRound(over: Partial<DeliberationRound> & Pick<DeliberationRound, 'round_number' | 'phase'>): DeliberationRound {
  return {
    id: over.id ?? 'r_' + over.round_number,
    hive_id: over.hive_id ?? 'h1',
    round_number: over.round_number,
    phase: over.phase,
    started_at: over.started_at ?? null,
    closed_at: over.closed_at ?? null,
    consensus_temperature: over.consensus_temperature ?? null,
    summary: over.summary ?? null,
  };
}

describe('collectDissents', () => {
  it('returns only dissent contributions', () => {
    const contribs = [
      makeContribution({ type: 'opening', contributor_hash: 'h1', content: 'I think...' }),
      makeContribution({ type: 'dissent', contributor_hash: 'h2', content: 'I disagree because...' }),
      makeContribution({ type: 'evidence', contributor_hash: 'h3', content: 'See the data' }),
    ];
    const participants = [makeParticipant({ anton_contact_hash: 'h2', display_name: 'Bob' })];
    const dissents = collectDissents(contribs, participants);
    expect(dissents).toHaveLength(1);
    expect(dissents[0].contributor_hash).toBe('h2');
    expect(dissents[0].content).toBe('I disagree because...');
  });

  it('uses participant display name when available', () => {
    const dissents = collectDissents(
      [makeContribution({ type: 'dissent', contributor_hash: 'h_alice', content: 'No' })],
      [makeParticipant({ anton_contact_hash: 'h_alice', display_name: 'Alice' })],
    );
    expect(dissents[0].contributor_display_name).toBe('Alice');
  });

  it('falls back to last-12 chars of hash when participant unknown', () => {
    const dissents = collectDissents(
      [makeContribution({ type: 'dissent', contributor_hash: 'ANTON-XXXX-YYYY-ZZZZ-1234', content: 'No' })],
      [],
    );
    // slice(-12) of 'ANTON-XXXX-YYYY-ZZZZ-1234' is the last 12 chars
    expect(dissents[0].contributor_display_name).toBe('YY-ZZZZ-1234'.slice(-12));
    expect(dissents[0].contributor_display_name.length).toBe(12);
  });

  it('returns empty for no dissents', () => {
    expect(collectDissents([], [])).toEqual([]);
  });
});

describe('computeApprovals', () => {
  it('marks dissenters as dissented', () => {
    const out = computeApprovals(
      [makeContribution({ type: 'dissent', contributor_hash: 'h1', content: 'no' })],
      [makeParticipant({ anton_contact_hash: 'h1' })],
    );
    expect(out['h1']).toBe('dissented');
  });

  it('marks "approves" synthesis as approved', () => {
    const out = computeApprovals(
      [makeContribution({ type: 'synthesis', contributor_hash: 'h1', content: 'I approve this conclusion' })],
      [makeParticipant({ anton_contact_hash: 'h1' })],
    );
    expect(out['h1']).toBe('approved');
  });

  it('marks "approve" verb as approved', () => {
    const out = computeApprovals(
      [makeContribution({ type: 'synthesis', contributor_hash: 'h1', content: 'I approve the conclusion' })],
      [makeParticipant({ anton_contact_hash: 'h1' })],
    );
    expect(out['h1']).toBe('approved');
  });

  it('marks silent participants as abstained', () => {
    const out = computeApprovals(
      [],
      [makeParticipant({ anton_contact_hash: 'h_silent' })],
    );
    expect(out['h_silent']).toBe('abstained');
  });

  it('skips observers + non-joined participants', () => {
    const out = computeApprovals(
      [],
      [
        makeParticipant({ anton_contact_hash: 'h_obs', role: 'observer' }),
        makeParticipant({ anton_contact_hash: 'h_inv', invitation_status: 'invited' }),
        makeParticipant({ anton_contact_hash: 'h_left', invitation_status: 'left' }),
      ],
    );
    expect(out['h_obs']).toBeUndefined();
    expect(out['h_inv']).toBeUndefined();
    expect(out['h_left']).toBeUndefined();
  });

  it('dissent overrides approval if both present', () => {
    const out = computeApprovals(
      [
        makeContribution({ type: 'synthesis', contributor_hash: 'h1', content: 'approves' }),
        makeContribution({ type: 'dissent', contributor_hash: 'h1', content: 'no actually' }),
      ],
      [makeParticipant({ anton_contact_hash: 'h1' })],
    );
    expect(out['h1']).toBe('dissented');
  });
});

describe('buildConvergencePath', () => {
  it('returns one step per round, in order', () => {
    const rounds = [
      makeRound({ round_number: 1, phase: 'opening', summary: 'Opening', consensus_temperature: 0.3 }),
      makeRound({ round_number: 2, phase: 'evidence', summary: 'Evidence', consensus_temperature: 0.5 }),
      makeRound({ round_number: 3, phase: 'convergence', summary: 'Converging', consensus_temperature: 0.8 }),
    ];
    const path = buildConvergencePath(rounds, []);
    expect(path).toHaveLength(3);
    expect(path[0].round).toBe(1);
    expect(path[1].consensus_temperature).toBe(0.5);
    expect(path[2].summary).toBe('Converging');
  });

  it('shifted_positions surfaces unique revisers per round', () => {
    const rounds = [makeRound({ round_number: 1, phase: 'evidence' })];
    const contribs = [
      makeContribution({ type: 'revision', contributor_hash: 'h1', content: 'changed mind', round: 1 }),
      makeContribution({ type: 'revision', contributor_hash: 'h2', content: 'me too', round: 1 }),
      makeContribution({ type: 'revision', contributor_hash: 'h1', content: 'and again', round: 1 }),  // dup
    ];
    const path = buildConvergencePath(rounds, contribs);
    expect(path[0].shifted_positions.sort()).toEqual(['h1', 'h2']);
  });

  it('handles missing summary / consensus gracefully', () => {
    const rounds = [makeRound({ round_number: 1, phase: 'opening' })];
    const path = buildConvergencePath(rounds, []);
    expect(path[0].summary).toBe('');
    expect(path[0].consensus_temperature).toBe(0);
  });
});
