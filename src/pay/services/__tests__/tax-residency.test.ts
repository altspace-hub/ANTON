/**
 * tax-residency.test.ts — round-trip, re-verify window, and the pure
 * ISO-debtor-country seeding rule.
 *
 * Runs against the in-memory secure-store fallback (vitest has no
 * Capacitor + no IndexedDB) — same envelope logic as every tier.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { removeSecure, setSecure } from '../secure-store';
import {
  REVERIFY_AFTER_DAYS, clearResidency, loadResidency, needsResidencyPrompt,
  saveResidency, seedIdentityCountry,
} from '../tax-residency';
import { emptyPayerIdentity, type PayerIdentity } from '../payment-identity';

const KEY = 'fc.tax.residency';
const YEAR_MS = REVERIFY_AFTER_DAYS * 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await removeSecure(KEY);
});

describe('saveResidency / loadResidency', () => {
  it('round-trips, upper-cases the code, and sets a 365-day re-verify window', async () => {
    const before = Date.now();
    const saved = await saveResidency('se', 'Sweden');
    const after = Date.now();

    expect(saved.jurisdictionCode).toBe('SE');
    expect(saved.jurisdictionName).toBe('Sweden');
    expect(saved.declaredAt).toBeGreaterThanOrEqual(before);
    expect(saved.declaredAt).toBeLessThanOrEqual(after);
    expect(saved.reverifyAt - saved.declaredAt).toBe(YEAR_MS);

    const loaded = await loadResidency();
    expect(loaded).toEqual(saved);
  });

  it('loadResidency returns null when nothing is stored', async () => {
    expect(await loadResidency()).toBeNull();
  });

  it('clearResidency removes the declaration', async () => {
    await saveResidency('de', 'Germany');
    expect(await loadResidency()).not.toBeNull();
    await clearResidency();
    expect(await loadResidency()).toBeNull();
  });
});

describe('needsResidencyPrompt', () => {
  it('is true when nothing is declared', async () => {
    expect(await needsResidencyPrompt()).toBe(true);
  });

  it('is false immediately after a fresh declaration', async () => {
    await saveResidency('fr', 'France');
    expect(await needsResidencyPrompt()).toBe(false);
  });

  it('is true once the annual re-verify window has elapsed', async () => {
    const now = Date.now();
    // Simulate a declaration whose reverify date is already in the past.
    await setSecure(KEY, JSON.stringify({
      jurisdictionCode: 'GB',
      jurisdictionName: 'United Kingdom',
      declaredAt: now - YEAR_MS - 1000,
      reverifyAt: now - 1000,
    }));
    expect(await needsResidencyPrompt()).toBe(true);
  });
});

describe('seedIdentityCountry (seed-once ISO debtor country)', () => {
  const addr = { city: 'Stockholm', street: 'Drottninggatan 1', postcode: '111 51' };

  it('seeds country onto a null identity (defaults aside)', () => {
    const out = seedIdentityCountry(null, 'de');
    expect(out.country).toBe('DE');
    // a null identity starts from emptyPayerIdentity() — no name/address
    expect(out.name).toBe('');
  });

  it("overwrites the hardcoded 'SE' default", () => {
    const existing: PayerIdentity = { name: 'Anна', country: 'SE', ...addr };
    const out = seedIdentityCountry(existing, 'no');
    expect(out.country).toBe('NO');
    // address + name preserved
    expect(out).toMatchObject({ name: 'Anна', ...addr });
  });

  it('leaves a deliberately-set non-SE country untouched', () => {
    const existing: PayerIdentity = { name: 'Jan', country: 'DK', ...addr };
    const out = seedIdentityCountry(existing, 'fr');
    expect(out.country).toBe('DK'); // unchanged
    expect(out).toEqual(existing);
  });

  it('upper-cases the seeded code and never mutates the input', () => {
    const existing = emptyPayerIdentity(); // country 'SE'
    const out = seedIdentityCountry(existing, 'gb');
    expect(out.country).toBe('GB');
    expect(existing.country).toBe('SE'); // input not mutated
  });

  it('seeds when the existing country is empty', () => {
    const existing: PayerIdentity = { name: '', country: '', ...addr };
    const out = seedIdentityCountry(existing, 'it');
    expect(out.country).toBe('IT');
    expect(out).toMatchObject(addr);
  });
});
