/**
 * orchestrator-demo.ts
 *
 * Demo Mode for ANTON Orchestrator — synthetic "Meridian Bank" dataset.
 *
 * Provides:
 *   - Demo Mode: injects realistic synthetic signals as if Meridian Bank were live
 *   - Simulation Mode: retroactive analysis on a pre-built historical timeline
 *   - Accelerated Mode: time-compressed trust building (1 week of signals in minutes)
 *
 * Meridian Bank profile:
 *   - Nordic mid-tier universal bank, 12,000 employees, 3 jurisdictions
 *   - FCP team of 28, recently acquired a Lithuanian e-money institution
 *   - Under AMLR 2024 implementation pressure, DORA gap identified
 *   - High sanctions exposure from Baltic correspondent banking
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

import type { PlatformSignal } from './orchestrator-engine.js';

// ── Meridian Bank synthetic signal library ─────────────────────────────────────

interface DemoSignal {
  source: PlatformSignal['source'];
  summary: string;
  urgency: number;
  relevance: number;
  scenario_tag: string;
}

const MERIDIAN_SIGNALS: DemoSignal[] = [
  // Radar signals
  {
    source: 'radar', urgency: 0.92, relevance: 0.95,
    scenario_tag: 'amlr_deadline',
    summary: 'AMLR Art.42 Risk Assessment: Meridian must submit BWRA to FIN-FSA by Q3 2025 — current BWRA last updated 2022, covering pre-acquisition scope only',
  },
  {
    source: 'radar', urgency: 0.78, relevance: 0.88,
    scenario_tag: 'dora_gap',
    summary: 'DORA Art.11 ICT Business Continuity: Meridian Lithuania subsidiary has no documented ICT continuity plan — DORA compliance deadline Jan 2025',
  },
  {
    source: 'radar', urgency: 0.65, relevance: 0.80,
    scenario_tag: 'sanctions_update',
    summary: 'New EU sanctions package 14a: 23 additional Baltic-region entities listed — Meridian correspondent network requires re-screening within 48h',
  },
  {
    source: 'radar', urgency: 0.55, relevance: 0.72,
    scenario_tag: 'eba_guidance',
    summary: 'EBA Opinion on ML/TF risks in e-money: directly applies to recently acquired LT subsidiary — gap assessment against existing controls required',
  },
  // Deadline signals
  {
    source: 'deadline', urgency: 0.88, relevance: 0.90,
    scenario_tag: 'bwra_submission',
    summary: 'OVERDUE: BWRA annual review was due 45 days ago — FIN-FSA submitted information request; response window closes in 12 days',
  },
  {
    source: 'deadline', urgency: 0.75, relevance: 0.85,
    scenario_tag: 'board_report',
    summary: 'Deadline approaching: Board Risk Committee quarterly FCP report due in 8 days — last report did not cover Lithuanian acquisition risk',
  },
  {
    source: 'deadline', urgency: 0.60, relevance: 0.70,
    scenario_tag: 'training_cycle',
    summary: 'Deadline approaching: Annual AML training completion target — current completion rate 61%, target 95%, 3 weeks remaining',
  },
  // Quality signals
  {
    source: 'quality', urgency: 0.72, relevance: 0.80,
    scenario_tag: 'quality_decline',
    summary: 'Quality decline: Sanctions Advisory module average score dropped from 8.2 to 6.4 over last 14 days — 3 consultants using it, 2 flagged outputs as requiring heavy edits',
  },
  {
    source: 'quality', urgency: 0.45, relevance: 0.65,
    scenario_tag: 'gap_analysis_quality',
    summary: 'Quality signal: AMLR Gap Analysis module producing high-variance outputs — standard deviation 2.1 vs baseline 0.8, suggesting prompt tuning needed',
  },
  // Compliance signals
  {
    source: 'compliance', urgency: 0.82, relevance: 0.88,
    scenario_tag: 'open_violation',
    summary: 'Open compliance violation: KYC refresh for 847 high-risk customers overdue >60 days — Compliance Rule CR-204 breach, escalation threshold exceeded',
  },
  {
    source: 'compliance', urgency: 0.58, relevance: 0.74,
    scenario_tag: 'policy_gap',
    summary: 'Rule violation: Sanctions Screening Policy does not cover crypto-asset service providers — gap introduced by 2024 MiCA scope expansion',
  },
  // Workflow signals
  {
    source: 'workflow', urgency: 0.68, relevance: 0.75,
    scenario_tag: 'stalled_workflow',
    summary: 'Stalled workflow: "DORA ICT Risk Assessment — Lithuania" started 18 days ago, stuck at Step 4 (ICT asset inventory) — no progress in 9 days',
  },
  // Pattern signals
  {
    source: 'pattern', urgency: 0.50, relevance: 0.82,
    scenario_tag: 'usage_pattern',
    summary: 'Pattern detected: 3 senior consultants running Sanctions Advisory on Baltic correspondent relationships every Monday — candidate for weekly automation',
  },
  // Proactive signals
  {
    source: 'proactive', urgency: 0.70, relevance: 0.85,
    scenario_tag: 'proactive_insight',
    summary: 'Proactive insight: Cross-referencing open BWRA gaps with new AMLR Art.42 requirements identifies 7 unaddressed high-risk factors — recommend prioritised gap analysis',
  },
  // Post-acquisition risk signals (M&A integration — highest compliance priority)
  {
    source: 'compliance', urgency: 0.86, relevance: 0.92,
    scenario_tag: 'post_acq_cdd',
    summary: 'Post-acquisition CDD: 247 LitPay customers inherited without Meridian KYC standards — re-validation required within 30-day window (19 days remaining). AMLR Art.18 — ML/TF risk in acquired entity',
  },
  {
    source: 'compliance', urgency: 0.79, relevance: 0.88,
    scenario_tag: 'policy_consolidation',
    summary: 'Policy integration gap: LitPay AML Policy not yet aligned to Meridian Group Policy — dual policy risk for Lithuanian regulators. Board-approved consolidation plan required under Art.8 AMLR',
  },
  {
    source: 'compliance', urgency: 0.74, relevance: 0.85,
    scenario_tag: 'beneficial_ownership',
    summary: 'Beneficial ownership: LitPay acquisition surface reveals 3 corporate shareholders with beneficial ownership above 10% threshold not in FATF-compliant registry — urgent verification required before next supervisory review',
  },
];

// Historical simulation timeline (14 days of events, 2 events per day)
const SIMULATION_TIMELINE = [
  { day: -14, tag: 'amlr_deadline', urgency_delta: 0.0 },
  { day: -14, tag: 'policy_gap', urgency_delta: 0.0 },
  { day: -12, tag: 'board_report', urgency_delta: 0.1 },
  { day: -12, tag: 'dora_gap', urgency_delta: 0.0 },
  { day: -10, tag: 'quality_decline', urgency_delta: 0.0 },
  { day: -10, tag: 'usage_pattern', urgency_delta: 0.0 },
  { day: -8,  tag: 'bwra_submission', urgency_delta: 0.2 },
  { day: -8,  tag: 'sanctions_update', urgency_delta: 0.0 },
  { day: -6,  tag: 'open_violation', urgency_delta: 0.0 },
  { day: -6,  tag: 'stalled_workflow', urgency_delta: 0.0 },
  { day: -4,  tag: 'training_cycle', urgency_delta: 0.1 },
  { day: -4,  tag: 'eba_guidance', urgency_delta: 0.0 },
  { day: -2,  tag: 'gap_analysis_quality', urgency_delta: 0.0 },
  { day: -2,  tag: 'proactive_insight', urgency_delta: 0.0 },
];

// ── Demo Mode API ──────────────────────────────────────────────────────────────

export interface DemoState {
  mode: 'demo' | 'simulation' | 'accelerated' | 'off';
  persona: 'meridian';
  activated_at: string | null;
  signals_injected: number;
  simulation_day: number | null;
}

/** Return the demo state from the DB config field */
export async function getDemoState(db: DatabaseAdapter): Promise<DemoState> {
  try {
    const row = await db.get("SELECT demo_state FROM orchestrator_config WHERE id = 'default'") as
      { demo_state: string | null } | undefined;
    if (row?.demo_state) return JSON.parse(row.demo_state) as DemoState;
  } catch { /* column may not exist yet */ }
  return { mode: 'off', persona: 'meridian', activated_at: null, signals_injected: 0, simulation_day: null };
}

