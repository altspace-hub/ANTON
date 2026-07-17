/**
 * @futurechain/sdk — public surface.
 *
 * Each sub-module is exported as a namespace so consumers can write
 *   import { wallet, pacs008, reference, rpc } from '@futurechain/sdk';
 *
 * Implementation status is in each sub-module's index.ts. Anything that
 * throws NotImplementedError is blocked on the FutureChain Rust core
 * being vendored into docs/futurechain/ (see CLAUDE_ANTON_BUSINESS.md
 * §References).
 *
 * The `delegation` module was removed in the 2026-05-14 architecture
 * roll-back — see anton-business/_archive/README.md.
 */

export * as wallet from './wallet/index.js';
export * as pacs008 from './pacs008/index.js';
export * as rpc from './rpc/index.js';
export * as reference from './reference/index.js';
export * as tax from './tax/index.js';
export * as fraud from './fraud/index.js';
export * as travelRule from './travel-rule/index.js';

/** Thrown by stub functions that depend on the FutureChain Rust core
 *  being vendored. The message always names the blocking artifact so
 *  the failure mode is self-diagnosing. */
export class NotImplementedError extends Error {
  constructor(message: string, public readonly blockedBy?: string) {
    super(blockedBy ? `${message} (blocked by ${blockedBy})` : message);
    this.name = 'NotImplementedError';
  }
}
