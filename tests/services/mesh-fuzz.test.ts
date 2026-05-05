/**
 * mesh-fuzz.test.ts — adversarial fuzz of the main project's mesh parsers.
 *
 * Mirrors relay/tests/fuzz.test.ts for the modules in
 * server/services/mesh/. Catches malformed-input crashes in the RPC codec
 * and the Noise message readers — the parts that handle data the relay
 * cannot vet (everything inside an ENVELOPE is opaque to the relay).
 *
 * If this surfaces a crash that wasn't caught by the unit tests, that's
 * a parser bug — fix it, then add a focused regression test.
 */

import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decodeRpc, RpcParseError } from '../../server/services/mesh/rpc';
import {
  NoiseInitiator,
  NoiseResponder,
  generateX25519Keypair,
  buildPrologue,
} from '../../server/services/mesh/noise';

const N = process.env.RUN_LONG_FUZZ === '1' ? 30_000 : 5_000;

function randomBuf(maxLen = 4096): Uint8Array {
  const len = Math.floor(Math.random() * maxLen);
  return new Uint8Array(randomBytes(len));
}

function isExpectedError(e: unknown): boolean {
  if (e instanceof RpcParseError) return true;
  // Noise readers throw plain Error from @noble's AEAD on tag failure;
  // accept Error subclasses other than TypeError/RangeError (those would
  // indicate a parser bug).
  if (e instanceof TypeError || e instanceof RangeError) return false;
  return e instanceof Error;
}

describe('RPC codec — adversarial fuzz', () => {
  it(`decodeRpc survives ${N} random byte sequences without uncaught throws`, () => {
    for (let i = 0; i < N; i++) {
      const buf = randomBuf(4096);
      try {
        decodeRpc(buf);
      } catch (e) {
        if (!isExpectedError(e)) {
          throw new Error(`unexpected throw: ${(e as Error).message} [${(e as Error).constructor.name}]`);
        }
      }
    }
  });

  it('decodeRpc with each of the 4 frame-kind bytes as prefix', () => {
    // Forces the parser to enter each kind-specific branch with junk after.
    for (const kind of [0x01, 0x02, 0x03, 0x04, 0x05, 0x10, 0x99]) {
      for (let i = 0; i < 1000; i++) {
        const buf = new Uint8Array(1 + (Math.floor(Math.random() * 1024)));
        buf[0] = kind;
        randomBytes(buf.length - 1).copy(Buffer.from(buf.buffer, 1, buf.length - 1));
        try {
          decodeRpc(buf);
        } catch (e) {
          if (!isExpectedError(e)) {
            throw new Error(`unexpected throw on kind=0x${kind.toString(16)}: ${(e as Error).message}`);
          }
        }
      }
    }
  });
});

describe('Noise readers — adversarial fuzz', () => {
  it(`NoiseResponder.readMessage1 survives ${N / 2} random inputs without crashing`, () => {
    const responder = generateX25519Keypair();
    const prologue = buildPrologue('wss://r.test', '00112233445566778899aabbccddeeff');
    let crashed = 0;
    for (let i = 0; i < N / 2; i++) {
      const buf = randomBuf(2048);
      const r = new NoiseResponder({
        staticKeypair: responder,
        prologue,
      });
      try {
        r.readMessage1(buf);
      } catch (e) {
        if (e instanceof TypeError || e instanceof RangeError) {
          crashed++;
        }
        // All other Error types are acceptable — Noise IK msg 1 is supposed
        // to fail loudly on garbage. We just want NO TypeError/RangeError.
      }
    }
    expect(crashed).toBe(0);
  });

  it(`NoiseInitiator.readMessage2 survives ${N / 4} random inputs after a real msg 1`, () => {
    const initiatorStatic = generateX25519Keypair();
    const responderStatic = generateX25519Keypair();
    const prologue = buildPrologue('wss://r.test', '00112233445566778899aabbccddeeff');
    let crashed = 0;
    for (let i = 0; i < N / 4; i++) {
      const init = new NoiseInitiator({
        staticKeypair: initiatorStatic,
        responderStatic: responderStatic.publicKey,
        prologue,
      });
      // Skip writeMessage1 if we don't need to — the test is about message 2.
      // We need to call it because readMessage2 enforces ordering.
      init.writeMessage1();
      const buf = randomBuf(2048);
      try {
        init.readMessage2(buf);
      } catch (e) {
        if (e instanceof TypeError || e instanceof RangeError) {
          crashed++;
        }
      }
    }
    expect(crashed).toBe(0);
  });
});

describe('mesh-validate fuzz — boundary inputs', () => {
  it('validateMeshPackage with malformed hex / mismatched lengths', async () => {
    const { validateMeshPackage, MeshValidationError } = await import('../../src/app/services/mesh-validate');
    const badPkgs = [
      // Each one violates exactly one constraint
      { instance_ed_pk: 'zzz' },                   // bad hex
      { instance_ed_pk: 'abcd' },                   // wrong length
      { instance_x_pk: 'abcd' },
      { binding_sig: 'abcd' },
      { relay_endpoints: [] },                       // empty list
      { relay_endpoints: ['not-a-url'] },
      { transport: 'public_https' as const },        // wrong transport
    ];
    for (const override of badPkgs) {
      const pkg = {
        token: 't', nonce: 'n', instance_pubkey: '', instance_cert_fp: null,
        endpoints: {}, intended_user_id: null, org_id: null, intended_role: null,
        display_name_hint: null, language_hint: null,
        expires_at: new Date().toISOString(), instance_contact_hash: null,
        instance_display_name: null, requires_confirmation_code: false,
        transport: 'mesh' as const,
        relay_endpoints: ['wss://r.test'],
        instance_ed_pk: 'a'.repeat(64),
        instance_x_pk: 'b'.repeat(64),
        binding_sig: 'c'.repeat(128),
        ...override,
      };
      let threw = false;
      try {
        validateMeshPackage(pkg);
      } catch (e) {
        threw = true;
        if (!(e instanceof MeshValidationError)) {
          throw new Error(`unexpected throw type: ${(e as Error).constructor.name}: ${(e as Error).message}`);
        }
      }
      expect(threw).toBe(true);
    }
  });
});
