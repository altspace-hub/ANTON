/**
 * rpc/ — FutureChain RPC client.
 *
 * Status: STUB. Real implementation lands in sprint 1 task 2.
 * Existing fc-* services in the parent ANTON repo use a STUB submission
 * mode (STUB_TX_*). Real RPC plumbing lives in the FutureChain Rust
 * repo. Vendor the relevant docs into docs/futurechain/ before
 * implementing.
 */
import { NotImplementedError } from '../index.js';
import type { Pacs008Draft } from '../pacs008/index.js';

export interface RpcConfig {
  /** Base URL of a FutureChain node, e.g. https://rpc.futurechain.org */
  endpoint: string;
  /** Optional bearer token if the node requires authentication. */
  authToken?: string;
  /** Request timeout in ms. Default 10_000 (matches the Heimdall
   *  compliance timeout per spec §8.1). */
  timeoutMs?: number;
}

export type TxStatus = 'accepted' | 'rejected' | 'pending';

export interface SubmitResult {
  status: TxStatus;
  uetr?: string;
  reason?: string;
}

export class RpcClient {
  constructor(private readonly config: RpcConfig) {}

  async submitPacs008Batch(_signed: Array<{ draft: Pacs008Draft; signature: Uint8Array }>): Promise<SubmitResult[]> {
    throw new NotImplementedError('RpcClient.submitPacs008Batch()');
  }

  async getBalance(_address: string): Promise<bigint> {
    throw new NotImplementedError('RpcClient.getBalance()');
  }

  async getTransaction(_uetr: string): Promise<unknown> {
    throw new NotImplementedError('RpcClient.getTransaction()');
  }

  async getTransactions(_address: string, _opts?: { limit?: number; offset?: number }): Promise<unknown[]> {
    throw new NotImplementedError('RpcClient.getTransactions()');
  }
}
