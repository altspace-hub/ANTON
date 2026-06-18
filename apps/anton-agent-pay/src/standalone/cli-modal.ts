/**
 * cli-modal.ts — TERMINAL confirmation driver for the standalone gateway.
 *
 * The standalone server has no Electron window, so the human-in-the-loop
 * confirmation happens in the OPERATOR'S TERMINAL: every proposed payment prints
 * a clear summary (recipient · amount · fee · resulting balance · which agent
 * asked · the agent's note) and waits for the operator to type `y` to approve.
 * Anything else — a different key, EOF, or the TTL elapsing — REJECTS. There is
 * no auto-approve, no "remember", no allow-list. This is THE safety boundary.
 *
 * Implements the same `ModalDriver` interface the Electron app uses, so it drops
 * straight into buildServer()/buildMcpServer() via setActiveModalDriver().
 *
 * Streams are injectable (default stderr for prompts, stdin for input) so tests
 * drive the full approve/reject/expiry path without a real terminal — and so the
 * prompt never pollutes stdout (which the MCP transport may own).
 *
 * NOTE: when the gateway is launched headless (e.g. forked by Claude Desktop with
 * no controlling terminal), stdin has no operator — every prompt will TTL-reject.
 * That is the safe default; a web-confirm driver (operator approves in a browser)
 * is the planned follow-up for headless launches.
 */
import type { ModalDriver } from '../main/modal.js';
import type { ModalDecision, ModalPayload } from '../shared/ipc-types.js';

