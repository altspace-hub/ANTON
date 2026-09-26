/**
 * sensitive-input-check.test.ts — the public demo's pre-send check (privacy
 * review H3): a Swedish personnummer with a valid check digit, email
 * addresses and phone numbers are found; ordinary numbers in professional
 * text (dates, articles, amounts, organisation numbers) are not.
 */
import { describe, it, expect } from 'vitest';
import {
  findSensitiveInput,
  textsOfInputs,
  describeSensitiveKinds,
} from '../../src/lib/sensitive-input-check';

const kinds = (text: string) => findSensitiveInput([text]).map((f) => `${f.kind}:${f.match}`);

describe('personnummer', () => {
  it('finds a personnummer with a valid check digit, in each common form', () => {
    expect(kinds('Kunden 811228-9874 ringde')).toEqual(['personnummer:811228-9874']);
    expect(kinds('pnr 19811228-9874')).toEqual(['personnummer:19811228-9874']);
    expect(kinds('pnr 198112289874')).toEqual(['personnummer:198112289874']);
    expect(kinds('pnr 8112289874')).toEqual(['personnummer:8112289874']);
    expect(kinds('the test person 121212-1212')).toEqual(['personnummer:121212-1212']);
    // Over 100 years old: the '+' separator.
    expect(kinds('born 121212+1212')).toEqual(['personnummer:121212+1212']);
    // A samordningsnummer: the day plus 60.
    expect(kinds('samordningsnummer 701063-2391')).toEqual(['personnummer:701063-2391']);
  });

  it('ignores the same shape with a wrong check digit, an impossible date, or an organisation number', () => {
    expect(kinds('811228-9875')).toEqual([]);   // check digit off by one
    expect(kinds('811328-9874')).toEqual([]);   // month 13
    expect(kinds('811200-9874')).toEqual([]);   // day 00
    expect(kinds('Org.nr 556036-0793')).toEqual([]); // "month" 60: an organisation number
    expect(kinds('ref 18112289874123')).toEqual([]); // part of a longer number
  });
});

describe('email', () => {
  it('finds an email address', () => {
    expect(kinds('write to anna.svensson@firma.se today')).toEqual(['email:anna.svensson@firma.se']);
    expect(kinds('cc: j_doe+demo@mail.co.uk')).toEqual(['email:j_doe+demo@mail.co.uk']);
  });

  it('ignores the domains reserved for examples', () => {
    expect(kinds('jane@example.com, bob@sub.example.org, x@shop.test, y@host.invalid, z@acme.example')).toEqual([]);
  });
});

describe('phone', () => {
  it('finds Swedish and international phone numbers', () => {
    expect(kinds('call 070-123 45 67')).toEqual(['phone:070-123 45 67']);
    expect(kinds('office 08-123 456 78.')).toEqual(['phone:08-123 456 78']);
    expect(kinds('mobile +46 70 123 45 67')).toEqual(['phone:+46 70 123 45 67']);
    expect(kinds('from abroad 0046 70 123 45 67')).toEqual(['phone:0046 70 123 45 67']);
    expect(kinds('US office +1 (555) 123-4567')).toEqual(['phone:+1 (555) 123-4567']);
    expect(kinds('call 0701234560')).toEqual(['phone:0701234560']);
  });

  it('finds a phone number that runs on from another number', () => {
    expect(kinds('room 12 070-123 45 67')).toEqual(['phone:070-123 45 67']);
  });

  it('ignores the numbers of ordinary professional text', () => {
    const text = [
      'Regulation (EU) 2024/1624, Article 10(1) and ISO 27001.',
      'Due 2026-09-26 or 01-02-2026; fee EUR 1 000 000; ratio 0.5; 12 500 kr.',
      'CELEX 32024R1624, version 2.0.1, 3-5 days, +15% growth, 1990-2000.',
    ].join(' ');
    expect(kinds(text)).toEqual([]);
  });
});

describe('several texts and kinds', () => {
  it('reports each distinct match once, across the prompt and the module inputs', () => {
    const found = findSensitiveInput([
      'Customer 811228-9874, anna@firma.se',
      'again anna@firma.se, phone 070-123 45 67',
    ]);
    expect(found.map((f) => f.kind)).toEqual(['personnummer', 'email', 'phone']);
    expect(describeSensitiveKinds(found)).toBe(
      'a Swedish personal identity number (personnummer), an email address and a phone number',
    );
    expect(describeSensitiveKinds(found.slice(1, 2))).toBe('an email address');
  });

  it('collects the text values of module inputs, nested a few levels', () => {
    expect(textsOfInputs({ a: 'one', b: ['two', { c: 'three' }], d: 4, e: null, f: true })).toEqual(['one', 'two', 'three']);
    expect(textsOfInputs(undefined)).toEqual([]);
  });

  it('finds nothing in made-up text', () => {
    expect(findSensitiveInput(['Draft an AML policy for a mid-sized Swedish payment institution.', ''])).toEqual([]);
  });
});
