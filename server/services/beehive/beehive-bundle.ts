// ── Beehive — .anton Bundle Export ──────────────────────────────────────────
//
// Packages a concluded hive as a `.anton` (ZIP) file:
//   manifest.json                — spec-compliant package metadata
//   synthesis.md                 — the final synthesis text
//   contents/hive.json           — full hive metadata + governance
//   contents/participants.json   — joined participants + roles
//   contents/rounds.json         — round summaries + consensus progression
//   contents/contributions.json  — full reasoning trail
//   contents/dissents.json       — formal dissents (preserved)
//   contents/approvals.json      — who approved / dissented / abstained
//   contents/convergence.json    — how positions shifted across rounds
//   README.md                    — human-friendly overview
//
// The bundle type `hive-collaborative-output` is BEEHIVE-specific; it isn't
// in the global BUNDLE_TYPE_REGISTRY (no importer needed in v1 — these
// bundles are produced for sharing/archival, not re-import).

import AdmZip from 'adm-zip';
import type { DatabaseAdapter } from '../../db/database.js';
import { createBeehiveState } from './beehive-state.js';
import { createBeehiveDeliberation } from './beehive-deliberation.js';
import type { Hive, HiveOutput, HiveParticipant, DeliberationRound, HiveContribution } from './types.js';

interface BundleResult {
  buffer: Buffer;
  filename: string;
  byteSize: number;
}

export async function createBeehiveBundler(db: DatabaseAdapter) {
  const state = createBeehiveState(db);
  const deliberation = await createBeehiveDeliberation(db);

  /**
   * Build a `.anton` ZIP for a concluded hive. Throws if the hive isn't
   * concluded or has no output yet.
   */
  async function bundleHiveOutput(hiveId: string): Promise<BundleResult> {
    const fullState = await state.loadFullState(hiveId);
    if (!fullState) throw new Error('Hive not found');

    const { hive, participants, rounds, output } = fullState;
    if (!output) throw new Error('Hive has no output yet — conclude it first');

    const contributions = await deliberation.listContributions(hiveId);

    const filename = sanitizeFilename(`${hive.name}-${hive.id}.anton`);
    const manifest = buildManifest(hive, participants, output, rounds, contributions);

    const zip = new AdmZip();
    zip.addFile('manifest.json', toJsonBuffer(manifest));
    zip.addFile('synthesis.md', toBuffer(output.synthesis_text ?? '_(no synthesis text)_'));
    zip.addFile('README.md', toBuffer(buildReadme(hive, participants, output, contributions)));

    zip.addFile('contents/hive.json', toJsonBuffer({
      id: hive.id,
      name: hive.name,
      question: hive.question,
      description: hive.description,
      type: hive.type,
      status: hive.status,
      governance: hive.governance,
      created_by: hive.created_by,
      max_participants: hive.max_participants,
      ttl_hours: hive.ttl_hours,
      consensus_temperature_final: hive.consensus_temperature,
      created_at: hive.created_at,
      concluded_at: hive.concluded_at,
    }));

    zip.addFile('contents/participants.json', toJsonBuffer(
      participants.filter(p => p.invitation_status === 'joined').map(p => ({
        anton_contact_hash: p.anton_contact_hash,
        display_name: p.display_name,
        role: p.role,
        contribution_count: p.contribution_count,
        joined_at: p.joined_at,
      })),
    ));

    zip.addFile('contents/rounds.json', toJsonBuffer(
      rounds.map(r => ({
        round_number: r.round_number,
        phase: r.phase,
        summary: r.summary,
        consensus_temperature: r.consensus_temperature,
        contribution_count: r.contribution_count,
        started_at: r.started_at,
        ended_at: r.ended_at,
      })),
    ));

    zip.addFile('contents/contributions.json', toJsonBuffer(contributions));
    zip.addFile('contents/dissents.json', toJsonBuffer(output.dissents));
    zip.addFile('contents/approvals.json', toJsonBuffer(output.participant_approvals));
    zip.addFile('contents/convergence.json', toJsonBuffer(output.convergence_path));

    const buffer = zip.toBuffer();
    return { buffer, filename, byteSize: buffer.length };
  }

  return { bundleHiveOutput };
}