async function saveDemoState(db: DatabaseAdapter, state: DemoState): Promise<void> {
  try {
    await db.run("UPDATE orchestrator_config SET demo_state = ?, updated_at = NOW() WHERE id = 'default'", JSON.stringify(state));
  } catch { /* column may not exist */ }
}

/** Activate Demo Mode — inject Meridian Bank signals as live platform data */
export async function activateDemoMode(db: DatabaseAdapter, mode: DemoState['mode'] = 'demo'): Promise<{
  signals_injected: number;
  briefing_id_hint: string;
}> {
  const now = new Date();
  let signalsInjected = 0;
  const briefingHintId = randomUUID();

  // Inject signals appropriate for the mode
  const signals = mode === 'simulation'
    ? SIMULATION_TIMELINE.map(t => {
        const base = MERIDIAN_SIGNALS.find(s => s.scenario_tag === t.tag);
        if (!base) return null;
        const injectedAt = new Date(now.getTime() + t.day * 24 * 60 * 60 * 1000).toISOString();
        return { ...base, urgency: Math.min(1, base.urgency + t.urgency_delta), injectedAt };
      }).filter(Boolean)
    : MERIDIAN_SIGNALS;

  // Insert synthetic radar items
  for (const sig of signals) {
    if (!sig) continue;
    if (sig.source === 'radar') {
      try {
        await db.run(`
          INSERT INTO radar_items
            (id, title, urgency_score, relevance_score, item_type, status, summary, created_at, published_date)
          VALUES (?, ?, ?, ?, 'regulatory_update', 'new', ?, NOW(), CURRENT_DATE)
          ON CONFLICT DO NOTHING
        `,
          `demo-${sig.scenario_tag}-${randomUUID().substring(0, 8)}`,
          `[DEMO] ${sig.summary.substring(0, 120)}`,
          sig.urgency,
          sig.relevance,
          sig.summary,
        );
        signalsInjected++;
      } catch { /* table may not exist */ }
    }

    if (sig.source === 'deadline') {
      try {
        const dueOffset = sig.urgency > 0.85 ? -45 : sig.urgency > 0.7 ? 8 : 21;
        await db.run(`
          INSERT INTO deadlines
            (id, title, due_date, category, priority, status, created_at)
          VALUES (?, ?, CURRENT_DATE + ?::INTERVAL, 'compliance', 'high', 'in_progress', NOW())
          ON CONFLICT DO NOTHING
        `,
          `demo-${sig.scenario_tag}-${randomUUID().substring(0, 8)}`,
          `[DEMO] ${sig.summary.substring(0, 100)}`,
          `${dueOffset} days`,
        );
        signalsInjected++;
      } catch { /* table may not exist */ }
    }
  }

  const state: DemoState = {
    mode,
    persona: 'meridian',
    activated_at: now.toISOString(),
    signals_injected: signalsInjected,
    simulation_day: mode === 'simulation' ? -14 : null,
  };
  saveDemoState(db, state);

  return { signals_injected: signalsInjected, briefing_id_hint: briefingHintId };
}

