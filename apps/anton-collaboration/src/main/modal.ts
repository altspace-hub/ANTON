/**
 * modal.ts — the human-approval boundary for the COMMITTING agreement verbs
 * (proposeAgreement / acceptAgreement / counterAgreement). Mirrors the Agent Pay
 * modal abstraction: a committing verb may only proceed on an explicit human
 * Approve. Discovery + inquiry (TALK) commit to nothing and never reach here.
 *
 * Three drivers:
 *   - StubModalDriver  — deterministic test double (pre-programmed decisions).
 *   - CliModalDriver   — terminal y/N prompt (the standalone's JSON-RPC mode,
 *                        where stdin is free).
 *   - (deferred) a WebConfirmModalDriver for --mcp-stdio mode, where stdin/stdout
 *     are reserved for MCP — until then the gated verbs FAIL CLOSED in that mode.
 *
 * Fail-closed: if no driver is registered, a committing verb is rejected — a
 * human gate that isn't wired must never silently pass.
 */
import type { Interface as ReadlineInterface } from 'node:readline';

export type CollabModalKind = 'agreement_propose' | 'agreement_accept' | 'agreement_counter';

/** What the human sees + approves. Self-describing: the exact decision + terms +
 *  amount + counterparty the standalone is about to SIGN and become bound to. */
export interface CollabModalPayload {
  proposalId: string;
  kind: CollabModalKind;
  agentName: string;
  agentPairedAgo: string;
  /** The other party (their address / contactHash / portal address). */
  counterparty: string;
  counterpartyLabel?: string;
  decision: string;
  terms: string;
  /** Display FTC (amountMicroFtc / 1e6) + the exact base-unit string signed. */
  amountFtc: number;
  amountMicroFtc: string;
  agentNote?: string;
  expiresAtMs: number;
}

export type ModalDecision =
  | { kind: 'approve' }
  | { kind: 'reject'; reason: string };

export interface ModalDriver {
  /** Open the approval prompt for `payload`. Resolves with the human's decision.
   *  Must respect `payload.expiresAtMs` (resolve reject:'expired' past it). */
  promptForDecision(payload: CollabModalPayload): Promise<ModalDecision>;
}

// ── Stub (tests) ─────────────────────────────────────────────────────────────

type StubQueueEntry = ModalDecision | { kind: 'hang' };

export class StubModalDriver implements ModalDriver {
  private queue: StubQueueEntry[] = [];
  private calls: CollabModalPayload[] = [];

  queueApprove(): void { this.queue.push({ kind: 'approve' }); }
  queueReject(reason = 'user rejected'): void { this.queue.push({ kind: 'reject', reason }); }
  queueHang(): void { this.queue.push({ kind: 'hang' }); }

  invocations(): ReadonlyArray<CollabModalPayload> { return this.calls; }

  async promptForDecision(payload: CollabModalPayload): Promise<ModalDecision> {
    this.calls.push(payload);
    const next = this.queue.shift();
    if (!next) {
      throw new Error(
        `StubModalDriver.promptForDecision called for ${payload.proposalId} but no decision was queued.`,
      );
    }
    if (next.kind === 'hang') return new Promise<ModalDecision>(() => { /* never resolves */ });
    return next;
  }
}

// ── CLI (standalone, JSON-RPC mode) ──────────────────────────────────────────

/** A terminal y/N approval. The prompt prints the full agreement so the operator
 *  approves with eyes open. Honours expiry: if the deadline passes first, resolves
 *  reject:'expired'. The readline interface is injected so the standalone owns its
 *  lifecycle (and tests can drive it without a real TTY). */
export class CliModalDriver implements ModalDriver {
  constructor(
    private readonly rl: ReadlineInterface,
    private readonly out: (s: string) => void = (s) => process.stderr.write(s),
    private readonly now: () => number = () => Date.now(),
  ) {}

  promptForDecision(payload: CollabModalPayload): Promise<ModalDecision> {
    const verb = payload.kind === 'agreement_propose' ? 'PROPOSE'
      : payload.kind === 'agreement_accept' ? 'ACCEPT' : 'COUNTER';
    this.out('\n════════════════════════════════════════════════════════════════\n');
    this.out(` AGREEMENT ${verb} — human approval required\n`);
    this.out('════════════════════════════════════════════════════════════════\n');
    this.out(` Agent:        ${payload.agentName} (paired ${payload.agentPairedAgo})\n`);
    this.out(` Counterparty: ${payload.counterpartyLabel ?? payload.counterparty}\n`);
    this.out(` Decision:     ${payload.decision}\n`);
    this.out(` Terms:        ${payload.terms}\n`);
    this.out(` Amount:       ${payload.amountFtc} FTC (${payload.amountMicroFtc} µFTC)\n`);
    if (payload.agentNote) this.out(` Agent note:   ${payload.agentNote}\n`);
    this.out('────────────────────────────────────────────────────────────────\n');

    const remaining = payload.expiresAtMs - this.now();
    if (remaining <= 0) return Promise.resolve({ kind: 'reject', reason: 'expired' });

    return new Promise<ModalDecision>((resolve) => {
      let settled = false;
      const done = (d: ModalDecision): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(d);
      };
      const timer = setTimeout(() => done({ kind: 'reject', reason: 'expired' }), remaining);
      this.rl.question(' Approve this agreement? [y/N] ', (answer) => {
        const yes = /^\s*y(es)?\s*$/i.test(answer);
        done(yes ? { kind: 'approve' } : { kind: 'reject', reason: 'declined at terminal' });
      });
    });
  }
}
