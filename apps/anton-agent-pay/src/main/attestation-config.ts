/**
 * attestation-config.ts — build the ChainConfig for an Agent Pay submit.
 *
 * When a Bahnhof bearer (AGENT_PAY_API_KEY) is configured, attach a desktop
 * device-attestation provider so the submit's POST to /submit_signed_transaction
 * carries an X-Attestation-Token. Local dev nodes (no apiKey) get `undefined` →
 * an unattested submit, which chain.ts explicitly supports.
 *
 * Pure (env + storage in, ChainConfig out) so it is unit-testable without the
 * Electron runtime — the attestation primitive itself is already tested in
 * tests/unit/attestation.test.ts and the fetch-wrap in tests/unit/chain.test.ts;
 * this is the previously-missing handoff between them.
 */
import type { ChainConfig } from './chain.js';
import type { StorageBackend } from './wallet/storage.js';
import { attestForChainCall } from './attestation/index.js';

const DEFAULT_NODE_URL = 'https://rpc.futurechain.eu';

export function attestationChainConfig(
  storage: StorageBackend,
  env: { AGENT_PAY_API_KEY?: string; AGENT_PAY_NODE_URL?: string } = process.env,
): ChainConfig | undefined {
  const apiKey = env.AGENT_PAY_API_KEY ?? '';
  const endpoint = env.AGENT_PAY_NODE_URL ?? DEFAULT_NODE_URL;
  if (!apiKey) return undefined; // local dev / unattested submit
  return {
    endpoint,
    apiKey,
    attestationProvider: async () =>
      (await attestForChainCall({ storage, endpoint, apiKey })).sessionToken,
  };
}
