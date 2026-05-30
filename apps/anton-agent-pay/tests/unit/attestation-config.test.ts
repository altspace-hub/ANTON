import { describe, it, expect } from 'vitest';
import { attestationChainConfig } from '../../src/main/attestation-config.js';
import type { StorageBackend } from '../../src/main/wallet/storage.js';

const fakeStorage = {} as unknown as StorageBackend;

describe('attestationChainConfig (wires desktop attestation into submit)', () => {
  it('returns undefined with no AGENT_PAY_API_KEY (local / unattested submit)', () => {
    expect(attestationChainConfig(fakeStorage, {})).toBeUndefined();
  });

  it('attaches endpoint + apiKey + an attestationProvider when the bearer is set', () => {
    const cfg = attestationChainConfig(fakeStorage, {
      AGENT_PAY_API_KEY: 'bearer_x',
      AGENT_PAY_NODE_URL: 'https://node.test',
    });
    expect(cfg).toBeDefined();
    expect(cfg!.endpoint).toBe('https://node.test');
    expect(cfg!.apiKey).toBe('bearer_x');
    expect(typeof cfg!.attestationProvider).toBe('function');
  });

  it('defaults the endpoint when AGENT_PAY_NODE_URL is unset', () => {
    const cfg = attestationChainConfig(fakeStorage, { AGENT_PAY_API_KEY: 'bearer_x' });
    expect(cfg!.endpoint).toBe('https://rpc.futurechain.eu');
  });
});
