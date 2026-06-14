/**
 * modal.ts — confirmation-modal abstraction.
 *
 * The modal is THE safety boundary of Agent Pay (see ANTON_AGENT_PAY_SPEC.md §2 + §7).
 * Every proposed payment must surface a real OS-native window the agent
 * cannot spoof, showing the recipient + amount + fee + agent identity,
 * and only proceed on an explicit Approve click.
 *
 * This file defines the interface. Two implementations:
 *   - ElectronModalDriver (src/main/electron-modal.ts) — real Electron
 *     BrowserWindow with `frame: false`, `alwaysOnTop: true`, contextIsolation.
 *     Loaded at runtime by main.ts; never used in tests.
 *   - StubModalDriver (this file) — deterministic test double. Tests
 *     pre-program the decision it will return when the server calls
 *     promptForDecision(). Lets the entire JSON-RPC + proposal pipeline
 *     be exercised under vitest without Electron.
 *
 * The interface is intentionally narrow: ask for a decision on a
 * payload, get a decision back. Everything else (window placement,
 * passphrase prompt, biometric path) is the implementation's concern.
 */
import type { ModalDecision, ModalPayload } from '../shared/ipc-types.js';

export interface ModalDriver {
  /** Open the confirmation modal for `payload`. Resolves with the
   *  user's decision (`approve` or `reject` with a reason). Must
   *  respect `payload.expiresAtMs` — if the user hasn't decided by
   *  then, resolve with `{ kind: 'reject', reason: 'expired' }`.
   *
   *  Concurrency: OS-WINDOW implementations (Electron) must serialise modal
   *  display — showing two payment windows at once would confuse the user, and
   *  the caller (server.ts) does NOT queue. URL-based drivers (the standalone
   *  WebConfirmModalDriver) MAY instead run parallel pending confirmations,
   *  since each proposal gets its own distinct, self-describing confirm page;
   *  such drivers should bound the number of simultaneously-outstanding
   *  confirmations instead. */
  promptForDecision(payload: ModalPayload): Promise<ModalDecision>;
}

/** Test double — pre-programmed decisions. Each `promptForDecision`
 *  call dequeues the next scripted entry (FIFO). Two queue entry
 *  kinds: a real `ModalDecision`, or `{ kind: 'hang' }` which makes
 *  the promise never resolve (used to simulate "the user hasn't
 *  decided yet" while the test exercises cancelProposal etc).
 *
 *  If the queue is empty, the call rejects so tests get a clear
 *  "modal was opened but the test forgot to script a response"
 *  signal rather than an indefinite hang.
 *
 *  Use:
 *      const m = new StubModalDriver();
 *      m.queueDecision({ kind: 'approve' });
 *      // ... call proposePayment + observe state transition ...
 *
 *  Hang mode:
 *      m.queueHang();
 *      // ... proposePayment leaves the proposal pending ...
 *      // ... call cancelProposal etc ...
 */
type StubQueueEntry = ModalDecision | { kind: 'hang' };

export class StubModalDriver implements ModalDriver {
  private queue: StubQueueEntry[] = [];
  private calls: ModalPayload[] = [];

  queueDecision(d: ModalDecision): void {
    this.queue.push(d);
  }

  /** Queue a never-resolving response for the next modal open. Lets
   *  tests exercise the "still pending" branch (cancel, expiry, etc)
   *  without racing the modal flow. */
  queueHang(): void {
    this.queue.push({ kind: 'hang' });
  }

  /** Test helper — every payload the modal was asked about, in order. */
  invocations(): ReadonlyArray<ModalPayload> {
    return this.calls;
  }

  async promptForDecision(payload: ModalPayload): Promise<ModalDecision> {
    this.calls.push(payload);
    const next = this.queue.shift();
    if (!next) {
      throw new Error(
        `StubModalDriver.promptForDecision called for proposal ${payload.proposalId} `
        + `but no decision was queued. Did the test forget queueDecision(...)?`,
      );
    }
    if (next.kind === 'hang') {
      return new Promise<ModalDecision>(() => { /* intentionally never resolves */ });
    }
    return next;
  }
}

/** Lazy holder for the active driver. main.ts sets the Electron
 *  driver at app startup; tests inject the stub directly into the
 *  server. */
let activeDriver: ModalDriver | null = null;

export function setActiveModalDriver(d: ModalDriver): void {
  activeDriver = d;
}

export function getActiveModalDriver(): ModalDriver {
  if (!activeDriver) {
    throw new Error(
      'No modal driver registered. Call setActiveModalDriver() before '
      + 'starting the JSON-RPC server. (Tests inject StubModalDriver.)',
    );
  }
  return activeDriver;
}

/** Reset for tests. */
export function clearActiveModalDriver(): void {
  activeDriver = null;
}
