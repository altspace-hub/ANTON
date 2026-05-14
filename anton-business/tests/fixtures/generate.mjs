/**
 * generate.mjs — emit cross-language parity fixtures.
 *
 * Run from anton-business/ via:
 *   node tests/fixtures/generate.mjs
 *
 * Writes:
 *   tests/fixtures/reference.json
 *
 * The TS SDK (in packages/futurechain-sdk/) is the canonical
 * implementation. Anyone implementing the reference format in another
 * language consumes this file and asserts byte-for-byte agreement.
 *
 * Deterministic by design — all randomness is sourced from fixed
 * inputs so re-running the generator produces identical output.
 *
 * History note: this file used to also emit delegation fixtures for a
 * Rust merchant-backend that has since been rolled back. See
 * anton-business/_archive/ for the archived code and fixtures.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sdkSrc = resolve(here, '..', '..', 'packages', 'futurechain-sdk', 'src');

const reference = await import(pathToFileURL(resolve(sdkSrc, 'reference', 'index.ts')).href);

// ── Reference fixtures ──────────────────────────────────────────────

const referenceFixtures = {
  schemaNote: 'Each case: encode the `input` and assert the result equals `encoded`. Decode `encoded` and assert it matches `input`.',
  encodeV1: [
    {
      name: 'simple-retail',
      input: { merchantId: 'KTH00001', orderId: 'A1B2C3D4E5F6', purpose: 'RETAIL' },
      encoded: reference.encodeV1({ merchantId: 'KTH00001', orderId: 'A1B2C3D4E5F6', purpose: 'RETAIL' }),
    },
    {
      name: 'restaurant-with-vat',
      input: { merchantId: 'KTH00001', orderId: 'A1B2C3D4E5F7', purpose: 'RESTAURANT', itemCount: 3, vatMicroUnits: 12500000n },
      encoded: reference.encodeV1({ merchantId: 'KTH00001', orderId: 'A1B2C3D4E5F7', purpose: 'RESTAURANT', itemCount: 3, vatMicroUnits: 12500000n }),
    },
    {
      name: 'all-optional-tokens',
      input: { merchantId: 'STU00001', orderId: 'ABCDEFGHIJKL', purpose: 'EVENT', itemCount: 5, vatMicroUnits: 25000000n, discountMicroUnits: 5000000n },
      encoded: reference.encodeV1({ merchantId: 'STU00001', orderId: 'ABCDEFGHIJKL', purpose: 'EVENT', itemCount: 5, vatMicroUnits: 25000000n, discountMicroUnits: 5000000n }),
    },
    {
      name: 'refund',
      input: { merchantId: 'KTH00001', orderId: 'A1B2C3D4E5F8', purpose: 'REFUND', refundOf: '550e8400-e29b-41d4-a716-446655440000' },
      encoded: reference.encodeV1({ merchantId: 'KTH00001', orderId: 'A1B2C3D4E5F8', purpose: 'REFUND', refundOf: '550e8400-e29b-41d4-a716-446655440000' }),
    },
    {
      name: 'edge-zero-vat',
      input: { merchantId: 'AAAAAAAA', orderId: 'BBBBBBBBBBBB', purpose: 'SERVICE', vatMicroUnits: 0n },
      encoded: reference.encodeV1({ merchantId: 'AAAAAAAA', orderId: 'BBBBBBBBBBBB', purpose: 'SERVICE', vatMicroUnits: 0n }),
    },
  ],
  decode: [
    { name: 'v1-retail',           input: 'v1: M:KTH00001 O:A1B2C3D4E5F6 P:RETAIL',        expectedKind: 'v1' },
    { name: 'v2-versioned',        input: 'v2: P:OTHR N:agent-payment G:service',         expectedKind: 'v2' },
    { name: 'v2-with-task',        input: 'v2: P:GDDS N:purchase G:item T:task_abc',      expectedKind: 'v2' },
    { name: 'unversioned-v2',      input: 'P:OTHR N:agent-payment G:service',             expectedKind: 'unversioned-v2' },
    { name: 'free-text',           input: 'Coffee, large, oat milk',                      expectedKind: 'unknown' },
    { name: 'invalid-order',       input: 'v1: O:A1B2C3D4E5F6 M:KTH00001 P:RETAIL',       expectedKind: 'invalid' },
    { name: 'invalid-purpose',     input: 'v1: M:KTH00001 O:A1B2C3D4E5F6 P:UNKNOWN',      expectedKind: 'invalid' },
    { name: 'invalid-refund-tag',  input: 'v1: M:KTH00001 O:A1B2C3D4E5F6 P:RETAIL R:550e8400-e29b-41d4-a716-446655440000', expectedKind: 'invalid' },
  ],
};

const bigIntReplacer = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);

writeFileSync(
  resolve(here, 'reference.json'),
  JSON.stringify(referenceFixtures, bigIntReplacer, 2) + '\n',
);

console.log(`reference.json: ${referenceFixtures.encodeV1.length} encode + ${referenceFixtures.decode.length} decode cases`);
