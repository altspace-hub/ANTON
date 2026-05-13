/**
 * @futurechain/sdk — public surface.
 *
 * Each sub-module is exported as a namespace so consumers can write
 *   import { wallet, pacs008, reference, rpc, delegation } from '@futurechain/sdk';
 *
 * Implementation status is in each sub-module's index.ts. Anything that
 * throws NotImplementedError is blocked on an open ADR — see
 * docs/adr/ in the monorepo root.
 */

export * as wallet from './wallet/index.js';
export * as pacs008 from './pacs008/index.js';
export * as rpc from './rpc/index.js';
export * as reference from './reference/index.js';
export * as delegation from './delegation/index.js';

/** Thrown by stub functions that depend on an unclosed ADR. The message
 *  always names the blocking ADR so the failure mode is self-diagnosing. */
export class NotImplementedError extends Error {
  constructor(message: string, public readonly blockedBy?: string) {
    super(blockedBy ? `${message} (blocked by ${blockedBy})` : message);
    this.name = 'NotImplementedError';
  }
}