/** Deactivate Demo Mode — remove all injected signals and reset state */
export async function deactivateDemoMode(db: DatabaseAdapter): Promise<{ cleaned: number }> {
  let cleaned = 0;
  // Use a transaction so cleanup is atomic — partial cleanup is worse than no cleanup
  try {
    await db.exec('BEGIN TRANSACTION');
    try {

      cleaned += r1.changes;
    } catch { /* table may not exist */ }
    try {
      const r2 = await db.run("DELETE FROM deadlines WHERE id LIKE 'demo-%'");
      cleaned += r2.changes;
    } catch { /* table may not exist */ }
    await db.exec('COMMIT');
  } catch (e) {
    try { await db.exec('ROLLBACK'); } catch { /* ignore */ }
    console.error('[orchestrator-demo] Deactivation cleanup failed — rolled back:', e);
  }

  saveDemoState(db, { mode: 'off', persona: 'meridian', activated_at: null, signals_injected: 0, simulation_day: null });
  return { cleaned };
}

/** Get the Meridian Bank persona description for system prompt injection */
export function getMeridianPersonaContext(): string {
  return `## DEMO MODE — Meridian Bank Persona

You are observing ANTON running for **Meridian Bank AS**, a Nordic mid-tier universal bank:
- **Size:** 12,000 employees, operations in Finland, Sweden, Lithuania
- **FCP Team:** 28 specialists (AML analysts, sanctions officers, DORA lead)
- **Recent event:** Acquired Vilnius-based e-money institution (LitPay) in Q2 2024
- **Key pressures:** AMLR 2024 implementation, DORA gaps in Lithuanian subsidiary, Baltic sanctions exposure
- **Regulatory relationship:** FIN-FSA primary supervisor, ECB indirect supervision, Bank of Lithuania for LitPay

When generating briefings and proposals, use this context to make recommendations specific and realistic for Meridian Bank.`;
}

/** Advance simulation by one day (Accelerated Mode) */
export function advanceSimulationDay(db: DatabaseAdapter): { day: number; done: boolean } {
  const state = getDemoState(db);
  if (state.mode !== 'simulation' && state.mode !== 'accelerated') {
    return { day: 0, done: true };
  }
  const currentDay = state.simulation_day ?? -14;
  const nextDay = currentDay + 1;
  const done = nextDay > 0;

  saveDemoState(db, { ...state, simulation_day: done ? 0 : nextDay });
  return { day: nextDay, done };
}