export interface CliModalOptions {
  /** Where the confirmation prompt is written. Default: process.stderr. */
  output?: NodeJS.WritableStream;
  /** Where the operator's keystrokes are read. Default: process.stdin. */
  input?: NodeJS.ReadableStream;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export class CliModalDriver implements ModalDriver {
  /** Serialise prompts — never show two payment confirmations at once. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly opts: CliModalOptions = {}) {}

  promptForDecision(payload: ModalPayload): Promise<ModalDecision> {
    const run = this.chain.then(() => this.prompt(payload));
    // Keep the chain alive even if one prompt rejects, so the next still runs.
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async prompt(payload: ModalPayload): Promise<ModalDecision> {
    const out = this.opts.output ?? process.stderr;
    const input = this.opts.input ?? process.stdin;
    const now = this.opts.now ?? Date.now;

    out.write(renderPayload(payload));

    const remaining = payload.expiresAtMs - now();
    if (remaining <= 0) {
      out.write('  ⏱  proposal already expired — REJECTED.\n\n');
      return { kind: 'reject', reason: 'expired' };
    }

    const answer = await readLine(input, remaining);
    if (answer === null) {
      out.write('  ⏱  no response in time — REJECTED.\n\n');
      return { kind: 'reject', reason: 'expired' };
    }
    const a = answer.trim().toLowerCase();
    if (a !== 'y' && a !== 'yes' && a !== 'approve') {
      out.write('  ✗  REJECTED.\n\n');
      return { kind: 'reject', reason: a ? `operator typed "${answer.trim()}"` : 'operator declined' };
    }

    // Passphrase-protected wallet: collect it on a second line (never echoed back).
    if (payload.walletHasPassphrase) {
      out.write('  Wallet passphrase: ');
      const passRemaining = payload.expiresAtMs - now();
      const pass = passRemaining > 0 ? await readLine(input, passRemaining) : null;
      out.write('  ✓  APPROVED.\n\n');
      return pass && pass.trim() ? { kind: 'approve', passphrase: pass.trim() } : { kind: 'approve' };
    }

    out.write('  ✓  APPROVED.\n\n');
    return { kind: 'approve' };
  }
}

/** Render the human-facing confirmation block. */
export function renderPayload(p: ModalPayload): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│  ⚠  PAYMENT APPROVAL REQUIRED — an AI agent wants to send FTC │');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push(`   Agent:        ${p.agentName}  (paired ${p.agentPairedAgo})`);
  if (p.payingAs) lines.push(`   Paying as:    ${p.payingAs}${p.uboName ? `   (you: ${p.uboName})` : ''}`);
  lines.push(`   To:           ${p.to}${p.toLabel ? `  (${p.toLabel}${p.toSeenTimes !== undefined ? `, seen ${p.toSeenTimes}×` : ''})` : ''}`);
  lines.push(`   Amount:       ${p.amountFtc} FTC   (fee ~${p.feeFtc} FTC)`);
  lines.push(`   Balance after: ${p.balanceAfterFtc} FTC`);
  if (p.agentNote) lines.push(`   Agent note:   "${p.agentNote}"  (agent-supplied, not verified)`);
  lines.push('   ─────────────────────────────────────────────────────────────');
  lines.push('   Approve this payment?  type  y  + Enter   (anything else rejects)');
  lines.push('   > ');
  return lines.join('\n');
}

/**
 * Per-stream line reader. We attach ONE persistent `data` listener per stream
 * and buffer complete lines, so multiple sequential readLine() calls on the same
 * stream (e.g. the `y` line then the passphrase line, or two back-to-back
 * prompts) each get the next line cleanly — a single chunk can carry several.
 * Keyed by the stream via a WeakMap so we never double-attach.
 */
interface Waiter { resolve: (line: string | null) => void; settled: boolean; }
interface ReaderState { buffer: string; lines: string[]; ended: boolean; waiters: Waiter[]; }

const readers = new WeakMap<NodeJS.ReadableStream, ReaderState>();

function getReader(stream: NodeJS.ReadableStream): ReaderState {
  const existing = readers.get(stream);
  if (existing) return existing;
  const st: ReaderState = { buffer: '', lines: [], ended: false, waiters: [] };
  readers.set(stream, st);
  stream.on('data', (chunk: Buffer | string) => {
    st.buffer += chunk.toString('utf8');
    let nl: number;
    while ((nl = st.buffer.indexOf('\n')) >= 0) {
      st.lines.push(st.buffer.slice(0, nl).replace(/\r$/, ''));
      st.buffer = st.buffer.slice(nl + 1);
    }
    flushReader(st);
  });
  const onEnd = (): void => { st.ended = true; flushReader(st); };
  stream.once('end', onEnd);
  stream.once('error', onEnd);
  if (typeof (stream as { resume?: () => void }).resume === 'function') (stream as { resume: () => void }).resume();
  return st;
}

function flushReader(st: ReaderState): void {
  // Hand complete lines to the oldest still-pending waiters, FIFO.
  while (st.waiters.length > 0) {
    const w = st.waiters[0];
    if (w.settled) { st.waiters.shift(); continue; }
    if (st.lines.length > 0) {
      st.waiters.shift();
      w.settled = true;
      w.resolve(st.lines.shift() as string);
    } else if (st.ended) {
      st.waiters.shift();
      w.settled = true;
      // A trailing line with no newline still counts once; then null forever.
      if (st.buffer.length > 0) { const b = st.buffer; st.buffer = ''; w.resolve(b.replace(/\r$/, '')); }
      else w.resolve(null);
    } else break;
  }
}

/**
 * Read one line from `stream` (newline-stripped), or `null` if `timeoutMs`
 * elapses / the stream ends first. Buffers across calls (see getReader) so the
 * second read of a multi-line chunk works. Pure stream handling — no readline —
 * so any Readable a test injects works.
 */
export function readLine(stream: NodeJS.ReadableStream, timeoutMs: number): Promise<string | null> {
  const st = getReader(stream);
  return new Promise((resolve) => {
    const w: Waiter = { resolve, settled: false };
    st.waiters.push(w);
    const timer = setTimeout(() => {
      if (w.settled) return;
      w.settled = true;
      resolve(null);
    }, timeoutMs);
    if (typeof (timer as { unref?: () => void }).unref === 'function') (timer as { unref: () => void }).unref();
    // Wrap resolve so the timer is always cleared when we settle via data/end.
    const inner = w.resolve;
    w.resolve = (line: string | null): void => { clearTimeout(timer); inner(line); };
    flushReader(st); // a line may already be buffered (or the stream already ended)
  });
}