export type BeehiveBundler = Awaited<ReturnType<typeof createBeehiveBundler>>;

// ── Helpers ────────────────────────────────────────────────────────────────

function toJsonBuffer(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2), 'utf-8');
}

function toBuffer(value: string): Buffer {
  return Buffer.from(value, 'utf-8');
}

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

function buildManifest(
  hive: Hive,
  participants: HiveParticipant[],
  output: HiveOutput,
  rounds: DeliberationRound[],
  contributions: HiveContribution[],
) {
  const now = new Date().toISOString();
  const joined = participants.filter(p => p.invitation_status === 'joined');
  return {
    format_version: '1.0.0',
    bundle_type: 'hive-collaborative-output',
    package: {
      id: `com.openexpert.hive-collaborative-output.${hive.id}`,
      name: hive.name,
      version: '1.0.0',
      author: {
        name: participants.find(p => p.anton_contact_hash === hive.created_by)?.display_name ?? 'Unknown',
        organization: '',
        email: '',
        url: '',
      },
      license: 'Proprietary',
      created_at: hive.created_at,
      updated_at: hive.concluded_at ?? now,
      tags: ['beehive', hive.type, ...new Set(joined.map(p => p.role))],
      target_areas: [],
      target_roles: [],
      min_platform_version: '2.0.0',
      languages: ['en'],
      description: hive.description || hive.question.slice(0, 240),
    },
    hive: {
      id: hive.id,
      type: hive.type,
      consensus_mode: hive.governance.consensus_mode,
      output_format: output.output_type,
      participant_count: joined.length,
      round_count: rounds.length,
      contribution_count: contributions.length,
      dissent_count: output.dissents.length,
      consensus_temperature_final: hive.consensus_temperature,
    },
    contents: {
      hive_collaborative_outputs: 1,
      synthesis_documents: 1,
      contributions: contributions.length,
      participants: joined.length,
      rounds: rounds.length,
      dissents: output.dissents.length,
    },
    compatibility: { llm_providers: ['anthropic'] },
  };
}

function buildReadme(
  hive: Hive,
  participants: HiveParticipant[],
  output: HiveOutput,
  contributions: HiveContribution[],
): string {
  const joined = participants.filter(p => p.invitation_status === 'joined');
  const dissentBlock = output.dissents.length > 0
    ? `\n## Dissenting Positions\n\n${output.dissents.map(d => `### ${d.contributor_display_name}\n${d.content}`).join('\n\n')}\n`
    : '';

  return `# ${hive.name}

**Type:** ${hive.type}
**Concluded:** ${hive.concluded_at ?? '—'}
**Final consensus:** ${(hive.consensus_temperature * 100).toFixed(0)}%
**Participants:** ${joined.length}
**Total contributions:** ${contributions.length}
**Formal dissents:** ${output.dissents.length}

## Question

${hive.question}

${hive.description ? `## Context\n\n${hive.description}\n` : ''}

## Synthesis

See \`synthesis.md\`.
${dissentBlock}
## Files

- \`synthesis.md\` — the final synthesis (preserves dissent)
- \`manifest.json\` — bundle metadata
- \`contents/hive.json\` — hive configuration
- \`contents/participants.json\` — participants + roles
- \`contents/rounds.json\` — round-by-round summaries
- \`contents/contributions.json\` — full signed reasoning trail
- \`contents/dissents.json\` — preserved minority positions
- \`contents/approvals.json\` — who approved / dissented / abstained
- \`contents/convergence.json\` — how positions shifted across rounds

---
**Exported from ANTON BEEHIVE — multi-party reasoning protocol.**
`;
}
