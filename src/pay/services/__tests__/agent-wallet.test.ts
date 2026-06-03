import { describe, it, expect } from 'vitest';
import { agentDebtorName } from '../wallets';

// #88 — the pseudonymous debtor name an agent wallet presents on the wire.
describe('agentDebtorName', () => {
  it('is "ANTON " + the first 6 Base58 chars after the fc_ prefix', () => {
    expect(agentDebtorName('fc_VQjZM7gjtQF1cUtahiPCLmns31c18yTvyY')).toBe('ANTON VQjZM7');
    expect(agentDebtorName('fc_ABCDEFghij')).toBe('ANTON ABCDEF');
  });

  it('tolerates an address without the fc_ prefix', () => {
    expect(agentDebtorName('VQjZM7gjtQF1')).toBe('ANTON VQjZM7');
  });

  it('handles a short address without throwing', () => {
    expect(agentDebtorName('fc_AB')).toBe('ANTON AB');
  });
});
