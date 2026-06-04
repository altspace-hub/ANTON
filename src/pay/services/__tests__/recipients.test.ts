import { describe, it, expect } from 'vitest';
import { computeRecipientSections } from '../recipients';
import type { PaymentRecord } from '../types';
import type { Contact } from '../address-book';

const A = 'fc_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const B = 'fc_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const C = 'fc_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

// Minimal PaymentRecord — only the fields computeRecipientSections reads.
function pay(
  to: string,
  paidAt: number,
  over: { name?: string; country?: string; merchantId?: string } = {},
): PaymentRecord {
  return {
    toAddress: to,
    merchantId: over.merchantId ?? 'MERCH123',
    paidAt,
    pacs008: over.name || over.country
      ? { creditor: { address: to, name: over.name ?? '', country: over.country ?? '' } }
      : undefined,
  } as unknown as PaymentRecord;
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

  it('name precedence: contact label > creditor name > merchant id > abbreviation', () => {
    const labelled = computeRecipientSections([pay(A, 1, { name: 'Cred' })], [contact(A, 'Friend')]);
    expect(labelled.all[0]!.name).toBe('Friend');

    const credName = computeRecipientSections([pay(A, 1, { name: 'Cred' })], []);
    expect(credName.all[0]!.name).toBe('Cred');

    const merch = computeRecipientSections([pay(A, 1, { merchantId: 'SHOP9' })], []);
    expect(merch.all[0]!.name).toBe('SHOP9');

    const bare = computeRecipientSections(
      [pay(A, 1, { merchantId: '' })], [],
    );
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

  it('a real creditor name is not clobbered by a later merchant-only payment', () => {
    // Finding #3: a newer payment carrying only a merchant id must not
    // overwrite an earlier human creditor name for the same address.
    const { all } = computeRecipientSections(
      [pay(A, 100, { name: 'Anna' }), pay(A, 200, { merchantId: 'M' })], [],
    );
    expect(all.find((r) => r.address === A)!.name).toBe('Anna');
  });

  it('flags nameIsReal=false only when the name is the abbreviated address', () => {
    // Finding #5: an abbreviated-address fallback must be flagged so it is
    // never seeded as the editable PACS.008 creditor name.
    expect(computeRecipientSections([pay(A, 1, { name: 'Anna' })], []).all[0]!.nameIsReal).toBe(true);
    expect(computeRecipientSections([pay(A, 1, { merchantId: 'SHOP9' })], []).all[0]!.nameIsReal).toBe(true);
    expect(computeRecipientSections([], [contact(B, 'Bob')]).all[0]!.nameIsReal).toBe(true);
    const bare = computeRecipientSections([pay(A, 1, { merchantId: '' })], []);
    expect(bare.all[0]!.nameIsReal).toBe(false);
    expect(bare.all[0]!.name).toContain('…');
  });

  it('keeps a single send in Recent even when paidAt is 0/missing', () => {
    // Finding #4: recent is keyed on sendCount, not lastSentAt, so a paid
    // recipient with a 0 timestamp still shows (it doesn't vanish).
    const { recent } = computeRecipientSections([pay(A, 0)], []);
    expect(recent.map((r) => r.address)).toEqual([A]);
  });
});
