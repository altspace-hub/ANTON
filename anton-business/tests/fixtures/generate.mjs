/**
 * generate.mjs — emit cross-language parity fixtures.
 *
 * Run from anton-business/ via:
 *   node tests/fixtures/generate.mjs
 *
 * Writes:
 *   tests/fixtures/reference.json
 *   tests/fixtures/delegation.json
 *
 * The TS SDK (in packages/futurechain-sdk/) is the canonical
 * implementation; the Rust merchant-backend consumes these fixtures
 * and asserts byte-for-byte agreement.
 *
 * Deterministic by design — all randomness is sourced from fixed
 * inputs so re-running the generator produces identical output. CI
 * compares the committed fixture file against a freshly-generated one
 * to catch accidental drift.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Load the SDK via relative path. We don't go through pnpm workspace
// resolution because this script may run in environments without a
// fresh install. Windows paths must go through pathToFileURL for
// dynamic import to accept them.
const here = dirname(fileURLToPath(import.meta.url));
const sdkSrc = resolve(here, '..', '..', 'packages', 'futurechain-sdk', 'src');

const reference = await import(pathToFileURL(resolve(sdkSrc, 'reference', 'index.ts')).href);
const delegation = await import(pathToFileURL(resolve(sdkSrc, 'delegation', 'index.ts')).href);
const wallet = await import(pathToFileURL(resolve(sdkSrc, 'wallet', 'index.ts')).href);
const { secp256k1 } = await import('@noble/curves/secp256k1');

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

// ── Delegation fixtures ─────────────────────────────────────────────
//
// Deterministic test wallet: private key = 0x01 0x02 ... 0x20.
// This is the same key the TS test suite uses, so RFC-6979 signatures
// are exactly reproducible.

const TEST_PRIV = new Uint8Array(32);
for (let i = 0; i < 32; i++) TEST_PRIV[i] = i + 1;
const TEST_PUB_UNCOMPRESSED = secp256k1.getPublicKey(TEST_PRIV, false);
const TEST_ADDR = wallet.addressFromPublicKey(TEST_PUB_UNCOMPRESSED);

function hex(b) {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

const delegationPayloads = [
  {
    name: 'baseline',
    payload: {
      merchantId: 'KTH00001',
      walletAddress: TEST_ADDR,
      safelloReceivingAddress: 'fc_safello00000000000000000000000000000000aa',
      maxPerDayMicroFtc: 1000000000n,
      validUntil: 1893456000,
      nonce: '550e8400-e29b-41d4-a716-446655440000',
    },
  },
  {
    name: 'zero-cap-revocation',
    payload: {
      merchantId: 'KTH00001',
      walletAddress: TEST_ADDR,
      safelloReceivingAddress: 'fc_safello00000000000000000000000000000000aa',
      maxPerDayMicroFtc: 0n,
      validUntil: 1893456001,
      nonce: '660e8400-e29b-41d4-a716-446655440001',
    },
  },
  {
    name: 'large-cap',
    payload: {
      merchantId: 'STU99999',
      walletAddress: TEST_ADDR,
      safelloReceivingAddress: 'fc_safello11111111111111111111111111111111bb',
      maxPerDayMicroFtc: 999999999999999999n,
      validUntil: 2147483647,
      nonce: '770e8400-e29b-41d4-a716-446655440002',
    },
  },
];

const delegationFixtures = {
  schemaNote: 'Each case: build hash input → SHA-256 → sign → assert hex bytes match. recoverSigner should return testAddress.',
  testPrivateKeyHex: hex(TEST_PRIV),
  testAddress: TEST_ADDR,
  cases: delegationPayloads.map(({ name, payload }) => {
    const hashInput = delegation.buildHashInput(payload);
    const env = delegation.sign(payload, TEST_PRIV);
    // Serialise payload with bigint → decimal string so the JSON is portable.
    const payloadJson = JSON.parse(JSON.stringify(payload, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v));
    return {
      name,
      payload: payloadJson,
      hashInputHex: hex(hashInput),
      signature: env.signature,
    };
  }),
};

// ── Write files ─────────────────────────────────────────────────────

// BigInt → decimal string for JSON portability. The Rust side parses
// these strings back into u128 / similar.
const bigIntReplacer = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);

writeFileSync(
  resolve(here, 'reference.json'),
  JSON.stringify(referenceFixtures, bigIntReplacer, 2) + '\n',
);
writeFileSync(
  resolve(here, 'delegation.json'),
  JSON.stringify(delegationFixtures, bigIntReplacer, 2) + '\n',
);

console.log(`reference.json: ${referenceFixtures.encodeV1.length} encode + ${referenceFixtures.decode.length} decode cases`);
console.log(`delegation.json: ${delegationFixtures.cases.length} cases (priv=${hex(TEST_PRIV).slice(0, 16)}…, addr=${TEST_ADDR})`);
