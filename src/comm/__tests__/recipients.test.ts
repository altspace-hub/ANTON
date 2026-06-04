/**
 * recipients.test.ts — #93 Send-to-person derivation (ported from Pay's
 * recipients.test.ts). Fixtures build Comm WalletTx rows; the merchantId lane
 * is dropped (Comm WalletTx has none) so name precedence is contact label →
 * creditor name → abbreviation. Adds an anti-poisoning case: kind!=='send'
 * (received) rows are NEVER mined for recipients.
 */
import { describe, it, expect } from 'vitest';
import { computeRecipientSections } from '../services/recipients';
import type { WalletTx } from '../services/transactions';
import type { Contact } from '../services/address-book';

const A = 'fc_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const B = 'fc_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const C = 'fc_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

/** Minimal SENT WalletTx — only the fields computeRecipientSections reads. */
function pay(
  to: string,
  paidAt: number,
  over: { name?: string; country?: string } = {},
): WalletTx {
  return {
    kind: 'send',
    counterparty: to,
    ts: paidAt,
    amountMicroFtc: '0',
    pacs008: over.name || over.country
      ? { creditor: { address: to, name: over.name ?? '', country: over.country ?? '' } }
      : undefined,
  } as unknown as WalletTx;
}

/** A received (inbound) row — must NEVER surface as a recipient. */
function recv(from: string, ts: number): WalletTx {
  return { kind: 'receive', counterparty: from, ts, amountMicroFtc: '0' } as unknown as WalletTx;
}

function contact(address: string, label: string, starred = false): Contact {
  return { id: `c-${address.slice(3, 7)}`, label, address, addedAt: 1, starred };
}

describe('computeRecipientSections', () => {
  it('aggregates send count + last-sent per address', () => {
    const { all } = computeRecipientSections(
      [pay(A, 100), pay(A, 300), pay(A, 200), pay(B, 50)], [],
    );
    const a = all.find((r) => r.address === A)!;
    const b = all.find((r) => r.address === B)!;
    expect(a.sendCount).toBe(3);
    expect(a.lastSentAt).toBe(300);
    expect(b.sendCount).toBe(1);
  });

  it('lets the most recent payment set the name + country', () => {
    const { all } = computeRecipientSections(
      [
        pay(A, 100, { name: 'Old Name', country: 'NO' }),
        pay(A, 300, { name: 'Anna', country: 'SE' }),
        pay(A, 200, { name: 'Mid', country: 'DK' }),
      ], [],
    );
    const a = all.find((r) => r.address === A)!;
    expect(a.name).toBe('Anna');
    expect(a.country).toBe('SE');
  });

  it('splits frequent (>=2 sends) from recent (single send)', () => {
    const { frequent, recent } = computeRecipientSections(
      [pay(A, 10), pay(A, 20), pay(B, 30)], [],
    );
    expect(frequent.map((r) => r.address)).toEqual([A]);
    expect(recent.map((r) => r.address)).toEqual([B]);
  });

  it('NEVER mines received (kind!==send) rows for recipients — anti-poisoning', () => {
    const { all } = computeRecipientSections(
      [recv(C, 500), recv(C, 600), pay(A, 10)], [],
    );
    expect(all.some((r) => r.address === C)).toBe(false);
    expect(all.map((r) => r.address)).toEqual([A]);
  });

  it('starred contacts go to the starred section and are removed from frequent/recent', () => {
    const { starred, frequent, recent } = computeRecipientSections(
      [pay(A, 10), pay(A, 20), pay(B, 30)],
      [contact(A, 'Anna', true)],
    );
    expect(starred.map((r) => r.address)).toEqual([A]);
    expect(frequent.some((r) => r.address === A)).toBe(false);
    expect(recent.some((r) => r.address === A)).toBe(false);
    expect(starred[0]!.isFriend).toBe(true);
    expect(starred[0]!.contactId).toBe('c-AAAA');
  });

  it('a saved friend never paid appears only in friends', () => {
    const { friends, frequent, recent, starred } = computeRecipientSections(
      [], [contact(C, 'Carol')],
    );
    expect(friends.map((r) => r.address)).toEqual([C]);
    expect([...frequent, ...recent, ...starred]).toHaveLength(0);
    expect(friends[0]!.sendCount).toBe(0);
    expect(friends[0]!.lastSentAt).toBe(0);
  });

  it('de-dups: a starred + frequent person shows only in starred', () => {
    const { starred, frequent } = computeRecipientSections(
      [pay(A, 10), pay(A, 20)],
      [contact(A, 'Anna', true)],
    );
    expect(starred.map((r) => r.address)).toEqual([A]);
    expect(frequent).toHaveLength(0);
  });

  it('name precedence: contact label > creditor name > abbreviation', () => {
    const labelled = computeRecipientSections([pay(A, 1, { name: 'Cred' })], [contact(A, 'Friend')]);
    expect(labelled.all[0]!.name).toBe('Friend');

    const credName = computeRecipientSections([pay(A, 1, { name: 'Cred' })], []);
    expect(credName.all[0]!.name).toBe('Cred');

    const bare = computeRecipientSections([pay(A, 1)], []); // no creditor name
    expect(bare.all[0]!.name).toContain('…'); // abbreviated address
  });

  it('respects the frequentThreshold + sectionLimit options', () => {
    const payments = [pay(A, 10), pay(A, 20), pay(A, 30), pay(B, 40), pay(B, 50)];
    const { frequent } = computeRecipientSections(payments, [], { frequentThreshold: 3 });
    // Only A has >=3 sends; B (2 sends) drops to recent.
    expect(frequent.map((r) => r.address)).toEqual([A]);

    const capped = computeRecipientSections(
      [pay(A, 1), pay(B, 2), pay(C, 3)], [], { sectionLimit: 2 },
    );
    expect(capped.recent.length).toBe(2);
  });

  it('all is the full union sorted by name', () => {
    const { all } = computeRecipientSections(
      [pay(A, 1, { name: 'Zoe' })],
      [contact(B, 'Anna'), contact(C, 'Mia')],
    );
    expect(all.map((r) => r.name)).toEqual(['Anna', 'Mia', 'Zoe']);
  });

  it('a real creditor name is not clobbered by a later name-less send', () => {
    // A newer send carrying no creditor name must not overwrite an earlier
    // human creditor name for the same address (name: credName ?? prev?.name).
    const { all } = computeRecipientSections(
      [pay(A, 100, { name: 'Anna' }), pay(A, 200)], [],
    );
    expect(all.find((r) => r.address === A)!.name).toBe('Anna');
  });

  it('flags nameIsReal=false only when the name is the abbreviated address', () => {
    // An abbreviated-address fallback must be flagged so it is never seeded as
    // the editable PACS.008 creditor name.
    expect(computeRecipientSections([pay(A, 1, { name: 'Anna' })], []).all[0]!.nameIsReal).toBe(true);
    expect(computeRecipientSections([], [contact(B, 'Bob')]).all[0]!.nameIsReal).toBe(true);
    const bare = computeRecipientSections([pay(A, 1)], []);
    expect(bare.all[0]!.nameIsReal).toBe(false);
    expect(bare.all[0]!.name).toContain('…');
  });

  it('keeps a single send in Recent even when ts is 0/missing', () => {
    // recent is keyed on sendCount, not lastSentAt, so a paid recipient with a
    // 0 timestamp still shows (it doesn't vanish).
    const { recent } = computeRecipientSections([pay(A, 0)], []);
    expect(recent.map((r) => r.address)).toEqual([A]);
  });
});
